import {
  renderGraphProjectionSvg,
  validateDiagramSpec,
  type DiagramArtifactRenderer,
  type DiagramArtifactRenderOutput,
  type EditableSvgDiagramSpec,
} from '@notemd-harness/artifacts'

export class EditableSvgRenderer implements DiagramArtifactRenderer {
  readonly target = 'editable-svg' as const
  readonly fingerprint = Object.freeze({ id: 'notemd-editable-svg', version: '1' })

  render(specInput: EditableSvgDiagramSpec): DiagramArtifactRenderOutput {
    const spec = validateDiagramSpec(specInput)
    if (spec.canonicalTarget !== 'editable-svg') {
      throw new Error('EditableSvgRenderer requires an editable SVG DiagramSpec.')
    }
    const svg = renderGraphProjectionSvg(spec.graph, {
      title: spec.title,
      rendererId: 'editable-svg',
      subtitle: 'Editable SVG source',
      theme: spec.rendererIntent.theme,
      fontFamily: spec.rendererIntent.fontFamily,
    })
    return Object.freeze({
      source: Object.freeze({ filename: 'diagram.svg', mediaType: 'image/svg+xml', content: svg }),
      preview: Object.freeze({ filename: 'preview.svg', mediaType: 'image/svg+xml', content: svg }),
      export: Object.freeze({ filename: 'export.svg', mediaType: 'image/svg+xml', content: svg }),
    })
  }
}
