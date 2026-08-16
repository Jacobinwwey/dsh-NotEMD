import { createHash } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { basename, isAbsolute, join, relative } from 'node:path'

export interface DshSubprocessSpawnSpec {
  readonly argv: readonly string[]
  readonly cwd: string
  readonly stdio: {
    readonly stdin: 'ignore'
    readonly stdout: { readonly maxBytes: number }
    readonly stderr: { readonly maxBytes: number }
  }
  readonly graceMs: number
  readonly signal: AbortSignal
  readonly env: NodeJS.ProcessEnv
}

export interface DshSubprocessHandle {
  readonly done: Promise<{
    readonly exitCode: number | null
    readonly signal: NodeJS.Signals | null
  }>
  terminate(): void
  waitForExit(signal?: AbortSignal): Promise<boolean>
}

/** Narrow structural face of DSH's ctx.subprocess seam used by this package. */
export interface DshSubprocessRuntime {
  resolveExecutable(
    command: string,
    env?: Readonly<Record<string, string>>,
    signal?: AbortSignal,
  ): Promise<string>
  spawn(spec: DshSubprocessSpawnSpec): DshSubprocessHandle
}

export interface AllowlistedProcessLimits {
  readonly timeoutMs: number
  readonly svgOutputBytes: number
  readonly pdfOutputBytes: number
  readonly pngOutputBytes: number
}

export interface ReadyProcessArtifact {
  readonly status: 'ready'
  readonly mediaType: string
  readonly bytes: Uint8Array
  readonly contentSha256: string
  readonly executableFingerprint: string
}

export interface UnavailableProcessArtifact {
  readonly status: 'unavailable'
  readonly code: 'executable-unavailable'
}

export interface CancelledProcessArtifact {
  readonly status: 'cancelled'
  readonly code: 'process-cancelled' | 'process-disposed'
}

export interface FailedProcessArtifact {
  readonly status: 'failed'
  readonly code:
    | 'process-executable-invalid'
    | 'process-execution-failed'
    | 'process-input-invalid'
    | 'process-input-too-large'
    | 'process-nonzero-exit'
    | 'process-output-invalid'
    | 'process-output-missing'
    | 'process-output-too-large'
    | 'process-staging-escape'
    | 'process-timeout'
}

export type ProcessArtifactExecution =
  | ReadyProcessArtifact
  | UnavailableProcessArtifact
  | CancelledProcessArtifact
  | FailedProcessArtifact

export type ProcessExecutableCapability =
  | { readonly status: 'available'; readonly executableFingerprint: string }
  | { readonly status: 'unavailable'; readonly code: 'executable-unavailable' | 'process-executable-invalid' }
  | CancelledProcessArtifact
  | { readonly status: 'failed'; readonly code: 'process-timeout' }

interface CommandProfile {
  readonly id: string
  readonly version: string
  readonly executable: string
  readonly inputFilename: string
  readonly outputFilename: string
  readonly mediaType: string
  readonly outputLimit: keyof Pick<AllowlistedProcessLimits, 'svgOutputBytes' | 'pdfOutputBytes' | 'pngOutputBytes'>
  readonly inputLimitBytes: number
  readonly argv: (executable: string) => readonly string[]
  readonly validateInput: (bytes: Uint8Array) => boolean
  readonly validateOutput: (bytes: Uint8Array) => boolean
}

interface RunLifetime {
  readonly controller: AbortController
  readonly signal: AbortSignal
  classification: 'caller' | 'deadline' | 'dispose' | undefined
  dispose(): void
}

