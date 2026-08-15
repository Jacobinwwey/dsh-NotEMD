import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  createWorkspaceMutationPlan,
  type ContentSha256,
  type WorkspaceMutationPlan,
} from '@notemd-harness/mutation'

export interface ApprovalReceipt {
  approvalId: string
  planId: string
  digest: ContentSha256
  assetDigests: readonly ContentSha256[]
  expiresAt: number
}

export interface ApprovalLedger {
  issue(plan: WorkspaceMutationPlan): Promise<ApprovalReceipt>
  consume(plan: WorkspaceMutationPlan, approvalId: string): Promise<boolean>
}

export interface FileApprovalLedgerOptions {
  now?: () => number
  ttlMs?: number
}

interface StoredReceipt extends ApprovalReceipt {
  issuedAt: number
  consumedAt?: number
}

export class ApprovalReceiptError extends Error {
  constructor(readonly code: 'APPROVAL_RECEIPT_INVALID' | 'APPROVAL_PLAN_INVALID', message: string) {
    super(message)
    this.name = 'ApprovalReceiptError'
  }
}

export class FileApprovalLedger implements ApprovalLedger {
  private writeTail = Promise.resolve()

  private constructor(
    private readonly approvalsDirectory: string,
    private readonly now: () => number,
    private readonly ttlMs: number,
  ) {}

  static async open(workspaceRoot: string, options: FileApprovalLedgerOptions = {}): Promise<FileApprovalLedger> {
    const ttlMs = options.ttlMs ?? 5 * 60 * 1_000
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 1) {
      throw new RangeError('Approval receipt TTL must be a positive integer.')
    }

    const approvalsDirectory = join(workspaceRoot, '.notemd', 'approvals')
    await mkdir(approvalsDirectory, { recursive: true })
    return new FileApprovalLedger(approvalsDirectory, options.now ?? Date.now, ttlMs)
  }

  async issue(plan: WorkspaceMutationPlan): Promise<ApprovalReceipt> {
    const canonicalPlan = canonicalPlanOf(plan)

    return this.synchronize(async () => {
      const issuedAt = this.now()
      const receipt: StoredReceipt = {
        approvalId: `notemd-approval-${randomUUID()}`,
        planId: canonicalPlan.id,
        digest: canonicalPlan.digest,
        assetDigests: assetDigestsOf(canonicalPlan),
        issuedAt,
        expiresAt: issuedAt + this.ttlMs,
      }
      await this.persist(receipt)
      return publicReceipt(receipt)
    })
  }

  async consume(plan: WorkspaceMutationPlan, approvalId: string): Promise<boolean> {
    let canonicalPlan: WorkspaceMutationPlan
    try {
      canonicalPlan = canonicalPlanOf(plan)
    } catch {
      return false
    }
    if (!/^notemd-approval-[a-f0-9-]+$/u.test(approvalId)) {
      return false
    }

    return this.synchronize(async () => {
      const receipt = await this.read(approvalId)
      if (
        receipt === undefined ||
        receipt.consumedAt !== undefined ||
        receipt.expiresAt < this.now() ||
        receipt.planId !== canonicalPlan.id ||
        receipt.digest !== canonicalPlan.digest ||
        !sameAssetDigests(receipt.assetDigests, assetDigestsOf(canonicalPlan))
      ) {
        return false
      }

      const consumed: StoredReceipt = { ...receipt, consumedAt: this.now() }
      await this.persist(consumed)
      return true
    })
  }

  private async read(approvalId: string): Promise<StoredReceipt | undefined> {
    try {
      const content = await readFile(this.pathFor(approvalId), 'utf8')
      return parseReceipt(JSON.parse(content))
    } catch (error) {
      if (isMissingPath(error)) {
        return undefined
      }
      if (error instanceof ApprovalReceiptError) {
        throw error
      }
      throw new ApprovalReceiptError('APPROVAL_RECEIPT_INVALID', `Approval receipt cannot be read: ${approvalId}`)
    }
  }

  private async persist(receipt: StoredReceipt): Promise<void> {
    const destination = this.pathFor(receipt.approvalId)
    const temporary = `${destination}.${randomUUID()}.tmp`
    try {
      await writeFile(temporary, `${JSON.stringify(receipt)}\n`, { encoding: 'utf8', mode: 0o600 })
      await rename(temporary, destination)
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined)
      throw error
    }
  }

  private pathFor(approvalId: string): string {
    return join(this.approvalsDirectory, `${approvalId}.json`)
  }

  private async synchronize<T>(operation: () => Promise<T>): Promise<T> {
    const predecessor = this.writeTail
    let release!: () => void
    this.writeTail = new Promise<void>((resolve) => {
      release = resolve
    })
    await predecessor

    try {
      return await operation()
    } finally {
      release()
    }
  }
}

