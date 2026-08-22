import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { expect, test } from 'vitest'

import {
  detectMermaidFamily,
  extractMermaidBlocks,
  normalizeMermaidDiagram,
  normalizeMermaidMarkdown,
  renderMermaidIntent,
} from '../src/index.js'

test('normalizes BOM, line endings, and mixed Mermaid fence markers without touching prose', () => {
  const source = '\uFEFFbefore\r\n~~~ mermaid\r\nflowchart TD\r\n  A --> B  \r\n~~~\r\nafter'

  const result = normalizeMermaidMarkdown(source)

  expect(result.content).toBe('before\n~~~ mermaid\nflowchart TD\n  A --> B\n~~~\nafter')
  expect(result.blocks).toHaveLength(1)
  expect(result.blocks[0]?.family).toBe('flowchart')
  expect(result.diagnostics).toEqual([])
})

test('detects portable Mermaid families and leaves unknown families explicit', () => {
  expect(detectMermaidFamily('sequenceDiagram\n  A->>B: hi')).toBe('sequenceDiagram')
  expect(detectMermaidFamily('quadrantChart\n  x-axis low --> high')).toBe('quadrantChart')
  expect(detectMermaidFamily('custom-beta\n  A --> B')).toBe('unknown')
})

test('repairs brace-less ER entities and truncated relation cardinality deterministically', () => {
  const result = normalizeMermaidDiagram([
    'erDiagram',
    '  USER',
    '    string id',
    '    string name',
    '  USER ||--o ACCOUNT : owns',
  ].join('\n'))

  expect(result.family).toBe('erDiagram')
  expect(result.content).toContain('USER {\n      string id\n      string name\n  }')
  expect(result.content).toContain('USER ||--o{ ACCOUNT : owns')
})

test('reports an unclosed Mermaid fence without inventing content', () => {
  const source = '~~~mermaid\nflowchart TD\n  A --> B'

  const result = normalizeMermaidMarkdown(source)

  expect(result.content).toBe(source)
  expect(result.blocks).toEqual([])
  expect(result.diagnostics).toMatchObject([{ code: 'mermaid-unclosed-fence' }])
})

test('matches the pinned normalization fixture output', async () => {
  const fixturePath = fileURLToPath(new URL('../../../fixtures/migration/mermaid-normalization/er-braceless.md', import.meta.url))
  const lockPath = fileURLToPath(new URL('../../../fixtures/migration/mermaid-normalization-lock.json', import.meta.url))
  const source = await readFile(fixturePath, 'utf8')
  const lock = JSON.parse(await readFile(lockPath, 'utf8')) as {
    sourceObservation: { commit: string }
    fixture: string
  }
  const result = normalizeMermaidMarkdown(source)

  expect(lock.sourceObservation.commit).toBe('07c629c6f99a1171a6a63eaf50ddb0dce0f5fed5')
  expect(lock.fixture).toBe('fixtures/migration/mermaid-normalization/er-braceless.md')
  expect(result.content).toBe([
    '# ER fixture',
    '',
    '```mermaid',
    'erDiagram',
    '  USER {',
    '      string id',
    '      string name',
    '  }',
    '  USER ||--o{ ACCOUNT : owns',
    '```',
    '',
  ].join('\n'))
})

test('extracts only closed blocks and preserves lexical block order', () => {
  const blocks = extractMermaidBlocks([
    '~~~mermaid',
    'flowchart TD',
    'A --> B',
    '~~~',
    '',
    '```mermaid',
    'sequenceDiagram',
    'A->>B: hi',
    '```',
  ].join('\n'))

  expect(blocks.map((block) => block.family)).toEqual(['flowchart', 'sequenceDiagram'])
  expect(blocks.map((block) => block.marker)).toEqual(['~~~', '```'])
})

test('renders validated semantic intents as deterministic Mermaid source', () => {
  expect(renderMermaidIntent({
    schemaFamily: 'diagram-intent',
    version: 1,
    semanticType: 'timeline',
    renderTarget: 'mermaid',
    exportFormat: 'mermaid-source',
    payload: { events: [{ id: 'ship', date: '2026:08', label: 'Ship', details: ['Gate'] }] },
  })).toBe('timeline\n  2026-08 : Ship\n    : Gate')

  expect(renderMermaidIntent({
    schemaFamily: 'diagram-intent',
    version: 1,
    semanticType: 'quadrant',
    renderTarget: 'mermaid',
    exportFormat: 'svg-preview',
    payload: {
      xAxisLabel: ['Low', 'High'],
      yAxisLabel: ['Low', 'High'],
      quadrantLabels: ['Do', 'Plan', 'Watch', 'Drop'],
      items: [{ id: 'a', label: 'A', x: 0.8, y: 0.9 }],
    },
  })).toContain('quadrantChart')
})