const processProfiles = Object.freeze({
  drawioSvg: Object.freeze({
    id: 'drawio-svg',
    version: '1',
    executable: 'drawio',
    inputFilename: 'source.drawio',
    outputFilename: 'output.svg',
    mediaType: 'image/svg+xml',
    outputLimit: 'svgOutputBytes',
    inputLimitBytes: 16 * 1024 * 1024,
    argv: (executable: string) => [executable, '--export', '--format', 'svg', '--output', 'output.svg', 'source.drawio'],
    validateInput: isNonEmptyText,
    validateOutput: isSvg,
  }),
  drawnixSvg: Object.freeze({
    id: 'drawnix-svg',
    version: '1',
    executable: 'notemd-drawnix-render',
    inputFilename: 'source.drawnix.json',
    outputFilename: 'output.svg',
    mediaType: 'image/svg+xml',
    outputLimit: 'svgOutputBytes',
    inputLimitBytes: 16 * 1024 * 1024,
    argv: (executable: string) => [executable, '--input', 'source.drawnix.json', '--output', 'output.svg'],
    validateInput: isJsonObject,
    validateOutput: isSvg,
  }),
  tectonicPdf: Object.freeze({
    id: 'tectonic-pdf',
    version: '1',
    executable: 'tectonic',
    inputFilename: 'source.tex',
    outputFilename: 'source.pdf',
    mediaType: 'application/pdf',
    outputLimit: 'pdfOutputBytes',
    inputLimitBytes: 16 * 1024 * 1024,
    argv: (executable: string) => [executable, '-X', 'compile', '--outdir', '.', 'source.tex'],
    validateInput: isNonEmptyText,
    validateOutput: isPdf,
  }),
  pdfToSvg: Object.freeze({
    id: 'pdf-to-svg',
    version: '1',
    executable: 'pdftocairo',
    inputFilename: 'source.pdf',
    outputFilename: 'output.svg',
    mediaType: 'image/svg+xml',
    outputLimit: 'svgOutputBytes',
    inputLimitBytes: 64 * 1024 * 1024,
    argv: (executable: string) => [executable, '-svg', 'source.pdf', 'output.svg'],
    validateInput: isPdf,
    validateOutput: isSvg,
  }),
  pdfToPng: Object.freeze({
    id: 'pdf-to-png',
    version: '1',
    executable: 'pdftocairo',
    inputFilename: 'source.pdf',
    outputFilename: 'output.png',
    mediaType: 'image/png',
    outputLimit: 'pngOutputBytes',
    inputLimitBytes: 64 * 1024 * 1024,
    argv: (executable: string) => [executable, '-png', '-singlefile', 'source.pdf', 'output.png'],
    validateInput: isPdf,
    validateOutput: isPng,
  }),
} satisfies Record<string, CommandProfile>)

const defaultLimits: AllowlistedProcessLimits = Object.freeze({
  timeoutMs: 120_000,
  svgOutputBytes: 16 * 1024 * 1024,
  pdfOutputBytes: 64 * 1024 * 1024,
  pngOutputBytes: 64 * 1024 * 1024,
})

const graceMs = 2_000
const diagnosticBytes = 16_384
const environmentAllowlist = new Set([
  'APPDATA',
  'FONTCONFIG_PATH',
  'HOME',
  'LANG',
  'LC_ALL',
  'LOCALAPPDATA',
  'PATH',
  'PATHEXT',
  'PLAYWRIGHT_BROWSERS_PATH',
  'SYSTEMROOT',
  'TEMP',
  'TMP',
  'TMPDIR',
  'USERPROFILE',
  'WINDIR',
])

/**
 * Executes only the package-owned command profiles. Every child receives a
 * unique staging cwd, exact argv, bounded output, credential-free environment,
 * and an AbortSignal that owns the complete DSH process tree.
 */
export class AllowlistedProcessBoundary {
  private readonly workspaceRoot: string
  private readonly stagingRoot: string
  private readonly limits: AllowlistedProcessLimits
  private readonly ownerController = new AbortController()
  private readonly active = new Set<Promise<ProcessArtifactExecution>>()
  private disposed = false

  constructor(
    private readonly subprocess: DshSubprocessRuntime,
    workspaceRoot: string,
    limits: AllowlistedProcessLimits = defaultLimits,
  ) {
    if (!isAbsolute(workspaceRoot)) {
      throw new RangeError('The allowlisted process workspace root must be absolute.')
    }
    this.workspaceRoot = workspaceRoot
    this.stagingRoot = join(workspaceRoot, '.notemd', 'staging', 'process')
    this.limits = validateLimits(limits)
  }

  renderDrawioSvg(source: string, signal?: AbortSignal): Promise<ProcessArtifactExecution> {
    return this.start(processProfiles.drawioSvg, Buffer.from(source, 'utf8'), signal)
  }

  renderDrawnixSvg(source: string, signal?: AbortSignal): Promise<ProcessArtifactExecution> {
    return this.start(processProfiles.drawnixSvg, Buffer.from(source, 'utf8'), signal)
  }

