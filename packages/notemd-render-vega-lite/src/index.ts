import {
  renderChartProjectionSvg,
  validateDiagramSpec,
  type DiagramArtifactRenderer,
  type DiagramArtifactRenderOutput,
  type VegaLiteDiagramSpec,
} from '@notemd-harness/artifacts'

export class VegaLiteSvgRenderer implements DiagramArtifactRenderer {
  readonly target = 'vega-lite' as const
  readonly fingerprint = Object.freeze({ id: 'notemd-vega-lite-projection', version: '1' })

  render(specInput: VegaLiteDiagramSpec): DiagramArtifactRenderOutput {
    const spec = validateDiagramSpec(specInput)
    if (spec.canonicalTarget !== 'vega-lite') {
      throw new Error('VegaLiteSvgRenderer requires a Vega-Lite DiagramSpec.')
    }
    const svg = renderChartProjectionSvg(spec.chart, {
      title: spec.title,
      rendererId: 'vega-lite-projection',
      projection: 'vega-lite',
      subtitle: 'Vega-Lite chart projection',
      theme: spec.rendererIntent.theme,
      fontFamily: spec.rendererIntent.fontFamily,
    })
    return Object.freeze({
      source: Object.freeze({
        filename: 'diagram.vl.json',
        mediaType: 'application/vnd.vegalite.v5+json',
        content: `${JSON.stringify(vegaLiteSource(spec), null, 2)}\n`,
      }),
      preview: Object.freeze({ filename: 'preview.svg', mediaType: 'image/svg+xml', content: svg }),
      export: Object.freeze({ filename: 'export.svg', mediaType: 'image/svg+xml', content: svg }),
    })
  }
}

function vegaLiteSource(spec: VegaLiteDiagramSpec) {
  const values = spec.chart.series.flatMap((series) => series.points.map((point) => ({
    x: point.x,
    y: point.y,
    series: series.label,
  })))
  const mark = spec.chart.chartType === 'scatter' ? 'point' : spec.chart.chartType === 'pie' ? 'arc' : spec.chart.chartType
  if (spec.chart.chartType === 'pie') {
    return {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      description: spec.title,
      data: { values },
      mark,
      encoding: {
        theta: { field: 'y', type: 'quantitative' },
        color: { field: 'x', type: 'nominal' },
      },
    }
  }
  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    description: spec.title,
    data: { values },
    mark,
    encoding: {
      x: { field: 'x', type: values.every((value) => typeof value.x === 'number') ? 'quantitative' : 'ordinal' },
      y: { field: 'y', type: 'quantitative' },
      color: { field: 'series', type: 'nominal' },
    },
  }
}
