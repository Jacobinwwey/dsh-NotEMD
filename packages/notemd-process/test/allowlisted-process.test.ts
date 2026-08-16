import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  AllowlistedProcessBoundary,
  type DshSubprocessHandle,
  type DshSubprocessRuntime,
  type DshSubprocessSpawnSpec,
} from '../src/index.js'

let workspaceRoot = ''

beforeEach(async () => {
  workspaceRoot = await mkdtemp(join(tmpdir(), 'notemd-allowlisted-process-'))
})

afterEach(async () => {
  vi.useRealTimers()
  await rm(workspaceRoot, { recursive: true, force: true })
})

describe('AllowlistedProcessBoundary', () => {
  test('resolves the fixed Draw.io executable, uses an exact argv, and cleans its staging directory', async () => {
    const runtime = new FakeSubprocessRuntime(async (spec) => {
      await writeFile(join(spec.cwd, 'output.svg'), validSvg('drawio'))
      return { exitCode: 0, signal: null }
    })
    const boundary = new AllowlistedProcessBoundary(runtime, workspaceRoot)

    const execution = await boundary.renderDrawioSvg('<mxfile />')

    expect(execution).toMatchObject({
      status: 'ready',
      mediaType: 'image/svg+xml',
      executableFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/u),
    })
    expect(execution.status === 'ready' ? Buffer.from(execution.bytes).toString('utf8') : '').toBe(validSvg('drawio'))
    expect(runtime.resolutions).toEqual(['drawio'])
    expect(runtime.spawns).toHaveLength(1)
    expect(runtime.spawns[0]).toMatchObject({
      argv: [runtime.resolvedPath('drawio'), '--export', '--format', 'svg', '--output', 'output.svg', 'source.drawio'],
      graceMs: 2_000,
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes: 16_384 },
        stderr: { maxBytes: 16_384 },
      },
    })
    expect(runtime.spawns[0]?.cwd).toContain(join('.notemd', 'staging', 'process'))
    expect(runtime.spawns[0]?.env?.NOTEMD_TEST_SECRET_TOKEN).toBeUndefined()
    expect(await readdir(join(workspaceRoot, '.notemd', 'staging', 'process'))).toEqual([])
  })

  test('owns fixed argument vectors for Drawnix, Tectonic, and PDF conversions', async () => {
    const runtime = new FakeSubprocessRuntime(async (spec) => {
      const program = basename(spec.argv[0] ?? '')
      if (program.startsWith('tectonic')) {
        await writeFile(join(spec.cwd, 'source.pdf'), validPdf())
      } else if (spec.argv.includes('-png')) {
        await writeFile(join(spec.cwd, 'output.png'), validPng())
      } else {
        await writeFile(join(spec.cwd, 'output.svg'), validSvg(program))
      }
      return { exitCode: 0, signal: null }
    })
    const boundary = new AllowlistedProcessBoundary(runtime, workspaceRoot)

    await expect(boundary.renderDrawnixSvg('{"type":"drawnix"}')).resolves.toMatchObject({ status: 'ready' })
    const pdf = await boundary.compileCircuitikzPdf('\\documentclass{standalone}')
    expect(pdf).toMatchObject({ status: 'ready', mediaType: 'application/pdf' })
    const pdfBytes = pdf.status === 'ready' ? pdf.bytes : validPdf()
    await expect(boundary.convertPdfToSvg(pdfBytes)).resolves.toMatchObject({ status: 'ready' })
    await expect(boundary.convertPdfToPng(pdfBytes)).resolves.toMatchObject({ status: 'ready' })

    expect(runtime.spawns.map((spawn) => spawn.argv)).toEqual([
      [runtime.resolvedPath('notemd-drawnix-render'), '--input', 'source.drawnix.json', '--output', 'output.svg'],
      [runtime.resolvedPath('tectonic'), '-X', 'compile', '--outdir', '.', 'source.tex'],
      [runtime.resolvedPath('pdftocairo'), '-svg', 'source.pdf', 'output.svg'],
      [runtime.resolvedPath('pdftocairo'), '-png', '-singlefile', 'source.pdf', 'output.png'],
    ])
  })

  test('reports a missing executable as capability unavailable without spawning', async () => {
    const runtime = new FakeSubprocessRuntime(async () => ({ exitCode: 0, signal: null }))
    runtime.resolveError = new Error('not installed')
    const boundary = new AllowlistedProcessBoundary(runtime, workspaceRoot)

    await expect(boundary.renderDrawioSvg('<mxfile />')).resolves.toEqual({
      status: 'unavailable',
      code: 'executable-unavailable',
    })
    expect(runtime.spawns).toEqual([])
  })

  test('classifies nonzero exits and malformed output without persisting either', async () => {
    const nonzeroRuntime = new FakeSubprocessRuntime(async () => ({ exitCode: 7, signal: null }))
    const nonzeroBoundary = new AllowlistedProcessBoundary(nonzeroRuntime, workspaceRoot)
    await expect(nonzeroBoundary.renderDrawioSvg('<mxfile />')).resolves.toEqual({
      status: 'failed',
      code: 'process-nonzero-exit',
    })

    const malformedRuntime = new FakeSubprocessRuntime(async (spec) => {
      await writeFile(join(spec.cwd, 'output.svg'), '<html>not svg</html>')
      return { exitCode: 0, signal: null }
    })
    const malformedBoundary = new AllowlistedProcessBoundary(malformedRuntime, workspaceRoot)
    await expect(malformedBoundary.renderDrawioSvg('<mxfile />')).resolves.toEqual({
      status: 'failed',
      code: 'process-output-invalid',
    })
  })

  test('rejects output over the profile byte budget', async () => {
    const runtime = new FakeSubprocessRuntime(async (spec) => {
      await writeFile(join(spec.cwd, 'output.svg'), validSvg('x'.repeat(256)))
      return { exitCode: 0, signal: null }
    })
    const boundary = new AllowlistedProcessBoundary(runtime, workspaceRoot, {
      timeoutMs: 30_000,
      svgOutputBytes: 64,
      pdfOutputBytes: 128,
      pngOutputBytes: 128,
    })

    await expect(boundary.renderDrawioSvg('<mxfile />')).resolves.toEqual({
      status: 'failed',
      code: 'process-output-too-large',
    })
  })

  test('rejects a staging root redirected outside the workspace', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'notemd-process-outside-'))
    try {
      await mkdir(join(workspaceRoot, '.notemd', 'staging'), { recursive: true })
      await symlink(outside, join(workspaceRoot, '.notemd', 'staging', 'process'), process.platform === 'win32' ? 'junction' : 'dir')
      const runtime = new FakeSubprocessRuntime(async () => ({ exitCode: 0, signal: null }))
      const boundary = new AllowlistedProcessBoundary(runtime, workspaceRoot)

      await expect(boundary.renderDrawioSvg('<mxfile />')).resolves.toEqual({
        status: 'failed',
        code: 'process-staging-escape',
      })
      expect(runtime.spawns).toEqual([])
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })

  test('distinguishes caller cancellation from deadline expiry and joins the process tree', async () => {
    vi.useFakeTimers()
    const runtime = new FakeSubprocessRuntime(waitForAbort)
    const boundary = new AllowlistedProcessBoundary(runtime, workspaceRoot, {
      timeoutMs: 50,
      svgOutputBytes: 1_024,
      pdfOutputBytes: 1_024,
      pngOutputBytes: 1_024,
    })

    const timedOut = boundary.renderDrawioSvg('<mxfile />')
    await runtime.waitForSpawns(1)
    await vi.advanceTimersByTimeAsync(50)
    await expect(timedOut).resolves.toEqual({ status: 'failed', code: 'process-timeout' })

    const cancellation = new AbortController()
    const cancelled = boundary.renderDrawioSvg('<mxfile />', cancellation.signal)
    await runtime.waitForSpawns(2)
    cancellation.abort(new DOMException('cancelled', 'AbortError'))
    await expect(cancelled).resolves.toEqual({ status: 'cancelled', code: 'process-cancelled' })

    expect(runtime.waitForExitCalls).toBe(2)
  })
})