  compileCircuitikzPdf(source: string, signal?: AbortSignal): Promise<ProcessArtifactExecution> {
    return this.start(processProfiles.tectonicPdf, Buffer.from(source, 'utf8'), signal)
  }

  convertPdfToSvg(pdf: Uint8Array, signal?: AbortSignal): Promise<ProcessArtifactExecution> {
    return this.start(processProfiles.pdfToSvg, Uint8Array.from(pdf), signal)
  }

  convertPdfToPng(pdf: Uint8Array, signal?: AbortSignal): Promise<ProcessArtifactExecution> {
    return this.start(processProfiles.pdfToPng, Uint8Array.from(pdf), signal)
  }

  drawioSvgCapability(signal?: AbortSignal): Promise<ProcessExecutableCapability> {
    return this.capability(processProfiles.drawioSvg, signal)
  }

  drawnixSvgCapability(signal?: AbortSignal): Promise<ProcessExecutableCapability> {
    return this.capability(processProfiles.drawnixSvg, signal)
  }

  circuitikzPdfCapability(signal?: AbortSignal): Promise<ProcessExecutableCapability> {
    return this.capability(processProfiles.tectonicPdf, signal)
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return
    }
    this.disposed = true
    this.ownerController.abort(new DOMException('The NoteMD process owner was disposed.', 'AbortError'))
    await Promise.allSettled([...this.active])
  }

  private start(profile: CommandProfile, input: Uint8Array, callerSignal?: AbortSignal): Promise<ProcessArtifactExecution> {
    if (this.disposed) {
      return Promise.resolve({ status: 'cancelled', code: 'process-disposed' })
    }
    const execution = this.execute(profile, input, callerSignal)
    this.active.add(execution)
    void execution.then(
      () => this.active.delete(execution),
      () => this.active.delete(execution),
    )
    return execution
  }

  private async capability(profile: CommandProfile, callerSignal?: AbortSignal): Promise<ProcessExecutableCapability> {
    if (this.disposed) {
      return { status: 'cancelled', code: 'process-disposed' }
    }
    const lifetime = createRunLifetime(callerSignal, this.ownerController.signal, this.limits.timeoutMs)
    try {
      if (lifetime.signal.aborted) {
        return capabilityCancellationOutcome(lifetime.classification)
      }
      try {
        const executable = await this.subprocess.resolveExecutable(
          profile.executable,
          executableLookupEnvironment(),
          lifetime.signal,
        )
        if (!isResolvedExecutable(profile.executable, executable)) {
          return { status: 'unavailable', code: 'process-executable-invalid' }
        }
        return {
          status: 'available',
          executableFingerprint: fingerprintExecutable(profile, executable),
        }
      } catch {
        return lifetime.signal.aborted
          ? capabilityCancellationOutcome(lifetime.classification)
          : { status: 'unavailable', code: 'executable-unavailable' }
      }
    } finally {
      lifetime.dispose()
    }
  }

  private async execute(
    profile: CommandProfile,
    input: Uint8Array,
    callerSignal?: AbortSignal,
  ): Promise<ProcessArtifactExecution> {
    const lifetime = createRunLifetime(callerSignal, this.ownerController.signal, this.limits.timeoutMs)
    let runDirectory: string | undefined
    let handle: DshSubprocessHandle | undefined
    let processTreeJoined = false

    try {
      if (lifetime.signal.aborted) {
        return cancellationOutcome(lifetime.classification)
      }
      if (input.byteLength > profile.inputLimitBytes) {
        return { status: 'failed', code: 'process-input-too-large' }
      }
      if (!profile.validateInput(input)) {
        return { status: 'failed', code: 'process-input-invalid' }
      }

      const staging = await this.createRunDirectory()
      runDirectory = staging.runDirectory
      await writeFile(join(runDirectory, profile.inputFilename), input, { flag: 'wx', mode: 0o600 })

      let executable: string
      try {
        executable = await this.subprocess.resolveExecutable(
          profile.executable,
          executableLookupEnvironment(),
          lifetime.signal,
        )
      } catch {
        return lifetime.signal.aborted
          ? cancellationOutcome(lifetime.classification)
          : { status: 'unavailable', code: 'executable-unavailable' }
      }
      if (!isResolvedExecutable(profile.executable, executable)) {
        return { status: 'failed', code: 'process-executable-invalid' }
      }

      handle = this.subprocess.spawn({
        argv: profile.argv(executable),
        cwd: runDirectory,
        stdio: {
          stdin: 'ignore',
          stdout: { maxBytes: diagnosticBytes },
          stderr: { maxBytes: diagnosticBytes },
        },
        graceMs,
        signal: lifetime.signal,
        env: childEnvironment(),
      })
      const outcome = await handle.done
      await handle.waitForExit()
      processTreeJoined = true

      if (lifetime.signal.aborted) {
        return cancellationOutcome(lifetime.classification)
      }
      if (outcome.exitCode !== 0 || outcome.signal !== null) {
        return { status: 'failed', code: 'process-nonzero-exit' }
      }

      const bytes = await readBoundedOutput(
        runDirectory,
        profile.outputFilename,
        this.limits[profile.outputLimit],
      )
      if (!profile.validateOutput(bytes)) {
        return { status: 'failed', code: 'process-output-invalid' }
      }
      return Object.freeze({
        status: 'ready',
        mediaType: profile.mediaType,
        bytes: Uint8Array.from(bytes),
        contentSha256: sha256(bytes),
        executableFingerprint: fingerprintExecutable(profile, executable),
      })
    } catch (error) {
      if (lifetime.signal.aborted) {
        return cancellationOutcome(lifetime.classification)
      }
      if (error instanceof ProcessBoundaryError) {
        return { status: 'failed', code: error.code }
      }
      return { status: 'failed', code: 'process-execution-failed' }
    } finally {
      if (handle !== undefined && !processTreeJoined) {
        handle.terminate()
        await handle.done.catch(() => undefined)
        await handle.waitForExit().catch(() => false)
      }
      lifetime.dispose()
      if (runDirectory !== undefined) {
        await rm(runDirectory, { recursive: true, force: true }).catch(() => undefined)
      }
    }
  }

  private async createRunDirectory(): Promise<{ readonly runDirectory: string }> {
    await mkdir(this.stagingRoot, { recursive: true, mode: 0o700 })
    const [workspace, staging] = await Promise.all([
      realpath(this.workspaceRoot),
      realpath(this.stagingRoot),
    ])
    if (!isStrictDescendant(workspace, staging)) {
      throw new ProcessBoundaryError('process-staging-escape')
    }
    const runDirectory = await mkdtemp(join(staging, 'run-'))
    const canonicalRunDirectory = await realpath(runDirectory)
    if (!isStrictDescendant(staging, canonicalRunDirectory)) {
      await rm(runDirectory, { recursive: true, force: true }).catch(() => undefined)
      throw new ProcessBoundaryError('process-staging-escape')
    }
    return { runDirectory: canonicalRunDirectory }
  }
}

