import { createHash } from 'node:crypto'

export class ExpiringValueCache<T> {
  private readonly entries = new Map<string, { expiresAt: number; value: T }>()

  get(key: string, now: number): T | undefined {
    const entry = this.entries.get(key)
    if (entry === undefined) {
      return undefined
    }
    if (entry.expiresAt <= now) {
      this.entries.delete(key)
      return undefined
    }
    return entry.value
  }

  set(key: string, value: T, ttlMs: number, now: number): void {
    this.entries.set(key, { value, expiresAt: now + ttlMs })
  }
}

export function canonicalRequestDigest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(value)), 'utf8').digest('hex')
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize)
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    )
  }
  return value
}
