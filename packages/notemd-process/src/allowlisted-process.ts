import { createHash } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
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

/** The only Slidev distribution accepted by NoteMD export providers. */
export const NOTEMD_SLIDEV_FORK = Object.freeze({
  origin: 'github:Jacobinwwey/slidev',
  revision: 'bbcb2efae709c2ebaa96bda522cd6c192476817c',
  packageName: '@slidev/cli',
  command: 'slidev',
  releaseTag: 'notemd-standalone-v52.16.0-1',
  releaseAsset: 'slidev-cli-notemd-standalone-v52.16.0-1.tgz',
  tarballUrl: 'https://github.com/Jacobinwwey/slidev/releases/download/notemd-standalone-v52.16.0-1/slidev-cli-notemd-standalone-v52.16.0-1.tgz',
  requiredBuildOptions: Object.freeze(['--out', '--format', '--standalone-bundle']),
})

export interface AllowlistedProcessLimits {
  readonly timeoutMs: number
  readonly svgOutputBytes: number
  readonly pdfOutputBytes: number
  readonly pngOutputBytes: number
  readonly archiveOutputBytes?: number
  readonly pptxOutputBytes?: number
  readonly mp4OutputBytes?: number
  readonly archiveFileCount?: number
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
  readonly outputLimit: keyof ResolvedProcessLimits
  readonly outputKind?: 'file' | 'directory-archive'
  readonly validateArchive?: (entries: readonly ArchiveEntry[]) => boolean
  readonly inputLimitBytes: number
  readonly argv: (executable: string) => readonly string[]
  readonly requiredExecutables?: readonly string[]
  readonly validateInput: (bytes: Uint8Array) => boolean
  readonly validateOutput: (bytes: Uint8Array) => boolean
}

interface ArchiveEntry {
  readonly path: string
  readonly bytes: Uint8Array
}

interface ResolvedProcessLimits {
  readonly timeoutMs: number
  readonly svgOutputBytes: number
  readonly pdfOutputBytes: number
  readonly pngOutputBytes: number
  readonly archiveOutputBytes: number
  readonly pptxOutputBytes: number
  readonly mp4OutputBytes: number
  readonly archiveFileCount: number
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
  slidevHtml: Object.freeze({
    id: `slidev-html:${NOTEMD_SLIDEV_FORK.origin}`,
    version: NOTEMD_SLIDEV_FORK.revision,
    executable: NOTEMD_SLIDEV_FORK.command,
    inputFilename: 'source.md',
    outputFilename: 'output-html',
    mediaType: 'application/zip',
    outputLimit: 'archiveOutputBytes',
    outputKind: 'directory-archive',
    inputLimitBytes: 16 * 1024 * 1024,
    argv: (executable: string) => [executable, 'build', 'source.md', '--out', 'output-html', '--standalone-bundle'],
    requiredExecutables: ['slidev'],
    validateInput: isNonEmptyText,
    validateOutput: () => true,
    validateArchive: isSlidevHtmlArchive,
  }),
  slidevPdf: Object.freeze({
    id: `slidev-pdf:${NOTEMD_SLIDEV_FORK.origin}`,
    version: NOTEMD_SLIDEV_FORK.revision,
    executable: NOTEMD_SLIDEV_FORK.command,
    inputFilename: 'source.md',
    outputFilename: 'output.pdf',
    mediaType: 'application/pdf',
    outputLimit: 'pdfOutputBytes',
    inputLimitBytes: 16 * 1024 * 1024,
    argv: (executable: string) => [
      executable, 'export', '--format', 'pdf', '--output', 'output.pdf',
      '--per-slide', '--wait-until', 'networkidle', '--wait', '3000', 'source.md',
    ],
    requiredExecutables: ['slidev', 'playwright'],
    validateInput: isNonEmptyText,
    validateOutput: isPdf,
  }),
  slidevPptx: Object.freeze({
    id: `slidev-pptx:${NOTEMD_SLIDEV_FORK.origin}`,
    version: NOTEMD_SLIDEV_FORK.revision,
    executable: NOTEMD_SLIDEV_FORK.command,
    inputFilename: 'source.md',
    outputFilename: 'output.pptx',
    mediaType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    outputLimit: 'pptxOutputBytes',
    inputLimitBytes: 16 * 1024 * 1024,
    argv: (executable: string) => [
      executable, 'export', '--format', 'pptx', '--output', 'output.pptx',
      '--per-slide', '--wait-until', 'networkidle', '--wait', '3000', 'source.md',
    ],
    requiredExecutables: ['slidev', 'playwright'],
    validateInput: isNonEmptyText,
    validateOutput: isPptx,
  }),
} satisfies Record<string, CommandProfile>)

