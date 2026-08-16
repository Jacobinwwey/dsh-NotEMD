import { createHash } from 'node:crypto'

import {
  createContentSha256,
  createWorkspaceMutationPlan,
  type ContentSha256,
  type WorkspaceMutation,
  type WorkspaceMutationPlan,
} from '@notemd-harness/mutation'
import type { VaultDocument } from '@notemd-harness/vault'

import {
  type ArtifactDerivativePayload,
  type ArtifactRendererFingerprint,
  type ReadyArtifactPayload,
} from './artifact-renderer.js'
import { ArtifactManifestError, type ArtifactCapability } from './artifact-manifest.js'

export type DocumentExportFormat = 'source' | 'html' | 'pdf' | 'png' | 'pptx' | 'mp4'

export interface SlidevSourceSpec {
  readonly version: 1
  readonly title: string
  readonly source: { readonly path: string; readonly revision: string }
  readonly theme: string
}

export type SlidevHtmlExportSpec = SlidevSourceSpec
export type SlidevPdfExportSpec = SlidevSourceSpec
export interface SlidevPngExportSpec extends SlidevSourceSpec {
  readonly withClicks: boolean
  readonly imageScale: number
}
export type SlidevPptxExportSpec = SlidevSourceSpec
export interface SlidevMp4ExportSpec extends SlidevSourceSpec {
  readonly withClicks: boolean
  readonly imageScale: number
  readonly fps: number
  readonly crf: number
}

export interface PreparedDocumentArtifactRenderOutput {
  readonly source: ReadyArtifactPayload
  readonly report: ReadyArtifactPayload
  readonly export: ArtifactDerivativePayload
}

export interface DocumentExportRenderer<Spec extends SlidevSourceSpec> {
  readonly format: DocumentExportFormat
  readonly fingerprint: ArtifactRendererFingerprint
  render(spec: Spec, source: VaultDocument, signal?: AbortSignal): Promise<PreparedDocumentArtifactRenderOutput> | PreparedDocumentArtifactRenderOutput
  capability(signal?: AbortSignal): Promise<ArtifactCapability>
}

export interface DocumentExportRenderers {
  readonly source: DocumentExportRenderer<SlidevSourceSpec>
  readonly html: DocumentExportRenderer<SlidevHtmlExportSpec>
  readonly pdf: DocumentExportRenderer<SlidevPdfExportSpec>
  readonly png: DocumentExportRenderer<SlidevPngExportSpec>
  readonly pptx: DocumentExportRenderer<SlidevPptxExportSpec>
  readonly mp4: DocumentExportRenderer<SlidevMp4ExportSpec>
}

/** Named document export planner; each method owns one format contract. */
export class DocumentExportPlanner {
  constructor(private readonly renderers: DocumentExportRenderers) {}

  planSlidevSource(spec: SlidevSourceSpec, source: VaultDocument, signal?: AbortSignal): Promise<WorkspaceMutationPlan> {
    return this.plan(this.renderers.source, spec, source, signal)
  }

  planSlidevHtmlExport(spec: SlidevHtmlExportSpec, source: VaultDocument, signal?: AbortSignal): Promise<WorkspaceMutationPlan> {
    return this.plan(this.renderers.html, spec, source, signal)
  }

  planSlidevPdfExport(spec: SlidevPdfExportSpec, source: VaultDocument, signal?: AbortSignal): Promise<WorkspaceMutationPlan> {
    return this.plan(this.renderers.pdf, spec, source, signal)
  }

  planSlidevPngExport(spec: SlidevPngExportSpec, source: VaultDocument, signal?: AbortSignal): Promise<WorkspaceMutationPlan> {
    return this.plan(this.renderers.png, spec, source, signal)
  }

  planSlidevPptxExport(spec: SlidevPptxExportSpec, source: VaultDocument, signal?: AbortSignal): Promise<WorkspaceMutationPlan> {
    return this.plan(this.renderers.pptx, spec, source, signal)
  }

  planSlidevMp4Export(spec: SlidevMp4ExportSpec, source: VaultDocument, signal?: AbortSignal): Promise<WorkspaceMutationPlan> {
    return this.plan(this.renderers.mp4, spec, source, signal)
  }

