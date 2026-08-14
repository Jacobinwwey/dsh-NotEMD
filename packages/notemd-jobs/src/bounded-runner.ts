import type { JobTargetResult } from './file-job-store.js'

export interface JobTargetExecution {
  target: string
  signal: AbortSignal
}

export type JobTargetExecutor = (execution: JobTargetExecution) => Promise<JobTargetResult>

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

        try {
          const outcome = await execute({ target, signal })
          results[index] = signal.aborted
            ? { target, status: 'cancelled' }
            : resultForTarget(target, outcome)
        } catch (error) {
          results[index] = signal.aborted || isAbortError(error)
            ? { target, status: 'cancelled' }
            : { target, status: 'failed', detail: diagnostic(error) }
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(this.concurrency, targets.length) }, worker))

    return targets.map((target, index) => results[index] ?? { target, status: 'cancelled' })
  }
}

function resultForTarget(target: string, outcome: JobTargetResult): JobTargetResult {
  if (outcome.detail === undefined) {
    return { target, status: outcome.status }
  }
  return { target, status: outcome.status, detail: outcome.detail }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function diagnostic(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
