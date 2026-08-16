import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { createRevision, type VaultDocument } from '@notemd-harness/vault'
import { StagedAssetStore } from '@notemd-harness/vault-local'

import {
  SlidevHtmlArtifactRenderer,
  SlidevPdfArtifactRenderer,
  SlidevPngArtifactRenderer,
} from '../src/index.js'

let workspaceRoot = ''
let stagedAssets: StagedAssetStore

beforeEach(async () => {
  workspaceRoot = await mkdtemp(join(tmpdir(), 'notemd-slidev-renderer-'))
  stagedAssets = await StagedAssetStore.open(workspaceRoot)
})

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true })
})

test('stages fork-rendered HTML, PDF, and PNG archives with digest identity', async () => {
  const process = {
    renderSlidevHtml: vi.fn(async () => ready('application/zip', Uint8Array.from([0x50, 0x4b, 0x03, 0x04]))),
    renderSlidevPdf: vi.fn(async () => ready('application/pdf', Buffer.from('%PDF-1.7\n%%EOF\n'))),
    renderSlidevPng: vi.fn(async () => ready('application/zip', Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x50]))),
    slidevHtmlCapability: vi.fn(async () => available()),
    slidevPdfCapability: vi.fn(async () => available()),
    slidevPngCapability: vi.fn(async () => available()),
  }
  const source = sourceDocument()
  const baseSpec = {
    version: 1 as const,
    title: 'Deck',
    source: { path: source.path, revision: source.revision },
    theme: 'default',
  }

  const html = await new SlidevHtmlArtifactRenderer(process, stagedAssets).render(baseSpec, source)
  const pdf = await new SlidevPdfArtifactRenderer(process, stagedAssets).render(baseSpec, source)
  const png = await new SlidevPngArtifactRenderer(process, stagedAssets).render({
    ...baseSpec,
    withClicks: true,
    imageScale: 2,
  }, source)

  expect(html.export).toMatchObject({ filename: 'slides.html.zip', mediaType: 'application/zip' })
  expect(pdf.export).toMatchObject({ filename: 'slides.pdf', mediaType: 'application/pdf' })
  expect(png.export).toMatchObject({ filename: 'slides.png.zip', mediaType: 'application/zip' })
  expect(process.renderSlidevPng).toHaveBeenCalledWith(
    expect.stringContaining('# Deck'),
    { withClicks: true, imageScale: 2 },
    undefined,
  )
  if (!('status' in pdf.export) && 'stagedAsset' in pdf.export) {
    await expect(stagedAssets.readBytes(pdf.export.stagedAsset)).resolves.toEqual(Buffer.from('%PDF-1.7\n%%EOF\n'))
  } else {
    throw new Error('Expected a staged PDF derivative.')
  }
})

test('reports missing fork dependencies as unavailable and propagates cancellation', async () => {
  const source = sourceDocument()
  const spec = {
    version: 1 as const,
    title: 'Deck',
    source: { path: source.path, revision: source.revision },
    theme: 'default',
  }
  const unavailableProcess = {
    renderSlidevHtml: async () => ({ status: 'unavailable' as const, code: 'executable-unavailable' as const }),
    slidevHtmlCapability: async () => ({ status: 'unavailable' as const, code: 'executable-unavailable' as const }),
  }
  const unavailableRenderer = new SlidevHtmlArtifactRenderer(unavailableProcess, stagedAssets)

  await expect(unavailableRenderer.capability()).resolves.toMatchObject({
    capability: 'document-export', status: 'unavailable',
  })
  await expect(unavailableRenderer.render(spec, source)).resolves.toMatchObject({
    export: { status: 'unavailable', mediaType: 'application/zip' },
  })

  const cancelledRenderer = new SlidevHtmlArtifactRenderer({
    renderSlidevHtml: async () => ({ status: 'cancelled' as const, code: 'process-cancelled' as const }),
    slidevHtmlCapability: async () => ({ status: 'cancelled' as const, code: 'process-cancelled' as const }),
  }, stagedAssets)
  await expect(cancelledRenderer.render(spec, source)).rejects.toMatchObject({ name: 'AbortError', code: 'process-cancelled' })
})

function sourceDocument(): VaultDocument {
  const content = '# Deck\n\n## Contract\n\nApproval is explicit.\n'
  return { path: 'notes/deck.md', content, revision: createRevision(content) }
}

function ready(mediaType: string, bytes: Uint8Array) {
  return {
    status: 'ready' as const,
    mediaType,
    bytes,
    contentSha256: createHash('sha256').update(bytes).digest('hex'),
    executableFingerprint: 'fork-fingerprint',
  }
}

function available() {
  return { status: 'available' as const, executableFingerprint: 'fork-fingerprint' }
}
