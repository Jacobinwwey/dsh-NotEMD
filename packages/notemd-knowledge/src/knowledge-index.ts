import MiniSearch from 'minisearch'

import { parseMarkdownDocument, type MarkdownSection } from '@notemd-harness/documents'
import type { NotemdVault, VaultDocument } from '@notemd-harness/vault'

export interface KnowledgeMatch {
  readonly path: string
  readonly title: string
  readonly excerpt: string
  readonly score: number
}

export interface KnowledgeRetrievalRequest {
  readonly query: string
  readonly taskRoots?: readonly string[]
  readonly currentPath?: string
  readonly topK?: number
  readonly windowSections?: number
}

export interface KnowledgeHitExplanation {
  readonly includedByRoot: string
  readonly matchedTerms: readonly string[]
  readonly window: {
    readonly before: number
    readonly after: number
  }
}

export interface ExplainableKnowledgeMatch extends KnowledgeMatch {
  readonly anchor: string
  readonly breadcrumb: readonly string[]
  readonly citationId: string
  readonly context: string
  readonly explanation: KnowledgeHitExplanation
}

export interface KnowledgeRetrievalResult {
  readonly query: string
  readonly taskRoots: readonly string[]
  readonly currentPath?: string
  readonly matches: readonly ExplainableKnowledgeMatch[]
}

interface IndexedSection {
  readonly id: string
  readonly path: string
  readonly title: string
  readonly breadcrumb: readonly string[]
  readonly anchor: string
  readonly markdown: string
  readonly searchText: string
  readonly order: number
}

interface StoredSearchMatch extends IndexedSection {
  readonly score: number
}

const defaultTopK = 8
const defaultWindowSections = 1

export class VaultKnowledgeIndex {
  private index = createMiniSearch()
  private readonly sectionsByPath = new Map<string, readonly IndexedSection[]>()

  constructor(private readonly vault: NotemdVault) {}

  async rebuild(signal?: AbortSignal): Promise<void> {
    const nextIndex = createMiniSearch()
    const nextSectionsByPath = new Map<string, readonly IndexedSection[]>()
    const paths = await this.vault.listMarkdown(signal)

    for (const path of paths) {
      throwIfAborted(signal)
      try {
        const sections = indexDocument(await this.vault.read(path, signal))
        if (sections.length > 0) {
          nextIndex.addAll(sections)
          nextSectionsByPath.set(path, sections)
        }
      } catch (error) {
        if (!isMissingVaultDocument(error)) {
          throw error
        }
      }
    }

    throwIfAborted(signal)
    this.index = nextIndex
    this.sectionsByPath.clear()
    for (const [path, sections] of nextSectionsByPath) {
      this.sectionsByPath.set(path, sections)
    }
  }

  async upsert(document: VaultDocument): Promise<void> {
    this.removeIndexedPath(document.path)
    const sections = indexDocument(document)
    if (sections.length === 0) {
      return
    }
    this.index.addAll(sections)
    this.sectionsByPath.set(document.path, sections)
  }

  async remove(path: string): Promise<void> {
    this.removeIndexedPath(path)
  }

  async search(query: string): Promise<readonly KnowledgeMatch[]> {
    const result = await this.retrieve({ query })
    return Object.freeze(result.matches.map(({ path, title, excerpt, score }) => ({ path, title, excerpt, score })))
  }

  async retrieve(request: KnowledgeRetrievalRequest): Promise<KnowledgeRetrievalResult> {
    const query = requireQuery(request.query)
    const taskRoots = normalizeTaskRoots(request.taskRoots)
    const currentPath = request.currentPath === undefined ? undefined : normalizeWorkspacePath(request.currentPath, 'Current file')
    const topK = boundedInteger(request.topK, defaultTopK, 'Knowledge top-k')
    const windowSections = boundedInteger(request.windowSections, defaultWindowSections, 'Knowledge section window', 0)
    const terms = query.toLocaleLowerCase().split(/\s+/u).filter(Boolean)

    const matches = this.index
      .search(query, { combineWith: 'AND', prefix: true })
      .map((result) => result as unknown as StoredSearchMatch)
      .filter((result) => currentPath === undefined || result.path !== currentPath)
      .filter((result) => taskRoots.length === 0 || taskRoots.some((root) => ownsPath(root, result.path)))
      .sort(compareStoredSearchMatch)
      .slice(0, topK)
      .map((result) => this.toExplainableMatch(result, terms, taskRoots, windowSections))

    return Object.freeze({
      query,
      taskRoots: Object.freeze(taskRoots),
      ...(currentPath === undefined ? {} : { currentPath }),
      matches: Object.freeze(matches),
    })
  }

