import { createHash } from 'node:crypto'

export type Revision = string
export type ExpectedRevision = Revision | 'absent'

export interface VaultDocument {
  path: string
  content: string
  revision: Revision
}

export interface PlannedWrite {
  path: string
  content: string
  expectedRevision: ExpectedRevision
}

export interface WritePlan {
  id: string
  digest: string
  writes: readonly PlannedWrite[]
}

export type WriteStatus = 'created' | 'updated' | 'skipped-stale' | 'rejected' | 'cancelled' | 'failed'

export interface WriteResult {
  path: string
  status: WriteStatus
  revision?: Revision
  diagnostic?: string
}

export interface NotemdVault {
  listMarkdown(signal?: AbortSignal): Promise<readonly string[]>
  read(path: string, signal?: AbortSignal): Promise<VaultDocument>
  apply(plan: WritePlan, signal?: AbortSignal): Promise<readonly WriteResult[]>
}

export function createRevision(content: string): Revision {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

export function createWritePlan(writes: readonly PlannedWrite[]): WritePlan {
  const orderedWrites = writes
    .map((write) =>
      Object.freeze({
        path: write.path,
        content: write.content,
        expectedRevision: write.expectedRevision,
      }),
    )
    .sort((left, right) => left.path.localeCompare(right.path))

  for (let index = 1; index < orderedWrites.length; index += 1) {
    if (orderedWrites[index - 1]?.path === orderedWrites[index]?.path) {
      throw new RangeError(`A write plan may contain each path only once: ${orderedWrites[index]?.path}`)
    }
  }

  const canonicalJson = JSON.stringify(
    orderedWrites.map(({ path, expectedRevision, content }) => ({ path, expectedRevision, content })),
  )
  const digest = createHash('sha256').update(canonicalJson, 'utf8').digest('hex')

  return Object.freeze({
    id: `notemd-plan-${digest.slice(0, 20)}`,
    digest,
    writes: Object.freeze(orderedWrites),
  })
}
