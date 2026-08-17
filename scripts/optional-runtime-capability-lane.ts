import { spawn } from 'node:child_process'
import { access, constants, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { delimiter, dirname, isAbsolute, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

import {
  AllowlistedProcessBoundary,
  finalizeOptionalRuntimeCapabilityReport,
  runOptionalRuntimeCapabilityLane,
  type DshSubprocessHandle,
  type DshSubprocessRuntime,
  type DshSubprocessSpawnSpec,
  type OptionalRuntimeCapabilityReport,
} from '../packages/notemd-process/src/index.js'

const forkLockUrl = new URL('../fixtures/migration/slides/fork-runtime-lock.json', import.meta.url)
const defaultReportPath = new URL('../artifacts/optional-runtime/capability-report.json', import.meta.url)

interface ForkRuntimeLock {
  readonly schemaVersion: 1
  readonly origin: string
  readonly revision: string
  readonly packageName: string
  readonly command: string
}

class NodeSubprocessRuntime implements DshSubprocessRuntime {
  async resolveExecutable(
    command: string,
    env: Readonly<Record<string, string>> = process.env as Record<string, string>,
    signal?: AbortSignal,
  ): Promise<string> {
    signal?.throwIfAborted()
    const pathValue = Object.entries(env).find(([key]) => key.toUpperCase() === 'PATH')?.[1]
      ?? Object.entries(process.env).find(([key]) => key.toUpperCase() === 'PATH')?.[1]
      ?? ''
    const directories = pathValue.split(delimiter).filter((directory) => directory.length > 0)
    const suffixes = process.platform === 'win32' ? ['', '.exe', '.cmd', '.bat'] : ['']
    for (const directory of directories) {
      for (const suffix of suffixes) {
        const candidate = isAbsolute(command) ? command : join(directory, `${command}${suffix}`)
        try {
          const entry = await lstat(candidate)
          if (!entry.isFile()) {
            continue
          }
          if (process.platform !== 'win32') {
            await access(candidate, constants.X_OK)
          }
          return await realpath(candidate)
        } catch {
          // Continue searching PATH; the process boundary will classify absence.
        }
      }
    }
    throw new Error(`Executable ${command} was not found on PATH.`)
  }

  spawn(spec: DshSubprocessSpawnSpec): DshSubprocessHandle {
    const executable = spec.argv[0]
    if (executable === undefined) {
      throw new Error('A subprocess argv must contain an executable.')
    }
    const child = spawn(executable, spec.argv.slice(1), {
      cwd: spec.cwd,
      env: spec.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      shell: false,
    })
    let settled = false
    let resolveDone: (value: { readonly exitCode: number | null; readonly signal: NodeJS.Signals | null }) => void = () => undefined
    const done = new Promise<{ readonly exitCode: number | null; readonly signal: NodeJS.Signals | null }>((resolve) => {
      resolveDone = resolve
    })
    const settle = (exitCode: number | null, signal: NodeJS.Signals | null): void => {
      if (settled) {
        return
      }
      settled = true
      resolveDone({ exitCode, signal })
    }
    const terminate = (): void => {
      if (!child.killed && child.exitCode === null) {
        child.kill('SIGTERM')
      }
    }
    const guardOutput = (stream: NodeJS.ReadableStream | null, maxBytes: number): void => {
      if (stream === null) {
        return
      }
      let observedBytes = 0
      stream.on('data', (chunk: Buffer | string) => {
        observedBytes += Buffer.byteLength(chunk)
        if (observedBytes > maxBytes) {
          terminate()
        }
      })
      stream.resume()
    }
    guardOutput(child.stdout, spec.stdio.stdout.maxBytes)
    guardOutput(child.stderr, spec.stdio.stderr.maxBytes)
    child.once('error', () => settle(null, null))
    child.once('exit', (exitCode, signal) => settle(exitCode, signal))
    const onAbort = (): void => terminate()
    spec.signal.addEventListener('abort', onAbort, { once: true })
    void done.finally(() => spec.signal.removeEventListener('abort', onAbort))
    return {
      done,
      terminate,
      waitForExit: async (signal?: AbortSignal): Promise<boolean> => {
        if (signal?.aborted) {
          terminate()
        }
        await done
        return true
      },
    }
  }
}

async function main(): Promise<void> {
  const lock = await readJson<ForkRuntimeLock>(forkLockUrl)
  const forkVerified = await verifyForkRuntime(lock)
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'notemd-optional-runtime-'))
  const boundary = new AllowlistedProcessBoundary(new NodeSubprocessRuntime(), workspaceRoot)
  let report: OptionalRuntimeCapabilityReport | undefined
  try {
    report = await runOptionalRuntimeCapabilityLane(boundary, fixture(), { slidevForkVerified: forkVerified })
    await boundary.dispose()
    report = finalizeOptionalRuntimeCapabilityReport(report, await isProcessStagingClean(workspaceRoot))
    const reportPath = process.env.NOTEMD_CAPABILITY_REPORT_PATH ?? fileURLToPath(defaultReportPath)
    await mkdir(dirname(reportPath), { recursive: true })
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify({
      reportPath,
      fixtureSha256: report.fixtureSha256,
      slidevForkVerified: report.slidevFork.verified,
      stagingClean: report.staging.clean,
      observations: report.observations,
    }, null, 2))
    if (process.env.NOTEMD_CAPABILITY_LANE_REQUIRE_NATIVE === '1') {
      const unavailable = report.observations.filter((observation) => observation.id !== 'cancellation-probe' && observation.status !== 'ready')
      if (unavailable.length > 0 || !report.staging.clean || !report.slidevFork.verified) {
        throw new Error(`Required optional runtime capabilities are not ready: ${unavailable.map((observation) => `${observation.id}:${observation.code ?? observation.status}`).join(', ')}`)
      }
    }
  } finally {
    await boundary.dispose()
    await rm(workspaceRoot, { recursive: true, force: true })
  }
}

