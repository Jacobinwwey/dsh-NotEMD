import type { StagedAssetRef } from '@notemd-harness/mutation'

import type { DiagramCanonicalTarget, DiagramSpec, SvgCanonicalTarget } from './diagram-spec.js'

export type DiagramSpecFor<Target extends DiagramCanonicalTarget> = Extract<
  DiagramSpec,
  { readonly canonicalTarget: Target }
>

export interface ArtifactRendererFingerprint {
  readonly id: string
  readonly version: string
}

interface ReadyArtifactPayloadBase {
  readonly filename: string
  readonly mediaType: string
  readonly fingerprint?: ArtifactRendererFingerprint
}

export interface ReadyTextArtifactPayload extends ReadyArtifactPayloadBase {
  readonly content: string
}

export interface ReadyBytesArtifactPayload extends ReadyArtifactPayloadBase {
  readonly stagedAsset: StagedAssetRef
}

export type ReadyArtifactPayload = ReadyTextArtifactPayload | ReadyBytesArtifactPayload

export interface UnavailableArtifactPayload {
  readonly status: 'unavailable'
  readonly mediaType: string
  readonly reason: string
  readonly fingerprint?: ArtifactRendererFingerprint
}

export interface FailedArtifactPayload {
  readonly status: 'failed'
  readonly mediaType: string
  readonly code: string
  readonly fingerprint?: ArtifactRendererFingerprint
}

export type ArtifactDerivativePayload = ReadyArtifactPayload | UnavailableArtifactPayload | FailedArtifactPayload

export interface DiagramArtifactRenderOutput {
  readonly source: ReadyArtifactPayload
  readonly preview: ArtifactDerivativePayload
  readonly export: ArtifactDerivativePayload
}

export interface DiagramArtifactRenderer<Target extends SvgCanonicalTarget = SvgCanonicalTarget> {
  readonly target: Target
  readonly fingerprint: ArtifactRendererFingerprint
  render(spec: DiagramSpecFor<Target>): DiagramArtifactRenderOutput
}

export interface SpecialistArtifactRenderer<Target extends DiagramCanonicalTarget> {
  readonly target: Target
  readonly fingerprint: ArtifactRendererFingerprint
  render(spec: DiagramSpecFor<Target>, signal?: AbortSignal): Promise<DiagramArtifactRenderOutput>
  capability(signal?: AbortSignal): Promise<{
    readonly capability: 'diagram-rendering'
    readonly status: 'available' | 'unavailable'
    readonly reason?: string
  }>
}

export interface SvgArtifactRenderers {
  readonly mermaid: DiagramArtifactRenderer<'mermaid'>
  readonly vegaLite: DiagramArtifactRenderer<'vega-lite'>
  readonly jsonCanvas: DiagramArtifactRenderer<'json-canvas'>
  readonly html: DiagramArtifactRenderer<'html'>
  readonly editableSvg: DiagramArtifactRenderer<'editable-svg'>
}

export interface SpecialistArtifactRenderers {
  readonly drawio: SpecialistArtifactRenderer<'drawio'>
  readonly drawnix: SpecialistArtifactRenderer<'drawnix'>
  readonly circuitikz: SpecialistArtifactRenderer<'circuitikz'>
}
