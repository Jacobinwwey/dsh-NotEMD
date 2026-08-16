import { expect, test } from 'vitest'

import { createRevision, type VaultDocument } from '@notemd-harness/vault'

import {
  isSlidevDeckMarkdown,
  prepareSlidevArtifacts,
} from '../src/index.js'

const ordinaryNote = `# Recoverable Mutations

## Contract

Plans are immutable and approval is bound to the exact digest.

## Recovery

- journal before replacement
- verify after replacement
`

test('prepares deterministic Slidev Markdown and a source-bound layout report', () => {
  const source = documentFor('notes/recovery.md', ordinaryNote)
  const spec = {
    version: 1 as const,
    title: 'Recoverable Mutations',
    source: { path: source.path, revision: source.revision },
    theme: 'seriph',
  }

  const first = prepareSlidevArtifacts(spec, source)
  const second = prepareSlidevArtifacts(spec, source)

  expect(second).toEqual(first)
  expect(first.source).toMatchObject({
    filename: 'slides.md',
    mediaType: 'text/markdown',
  })
  expect(first.source.content).toContain('theme: seriph')
  expect(first.source.content).toContain('fonts:\n  provider: none')
  expect(first.source.content).toContain('layout: section')
  expect(first.source.content).toContain('# End')

  const report = JSON.parse(first.report.content) as Record<string, unknown>
  expect(report).toMatchObject({
    version: 1,
    sourcePath: source.path,
    sourceRevision: source.revision,
    theme: 'seriph',
    slideCount: 6,
    status: 'prepared',
  })
  expect(report.preparedMarkdownSha256).toMatch(/^[a-f0-9]{64}$/u)
})

test('preserves an existing Slidev deck while enforcing an offline font provider', () => {
  const markdown = `---
theme: default
fonts:
  provider: google
  sans: Inter
---

# Existing deck

---
layout: center
---

# Second
`
  const source = documentFor('slides/existing.md', markdown)

  expect(isSlidevDeckMarkdown(markdown)).toBe(true)
  const prepared = prepareSlidevArtifacts({
    version: 1,
    title: 'Existing deck',
    source: { path: source.path, revision: source.revision },
    theme: 'seriph',
  }, source)

  expect(prepared.source.content).toContain('theme: seriph')
  expect(prepared.source.content).toContain('fonts:\n  provider: none')
  expect(prepared.source.content).toContain('  sans: Inter')
  expect(prepared.source.content).not.toContain('provider: google')
  expect(prepared.source.content.match(/^# Second$/gmu)).toHaveLength(1)
  expect(JSON.parse(prepared.report.content)).toMatchObject({
    inputKind: 'slidev-deck',
    slideCount: 2,
  })
})

test('rejects a source revision mismatch before preparing artifacts', () => {
  const source = documentFor('notes/recovery.md', ordinaryNote)

  expect(() => prepareSlidevArtifacts({
    version: 1,
    title: 'Recoverable Mutations',
    source: { path: source.path, revision: 'stale' },
    theme: 'default',
  }, source)).toThrow(/source path and revision/u)
})

function documentFor(path: string, content: string): VaultDocument {
  return { path, content, revision: createRevision(content) }
}
