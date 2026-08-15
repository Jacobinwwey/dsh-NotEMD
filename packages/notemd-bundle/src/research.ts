import { Service, type Context } from '@deepseek-ai/cordis'
import {
  DshResearchClient,
  ResearchEvidenceCatalog,
  type NotemdResearch,
  type ResearchDiscovery,
  type ResearchDiscoveryRequest,
  type ResearchEvidence,
} from '@notemd-harness/research'

import { workspaceRootFrom, type WorkspaceRootConfig } from './workspace-root.js'

/** Owns durable DSH-web discovery and evidence records for one configured workspace. */
export class NotemdResearchService extends Service implements NotemdResearch {
  static inject = ['web'] as const

  private catalog: ResearchEvidenceCatalog | undefined
  private readonly workspaceRoot: string

  constructor(ctx: Context, config: WorkspaceRootConfig) {
    super(ctx, 'notemdResearch')
    this.workspaceRoot = workspaceRootFrom(config)
  }

  protected async [Service.init](): Promise<void> {
    this.catalog = new ResearchEvidenceCatalog(this.workspaceRoot, new DshResearchClient(this.ctx.web))
  }

  discover(request: ResearchDiscoveryRequest, signal?: AbortSignal): Promise<ResearchDiscovery> {
    return this.requireCatalog().discover(request, signal)
  }

  capture(discoveryId: string, sourceIndex: number, signal?: AbortSignal): Promise<ResearchEvidence> {
    return this.requireCatalog().capture(discoveryId, sourceIndex, signal)
  }

  readEvidence(ids: readonly string[], signal?: AbortSignal): Promise<readonly ResearchEvidence[]> {
    return this.requireCatalog().readEvidence(ids, signal)
  }

  private requireCatalog(): ResearchEvidenceCatalog {
    if (this.catalog === undefined) {
      throw new Error('NoteMD research service is not initialized.')
    }
    return this.catalog
  }
}

export default NotemdResearchService
