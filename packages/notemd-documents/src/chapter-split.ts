import {
  createContentSha256,
  createWorkspaceMutationPlan,
  type ContentSha256,
  type WorkspaceMutationPlan,
} from '@notemd-harness/mutation'
import type { VaultDocument } from '@notemd-harness/vault'
import { basename, extname } from 'node:path'

import type { MarkdownSection, ParsedMarkdownDocument } from './markdown-document.js'

export type ChapterSplitHeadingLevel = 'auto' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'

export interface ChapterOutputLocation {
  resolve(sourcePath: string, sourceTitle: string): ResolvedChapterOutput
}

export interface ResolvedChapterOutput {
  readonly folderPath: string
  readonly tocPath: string
  readonly manifestPath: string
  chapterPath(order: number, title: string): string
}

export interface ChapterSplitMutationRequest {
  readonly source: VaultDocument
  readonly parsedSource: ParsedMarkdownDocument
  readonly output: ChapterOutputLocation
  readonly existingArtifacts: readonly VaultDocument[]
  readonly splitHeadingLevel?: ChapterSplitHeadingLevel
}

interface GeneratedChapter {
  readonly title: string
  readonly order: number
  readonly path: string
  readonly markdown: string
  readonly breadcrumb: readonly string[]
  readonly nestedHeadings: readonly { level: number; text: string; blockId: string }[]
}

interface ChapterManifest {
  readonly version: 2
  readonly sourcePath: string
  readonly generatedPaths: readonly string[]
  readonly generatedFileHashes: Readonly<Record<string, ContentSha256>>
}

export function sourceSiblingChapterOutput(): ChapterOutputLocation {
  return Object.freeze({
    resolve(sourcePath: string, sourceTitle: string) {
      const parent = sourcePath.split('/').slice(0, -1).join('/')
      const folderPath = `${parent.length === 0 ? '' : `${parent}/`}${sourceTitle}_chapters`
      return Object.freeze({
        folderPath,
        tocPath: `${folderPath}/${sourceTitle}_TOC.md`,
        manifestPath: `${folderPath}/.notemd-chapter-split.json`,
        chapterPath(order: number, title: string) {
          return `${folderPath}/${String(order).padStart(2, '0')}-${chapterSlug(title, order)}.md`
        },
      })
    },
  })
}

export function buildChapterSplitMutationPlan(request: ChapterSplitMutationRequest): WorkspaceMutationPlan {
  assertSourceMatchesParsedDocument(request.source, request.parsedSource)
  const sourceBasename = basename(request.source.path, extname(request.source.path))
  const output = request.output.resolve(request.source.path, sourceBasename)
  const splitLevel = resolveSplitLevel(request.parsedSource.sections, request.splitHeadingLevel)
  const chapters = buildChapters(request.parsedSource, output, splitLevel)
  const nextContent = new Map<string, string>()
  const tocContent = buildToc(request.source.path, sourceBasename, output, splitLevel, chapters)
  nextContent.set(output.tocPath, tocContent)
  for (const chapter of chapters) {
    nextContent.set(chapter.path, chapter.markdown)
  }

  const existingByPath = new Map(request.existingArtifacts.map((artifact) => [artifact.path, artifact]))
  const manifestDocument = existingByPath.get(output.manifestPath)
  const previousManifest = manifestDocument === undefined ? undefined : parseManifest(manifestDocument)
  if (previousManifest !== undefined && previousManifest.sourcePath !== request.source.path) {
    throw new Error(`Chapter split manifest ownership does not match source: ${output.manifestPath}`)
  }
  const nextPaths = new Set(nextContent.keys())
  assertManagedArtifactIntegrity(previousManifest, existingByPath)
  assertOutputOwnership(previousManifest, existingByPath, nextPaths)

  const manifestContent = JSON.stringify({
    version: 2,
    sourcePath: request.source.path,
    generatedPaths: [...nextPaths].sort(),
    generatedFileHashes: Object.fromEntries(
      [...nextContent.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([path, content]) => [path, createContentSha256(content)]),
    ),
  }, null, 2)

  const provenance = {
    operationId: 'content.split-note-by-chapters',
    sourceRefs: [request.source.path],
    evidenceRefs: [],
  }
  const mutations = [
    ...[...nextContent.entries()].map(([destination, content]) => {
      const current = existingByPath.get(destination)
      return {
        kind: 'write-text' as const,
        destination,
        expectedRevision: current?.revision ?? 'absent',
        provenance,
        conflictPolicy: 'reject' as const,
        mediaType: 'text/markdown',
        content,
        contentSha256: createContentSha256(content),
      }
    }),
    {
      kind: 'write-text' as const,
      destination: output.manifestPath,
      expectedRevision: manifestDocument?.revision ?? 'absent',
      provenance,
      conflictPolicy: 'reject' as const,
      mediaType: 'application/json',
      content: manifestContent,
      contentSha256: createContentSha256(manifestContent),
    },
    ...staleDeleteMutations(previousManifest, existingByPath, nextPaths, provenance),
  ]

  return createWorkspaceMutationPlan({ provenance, mutations })
}

