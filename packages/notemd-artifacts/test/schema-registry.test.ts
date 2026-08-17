import { expect, test } from 'vitest'

import {
  ArtifactSchemaError,
  assertArtifactSchema,
  inspectArtifactSchema,
} from '../src/index.js'

test('accepts the closed DiagramSpec, diagram-lineage, and document-export combinations', () => {
  expect(assertArtifactSchema({ schemaFamily: 'diagram-spec', version: 2 })).toMatchObject({
    schemaFamily: 'diagram-spec',
    version: 2,
  })
  expect(assertArtifactSchema({ schemaFamily: 'diagram-lineage', version: 2 })).toMatchObject({
    schemaFamily: 'diagram-lineage',
    version: 2,
  })
  expect(assertArtifactSchema({ schemaFamily: 'document-export', version: 3 })).toMatchObject({
    schemaFamily: 'document-export',
    version: 3,
  })
})

test('accepts forward-compatible JSON metadata only inside the metadata field', () => {
  const inspected = inspectArtifactSchema({
    schemaFamily: 'document-export',
    version: 3,
    metadata: { producer: 'fixture', flags: ['portable'], nested: { revision: 2 } },
  })

  expect(inspected).toMatchObject({
    ok: true,
    header: {
      schemaFamily: 'document-export',
      version: 3,
      metadata: { producer: 'fixture', flags: ['portable'], nested: { revision: 2 } },
    },
  })
  if (inspected.ok) {
    expect(Object.isFrozen(inspected.header.metadata)).toBe(true)
  }
})

test.each([
  [{ version: 2 }, 'missing-family'],
  [{ schemaFamily: 'unknown', version: 2 }, 'unknown-family'],
  [{ schemaFamily: 'diagram-spec', version: 4 }, 'unknown-version'],
  [{ schemaFamily: 'diagram-spec', version: 3 }, 'invalid-combination'],
  [{ schemaFamily: 'document-export', version: 3, metadata: [] }, 'invalid-metadata'],
] as const)('returns a structured diagnostic for invalid schema envelope %#', (candidate, code) => {
  const inspected = inspectArtifactSchema(candidate)

  expect(inspected).toMatchObject({ ok: false, diagnostic: { code } })
  if (!inspected.ok) {
    expect(inspected.diagnostic.message.length).toBeGreaterThan(0)
    expect(inspected.diagnostic.version === undefined || inspected.diagnostic.version !== null).toBe(true)
  }
})

test('assert preserves the family/version mismatch diagnostic for consumers', () => {
  expect(() => assertArtifactSchema(
    { schemaFamily: 'diagram-lineage', version: 2 },
    { family: 'diagram-spec', version: 2 },
  )).toThrowError(ArtifactSchemaError)

  try {
    assertArtifactSchema(
      { schemaFamily: 'diagram-lineage', version: 2 },
      { family: 'diagram-spec', version: 2 },
    )
  } catch (error) {
    expect(error).toMatchObject({
      code: 'ARTIFACT_SCHEMA_INVALID',
      diagnostic: {
        code: 'family-mismatch',
        family: 'diagram-lineage',
        expectedFamily: 'diagram-spec',
      },
    })
  }
})
