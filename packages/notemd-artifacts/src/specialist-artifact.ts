import type { WorkspaceMutationPlan } from '@notemd-harness/mutation'
import type { VaultDocument } from '@notemd-harness/vault'

import { compileRenderedArtifactPlan, type ArtifactCapability } from './artifact-manifest.js'
import type {
  DiagramSpecFor,
  SpecialistArtifactRenderers,
} from './artifact-renderer.js'

/** Named planners for targets whose fidelity and runtime boundary differ from SVG-native renderers. */
export class SpecialistArtifactPlanner {
  constructor(private readonly renderers: SpecialistArtifactRenderers) {}

  async planDrawioArtifact(
    spec: DiagramSpecFor<'drawio'>,
    source: VaultDocument,
    signal?: AbortSignal,
  ): Promise<WorkspaceMutationPlan> {
    const rendered = await this.renderers.drawio.render(spec, signal)
    return compileRenderedArtifactPlan(spec, source, this.renderers.drawio.fingerprint, rendered)
  }

  async planDrawnixArtifact(
    spec: DiagramSpecFor<'drawnix'>,
    source: VaultDocument,
    signal?: AbortSignal,
  ): Promise<WorkspaceMutationPlan> {
    const rendered = await this.renderers.drawnix.render(spec, signal)
    return compileRenderedArtifactPlan(spec, source, this.renderers.drawnix.fingerprint, rendered)
  }

  async planCircuitikzArtifact(
    spec: DiagramSpecFor<'circuitikz'>,
    source: VaultDocument,
    signal?: AbortSignal,
  ): Promise<WorkspaceMutationPlan> {
    const rendered = await this.renderers.circuitikz.render(spec, signal)
    return compileRenderedArtifactPlan(spec, source, this.renderers.circuitikz.fingerprint, rendered)
  }

  drawioRenderingCapability(signal?: AbortSignal): Promise<ArtifactCapability> {
    return this.renderers.drawio.capability(signal)
  }

  drawnixRenderingCapability(signal?: AbortSignal): Promise<ArtifactCapability> {
    return this.renderers.drawnix.capability(signal)
  }

  circuitikzRenderingCapability(signal?: AbortSignal): Promise<ArtifactCapability> {
    return this.renderers.circuitikz.capability(signal)
  }
}
