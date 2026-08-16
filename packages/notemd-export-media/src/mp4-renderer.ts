import type {
  ArtifactCapability,
  PreparedDocumentArtifactRenderOutput,
  SlidevMp4ExportSpec,
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

export interface SlidevMp4Process {
  renderSlidevMp4(
    source: string,
    options: {
      readonly withClicks: boolean
      readonly imageScale: number
      readonly fps: number
      readonly crf: number
    },
    signal?: AbortSignal,
  ): Promise<ProcessArtifactExecution>
  slidevMp4Capability(signal?: AbortSignal): Promise<ProcessExecutableCapability>
}

/** Real MP4 export through the staged Slidev PNG sequence and FFmpeg pipeline. */
export class SlidevMp4ArtifactRenderer {
  readonly format = 'mp4' as const
  readonly fingerprint = SLIDEV_FORK_FINGERPRINT

  constructor(
    private readonly process: SlidevMp4Process,
    private readonly stagedAssets: StagedAssetStore,
  ) {}

  async render(spec: SlidevMp4ExportSpec, source: VaultDocument, signal?: AbortSignal): Promise<PreparedDocumentArtifactRenderOutput> {
    const prepared = prepareSlidevArtifacts(spec, source)
    const execution = await this.process.renderSlidevMp4(
      prepared.source.content,
      {
        withClicks: spec.withClicks,
        imageScale: spec.imageScale,
        fps: spec.fps,
        crf: spec.crf,
      },
      signal,
    )
    const derivative = await stageProcessDerivative(
      execution,
      this.stagedAssets,
      'slides.mp4',
      'video/mp4',
      this.fingerprint,
      'MP4',
    )
    return preparedDocumentOutput(prepared, derivative)
  }

  async capability(signal?: AbortSignal): Promise<ArtifactCapability> {
    return processCapability(await this.process.slidevMp4Capability(signal), 'MP4')
  }
}
