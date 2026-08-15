import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

export const MAX_RESEARCH_RESULTS = 8

export interface ResearchSource {
  readonly url: string
  readonly title?: string
  readonly snippet?: string
  readonly publishedAt?: string
}

export interface ResearchDiscoveryRequest {
  readonly query: string
  readonly maxResults: number
}

export interface ResearchDiscovery {
  readonly version: 1
  readonly id: string
  readonly query: string
  readonly sources: readonly ResearchSource[]
  readonly truncated: boolean
  readonly retrievedAt: string
}

export interface EvidenceCitation {
  readonly id: string
  readonly url: string
  readonly title?: string
  readonly publishedAt?: string
}

export interface ResearchEvidence {
  readonly version: 1
  readonly id: string
  readonly query: string
  readonly requestedUrl: string
  readonly finalUrl: string
  readonly statusCode: number
  readonly bodyKind: 'html' | 'text'
  readonly content: string
  readonly truncated: boolean
  readonly contentSha256: string
  readonly retrievedAt: string
  readonly citations: readonly EvidenceCitation[]
}

export interface ResearchWebClient {
  discover(request: ResearchDiscoveryRequest, signal?: AbortSignal): Promise<ResearchDiscovery>
  capture(discovery: ResearchDiscovery, sourceIndex: number, signal?: AbortSignal): Promise<ResearchEvidence>
}

export interface NotemdResearch {
  discover(request: ResearchDiscoveryRequest, signal?: AbortSignal): Promise<ResearchDiscovery>
  capture(discoveryId: string, sourceIndex: number, signal?: AbortSignal): Promise<ResearchEvidence>
  readEvidence(ids: readonly string[], signal?: AbortSignal): Promise<readonly ResearchEvidence[]>
}

export class ResearchError extends Error {
  constructor(readonly code: string, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ResearchError'
  }
}

export class ResearchCapabilityError extends ResearchError {
  constructor(readonly reason: string, message: string, options?: ErrorOptions) {
    super('RESEARCH_CAPABILITY_UNAVAILABLE', message, options)
    this.name = 'ResearchCapabilityError'
  }
}

/**
 * Owns durable discovery and evidence records under `.notemd/research`.
 * The records are state for a DSH-backed workflow, not user workspace content.
 */
export class ResearchEvidenceCatalog implements NotemdResearch {
  private readonly workspaceRoot: string

  constructor(workspaceRoot: string, private readonly client: ResearchWebClient) {
    if (typeof workspaceRoot !== 'string' || workspaceRoot.trim().length === 0) {
      throw new TypeError('NoteMD research requires a non-empty workspace root.')
    }
    this.workspaceRoot = resolve(workspaceRoot)
  }

  async discover(request: ResearchDiscoveryRequest, signal?: AbortSignal): Promise<ResearchDiscovery> {
    throwIfAborted(signal)
    const discovery = await this.client.discover(request, signal)
    throwIfAborted(signal)
    await this.writeRecord('discoveries', discovery.id, discovery)
    return discovery
  }

  async capture(discoveryId: string, sourceIndex: number, signal?: AbortSignal): Promise<ResearchEvidence> {
    throwIfAborted(signal)
    const discovery = await this.readDiscovery(discoveryId)
    if (!Number.isSafeInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= discovery.sources.length) {
      throw new ResearchError('RESEARCH_SOURCE_SELECTION_INVALID', 'The selected research source does not exist in its durable discovery.')
    }
    const evidence = await this.client.capture(discovery, sourceIndex, signal)
    throwIfAborted(signal)
    await this.writeRecord('evidence', evidence.id, evidence)
    return evidence
  }

  async readEvidence(ids: readonly string[], signal?: AbortSignal): Promise<readonly ResearchEvidence[]> {
    if (ids.length === 0) {
      throw new ResearchError('RESEARCH_EVIDENCE_REQUIRED', 'Research synthesis requires at least one durable evidence id.')
    }
    const uniqueIds = new Set(ids)
    if (uniqueIds.size !== ids.length) {
      throw new ResearchError('RESEARCH_EVIDENCE_DUPLICATE', 'Research synthesis evidence ids must be unique.')
    }
    const evidence: ResearchEvidence[] = []
    for (const id of ids) {
      throwIfAborted(signal)
      evidence.push(await this.readEvidenceRecord(id))
    }
    return Object.freeze(evidence)
  }

  private async readDiscovery(id: string): Promise<ResearchDiscovery> {
    assertIdentifier(id, 'discovery')
    const candidate = await this.readRecord('discoveries', id)
    return parseResearchDiscovery(candidate)
  }

  private async readEvidenceRecord(id: string): Promise<ResearchEvidence> {
    assertIdentifier(id, 'evidence')
    const candidate = await this.readRecord('evidence', id)
    return parseResearchEvidence(candidate)
  }

