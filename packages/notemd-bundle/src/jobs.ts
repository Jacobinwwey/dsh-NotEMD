import { Service, type Context } from '@deepseek-ai/cordis'
import {
  DurableWorkflowRunner,
  FileJobStore,
  JobStoreError,
  type JobRecord,
  type JsonValue,
  type WorkflowJobExecutor,
} from '@notemd-harness/jobs'
import type {
  ConceptJobRequest,
  FormulaRepairJobRequest,
  MermaidRepairJobRequest,
  NotemdJobs,
  ResearchJobRequest,
  TitleJobRequest,
  TranslationJobRequest,
  WikiLinkJobRequest,
} from '@notemd-harness/tools'
import type { WritePlan } from '@notemd-harness/vault'
import type { WorkflowPlanner } from '@notemd-harness/workflows'

import { workspaceRootFrom, type WorkspaceRootConfig } from './workspace-root.js'

const DEFAULT_JOB_CONCURRENCY = 2

export interface NotemdJobsConfig extends WorkspaceRootConfig {
  readonly concurrency?: number
}

export class NotemdJobsService extends Service implements NotemdJobs {
  static inject = ['notemdWorkflows'] as const

  private store: FileJobStore | undefined
  private executors = new Map<string, WorkflowJobExecutor>()
  private readonly activeControllers = new Map<string, AbortController>()
  private readonly workspaceRoot: string
  private readonly concurrency: number

  constructor(ctx: Context, config: NotemdJobsConfig) {
    super(ctx, 'notemdJobs')
    this.workspaceRoot = workspaceRootFrom(config)
    this.concurrency = concurrencyFrom(config)
  }

  protected async [Service.init](): Promise<void> {
    this.store = await FileJobStore.open(this.workspaceRoot)
    await this.store.recoverInterrupted()
    this.executors = planningExecutors(this.ctx.notemdWorkflows)
  }

  async startFormulaRepairs(request: FormulaRepairJobRequest): Promise<JobRecord> {
    return this.startEmptyInputJob('formula-repair', request)
  }

  async startMermaidRepairs(request: MermaidRepairJobRequest): Promise<JobRecord> {
    return this.startEmptyInputJob('mermaid-repair', request)
  }

  async startTranslations(request: TranslationJobRequest): Promise<JobRecord> {
    return this.startJob('translation', request, { language: nonEmpty(request.language, 'translation language') })
  }

  async startWikiLinkPlans(request: WikiLinkJobRequest): Promise<JobRecord> {
    return this.startEmptyInputJob('wiki-links', request)
  }

  async startTitlePlans(request: TitleJobRequest): Promise<JobRecord> {
    return this.startEmptyInputJob('title-generation', request)
  }

  async startResearchSyntheses(request: ResearchJobRequest): Promise<JobRecord> {
    return this.startJob('research-synthesis', request, { sources: nonEmptyStrings(request.sources, 'research sources') })
  }

  async startConceptExtractions(request: ConceptJobRequest): Promise<JobRecord> {
    return this.startEmptyInputJob('concept-extraction', request)
  }

  async resume(id: string): Promise<JobRecord> {
    const record = await this.requireStore().get(id)
    if (record === undefined) {
      throw new JobStoreError('JOB_NOT_FOUND', `Job does not exist: ${id}`)
    }
    if (record.state === 'queued') {
      this.requireExecutor(record.workflow)
      this.launch(record.id)
    }
    return record
  }

  get(id: string): Promise<JobRecord | undefined> {
    return this.requireStore().get(id)
  }

  async cancel(id: string): Promise<JobRecord> {
    const record = await this.requireStore().cancel(id)
    this.activeControllers.get(id)?.abort()
    return record
  }

  private async startEmptyInputJob(
    workflow: string,
    request: FormulaRepairJobRequest | MermaidRepairJobRequest | WikiLinkJobRequest | TitleJobRequest | ConceptJobRequest,
  ): Promise<JobRecord> {
    return this.startJob(workflow, request, {})
  }

  private async startJob(
    workflow: string,
    request: { readonly idempotencyKey: string; readonly targets: readonly string[] },
    input: JsonValue,
  ): Promise<JobRecord> {
    const executor = this.requireExecutor(workflow)
    const job = await this.requireStore().start({
      workflow: executor.workflow,
      idempotencyKey: nonEmpty(request.idempotencyKey, 'job idempotency key'),
      input,
      targets: nonEmptyStrings(request.targets, 'job targets'),
    })
    if (job.state === 'queued') {
      this.launch(job.id)
    }
    return job
  }

  private launch(id: string): void {
    if (this.activeControllers.has(id)) {
      return
    }
    const controller = new AbortController()
    this.activeControllers.set(id, controller)
    void this.execute(id, controller)
  }

