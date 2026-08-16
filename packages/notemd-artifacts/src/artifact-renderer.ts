import type { DiagramSpec, SvgCanonicalTarget } from './diagram-spec.js'

export type DiagramSpecFor<Target extends SvgCanonicalTarget> = Extract<
  DiagramSpec,
  { readonly canonicalTarget: Target }
>

export interface ArtifactRendererFingerprint {
  readonly id: string
  readonly version: string
}

export interface ReadyArtifactPayload {
  readonly filename: string
  readonly mediaType: string
  readonly content: string
}

export interface UnavailableArtifactPayload {
  readonly status: 'unavailable'
  readonly mediaType: string
  readonly reason: string
}

export interface FailedArtifactPayload {
  readonly status: 'failed'
  readonly mediaType: string
  readonly code: string
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

export interface SvgArtifactRenderers {
  readonly mermaid: DiagramArtifactRenderer<'mermaid'>
  readonly vegaLite: DiagramArtifactRenderer<'vega-lite'>
  readonly jsonCanvas: DiagramArtifactRenderer<'json-canvas'>
  readonly html: DiagramArtifactRenderer<'html'>
  readonly editableSvg: DiagramArtifactRenderer<'editable-svg'>
}
