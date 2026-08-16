import { createHash } from 'node:crypto'

import {
  createContentSha256,
  createWorkspaceMutationPlan,
  type ContentSha256,
  type WorkspaceMutationPlan,
} from '@notemd-harness/mutation'
import type { NotemdVault, Revision, VaultDocument } from '@notemd-harness/vault'

import type {
  ArtifactDerivativePayload,
  DiagramArtifactRenderer,
  DiagramSpecFor,
  ReadyArtifactPayload,
  SvgArtifactRenderers,
} from './artifact-renderer.js'
import {
  validateDiagramSpec,
  type DiagramSpec,
  type SvgCanonicalTarget,
} from './diagram-spec.js'
import { sanitizeSvg } from './svg-sanitizer.js'

export type ArtifactEntryRole = 'source' | 'preview' | 'export'
export type ArtifactEntryStatus = 'ready' | 'unavailable' | 'failed'

interface ArtifactManifestEntryBase {
  readonly id: string
  readonly role: ArtifactEntryRole
  readonly status: ArtifactEntryStatus
  readonly parentArtifactId: string | null
  readonly mediaType: string
  readonly rendererFingerprint: ContentSha256
  readonly themeFingerprint: ContentSha256
  readonly fontFingerprint: ContentSha256
}

export interface ReadyArtifactManifestEntry extends ArtifactManifestEntryBase {
  readonly status: 'ready'
  readonly path: string
  readonly contentSha256: ContentSha256
}

export interface UnavailableArtifactManifestEntry extends ArtifactManifestEntryBase {
  readonly status: 'unavailable'
  readonly reason: string
}

export interface FailedArtifactManifestEntry extends ArtifactManifestEntryBase {
  readonly status: 'failed'
  readonly code: string
}

export type ArtifactManifestEntry = ReadyArtifactManifestEntry | UnavailableArtifactManifestEntry | FailedArtifactManifestEntry

export interface ArtifactManifest {
  readonly version: 2
  readonly artifactId: string
  readonly canonicalTarget: SvgCanonicalTarget
  readonly sourcePath: string
  readonly sourceRevision: Revision
  readonly entries: readonly ArtifactManifestEntry[]
  readonly ownedPaths: readonly string[]
}

export interface ArtifactCapability {
  readonly capability: 'diagram-rendering' | 'document-export'
  readonly status: 'available' | 'unavailable'
  readonly reason?: string
}

export class ArtifactManifestError extends Error {
  readonly code = 'ARTIFACT_MANIFEST_INVALID'

  constructor(message: string) {
    super(message)
    this.name = 'ArtifactManifestError'
  }
}

export interface NotemdArtifacts {
  planMermaidArtifact(spec: DiagramSpecFor<'mermaid'>, source: VaultDocument): WorkspaceMutationPlan
  planVegaLiteArtifact(spec: DiagramSpecFor<'vega-lite'>, source: VaultDocument): WorkspaceMutationPlan
  planJsonCanvasArtifact(spec: DiagramSpecFor<'json-canvas'>, source: VaultDocument): WorkspaceMutationPlan
  planHtmlArtifact(spec: DiagramSpecFor<'html'>, source: VaultDocument): WorkspaceMutationPlan
  planEditableSvgArtifact(spec: DiagramSpecFor<'editable-svg'>, source: VaultDocument): WorkspaceMutationPlan
  planCleanup(artifactId: string): Promise<readonly string[]>
  mermaidRenderingCapability(): ArtifactCapability
  vegaLiteRenderingCapability(): ArtifactCapability
  jsonCanvasRenderingCapability(): ArtifactCapability
  htmlRenderingCapability(): ArtifactCapability
  editableSvgRenderingCapability(): ArtifactCapability
  documentExportCapability(): ArtifactCapability
}

export class ArtifactPlanner implements NotemdArtifacts {
  constructor(
    private readonly vault: NotemdVault,
    private readonly renderers: SvgArtifactRenderers,
  ) {}

  planMermaidArtifact(spec: DiagramSpecFor<'mermaid'>, source: VaultDocument): WorkspaceMutationPlan {
    return this.planArtifact<'mermaid'>(spec, source, this.renderers.mermaid)
  }

  planVegaLiteArtifact(spec: DiagramSpecFor<'vega-lite'>, source: VaultDocument): WorkspaceMutationPlan {
    return this.planArtifact<'vega-lite'>(spec, source, this.renderers.vegaLite)
  }

  planJsonCanvasArtifact(spec: DiagramSpecFor<'json-canvas'>, source: VaultDocument): WorkspaceMutationPlan {
    return this.planArtifact<'json-canvas'>(spec, source, this.renderers.jsonCanvas)
  }

  planHtmlArtifact(spec: DiagramSpecFor<'html'>, source: VaultDocument): WorkspaceMutationPlan {
    return this.planArtifact<'html'>(spec, source, this.renderers.html)
  }

  planEditableSvgArtifact(spec: DiagramSpecFor<'editable-svg'>, source: VaultDocument): WorkspaceMutationPlan {
    return this.planArtifact<'editable-svg'>(spec, source, this.renderers.editableSvg)
  }

