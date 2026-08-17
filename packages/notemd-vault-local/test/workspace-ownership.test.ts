import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, test } from 'vitest'

import {
  WorkspaceOwnershipError,
  WorkspaceOwnershipGuard,
} from '../src/index.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

test('acquires one owner, records lifecycle metadata, and releases idempotently', async () => {
  const root = await workspace()
  const guard = await WorkspaceOwnershipGuard.acquire(root, options('owner-a', 101))

  expect(guard.diagnostic()).toMatchObject({
    code: 'workspace-owned',
    state: 'owned',
    ownerRevision: 'owner-a',
    ownerPid: 101,
    recoveryCount: 0,
  })
  const lock = JSON.parse(await readFile(join(root, '.notemd', 'runtime', 'workspace-owner.json'), 'utf8')) as Record<string, unknown>
  expect(lock).toMatchObject({ version: 1, ownerRevision: 'owner-a', processStartToken: 'start-a', workspaceRoot: root })

  await expect(guard.release()).resolves.toMatchObject({ cleanupHealthy: true, code: 'workspace-owner-released' })
  await expect(guard.release()).resolves.toMatchObject({ cleanupHealthy: true, code: 'workspace-owner-released' })
})

test('rejects a live second owner with a structured already-owned diagnostic', async () => {
  const root = await workspace()
  const first = await WorkspaceOwnershipGuard.acquire(root, options('owner-a', 101))

  const secondOwner = WorkspaceOwnershipGuard.acquire(root, {
    ...options('owner-b', 202),
    processProbe: { isAlive: () => true },
  })
  await expect(secondOwner).rejects.toBeInstanceOf(WorkspaceOwnershipError)
  await expect(secondOwner).rejects.toMatchObject({
    code: 'workspace-process-already-owned',
    diagnostic: {
      code: 'workspace-process-already-owned',
      state: 'blocked',
      ownerRevision: 'owner-a',
      ownerPid: 101,
    },
  })
  await first.release()
})

test('recovers a dead stale owner and increments the durable recovery counter', async () => {
  const root = await workspace()
  const lockDirectory = join(root, '.notemd', 'runtime')
  await mkdir(lockDirectory, { recursive: true })
  await writeFile(join(lockDirectory, 'workspace-owner.json'), JSON.stringify({
    version: 1,
    pid: 707,
    processStartToken: 'dead-start',
    workspaceRoot: root,
    ownerRevision: 'dead-owner',
    acquiredAt: '2026-08-17T00:00:00.000Z',
    heartbeatAt: '2026-08-17T00:00:00.000Z',
    recoveryCount: 2,
  }))

  const guard = await WorkspaceOwnershipGuard.acquire(root, {
    ...options('owner-c', 303),
    now: () => new Date('2026-08-17T00:00:20.000Z'),
    staleAfterMs: 5_000,
    processProbe: { isAlive: () => false },
  })

  expect(guard.diagnostic()).toMatchObject({
    code: 'workspace-owner-recovered',
    state: 'recovered',
    ownerRevision: 'owner-c',
    recoveryCount: 3,
    recoveredOwnerRevision: 'dead-owner',
  })
  await guard.release()
})

test('fails closed on malformed ownership metadata and does not guess stale state', async () => {
  const root = await workspace()
  const lockDirectory = join(root, '.notemd', 'runtime')
  await mkdir(lockDirectory, { recursive: true })
  await writeFile(join(lockDirectory, 'workspace-owner.json'), '{not-json')

  await expect(WorkspaceOwnershipGuard.acquire(root, options('owner-d', 404))).rejects.toMatchObject({
    code: 'workspace-owner-lock-invalid',
  })
})

test('records unhealthy cleanup when another actor removes the owner lock', async () => {
  const root = await workspace()
  const guard = await WorkspaceOwnershipGuard.acquire(root, options('owner-e', 505))
  await unlink(join(root, '.notemd', 'runtime', 'workspace-owner.json'))

  await expect(guard.release()).resolves.toMatchObject({
    cleanupHealthy: false,
    code: 'workspace-owner-lock-lost',
  })
})

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'notemd-ownership-'))
  roots.push(root)
  return root
}

function options(ownerRevision: string, processId: number) {
  return {
    heartbeatMs: 50,
    staleAfterMs: 500,
    ownerRevision,
    processId,
    processStartToken: `start-${ownerRevision.slice(-1)}`,
    processProbe: { isAlive: () => false },
    now: () => new Date('2026-08-17T00:00:20.000Z'),
  }
}
