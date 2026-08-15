import { basename, extname } from 'node:path'

import { createContentSha256, type ContentSha256 } from '@notemd-harness/mutation'

export interface MarkdownDocumentInput {
  readonly path: string
  readonly content: string
}

export interface MarkdownSection {
  readonly anchor: string
  readonly explicitBlockId?: string
  readonly level: number
  readonly title: string
  readonly breadcrumb: readonly string[]
  readonly markdown: string
  readonly searchText: string
}

export interface ParsedMarkdownDocument {
  readonly path: string
  readonly content: string
  readonly sourceDigest: ContentSha256
  readonly title: string
  readonly sections: readonly MarkdownSection[]
}

interface HeadingAstNode {
  readonly type: 'heading'
  readonly level: number
  readonly line: number
  readonly rawText: string
  readonly title: string
  readonly explicitBlockId?: string
}

interface MarkdownAst {
  readonly headings: readonly HeadingAstNode[]
  readonly lines: readonly string[]
}

interface MutableSection {
  readonly level: number
  readonly title: string
  readonly explicitBlockId?: string
  readonly breadcrumb: readonly string[]
  readonly startLine: number
  endLine: number
}

const obsidianBlockId = /\s+\^([A-Za-z0-9-]+)\s*$/u

/**
 * The parser first builds a small Markdown structural AST. This intentionally owns
 * fence state and heading boundaries, so downstream transformations never infer
 * document structure from a global text replacement.
 */
export function parseMarkdownDocument(input: MarkdownDocumentInput): ParsedMarkdownDocument {
  assertDocumentInput(input)
  const ast = parseMarkdownAst(input.content)
  const title = titleFor(input.path, ast.headings)
  const sections = sectionsFromAst(ast, title)

  return Object.freeze({
    path: input.path,
    content: input.content,
    sourceDigest: createContentSha256(input.content),
    title,
    sections: Object.freeze(sections),
  })
}

export function stripMarkdownForSearch(markdown: string): string {
  const ast = parseMarkdownAst(markdown)
  const fenceLines = fencedLineNumbers(markdown)

  return ast.lines
    .filter((_line, index) => !fenceLines.has(index))
    .join('\n')
    .replace(/!\[([^\]]*)\]\([^)]+\)/gu, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, '$1')
    .replace(/`([^`]+)`/gu, '$1')
    .replace(/\s+\^[A-Za-z0-9-]+(?=\n|$)/gu, '')
    .replace(/^#{1,6}\s+/gmu, '')
    .replace(/^\s*[-*+]\s+/gmu, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

function parseMarkdownAst(content: string): MarkdownAst {
  const lines = content.replace(/\r\n?/gu, '\n').split('\n')
  const headings: HeadingAstNode[] = []
  let openFence: { marker: '`' | '~'; length: number } | undefined

  for (const [line, value] of lines.entries()) {
    const fence = fenceDelimiter(value)
    if (openFence !== undefined) {
      if (fence !== undefined && fence.marker === openFence.marker && fence.length >= openFence.length) {
        openFence = undefined
      }
      continue
    }
    if (fence !== undefined) {
      openFence = fence
      continue
    }

    const match = /^(?: {0,3})(#{1,6})[ \t]+(.+?)\s*$/u.exec(value)
    if (match === null) {
      continue
    }

    const rawText = removeClosingHashSequence(match[2] ?? '')
    const explicitBlockId = extractBlockId(rawText)
    const headingTitle = stripBlockId(rawText)
    if (headingTitle.length === 0) {
      continue
    }
    headings.push({
      type: 'heading',
      level: (match[1] ?? '').length,
      line,
      rawText,
      title: headingTitle,
      ...(explicitBlockId === undefined ? {} : { explicitBlockId }),
    })
  }

  return Object.freeze({ headings: Object.freeze(headings), lines: Object.freeze(lines) })
}