  private async readRecord(directory: 'discoveries' | 'evidence', id: string): Promise<unknown> {
    const path = this.recordPath(directory, id)
    let serialized: string
    try {
      serialized = await readFile(path, 'utf8')
    } catch (error) {
      if (isMissingFile(error)) {
        throw new ResearchError('RESEARCH_EVIDENCE_NOT_FOUND', `Research record ${id} does not exist.`)
      }
      throw error
    }
    try {
      return JSON.parse(serialized) as unknown
    } catch (error) {
      throw new ResearchError('RESEARCH_EVIDENCE_CORRUPT', `Research record ${id} is not valid JSON.`, { cause: error })
    }
  }

  private async writeRecord(directory: 'discoveries' | 'evidence', id: string, value: ResearchDiscovery | ResearchEvidence): Promise<void> {
    const path = this.recordPath(directory, id)
    try {
      await readFile(path, 'utf8')
      return
    } catch (error) {
      if (!isMissingFile(error)) throw error
    }

    await mkdir(dirname(path), { recursive: true })
    const temporaryPath = `${path}.${randomUUID()}.tmp`
    try {
      await writeFile(temporaryPath, JSON.stringify(value), 'utf8')
      await rename(temporaryPath, path)
    } catch (error) {
      await removeTemporaryFile(temporaryPath)
      throw error
    }
  }

  private recordPath(directory: 'discoveries' | 'evidence', id: string): string {
    const digest = id.slice(id.indexOf(':') + 1)
    const path = join(this.workspaceRoot, '.notemd', 'research', directory, `${digest}.json`)
    if (!isWithin(this.workspaceRoot, path)) {
      throw new ResearchError('RESEARCH_STORAGE_ESCAPE', 'Research evidence storage escaped its workspace root.')
    }
    return path
  }
}

export function createResearchDiscovery(input: Omit<ResearchDiscovery, 'version' | 'id'>): ResearchDiscovery {
  const query = nonEmptyString(input.query, 'Research discovery query')
  const sources = input.sources.map(parseResearchSource)
  const retrievedAt = isoTimestamp(input.retrievedAt, 'Research discovery retrieval time')
  if (typeof input.truncated !== 'boolean') {
    throw new ResearchError('RESEARCH_DISCOVERY_INVALID', 'Research discovery truncation must be boolean.')
  }
  const identity = {
    version: 1 as const,
    query,
    sources,
    truncated: input.truncated,
    retrievedAt,
  }
  return Object.freeze({
    ...identity,
    id: identifier('discovery', identity),
    sources: Object.freeze(sources),
  })
}

export function createResearchEvidence(input: Omit<ResearchEvidence, 'version' | 'id' | 'contentSha256'>): ResearchEvidence {
  const query = nonEmptyString(input.query, 'Research evidence query')
  const requestedUrl = httpUrl(input.requestedUrl, 'Research evidence requested URL')
  const finalUrl = httpUrl(input.finalUrl, 'Research evidence final URL')
  const httpStatusCode = validatedStatusCode(input.statusCode)
  const bodyKind = input.bodyKind === 'html' || input.bodyKind === 'text'
    ? input.bodyKind
    : invalidEvidence('Research evidence body kind must be html or text.')
  if (typeof input.content !== 'string') {
    throw invalidEvidence('Research evidence content must be a string.')
  }
  if (typeof input.truncated !== 'boolean') {
    throw invalidEvidence('Research evidence truncation must be boolean.')
  }
  const retrievedAt = isoTimestamp(input.retrievedAt, 'Research evidence retrieval time')
  const citations = input.citations.map(parseEvidenceCitation)
  const contentSha256 = sha256(input.content)
  const identity = {
    version: 1 as const,
    query,
    requestedUrl,
    finalUrl,
    statusCode: httpStatusCode,
    bodyKind,
    content: input.content,
    truncated: input.truncated,
    contentSha256,
    retrievedAt,
    citations,
  }
  return Object.freeze({
    ...identity,
    id: identifier('evidence', identity),
    citations: Object.freeze(citations),
  })
}

function parseResearchDiscovery(value: unknown): ResearchDiscovery {
  const record = recordValue(value, 'Research discovery')
  const discovery = createResearchDiscovery({
    query: nonEmptyString(record.query, 'Research discovery query'),
    sources: arrayValue(record.sources, 'Research discovery sources').map(parseResearchSource),
    truncated: booleanValue(record.truncated, 'Research discovery truncation'),
    retrievedAt: isoTimestamp(record.retrievedAt, 'Research discovery retrieval time'),
  })
  if (record.id !== discovery.id || record.version !== 1) {
    throw new ResearchError('RESEARCH_EVIDENCE_CORRUPT', 'Research discovery identity does not match its stored fields.')
  }
  return discovery
}

