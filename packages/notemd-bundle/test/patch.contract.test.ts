import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from 'vitest'

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const manifest = JSON.parse(readFileSync(join(packageDirectory, 'package.json'), 'utf8')) as {
  dsh?: { bundle?: { patch?: string } }
  exports?: Record<string, unknown>
}
const dshLlmManifest = JSON.parse(readFileSync(join(packageDirectory, '..', 'notemd-llm-dsh', 'package.json'), 'utf8')) as {
  files?: unknown
}

test('declares a DSH bundle patch and ships every referenced module source', () => {
  expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')

  for (const moduleName of ['index', 'vault-local', 'workspace-changes', 'jobs', 'knowledge', 'artifacts', 'research', 'llm', 'llm-openai-compatible-legacy', 'tools', 'workflows', 'approval']) {
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
  expect(patch).toContain('id: notemd-research')
  expect(patch).toContain("name: '@jacobinwwey/notemd-deepseek-harness/research'")
  expect(patch).toContain('inject: [web]')
  expect(patch).toContain("name: '@jacobinwwey/notemd-deepseek-harness/tools'")
  expect(patch).not.toMatch(/[A-Z]:\\/u)
  expect(patch).not.toMatch(/api[_-]?key\s*:/iu)
})

test('uses a DSH LLM route by default and leaves direct transport behind an explicit legacy entry', () => {
  const patch = readFileSync(join(packageDirectory, 'cordis.patch.yml'), 'utf8')
  const llmStart = patch.indexOf('- id: notemd-llm')
  const llmEnd = patch.indexOf('- id: notemd-workflows')
  const llmRow = patch.slice(llmStart, llmEnd)

  expect(manifest.exports).toHaveProperty('./llm-openai-compatible-legacy')
  expect(llmRow).toContain('inject: [llm]')
  expect(llmRow).toContain('provider: deepseek')
  expect(llmRow).toContain('model: deepseek-chat')
  expect(llmRow).not.toMatch(/endpoint|apiKeyEnv|modelsEndpoint|timeoutMs/iu)
})

test('ships the DSH LLM bridge as compiled runtime code only', () => {
  expect(dshLlmManifest.files).toEqual(['lib/**/*.d.ts', 'lib/**/*.js'])
})
