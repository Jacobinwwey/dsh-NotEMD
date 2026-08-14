import { Service, type Context } from '@deepseek-ai/cordis'
import { SourceArtifactPlanner, type DiagramSpec, type NotemdArtifacts } from '@notemd-harness/artifacts'
import type { VaultDocument, WritePlan } from '@notemd-harness/vault'

export class NotemdArtifactsService extends Service implements NotemdArtifacts {
  static inject = ['notemdVault'] as const

  private planner: SourceArtifactPlanner | undefined

  constructor(ctx: Context) {
    super(ctx, 'notemdArtifacts')
  }

  protected async [Service.init](): Promise<void> {
    this.planner = new SourceArtifactPlanner(this.ctx.notemdVault)
  }

  planDiagram(spec: DiagramSpec, source: VaultDocument): WritePlan {
    return this.requirePlanner().planDiagram(spec, source)
  }

  planCleanup(artifactId: string): Promise<readonly string[]> {
    return this.requirePlanner().planCleanup(artifactId)
  }

  private requirePlanner(): SourceArtifactPlanner {
    if (this.planner === undefined) {
      throw new Error('NoteMD artifacts service is not initialized.')
    }
    return this.planner
  }
}

export default NotemdArtifactsService