class FakeSubprocessRuntime implements DshSubprocessRuntime {
  readonly resolutions: string[] = []
  readonly spawns: DshSubprocessSpawnSpec[] = []
  waitForExitCalls = 0
  resolveError: Error | undefined
  private readonly spawnWaiters: Array<{ readonly count: number; readonly resolve: () => void }> = []

  constructor(
    private readonly execute: (spec: DshSubprocessSpawnSpec) => Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>,
  ) {}

  resolvedPath(command: string): string {
    return join(workspaceRoot, 'executables', process.platform === 'win32' ? `${command}.exe` : command)
  }

  async waitForSpawns(count: number): Promise<void> {
    if (this.spawns.length >= count) {
      return
    }
    await new Promise<void>((resolve) => this.spawnWaiters.push({ count, resolve }))
  }

  async resolveExecutable(command: string, _env?: Readonly<Record<string, string>>, signal?: AbortSignal): Promise<string> {
    signal?.throwIfAborted()
    this.resolutions.push(command)
    if (this.resolveError !== undefined) {
      throw this.resolveError
    }
    return this.resolvedPath(command)
  }

  spawn(spec: DshSubprocessSpawnSpec): DshSubprocessHandle {
    this.spawns.push(spec)
    for (const waiter of this.spawnWaiters.splice(0)) {
      if (this.spawns.length >= waiter.count) {
        waiter.resolve()
      } else {
        this.spawnWaiters.push(waiter)
      }
    }
    const done = this.execute(spec)
    return {
      done,
      terminate: vi.fn(),
      waitForExit: async () => {
        this.waitForExitCalls += 1
        await done.catch(() => undefined)
        return true
      },
    }
  }
}

async function waitForAbort(spec: DshSubprocessSpawnSpec): Promise<{ exitCode: null; signal: 'SIGTERM' }> {
  await new Promise<void>((resolve) => {
    if (spec.signal?.aborted) {
      resolve()
      return
    }
    spec.signal?.addEventListener('abort', () => resolve(), { once: true })
  })
  return { exitCode: null, signal: 'SIGTERM' }
}

function validSvg(label: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg"><text>${label}</text></svg>`
}

function validPdf(): Uint8Array {
  return Buffer.from('%PDF-1.7\n%%EOF\n', 'ascii')
}

function validPng(): Uint8Array {
  return Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
}