class ProcessBoundaryError extends Error {
  constructor(readonly code: FailedProcessArtifact['code']) {
    super(code)
    this.name = 'ProcessBoundaryError'
  }
}

async function readBoundedOutput(runDirectory: string, filename: string, maxBytes: number): Promise<Uint8Array> {
  const outputPath = join(runDirectory, filename)
  let entry
  try {
    entry = await lstat(outputPath)
  } catch (error) {
    if (isMissingPath(error)) {
      throw new ProcessBoundaryError('process-output-missing')
    }
    throw error
  }
  if (!entry.isFile() || entry.isSymbolicLink()) {
    throw new ProcessBoundaryError('process-staging-escape')
  }
  const canonicalOutput = await realpath(outputPath)
  if (!isStrictDescendant(runDirectory, canonicalOutput)) {
    throw new ProcessBoundaryError('process-staging-escape')
  }
  if (entry.size > maxBytes) {
    throw new ProcessBoundaryError('process-output-too-large')
  }
  const bytes = await readFile(canonicalOutput)
  if (bytes.byteLength > maxBytes) {
    throw new ProcessBoundaryError('process-output-too-large')
  }
  return bytes
}

function createRunLifetime(
  callerSignal: AbortSignal | undefined,
  ownerSignal: AbortSignal,
  timeoutMs: number,
): RunLifetime {
  const controller = new AbortController()
  let classification: RunLifetime['classification']
  const abort = (kind: Exclude<RunLifetime['classification'], undefined>, reason: unknown): void => {
    if (classification !== undefined) {
      return
    }
    classification = kind
    controller.abort(reason)
  }
  const onCallerAbort = (): void => abort('caller', callerSignal?.reason)
  const onOwnerAbort = (): void => abort('dispose', ownerSignal.reason)
  callerSignal?.addEventListener('abort', onCallerAbort, { once: true })
  ownerSignal.addEventListener('abort', onOwnerAbort, { once: true })
  if (callerSignal?.aborted === true) {
    onCallerAbort()
  } else if (ownerSignal.aborted) {
    onOwnerAbort()
  }
  const deadline = setTimeout(
    () => abort('deadline', new DOMException('The process deadline elapsed.', 'TimeoutError')),
    timeoutMs,
  )
  deadline.unref?.()

  return {
    controller,
    signal: controller.signal,
    get classification() {
      return classification
    },
    set classification(next) {
      classification = next
    },
    dispose() {
      clearTimeout(deadline)
      callerSignal?.removeEventListener('abort', onCallerAbort)
      ownerSignal.removeEventListener('abort', onOwnerAbort)
    },
  }
}

