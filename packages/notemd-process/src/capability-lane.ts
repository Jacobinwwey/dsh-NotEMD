import { createHash } from 'node:crypto'

import {
  NOTEMD_SLIDEV_FORK,
  type AllowlistedProcessBoundary,
  type ProcessArtifactExecution,
  type ProcessExecutableCapability,
} from './allowlisted-process.js'

export type OptionalRuntimeBoundary = Pick<AllowlistedProcessBoundary,
  | 'drawioSvgCapability'
  | 'drawnixSvgCapability'
  | 'circuitikzPdfCapability'
  | 'pdfToSvgCapability'
  | 'pdfToPngCapability'
  | 'slidevHtmlCapability'
  | 'slidevPdfCapability'
  | 'slidevPngCapability'
  | 'slidevPptxCapability'
  | 'slidevMp4Capability'
  | 'renderDrawioSvg'
  | 'renderDrawnixSvg'
  | 'compileCircuitikzPdf'
  | 'convertPdfToSvg'
  | 'convertPdfToPng'
  | 'renderSlidevHtml'
  | 'renderSlidevPdf'
  | 'renderSlidevPng'
  | 'renderSlidevPptx'
  | 'renderSlidevMp4'
>

export interface OptionalRuntimeFixture {
  readonly slidevSource: string
  readonly drawioSource: string
  readonly drawnixSource: string
  readonly circuitikzSource: string
  readonly pdfBytes: Uint8Array
  readonly slidevPngOptions: { readonly withClicks: boolean; readonly imageScale: number }
  readonly slidevMp4Options: { readonly withClicks: boolean; readonly imageScale: number; readonly fps: number; readonly crf: number }
}

export interface OptionalRuntimeCapabilityObservation {
  readonly id: string
  readonly requiredExecutables: readonly string[]
  readonly status: 'ready' | 'unavailable' | 'cancelled' | 'failed'
  readonly mediaType?: string
  readonly contentSha256?: string
  readonly executableFingerprint?: string
  readonly code?: string
}

export interface OptionalRuntimeCapabilityReport {
  readonly schemaVersion: 1
  readonly lane: 'notemd-optional-runtime'
  readonly fixtureSha256: string
  readonly slidevFork: {
    readonly origin: string
    readonly revision: string
    readonly verified: boolean
  }
  readonly observations: readonly OptionalRuntimeCapabilityObservation[]
  readonly staging: {
    readonly clean: boolean
  }
}

export interface OptionalRuntimeCapabilityOptions {
  readonly signal?: AbortSignal
  readonly slidevForkVerified: boolean
}

/**
 * Runs the installed native targets in a stable order. Capability probes gate
 * execution so missing optional tools never become a core-bundle failure.
 */
