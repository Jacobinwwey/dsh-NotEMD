import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from 'vitest'

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const manifest = JSON.parse(readFileSync(join(packageDirectory, 'package.json'), 'utf8')) as {
  dsh?: { bundle?: { patch?: string } }
  exports?: Record<string, unknown>
}

test('declares a DSH bundle patch and ships every referenced module source', () => {
  expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')

  for (const moduleName of ['index', 'vault-local', 'workspace-changes', 'jobs', 'knowledge', 'artifacts', 'llm', 'tools', 'workflows', 'approval']) {
    expect(existsSync(join(packageDirectory, 'src', `${moduleName}.ts`))).toBe(true)
    expect(manifest.exports).toHaveProperty(moduleName === 'index' ? '.' : `./${moduleName}`)
  }
})

test('patch assembles complete runtime rows without user-machine paths or secrets', () => {
  const patch = readFileSync(join(packageDirectory, 'cordis.patch.yml'), 'utf8')

  expect(patch).toContain('id: notemd-vault')
  expect(patch).toContain("name: '@jacobinwwey/notemd-deepseek-harness/vault-local'")
  expect(patch).toContain('id: notemd-tools')
  expect(patch).toContain('id: notemd-workspace-changes')
  expect(patch).toContain("name: '@jacobinwwey/notemd-deepseek-harness/workspace-changes'")
  expect(patch).toContain('scanIntervalMs: 5000')
  expect(patch).toContain('concurrency: 2')
  expect(patch).toContain("name: '@jacobinwwey/notemd-deepseek-harness/tools'")
  expect(patch).not.toMatch(/[A-Z]:\\/u)
  expect(patch).not.toMatch(/api[_-]?key\s*:/iu)
})
