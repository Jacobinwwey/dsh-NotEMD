import { createRevision, type VaultDocument } from '@notemd-harness/vault'
import { createContentSha256 } from '@notemd-harness/mutation'
import { expect, test } from 'vitest'

import {
  buildChapterSplitMutationPlan,
  parseMarkdownDocument,
  sourceSiblingChapterOutput,
} from '../src/index.js'

function document(path: string, content: string): VaultDocument {
  return { path, content, revision: createRevision(content) }
}

test('emits chapter, toc, manifest, and stale deletion mutations as one proposal', () => {
  const source = document('notes/handbook.md', [
    '# Handbook',
    '',
    '## Planning',
    'Plan immutably.',
    '',
    '### Scope',
    'Keep the source scope explicit.',
    '',
    '## Execution',
    'Apply only approved proposals.',
  ].join('\n'))
  const stale = document('notes/handbook_chapters/03-retired.md', 'Retired chapter')
  const manifest = document('notes/handbook_chapters/.notemd-chapter-split.json', JSON.stringify({
    version: 2,
    sourcePath: source.path,
    generatedPaths: ['notes/handbook_chapters/03-retired.md'],
    generatedFileHashes: {
      'notes/handbook_chapters/03-retired.md': createContentSha256(stale.content),
    },
  }))

  const plan = buildChapterSplitMutationPlan({
    source,
    parsedSource: parseMarkdownDocument(source),
    output: sourceSiblingChapterOutput(),
    existingArtifacts: [manifest, stale],
  })

  expect(plan.mutations.map((mutation) => mutation.destination)).toEqual([
    'notes/handbook_chapters/.notemd-chapter-split.json',
    'notes/handbook_chapters/01-planning.md',
    'notes/handbook_chapters/02-execution.md',
    'notes/handbook_chapters/handbook_TOC.md',
    'notes/handbook_chapters/03-retired.md',
  ].sort())
  expect(plan.mutations).toContainEqual(expect.objectContaining({
    kind: 'delete',
    destination: 'notes/handbook_chapters/03-retired.md',
    expectedRevision: stale.revision,
  }))
  const chapter = plan.mutations.find((mutation) => mutation.destination.endsWith('01-planning.md'))
  expect(chapter).toMatchObject({ kind: 'write-text', expectedRevision: 'absent' })
  expect(chapter?.kind === 'write-text' ? chapter.content : '').toContain('### Scope ^notemd-scope')
})

test('rejects replacing a managed chapter whose recorded digest no longer matches', () => {
  const source = document('notes/handbook.md', '# Handbook\n\n## Planning\nPlan.')
  const editedChapter = document('notes/handbook_chapters/01-planning.md', 'Manual edit')
  const manifest = document('notes/handbook_chapters/.notemd-chapter-split.json', JSON.stringify({
    version: 2,
    sourcePath: source.path,
    generatedPaths: [editedChapter.path],
    generatedFileHashes: { [editedChapter.path]: '0'.repeat(64) },
  }))

  expect(() => buildChapterSplitMutationPlan({
    source,
    parsedSource: parseMarkdownDocument(source),
    output: sourceSiblingChapterOutput(),
    existingArtifacts: [manifest, editedChapter],
  })).toThrow('Refusing to overwrite manually edited chapter split artifacts')
})

test('assigns distinct deterministic block ids to repeated nested headings', () => {
  const source = document('notes/platform.md', [
    '# Platform',
    '',
    '## Overview',
    'Overview.',
    '',
    '### Risks',
    'First risk.',
    '',
    '### Risks',
    'Second risk.',
  ].join('\n'))

  const plan = buildChapterSplitMutationPlan({
    source,
    parsedSource: parseMarkdownDocument(source),
    output: sourceSiblingChapterOutput(),
    existingArtifacts: [],
  })
  const chapter = plan.mutations.find((mutation) => mutation.destination.endsWith('01-overview.md'))

  expect(chapter?.kind === 'write-text' ? chapter.content : '').toContain('### Risks ^notemd-risks')
  expect(chapter?.kind === 'write-text' ? chapter.content : '').toContain('### Risks ^notemd-risks-2')
})