function parseResearchEvidence(value: unknown): ResearchEvidence {
  const record = recordValue(value, 'Research evidence')
  const evidence = createResearchEvidence({
    query: nonEmptyString(record.query, 'Research evidence query'),
    requestedUrl: httpUrl(record.requestedUrl, 'Research evidence requested URL'),
    finalUrl: httpUrl(record.finalUrl, 'Research evidence final URL'),
    statusCode: validatedStatusCode(record.statusCode),
    bodyKind: evidenceBodyKind(record.bodyKind),
    content: stringValue(record.content, 'Research evidence content'),
    truncated: booleanValue(record.truncated, 'Research evidence truncation'),
    retrievedAt: isoTimestamp(record.retrievedAt, 'Research evidence retrieval time'),
    citations: arrayValue(record.citations, 'Research evidence citations').map(parseEvidenceCitation),
  })
  if (record.id !== evidence.id || record.version !== 1 || record.contentSha256 !== evidence.contentSha256) {
    throw new ResearchError('RESEARCH_EVIDENCE_CORRUPT', 'Research evidence identity does not match its stored fields.')
  }
  return evidence
}

function parseResearchSource(value: unknown): ResearchSource {
  const record = recordValue(value, 'Research source')
  const source: ResearchSource = {
    url: httpUrl(record.url, 'Research source URL'),
    ...(record.title === undefined ? {} : { title: nonEmptyString(record.title, 'Research source title') }),
    ...(record.snippet === undefined ? {} : { snippet: stringValue(record.snippet, 'Research source snippet') }),
    ...(record.publishedAt === undefined ? {} : { publishedAt: isoTimestamp(record.publishedAt, 'Research source publication time') }),
  }
  return Object.freeze(source)
}

function parseEvidenceCitation(value: unknown): EvidenceCitation {
  const record = recordValue(value, 'Research citation')
  return Object.freeze({
    id: nonEmptyString(record.id, 'Research citation id'),
    url: httpUrl(record.url, 'Research citation URL'),
    ...(record.title === undefined ? {} : { title: nonEmptyString(record.title, 'Research citation title') }),
    ...(record.publishedAt === undefined ? {} : { publishedAt: isoTimestamp(record.publishedAt, 'Research citation publication time') }),
  })
}

function assertIdentifier(id: string, prefix: 'discovery' | 'evidence'): void {
  if (typeof id !== 'string' || !new RegExp(`^${prefix}:[a-f0-9]{64}$`, 'u').test(id)) {
    throw new ResearchError('RESEARCH_EVIDENCE_ID_INVALID', `Research ${prefix} id is invalid.`)
  }
}

function identifier(prefix: 'discovery' | 'evidence', value: unknown): string {
  return `${prefix}:${sha256(JSON.stringify(value))}`
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function httpUrl(value: unknown, description: string): string {
  const text = nonEmptyString(value, description)
  let parsed: URL
  try {
    parsed = new URL(text)
  } catch (error) {
    throw new ResearchError('RESEARCH_URL_INVALID', `${description} must be an absolute HTTP URL.`, { cause: error })
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ResearchError('RESEARCH_URL_INVALID', `${description} must use HTTP or HTTPS.`)
  }
  return parsed.toString()
}

function validatedStatusCode(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 100 || value > 599) {
    throw invalidEvidence('Research evidence status code must be an integer from 100 through 599.')
  }
  return value
}

function isoTimestamp(value: unknown, description: string): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new ResearchError('RESEARCH_EVIDENCE_INVALID', `${description} must be an ISO-8601 timestamp.`)
  }
  return new Date(value).toISOString()
}

function nonEmptyString(value: unknown, description: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ResearchError('RESEARCH_EVIDENCE_INVALID', `${description} must be a non-empty string.`)
  }
  return value.trim()
}

function stringValue(value: unknown, description: string): string {
  if (typeof value !== 'string') {
    throw new ResearchError('RESEARCH_EVIDENCE_INVALID', `${description} must be a string.`)
  }
  return value
}

function booleanValue(value: unknown, description: string): boolean {
  if (typeof value !== 'boolean') {
    throw new ResearchError('RESEARCH_EVIDENCE_INVALID', `${description} must be boolean.`)
  }
  return value
}

function evidenceBodyKind(value: unknown): ResearchEvidence['bodyKind'] {
  if (value !== 'html' && value !== 'text') {
    throw invalidEvidence('Research evidence body kind must be html or text.')
  }
  return value
}

function recordValue(value: unknown, description: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ResearchError('RESEARCH_EVIDENCE_CORRUPT', `${description} must be an object.`)
  }
  return value as Record<string, unknown>
}

function arrayValue(value: unknown, description: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ResearchError('RESEARCH_EVIDENCE_CORRUPT', `${description} must be an array.`)
  }
  return value
}

function invalidEvidence(message: string): never {
  throw new ResearchError('RESEARCH_EVIDENCE_INVALID', message)
}

function isWithin(root: string, path: string): boolean {
  const relation = relative(root, path)
  return relation === '' || (relation !== '..' && !relation.startsWith(`..${sep}`) && !isAbsolute(relation))
}

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

async function removeTemporaryFile(path: string): Promise<void> {
  try {
    await rm(path, { force: true })
  } catch {
    // A failed temporary cleanup never changes durable evidence semantics.
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  signal?.throwIfAborted()
}
