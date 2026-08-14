import { expect, test } from 'vitest'

import {
  createRevision,
  createWritePlan,
  workspacePackageNames,
} from '../src/index.js'

test('declares every baseline migration package exactly once', () => {
  expect(workspacePackageNames()).toEqual([
    '@notemd-harness/vault',
    '@notemd-harness/vault-local',
    '@notemd-harness/jobs',
    '@notemd-harness/knowledge',
    '@notemd-harness/workflows',
    '@notemd-harness/artifacts',
    '@notemd-harness/llm-openai-compatible',
    '@notemd-harness/tools',
    '@jacobinwwey/notemd-deepseek-harness',
  ])
})

test('derives a revision from the UTF-8 document content', () => {
  expect(createRevision('atomic write')).toBe(
    '8cf50d8309195e26ea70cf08ec962ec9b21d08acb88945a7621744f89b3799e7',
  )
  expect(createRevision('atomic write')).not.toBe(createRevision('atomic write\n'))
})

test('creates a stable write plan regardless of caller write order', () => {
  const first = createWritePlan([
    { path: 'notes/b.md', content: 'B', expectedRevision: 'absent' },
    { path: 'notes/a.md', content: 'A', expectedRevision: 'absent' },
  ])
  const second = createWritePlan([
    { path: 'notes/a.md', content: 'A', expectedRevision: 'absent' },
    { path: 'notes/b.md', content: 'B', expectedRevision: 'absent' },
  ])

  expect(first).toEqual(second)
  expect(first.id).toBe(`notemd-plan-${first.digest.slice(0, 20)}`)
  expect(first.writes.map(({ path }) => path)).toEqual(['notes/a.md', 'notes/b.md'])
})
