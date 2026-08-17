import { describe, expect, test, vi } from 'vitest'

import {
  finalizeOptionalRuntimeCapabilityReport,
  optionalRuntimeFixtureSha256,
  runOptionalRuntimeCapabilityLane,
  type OptionalRuntimeBoundary,
  type OptionalRuntimeFixture,
} from '../src/index.js'

describe('optional runtime capability lane', () => {
  test('records native digests, unavailable fork targets, cancellation, and cleanup state', async () => {
    const boundary = fakeBoundary()
    const report = await runOptionalRuntimeCapabilityLane(boundary, fixture(), { slidevForkVerified: false })

    expect(report.fixtureSha256).toMatch(/^[a-f0-9]{64}$/u)
    expect(report.slidevFork.verified).toBe(false)
    expect(report.observations.find((observation) => observation.id === 'drawio-svg')).toMatchObject({
      status: 'ready',
      mediaType: 'image/svg+xml',
      contentSha256: 'drawio-digest',
      executableFingerprint: 'drawio-fingerprint',
    })
    report.observations.filter((observation) => observation.id.startsWith('slidev-')).forEach((observation) => {
      expect(observation).toMatchObject({ status: 'unavailable', code: 'slidev-fork-unverified' })
    })
    expect(report.observations.find((observation) => observation.id === 'cancellation-probe')).toMatchObject({
      status: 'cancelled',
      code: 'process-cancelled',
    })

    const finalized = finalizeOptionalRuntimeCapabilityReport(report, true)
    expect(finalized.staging.clean).toBe(true)
    expect(boundary.drawioSvgCapability).toHaveBeenCalledTimes(2)
  })

  test('executes Slidev targets only after fork verification', async () => {
    const boundary = fakeBoundary()
    const report = await runOptionalRuntimeCapabilityLane(boundary, fixture(), { slidevForkVerified: true })

    report.observations.filter((observation) => observation.id.startsWith('slidev-')).forEach((observation) => {
      expect(observation.status).toBe('ready')
      expect(observation.contentSha256).toMatch(/-digest$/u)
    })
    expect(boundary.renderSlidevMp4).toHaveBeenCalledOnce()
  })

  test('keeps fixture identity stable for equivalent inputs', () => {
    const first = optionalRuntimeFixtureSha256(fixture())
    const second = optionalRuntimeFixtureSha256({ ...fixture(), pdfBytes: Uint8Array.from(fixture().pdfBytes) })
    expect(first).toBe(second)
  })
})

function fakeBoundary(): OptionalRuntimeBoundary {
  const available = (id: string) => async (signal?: AbortSignal) => signal?.aborted
    ? { status: 'cancelled' as const, code: 'process-cancelled' as const }
    : { status: 'available' as const, executableFingerprint: `${id}-fingerprint` }
  const ready = (id: string, mediaType: string) => async () => ({
    status: 'ready' as const,
    mediaType,
    bytes: Uint8Array.from([1, 2, 3]),
    contentSha256: `${id}-digest`,
    executableFingerprint: `${id}-fingerprint`,
  })
  return {
    drawioSvgCapability: vi.fn(available('drawio')),
    drawnixSvgCapability: vi.fn(available('drawnix')),
    circuitikzPdfCapability: vi.fn(available('circuitikz')),
    pdfToSvgCapability: vi.fn(available('pdf-svg')),
    pdfToPngCapability: vi.fn(available('pdf-png')),
    slidevHtmlCapability: vi.fn(available('slidev-html')),
    slidevPdfCapability: vi.fn(available('slidev-pdf')),
    slidevPngCapability: vi.fn(available('slidev-png')),
    slidevPptxCapability: vi.fn(available('slidev-pptx')),
    slidevMp4Capability: vi.fn(available('slidev-mp4')),
    renderDrawioSvg: vi.fn(ready('drawio', 'image/svg+xml')),
    renderDrawnixSvg: vi.fn(ready('drawnix', 'image/svg+xml')),
    compileCircuitikzPdf: vi.fn(ready('circuitikz', 'application/pdf')),
    convertPdfToSvg: vi.fn(ready('pdf-svg', 'image/svg+xml')),
    convertPdfToPng: vi.fn(ready('pdf-png', 'image/png')),
    renderSlidevHtml: vi.fn(ready('slidev-html', 'application/zip')),
    renderSlidevPdf: vi.fn(ready('slidev-pdf', 'application/pdf')),
    renderSlidevPng: vi.fn(ready('slidev-png', 'application/zip')),
    renderSlidevPptx: vi.fn(ready('slidev-pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')),
    renderSlidevMp4: vi.fn(ready('slidev-mp4', 'video/mp4')),
  } as unknown as OptionalRuntimeBoundary
}

function fixture(): OptionalRuntimeFixture {
  return {
    slidevSource: '# Capability lane',
    drawioSource: '<mxfile />',
    drawnixSource: '{"type":"drawnix"}',
    circuitikzSource: '\\begin{circuitikz}\\draw (0,0) to[R] (1,0);\\end{circuitikz}',
    pdfBytes: Uint8Array.from([0x25, 0x50, 0x44, 0x46]),
    slidevPngOptions: { withClicks: false, imageScale: 1 },
    slidevMp4Options: { withClicks: false, imageScale: 1, fps: 1, crf: 23 },
  }
}
