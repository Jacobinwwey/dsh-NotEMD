import type { JobTargetResult } from './file-job-store.js'

export interface JobTargetExecution {
  target: string
  signal: AbortSignal
}

export type JobTargetExecutor = (execution: JobTargetExecution) => Promise<JobTargetResult>
export type JobTargetObserver = (result: JobTargetResult) => Promise<void>

export class BoundedJobRunner {
  constructor(private readonly concurrency: number) {
    if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
      throw new RangeError('Job runner concurrency must be a positive integer.')
    }
  }

  async run(
    targets: readonly string[],
    execute: JobTargetExecutor,
    signal: AbortSignal = new AbortController().signal,
  ): Promise<readonly JobTargetResult[]> {
    return this.runWithObserver(targets, execute, async () => undefined, signal)
  }

  async runWithObserver(
    targets: readonly string[],
    execute: JobTargetExecutor,
    observe: JobTargetObserver,
    signal: AbortSignal = new AbortController().signal,
  ): Promise<readonly JobTargetResult[]> {
    const results: Array<JobTargetResult | undefined> = new Array(targets.length)
    let nextIndex = 0

    const worker = async (): Promise<void> => {
      for (;;) {
        if (signal.aborted) {
          return
        }
        const index = nextIndex
        nextIndex += 1
        const target = targets[index]
        if (target === undefined) {
          return
        }

        let result: JobTargetResult
        try {
          const outcome = await execute({ target, signal })
          result = signal.aborted
            ? { target, status: 'cancelled' }
            : resultForTarget(target, outcome)
        } catch (error) {
          result = signal.aborted || isAbortError(error)
            ? { target, status: 'cancelled' }
            : { target, status: 'failed', detail: diagnostic(error) }
        }
        await observe(result)
        results[index] = result
      }
    }

    await Promise.all(Array.from({ length: Math.min(this.concurrency, targets.length) }, worker))

    return targets.map((target, index) => results[index] ?? { target, status: 'cancelled' })
  }
}

function resultForTarget(target: string, outcome: JobTargetResult): JobTargetResult {
  return {
    target,
    status: outcome.status,
    ...(outcome.detail === undefined ? {} : { detail: outcome.detail }),
    ...(outcome.checkpoint === undefined ? {} : { checkpoint: outcome.checkpoint }),
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function diagnostic(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
