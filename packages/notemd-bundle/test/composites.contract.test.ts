import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from 'vitest'

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)))

test('declares only the existing vault and workflow service dependencies', () => {
  const source = readFileSync(join(packageDirectory, 'src', 'composites.ts'), 'utf8')

  expect(source).toContain("static inject = ['notemdVault', 'notemdWorkflows'] as const")
  expect(source).toContain("super(ctx, 'notemdCompositeWorkflows')")
})

test('registers one complete composite service replacement row', () => {
  const patch = readFileSync(join(packageDirectory, 'cordis.patch.yml'), 'utf8')

  expect(patch).toContain('id: notemdCompositeWorkflows')
  expect(patch).toContain("name: 'dsh-notemd/composites'")
  expect(patch).toContain('inject: [notemdVault, notemdWorkflows]')
})
