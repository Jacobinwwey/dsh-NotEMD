export const artifactSchemaFamilies = [
  'diagram-spec',
  'diagram-lineage',
  'document-export',
] as const

export type ArtifactSchemaFamily = (typeof artifactSchemaFamilies)[number]
export type ArtifactSchemaVersion = 2 | 3

export type ArtifactSchemaMetadataPrimitive = string | number | boolean | null
export type ArtifactSchemaMetadataValue = ArtifactSchemaMetadataPrimitive | readonly ArtifactSchemaMetadataValue[] | ArtifactSchemaMetadata
export interface ArtifactSchemaMetadata {
  readonly [key: string]: ArtifactSchemaMetadataValue
}

export type ArtifactSchemaDiagnosticCode =
  | 'invalid-record'
  | 'missing-family'
  | 'unknown-family'
  | 'missing-version'
  | 'unknown-version'
  | 'invalid-combination'
  | 'invalid-metadata'
  | 'family-mismatch'
  | 'version-mismatch'

export interface ArtifactSchemaDiagnostic {
  readonly code: ArtifactSchemaDiagnosticCode
  readonly message: string
  readonly family?: unknown
  readonly version?: unknown
  readonly expectedFamily?: ArtifactSchemaFamily
  readonly expectedVersion?: ArtifactSchemaVersion
}

export interface ArtifactSchemaHeader {
  readonly schemaFamily: ArtifactSchemaFamily
  readonly version: ArtifactSchemaVersion
  readonly metadata?: ArtifactSchemaMetadata
}

export type ArtifactSchemaInspection =
  | { readonly ok: true; readonly header: ArtifactSchemaHeader }
  | { readonly ok: false; readonly diagnostic: ArtifactSchemaDiagnostic }

export interface ArtifactSchemaReference {
  readonly family: ArtifactSchemaFamily
  readonly version: ArtifactSchemaVersion
}

export class ArtifactSchemaError extends Error {
  readonly code = 'ARTIFACT_SCHEMA_INVALID'
  readonly diagnostic: ArtifactSchemaDiagnostic

  constructor(diagnostic: ArtifactSchemaDiagnostic) {
    super(diagnostic.message)
    this.name = 'ArtifactSchemaError'
    this.diagnostic = Object.freeze({ ...diagnostic })
  }
}

const schemaCombinations: readonly ArtifactSchemaReference[] = Object.freeze([
  Object.freeze({ family: 'diagram-spec', version: 2 }),
  Object.freeze({ family: 'diagram-lineage', version: 2 }),
  Object.freeze({ family: 'document-export', version: 3 }),
])

const knownVersions: readonly ArtifactSchemaVersion[] = Object.freeze([2, 3])

/**
 * Validate only the versioned envelope. Payload-specific validators remain the
 * owner of their fields; this registry prevents consumers from mixing families.
 */
export function inspectArtifactSchema(candidate: unknown): ArtifactSchemaInspection {
  if (!isRecord(candidate)) {
    return invalid('invalid-record', 'Artifact schema values must be objects.')
  }

  const family = candidate.schemaFamily
  if (family === undefined) {
    return invalid('missing-family', 'Artifact schema values require schemaFamily.', undefined, candidate.version)
  }
  if (typeof family !== 'string' || !(artifactSchemaFamilies as readonly string[]).includes(family)) {
    return invalid('unknown-family', `Artifact schema family is not registered: ${String(family)}.`, family, candidate.version)
  }

  const version = candidate.version
  if (version === undefined) {
    return invalid('missing-version', `Artifact schema family ${family} requires version.`, family, version)
  }
  if (typeof version !== 'number' || !Number.isInteger(version) || !(knownVersions as readonly number[]).includes(version)) {
    return invalid('unknown-version', `Artifact schema version is not registered: ${String(version)}.`, family, version)
  }

  const combination = schemaCombinations.find((entry) => entry.family === family && entry.version === version)
  if (combination === undefined) {
    return invalid('invalid-combination', `Artifact schema family ${family} does not support version ${version}.`, family, version)
  }

  const metadata = candidate.metadata
  if (metadata !== undefined && !isMetadata(metadata)) {
    return invalid('invalid-metadata', 'Artifact schema metadata must be a JSON object.', family, version)
  }

  return {
    ok: true,
    header: Object.freeze({
      schemaFamily: family as ArtifactSchemaFamily,
      version: version as ArtifactSchemaVersion,
      ...(metadata === undefined ? {} : { metadata: freezeMetadata(metadata as ArtifactSchemaMetadata) }),
    }),
  }
}

export function assertArtifactSchema(
  candidate: unknown,
  expected?: ArtifactSchemaReference,
): ArtifactSchemaHeader {
  const inspection = inspectArtifactSchema(candidate)
  if (!inspection.ok) {
    throw new ArtifactSchemaError(inspection.diagnostic)
  }
  if (expected !== undefined && inspection.header.schemaFamily !== expected.family) {
    throw new ArtifactSchemaError({
      code: 'family-mismatch',
      message: `Artifact schema family ${inspection.header.schemaFamily} does not match expected ${expected.family}.`,
      family: inspection.header.schemaFamily,
      version: inspection.header.version,
      expectedFamily: expected.family,
      expectedVersion: expected.version,
    })
  }
  if (expected !== undefined && inspection.header.version !== expected.version) {
    throw new ArtifactSchemaError({
      code: 'version-mismatch',
      message: `Artifact schema version ${inspection.header.version} does not match expected ${expected.version}.`,
      family: inspection.header.schemaFamily,
      version: inspection.header.version,
      expectedFamily: expected.family,
      expectedVersion: expected.version,
    })
  }
  return inspection.header
}

export const artifactSchemaRegistry = Object.freeze({
  combinations: schemaCombinations,
  inspect: inspectArtifactSchema,
  assert: assertArtifactSchema,
})

function invalid(
  code: ArtifactSchemaDiagnosticCode,
  message: string,
  family?: unknown,
  version?: unknown,
): ArtifactSchemaInspection {
  return {
    ok: false,
    diagnostic: Object.freeze({ code, message, family, version }),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
}

function isMetadata(value: unknown): value is ArtifactSchemaMetadata {
  return isRecord(value) && Object.entries(value).every(([key, item]) => key !== '__proto__' && isMetadataValue(item))
}

function isMetadataValue(value: unknown): value is ArtifactSchemaMetadataValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return true
  }
  if (typeof value === 'number') {
    return Number.isFinite(value)
  }
  if (Array.isArray(value)) {
    return value.every((item) => isMetadataValue(item))
  }
  return isMetadata(value)
}

function freezeMetadata(value: ArtifactSchemaMetadata): ArtifactSchemaMetadata {
  const frozenEntries = Object.entries(value).map(([key, item]) => [key, freezeMetadataValue(item)] as const)
  return Object.freeze(Object.fromEntries(frozenEntries) as ArtifactSchemaMetadata)
}

function freezeMetadataValue(value: ArtifactSchemaMetadataValue): ArtifactSchemaMetadataValue {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => freezeMetadataValue(item)))
  }
  if (isMetadata(value)) {
    return freezeMetadata(value)
  }
  return value
}
