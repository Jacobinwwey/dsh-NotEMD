import { createHash } from 'node:crypto'

import type {
  ArtifactCapability,
  ArtifactRendererFingerprint,
  PreparedDocumentArtifactRenderOutput,
  SlidevHtmlExportSpec,
  SlidevPdfExportSpec,
  SlidevPngExportSpec,
  SlidevSourceSpec,
} from '@notemd-harness/artifacts'
import {
  NOTEMD_SLIDEV_FORK,
  type ProcessArtifactExecution,
  type ProcessExecutableCapability,
} from '@notemd-harness/process'
import type { StagedAssetStore } from '@notemd-harness/vault-local'
import type { VaultDocument } from '@notemd-harness/vault'

import { prepareSlidevArtifacts, type PreparedSlidevArtifacts } from './slidev-source.js'

export interface SlidevHtmlProcess {
  renderSlidevHtml(source: string, signal?: AbortSignal): Promise<ProcessArtifactExecution>
  slidevHtmlCapability(signal?: AbortSignal): Promise<ProcessExecutableCapability>
}

export interface SlidevPdfProcess {
  renderSlidevPdf(source: string, signal?: AbortSignal): Promise<ProcessArtifactExecution>
  slidevPdfCapability(signal?: AbortSignal): Promise<ProcessExecutableCapability>
}

export interface SlidevPngProcess {
  renderSlidevPng(
    source: string,
    options: { readonly withClicks: boolean; readonly imageScale: number },
    signal?: AbortSignal,
  ): Promise<ProcessArtifactExecution>
  slidevPngCapability(signal?: AbortSignal): Promise<ProcessExecutableCapability>
}

export const SLIDEV_FORK_FINGERPRINT: ArtifactRendererFingerprint = Object.freeze({
  id: `slidev-fork:${NOTEMD_SLIDEV_FORK.origin}`,
  version: NOTEMD_SLIDEV_FORK.revision,
})

export class SlidevSourceArtifactRenderer {
  readonly format = 'source' as const
  readonly fingerprint = SLIDEV_FORK_FINGERPRINT

  async render(spec: SlidevSourceSpec, source: VaultDocument): Promise<PreparedDocumentArtifactRenderOutput> {
    const prepared = prepareSlidevArtifacts(spec, source)
    return preparedDocumentOutput(prepared, {
      status: 'unavailable',
      mediaType: 'text/markdown',
      reason: 'A canonical Slidev source has no derived export.',
      fingerprint: this.fingerprint,
    })
  }

  async capability(): Promise<ArtifactCapability> {
    return {
      capability: 'document-export',
      status: 'available',
      reason: `Slidev source preparation is deterministic; fork ${NOTEMD_SLIDEV_FORK.origin}@${NOTEMD_SLIDEV_FORK.revision}.`,
    }
  }
}

export class SlidevHtmlArtifactRenderer {
  readonly format = 'html' as const
  readonly fingerprint = SLIDEV_FORK_FINGERPRINT

  constructor(
    private readonly process: SlidevHtmlProcess,
    private readonly stagedAssets: StagedAssetStore,
  ) {}

  async render(spec: SlidevHtmlExportSpec, source: VaultDocument, signal?: AbortSignal): Promise<PreparedDocumentArtifactRenderOutput> {
    const prepared = prepareSlidevArtifacts(spec, source)
    const execution = await this.process.renderSlidevHtml(prepared.source.content, signal)
    const derivative = await stageProcessDerivative(execution, this.stagedAssets, 'slides.html.zip', 'application/zip', this.fingerprint, 'HTML')
    return preparedDocumentOutput(prepared, derivative)
  }

  async capability(signal?: AbortSignal): Promise<ArtifactCapability> {
    return processCapability(await this.process.slidevHtmlCapability(signal), 'HTML')
  }
}

export class SlidevPdfArtifactRenderer {
  readonly format = 'pdf' as const
  readonly fingerprint = SLIDEV_FORK_FINGERPRINT

  constructor(
    private readonly process: SlidevPdfProcess,
    private readonly stagedAssets: StagedAssetStore,
  ) {}