  async planCleanup(artifactId: string): Promise<readonly string[]> {
    if (!/^notemd-artifact-[a-f0-9]{20}$/u.test(artifactId)) {
      return []
    }
    try {
      const manifestDocument = await this.vault.read(`.notemd/artifacts/${artifactId}/manifest.json`)
      return parseManifestOwnedPaths(manifestDocument.content, artifactId)
    } catch (error) {
      if (isMissingVaultDocument(error)) {
        return []
      }
      throw error
    }
  }

  mermaidRenderingCapability(): ArtifactCapability {
    return renderingCapability(this.renderers.mermaid)
  }

  vegaLiteRenderingCapability(): ArtifactCapability {
    return renderingCapability(this.renderers.vegaLite)
  }

  jsonCanvasRenderingCapability(): ArtifactCapability {
    return renderingCapability(this.renderers.jsonCanvas)
  }

  htmlRenderingCapability(): ArtifactCapability {
    return renderingCapability(this.renderers.html)
  }

  editableSvgRenderingCapability(): ArtifactCapability {
    return renderingCapability(this.renderers.editableSvg)
  }

  documentExportCapability(): ArtifactCapability {
    return {
      capability: 'document-export',
      status: 'unavailable',
      reason: 'Slidev and media export providers are not installed.',
    }
  }