export async function runOptionalRuntimeCapabilityLane(
  boundary: OptionalRuntimeBoundary,
  fixture: OptionalRuntimeFixture,
  options: OptionalRuntimeCapabilityOptions,
): Promise<OptionalRuntimeCapabilityReport> {
  const observations: OptionalRuntimeCapabilityObservation[] = []

  observations.push(await observeCapability(
    'drawio-svg', ['drawio'], boundary.drawioSvgCapability.bind(boundary), () => boundary.renderDrawioSvg(fixture.drawioSource), options.signal,
  ))
  observations.push(await observeCapability(
    'drawnix-svg', ['notemd-drawnix-render'], boundary.drawnixSvgCapability.bind(boundary), () => boundary.renderDrawnixSvg(fixture.drawnixSource), options.signal,
  ))
  observations.push(await observeCapability(
    'circuitikz-pdf', ['tectonic'], boundary.circuitikzPdfCapability.bind(boundary), () => boundary.compileCircuitikzPdf(fixture.circuitikzSource), options.signal,
  ))
  observations.push(await observeCapability(
    'pdf-to-svg', ['pdftocairo'], boundary.pdfToSvgCapability.bind(boundary), () => boundary.convertPdfToSvg(fixture.pdfBytes), options.signal,
  ))
  observations.push(await observeCapability(
    'pdf-to-png', ['pdftocairo'], boundary.pdfToPngCapability.bind(boundary), () => boundary.convertPdfToPng(fixture.pdfBytes), options.signal,
  ))

  if (options.slidevForkVerified) {
    observations.push(await observeCapability(
      'slidev-html', ['slidev'], boundary.slidevHtmlCapability.bind(boundary), () => boundary.renderSlidevHtml(fixture.slidevSource), options.signal,
    ))
    observations.push(await observeCapability(
      'slidev-pdf', ['slidev', 'playwright'], boundary.slidevPdfCapability.bind(boundary), () => boundary.renderSlidevPdf(fixture.slidevSource), options.signal,
    ))
    observations.push(await observeCapability(
      'slidev-png', ['slidev', 'playwright'], boundary.slidevPngCapability.bind(boundary), () => boundary.renderSlidevPng(fixture.slidevSource, fixture.slidevPngOptions), options.signal,
    ))
    observations.push(await observeCapability(
      'slidev-pptx', ['slidev', 'playwright'], boundary.slidevPptxCapability.bind(boundary), () => boundary.renderSlidevPptx(fixture.slidevSource), options.signal,
    ))
    observations.push(await observeCapability(
      'slidev-mp4', ['slidev', 'playwright', 'ffmpeg'], boundary.slidevMp4Capability.bind(boundary), () => boundary.renderSlidevMp4(fixture.slidevSource, fixture.slidevMp4Options), options.signal,
    ))
  } else {
    for (const [id, requiredExecutables] of [
      ['slidev-html', ['slidev']],
      ['slidev-pdf', ['slidev', 'playwright']],
      ['slidev-png', ['slidev', 'playwright']],
      ['slidev-pptx', ['slidev', 'playwright']],
      ['slidev-mp4', ['slidev', 'playwright', 'ffmpeg']],
    ] as const) {
      observations.push({
        id,
        requiredExecutables,
        status: 'unavailable',
        code: 'slidev-fork-unverified',
      })
    }
  }

  const cancellationController = new AbortController()
  cancellationController.abort(new DOMException('Capability lane cancellation probe.', 'AbortError'))
  observations.push(await observeCapability(
    'cancellation-probe', ['drawio'], boundary.drawioSvgCapability.bind(boundary), undefined, cancellationController.signal,
  ))

  return Object.freeze({
    schemaVersion: 1,
    lane: 'notemd-optional-runtime',
    fixtureSha256: optionalRuntimeFixtureSha256(fixture),
    slidevFork: Object.freeze({
      origin: NOTEMD_SLIDEV_FORK.origin,
      revision: NOTEMD_SLIDEV_FORK.revision,
      verified: options.slidevForkVerified,
    }),
    observations: Object.freeze(observations.map((observation) => Object.freeze(observation))),
    staging: Object.freeze({ clean: false }),
  })
}

export function finalizeOptionalRuntimeCapabilityReport(
  report: OptionalRuntimeCapabilityReport,
  stagingClean: boolean,
): OptionalRuntimeCapabilityReport {
  return Object.freeze({
    ...report,
    staging: Object.freeze({ clean: stagingClean }),
  })
}

function observeCapability(
  id: string,
  requiredExecutables: readonly string[],
  capability: ((signal?: AbortSignal) => Promise<ProcessExecutableCapability>) | undefined,
  execute: (() => Promise<ProcessArtifactExecution>) | undefined,
  signal?: AbortSignal,
): Promise<OptionalRuntimeCapabilityObservation> {
  return (async () => {
    if (capability === undefined) {
      return { id, requiredExecutables, status: 'unavailable', code: 'capability-not-exposed' }
    }
    let probe: ProcessExecutableCapability
    try {
      probe = await capability(signal)
    } catch {
      return { id, requiredExecutables, status: 'failed', code: 'capability-probe-failed' }
    }
    if (probe.status !== 'available') {
      return {
        id,
        requiredExecutables,
        status: probe.status,
        code: probe.status === 'cancelled' ? probe.code : probe.code,
      }
    }
    if (execute === undefined) {
      return { id, requiredExecutables, status: 'ready', executableFingerprint: probe.executableFingerprint }
    }
    let execution: ProcessArtifactExecution
    try {
      execution = await execute()
    } catch {
      return { id, requiredExecutables, status: 'failed', executableFingerprint: probe.executableFingerprint, code: 'capability-execution-threw' }
    }
    if (execution.status === 'ready') {
      return {
        id,
        requiredExecutables,
        status: 'ready',
        mediaType: execution.mediaType,
        contentSha256: execution.contentSha256,
        executableFingerprint: execution.executableFingerprint,
      }
    }
    return {
      id,
      requiredExecutables,
      status: execution.status,
      executableFingerprint: probe.executableFingerprint,
      code: execution.code,
    }
  })()
}

export function optionalRuntimeFixtureSha256(fixture: OptionalRuntimeFixture): string {
  const canonical = JSON.stringify({
    circuitikzSource: fixture.circuitikzSource,
    drawioSource: fixture.drawioSource,
    drawnixSource: fixture.drawnixSource,
    pdfBytes: Buffer.from(fixture.pdfBytes).toString('base64'),
    slidevMp4Options: fixture.slidevMp4Options,
    slidevPngOptions: fixture.slidevPngOptions,
    slidevSource: fixture.slidevSource,
  })
  return createHash('sha256').update(canonical, 'utf8').digest('hex')
}