  slidevSourceCapability(signal?: AbortSignal): Promise<ArtifactCapability> {
    return this.renderers.source.capability(signal)
  }

  slidevHtmlExportCapability(signal?: AbortSignal): Promise<ArtifactCapability> {
    return this.renderers.html.capability(signal)
  }

  slidevPdfExportCapability(signal?: AbortSignal): Promise<ArtifactCapability> {
    return this.renderers.pdf.capability(signal)
  }

  slidevPngExportCapability(signal?: AbortSignal): Promise<ArtifactCapability> {
    return this.renderers.png.capability(signal)
  }

  slidevPptxExportCapability(signal?: AbortSignal): Promise<ArtifactCapability> {
    return this.renderers.pptx.capability(signal)
  }

  slidevMp4ExportCapability(signal?: AbortSignal): Promise<ArtifactCapability> {
    return this.renderers.mp4.capability(signal)
  }

  private async plan<Spec extends SlidevSourceSpec>(
    renderer: DocumentExportRenderer<Spec>,
    spec: Spec,
    source: VaultDocument,
    signal?: AbortSignal,
  ): Promise<WorkspaceMutationPlan> {
    validateSlidevSourceSpec(spec, source)
    const rendered = await renderer.render(spec, source, signal)
    return compileDocumentExportPlan(spec, source, renderer.format, renderer.fingerprint, rendered)
  }
}

