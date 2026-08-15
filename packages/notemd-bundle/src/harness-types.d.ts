declare module '@deepseek-ai/cordis' {
  export interface Context {
    readonly approval?: {
      request(request: {
        readonly agent: unknown
        readonly toolName: string
        readonly callId?: unknown
        readonly reason?: string
        readonly signal?: AbortSignal
      }): Promise<unknown>
    }
    readonly llm: import('@notemd-harness/llm-dsh').DshLlmRuntime
    readonly notemdVault: import('@notemd-harness/vault').NotemdVault
    readonly notemdJobs: import('@notemd-harness/tools').NotemdJobs
    readonly notemdWorkspaceChanges: import('./workspace-changes.js').NotemdWorkspaceChangeService
    readonly notemdKnowledge: import('@notemd-harness/tools').NotemdKnowledge
    readonly notemdArtifacts: import('@notemd-harness/artifacts').NotemdArtifacts
    readonly notemdTextTransformer: import('@notemd-harness/workflows').TextTransformer
    readonly notemdWorkflows: import('@notemd-harness/workflows').WorkflowPlanner
    readonly notemdApprovalGate: import('@notemd-harness/tools').NotemdApprovalGate
    readonly logger: { warn(message: unknown): unknown }
    effect(callback: () => void | (() => void), name?: string): unknown
    plugin(plugin: unknown, config?: unknown): unknown
  }

  export abstract class Service {
    static readonly init: unique symbol
    protected readonly ctx: Context
    constructor(ctx: Context, name?: string)
  }
}

declare module '@deepseek-ai/dsh-tools' {
  export function defineTool<T>(definition: T): T
}

declare module '@deepseek-ai/schemastery' {
  const schema: unknown
  export default schema
}
