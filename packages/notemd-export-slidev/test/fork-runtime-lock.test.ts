import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { expect, test } from 'vitest'

import { NOTEMD_SLIDEV_FORK } from '@notemd-harness/process'

test('locks Slidev execution to the Jacobinwwey fork release contract', async () => {
  const lock = JSON.parse(await readFile(fileURLToPath(new URL('../../../fixtures/migration/slides/fork-runtime-lock.json', import.meta.url)), 'utf8')) as Record<string, unknown>

  expect(lock).toMatchObject({
    origin: NOTEMD_SLIDEV_FORK.origin,
    revision: NOTEMD_SLIDEV_FORK.revision,
    packageName: NOTEMD_SLIDEV_FORK.packageName,
    command: NOTEMD_SLIDEV_FORK.command,
    releaseTag: NOTEMD_SLIDEV_FORK.releaseTag,
    releaseAsset: NOTEMD_SLIDEV_FORK.releaseAsset,
    tarballUrl: NOTEMD_SLIDEV_FORK.tarballUrl,
    requiredBuildOptions: NOTEMD_SLIDEV_FORK.requiredBuildOptions,
  })
})
