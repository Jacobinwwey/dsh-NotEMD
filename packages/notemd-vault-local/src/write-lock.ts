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
}
