import { expect, test } from 'vitest'

import { HtmlSvgRenderer } from '../src/index.js'

test('emits an inspectable HTML source with a separate SVG projection', () => {
  const output = new HtmlSvgRenderer().render({
    version: 2,
    title: 'Service Graph',
    source: { path: 'notes/services.md', revision: 'revision' },
    evidenceRefs: [],
    generation: { promptPolicyId: 'notemd.diagram.html.v2', provider: 'deepseek', model: 'deepseek-chat' },
    rendererIntent: { theme: 'light', fontFamily: 'Inter' },
    canonicalTarget: 'html',
    graph: { intent: 'flowchart', nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ from: 'a', to: 'b' }] },
  })

  expect(output.source).toMatchObject({ filename: 'diagram.html', mediaType: 'text/html' })
  expect(output.source.content.toLocaleLowerCase()).toContain('<!doctype html>')
  expect(readyContent(output.preview)).toContain('data-notemd-renderer="html-projection"')
})

function readyContent(value: { readonly content?: string }): string {
  return value.content ?? ''
}