const defaultLimits: AllowlistedProcessLimits = Object.freeze({
  timeoutMs: 120_000,
  svgOutputBytes: 16 * 1024 * 1024,
  pdfOutputBytes: 64 * 1024 * 1024,
  pngOutputBytes: 64 * 1024 * 1024,
  archiveOutputBytes: 128 * 1024 * 1024,
  pptxOutputBytes: 128 * 1024 * 1024,
  mp4OutputBytes: 512 * 1024 * 1024,
  archiveFileCount: 4_096,
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

function createSlidevPngProfile(options: { readonly withClicks: boolean; readonly imageScale: number }): CommandProfile {
  validateSlidevPngOptions(options)
  return Object.freeze({
    id: `slidev-png:${NOTEMD_SLIDEV_FORK.origin}`,
    version: NOTEMD_SLIDEV_FORK.revision,
    executable: NOTEMD_SLIDEV_FORK.command,
    inputFilename: 'source.md',
    outputFilename: 'output-png',
    mediaType: 'application/zip',
    outputLimit: 'archiveOutputBytes',
    outputKind: 'directory-archive',
    inputLimitBytes: 16 * 1024 * 1024,
    argv: (executable: string) => [
      executable, 'export', '--format', 'png', '--output', 'output-png',
      ...(options.withClicks ? ['--with-clicks'] : []),
      '--scale', String(options.imageScale), '--per-slide', '--wait-until', 'networkidle', '--wait', '3000', 'source.md',
    ],
    requiredExecutables: [NOTEMD_SLIDEV_FORK.command, 'playwright'],
    validateInput: isNonEmptyText,
    validateOutput: () => true,
    validateArchive: isSlidevPngArchive,
  })
}

/**
 * Executes only the package-owned command profiles. Every child receives a
 * unique staging cwd, exact argv, bounded output, credential-free environment,
 * and an AbortSignal that owns the complete DSH process tree.
 */
export class AllowlistedProcessBoundary {
  private readonly workspaceRoot: string
  private readonly stagingRoot: string
  private readonly limits: ResolvedProcessLimits
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

  renderSlidevHtml(source: string, signal?: AbortSignal): Promise<ProcessArtifactExecution> {
    return this.start(processProfiles.slidevHtml, Buffer.from(source, 'utf8'), signal)
  }

  renderSlidevPdf(source: string, signal?: AbortSignal): Promise<ProcessArtifactExecution> {
    return this.start(processProfiles.slidevPdf, Buffer.from(source, 'utf8'), signal)
  }

  renderSlidevPptx(source: string, signal?: AbortSignal): Promise<ProcessArtifactExecution> {
    return this.start(processProfiles.slidevPptx, Buffer.from(source, 'utf8'), signal)
  }

  renderSlidevPng(
    source: string,
    options: { readonly withClicks: boolean; readonly imageScale: number },
    signal?: AbortSignal,
  ): Promise<ProcessArtifactExecution> {
    const profile = createSlidevPngProfile(options)
    return this.start(profile, Buffer.from(source, 'utf8'), signal)
  }

  renderSlidevMp4(
    source: string,
    options: { readonly withClicks: boolean; readonly imageScale: number; readonly fps: number; readonly crf: number },
    signal?: AbortSignal,
  ): Promise<ProcessArtifactExecution> {
    if (this.disposed) {
      return Promise.resolve({ status: 'cancelled', code: 'process-disposed' })
    }
    const execution = this.executeSlidevMp4(source, options, signal)
    this.active.add(execution)
    void execution.then(
      () => this.active.delete(execution),
      () => this.active.delete(execution),
    )
    return execution
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

  slidevHtmlCapability(signal?: AbortSignal): Promise<ProcessExecutableCapability> {
    return this.capability(processProfiles.slidevHtml, signal)
  }

  slidevPdfCapability(signal?: AbortSignal): Promise<ProcessExecutableCapability> {
    return this.capability(processProfiles.slidevPdf, signal)
  }

  slidevPngCapability(signal?: AbortSignal): Promise<ProcessExecutableCapability> {
    return this.capability(createSlidevPngProfile({ withClicks: false, imageScale: 1 }), signal)
  }

  slidevPptxCapability(signal?: AbortSignal): Promise<ProcessExecutableCapability> {
    return this.capability(processProfiles.slidevPptx, signal)
  }

  slidevMp4Capability(signal?: AbortSignal): Promise<ProcessExecutableCapability> {
    return this.capability(Object.freeze({
      ...processProfiles.slidevPptx,
      id: `slidev-mp4:${NOTEMD_SLIDEV_FORK.origin}`,
      version: NOTEMD_SLIDEV_FORK.revision,
      requiredExecutables: [NOTEMD_SLIDEV_FORK.command, 'playwright', 'ffmpeg'],
    }), signal)
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
        const executables = await this.resolveProfileExecutables(profile, lifetime.signal)
        return {
          status: 'available',
          executableFingerprint: fingerprintExecutable(profile, executables),
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
      let executables: readonly string[]
      try {
        executables = await this.resolveProfileExecutables(profile, lifetime.signal)
        executable = executables[0] as string
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

      const bytes = profile.outputKind === 'directory-archive'
        ? await readBoundedArchive(
          runDirectory,
          profile.outputFilename,
          this.limits[profile.outputLimit],
          this.limits.archiveFileCount,
          profile.validateArchive,
        )
        : await readBoundedOutput(runDirectory, profile.outputFilename, this.limits[profile.outputLimit])
      if (profile.outputKind !== 'directory-archive' && !profile.validateOutput(bytes)) {
        return { status: 'failed', code: 'process-output-invalid' }
      }
      return Object.freeze({
        status: 'ready',
        mediaType: profile.mediaType,
        bytes: Uint8Array.from(bytes),
        contentSha256: sha256(bytes),
        executableFingerprint: fingerprintExecutable(profile, executables),
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

  private async resolveProfileExecutables(profile: CommandProfile, signal: AbortSignal): Promise<readonly string[]> {
    const requested = profile.requiredExecutables ?? [profile.executable]
    const resolved = await Promise.all(requested.map(async (command) => {
      const executable = await this.subprocess.resolveExecutable(command, executableLookupEnvironment(), signal)
      if (!isResolvedExecutable(command, executable)) {
        throw new ProcessBoundaryError('process-executable-invalid')
      }
      return executable
    }))
    return Object.freeze(resolved)
  }

  private async executeSlidevMp4(
    source: string,
    options: { readonly withClicks: boolean; readonly imageScale: number; readonly fps: number; readonly crf: number },
    callerSignal?: AbortSignal,
  ): Promise<ProcessArtifactExecution> {
    try {
      validateSlidevPngOptions(options)
      validateMp4Options(options)
    } catch {
      return { status: 'failed', code: 'process-input-invalid' }
    }

    const lifetime = createRunLifetime(callerSignal, this.ownerController.signal, this.limits.timeoutMs)
    let runDirectory: string | undefined
    const handles: DshSubprocessHandle[] = []
    let processTreeJoined = false
    try {
      if (lifetime.signal.aborted) {
        return cancellationOutcome(lifetime.classification)
      }
      const sourceBytes = Buffer.from(source, 'utf8')
      if (sourceBytes.byteLength > 16 * 1024 * 1024 || !isNonEmptyText(sourceBytes)) {
        return { status: 'failed', code: 'process-input-invalid' }
      }
      const staging = await this.createRunDirectory()
      runDirectory = staging.runDirectory
      await writeFile(join(runDirectory, 'source.md'), sourceBytes, { flag: 'wx', mode: 0o600 })
      await mkdir(join(runDirectory, 'output-frames'))

      const executables = await this.resolveExecutableNames([NOTEMD_SLIDEV_FORK.command, 'ffmpeg'], lifetime.signal)
      const slidevHandle = this.subprocess.spawn({
        argv: [executables[0] as string, 'export', '--format', 'png', '--output', 'output-frames',
          ...(options.withClicks ? ['--with-clicks'] : []), '--scale', String(options.imageScale),
          '--per-slide', '--wait-until', 'networkidle', '--wait', '3000', 'source.md'],
        cwd: runDirectory,
        stdio: { stdin: 'ignore', stdout: { maxBytes: diagnosticBytes }, stderr: { maxBytes: diagnosticBytes } },
        graceMs,
        signal: lifetime.signal,
        env: childEnvironment(),
      })
      handles.push(slidevHandle)
      const slidevOutcome = await slidevHandle.done
      await slidevHandle.waitForExit()
      if (lifetime.signal.aborted) {
        return cancellationOutcome(lifetime.classification)
      }
      if (slidevOutcome.exitCode !== 0 || slidevOutcome.signal !== null) {
        return { status: 'failed', code: 'process-nonzero-exit' }
      }

      const frames = await collectArchiveEntries(
        join(runDirectory, 'output-frames'),
        this.limits.archiveOutputBytes,
        this.limits.archiveFileCount,
      )
      const pngs = frames.filter((entry) => entry.path.toLowerCase().endsWith('.png'))
      if (pngs.length === 0 || pngs.some((entry) => !isPng(entry.bytes))) {
        return { status: 'failed', code: 'process-output-invalid' }
      }
      const concatLines: string[] = []
      const frameDuration = String(1 / options.fps)
      for (const [index, entry] of pngs.sort(compareNumericFrameNames).entries()) {
        concatLines.push(`file 'output-frames/${entry.path.replace(/'/gu, "'\\''")}'`, `duration ${frameDuration}`)
        if (index === pngs.length - 1) {
          concatLines.push(`file 'output-frames/${entry.path.replace(/'/gu, "'\\''")}'`)
        }
      }
      await writeFile(join(runDirectory, 'frames.txt'), `${concatLines.join('\n')}\n`, { flag: 'wx', mode: 0o600 })
      const ffmpegHandle = this.subprocess.spawn({
        argv: [executables[1] as string, '-f', 'concat', '-safe', '0', '-i', 'frames.txt',
          '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
          '-r', String(options.fps), '-crf', String(options.crf), '-movflags', '+faststart', '-y', 'output.mp4'],
        cwd: runDirectory,
        stdio: { stdin: 'ignore', stdout: { maxBytes: diagnosticBytes }, stderr: { maxBytes: diagnosticBytes } },
        graceMs,
        signal: lifetime.signal,
        env: childEnvironment(),
      })
      handles.push(ffmpegHandle)
      const ffmpegOutcome = await ffmpegHandle.done
      await ffmpegHandle.waitForExit()
      processTreeJoined = true
      if (lifetime.signal.aborted) {
        return cancellationOutcome(lifetime.classification)
      }
      if (ffmpegOutcome.exitCode !== 0 || ffmpegOutcome.signal !== null) {
        return { status: 'failed', code: 'process-nonzero-exit' }
      }
      const bytes = await readBoundedOutput(runDirectory, 'output.mp4', this.limits.mp4OutputBytes)
      if (!isMp4(bytes)) {
        return { status: 'failed', code: 'process-output-invalid' }
      }
      return Object.freeze({
        status: 'ready',
        mediaType: 'video/mp4',
        bytes: Uint8Array.from(bytes),
        contentSha256: sha256(bytes),
        executableFingerprint: fingerprintExecutable({ id: `slidev-mp4:${NOTEMD_SLIDEV_FORK.origin}`, version: NOTEMD_SLIDEV_FORK.revision }, executables),
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
      if (!processTreeJoined) {
        for (const handle of handles) {
          handle.terminate()
          await handle.done.catch(() => undefined)
          await handle.waitForExit().catch(() => false)
        }
      }
      lifetime.dispose()
      if (runDirectory !== undefined) {
        await rm(runDirectory, { recursive: true, force: true }).catch(() => undefined)
      }
    }
  }

  private async resolveExecutableNames(requested: readonly string[], signal: AbortSignal): Promise<readonly string[]> {
    const resolved = await Promise.all(requested.map(async (command) => {
      const executable = await this.subprocess.resolveExecutable(command, executableLookupEnvironment(), signal)
      if (!isResolvedExecutable(command, executable)) {
        throw new ProcessBoundaryError('process-executable-invalid')
      }
      return executable
    }))
    return Object.freeze(resolved)
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

async function readBoundedArchive(
  runDirectory: string,
  directoryName: string,
  maxBytes: number,
  maxFiles: number,
  validateArchive: ((entries: readonly ArchiveEntry[]) => boolean) | undefined,
): Promise<Uint8Array> {
  const entries = await collectArchiveEntries(join(runDirectory, directoryName), maxBytes, maxFiles)
  if (validateArchive !== undefined && !validateArchive(entries)) {
    throw new ProcessBoundaryError('process-output-invalid')
  }
  const archive = zipStored(entries)
  if (archive.byteLength > maxBytes) {
    throw new ProcessBoundaryError('process-output-too-large')
  }
  return archive
}

async function collectArchiveEntries(rootDirectory: string, maxBytes: number, maxFiles: number): Promise<ArchiveEntry[]> {
  let rootEntry
  try {
    rootEntry = await lstat(rootDirectory)
  } catch (error) {
    if (isMissingPath(error)) {
      throw new ProcessBoundaryError('process-output-missing')
    }
    throw error
  }
  if (!rootEntry.isDirectory() || rootEntry.isSymbolicLink()) {
    throw new ProcessBoundaryError('process-staging-escape')
  }
  const canonicalRoot = await realpath(rootDirectory)
  const entries: ArchiveEntry[] = []
  let totalBytes = 0

  const walk = async (directory: string, prefix: string): Promise<void> => {
    const children = await readdir(directory, { withFileTypes: true })
    children.sort((left, right) => left.name.localeCompare(right.name, 'en'))
    for (const child of children) {
      const relativePath = prefix.length > 0 ? `${prefix}/${child.name}` : child.name
      if (!isSafeArchivePath(relativePath)) {
        throw new ProcessBoundaryError('process-staging-escape')
      }
      const childPath = join(directory, child.name)
      const childStat = await lstat(childPath)
      if (childStat.isSymbolicLink()) {
        throw new ProcessBoundaryError('process-staging-escape')
      }
      if (childStat.isDirectory()) {
        const canonicalChild = await realpath(childPath)
        if (!isStrictDescendant(canonicalRoot, canonicalChild)) {
          throw new ProcessBoundaryError('process-staging-escape')
        }
        await walk(childPath, relativePath)
        continue
      }
      if (!childStat.isFile()) {
        throw new ProcessBoundaryError('process-output-invalid')
      }
      if (entries.length >= maxFiles) {
        throw new ProcessBoundaryError('process-output-too-large')
      }
      const canonicalChild = await realpath(childPath)
      if (!isStrictDescendant(canonicalRoot, canonicalChild)) {
        throw new ProcessBoundaryError('process-staging-escape')
      }
      totalBytes += childStat.size
      if (totalBytes > maxBytes) {
        throw new ProcessBoundaryError('process-output-too-large')
      }
      entries.push({ path: relativePath, bytes: Uint8Array.from(await readFile(canonicalChild)) })
    }
  }

  await walk(canonicalRoot, '')
  return entries.sort((left, right) => left.path.localeCompare(right.path, 'en'))
}

function zipStored(entries: readonly ArchiveEntry[]): Uint8Array {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.path, 'utf8')
    const bytes = Buffer.from(entry.bytes)
    const checksum = crc32(bytes)
    const local = Buffer.alloc(30 + name.byteLength + bytes.byteLength)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0, 12)
    local.writeUInt32LE(checksum, 14)
    local.writeUInt32LE(bytes.byteLength, 18)
    local.writeUInt32LE(bytes.byteLength, 22)
    local.writeUInt16LE(name.byteLength, 26)
    local.writeUInt16LE(0, 28)
    name.copy(local, 30)
    bytes.copy(local, 30 + name.byteLength)
    localParts.push(local)

    const central = Buffer.alloc(46 + name.byteLength)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(0, 14)
    central.writeUInt32LE(checksum, 16)
    central.writeUInt32LE(bytes.byteLength, 20)
    central.writeUInt32LE(bytes.byteLength, 24)
    central.writeUInt16LE(name.byteLength, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(offset, 42)
    name.copy(central, 46)
    centralParts.push(central)
    offset += local.byteLength
  }

  const centralDirectory = Buffer.concat(centralParts)
  const localDirectory = Buffer.concat(localParts)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralDirectory.byteLength, 12)
  end.writeUInt32LE(localDirectory.byteLength, 16)
  end.writeUInt16LE(0, 20)
  return Uint8Array.from(Buffer.concat([localDirectory, centralDirectory, end]))
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function isSafeArchivePath(path: string): boolean {
  return path.length > 0 && !path.includes('\\') && !path.includes('\0')
    && path.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
}

function isSlidevHtmlArchive(entries: readonly ArchiveEntry[]): boolean {
  const index = entries.find((entry) => entry.path === 'index-standalone.html')
    ?? entries.find((entry) => entry.path === 'index.html')
  if (index === undefined) {
    return false
  }
  try {
    const html = new TextDecoder('utf-8', { fatal: true }).decode(index.bytes)
    return /<html\b|<!doctype\s+html/iu.test(html)
  } catch {
    return false
  }
}

function isSlidevPngArchive(entries: readonly ArchiveEntry[]): boolean {
  const pngs = entries.filter((entry) => entry.path.toLowerCase().endsWith('.png'))
  return pngs.length > 0 && pngs.every((entry) => isPng(entry.bytes))
}

function compareNumericFrameNames(left: ArchiveEntry, right: ArchiveEntry): number {
  const leftGroups = numericGroups(left.path)
  const rightGroups = numericGroups(right.path)
  const length = Math.max(leftGroups.length, rightGroups.length)
  for (let index = 0; index < length; index++) {
    const difference = (leftGroups[index] ?? Number.NEGATIVE_INFINITY) - (rightGroups[index] ?? Number.NEGATIVE_INFINITY)
    if (difference !== 0) {
      return difference
    }
  }
  return left.path.localeCompare(right.path, 'en')
}

function numericGroups(path: string): number[] {
  return path.replace(/\.png$/iu, '').split(/[^0-9]+/u).filter(Boolean).map((part) => Number.parseInt(part, 10))
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

function validateLimits(candidate: AllowlistedProcessLimits): ResolvedProcessLimits {
  const resolved: ResolvedProcessLimits = {
    timeoutMs: candidate.timeoutMs,
    svgOutputBytes: candidate.svgOutputBytes,
    pdfOutputBytes: candidate.pdfOutputBytes,
    pngOutputBytes: candidate.pngOutputBytes,
    archiveOutputBytes: candidate.archiveOutputBytes ?? (defaultLimits.archiveOutputBytes as number),
    pptxOutputBytes: candidate.pptxOutputBytes ?? (defaultLimits.pptxOutputBytes as number),
    mp4OutputBytes: candidate.mp4OutputBytes ?? (defaultLimits.mp4OutputBytes as number),
    archiveFileCount: candidate.archiveFileCount ?? (defaultLimits.archiveFileCount as number),
  }
  for (const [name, value] of Object.entries(resolved)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RangeError(`Allowlisted process limit ${name} must be a positive safe integer.`)
    }
  }
  return Object.freeze(resolved)
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

function fingerprintExecutable(profile: Pick<CommandProfile, 'id' | 'version'>, executables: readonly string[]): string {
  return sha256(Buffer.from(`${profile.id}@${profile.version}\0${executables.join('\0')}`, 'utf8'))
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

function isPptx(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
}

function isMp4(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 8
    && bytes[4] === 0x66
    && bytes[5] === 0x74
    && bytes[6] === 0x79
    && bytes[7] === 0x70
}

function validateSlidevPngOptions(options: { readonly withClicks: boolean; readonly imageScale: number }): void {
  if (typeof options.withClicks !== 'boolean' || !Number.isFinite(options.imageScale) || options.imageScale < 1 || options.imageScale > 8) {
    throw new RangeError('Slidev PNG options must use a boolean withClicks and an imageScale between 1 and 8.')
  }
}

function validateMp4Options(options: { readonly fps: number; readonly crf: number }): void {
  if (!Number.isFinite(options.fps) || options.fps <= 0 || options.fps > 60 || !Number.isInteger(options.crf) || options.crf < 0 || options.crf > 51) {
    throw new RangeError('Slidev MP4 options require fps in (0, 60] and integer crf in [0, 51].')
  }
}

function isMissingPath(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
