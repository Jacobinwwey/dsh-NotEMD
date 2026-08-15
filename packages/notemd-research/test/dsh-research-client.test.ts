import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, expect, test } from 'vitest'

import {
  DshResearchClient,
  ResearchCapabilityError,
  ResearchEvidenceCatalog,
  type DshWebRuntime,
} from '../src/index.js'

let workspaceRoot = ''

beforeEach(async () => {
  workspaceRoot = await mkdtemp(join(tmpdir(), 'notemd-research-'))
})

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true })
})

test('persists selected DSH fetch evidence with final URL, non-2xx status, truncation, and aligned citation', async () => {
  const searchCalls: unknown[] = []
  const fetchCalls: unknown[] = []
  const web: DshWebRuntime = {
    async search(request) {
      searchCalls.push(request)
      return {
        sources: [
          { url: 'https://example.test/first', title: 'First result' },
          { url: 'https://example.test/selected', title: 'Selected result', publishedAt: '2026-08-15T00:00:00.000Z' },
        ],
        truncated: false,
      }
    },
    async fetch(request) {
      fetchCalls.push(request)
      return {
        url: 'https://example.test/selected-after-redirect',
        statusCode: 404,
        body: { kind: 'html', content: '<p>Not found but preserved</p>' },
        truncated: true,
      }
    },
  }
  const catalog = new ResearchEvidenceCatalog(
    workspaceRoot,
    new DshResearchClient(web, () => new Date('2026-08-15T01:02:03.000Z')),
  )

  const discovery = await catalog.discover({ query: 'revision-aware mutations', maxResults: 2 })
  const evidence = await catalog.capture(discovery.id, 1)

  expect(searchCalls).toEqual([{ query: 'revision-aware mutations', maxResults: 2 }])
  expect(fetchCalls).toEqual([{ url: 'https://example.test/selected' }])
  expect(evidence).toMatchObject({
    id: expect.stringMatching(/^evidence:[a-f0-9]{64}$/u),
    query: 'revision-aware mutations',
    requestedUrl: 'https://example.test/selected',
    finalUrl: 'https://example.test/selected-after-redirect',
    statusCode: 404,
    bodyKind: 'html',
    truncated: true,
    retrievedAt: '2026-08-15T01:02:03.000Z',
    citations: [{
      url: 'https://example.test/selected-after-redirect',
      title: 'Selected result',
      publishedAt: '2026-08-15T00:00:00.000Z',
    }],
  })
  await expect(catalog.readEvidence([evidence.id])).resolves.toEqual([evidence])
})

test('changes the evidence identity when a fetched body changes', async () => {
  let body = 'first body'
  const web: DshWebRuntime = {
    async search() {
      return { sources: [{ url: 'https://example.test/source' }], truncated: false }
    },
    async fetch() {
      return {
        url: 'https://example.test/source',
        statusCode: 200,
        body: { kind: 'text', content: body },
        truncated: false,
      }
    },
  }
  const catalog = new ResearchEvidenceCatalog(
    workspaceRoot,
    new DshResearchClient(web, () => new Date('2026-08-15T01:02:03.000Z')),
  )
  const discovery = await catalog.discover({ query: 'digest changes', maxResults: 1 })

  const first = await catalog.capture(discovery.id, 0)
  body = 'second body'
  const second = await catalog.capture(discovery.id, 0)

  expect(second.id).not.toBe(first.id)
  expect(second.contentSha256).not.toBe(first.contentSha256)
})

test('reports ambiguous providers and unsupported PDF bodies as unavailable research capabilities', async () => {
  const ambiguous: DshWebRuntime = {
    async search() {
      throw Object.assign(new Error('multiple providers'), { code: 'WEB_PROVIDER_AMBIGUOUS' })
    },
    async fetch() {
      throw new Error('unreachable')
    },
  }
  const unavailableCatalog = new ResearchEvidenceCatalog(workspaceRoot, new DshResearchClient(ambiguous))

  await expect(unavailableCatalog.discover({ query: 'ambiguous', maxResults: 1 })).rejects.toBeInstanceOf(ResearchCapabilityError)

  const pdf: DshWebRuntime = {
    async search() {
      return { sources: [{ url: 'https://example.test/document.pdf' }], truncated: false }
    },
    async fetch() {
      return {
        url: 'https://example.test/document.pdf',
        statusCode: 200,
        body: { kind: 'pdf', content: 'binary' } as never,
        truncated: false,
      }
    },
  }
  const pdfCatalog = new ResearchEvidenceCatalog(workspaceRoot, new DshResearchClient(pdf))
  const discovery = await pdfCatalog.discover({ query: 'pdf', maxResults: 1 })

  await expect(pdfCatalog.capture(discovery.id, 0)).rejects.toBeInstanceOf(ResearchCapabilityError)
})

test('forwards cancellation to DSH search without adding a fallback transport', async () => {
  const controller = new AbortController()
  let observedSignal: AbortSignal | undefined
  const web: DshWebRuntime = {
    async search(_request, signal) {
      observedSignal = signal
      controller.abort()
      signal?.throwIfAborted()
      return { sources: [], truncated: false }
    },
    async fetch() {
      throw new Error('unreachable')
    },
  }
  const catalog = new ResearchEvidenceCatalog(workspaceRoot, new DshResearchClient(web))

  await expect(catalog.discover({ query: 'cancelled', maxResults: 1 }, controller.signal)).rejects.toThrow(/abort|cancel/iu)
  expect(observedSignal).toBe(controller.signal)
})
