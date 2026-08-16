import {
  renderGraphProjectionSvg,
  validateDiagramSpec,
  type DiagramArtifactRenderOutput,
  type DiagramSpecFor,
  type SpecialistArtifactRenderer,
} from '@notemd-harness/artifacts'
import type {
  AllowlistedProcessBoundary,
  ProcessArtifactExecution,
} from '@notemd-harness/process'

export class DrawioArtifactRenderer implements SpecialistArtifactRenderer<'drawio'> {
  readonly target = 'drawio' as const
  readonly fingerprint = Object.freeze({ id: 'notemd-drawio-provider', version: '1' })

  constructor(private readonly process: Pick<AllowlistedProcessBoundary, 'renderDrawioSvg' | 'drawioSvgCapability'>) {}

  async render(specInput: DiagramSpecFor<'drawio'>, signal?: AbortSignal): Promise<DiagramArtifactRenderOutput> {
    const spec = validateDiagramSpec(specInput)
    if (spec.canonicalTarget !== 'drawio') {
      throw new Error('DrawioArtifactRenderer requires a Draw.io DiagramSpec.')
    }
    const source = renderDrawioXml(spec)
    const projection = renderGraphProjectionSvg(spec.graph, {
      title: spec.title,
      rendererId: 'drawio-projection',
      projection: 'drawio',
      subtitle: 'Draw.io SVG projection; native export is a separate derivative',
      theme: spec.rendererIntent.theme,
      fontFamily: spec.rendererIntent.fontFamily,
    })
    const native = await this.process.renderDrawioSvg(source, signal)
    return Object.freeze({
      source: Object.freeze({
        filename: 'diagram.drawio',
        mediaType: 'application/vnd.jgraph.mxfile',
        content: source,
        fingerprint: Object.freeze({ id: 'notemd-drawio-xml', version: '1' }),
      }),
      preview: Object.freeze({
        filename: 'preview.svg',
        mediaType: 'image/svg+xml',
        content: projection,
        fingerprint: Object.freeze({ id: 'notemd-drawio-projection', version: '1' }),
      }),
      export: nativeDerivative(native),
    })
  }

  async capability(signal?: AbortSignal) {
    const capability = await this.process.drawioSvgCapability(signal)
    if (capability.status === 'available') {
      return {
        capability: 'diagram-rendering' as const,
        status: 'available' as const,
        reason: `Draw.io native SVG export is available (${capability.executableFingerprint}).`,
      }
    }
    if (capability.status === 'unavailable') {
      return {
        capability: 'diagram-rendering' as const,
        status: 'unavailable' as const,
        reason: `Draw.io native SVG export is unavailable (${capability.code}).`,
      }
    }
    throw processCancellation(capability.code)
  }
}

function nativeDerivative(execution: ProcessArtifactExecution) {
  if (execution.status === 'ready') {
    const content = new TextDecoder('utf-8', { fatal: true }).decode(execution.bytes)
    return Object.freeze({
      filename: 'export.svg',
      mediaType: 'image/svg+xml',
      content,
      fingerprint: Object.freeze({ id: 'notemd-drawio-native', version: execution.executableFingerprint }),
    })
  }
  if (execution.status === 'unavailable') {
    return Object.freeze({
      status: 'unavailable' as const,
      mediaType: 'image/svg+xml',
      reason: 'Draw.io executable is unavailable.',
    })
  }
  if (execution.status === 'cancelled') {
    throw processCancellation(execution.code)
  }
  return Object.freeze({ status: 'failed' as const, mediaType: 'image/svg+xml', code: execution.code })
}

function processCancellation(code: string): Error & { readonly code: string } {
  const error = new Error(`Draw.io rendering was cancelled: ${code}`) as Error & { readonly code: string }
  error.name = 'AbortError'
  Object.defineProperty(error, 'code', { value: code, enumerable: true })
  return error
}

function renderDrawioXml(spec: DiagramSpecFor<'drawio'>): string {
  const nodes = flattenNodes(spec.graph.nodes)
  const drawioIds = new Map(nodes.map((node, index) => [node.id, `node-${index + 1}`]))
  const nodeCells = nodes.map((node, index) => {
    const id = drawioIds.get(node.id) ?? `node-${index + 1}`
    const x = 48 + (index % 3) * 288
    const y = 96 + Math.floor(index / 3) * 148
    return `<mxCell id="${id}" value="${escapeXml(node.label)}" style="rounded=1;whiteSpace=wrap;html=0;" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="220" height="84" as="geometry"/></mxCell>`
  }).join('')
  const edgeCells = spec.graph.edges.map((edge, index) => {
    const from = drawioIds.get(edge.from)
    const to = drawioIds.get(edge.to)
    if (from === undefined || to === undefined) {
      return ''
    }
    return `<mxCell id="edge-${index + 1}" value="${escapeXml(edge.label ?? edge.relation ?? '')}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=0;" edge="1" parent="1" source="${from}" target="${to}"><mxGeometry relative="1" as="geometry"/></mxCell>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8"?><mxfile host="notemd" version="1"><diagram id="notemd-page-1" name="Page-1"><mxGraphModel dx="960" dy="640" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${nodeCells}${edgeCells}</root></mxGraphModel></diagram></mxfile>`
}

function flattenNodes(nodes: DiagramSpecFor<'drawio'>['graph']['nodes']): readonly DiagramSpecFor<'drawio'>['graph']['nodes'][number][] {
  return nodes.flatMap((node) => [node, ...(node.children === undefined ? [] : flattenNodes(node.children))])
}

function escapeXml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&apos;')
}
