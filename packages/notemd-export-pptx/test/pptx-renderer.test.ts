import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { createRevision, type VaultDocument } from '@notemd-harness/vault'
import { StagedAssetStore } from '@notemd-harness/vault-local'

import { SlidevPptxArtifactRenderer } from '../src/index.js'

let workspaceRoot = ''
let stagedAssets: StagedAssetStore

beforeEach(async () => {
  workspaceRoot = await mkdtemp(join(tmpdir(), 'notemd-pptx-renderer-'))
  stagedAssets = await StagedAssetStore.open(workspaceRoot)
})

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true })
})

test('stages the fork native PPTX export without substituting SVG', async () => {
  const bytes = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00])
  const process = {
    renderSlidevPptx: vi.fn(async () => ready(bytes)),
    slidevPptxCapability: vi.fn(async () => ({ status: 'available' as const, executableFingerprint: 'fork-pptx' })),
  }
  const source = sourceDocument()
  const spec = {
    version: 1 as const,
    title: 'Deck',
    source: { path: source.path, revision: source.revision },
    theme: 'default',
  }

  const renderer = new SlidevPptxArtifactRenderer(process, stagedAssets)
  const output = await renderer.render(spec, source)

  expect(output.export).toMatchObject({
    filename: 'slides.pptx',
    mediaType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  })
  expect(process.renderSlidevPptx).toHaveBeenCalledWith(expect.stringContaining('# Deck'), undefined)
  if ('status' in output.export) {
    throw new Error('Expected staged PPTX output.')
  }
  await expect(stagedAssets.readBytes(output.export.stagedAsset)).resolves.toEqual(Buffer.from(bytes))
})

test('maps unavailable and cancellation without claiming a PPTX derivative', async () => {
  const source = sourceDocument()
  const spec = {
    version: 1 as const,
    title: 'Deck',
    source: { path: source.path, revision: source.revision },
    theme: 'default',
  }
  const unavailable = new SlidevPptxArtifactRenderer({
    renderSlidevPptx: async () => ({ status: 'unavailable' as const, code: 'executable-unavailable' as const }),
    slidevPptxCapability: async () => ({ status: 'unavailable' as const, code: 'executable-unavailable' as const }),
  }, stagedAssets)

  await expect(unavailable.render(spec, source)).resolves.toMatchObject({
    export: { status: 'unavailable', mediaType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  })
  await expect(new SlidevPptxArtifactRenderer({
    renderSlidevPptx: async () => ({ status: 'cancelled' as const, code: 'process-cancelled' as const }),
    slidevPptxCapability: async () => ({ status: 'cancelled' as const, code: 'process-cancelled' as const }),
  }, stagedAssets).render(spec, source)).rejects.toMatchObject({ name: 'AbortError', code: 'process-cancelled' })
})

function sourceDocument(): VaultDocument {
  const content = '# Deck\n\n## Contract\n\nApproval is explicit.\n'
  return { path: 'notes/deck.md', content, revision: createRevision(content) }
}

function ready(bytes: Uint8Array) {
  return {
    status: 'ready' as const,
    mediaType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    bytes,
    contentSha256: createHash('sha256').update(bytes).digest('hex'),
    executableFingerprint: 'fork-pptx',
  }
}