function sectionsFromAst(ast: MarkdownAst, documentTitle: string): MarkdownSection[] {
  const sections: MutableSection[] = []
  const headingStack: Array<{ level: number; title: string }> = []

  if (ast.headings.length === 0) {
    if (trimMarkdown(ast.lines.join('\n')).length > 0) {
      sections.push({
        level: 0,
        title: documentTitle,
        breadcrumb: [documentTitle],
        startLine: 0,
        endLine: ast.lines.length,
      })
    }
  } else {
    const firstHeading = ast.headings[0]
    if (firstHeading !== undefined && trimMarkdown(ast.lines.slice(0, firstHeading.line).join('\n')).length > 0) {
      sections.push({
        level: 0,
        title: documentTitle,
        breadcrumb: [documentTitle],
        startLine: 0,
        endLine: firstHeading.line,
      })
    }

    for (const heading of ast.headings) {
      while (headingStack.length > 0 && (headingStack[headingStack.length - 1]?.level ?? 0) >= heading.level) {
        headingStack.pop()
      }
      headingStack.push({ level: heading.level, title: heading.title })
      sections.push({
        level: heading.level,
        title: heading.title,
        ...(heading.explicitBlockId === undefined ? {} : { explicitBlockId: heading.explicitBlockId }),
        breadcrumb: headingStack.map((entry) => entry.title),
        startLine: heading.line,
        endLine: ast.lines.length,
      })
    }
  }

  for (let index = 0; index + 1 < sections.length; index += 1) {
    const current = sections[index]
    const next = sections[index + 1]
    if (current !== undefined && next !== undefined) {
      current.endLine = next.startLine
    }
  }

  const anchors = new Map<string, number>()
  return sections
    .map((section, index) => {
      const markdown = trimMarkdown(ast.lines.slice(section.startLine, section.endLine).join('\n'))
      if (markdown.length === 0) {
        return undefined
      }
      const baseAnchor = section.explicitBlockId ?? anchorSlug(section.title, index + 1)
      const count = (anchors.get(baseAnchor) ?? 0) + 1
      anchors.set(baseAnchor, count)
      const anchor = count === 1 ? baseAnchor : `${baseAnchor}-${count}`

      return Object.freeze({
        anchor,
        ...(section.explicitBlockId === undefined ? {} : { explicitBlockId: section.explicitBlockId }),
        level: section.level,
        title: section.title,
        breadcrumb: Object.freeze([...section.breadcrumb]),
        markdown,
        searchText: stripMarkdownForSearch(markdown),
      })
    })
    .filter((section): section is MarkdownSection => section !== undefined)
}

function titleFor(path: string, headings: readonly HeadingAstNode[]): string {
  const h1 = headings.find((heading) => heading.level === 1)
  return h1?.title ?? basename(path, extname(path))
}

function fencedLineNumbers(markdown: string): Set<number> {
  const lines = markdown.replace(/\r\n?/gu, '\n').split('\n')
  const result = new Set<number>()
  let openFence: { marker: '`' | '~'; length: number; line: number } | undefined

  for (const [line, value] of lines.entries()) {
    const fence = fenceDelimiter(value)
    if (openFence !== undefined) {
      result.add(line)
      if (fence !== undefined && fence.marker === openFence.marker && fence.length >= openFence.length) {
        openFence = undefined
      }
      continue
    }
    if (fence !== undefined) {
      result.add(line)
      openFence = { ...fence, line }
    }
  }
  return result
}

function fenceDelimiter(line: string): { marker: '`' | '~'; length: number } | undefined {
  const match = /^(?: {0,3})(`{3,}|~{3,})/u.exec(line)
  if (match === null) {
    return undefined
  }
  const markerText = match[1]
  if (markerText === undefined) {
    return undefined
  }
  const marker = markerText[0]
  if (marker !== '`' && marker !== '~') {
    return undefined
  }
  return { marker, length: markerText.length }
}

function removeClosingHashSequence(value: string): string {
  return value.replace(/[ \t]+#+[ \t]*$/u, '').trim()
}

function extractBlockId(value: string): string | undefined {
  return obsidianBlockId.exec(value)?.[1]
}

function stripBlockId(value: string): string {
  return value.replace(obsidianBlockId, '').trim()
}

function anchorSlug(value: string, index: number): string {
  const normalized = value
    .normalize('NFKD')
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}\p{Mark}]+/gu, '-')
    .replace(/-+/gu, '-')
    .replace(/^-|-$/gu, '')
  return normalized.length > 0 ? normalized : `section-${String(index).padStart(2, '0')}`
}

function trimMarkdown(value: string): string {
  return value.replace(/^\s+|\s+$/gu, '')
}

function assertDocumentInput(input: MarkdownDocumentInput): void {
  if (typeof input.path !== 'string' || input.path.length === 0 || input.path.includes('\\') || input.path.startsWith('/')) {
    throw new RangeError('Markdown document paths must be relative slash-separated paths.')
  }
  if (typeof input.content !== 'string' || input.content.includes('\u0000')) {
    throw new TypeError('Markdown document content must be text without NUL bytes.')
  }
}
