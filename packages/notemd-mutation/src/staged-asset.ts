import { createHash } from 'node:crypto'

export type ContentSha256 = string

export interface StagedAssetRef {
  readonly id: string
  readonly byteLength: number
  readonly mediaType: string
  readonly sha256: ContentSha256
}

const opaqueAssetId = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u
const mediaType = /^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*$/u
const sha256 = /^[a-f0-9]{64}$/u

export function createContentSha256(content: string): ContentSha256 {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

export function createStagedAssetRef(candidate: StagedAssetRef): StagedAssetRef {
  if (!opaqueAssetId.test(candidate.id)) {
    throw new RangeError('A staged asset id must be an opaque identifier, not a path.')
  }
  if (!Number.isSafeInteger(candidate.byteLength) || candidate.byteLength < 0) {
    throw new RangeError('A staged asset byte length must be a non-negative safe integer.')
  }

  return Object.freeze({
    id: candidate.id,
    byteLength: candidate.byteLength,
    mediaType: canonicalMediaType(candidate.mediaType),
    sha256: assertContentSha256(candidate.sha256, 'staged asset SHA-256'),
  })
}

export function canonicalMediaType(value: string): string {
  if (typeof value !== 'string') {
    throw new RangeError('A mutation media type must be a canonical type/subtype value.')
  }
  const canonical = value.toLowerCase()
  if (!mediaType.test(canonical)) {
    throw new RangeError('A mutation media type must be a canonical type/subtype value.')
  }
  return canonical
}

export function assertContentSha256(value: string, field: string): ContentSha256 {
  if (!sha256.test(value)) {
    throw new RangeError(`${field} must be a lowercase SHA-256 digest.`)
  }
  return value
}
