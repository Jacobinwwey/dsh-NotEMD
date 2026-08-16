import {
  renderGraphProjectionSvg,
  validateDiagramSpec,
  type DiagramArtifactRenderOutput,
  type DiagramSpecFor,
  type SpecialistArtifactRenderer,
} from '@notemd-harness/artifacts'
import type { AllowlistedProcessBoundary, ProcessArtifactExecution } from '@notemd-harness/process'

type DrawnixProcess = Pick<AllowlistedProcessBoundary, 'renderDrawnixSvg'>
  & Partial<Pick<AllowlistedProcessBoundary, 'drawnixSvgCapability'>>

export class DrawnixArtifactRenderer implements SpecialistArtifactRenderer<'drawnix'> {
  readonly target = 'drawnix' as const
  readonly fingerprint = Object.freeze({ id: 'notemd-drawnix-provider', version: '1' })

  constructor(private readonly process: DrawnixProcess) {}

  async render(specInput: DiagramSpecFor<'drawnix'>, signal?: AbortSignal): Promise<DiagramArtifactRenderOutput> {
    const spec = validateDiagramSpec(specInput)
    if (spec.canonicalTarget !== 'drawnix') {
      throw new Error('DrawnixArtifactRenderer requires a Drawnix DiagramSpec.')
    }
    const source = renderDrawnixSemanticSource(spec)
    const projection = renderGraphProjectionSvg(spec.graph, {
      title: spec.title,
      rendererId: 'drawnix-projection',
      projection: 'drawnix',
      subtitle: 'Drawnix semantic SVG projection; native board replay is a separate adapter',
      theme: spec.rendererIntent.theme,
      fontFamily: spec.rendererIntent.fontFamily,
    })
    const native = await this.process.renderDrawnixSvg(source, signal)
    return Object.freeze({
      source: Object.freeze({
        filename: 'diagram.drawnix.json',
        mediaType: 'application/vnd.notemd.drawnix+json',
        content: source,
        fingerprint: Object.freeze({ id: 'notemd-drawnix-semantic-source', version: '1' }),
      }),
      preview: Object.freeze({
        filename: 'preview.svg',
        mediaType: 'image/svg+xml',
        content: projection,
        fingerprint: Object.freeze({ id: 'notemd-drawnix-projection', version: '1' }),
      }),
      export: nativeDerivative(native),
    })
  }

  async capability(signal?: AbortSignal) {
    const capabilityLookup = this.process.drawnixSvgCapability
    if (capabilityLookup !== undefined) {
      const capability = await capabilityLookup.call(this.process, signal)
      if (capability?.status === 'available') {
        return {
          capability: 'diagram-rendering' as const,
          status: 'available' as const,
          reason: `Drawnix adapter SVG export is available (${capability.executableFingerprint}).`,
        }
      }
      if (capability?.status === 'cancelled') {
        throw processCancellation(capability.code)
      }
      return {
        capability: 'diagram-rendering' as const,
        status: 'unavailable' as const,
        reason: `Drawnix adapter SVG export is unavailable (${capability.code}).`,
      }
    }
    return {
      capability: 'diagram-rendering' as const,
      status: 'unavailable' as const,
      reason: 'The optional notemd-drawnix-render adapter is not installed.',
    }
  }
}

function nativeDerivative(execution: ProcessArtifactExecution) {
  if (execution.status === 'ready') {
    const content = new TextDecoder('utf-8', { fatal: true }).decode(execution.bytes)
    return Object.freeze({
      filename: 'export.svg',
      mediaType: 'image/svg+xml',
      content,
      fingerprint: Object.freeze({ id: 'notemd-drawnix-native', version: execution.executableFingerprint }),
    })
  }
  if (execution.status === 'unavailable') {
    return Object.freeze({
      status: 'unavailable' as const,
      mediaType: 'image/svg+xml',
      reason: 'The optional notemd-drawnix-render adapter is not installed.',
    })
  }
  if (execution.status === 'cancelled') {
    throw processCancellation(execution.code)
  }
  return Object.freeze({ status: 'failed' as const, mediaType: 'image/svg+xml', code: execution.code })
}

function processCancellation(code: string): Error & { readonly code: string } {
  const error = new Error(`Drawnix rendering was cancelled: ${code}`) as Error & { readonly code: string }
  error.name = 'AbortError'
  Object.defineProperty(error, 'code', { value: code, enumerable: true })
  return error
}

function renderDrawnixSemanticSource(spec: DiagramSpecFor<'drawnix'>): string {
  return `${JSON.stringify({
    type: 'drawnix',
    version: 1,
    source: 'notemd',
    schema: 'notemd-drawnix-semantic-v1',
    title: spec.title,
    intent: spec.graph.intent,
    nodes: spec.graph.nodes,
    edges: spec.graph.edges,
    viewport: { zoom: 1, offsetX: 0, offsetY: 0 },
  }, null, 2)}\n`
}