function resolveSplitLevel(
  sections: readonly MarkdownSection[],
  setting: ChapterSplitHeadingLevel | undefined,
): number | undefined {
  const requested = setting ?? 'auto'
  if (requested !== 'auto') {
    const level = Number.parseInt(requested.slice(1), 10)
    if (!sections.some((section) => section.level === level)) {
      throw new Error(`Configured chapter split heading level H${level} was not found in the note.`)
    }
    return level
  }
  const headings = sections.filter((section) => section.level > 0)
  if (headings.length === 0) {
    return undefined
  }
  const h1Count = headings.filter((section) => section.level === 1).length
  if (h1Count === 1 && headings.some((section) => section.level === 2)) {
    return 2
  }
  return Math.min(...headings.map((section) => section.level))
}

function buildChapters(
  document: ParsedMarkdownDocument,
  output: ResolvedChapterOutput,
  splitLevel: number | undefined,
): readonly GeneratedChapter[] {
  if (splitLevel === undefined) {
    return [Object.freeze({
      title: document.title,
      order: 1,
      path: output.chapterPath(1, document.title),
      markdown: document.content.trim(),
      breadcrumb: Object.freeze([document.title]),
      nestedHeadings: Object.freeze([]),
    })]
  }

  const splitIndexes = document.sections
    .map((section, index) => ({ section, index }))
    .filter(({ section }) => section.level === splitLevel)
  const preamble = document.sections.filter((section) => section.level < splitLevel)

  return Object.freeze(splitIndexes.map(({ section, index }, chapterIndex) => {
    const nextIndex = splitIndexes[chapterIndex + 1]?.index ?? document.sections.length
    const chapterSections = document.sections.slice(index, nextIndex)
    const nestedHeadings = nestedHeadingsFor(chapterSections, splitLevel)
    let nestedHeadingIndex = 0
    const rendered = chapterSections.map((candidate) => {
      if (candidate.level <= splitLevel) {
        return candidate.markdown
      }
      const heading = nestedHeadings[nestedHeadingIndex]
      nestedHeadingIndex += 1
      return renderChapterSection(candidate, heading?.blockId)
    })
    const chapterMarkdown = [
      ...(chapterIndex === 0 ? preamble.map((section) => section.markdown) : []),
      ...rendered,
    ].filter((value) => value.length > 0).join('\n\n').trim()
    const order = chapterIndex + 1

    return Object.freeze({
      title: section.title,
      order,
      path: output.chapterPath(order, section.title),
      markdown: chapterMarkdown,
      breadcrumb: Object.freeze([...section.breadcrumb]),
      nestedHeadings: Object.freeze(nestedHeadings),
    })
  }))
}

function nestedHeadingsFor(
  sections: readonly MarkdownSection[],
  splitLevel: number,
): readonly { level: number; text: string; blockId: string }[] {
  const counts = new Map<string, number>()
  return sections
    .filter((section) => section.level > splitLevel)
    .map((section) => {
      const base = section.explicitBlockId ?? `notemd-${section.anchor}`
      const count = (counts.get(base) ?? 0) + 1
      counts.set(base, count)
      return Object.freeze({
        level: section.level,
        text: section.title,
        blockId: count === 1 ? base : `${base}-${count}`,
      })
    })
}

function renderChapterSection(
  section: MarkdownSection,
  blockId: string | undefined,
): string {
  if (section.explicitBlockId !== undefined || blockId === undefined) {
    return section.markdown
  }
  const [firstLine, ...remaining] = section.markdown.split('\n')
  return [`${firstLine ?? ''} ^${blockId}`, ...remaining].join('\n')
}

