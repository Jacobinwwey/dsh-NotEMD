import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, expect, test } from 'vitest'

import {
  createWorkspaceMutationPlan,
  type StagedAssetRef,
  type WorkspaceMutationPlan,
  type WorkspaceMutationReceipt,
} from '@notemd-harness/mutation'

import * as localRuntime from '../src/index.js'

type JournalState = 'prepared' | 'staged' | 'applying' | 'verified' | 'committed'

interface LocalMutationLifecycleObserver {
  afterJournalState(state: JournalState, plan: WorkspaceMutationPlan): void | Promise<void>
  afterMutationApplied?(destination: string, plan: WorkspaceMutationPlan): void | Promise<void>
}

interface LocalMutationExecutor {
  apply(plan: WorkspaceMutationPlan, signal?: AbortSignal): Promise<WorkspaceMutationReceipt>
  recover(signal?: AbortSignal): Promise<readonly { planId: string; outcome: string }[]>
}

interface LocalMutationExecutorConstructor {
  open(
    workspaceRoot: string,
    dependencies?: { readonly lifecycleObserver?: LocalMutationLifecycleObserver },
  ): Promise<LocalMutationExecutor>
}

interface StagedAssetStore {
  stageBytes(bytes: Uint8Array, mediaType: string): Promise<StagedAssetRef>
}

interface StagedAssetStoreConstructor {
  open(workspaceRoot: string): Promise<StagedAssetStore>
}

interface LocalMutationRuntime {
  readonly LocalMutationExecutor: LocalMutationExecutorConstructor
  readonly StagedAssetStore: StagedAssetStoreConstructor
}

const runtime = localRuntime as unknown as LocalMutationRuntime

let workspaceRoot = ''
let outsideRoot = ''

beforeEach(async () => {
  workspaceRoot = await mkdtemp(join(tmpdir(), 'notemd-mutation-'))
  outsideRoot = await mkdtemp(join(tmpdir(), 'notemd-mutation-outside-'))
  await mkdir(join(workspaceRoot, 'notes'))
})

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true })
  await rm(outsideRoot, { recursive: true, force: true })
})

function sha256(content: string | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex')
}

function provenance(operationId = 'notemd.test.mutation'): {
  readonly operationId: string
  readonly sourceRefs: readonly string[]
  readonly evidenceRefs: readonly string[]
} {
  return {
    operationId,
    sourceRefs: ['notes/source.md'],
    evidenceRefs: [],
  }
}

function textWrite(destination: string, content: string, expectedRevision: string | 'absent') {
  return {
    kind: 'write-text' as const,
    destination,
    expectedRevision,
    provenance: provenance(),
    conflictPolicy: 'reject' as const,
    mediaType: 'text/markdown',
    content,
    contentSha256: sha256(content),
  }
}

function bytesWrite(destination: string, stagedAsset: StagedAssetRef) {
  return {
    kind: 'write-bytes' as const,
    destination,
    expectedRevision: 'absent' as const,
    provenance: provenance(),
    conflictPolicy: 'reject' as const,
    mediaType: stagedAsset.mediaType,
    contentSha256: stagedAsset.sha256,
    stagedAsset,
  }
}

function deleteMutation(destination: string, content: string) {
  return {
    kind: 'delete' as const,
    destination,
    expectedRevision: sha256(content),
    expectedContentSha256: sha256(content),
    provenance: provenance(),
    conflictPolicy: 'reject' as const,
  }
}

async function executor(observer?: LocalMutationLifecycleObserver): Promise<LocalMutationExecutor> {
  return runtime.LocalMutationExecutor.open(
    workspaceRoot,
    observer === undefined ? undefined : { lifecycleObserver: observer },
  )
}

test('does not create workspace transaction state while an executor is idle', async () => {
  await executor()

  await expect(stat(join(workspaceRoot, '.notemd'))).rejects.toMatchObject({ code: 'ENOENT' })
})

