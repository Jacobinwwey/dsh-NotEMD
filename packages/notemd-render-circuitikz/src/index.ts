import {
  renderGraphProjectionSvg,
  validateDiagramSpec,
  type DiagramArtifactRenderOutput,
  type DiagramGraphInput,
  type DiagramSpecFor,
  type SpecialistArtifactRenderer,
} from '@notemd-harness/artifacts'
import type { AllowlistedProcessBoundary, ProcessArtifactExecution } from '@notemd-harness/process'
import type { StagedAssetStore } from '@notemd-harness/vault-local'

type CircuitikzProcess = Pick<AllowlistedProcessBoundary, 'compileCircuitikzPdf'>
  & Partial<Pick<AllowlistedProcessBoundary, 'circuitikzPdfCapability'>>

export class CircuitikzArtifactRenderer implements SpecialistArtifactRenderer<'circuitikz'> {
  readonly target = 'circuitikz' as const
  readonly fingerprint = Object.freeze({ id: 'notemd-circuitikz-provider', version: '1' })

  constructor(
    private readonly process: CircuitikzProcess,
    private readonly stagedAssets: StagedAssetStore,
  ) {}

  async render(specInput: DiagramSpecFor<'circuitikz'>, signal?: AbortSignal): Promise<DiagramArtifactRenderOutput> {
    const spec = validateDiagramSpec(specInput)
    if (spec.canonicalTarget !== 'circuitikz') {
      throw new Error('CircuitikzArtifactRenderer requires a Circuitikz DiagramSpec.')
    }
    const source = renderCircuitikzSource(spec)
    const projection = renderGraphProjectionSvg(circuitToGraph(spec), {
      title: spec.title,
      rendererId: 'circuitikz-projection',
      projection: 'circuitikz',
      subtitle: 'Circuitikz SVG projection; PDF remains the native export',
      theme: spec.rendererIntent.theme,
      fontFamily: spec.rendererIntent.fontFamily,
    })
    const native = await this.process.compileCircuitikzPdf(source, signal)
    return Object.freeze({
      source: Object.freeze({
        filename: 'diagram.tex',
        mediaType: 'text/x-tex',
        content: source,
        fingerprint: Object.freeze({ id: 'notemd-circuitikz-tex', version: '1' }),
      }),
      preview: Object.freeze({
        filename: 'preview.svg',
        mediaType: 'image/svg+xml',
        content: projection,
        fingerprint: Object.freeze({ id: 'notemd-circuitikz-projection', version: '1' }),
      }),
      export: await nativeDerivative(native, this.stagedAssets),
    })
  }

  async capability(signal?: AbortSignal) {
    const capabilityLookup = this.process.circuitikzPdfCapability
    if (capabilityLookup === undefined) {
      return {
        capability: 'diagram-rendering' as const,
        status: 'unavailable' as const,
        reason: 'Tectonic is not configured for the Circuitikz provider.',
      }
    }
    const capability = await capabilityLookup.call(this.process, signal)
    if (capability?.status === 'available') {
      return {
        capability: 'diagram-rendering' as const,
        status: 'available' as const,
        reason: `Circuitikz PDF export is available (${capability.executableFingerprint}).`,
      }
    }
    if (capability?.status === 'cancelled') {
      throw processCancellation(capability.code)
    }
    return {
      capability: 'diagram-rendering' as const,
      status: 'unavailable' as const,
      reason: `Circuitikz PDF export is unavailable (${capability.code}).`,
    }
  }
}

async function nativeDerivative(execution: ProcessArtifactExecution, stagedAssets: StagedAssetStore) {
  if (execution.status === 'ready') {
    const stagedAsset = await stagedAssets.stageBytes(execution.bytes, execution.mediaType)
    if (stagedAsset.sha256 !== execution.contentSha256) {
      throw new Error('Circuitikz PDF digest changed before staging.')
    }
    return Object.freeze({
      filename: 'diagram.pdf',
      mediaType: 'application/pdf',
      stagedAsset,
      fingerprint: Object.freeze({ id: 'notemd-circuitikz-native', version: execution.executableFingerprint }),
    })
  }
  if (execution.status === 'unavailable') {
    return Object.freeze({
      status: 'unavailable' as const,
      mediaType: 'application/pdf',
      reason: 'Tectonic executable is unavailable.',
    })
  }
  if (execution.status === 'cancelled') {
    throw processCancellation(execution.code)
  }
  return Object.freeze({ status: 'failed' as const, mediaType: 'application/pdf', code: execution.code })
}

function processCancellation(code: string): Error & { readonly code: string } {
  const error = new Error(`Circuitikz rendering was cancelled: ${code}`) as Error & { readonly code: string }
  error.name = 'AbortError'
  Object.defineProperty(error, 'code', { value: code, enumerable: true })
  return error
}

function renderCircuitikzSource(spec: DiagramSpecFor<'circuitikz'>): string {
  const components = spec.circuit.components
  const componentNames = new Map(components.map((component, index) => [component.id, `N${index + 1}`]))
  const componentMarkup = components.map((component, index) => {
    const x = 1.5 + (index % 3) * 2.5
    const y = 3.5 - Math.floor(index / 3) * 2
    const symbol = circuitikzSymbol(component.kind)
    return `  (${x},${y}) node[${symbol}] (${componentNames.get(component.id) ?? `N${index + 1}`}) {${escapeLatex(component.label)}}`
  }).join('\n')
  const connections = spec.circuit.connections.map((connection) => {
    const from = componentNames.get(connection.from)
    const to = componentNames.get(connection.to)
    if (from === undefined || to === undefined) {
      return ''
    }
    const label = connection.net === undefined ? '' : ` node[midway, above] {${escapeLatex(connection.net)}}`
    return `  (${from}) to[short] (${to})${label}`
  }).filter(Boolean).join('\n')
  return `\\documentclass[border=8pt]{standalone}\n\\usepackage{circuitikz}\n\\begin{document}\n\\begin{circuitikz}[american voltages]\n\\draw\n${componentMarkup};\n${connections.length === 0 ? '' : `\\draw\n${connections};\n`}\\end{circuitikz}\n\\end{document}\n`
}

function circuitToGraph(spec: DiagramSpecFor<'circuitikz'>): DiagramGraphInput {
  return {
    intent: 'flowchart',
    nodes: spec.circuit.components.map((component) => ({ id: component.id, label: `${component.kind}: ${component.label}` })),
    edges: spec.circuit.connections.map((connection) => ({
      from: connection.from,
      to: connection.to,
      ...(connection.net === undefined ? {} : { label: connection.net }),
    })),
  }
}

function circuitikzSymbol(kind: string): string {
  const symbols: Readonly<Record<string, string>> = {
    resistor: 'R',
    capacitor: 'C',
    inductor: 'L',
    diode: 'D',
    nmos: 'nmos',
    pmos: 'pmos',
    opamp: 'op amp',
    voltage: 'battery1',
  }
  return symbols[kind.toLocaleLowerCase()] ?? 'generic'
}

function escapeLatex(value: string): string {
  return value
    .replace(/\\/gu, '\\textbackslash{}')
    .replace(/([{}%$&#_^])/gu, '\\$1')
    .replace(/~/gu, '\\textasciitilde{}')
    .replace(/\^/gu, '\\textasciicircum{}')
}
