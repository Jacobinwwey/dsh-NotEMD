import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { createWritePlan, type WritePlan } from '@notemd-harness/vault'

export interface ApprovalReceipt {
  approvalId: string
  planId: string
  digest: string
  expiresAt: number
}

export interface ApprovalLedger {
  issue(plan: WritePlan): Promise<ApprovalReceipt>
  consume(plan: WritePlan, approvalId: string): Promise<boolean>
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

  async issue(plan: WritePlan): Promise<ApprovalReceipt> {
    const canonicalPlan = canonicalPlanOf(plan)

    return this.synchronize(async () => {
      const issuedAt = this.now()
      const receipt: StoredReceipt = {
        approvalId: `notemd-approval-${randomUUID()}`,
        planId: canonicalPlan.id,
        digest: canonicalPlan.digest,
        issuedAt,
        expiresAt: issuedAt + this.ttlMs,
      }
      await this.persist(receipt)
      return publicReceipt(receipt)
    })
  }

  async consume(plan: WritePlan, approvalId: string): Promise<boolean> {
    let canonicalPlan: WritePlan
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
        receipt.digest !== canonicalPlan.digest
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

function canonicalPlanOf(plan: WritePlan): WritePlan {
  if (!Array.isArray(plan.writes)) {
    throw new ApprovalReceiptError('APPROVAL_PLAN_INVALID', 'Approval requires a write plan with writes.')
  }

  const canonical = createWritePlan(plan.writes)
  if (plan.id !== canonical.id || plan.digest !== canonical.digest) {
    throw new ApprovalReceiptError('APPROVAL_PLAN_INVALID', 'Approval requires an unmodified canonical write plan.')
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
  const issuedAt = numberProperty(value, 'issuedAt')
  const expiresAt = numberProperty(value, 'expiresAt')
  const consumedAt = value.consumedAt
  if (!/^notemd-approval-[a-f0-9-]+$/u.test(approvalId) || consumedAt !== undefined && !isTimestamp(consumedAt)) {
    throw invalidReceipt()
  }

  const receipt: StoredReceipt = { approvalId, planId, digest, issuedAt, expiresAt }
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

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function invalidReceipt(): ApprovalReceiptError {
  return new ApprovalReceiptError('APPROVAL_RECEIPT_INVALID', 'Approval receipt has an invalid shape.')
}

function isMissingPath(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