function cancellationOutcome(classification: RunLifetime['classification']): CancelledProcessArtifact | FailedProcessArtifact {
  if (classification === 'deadline') {
    return { status: 'failed', code: 'process-timeout' }
  }
  if (classification === 'dispose') {
    return { status: 'cancelled', code: 'process-disposed' }
  }
  return { status: 'cancelled', code: 'process-cancelled' }
}

function capabilityCancellationOutcome(classification: RunLifetime['classification']): ProcessExecutableCapability {
  if (classification === 'deadline') {
    return { status: 'failed', code: 'process-timeout' }
  }
  if (classification === 'dispose') {
    return { status: 'cancelled', code: 'process-disposed' }
  }
  return { status: 'cancelled', code: 'process-cancelled' }
}

function validateLimits(candidate: AllowlistedProcessLimits): AllowlistedProcessLimits {
  for (const [name, value] of Object.entries(candidate)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RangeError(`Allowlisted process limit ${name} must be a positive safe integer.`)
    }
  }
  return Object.freeze({ ...candidate })
}

function executableLookupEnvironment(): Readonly<Record<string, string>> {
  return Object.freeze(Object.fromEntries(
    Object.entries(process.env).flatMap(([key, value]) =>
      value !== undefined && environmentAllowlist.has(key.toUpperCase()) ? [[key, value]] : []),
  ))
}

function childEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env)) {
    environment[key] = environmentAllowlist.has(key.toUpperCase()) ? value : undefined
  }
  return environment
}

function isResolvedExecutable(requested: string, resolved: string): boolean {
  if (!isAbsolute(resolved) || resolved.includes('\0')) {
    return false
  }
  const requestedName = basename(requested).toLowerCase()
  const resolvedName = basename(resolved).toLowerCase()
  return resolvedName === requestedName
    || resolvedName === `${requestedName}.exe`
    || resolvedName === `${requestedName}.cmd`
    || resolvedName === `${requestedName}.bat`
}

function fingerprintExecutable(profile: CommandProfile, executable: string): string {
  return sha256(Buffer.from(`${profile.id}@${profile.version}\0${executable}`, 'utf8'))
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function isStrictDescendant(parent: string, candidate: string): boolean {
  const path = relative(parent, candidate)
  return path.length > 0 && path !== '..' && !path.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(path)
}

function isNonEmptyText(bytes: Uint8Array): boolean {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return text.trim().length > 0 && !text.includes('\0')
  } catch {
    return false
  }
}

function isJsonObject(bytes: Uint8Array): boolean {
  try {
    const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
  } catch {
    return false
  }
}

function isSvg(bytes: Uint8Array): boolean {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).trim()
    return /^(?:<\?xml\s[^>]*>\s*)?<svg\b[\s\S]*<\/svg>$/iu.test(text) && !text.includes('\0')
  } catch {
    return false
  }
}

function isPdf(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 5 && Buffer.from(bytes.subarray(0, 5)).toString('ascii') === '%PDF-'
}

function isPng(bytes: Uint8Array): boolean {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  return bytes.byteLength >= signature.length && signature.every((byte, index) => bytes[index] === byte)
}

function isMissingPath(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
