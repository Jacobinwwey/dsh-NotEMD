import { expect, test } from 'vitest'

import {
  createRevision,
  workspacePackageNames,
} from '../src/index.js'

test('declares every baseline migration package exactly once', () => {
  expect(workspacePackageNames()).toEqual([
    '@notemd-harness/vault',
    '@notemd-harness/mutation',
    '@notemd-harness/vault-local',
    '@notemd-harness/workspace-events',
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