function canonicalPlanOf(plan: WorkspaceMutationPlan): WorkspaceMutationPlan {
  if (!Array.isArray(plan.mutations)) {
    throw new ApprovalReceiptError('APPROVAL_PLAN_INVALID', 'Approval requires a workspace mutation plan with mutations.')
  }

  let canonical: WorkspaceMutationPlan
  try {
    canonical = createWorkspaceMutationPlan({
      provenance: plan.provenance,
      mutations: plan.mutations,
    })
  } catch (error) {
    throw new ApprovalReceiptError(
      'APPROVAL_PLAN_INVALID',
      `Approval requires a canonical workspace mutation plan: ${diagnostic(error)}`,
    )
  }
  if (plan.id !== canonical.id || plan.digest !== canonical.digest) {
    throw new ApprovalReceiptError('APPROVAL_PLAN_INVALID', 'Approval requires an unmodified canonical workspace mutation plan.')
  }
  return canonical
}

function parseReceipt(value: unknown): StoredReceipt {
  if (!isObject(value)) {
    throw invalidReceipt()
  }

  const approvalId = stringProperty(value, 'approvalId')
  const planId = stringProperty(value, 'planId')
  const digest = stringProperty(value, 'digest')
  const assetDigests = assetDigestProperty(value)
  const issuedAt = numberProperty(value, 'issuedAt')
  const expiresAt = numberProperty(value, 'expiresAt')
  const consumedAt = value.consumedAt
  if (!/^notemd-approval-[a-f0-9-]+$/u.test(approvalId) || consumedAt !== undefined && !isTimestamp(consumedAt)) {
    throw invalidReceipt()
  }

  const receipt: StoredReceipt = { approvalId, planId, digest, assetDigests, issuedAt, expiresAt }
  if (consumedAt !== undefined) {
    receipt.consumedAt = consumedAt
  }
  return receipt
}

function publicReceipt(receipt: StoredReceipt): ApprovalReceipt {
  return {
    approvalId: receipt.approvalId,
    planId: receipt.planId,
    digest: receipt.digest,
    assetDigests: receipt.assetDigests,
    expiresAt: receipt.expiresAt,
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stringProperty(value: Record<string, unknown>, key: string): string {
  const property = value[key]
  if (typeof property !== 'string' || property.length === 0) {
    throw invalidReceipt()
  }
  return property
}

function numberProperty(value: Record<string, unknown>, key: string): number {
  const property = value[key]
  if (!isTimestamp(property)) {
    throw invalidReceipt()
  }
  return property
}

function assetDigestProperty(value: Record<string, unknown>): readonly ContentSha256[] {
  const raw = value.assetDigests
  if (!Array.isArray(raw) || raw.some((digest) => typeof digest !== 'string' || !/^[a-f0-9]{64}$/u.test(digest))) {
    throw invalidReceipt()
  }
  const assetDigests = [...raw] as ContentSha256[]
  if (new Set(assetDigests).size !== assetDigests.length || !sameAssetDigests(assetDigests, [...assetDigests].sort())) {
    throw invalidReceipt()
  }
  return Object.freeze(assetDigests)
}

function assetDigestsOf(plan: WorkspaceMutationPlan): readonly ContentSha256[] {
  return Object.freeze(
    [...new Set(plan.mutations.flatMap((mutation) => mutation.kind === 'write-bytes' ? [mutation.stagedAsset.sha256] : []))]
      .sort(),
  )
}

function sameAssetDigests(left: readonly ContentSha256[], right: readonly ContentSha256[]): boolean {
  return left.length === right.length && left.every((digest, index) => digest === right[index])
}

function diagnostic(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function invalidReceipt(): ApprovalReceiptError {
  return new ApprovalReceiptError('APPROVAL_RECEIPT_INVALID', 'Approval receipt has an invalid shape.')
}

function isMissingPath(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
