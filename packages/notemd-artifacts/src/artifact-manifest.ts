import { createHash } from 'node:crypto'

import { createContentSha256, createWorkspaceMutationPlan, type WorkspaceMutationPlan } from '@notemd-harness/mutation'
import type { NotemdVault, Revision, VaultDocument } from '@notemd-harness/vault'

import { validateDiagramSpec, type DiagramSpec } from './diagram-spec.js'

export interface ArtifactManifest {
  version: 1
  artifactId: string
  sourcePath: string
  sourceRevision: Revision
  renderer: 'source'
  ownedPaths: readonly string[]
}

export interface ArtifactCapability {
  capability: 'diagram-rendering' | 'document-export'
  status: 'unavailable'
  reason: string
}

export class ArtifactManifestError extends Error {
  readonly code = 'ARTIFACT_MANIFEST_INVALID'

  constructor(message: string) {
    super(message)
    this.name = 'ArtifactManifestError'
  }
}

export interface NotemdArtifacts {
  planDiagram(spec: DiagramSpec, source: VaultDocument): WorkspaceMutationPlan
  planCleanup(artifactId: string): Promise<readonly string[]>
  diagramRenderingCapability(): ArtifactCapability
  documentExportCapability(): ArtifactCapability
}

export class SourceArtifactPlanner implements NotemdArtifacts {
  constructor(private readonly vault: NotemdVault) {}

  planDiagram(specInput: DiagramSpec, source: VaultDocument): WorkspaceMutationPlan {
    const spec = validateDiagramSpec(specInput)
    const artifactId = artifactIdFor(spec, source)
    const directory = `.notemd/artifacts/${artifactId}`
    const diagramPath = `${directory}/diagram.json`
    const readmePath = `${directory}/README.md`
    const manifestPath = `${directory}/manifest.json`
    const manifest: ArtifactManifest = {
      version: 1,
      artifactId,
      sourcePath: source.path,
      sourceRevision: source.revision,
      renderer: 'source',
      ownedPaths: [diagramPath, readmePath],
    }

    const provenance = {
      operationId: 'diagram.generate',
      sourceRefs: [source.path],
      evidenceRefs: [],
    }
    return createWorkspaceMutationPlan({
      provenance,
      mutations: [
        textMutation(diagramPath, `${JSON.stringify(spec, null, 2)}\n`, provenance),
        textMutation(readmePath, `# ${spec.title}\n\nRenderer: source\n\nSource: ${source.path}\n`, provenance),
        textMutation(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, provenance),
      ],
    })
  }

  async planCleanup(artifactId: string): Promise<readonly string[]> {
    if (!/^notemd-artifact-[a-f0-9]{20}$/u.test(artifactId)) {
      return []
    }

    try {
      const manifestDocument = await this.vault.read(`.notemd/artifacts/${artifactId}/manifest.json`)
      return parseManifest(manifestDocument.content, artifactId).ownedPaths
    } catch (error) {
      if (isMissingVaultDocument(error)) {
        return []
      }
      throw error
    }
  }

  diagramRenderingCapability(): ArtifactCapability {
    return {
      capability: 'diagram-rendering',
      status: 'unavailable',
      reason: 'No portable diagram renderer is configured.',
    }
  }

  documentExportCapability(): ArtifactCapability {
    return {
      capability: 'document-export',
      status: 'unavailable',
      reason: 'No portable document export provider is configured.',
    }
  }
}

function textMutation(
  destination: string,
  content: string,
  provenance: { readonly operationId: string; readonly sourceRefs: readonly string[]; readonly evidenceRefs: readonly string[] },
) {
  return {
    kind: 'write-text' as const,
    destination,
    expectedRevision: 'absent' as const,
    provenance,
    conflictPolicy: 'reject' as const,
    mediaType: 'text/plain',
    content,
    contentSha256: createContentSha256(content),
  }
}

function artifactIdFor(spec: DiagramSpec, source: VaultDocument): string {
  const digest = createHash('sha256')
    .update(JSON.stringify({ sourcePath: source.path, sourceRevision: source.revision, spec }), 'utf8')
    .digest('hex')
  return `notemd-artifact-${digest.slice(0, 20)}`
}

function parseManifest(content: string, expectedArtifactId: string): ArtifactManifest {
  let value: unknown
  try {
    value = JSON.parse(content)
  } catch {
    throw new ArtifactManifestError('Artifact manifest is not valid JSON.')
  }

  if (
    !isObject(value) ||
    value.version !== 1 ||
    value.artifactId !== expectedArtifactId ||
    typeof value.sourcePath !== 'string' ||
    typeof value.sourceRevision !== 'string' ||
    value.renderer !== 'source' ||
    !Array.isArray(value.ownedPaths) ||
    value.ownedPaths.some((path) => typeof path !== 'string')
  ) {
    throw new ArtifactManifestError('Artifact manifest has an invalid shape.')
  }

  if (value.ownedPaths.some((path) => !isArtifactOwnedPath(path, expectedArtifactId))) {
    throw new ArtifactManifestError('Artifact manifest attempts to own a path outside its directory.')
  }

  return {
    version: 1,
    artifactId: expectedArtifactId,
    sourcePath: value.sourcePath,
    sourceRevision: value.sourceRevision,
    renderer: 'source',
    ownedPaths: [...value.ownedPaths],
  }
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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isMissingVaultDocument(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'VAULT_NOT_FOUND'
}