  private removeIndexedPath(path: string): void {
    const previous = this.sectionsByPath.get(path)
    if (previous === undefined) {
      return
    }
    for (const section of previous) {
      this.index.remove(section)
    }
    this.sectionsByPath.delete(path)
  }

  private toExplainableMatch(
    result: StoredSearchMatch,
    terms: readonly string[],
    taskRoots: readonly string[],
    windowSections: number,
  ): ExplainableKnowledgeMatch {
    const sections = this.sectionsByPath.get(result.path) ?? []
    const selectedIndex = sections.findIndex((section) => section.id === result.id)
    const before = selectedIndex < 0 ? 0 : Math.min(windowSections, selectedIndex)
    const after = selectedIndex < 0 ? 0 : Math.min(windowSections, sections.length - selectedIndex - 1)
    const contextSections = selectedIndex < 0
      ? [result.markdown]
      : sections.slice(selectedIndex - before, selectedIndex + after + 1).map((section) => section.markdown)
    const includedByRoot = taskRoots.find((root) => ownsPath(root, result.path)) ?? 'workspace'

    return Object.freeze({
      path: result.path,
      title: result.title,
      excerpt: excerptFor(result.searchText, terms),
      score: result.score,
      anchor: result.anchor,
      breadcrumb: Object.freeze([...result.breadcrumb]),
      citationId: `citation:${result.path}#${result.anchor}`,
      context: contextSections.join('\n\n'),
      explanation: Object.freeze({
        includedByRoot,
        matchedTerms: Object.freeze(terms.filter((term) => result.searchText.toLocaleLowerCase().includes(term))),
        window: Object.freeze({ before, after }),
      }),
    })
  }
}

function createMiniSearch(): MiniSearch<IndexedSection> {
  return new MiniSearch<IndexedSection>({
    fields: ['title', 'searchText'],
    storeFields: ['id', 'path', 'title', 'breadcrumb', 'anchor', 'markdown', 'searchText', 'order'],
    idField: 'id',
  })
}

function indexDocument(document: VaultDocument): readonly IndexedSection[] {
  const parsed = parseMarkdownDocument(document)
  return Object.freeze(parsed.sections.map((section, order) => indexedSection(document.path, section, order)))
}

function indexedSection(path: string, section: MarkdownSection, order: number): IndexedSection {
  return Object.freeze({
    id: `${path}#${section.anchor}`,
    path,
    title: section.title,
    breadcrumb: Object.freeze([...section.breadcrumb]),
    anchor: section.anchor,
    markdown: section.markdown,
    searchText: section.searchText,
    order,
  })
}

function requireQuery(value: string): string {
  if (typeof value !== 'string') {
    throw new TypeError('Knowledge queries must be text.')
  }
  return value.trim()
}

function normalizeTaskRoots(roots: readonly string[] | undefined): string[] {
  if (roots === undefined) {
    return []
  }
  const normalized = roots.map((root) => normalizeWorkspacePath(root, 'Knowledge task root')).sort()
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index] === normalized[index - 1]) {
      throw new RangeError(`Knowledge task roots must be unique: ${normalized[index]}`)
    }
  }
  return normalized
}

function normalizeWorkspacePath(path: string, field: string): string {
  if (typeof path !== 'string' || path.length === 0 || path.startsWith('/') || path.includes('\\')) {
    throw new RangeError(`${field} must be a relative slash-separated workspace path.`)
  }
  const normalized = path.replace(/\/+$/u, '')
  if (normalized.length === 0 || normalized.split('/').some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
    throw new RangeError(`${field} must not contain empty, dot, or parent segments.`)
  }
  return normalized
}

function boundedInteger(value: number | undefined, fallback: number, field: string, minimum = 1): number {
  const result = value ?? fallback
  if (!Number.isSafeInteger(result) || result < minimum || result > 100) {
    throw new RangeError(`${field} must be an integer between ${minimum} and 100.`)
  }
  return result
}

function ownsPath(root: string, path: string): boolean {
  return path === root || path.startsWith(`${root}/`)
}

function compareStoredSearchMatch(left: StoredSearchMatch, right: StoredSearchMatch): number {
  if (right.score !== left.score) {
    return right.score - left.score
  }
  return left.id.localeCompare(right.id)
}

function excerptFor(searchText: string, terms: readonly string[]): string {
  const lower = searchText.toLocaleLowerCase()
  const firstHit = terms
    .map((term) => lower.indexOf(term))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0]
  const start = firstHit === undefined ? 0 : Math.max(0, firstHit - 80)
  return searchText.slice(start, start + 240).trim()
}

function isMissingVaultDocument(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'VAULT_NOT_FOUND'
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('The knowledge rebuild was cancelled.', 'AbortError')
  }
}
