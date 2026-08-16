import {
  escapeSvgText,
  renderGraphProjectionSvg,
  validateDiagramSpec,
  type DiagramArtifactRenderer,
  type DiagramArtifactRenderOutput,
  type HtmlDiagramSpec,
} from '@notemd-harness/artifacts'

export class HtmlSvgRenderer implements DiagramArtifactRenderer {
  readonly target = 'html' as const
  readonly fingerprint = Object.freeze({ id: 'notemd-html-projection', version: '1' })

  render(specInput: HtmlDiagramSpec): DiagramArtifactRenderOutput {
    const spec = validateDiagramSpec(specInput)
    if (spec.canonicalTarget !== 'html') {
      throw new Error('HtmlSvgRenderer requires an HTML DiagramSpec.')
    }
    const svg = renderGraphProjectionSvg(spec.graph, {
      title: spec.title,
      rendererId: 'html-projection',
      projection: 'html',
      subtitle: 'HTML diagram projection',
      theme: spec.rendererIntent.theme,
      fontFamily: spec.rendererIntent.fontFamily,
    })
    return Object.freeze({
      source: Object.freeze({ filename: 'diagram.html', mediaType: 'text/html', content: htmlSource(spec) }),
      preview: Object.freeze({ filename: 'preview.svg', mediaType: 'image/svg+xml', content: svg }),
      export: Object.freeze({ filename: 'export.svg', mediaType: 'image/svg+xml', content: svg }),
    })
  }
}

function htmlSource(spec: HtmlDiagramSpec): string {
  const nodes = flattenNodes(spec.graph.nodes)
    .map((node) => `<li data-node-id="${escapeHtml(node.id)}">${escapeHtml(node.label)}</li>`)
    .join('')
  const edges = spec.graph.edges
    .map((edge) => `<li>${escapeHtml(edge.from)} -&gt; ${escapeHtml(edge.to)}${edge.label === undefined ? '' : `: ${escapeHtml(edge.label)}`}</li>`)
    .join('')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(spec.title)}</title></head><body><main data-notemd-renderer="html"><h1>${escapeHtml(spec.title)}</h1><section><h2>Nodes</h2><ul>${nodes}</ul></section><section><h2>Edges</h2><ul>${edges}</ul></section></main></body></html>\n`
}

function flattenNodes(nodes: HtmlDiagramSpec['graph']['nodes']): readonly HtmlDiagramSpec['graph']['nodes'][number][] {
  return nodes.flatMap((node) => [node, ...(node.children === undefined ? [] : flattenNodes(node.children))])
}

function escapeHtml(value: string): string {
  return escapeSvgText(value).replace(/"/gu, '&quot;').replace(/'/gu, '&#39;')
}
