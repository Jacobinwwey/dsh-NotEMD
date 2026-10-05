import { expect, test } from 'vitest'
import { graphProjectionVersion } from '@notemd-harness/artifacts'

import { HtmlSvgRenderer } from '../src/index.js'

test('emits an inspectable HTML source with a separate SVG projection', () => {
  const output = new HtmlSvgRenderer().render({
    schemaFamily: 'diagram-spec' as const,
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
  expect(output.preview.fingerprint?.version).toBe(graphProjectionVersion)
  expect(output.export.fingerprint?.version).toBe(graphProjectionVersion)
  expect(output.source.fingerprint ?? new HtmlSvgRenderer().fingerprint).toMatchObject({ version: '1' })
})

function readyContent(value: { readonly content?: string }): string {
  return value.content ?? ''
}
