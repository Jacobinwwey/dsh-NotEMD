import {
  renderGraphProjectionSvg,
  validateDiagramSpec,
  type DiagramArtifactRenderer,
  type DiagramArtifactRenderOutput,
  type DiagramGraphInput,
  type JsonCanvasDiagramSpec,
} from '@notemd-harness/artifacts'

export class JsonCanvasSvgRenderer implements DiagramArtifactRenderer {
  readonly target = 'json-canvas' as const
  readonly fingerprint = Object.freeze({ id: 'notemd-json-canvas-projection', version: '1' })

  render(specInput: JsonCanvasDiagramSpec): DiagramArtifactRenderOutput {
    const spec = validateDiagramSpec(specInput)
    if (spec.canonicalTarget !== 'json-canvas') {
      throw new Error('JsonCanvasSvgRenderer requires a JSON Canvas DiagramSpec.')
    }
    const svg = renderGraphProjectionSvg(spec.graph, {
      title: spec.title,
      rendererId: 'json-canvas-projection',
      projection: 'json-canvas',
      subtitle: 'JSON Canvas projection, not canonical .canvas source',
      theme: spec.rendererIntent.theme,
      fontFamily: spec.rendererIntent.fontFamily,
    })
    return Object.freeze({
      source: Object.freeze({ filename: 'diagram.canvas', mediaType: 'application/json', content: `${JSON.stringify(jsonCanvasSource(spec.graph), null, 2)}\n` }),
      preview: Object.freeze({ filename: 'preview.svg', mediaType: 'image/svg+xml', content: svg }),
      export: Object.freeze({ filename: 'export.svg', mediaType: 'image/svg+xml', content: svg }),
    })
  }
}

function jsonCanvasSource(graph: DiagramGraphInput) {
  const nodes = flattenNodes(graph).map((node, index) => ({
    id: node.id,
    type: 'text' as const,
    text: node.label,
    x: (index % 3) * 360,
    y: Math.floor(index / 3) * 160,
    width: 260,
    height: 96,
  }))
  return {
    nodes,
    edges: graph.edges.map((edge, index) => ({
      id: `edge-${index + 1}`,
      fromNode: edge.from,
      fromSide: 'right',
      toNode: edge.to,
      toSide: 'left',
      toEnd: 'arrow',
      ...(edge.label === undefined ? {} : { label: edge.label }),
    })),
  }
}

function flattenNodes(graph: DiagramGraphInput): readonly DiagramGraphInput['nodes'][number][] {
  const flatten = (nodes: DiagramGraphInput['nodes']): readonly DiagramGraphInput['nodes'][number][] => nodes.flatMap((node) => [node, ...(node.children === undefined ? [] : flatten(node.children))])
  return flatten(graph.nodes)
}
