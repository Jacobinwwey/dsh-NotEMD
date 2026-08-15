import type { ContentSha256 } from './staged-asset.js'
import type { WorkspaceMutationPlan } from './mutation-plan.js'

export const workspaceMutationReceiptStatuses = [
  'committed',
  'conflict',
  'rejected',
  'cancelled',
  'failed',
  'recovered',
] as const

export type WorkspaceMutationReceiptStatus = (typeof workspaceMutationReceiptStatuses)[number]
export type WorkspaceMutationKind = 'write-text' | 'write-bytes' | 'delete'

export interface MutationReceiptEntryDraft {
  readonly destination: string
  readonly kind: WorkspaceMutationKind
  readonly status: WorkspaceMutationReceiptStatus
  readonly revision?: string
  readonly diagnosticCode?: string
}

export interface MutationReceiptEntry {
  readonly destination: string
  readonly kind: WorkspaceMutationKind
  readonly status: WorkspaceMutationReceiptStatus
  readonly revision?: string
  readonly diagnosticCode?: string
}

export interface WorkspaceMutationReceiptDraft {
  readonly planId: string
  readonly planDigest: ContentSha256
  readonly status: WorkspaceMutationReceiptStatus
  readonly mutations: readonly MutationReceiptEntryDraft[]
}

export interface WorkspaceMutationReceipt {
  readonly version: 1
  readonly planId: string
  readonly planDigest: ContentSha256
  readonly status: WorkspaceMutationReceiptStatus
  readonly mutations: readonly MutationReceiptEntry[]
}

export interface RecoveredMutation {
  readonly planId: string
  readonly planDigest: ContentSha256
  readonly outcome: 'committed' | 'rolled-back' | 'failed'
}

export interface WorkspaceMutationExecutor {
  apply(plan: WorkspaceMutationPlan, signal?: AbortSignal): Promise<WorkspaceMutationReceipt>
  recover(signal?: AbortSignal): Promise<readonly RecoveredMutation[]>
}

export function createWorkspaceMutationReceipt(draft: WorkspaceMutationReceiptDraft): WorkspaceMutationReceipt {
  const mutations = draft.mutations.map(cloneReceiptEntry)

  if (mutations.length === 0) {
    throw new RangeError('A workspace mutation receipt must contain at least one mutation record.')
  }

  const destinations = new Set<string>()
  for (const mutation of mutations) {
    if (destinations.has(mutation.destination)) {
      throw new RangeError(`A workspace mutation receipt may contain each destination only once: ${mutation.destination}`)
    }
    destinations.add(mutation.destination)
  }

  return Object.freeze({
    version: 1,
    planId: requireReceiptIdentifier(draft.planId, 'Mutation receipt plan id'),
    planDigest: requireSha256(draft.planDigest, 'Mutation receipt plan digest'),
    status: requireReceiptStatus(draft.status),
    mutations: Object.freeze(mutations),
  })
}

function cloneReceiptEntry(draft: MutationReceiptEntryDraft): MutationReceiptEntry {
  const entry: {
    destination: string
    kind: WorkspaceMutationKind
    status: WorkspaceMutationReceiptStatus
    revision?: string
    diagnosticCode?: string
  } = {
    destination: requireWorkspaceDestination(draft.destination),
    kind: requireMutationKind(draft.kind),
    status: requireReceiptStatus(draft.status),
  }

  if (draft.revision !== undefined) {
    entry.revision = requireReceiptIdentifier(draft.revision, 'Mutation receipt revision')
  }
  if (draft.diagnosticCode !== undefined) {
    entry.diagnosticCode = requireDiagnosticCode(draft.diagnosticCode)
  }
  return Object.freeze(entry)
}

function requireReceiptStatus(value: string): WorkspaceMutationReceiptStatus {
  if (!workspaceMutationReceiptStatuses.includes(value as WorkspaceMutationReceiptStatus)) {
    throw new RangeError('A mutation receipt status must use the closed receipt vocabulary.')
  }
  return value as WorkspaceMutationReceiptStatus
}

function requireMutationKind(value: string): WorkspaceMutationKind {
  if (value !== 'write-text' && value !== 'write-bytes' && value !== 'delete') {
    throw new RangeError('A mutation receipt kind must identify a supported mutation type.')
  }
  return value
}

function requireWorkspaceDestination(value: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.includes('\\') ||
    value.startsWith('/') ||
    /^[A-Za-z]:/u.test(value)
  ) {
    throw new RangeError('A mutation receipt destination must be a relative slash-separated workspace path.')
  }
  const segments = value.split('/')
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..' || segment.includes('\u0000'))) {
    throw new RangeError('A mutation receipt destination must not contain empty, dot, or parent segments.')
  }
  return segments.join('/')
}

function requireReceiptIdentifier(value: string, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.includes('\u0000')) {
    throw new RangeError(`${field} must be non-empty text without NUL bytes.`)
  }
  return value
}

function requireSha256(value: string, field: string): ContentSha256 {
  if (!/^[a-f0-9]{64}$/u.test(value)) {
    throw new RangeError(`${field} must be a lowercase SHA-256 digest.`)
  }
  return value
}

function requireDiagnosticCode(value: string): string {
  if (!/^[a-z0-9][a-z0-9.-]{0,127}$/u.test(value)) {
    throw new RangeError('A mutation receipt diagnostic code must be a stable non-secret identifier.')
  }
  return value
}