  private async execute(id: string, controller: AbortController): Promise<void> {
    try {
      const record = await this.requireStore().get(id)
      if (record === undefined || record.state !== 'queued') {
        return
      }
      const executor = this.requireExecutor(record.workflow)
      await new DurableWorkflowRunner(this.requireStore(), executor, this.concurrency).resume(id, controller.signal)
    } catch (error) {
      const current = await this.requireStore().get(id).catch(() => undefined)
      if (current !== undefined && !isTerminal(current.state)) {
        await this.requireStore().failExecution(id, diagnostic(error)).catch((failure) => {
          this.ctx.logger.warn(`notemd job ${id} could not record an execution failure: ${diagnostic(failure)}`)
        })
      }
      this.ctx.logger.warn(`notemd job ${id} execution failed: ${diagnostic(error)}`)
    } finally {
      if (this.activeControllers.get(id) === controller) {
        this.activeControllers.delete(id)
      }
    }
  }

  private requireStore(): FileJobStore {
    if (this.store === undefined) {
      throw new Error('NoteMD jobs service is not initialized.')
    }
    return this.store
  }

  private requireExecutor(workflow: string): WorkflowJobExecutor {
    const executor = this.executors.get(workflow)
    if (executor === undefined) {
      throw new JobStoreError('JOB_WORKFLOW_MISMATCH', `No installed NoteMD executor can resume workflow ${workflow}.`)
    }
    return executor
  }
}

function planningExecutors(workflows: WorkflowPlanner): Map<string, WorkflowJobExecutor> {
  return new Map([
    ['formula-repair', planningExecutor('formula-repair', async (target) => workflows.planFormulaRepair(target))],
    ['mermaid-repair', planningExecutor('mermaid-repair', async (target, _input, signal) => workflows.planMermaidRepair(target, signal))],
    ['translation', planningExecutor('translation', async (target, input, signal) => workflows.planTranslation(target, stringInput(input, 'language'), signal))],
    ['wiki-links', planningExecutor('wiki-links', async (target, _input, signal) => workflows.planWikiLinks(target, signal))],
    ['title-generation', planningExecutor('title-generation', async (target, _input, signal) => workflows.planTitleGeneration(target, signal))],
    ['research-synthesis', planningExecutor('research-synthesis', async (target, input, signal) => workflows.planResearchSynthesis(target, stringListInput(input, 'sources'), signal))],
    ['concept-extraction', planningExecutor('concept-extraction', async (target, _input, signal) => workflows.planConceptExtraction(target, signal))],
  ])
}

function planningExecutor(
  workflow: string,
  createPlan: (target: string, input: Readonly<JsonValue>, signal: AbortSignal) => Promise<WritePlan>,
): WorkflowJobExecutor {
  return {
    workflow,
    async execute(input, target, signal) {
      return { target, status: 'completed', checkpoint: planCheckpoint(await createPlan(target, input, signal)) }
    },
  }
}

function planCheckpoint(plan: WritePlan): JsonValue {
  return {
    plan: {
      id: plan.id,
      digest: plan.digest,
      writes: plan.writes.map((write) => ({
        path: write.path,
        content: write.content,
        expectedRevision: write.expectedRevision,
      })),
    },
  }
}

function stringInput(input: Readonly<JsonValue>, key: string): string {
  const value = objectInput(input)[key]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new JobStoreError('JOB_RECORD_INVALID', `Persisted job input requires non-empty ${key}.`)
  }
  return value
}

function stringListInput(input: Readonly<JsonValue>, key: string): readonly string[] {
  const value = objectInput(input)[key]
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
    throw new JobStoreError('JOB_RECORD_INVALID', `Persisted job input requires non-empty ${key}.`)
  }
  return value as readonly string[]
}

function objectInput(input: Readonly<JsonValue>): Readonly<Record<string, JsonValue>> {
  if (!isJsonObject(input)) {
    throw new JobStoreError('JOB_RECORD_INVALID', 'Persisted planning job input must be an object.')
  }
  return input
}

function isJsonObject(value: Readonly<JsonValue>): value is Readonly<Record<string, JsonValue>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonEmpty(value: string, description: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`NoteMD ${description} must be a non-empty string.`)
  }
  return value
}

function nonEmptyStrings(values: readonly string[], description: string): readonly string[] {
  if (values.length === 0 || values.some((value) => typeof value !== 'string' || value.trim().length === 0)) {
    throw new TypeError(`NoteMD ${description} must contain non-empty strings.`)
  }
  return [...values]
}

function concurrencyFrom(config: NotemdJobsConfig): number {
  const concurrency = config.concurrency ?? DEFAULT_JOB_CONCURRENCY
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 16) {
    throw new RangeError('NoteMD job concurrency must be an integer from 1 through 16.')
  }
  return concurrency
}

function isTerminal(state: JobRecord['state']): boolean {
  return state === 'completed' || state === 'cancelled' || state === 'failed'
}

function diagnostic(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export default NotemdJobsService