function fixture() {
  return {
    slidevSource: '---\ntheme: default\nfonts:\n  provider: none\n---\n# NoteMD capability lane\n\nDeterministic export fixture.\n',
    drawioSource: '<mxfile host="notemd"><diagram id="capability-lane"><mxGraphModel><root><mxCell id="0" /><mxCell id="1" parent="0" /></root></mxGraphModel></diagram></mxfile>',
    drawnixSource: JSON.stringify({ version: 1, type: 'drawnix', elements: [{ id: 'capability-lane', type: 'rectangle', x: 0, y: 0, width: 160, height: 80 }] }),
    circuitikzSource: '\\documentclass{standalone}\n\\usepackage{circuitikz}\n\\begin{document}\n\\begin{circuitikz}\\draw (0,0) to[R,l=$R$] (2,0);\\end{circuitikz}\n\\end{document}\n',
    pdfBytes: minimalPdf(),
    slidevPngOptions: { withClicks: false, imageScale: 1 },
    slidevMp4Options: { withClicks: false, imageScale: 1, fps: 1, crf: 23 },
  }
}

function minimalPdf(): Uint8Array {
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 320 180] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n',
    '4 0 obj\n',
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ]
  const stream = 'BT /F1 18 Tf 20 100 Td (NoteMD capability lane) Tj ET\n'
  const streamObject = `<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}endstream\nendobj\n`
  objects[3] = `4 0 obj\n${streamObject}`
  let content = '%PDF-1.4\n'
  const offsets = [0]
  for (const object of objects) {
    offsets.push(Buffer.byteLength(content, 'ascii'))
    content += object
  }
  const xrefOffset = Buffer.byteLength(content, 'ascii')
  content += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  content += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  content += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(content, 'ascii')
}

async function verifyForkRuntime(lock: ForkRuntimeLock): Promise<boolean> {
  const manifestPath = process.env.NOTEMD_SLIDEV_FORK_MANIFEST
  if (manifestPath === undefined) {
    return false
  }
  try {
    const manifest = await readJson<Partial<ForkRuntimeLock>>(manifestPath)
    return manifest.origin === lock.origin
      && manifest.revision === lock.revision
      && manifest.packageName === lock.packageName
      && manifest.command === lock.command
  } catch {
    return false
  }
}

async function isProcessStagingClean(workspaceRoot: string): Promise<boolean> {
  const stagingRoot = join(workspaceRoot, '.notemd', 'staging', 'process')
  try {
    return (await readdir(stagingRoot)).length === 0
  } catch (error) {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
  }
}

async function readJson<T>(urlOrPath: URL | string): Promise<T> {
  return JSON.parse(await readFile(urlOrPath, 'utf8')) as T
}

await main()
