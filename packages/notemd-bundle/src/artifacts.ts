import { Service, type Context } from '@deepseek-ai/cordis'
import {
  ArtifactPlanner,
  type ArtifactCapability,
  type DiagramSpecFor,
  type NotemdArtifacts,
} from '@notemd-harness/artifacts'
import type { WorkspaceMutationPlan } from '@notemd-harness/mutation'
import { EditableSvgRenderer } from '@notemd-harness/render-editable-svg'
import { HtmlSvgRenderer } from '@notemd-harness/render-html'
import { JsonCanvasSvgRenderer } from '@notemd-harness/render-json-canvas'
import { MermaidSvgRenderer } from '@notemd-harness/render-mermaid'
import { VegaLiteSvgRenderer } from '@notemd-harness/render-vega-lite'
import type { VaultDocument } from '@notemd-harness/vault'

export class NotemdArtifactsService extends Service implements NotemdArtifacts {
  static inject = ['notemdVault'] as const

  private planner: ArtifactPlanner | undefined

  constructor(ctx: Context) {
    super(ctx, 'notemdArtifacts')
  }

  protected async [Service.init](): Promise<void> {
    this.planner = new ArtifactPlanner(this.ctx.notemdVault, {
      mermaid: new MermaidSvgRenderer(),
      vegaLite: new VegaLiteSvgRenderer(),
      jsonCanvas: new JsonCanvasSvgRenderer(),
      html: new HtmlSvgRenderer(),
      editableSvg: new EditableSvgRenderer(),
    })
  }

  planMermaidArtifact(spec: DiagramSpecFor<'mermaid'>, source: VaultDocument): WorkspaceMutationPlan {
    return this.requirePlanner().planMermaidArtifact(spec, source)
  }

  planVegaLiteArtifact(spec: DiagramSpecFor<'vega-lite'>, source: VaultDocument): WorkspaceMutationPlan {
    return this.requirePlanner().planVegaLiteArtifact(spec, source)
  }

  planJsonCanvasArtifact(spec: DiagramSpecFor<'json-canvas'>, source: VaultDocument): WorkspaceMutationPlan {
    return this.requirePlanner().planJsonCanvasArtifact(spec, source)
  }

  planHtmlArtifact(spec: DiagramSpecFor<'html'>, source: VaultDocument): WorkspaceMutationPlan {
    return this.requirePlanner().planHtmlArtifact(spec, source)
  }

  planEditableSvgArtifact(spec: DiagramSpecFor<'editable-svg'>, source: VaultDocument): WorkspaceMutationPlan {
    return this.requirePlanner().planEditableSvgArtifact(spec, source)
  }

  planCleanup(artifactId: string): Promise<readonly string[]> {
    return this.requirePlanner().planCleanup(artifactId)
  }

  mermaidRenderingCapability(): ArtifactCapability {
    return this.requirePlanner().mermaidRenderingCapability()
  }

  vegaLiteRenderingCapability(): ArtifactCapability {
    return this.requirePlanner().vegaLiteRenderingCapability()
  }

  jsonCanvasRenderingCapability(): ArtifactCapability {
    return this.requirePlanner().jsonCanvasRenderingCapability()
  }

  htmlRenderingCapability(): ArtifactCapability {
    return this.requirePlanner().htmlRenderingCapability()
  }

  editableSvgRenderingCapability(): ArtifactCapability {
    return this.requirePlanner().editableSvgRenderingCapability()
  }

  documentExportCapability(): ArtifactCapability {
    return this.requirePlanner().documentExportCapability()
  }

  private requirePlanner(): ArtifactPlanner {
    if (this.planner === undefined) {
      throw new Error('NoteMD artifacts service is not initialized.')
    }
    return this.planner
  }
}

export default NotemdArtifactsService
