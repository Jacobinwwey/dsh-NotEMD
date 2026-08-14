import { basename, extname } from 'node:path'

import MiniSearch from 'minisearch'

import type { NotemdVault, VaultDocument } from '@notemd-harness/vault'

export interface KnowledgeMatch {
  path: string
  title: string
  excerpt: string
  score: number
}

interface IndexedDocument {
  path: string
  title: string
  body: string
}

interface StoredSearchMatch extends IndexedDocument {
  score: number
}

export class VaultKnowledgeIndex {
  private index = createMiniSearch()
  private readonly documents = new Map<string, IndexedDocument>()

  constructor(private readonly vault: NotemdVault) {}

  async rebuild(signal?: AbortSignal): Promise<void> {
    const nextIndex = createMiniSearch()
    const nextDocuments = new Map<string, IndexedDocument>()
    const paths = await this.vault.listMarkdown(signal)

    for (const path of paths) {
      throwIfAborted(signal)
      try {
        const document = indexDocument(await this.vault.read(path, signal))
        nextIndex.add(document)
        nextDocuments.set(document.path, document)
      } catch (error) {
        if (!isMissingVaultDocument(error)) {
          throw error
        }
      }
    }

    throwIfAborted(signal)
    this.index = nextIndex
    this.documents.clear()
    for (const [path, document] of nextDocuments) {
      this.documents.set(path, document)
    }
  }

  async upsert(document: VaultDocument): Promise<void> {
    const indexed = indexDocument(document)
    const previous = this.documents.get(indexed.path)
    if (previous !== undefined) {
      this.index.remove(previous)
    }
    this.index.add(indexed)
    this.documents.set(indexed.path, indexed)
  }

  async remove(path: string): Promise<void> {
    const previous = this.documents.get(path)
    if (previous === undefined) {
      return
    }
    this.index.remove(previous)
    this.documents.delete(path)
  }

  async search(query: string): Promise<readonly KnowledgeMatch[]> {
    const trimmedQuery = query.trim()
    if (trimmedQuery.length === 0) {
      return []
    }

    return this.index
      .search(trimmedQuery, { combineWith: 'AND', prefix: true })
      .map((result) => toKnowledgeMatch(result as unknown as StoredSearchMatch, trimmedQuery))
  }
}

function createMiniSearch(): MiniSearch<IndexedDocument> {
  return new MiniSearch<IndexedDocument>({
    fields: ['title', 'body'],
    storeFields: ['path', 'title', 'body'],
    idField: 'path',
  })
}

function indexDocument(document: VaultDocument): IndexedDocument {
  const body = stripMarkdown(document.content)
  return {
    path: document.path,
    title: titleFor(document.path, document.content),
    body,
  }
}

function titleFor(path: string, content: string): string {
  const heading = content.match(/^\s{0,3}#\s+(.+)$/mu)?.[1]?.trim()
  return heading && heading.length > 0 ? heading : basename(path, extname(path))
}

function stripMarkdown(content: string): string {
  return content
    .replace(/```[\s\S]*?```/gu, ' ')
    .replace(/!?(\[[^\]]*\])\([^)]*\)/gu, '$1')
    .replace(/[`*_>#-]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function toKnowledgeMatch(result: StoredSearchMatch, query: string): KnowledgeMatch {
  return {
    path: result.path,
    title: result.title,
    excerpt: excerptFor(result.body, query),
    score: result.score,
  }
}

function excerptFor(body: string, query: string): string {
  const terms = query.toLocaleLowerCase().split(/\s+/u).filter(Boolean)
  const lowerBody = body.toLocaleLowerCase()
  const firstHit = terms
    .map((term) => lowerBody.indexOf(term))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0]
  const start = firstHit === undefined ? 0 : Math.max(0, firstHit - 80)
  return body.slice(start, start + 240).trim()
}

function isMissingVaultDocument(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'VAULT_NOT_FOUND'
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('The knowledge rebuild was cancelled.', 'AbortError')
  }
}
