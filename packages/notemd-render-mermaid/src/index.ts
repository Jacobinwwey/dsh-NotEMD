import {
  renderGraphProjectionSvg,
  validateDiagramSpec,
  type DiagramArtifactRenderer,
  type DiagramArtifactRenderOutput,
  type DiagramGraphInput,
  type MermaidDiagramSpec,
} from '@notemd-harness/artifacts'

export class MermaidSvgRenderer implements DiagramArtifactRenderer {
  readonly target = 'mermaid' as const
  readonly fingerprint = Object.freeze({ id: 'notemd-mermaid-source-projection', version: '1' })

  render(specInput: MermaidDiagramSpec): DiagramArtifactRenderOutput {
    const spec = validateDiagramSpec(specInput)
    if (spec.canonicalTarget !== 'mermaid') {
      throw new Error('MermaidSvgRenderer requires a Mermaid DiagramSpec.')
    }
    const svg = renderGraphProjectionSvg(spec.graph, {
      title: spec.title,
      rendererId: 'mermaid-source-projection',
      projection: 'mermaid-source',
      subtitle: 'Mermaid source projection',
      theme: spec.rendererIntent.theme,
      fontFamily: spec.rendererIntent.fontFamily,
    })
    return Object.freeze({
      source: Object.freeze({ filename: 'diagram.mmd', mediaType: 'text/vnd.mermaid', content: renderMermaidSource(spec) }),
      preview: Object.freeze({ filename: 'preview.svg', mediaType: 'image/svg+xml', content: svg }),
      export: Object.freeze({ filename: 'export.svg', mediaType: 'image/svg+xml', content: svg }),
    })
  }
}

function renderMermaidSource(spec: MermaidDiagramSpec): string {
  const { graph } = spec
  switch (graph.intent) {
    case 'mindmap':
    case 'drawnix-mindmap':
      return ['mindmap', `  root((${mermaidText(spec.title)}))`, ...flattenGraph(graph).map((node) => `    ${mermaidText(node.label)}`)].join('\n')
    case 'sequence':
      return [
        'sequenceDiagram',
        ...flattenGraph(graph).map((node) => `  participant ${mermaidIdentifier(node.id)} as ${mermaidText(node.label)}`),
        ...graph.edges.map((edge) => `  ${mermaidIdentifier(edge.from)}->>${mermaidIdentifier(edge.to)}: ${mermaidText(edge.label ?? edge.relation ?? '')}`),
      ].join('\n')
    case 'class':
      return [
        'classDiagram',
        ...flattenGraph(graph).map((node) => `  class ${mermaidIdentifier(node.id)}[${mermaidText(node.label)}]`),
        ...graph.edges.map((edge) => `  ${mermaidIdentifier(edge.from)} --> ${mermaidIdentifier(edge.to)} : ${mermaidText(edge.label ?? edge.relation ?? '')}`),
      ].join('\n')
    case 'er':
      return [
        'erDiagram',
        ...graph.edges.map((edge) => `  ${mermaidIdentifier(edge.from)} ||--o{ ${mermaidIdentifier(edge.to)} : ${mermaidText(edge.label ?? edge.relation ?? 'relates')}`),
      ].join('\n')
    case 'state':
      return [
        'stateDiagram-v2',
        ...graph.edges.map((edge) => `  ${mermaidIdentifier(edge.from)} --> ${mermaidIdentifier(edge.to)}${edge.label === undefined ? '' : ` : ${mermaidText(edge.label)}`}`),
      ].join('\n')
    case 'flowchart':
    case 'canvas-map':
      return [
        'flowchart TD',
        ...flattenGraph(graph).map((node) => `  ${mermaidIdentifier(node.id)}[${mermaidText(node.label)}]`),
        ...graph.edges.map((edge) => `  ${mermaidIdentifier(edge.from)} -->${edge.label === undefined ? '' : `|${mermaidText(edge.label)}|`} ${mermaidIdentifier(edge.to)}`),
      ].join('\n')
  }
}

function flattenGraph(graph: DiagramGraphInput): readonly DiagramGraphInput['nodes'][number][] {
  const flatten = (nodes: DiagramGraphInput['nodes']): readonly DiagramGraphInput['nodes'][number][] => nodes.flatMap((node) => [node, ...(node.children === undefined ? [] : flatten(node.children))])
  return flatten(graph.nodes)
}

function mermaidIdentifier(value: string): string {
  return value.replace(/[^A-Za-z0-9_]/gu, '_') || 'node'
}

function mermaidText(value: string): string {
  return value
    .replace(/\r?\n/gu, ' ')
    .replaceAll('[', ' ')
    .replaceAll(']', ' ')
    .replaceAll('{', ' ')
    .replaceAll('}', ' ')
    .replaceAll('|', ' ')
    .replaceAll('`', ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}