  async render(spec: SlidevPdfExportSpec, source: VaultDocument, signal?: AbortSignal): Promise<PreparedDocumentArtifactRenderOutput> {
    const prepared = prepareSlidevArtifacts(spec, source)
    const execution = await this.process.renderSlidevPdf(prepared.source.content, signal)
    const derivative = await stageProcessDerivative(execution, this.stagedAssets, 'slides.pdf', 'application/pdf', this.fingerprint, 'PDF')
    return preparedDocumentOutput(prepared, derivative)
  }

  async capability(signal?: AbortSignal): Promise<ArtifactCapability> {
    return processCapability(await this.process.slidevPdfCapability(signal), 'PDF')
  }
}

export class SlidevPngArtifactRenderer {
  readonly format = 'png' as const
  readonly fingerprint = SLIDEV_FORK_FINGERPRINT

  constructor(
    private readonly process: SlidevPngProcess,
    private readonly stagedAssets: StagedAssetStore,
  ) {}

  async render(spec: SlidevPngExportSpec, source: VaultDocument, signal?: AbortSignal): Promise<PreparedDocumentArtifactRenderOutput> {
    const prepared = prepareSlidevArtifacts(spec, source)
    const execution = await this.process.renderSlidevPng(
      prepared.source.content,
      { withClicks: spec.withClicks, imageScale: spec.imageScale },
      signal,
    )
    const derivative = await stageProcessDerivative(execution, this.stagedAssets, 'slides.png.zip', 'application/zip', this.fingerprint, 'PNG')
    return preparedDocumentOutput(prepared, derivative)
  }

  async capability(signal?: AbortSignal): Promise<ArtifactCapability> {
    return processCapability(await this.process.slidevPngCapability(signal), 'PNG')
  }
}

export function preparedDocumentOutput(
  prepared: PreparedSlidevArtifacts,
  derivative: PreparedDocumentArtifactRenderOutput['export'],
): PreparedDocumentArtifactRenderOutput {
  return Object.freeze({
    source: Object.freeze({ ...prepared.source, fingerprint: SLIDEV_FORK_FINGERPRINT }),
    report: Object.freeze({ ...prepared.report, fingerprint: SLIDEV_FORK_FINGERPRINT }),
    export: derivative,
  })
}

export async function stageProcessDerivative(
  execution: ProcessArtifactExecution,
  stagedAssets: StagedAssetStore,
  filename: string,
  mediaType: string,
  fingerprint: ArtifactRendererFingerprint,
  label: string,
): Promise<PreparedDocumentArtifactRenderOutput['export']> {
  if (execution.status === 'unavailable') {
    return Object.freeze({ status: 'unavailable', mediaType, reason: `${label} export unavailable: ${execution.code}.`, fingerprint })
  }
  if (execution.status === 'cancelled') {
    throw abortError(execution.code, `${label} export cancelled.`)
  }
  if (execution.status === 'failed') {
    return Object.freeze({ status: 'failed', mediaType, code: execution.code, fingerprint })
  }
  if (execution.mediaType !== mediaType || sha256(execution.bytes) !== execution.contentSha256) {
    return Object.freeze({ status: 'failed', mediaType, code: 'process-output-invalid', fingerprint })
  }
  const stagedAsset = await stagedAssets.stageBytes(execution.bytes, mediaType)
  if (stagedAsset.sha256 !== execution.contentSha256 || stagedAsset.byteLength !== execution.bytes.byteLength) {
    return Object.freeze({ status: 'failed', mediaType, code: 'staged-asset-integrity', fingerprint })
  }
  return Object.freeze({ filename, mediaType, stagedAsset, fingerprint })
}

export function processCapability(
  capability: ProcessExecutableCapability,
  label: string,
): ArtifactCapability {
  if (capability.status === 'cancelled') {
    throw abortError(capability.code, `${label} capability probe cancelled.`)
  }
  if (capability.status === 'available') {
    return {
      capability: 'document-export',
      status: 'available',
      reason: `${label} uses ${NOTEMD_SLIDEV_FORK.origin}@${NOTEMD_SLIDEV_FORK.revision} (${capability.executableFingerprint}).`,
    }
  }
  return {
    capability: 'document-export',
    status: 'unavailable',
    reason: `${label} export unavailable: ${capability.code}.`,
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function abortError(code: string, message: string): Error {
  const error = new Error(message)
  error.name = 'AbortError'
  Object.defineProperty(error, 'code', { value: code, enumerable: true })
  return error
}
