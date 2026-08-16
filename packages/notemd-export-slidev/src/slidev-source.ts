import { createHash } from 'node:crypto'

import type {
  PreparedDocumentArtifactRenderOutput,
  SlidevSourceSpec,
} from '@notemd-harness/artifacts'
import type { VaultDocument } from '@notemd-harness/vault'

const slideSeparator = /^---\s*$/u
const slidevHeadmatterKey = /^\s*(theme|layout|transition|class|background|canvasWidth|aspectRatio|drawings|record|routerMode|mdc|highlighter)\s*:/imu

export interface PreparedSlidevArtifacts {
  readonly source: Extract<PreparedDocumentArtifactRenderOutput['source'], { readonly content: string }>
  readonly report: Extract<PreparedDocumentArtifactRenderOutput['source'], { readonly content: string }>
}

export function prepareSlidevArtifacts(spec: SlidevSourceSpec, source: VaultDocument): PreparedSlidevArtifacts {
  assertSourceBinding(spec, source)
  const inputKind = isSlidevDeckMarkdown(source.content) ? 'slidev-deck' : 'markdown-note'
  const preparedMarkdown = inputKind === 'slidev-deck'
    ? normalizeDeckHeadmatter(source.content, spec.theme)
    : buildDeterministicSlidevDeck(source.content, spec.title, spec.theme)
  const normalizedMarkdown = `${preparedMarkdown.trim()}\n`
  const slides = splitSlidevDeck(normalizedMarkdown)
  const report = {
    version: 1,
    status: 'prepared',
    sourcePath: source.path,
    sourceRevision: source.revision,
    inputKind,
    theme: spec.theme,
    slideCount: slides.length,
    preparedMarkdownSha256: sha256(normalizedMarkdown),
    slides: slides.map((slide, index) => summarizeSlide(slide, index + 1)),
  }
  return Object.freeze({
    source: Object.freeze({ filename: 'slides.md', mediaType: 'text/markdown', content: normalizedMarkdown }),
    report: Object.freeze({
      filename: 'layout-report.json',
      mediaType: 'application/json',
      content: `${JSON.stringify(report, null, 2)}\n`,
    }),
  })
}

export function isSlidevDeckMarkdown(markdown: string): boolean {
  const lines = markdown.split(/\r?\n/u)
  const headmatterEnd = leadingHeadmatterEnd(lines)
  if (headmatterEnd > 0 && slidevHeadmatterKey.test(lines.slice(1, headmatterEnd).join('\n'))) {
    return true
  }
  return lines.some((line, index) => slideSeparator.test(line) && index !== 0 && index !== headmatterEnd)
}

export function buildDeterministicSlidevDeck(markdown: string, fallbackTitle: string, theme: string): string {
  const title = extractTitle(markdown) ?? fallbackTitle
  const sections = splitHeadingSections(markdown)
  const slides: string[] = [
    [deckHeadmatter(title, theme), `# ${title}`].join('\n\n'),
  ]
  for (const section of sections) {
    if (section.level === 1) {
      continue
    }
    if (section.level === 2) {
      slides.push(['layout: section', '---', '', `# ${section.heading}`].join('\n'))
      if (section.body.trim().length > 0) {
        slides.push([`## ${section.heading}`, section.body.trim()].join('\n\n'))
      }
      continue
    }
    slides.push([`${'#'.repeat(section.level)} ${section.heading}`, section.body.trim()].filter(Boolean).join('\n\n'))
  }
  if (slides.length === 1 && markdown.trim().length > 0) {
    slides.push(['## Notes', markdown.trim()].join('\n\n'))
  }
  slides.push(['layout: center', '---', '', '# End'].join('\n'))
  return slides.map((slide) => slide.trim()).filter(Boolean).join('\n\n---\n\n')
}

function deckHeadmatter(title: string, theme: string): string {
  return [
    '---',
    `theme: ${yamlScalar(theme)}`,
    `title: ${yamlScalar(title)}`,
    'fonts:',
    '  provider: none',
    '---',
  ].join('\n')
}

function normalizeDeckHeadmatter(markdown: string, theme: string): string {
  const lines = markdown.split(/\r?\n/u)
  const headmatterEnd = leadingHeadmatterEnd(lines)
  if (headmatterEnd < 0) {
    return `${deckHeadmatter(extractTitle(markdown) ?? 'Slidev Deck', theme)}\n\n${markdown.trim()}`
  }
  const headmatter = lines.slice(1, headmatterEnd)
  const themeIndex = headmatter.findIndex((line) => /^\s*theme\s*:/iu.test(line))
  if (themeIndex >= 0) {
    headmatter[themeIndex] = `theme: ${yamlScalar(theme)}`
  } else {
    headmatter.push(`theme: ${yamlScalar(theme)}`)
  }
  enforceOfflineFontProvider(headmatter)
  return ['---', ...headmatter, '---', ...lines.slice(headmatterEnd + 1)].join('\n')
}

