export class TargetWriteLocks {
  private readonly tails = new Map<string, Promise<void>>()

  async run<T>(target: string, operation: () => Promise<T>): Promise<T> {
    const predecessor = this.tails.get(target) ?? Promise.resolve()
    let releaseCurrent!: () => void
    const current = new Promise<void>((resolve) => {
      releaseCurrent = resolve
    })
    const tail = predecessor.then(() => current)

    this.tails.set(target, tail)
    await predecessor

    try {
      return await operation()
    } finally {
      releaseCurrent()
      if (this.tails.get(target) === tail) {
        this.tails.delete(target)
      }
    }
  }

  async runAll<T>(targets: readonly string[], operation: () => Promise<T>): Promise<T> {
    const orderedTargets = [...new Set(targets)].sort(compareTargets)
    return this.acquireInOrder(orderedTargets, 0, operation)
  }

  private async acquireInOrder<T>(
    orderedTargets: readonly string[],
    index: number,
    operation: () => Promise<T>,
  ): Promise<T> {
    const target = orderedTargets[index]
    if (target === undefined) {
      return operation()
    }
    return this.run(target, () => this.acquireInOrder(orderedTargets, index + 1, operation))
  }
}

function compareTargets(left: string, right: string): number {
  if (left < right) {
    return -1
  }
  if (left > right) {
    return 1
  }
  return 0
}