function buildToc(
  sourcePath: string,
  sourceTitle: string,
  output: ResolvedChapterOutput,
  splitLevel: number | undefined,
  chapters: readonly GeneratedChapter[],
): string {
  const chapterPaths = chapters.map((chapter) => chapter.path)
  const lines = [
    '---',
    'notemdGenerated: true',
    'notemdArtifactKind: "chapter-split-toc"',
    `sourcePath: ${JSON.stringify(sourcePath)}`,
    `sourceBasename: ${JSON.stringify(sourceTitle)}`,
    `requestedSplitHeadingLevel: "auto"`,
    `resolvedSplitHeadingLevel: ${splitLevel ?? 'null'}`,
    `chapterCount: ${chapters.length}`,
    `managedArtifactCount: ${chapters.length + 2}`,
    `outputFolderPath: ${JSON.stringify(output.folderPath)}`,
    `tocPath: ${JSON.stringify(output.tocPath)}`,
    `manifestPath: ${JSON.stringify(output.manifestPath)}`,
    'chapterNotePaths:',
    ...chapterPaths.map((path) => `  - ${JSON.stringify(path)}`),
    'chapterTitles:',
    ...chapters.map((chapter) => `  - ${JSON.stringify(chapter.title)}`),
    '---',
    `# ${sourceTitle} TOC`,
    '',
    `Source: [[${stripMarkdownExtension(sourcePath)}|${sourceTitle}]]`,
    'Requested split: Auto',
    `Resolved split level: ${splitLevel === undefined ? 'None' : `H${splitLevel}`}`,
    `Chapters: ${chapters.length}`,
    `Managed artifacts: ${chapters.length + 2}`,
    '',
  ]
  for (const chapter of chapters) {
    lines.push(`- [[${stripMarkdownExtension(chapter.path)}|${String(chapter.order).padStart(2, '0')}. ${chapter.title}]]`)
    for (const heading of chapter.nestedHeadings) {
      const indent = splitLevel === undefined ? 1 : Math.max(1, heading.level - splitLevel)
      lines.push(`${'  '.repeat(indent)}- [[${stripMarkdownExtension(chapter.path)}#^${heading.blockId}|${heading.text}]]`)
    }
  }
  return lines.join('\n').trim()
}

function parseManifest(document: VaultDocument): ChapterManifest {
  let value: unknown
  try {
    value = JSON.parse(document.content)
  } catch {
    throw new Error(`Chapter split manifest is not valid JSON: ${document.path}`)
  }
  if (!isChapterManifest(value)) {
    throw new Error(`Chapter split manifest has an unsupported shape: ${document.path}`)
  }
  return value
}

function isChapterManifest(value: unknown): value is ChapterManifest {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as Record<string, unknown>
  return candidate.version === 2
    && typeof candidate.sourcePath === 'string'
    && Array.isArray(candidate.generatedPaths)
    && candidate.generatedPaths.every((path) => typeof path === 'string')
    && typeof candidate.generatedFileHashes === 'object'
    && candidate.generatedFileHashes !== null
}

function assertManagedArtifactIntegrity(
  manifest: ChapterManifest | undefined,
  existingByPath: ReadonlyMap<string, VaultDocument>,
): void {
  if (manifest === undefined) {
    return
  }
  const conflicts = manifest.generatedPaths.filter((path) => {
    const existing = existingByPath.get(path)
    if (existing === undefined) {
      return false
    }
    const expectedHash = manifest.generatedFileHashes[path]
    return expectedHash === undefined || createContentSha256(existing.content) !== expectedHash
  })
  if (conflicts.length > 0) {
    throw new Error(`Refusing to overwrite manually edited chapter split artifacts: ${[...new Set(conflicts)].sort().join(', ')}`)
  }
}

function assertOutputOwnership(
  manifest: ChapterManifest | undefined,
  existingByPath: ReadonlyMap<string, VaultDocument>,
  nextPaths: ReadonlySet<string>,
): void {
  const owned = new Set(manifest?.generatedPaths ?? [])
  for (const path of nextPaths) {
    if (existingByPath.has(path) && !owned.has(path)) {
      throw new Error(`Chapter split output is occupied by an unmanaged file: ${path}`)
    }
  }
}

function staleDeleteMutations(
  manifest: ChapterManifest | undefined,
  existingByPath: ReadonlyMap<string, VaultDocument>,
  nextPaths: ReadonlySet<string>,
  provenance: { operationId: string; sourceRefs: readonly string[]; evidenceRefs: readonly string[] },
) {
  if (manifest === undefined) {
    return []
  }
  return manifest.generatedPaths
    .filter((path) => !nextPaths.has(path))
    .sort()
    .flatMap((destination) => {
      const current = existingByPath.get(destination)
      const expectedContentSha256 = manifest.generatedFileHashes[destination]
      if (current === undefined || expectedContentSha256 === undefined) {
        return []
      }
      return [{
        kind: 'delete' as const,
        destination,
        expectedRevision: current.revision,
        provenance,
        conflictPolicy: 'reject' as const,
        expectedContentSha256,
      }]
    })
}

function chapterSlug(title: string, order: number): string {
  const normalized = title
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/\s+/gu, '-')
    .replace(/[^\p{Letter}\p{Number}\p{Mark}-]/gu, '')
    .replace(/-+/gu, '-')
    .replace(/^-|-$/gu, '')
  return normalized.length > 0 ? normalized : `chapter-${String(order).padStart(2, '0')}`
}

function stripMarkdownExtension(path: string): string {
  return path.replace(/\.md$/iu, '')
}

function assertSourceMatchesParsedDocument(source: VaultDocument, parsed: ParsedMarkdownDocument): void {
  if (source.path !== parsed.path || createContentSha256(source.content) !== parsed.sourceDigest) {
    throw new Error('The chapter split source and parsed document must describe the same revision.')
  }
}