function enforceOfflineFontProvider(headmatter: string[]): void {
  const fontsIndex = headmatter.findIndex((line) => /^fonts\s*:/iu.test(line))
  if (fontsIndex < 0) {
    headmatter.push('fonts:', '  provider: none')
    return
  }

  headmatter[fontsIndex] = 'fonts:'
  let blockEnd = fontsIndex + 1
  while (blockEnd < headmatter.length) {
    const line = headmatter[blockEnd] ?? ''
    if (line.trim().length > 0 && !/^\s/u.test(line) && !/^\s*#/u.test(line)) {
      break
    }
    blockEnd += 1
  }

  const providerIndexes: number[] = []
  for (let index = fontsIndex + 1; index < blockEnd; index++) {
    if (/^\s+provider\s*:/iu.test(headmatter[index] ?? '')) {
      providerIndexes.push(index)
    }
  }
  if (providerIndexes.length === 0) {
    headmatter.splice(fontsIndex + 1, 0, '  provider: none')
    return
  }
  headmatter[providerIndexes[0] as number] = '  provider: none'
  for (const duplicateIndex of providerIndexes.slice(1).reverse()) {
    headmatter.splice(duplicateIndex, 1)
  }
}

function splitSlidevDeck(markdown: string): string[] {
  const lines = markdown.trim().split(/\r?\n/u)
  const headmatterEnd = leadingHeadmatterEnd(lines)
  const slides: string[] = []
  let start = 0
  let slideFrontmatterOpen = false
  for (let index = Math.max(headmatterEnd + 1, 0); index < lines.length; index++) {
    if (!slideSeparator.test(lines[index] ?? '')) {
      continue
    }
    if (slideFrontmatterOpen) {
      slideFrontmatterOpen = false
      continue
    }
    const candidate = lines.slice(start, index).join('\n').trim()
    if (candidate.length > 0) {
      slides.push(candidate)
    }
    start = index + 1
    slideFrontmatterOpen = nextNonBlankLineIsFrontmatter(lines, start)
  }
  const tail = lines.slice(start).join('\n').trim()
  if (tail.length > 0) {
    slides.push(tail)
  }
  return slides
}

function nextNonBlankLineIsFrontmatter(lines: readonly string[], start: number): boolean {
  for (let index = start; index < lines.length; index++) {
    const line = lines[index]?.trim() ?? ''
    if (line.length === 0) {
      continue
    }
    return /^[A-Za-z][A-Za-z0-9_-]*\s*:/u.test(line)
  }
  return false
}

function leadingHeadmatterEnd(lines: readonly string[]): number {
  if (!slideSeparator.test(lines[0] ?? '')) {
    return -1
  }
  for (let index = 1; index < lines.length; index++) {
    if (slideSeparator.test(lines[index] ?? '')) {
      return index
    }
  }
  return -1
}

interface HeadingSection {
  readonly level: number
  readonly heading: string
  readonly body: string
}

function splitHeadingSections(markdown: string): HeadingSection[] {
  const lines = markdown.split(/\r?\n/u)
  const sections: HeadingSection[] = []
  let current: { level: number; heading: string; body: string[] } | undefined
  let inFence = false
  for (const line of lines) {
    if (/^\s*```/u.test(line)) {
      inFence = !inFence
    }
    const match = !inFence ? /^(#{1,6})\s+(.+?)\s*$/u.exec(line) : null
    if (match !== null) {
      if (current !== undefined) {
        sections.push({ ...current, body: current.body.join('\n') })
      }
      current = { level: match[1]?.length ?? 1, heading: match[2] ?? '', body: [] }
    } else if (current !== undefined) {
      current.body.push(line)
    }
  }
  if (current !== undefined) {
    sections.push({ ...current, body: current.body.join('\n') })
  }
  return sections
}

function summarizeSlide(markdown: string, slide: number) {
  const heading = markdown.split(/\r?\n/u).find((line) => /^#{1,6}\s+/u.test(line))?.replace(/^#{1,6}\s+/u, '') ?? null
  const body = markdown.replace(/^---[\s\S]*?---\s*/u, '')
  const characterCount = body.length
  const tableRowCount = body.split(/\r?\n/u).filter((line) => /^\s*\|.*\|\s*$/u.test(line)).length
  const codeFenceCount = Math.floor((body.match(/^\s*```/gmu)?.length ?? 0) / 2)
  const findingCodes = [
    ...(characterCount > 1_350 ? ['dense-text'] : []),
    ...(tableRowCount > 10 ? ['dense-table'] : []),
    ...(codeFenceCount > 1 ? ['multiple-code-blocks'] : []),
  ]
  return {
    slide,
    heading,
    characterCount,
    tableRowCount,
    codeFenceCount,
    status: findingCodes.length === 0 ? 'prepared' : 'review-required',
    findingCodes,
  }
}

function extractTitle(markdown: string): string | null {
  const match = /^#\s+(.+?)\s*$/mu.exec(markdown)
  return match?.[1]?.trim() || null
}

function assertSourceBinding(spec: SlidevSourceSpec, source: VaultDocument): void {
  if (spec.version !== 1 || spec.source.path !== source.path || spec.source.revision !== source.revision) {
    throw new Error('Slidev source path and revision must match the source document.')
  }
  if (spec.title.trim().length === 0 || spec.theme.trim().length === 0) {
    throw new Error('Slidev title and theme must be non-empty.')
  }
}

function yamlScalar(value: string): string {
  return /^[A-Za-z0-9._/-]+$/u.test(value) ? value : JSON.stringify(value)
}

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}
