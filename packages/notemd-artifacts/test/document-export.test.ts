import { expect, test } from 'vitest'

import { createRevision, type VaultDocument } from '@notemd-harness/vault'

import {
  DocumentExportPlanner,
  type DocumentExportRenderer,
  type SlidevPdfExportSpec,
  type SlidevSourceSpec,
} from '../src/index.js'

const markdown = '# Deck\n\n## Contract\n\nApproval is explicit.\n'
const source: VaultDocument = {
  path: 'notes/deck.md',
  content: markdown,
  revision: createRevision(markdown),
}

test('compiles a Slidev PDF proposal with source, layout report, and staged export lineage', async () => {
  const spec: SlidevPdfExportSpec = {
    version: 1,
    title: 'Deck',
    source: { path: source.path, revision: source.revision },
    theme: 'default',
  }
  const renderer: DocumentExportRenderer<SlidevPdfExportSpec> = {
    format: 'pdf',
    fingerprint: { id: 'test-slidev-fork', version: 'bbcb2ef' },
    async render() {
      return {
        source: { filename: 'slides.md', mediaType: 'text/markdown', content: '# Deck' },
        report: { filename: 'layout-report.json', mediaType: 'application/json', content: '{"status":"prepared"}\n' },
        export: { filename: 'deck.pdf', mediaType: 'application/pdf', content: '%PDF-1.7\n%%EOF\n' },
      }
    },
    capability: async () => ({ capability: 'document-export', status: 'available', reason: 'test' }),
  }
  const planner = new DocumentExportPlanner({
    source: renderer as DocumentExportRenderer<SlidevSourceSpec>,
    html: renderer as never,
    pdf: renderer,
    png: renderer as never,
    pptx: renderer as never,
    mp4: renderer as never,
  })

  const plan = await planner.planSlidevPdfExport(spec, source)
  const manifestMutation = plan.mutations.find((mutation) => mutation.destination.endsWith('/manifest.json'))
  const manifest = JSON.parse(manifestMutation?.kind === 'write-text' ? manifestMutation.content : '{}') as {
    readonly version: number
    readonly canonicalTarget: string
    readonly exportFormat: string
    readonly entries: readonly { readonly role: string; readonly status: string; readonly mediaType: string }[]
  }

  expect(manifest).toMatchObject({ schemaFamily: 'document-export', version: 3, canonicalTarget: 'slidev', exportFormat: 'pdf' })
  expect(manifest.entries).toEqual(expect.arrayContaining([
    expect.objectContaining({ role: 'source', status: 'ready', mediaType: 'text/markdown' }),
    expect.objectContaining({ role: 'report', status: 'ready', mediaType: 'application/json' }),
    expect.objectContaining({ role: 'export', status: 'ready', mediaType: 'application/pdf' }),
  ]))
  expect(plan.mutations.some((mutation) => mutation.kind === 'write-text' && mutation.destination.endsWith('.pdf'))).toBe(true)
})

test('exposes separate named capabilities instead of a generic target switch', async () => {
  const renderer: DocumentExportRenderer<SlidevPdfExportSpec> = {
    format: 'pdf',
    fingerprint: { id: 'test', version: '1' },
    render: async () => ({
      source: { filename: 'slides.md', mediaType: 'text/markdown', content: '# Deck' },
      report: { filename: 'layout-report.json', mediaType: 'application/json', content: '{}' },
      export: { status: 'unavailable', mediaType: 'application/pdf', reason: 'Playwright unavailable' },
    }),
    capability: async () => ({ capability: 'document-export', status: 'unavailable', reason: 'Playwright unavailable' }),
  }
  const planner = new DocumentExportPlanner({
    source: renderer as never,
    html: renderer as never,
    pdf: renderer,
    png: renderer as never,
    pptx: renderer as never,
    mp4: renderer as never,
  })

  await expect(planner.slidevPdfExportCapability()).resolves.toMatchObject({
    capability: 'document-export', status: 'unavailable',
  })
})
