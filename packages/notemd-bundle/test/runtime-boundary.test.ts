import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from 'vitest'

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const repositoryRoot = dirname(dirname(packageDirectory))

test('keeps optional DSH runtimes as removable peer boundaries', () => {
  const manifest = JSON.parse(readFileSync(join(packageDirectory, 'package.json'), 'utf8')) as {
    peerDependencies?: Record<string, string>
    peerDependenciesMeta?: Record<string, { readonly optional?: boolean }>
    dependencies?: Record<string, string>
  }

  for (const dependency of ['@deepseek-ai/cordis', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-subprocess', '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-web']) {
    expect(manifest.peerDependencies).toHaveProperty(dependency)
    expect(manifest.peerDependenciesMeta?.[dependency]?.optional).toBe(true)
    expect(manifest.dependencies ?? {}).not.toHaveProperty(dependency)
  }
})

test('preserves complete replacement configuration and lifecycle disposal seams', () => {
  const patch = readFileSync(join(packageDirectory, 'cordis.patch.yml'), 'utf8')
  const artifacts = readFileSync(join(packageDirectory, 'src', 'artifacts.ts'), 'utf8')
  const workspaceChanges = readFileSync(join(packageDirectory, 'src', 'workspace-changes.ts'), 'utf8')
  const vaultLocal = readFileSync(join(packageDirectory, 'src', 'vault-local.ts'), 'utf8')
  const llm = readFileSync(join(packageDirectory, 'src', 'llm.ts'), 'utf8')

  expect(patch).toContain('workspaceRoot: !!js process.cwd()')
  expect(patch).toContain('approvalTtlMs: 300000')
  expect(patch).toContain('scanIntervalMs: 5000')
  expect(patch).toContain('concurrency: 2')
  expect(artifacts).toContain("this.ctx.effect(() => async () => {")
  expect(artifacts).toContain("'notemdArtifacts.process'")
  expect(workspaceChanges).toContain("'notemdWorkspaceChanges.scan'")
  expect(workspaceChanges).toContain('clearInterval(timer)')
  expect(vaultLocal).toContain('WorkspaceOwnershipGuard.acquire')
  expect(vaultLocal).toContain("'notemdVault.workspaceOwnership'")
  expect(llm).toContain("'notemdTextTransformer.dshConsumer'")
  const packageManifest = JSON.parse(readFileSync(join(repositoryRoot, 'packages', 'notemd-bundle', 'package.json'), 'utf8')) as {
    name?: string
  }
  expect(packageManifest.name).toBe('dsh-notemd')
})
