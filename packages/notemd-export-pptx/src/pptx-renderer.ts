import type {
  ArtifactCapability,
  PreparedDocumentArtifactRenderOutput,
  SlidevPptxExportSpec,
} from '@notemd-harness/artifacts'
import {
  prepareSlidevArtifacts,
  preparedDocumentOutput,
  processCapability,
  SLIDEV_FORK_FINGERPRINT,
  stageProcessDerivative,
} from '@notemd-harness/export-slidev'
import type { ProcessArtifactExecution, ProcessExecutableCapability } from '@notemd-harness/process'
import type { StagedAssetStore } from '@notemd-harness/vault-local'
import type { VaultDocument } from '@notemd-harness/vault'

const pptxMediaType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

export interface SlidevPptxProcess {
  renderSlidevPptx(source: string, signal?: AbortSignal): Promise<ProcessArtifactExecution>
  slidevPptxCapability(signal?: AbortSignal): Promise<ProcessExecutableCapability>
}

/** Native fork PPTX export. The result remains raster-backed OOXML, never an SVG substitute. */
export class SlidevPptxArtifactRenderer {
  readonly format = 'pptx' as const
  readonly fingerprint = SLIDEV_FORK_FINGERPRINT

  constructor(
    private readonly process: SlidevPptxProcess,
    private readonly stagedAssets: StagedAssetStore,
  ) {}

  async render(spec: SlidevPptxExportSpec, source: VaultDocument, signal?: AbortSignal): Promise<PreparedDocumentArtifactRenderOutput> {
    const prepared = prepareSlidevArtifacts(spec, source)
    const execution = await this.process.renderSlidevPptx(prepared.source.content, signal)
    const derivative = await stageProcessDerivative(
      execution,
      this.stagedAssets,
      'slides.pptx',
      pptxMediaType,
      this.fingerprint,
      'PPTX',
    )
    return preparedDocumentOutput(prepared, derivative)
  }

  async capability(signal?: AbortSignal): Promise<ArtifactCapability> {
    return processCapability(await this.process.slidevPptxCapability(signal), 'PPTX')
  }
}