test('commits staged binary, text, and quarantine delete mutations as one verified receipt', async () => {
  await writeFile(join(workspaceRoot, 'notes', 'replace.md'), 'before')
  await writeFile(join(workspaceRoot, 'notes', 'remove.md'), 'remove me')
  const stagedAssets = await runtime.StagedAssetStore.open(workspaceRoot)
  const imageBytes = new Uint8Array([0, 1, 2, 3])
  const image = await stagedAssets.stageBytes(imageBytes, 'image/svg+xml')
  const plan = createWorkspaceMutationPlan({
    provenance: provenance('notemd.diagram.materialize'),
    mutations: [
      textWrite('notes/replace.md', 'after', sha256('before')),
      bytesWrite('diagrams/atomic.svg', image),
      deleteMutation('notes/remove.md', 'remove me'),
    ],
  })

  const receipt = await (await executor()).apply(plan)

  expect(receipt.status).toBe('committed')
  expect(receipt.mutations.map((mutation) => mutation.destination)).toEqual([
    'diagrams/atomic.svg',
    'notes/remove.md',
    'notes/replace.md',
  ])
  expect(await readFile(join(workspaceRoot, 'notes', 'replace.md'), 'utf8')).toBe('after')
  expect(await readFile(join(workspaceRoot, 'diagrams', 'atomic.svg'))).toEqual(Buffer.from(imageBytes))
  await expect(readFile(join(workspaceRoot, 'notes', 'remove.md'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect(JSON.parse(await readFile(journalPath(plan), 'utf8'))).toMatchObject({
    state: 'committed',
    stagingCleanup: 'complete',
  })
})

test('rejects a stale revision before applying any target in the proposal', async () => {
  await writeFile(join(workspaceRoot, 'notes', 'a.md'), 'newer')
  const plan = createWorkspaceMutationPlan({
    provenance: provenance(),
    mutations: [
      textWrite('notes/a.md', 'replacement', sha256('before')),
      textWrite('notes/b.md', 'must not appear', 'absent'),
    ],
  })

  const receipt = await (await executor()).apply(plan)

  expect(receipt.status).toBe('conflict')
  expect(await readFile(join(workspaceRoot, 'notes', 'a.md'), 'utf8')).toBe('newer')
  await expect(readFile(join(workspaceRoot, 'notes', 'b.md'))).rejects.toMatchObject({ code: 'ENOENT' })
})

test('serializes overlapping multi-target plans without interleaved partial commits', async () => {
  await writeFile(join(workspaceRoot, 'notes', 'a.md'), 'a0')
  await writeFile(join(workspaceRoot, 'notes', 'b.md'), 'b0')
  const first = createWorkspaceMutationPlan({
    provenance: provenance('notemd.first'),
    mutations: [
      textWrite('notes/b.md', 'b1', sha256('b0')),
      textWrite('notes/a.md', 'a1', sha256('a0')),
    ],
  })
  const second = createWorkspaceMutationPlan({
    provenance: provenance('notemd.second'),
    mutations: [
      textWrite('notes/a.md', 'a2', sha256('a0')),
      textWrite('notes/b.md', 'b2', sha256('b0')),
    ],
  })
  const localExecutor = await executor()

  const receipts = await Promise.all([localExecutor.apply(first), localExecutor.apply(second)])

  expect(receipts.map((receipt) => receipt.status).sort()).toEqual(['committed', 'conflict'])
  expect([
    ['a1', 'b1'],
    ['a2', 'b2'],
  ]).toContainEqual([
    await readFile(join(workspaceRoot, 'notes', 'a.md'), 'utf8'),
    await readFile(join(workspaceRoot, 'notes', 'b.md'), 'utf8'),
  ])
})

test('rejects symlink escapes after canonical lock acquisition and before the write', async () => {
  await symlink(outsideRoot, join(workspaceRoot, 'escape'), 'junction')
  const plan = createWorkspaceMutationPlan({
    provenance: provenance(),
    mutations: [textWrite('escape/outside.md', 'blocked', 'absent')],
  })

  const receipt = await (await executor()).apply(plan)

  expect(receipt.status).toBe('rejected')
  await expect(readFile(join(outsideRoot, 'outside.md'))).rejects.toMatchObject({ code: 'ENOENT' })
})

test('rejects a staged asset whose bytes no longer match its plan-bound digest', async () => {
  const stagedAssets = await runtime.StagedAssetStore.open(workspaceRoot)
  const asset = await stagedAssets.stageBytes(new Uint8Array([1, 2, 3]), 'application/octet-stream')
  await writeFile(join(workspaceRoot, '.notemd', 'staging', 'assets', asset.id), Buffer.from([9, 9, 9]))
  const plan = createWorkspaceMutationPlan({
    provenance: provenance(),
    mutations: [bytesWrite('diagrams/asset.bin', asset)],
  })

  const receipt = await (await executor()).apply(plan)

  expect(receipt.status).toBe('rejected')
  await expect(readFile(join(workspaceRoot, 'diagrams', 'asset.bin'))).rejects.toMatchObject({ code: 'ENOENT' })
})

test('rolls back a quarantine delete after a crash following the target move', async () => {
  await writeFile(join(workspaceRoot, 'notes', 'remove.md'), 'restore me')
  const plan = createWorkspaceMutationPlan({
    provenance: provenance(),
    mutations: [deleteMutation('notes/remove.md', 'restore me')],
  })
  const localExecutor = await executor({
    afterJournalState: () => undefined,
    afterMutationApplied: () => {
      throw new Error('simulated crash after target move')
    },
  })

  expect((await localExecutor.apply(plan)).status).toBe('failed')
  await expect(readFile(join(workspaceRoot, 'notes', 'remove.md'))).rejects.toMatchObject({ code: 'ENOENT' })

  await expect(localExecutor.recover()).resolves.toEqual([
    expect.objectContaining({ planId: plan.id, outcome: 'rolled-back' }),
  ])
  expect(await readFile(join(workspaceRoot, 'notes', 'remove.md'), 'utf8')).toBe('restore me')
  await expect(localExecutor.recover()).resolves.toEqual([])
})

test('does not overwrite an externally changed target while recovering a verified proposal', async () => {
  await writeFile(join(workspaceRoot, 'notes', 'a.md'), 'before')
  const plan = createWorkspaceMutationPlan({
    provenance: provenance(),
    mutations: [textWrite('notes/a.md', 'after', sha256('before'))],
  })
  const localExecutor = await executor({
    afterJournalState: (state) => {
      if (state === 'verified') {
        throw new Error('simulated crash after verified')
      }
    },
  })

  expect((await localExecutor.apply(plan)).status).toBe('failed')
  await writeFile(join(workspaceRoot, 'notes', 'a.md'), 'external change')

  await expect(localExecutor.recover()).resolves.toEqual([
    expect.objectContaining({ planId: plan.id, outcome: 'failed' }),
  ])
  expect(await readFile(join(workspaceRoot, 'notes', 'a.md'), 'utf8')).toBe('external change')
  expect(JSON.parse(await readFile(journalPath(plan), 'utf8'))).toMatchObject({ state: 'failed' })
})

test('does not call an interrupted delete rolled back after its untouched target changed externally', async () => {
  await writeFile(join(workspaceRoot, 'notes', 'remove.md'), 'before')
  const plan = createWorkspaceMutationPlan({
    provenance: provenance(),
    mutations: [deleteMutation('notes/remove.md', 'before')],
  })
  const localExecutor = await executor({
    afterJournalState: (state) => {
      if (state === 'applying') {
        throw new Error('simulated crash before delete')
      }
    },
  })

  expect((await localExecutor.apply(plan)).status).toBe('failed')
  await writeFile(join(workspaceRoot, 'notes', 'remove.md'), 'external change')

  await expect(localExecutor.recover()).resolves.toEqual([
    expect.objectContaining({ planId: plan.id, outcome: 'failed' }),
  ])
  expect(await readFile(join(workspaceRoot, 'notes', 'remove.md'), 'utf8')).toBe('external change')
  expect(JSON.parse(await readFile(journalPath(plan), 'utf8'))).toMatchObject({ state: 'failed' })
})

test('does not call an interrupted text write rolled back after its untouched target changed externally', async () => {
  await writeFile(join(workspaceRoot, 'notes', 'a.md'), 'before')
  const plan = createWorkspaceMutationPlan({
    provenance: provenance(),
    mutations: [textWrite('notes/a.md', 'after', sha256('before'))],
  })
  const localExecutor = await executor({
    afterJournalState: (state) => {
      if (state === 'applying') {
        throw new Error('simulated crash before write')
      }
    },
  })

  expect((await localExecutor.apply(plan)).status).toBe('failed')
  await writeFile(join(workspaceRoot, 'notes', 'a.md'), 'external change')

  await expect(localExecutor.recover()).resolves.toEqual([
    expect.objectContaining({ planId: plan.id, outcome: 'failed' }),
  ])
  expect(await readFile(join(workspaceRoot, 'notes', 'a.md'), 'utf8')).toBe('external change')
  expect(JSON.parse(await readFile(journalPath(plan), 'utf8'))).toMatchObject({ state: 'failed' })
})

test('rejects rollback when an interrupted write backup no longer matches the original revision', async () => {
  await writeFile(join(workspaceRoot, 'notes', 'a.md'), 'before')
  const plan = createWorkspaceMutationPlan({
    provenance: provenance(),
    mutations: [textWrite('notes/a.md', 'after', sha256('before'))],
  })
  const localExecutor = await executor({
    afterJournalState: () => undefined,
    afterMutationApplied: () => {
      throw new Error('simulated crash after write')
    },
  })

  expect((await localExecutor.apply(plan)).status).toBe('failed')
  await writeFile(planStagingPath(plan, 'rollback', '000000.original'), 'tampered backup')

  await expect(localExecutor.recover()).resolves.toEqual([
    expect.objectContaining({ planId: plan.id, outcome: 'failed' }),
  ])
  expect(await readFile(join(workspaceRoot, 'notes', 'a.md'), 'utf8')).toBe('after')
  expect(JSON.parse(await readFile(journalPath(plan), 'utf8'))).toMatchObject({ state: 'failed' })
})

test('rejects rollback when an interrupted delete quarantine no longer matches the original revision', async () => {
  await writeFile(join(workspaceRoot, 'notes', 'remove.md'), 'before')
  const plan = createWorkspaceMutationPlan({
    provenance: provenance(),
    mutations: [deleteMutation('notes/remove.md', 'before')],
  })
  const localExecutor = await executor({
    afterJournalState: () => undefined,
    afterMutationApplied: () => {
      throw new Error('simulated crash after delete')
    },
  })

  expect((await localExecutor.apply(plan)).status).toBe('failed')
  await writeFile(planStagingPath(plan, 'quarantine', '000000.deleted'), 'tampered quarantine')

  await expect(localExecutor.recover()).resolves.toEqual([
    expect.objectContaining({ planId: plan.id, outcome: 'failed' }),
  ])
  await expect(readFile(join(workspaceRoot, 'notes', 'remove.md'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect(JSON.parse(await readFile(journalPath(plan), 'utf8'))).toMatchObject({ state: 'failed' })
})

test('rejects a retried proposal without overwriting its interrupted recovery journal', async () => {
  await writeFile(join(workspaceRoot, 'notes', 'a.md'), 'before')
  const plan = createWorkspaceMutationPlan({
    provenance: provenance(),
    mutations: [textWrite('notes/a.md', 'after', sha256('before'))],
  })
  const localExecutor = await executor({
    afterJournalState: () => undefined,
    afterMutationApplied: () => {
      throw new Error('simulated crash after write')
    },
  })

  expect((await localExecutor.apply(plan)).status).toBe('failed')
  expect(JSON.parse(await readFile(journalPath(plan), 'utf8'))).toMatchObject({ state: 'applying' })

  await expect(localExecutor.apply(plan)).resolves.toMatchObject({ status: 'rejected' })
  expect(JSON.parse(await readFile(journalPath(plan), 'utf8'))).toMatchObject({ state: 'applying' })

  await expect(localExecutor.recover()).resolves.toEqual([
    expect.objectContaining({ planId: plan.id, outcome: 'rolled-back' }),
  ])
  expect(await readFile(join(workspaceRoot, 'notes', 'a.md'), 'utf8')).toBe('before')
})

test('does not advance an interrupted journal when recovery is cancelled', async () => {
  const plan = createWorkspaceMutationPlan({
    provenance: provenance(),
    mutations: [textWrite('notes/a.md', 'after', 'absent')],
  })
  const localExecutor = await executor({
    afterJournalState: (state) => {
      if (state === 'prepared') {
        throw new Error('simulated crash after prepared')
      }
    },
  })
  const controller = new AbortController()

  expect((await localExecutor.apply(plan)).status).toBe('failed')
  controller.abort()

  await expect(localExecutor.recover(controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  expect(JSON.parse(await readFile(journalPath(plan), 'utf8'))).toMatchObject({ state: 'prepared' })
})

test.each(['prepared', 'staged', 'applying', 'verified', 'committed'] as const)(
  'recovers a crash injected after the %s journal transition',
  async (crashState) => {
    await writeFile(join(workspaceRoot, 'notes', 'a.md'), 'before')
    const plan = createWorkspaceMutationPlan({
      provenance: provenance(),
      mutations: [textWrite('notes/a.md', 'after', sha256('before'))],
    })
    const localExecutor = await executor({
      afterJournalState: (state) => {
        if (state === crashState) {
          throw new Error(`simulated crash after ${state}`)
        }
      },
    })

    const receipt = await localExecutor.apply(plan)
    expect(receipt.status).toBe(crashState === 'committed' ? 'committed' : 'failed')

    if (crashState === 'verified') {
      expect(await readFile(join(workspaceRoot, 'notes', 'a.md'), 'utf8')).toBe('after')
      await expect(localExecutor.recover()).resolves.toEqual([
        expect.objectContaining({ planId: plan.id, outcome: 'committed' }),
      ])
      expect(await readFile(join(workspaceRoot, 'notes', 'a.md'), 'utf8')).toBe('after')
      await expect(localExecutor.recover()).resolves.toEqual([])
      return
    }

    if (crashState === 'committed') {
      expect(receipt.mutations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ diagnosticCode: 'mutation-finalization-interrupted' }),
        ]),
      )
      expect(await readFile(join(workspaceRoot, 'notes', 'a.md'), 'utf8')).toBe('after')
      await expect(localExecutor.recover()).resolves.toEqual([
        expect.objectContaining({ planId: plan.id, outcome: 'committed' }),
      ])
      await expect(stat(planStagingPath(plan, 'payloads', '000000.payload'))).rejects.toMatchObject({ code: 'ENOENT' })
      await expect(localExecutor.recover()).resolves.toEqual([])
      return
    }

    await expect(localExecutor.recover()).resolves.toEqual([
      expect.objectContaining({ planId: plan.id, outcome: 'rolled-back' }),
    ])
    expect(await readFile(join(workspaceRoot, 'notes', 'a.md'), 'utf8')).toBe('before')
    await expect(localExecutor.recover()).resolves.toEqual([])
  },
)

function journalPath(plan: WorkspaceMutationPlan): string {
  return join(workspaceRoot, '.notemd', 'mutations', `${plan.id}.json`)
}

function planStagingPath(plan: WorkspaceMutationPlan, directory: string, fileName: string): string {
  return join(workspaceRoot, '.notemd', 'staging', plan.id, directory, fileName)
}
