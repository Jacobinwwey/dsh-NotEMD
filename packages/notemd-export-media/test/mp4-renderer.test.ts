import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { createRevision, type VaultDocument } from '@notemd-harness/vault'
import { StagedAssetStore } from '@notemd-harness/vault-local'

import { SlidevMp4ArtifactRenderer } from '../src/index.js'

let workspaceRoot = ''
let stagedAssets: StagedAssetStore

beforeEach(async () => {
  workspaceRoot = await mkdtemp(join(tmpdir(), 'notemd-mp4-renderer-'))
  stagedAssets = await StagedAssetStore.open(workspaceRoot)
})

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true })
})

test('stages the real MP4 derivative produced by the fork PNG plus FFmpeg pipeline', async () => {
  const bytes = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32])
  const process = {
    renderSlidevMp4: vi.fn(async () => ready(bytes)),
    slidevMp4Capability: vi.fn(async () => ({ status: 'available' as const, executableFingerprint: 'fork-ffmpeg' })),
  }
  const source = sourceDocument()
  const spec = {
    version: 1 as const,
    title: 'Deck',
    source: { path: source.path, revision: source.revision },
    theme: 'default',
    withClicks: false,
    imageScale: 1,
    fps: 24,
    crf: 23,
  }

  const renderer = new SlidevMp4ArtifactRenderer(process, stagedAssets)
  const output = await renderer.render(spec, source)

  expect(output.export).toMatchObject({ filename: 'slides.mp4', mediaType: 'video/mp4' })
  expect(process.renderSlidevMp4).toHaveBeenCalledWith(
    expect.stringContaining('# Deck'),
    { withClicks: false, imageScale: 1, fps: 24, crf: 23 },
    undefined,
  )
  if ('status' in output.export) {
    throw new Error('Expected staged MP4 output.')
  }
  await expect(stagedAssets.readBytes(output.export.stagedAsset)).resolves.toEqual(bytes)
})

test('keeps FFmpeg and Slidev availability failures explicit', async () => {
  const source = sourceDocument()
  const spec = {
    version: 1 as const,
    title: 'Deck',
    source: { path: source.path, revision: source.revision },
    theme: 'default',
    withClicks: false,
    imageScale: 1,
    fps: 24,
    crf: 23,
  }
  const unavailable = new SlidevMp4ArtifactRenderer({
    renderSlidevMp4: async () => ({ status: 'unavailable' as const, code: 'executable-unavailable' as const }),
    slidevMp4Capability: async () => ({ status: 'unavailable' as const, code: 'executable-unavailable' as const }),
  }, stagedAssets)

  await expect(unavailable.render(spec, source)).resolves.toMatchObject({ export: { status: 'unavailable', mediaType: 'video/mp4' } })
  await expect(new SlidevMp4ArtifactRenderer({
    renderSlidevMp4: async () => ({ status: 'cancelled' as const, code: 'process-cancelled' as const }),
    slidevMp4Capability: async () => ({ status: 'cancelled' as const, code: 'process-cancelled' as const }),
  }, stagedAssets).render(spec, source)).rejects.toMatchObject({ name: 'AbortError', code: 'process-cancelled' })
})

function sourceDocument(): VaultDocument {
  const content = '# Deck\n\n## Contract\n\nApproval is explicit.\n'
  return { path: 'notes/deck.md', content, revision: createRevision(content) }
}

function ready(bytes: Uint8Array) {
  return {
    status: 'ready' as const,
    mediaType: 'video/mp4',
    bytes,
    contentSha256: createHash('sha256').update(bytes).digest('hex'),
    executableFingerprint: 'fork-ffmpeg',
  }
}