  private planArtifact<Target extends SvgCanonicalTarget>(
    specInput: DiagramSpecFor<Target>,
    source: VaultDocument,
    renderer: DiagramArtifactRenderer<Target>,
  ): WorkspaceMutationPlan {
    const spec = validateDiagramSpec(specInput)
    assertSpecMatchesSource(spec, source)
    if (spec.canonicalTarget !== renderer.target) {
      throw new ArtifactManifestError(`The ${renderer.target} renderer cannot plan a ${spec.canonicalTarget} source artifact.`)
    }

    const artifactId = artifactIdFor(spec)
    const directory = `.notemd/artifacts/${artifactId}`
    const rendered = renderer.render(spec as DiagramSpecFor<Target>)
    const fingerprints = {
      rendererFingerprint: createContentSha256(`${renderer.fingerprint.id}@${renderer.fingerprint.version}`),
      themeFingerprint: createContentSha256(spec.rendererIntent.theme),
      fontFingerprint: createContentSha256(spec.rendererIntent.fontFamily),
    }
    const entries = Object.freeze([
      readyEntry('source', rendered.source, artifactId, directory, null, fingerprints),
      derivativeEntry('preview', rendered.preview, artifactId, directory, fingerprints),
      derivativeEntry('export', rendered.export, artifactId, directory, fingerprints),
    ])
    const ownedPaths = Object.freeze(entries
      .flatMap((entry) => entry.status === 'ready' ? [entry.path] : [])
      .sort())
    const manifest: ArtifactManifest = Object.freeze({
      version: 2,
      artifactId,
      canonicalTarget: spec.canonicalTarget,
      sourcePath: source.path,
      sourceRevision: source.revision,
      entries,
      ownedPaths,
    })
    const provenance = {
      operationId: `artifact.plan.${spec.canonicalTarget}`,
      sourceRefs: [source.path],
      evidenceRefs: spec.evidenceRefs,
    }
    const contentByPath = new Map<string, { readonly content: string; readonly mediaType: string }>()
    for (const entry of entries) {
      if (entry.status !== 'ready') {
        continue
      }
      const content = contentForEntry(entry, rendered)
      contentByPath.set(entry.path, { content, mediaType: entry.mediaType })
    }
    const manifestPath = `${directory}/manifest.json`
    const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`
    contentByPath.set(manifestPath, { content: manifestContent, mediaType: 'application/json' })

    return createWorkspaceMutationPlan({
      provenance,
      mutations: [...contentByPath.entries()].map(([destination, payload]) => textMutation(
        destination,
        payload.content,
        payload.mediaType,
        provenance,
      )),
    })
  }
}

function renderingCapability<Target extends SvgCanonicalTarget>(renderer: DiagramArtifactRenderer<Target>): ArtifactCapability {
  return {
    capability: 'diagram-rendering',
    status: 'available',
    reason: `${renderer.target} uses ${renderer.fingerprint.id}@${renderer.fingerprint.version}.`,
  }
}

function readyEntry(
  role: 'source',
  payload: ReadyArtifactPayload,
  artifactId: string,
  directory: string,
  parentArtifactId: null,
  fingerprints: ArtifactFingerprints,
): ReadyArtifactManifestEntry {
  const content = normalizedContent(payload)
  return Object.freeze({
    id: `${artifactId}:${role}`,
    role,
    status: 'ready',
    parentArtifactId,
    mediaType: payload.mediaType,
    path: `${directory}/${validatedFilename(payload.filename)}`,
    contentSha256: createContentSha256(content),
    ...fingerprints,
  })
}

function derivativeEntry(
  role: 'preview' | 'export',
  payload: ArtifactDerivativePayload,
  artifactId: string,
  directory: string,
  fingerprints: ArtifactFingerprints,
): ArtifactManifestEntry {
  if ('status' in payload) {
    if (payload.status === 'unavailable') {
      return Object.freeze({
        id: `${artifactId}:${role}`,
        role,
        status: 'unavailable',
        parentArtifactId: artifactId,
        mediaType: payload.mediaType,
        reason: payload.reason,
        ...fingerprints,
      })
    }
    return Object.freeze({
      id: `${artifactId}:${role}`,
      role,
      status: 'failed',
      parentArtifactId: artifactId,
      mediaType: payload.mediaType,
      code: payload.code,
      ...fingerprints,
    })
  }
  const content = normalizedContent(payload)
  return Object.freeze({
    id: `${artifactId}:${role}`,
    role,
    status: 'ready',
    parentArtifactId: artifactId,
    mediaType: payload.mediaType,
    path: `${directory}/${validatedFilename(payload.filename)}`,
    contentSha256: createContentSha256(content),
    ...fingerprints,
  })
}

interface ArtifactFingerprints {
  readonly rendererFingerprint: ContentSha256
  readonly themeFingerprint: ContentSha256
  readonly fontFingerprint: ContentSha256
}

function contentForEntry(
  entry: ReadyArtifactManifestEntry,
  rendered: { readonly source: ReadyArtifactPayload; readonly preview: ArtifactDerivativePayload; readonly export: ArtifactDerivativePayload },
): string {
  const payload = entry.role === 'source'
    ? rendered.source
    : entry.role === 'preview'
      ? rendered.preview
      : rendered.export
  if ('status' in payload) {
    throw new ArtifactManifestError(`Artifact entry ${entry.id} has no ready payload.`)
  }
  const content = normalizedContent(payload)
  if (createContentSha256(content) !== entry.contentSha256) {
    throw new ArtifactManifestError(`Artifact entry content hash changed while planning: ${entry.id}`)
  }
  return content
}

function normalizedContent(payload: ReadyArtifactPayload): string {
  validateMediaType(payload.mediaType)
  if (typeof payload.content !== 'string') {
    throw new ArtifactManifestError('Artifact renderer payload content must be text.')
  }
  return payload.mediaType === 'image/svg+xml' ? sanitizeSvg(payload.content) : payload.content
}

function validatedFilename(filename: string): string {
  if (typeof filename !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(filename)) {
    throw new ArtifactManifestError('Artifact renderer filenames must be simple relative file names.')
  }
  return filename
}

function validateMediaType(mediaType: string): void {
  if (typeof mediaType !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9.+-]*\/[A-Za-z0-9][A-Za-z0-9.+-]*$/u.test(mediaType)) {
    throw new ArtifactManifestError('Artifact renderer media types must be canonical MIME types.')
  }
}

function textMutation(
  destination: string,
  content: string,
  mediaType: string,
  provenance: { readonly operationId: string; readonly sourceRefs: readonly string[]; readonly evidenceRefs: readonly string[] },
) {
  return {
    kind: 'write-text' as const,
    destination,
    expectedRevision: 'absent' as const,
    provenance,
    conflictPolicy: 'reject' as const,
    mediaType,
    content,
    contentSha256: createContentSha256(content),
  }
}

function artifactIdFor(spec: DiagramSpec): string {
  const digest = createHash('sha256').update(canonicalJson(spec), 'utf8').digest('hex')
  return `notemd-artifact-${digest.slice(0, 20)}`
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
  throw new ArtifactManifestError('Artifact identity cannot contain unsupported values.')
}

function assertSpecMatchesSource(spec: DiagramSpec, source: VaultDocument): void {
  if (spec.source.path !== source.path || spec.source.revision !== source.revision) {
    throw new ArtifactManifestError('DiagramSpec source path and revision must match the source document.')
  }
}

function parseManifestOwnedPaths(content: string, expectedArtifactId: string): readonly string[] {
  let value: unknown
  try {
    value = JSON.parse(content)
  } catch {
    throw new ArtifactManifestError('Artifact manifest is not valid JSON.')
  }
  if (!isRecord(value) || value.artifactId !== expectedArtifactId || !Array.isArray(value.ownedPaths)) {
    throw new ArtifactManifestError('Artifact manifest has an invalid shape.')
  }
  if (value.version !== 1 && value.version !== 2) {
    throw new ArtifactManifestError('Artifact manifest has an unsupported version.')
  }
  if (value.ownedPaths.some((path) => typeof path !== 'string' || !isArtifactOwnedPath(path, expectedArtifactId))) {
    throw new ArtifactManifestError('Artifact manifest attempts to own a path outside its directory.')
  }
  return Object.freeze([...new Set(value.ownedPaths)].sort())
}

function isArtifactOwnedPath(path: string, artifactId: string): boolean {
  const prefix = `.notemd/artifacts/${artifactId}/`
  if (!path.startsWith(prefix) || path.includes('\\') || path.includes('\0')) {
    return false
  }
  const relativePath = path.slice(prefix.length)
  return relativePath.length > 0 && relativePath.split('/').every(
    (segment) => segment.length > 0 && segment !== '.' && segment !== '..',
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isMissingVaultDocument(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'VAULT_NOT_FOUND'
}
