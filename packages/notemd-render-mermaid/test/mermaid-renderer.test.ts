import { expect, test } from 'vitest'

import { MermaidSvgRenderer } from '../src/index.js'

test('emits Mermaid source and a labelled SVG source projection', () => {
  const output = new MermaidSvgRenderer().render(graphSpec('mermaid'))

  expect(output.source).toMatchObject({ filename: 'diagram.mmd', mediaType: 'text/vnd.mermaid' })
  expect(output.source.content).toContain('flowchart TD')
  expect(output.preview).toMatchObject({ filename: 'preview.svg', mediaType: 'image/svg+xml' })
  expect(readyContent(output.preview)).toContain('data-notemd-renderer="mermaid-source-projection"')
  expect(readyContent(output.export)).toContain('<svg')
})

function graphSpec(canonicalTarget: 'mermaid') {
  return {
    schemaFamily: 'diagram-spec' as const,
    version: 2 as const,
    title: 'Write Lifecycle',
    source: { path: 'notes/architecture.md', revision: 'revision' },
    evidenceRefs: [],
    generation: { promptPolicyId: 'notemd.diagram.mermaid.v2', provider: 'deepseek', model: 'deepseek-chat' },
    rendererIntent: { theme: 'light', fontFamily: 'Inter' },
    canonicalTarget,
    graph: {
      intent: 'flowchart' as const,
      nodes: [{ id: 'plan', label: 'Plan' }, { id: 'approve', label: 'Approve' }],
      edges: [{ from: 'plan', to: 'approve', label: 'review' }],
    },
  }
}

function readyContent(value: { readonly content?: string }): string {
  return value.content ?? ''
}
