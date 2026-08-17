import { expect, test } from 'vitest'

import { EditableSvgRenderer } from '../src/index.js'

test('uses editable SVG as the canonical source and emits separate preview/export derivatives', () => {
  const output = new EditableSvgRenderer().render({
    schemaFamily: 'diagram-spec' as const,
    version: 2,
    title: 'Control Flow',
    source: { path: 'notes/control.md', revision: 'revision' },
    evidenceRefs: [],
    generation: { promptPolicyId: 'notemd.diagram.editable-svg.v2', provider: 'deepseek', model: 'deepseek-chat' },
    rendererIntent: { theme: 'dark', fontFamily: 'Inter' },
    canonicalTarget: 'editable-svg',
    graph: { intent: 'flowchart', nodes: [{ id: 'start', label: 'Start' }, { id: 'end', label: 'End' }], edges: [{ from: 'start', to: 'end' }] },
  })

  expect(output.source).toMatchObject({ filename: 'diagram.svg', mediaType: 'image/svg+xml' })
  expect(output.source.content).toContain('data-notemd-renderer="editable-svg"')
  expect(readyContent(output.preview)).toContain('data-notemd-renderer="editable-svg"')
  expect(output.preview).not.toBe(output.source)
})

function readyContent(value: { readonly content?: string }): string {
  return value.content ?? ''
}
