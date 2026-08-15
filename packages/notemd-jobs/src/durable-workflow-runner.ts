import { BoundedJobRunner } from './bounded-runner.js'
import {
  type FileJobStore,
  type JobRecord,
  type JobTargetResult,
  type JsonValue,
  pendingTargets,
} from './file-job-store.js'

export interface WorkflowJobExecutor<I extends JsonValue = JsonValue> {
  readonly workflow: string
  execute(input: Readonly<I>, target: string, signal: AbortSignal): Promise<JobTargetResult>
}

export class DurableWorkflowRunner<I extends JsonValue = JsonValue> {
  private readonly runner: BoundedJobRunner

  constructor(
    private readonly store: FileJobStore<I>,
    private readonly executor: WorkflowJobExecutor<I>,
    concurrency = 1,
  ) {
    this.runner = new BoundedJobRunner(concurrency)
  }

  async resume(id: string, signal?: AbortSignal): Promise<JobRecord<I>> {
    const record = await this.store.beginExecution(id, this.executor.workflow)
    const targets = pendingTargets(record)

    try {
      await this.runner.runWithObserver(
        targets,
        async ({ target, signal: targetSignal }) => this.executor.execute(record.input, target, targetSignal),
        async (result) => {
          await this.store.recordTargetCheckpoint(id, result)
        },
        signal,
      )
      return this.store.finishExecution(id)
    } catch (error) {
      return this.store.failExecution(id, diagnostic(error))
    }
  }
}

function diagnostic(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