export function compileDocumentExportPlan(
  spec: SlidevSourceSpec,
  source: VaultDocument,
  format: DocumentExportFormat,
  fingerprint: ArtifactRendererFingerprint,
  rendered: PreparedDocumentArtifactRenderOutput,
): WorkspaceMutationPlan {
  validateSlidevSourceSpec(spec, source)
  const artifactId = documentArtifactId(spec, format)
  const directory = `.notemd/artifacts/${artifactId}`
  const fingerprints = {
    rendererFingerprint: createContentSha256(`${fingerprint.id}@${fingerprint.version}`),
    themeFingerprint: createContentSha256(spec.theme),
    fontFingerprint: createContentSha256('slidev-fork-default'),
  }
  const entries = Object.freeze([
    documentReadyEntry('source', rendered.source, artifactId, directory, null, fingerprints),
    documentReadyEntry('report', rendered.report, artifactId, directory, artifactId, fingerprints),
    documentDerivativeEntry('export', rendered.export, artifactId, directory, fingerprints),
  ])
  const manifest = Object.freeze({
    version: 3 as const,
    artifactId,
    canonicalTarget: 'slidev' as const,
    exportFormat: format,
    sourcePath: source.path,
    sourceRevision: source.revision,
    entries,
    ownedPaths: Object.freeze(entries.flatMap((entry) => entry.status === 'ready' ? [entry.path] : []).sort()),
  })
  const provenance = {
    operationId: `artifact.plan.slidev.${format}`,
    sourceRefs: [source.path],
    evidenceRefs: [],
  }
  const mutations: WorkspaceMutation[] = []
  for (const entry of entries) {
    if (entry.status !== 'ready') {
      continue
    }
    const payload = readyDocumentPayload(entry.role, rendered)
    mutations.push(mutationForPayload(entry.path, payload, provenance))
  }
  mutations.push(textMutation(`${directory}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, provenance))
  return createWorkspaceMutationPlan({ provenance, mutations })
}

function readyDocumentPayload(
  role: 'source' | 'report' | 'export',
  rendered: PreparedDocumentArtifactRenderOutput,
): ReadyArtifactPayload {
  if (role === 'source') {
    return rendered.source
  }
  if (role === 'report') {
    return rendered.report
  }
  if ('status' in rendered.export) {
    throw new ArtifactManifestError('A ready document export entry must have a ready payload.')
  }
  return rendered.export
}

function documentReadyEntry(
  role: 'source' | 'report',
  payload: ReadyArtifactPayload,
  artifactId: string,
  directory: string,
  parentArtifactId: string | null,
  fingerprints: ArtifactFingerprints,
) {
  return Object.freeze({
    id: `${artifactId}:${role}`,
    role,
    status: 'ready' as const,
    parentArtifactId,
    mediaType: payload.mediaType,
    path: `${directory}/${validatedFilename(payload.filename)}`,
    contentSha256: artifactPayloadSha256(payload),
    ...payloadFingerprints(payload, fingerprints),
  })
}

function documentDerivativeEntry(
  role: 'export',
  payload: ArtifactDerivativePayload,
  artifactId: string,
  directory: string,
  fingerprints: ArtifactFingerprints,
) {
  if ('status' in payload) {
    return Object.freeze({
      id: `${artifactId}:${role}`,
      role,
      status: payload.status,
      parentArtifactId: artifactId,
      mediaType: payload.mediaType,
      ...(payload.status === 'unavailable' ? { reason: payload.reason } : { code: payload.code }),
      ...fingerprints,
    })
  }
  return Object.freeze({
    id: `${artifactId}:${role}`,
    role,
    status: 'ready' as const,
    parentArtifactId: artifactId,
    mediaType: payload.mediaType,
    path: `${directory}/${validatedFilename(payload.filename)}`,
    contentSha256: artifactPayloadSha256(payload),
    ...payloadFingerprints(payload, fingerprints),
  })
}

interface ArtifactFingerprints {
  readonly rendererFingerprint: ContentSha256
  readonly themeFingerprint: ContentSha256
  readonly fontFingerprint: ContentSha256
}

function artifactPayloadSha256(payload: ReadyArtifactPayload): ContentSha256 {
  if ('stagedAsset' in payload) {
    if (payload.stagedAsset.mediaType !== payload.mediaType) {
      throw new ArtifactManifestError('A staged document export payload must match its declared media type.')
    }
    return payload.stagedAsset.sha256
  }
  if (typeof payload.content !== 'string') {
    throw new ArtifactManifestError('Document export text payload must be a string.')
  }
  return createContentSha256(payload.content)
}

function mutationForPayload(
  destination: string,
  payload: ReadyArtifactPayload,
  provenance: { readonly operationId: string; readonly sourceRefs: readonly string[]; readonly evidenceRefs: readonly string[] },
): WorkspaceMutation {
  if ('stagedAsset' in payload) {
    return {
      kind: 'write-bytes',
      destination,
      expectedRevision: 'absent',
      provenance,
      conflictPolicy: 'reject',
      mediaType: payload.mediaType,
      contentSha256: payload.stagedAsset.sha256,
      stagedAsset: payload.stagedAsset,
    }
  }
  return textMutation(destination, payload.content, provenance, payload.mediaType)
}

function textMutation(
  destination: string,
  content: string,
  provenance: { readonly operationId: string; readonly sourceRefs: readonly string[]; readonly evidenceRefs: readonly string[] },
  mediaType = 'text/plain',
): WorkspaceMutation {
  return {
    kind: 'write-text',
    destination,
    expectedRevision: 'absent',
    provenance,
    conflictPolicy: 'reject',
    mediaType,
    content,
    contentSha256: createContentSha256(content),
  }
}

function payloadFingerprints(payload: ReadyArtifactPayload, defaults: ArtifactFingerprints): ArtifactFingerprints {
  return payload.fingerprint === undefined
    ? defaults
    : { ...defaults, rendererFingerprint: createContentSha256(`${payload.fingerprint.id}@${payload.fingerprint.version}`) }
}

function documentArtifactId(spec: SlidevSourceSpec, format: DocumentExportFormat): string {
  const digest = createHash('sha256').update(canonicalJson({ format, spec }), 'utf8').digest('hex')
  return `notemd-artifact-${digest.slice(0, 20)}`
}

function validateSlidevSourceSpec(spec: SlidevSourceSpec, source: VaultDocument): void {
  if (spec.version !== 1 || typeof spec.title !== 'string' || spec.title.trim().length === 0 || typeof spec.theme !== 'string' || spec.theme.trim().length === 0) {
    throw new ArtifactManifestError('Slidev export specifications require a non-empty title and theme.')
  }
  if (spec.source.path !== source.path || spec.source.revision !== source.revision) {
    throw new ArtifactManifestError('Slidev export source path and revision must match the source document.')
  }
}

function validatedFilename(filename: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(filename)) {
    throw new ArtifactManifestError('Document export filenames must be simple relative file names.')
  }
  return filename
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
  }
  throw new ArtifactManifestError('Document export identity contains unsupported values.')
}
