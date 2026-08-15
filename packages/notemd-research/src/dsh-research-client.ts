import {
  MAX_RESEARCH_RESULTS,
  ResearchCapabilityError,
  ResearchError,
  createResearchDiscovery,
  createResearchEvidence,
  type ResearchDiscovery,
  type ResearchDiscoveryRequest,
  type ResearchEvidence,
  type ResearchSource,
  type ResearchWebClient,
} from './research-evidence.js'

const MAX_EVIDENCE_CONTENT_CHARACTERS = 24_000

export interface DshWebSearchSource {
  readonly url: string
  readonly title?: string
  readonly snippet?: string
  readonly publishedAt?: string
}

export interface DshWebSearchResult {
  readonly sources: readonly DshWebSearchSource[]
  readonly truncated: boolean
}

export interface DshWebFetchResult {
  readonly url: string
  readonly statusCode: number
  readonly body: {
    readonly kind: string
    readonly content: string
  }
  readonly truncated: boolean
}

/** Structural DSH `ctx.web` contract used by NoteMD without owning its providers. */
export interface DshWebRuntime {
  search(request: { readonly query: string; readonly maxResults?: number }, signal?: AbortSignal): Promise<DshWebSearchResult>
  fetch(request: { readonly url: string }, signal?: AbortSignal): Promise<DshWebFetchResult>
}

/** Converts DSH provider-neutral web results into NoteMD's durable evidence vocabulary. */
export class DshResearchClient implements ResearchWebClient {
  constructor(
    private readonly web: DshWebRuntime,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async discover(request: ResearchDiscoveryRequest, signal?: AbortSignal): Promise<ResearchDiscovery> {
    const query = queryValue(request.query)
    const maxResults = resultLimit(request.maxResults)
    throwIfAborted(signal)
    let result: DshWebSearchResult
    try {
      result = await this.web.search({ query, maxResults }, signal)
    } catch (error) {
      throw translateWebFailure(error)
    }
    throwIfAborted(signal)
    if (!Array.isArray(result.sources) || typeof result.truncated !== 'boolean') {
      throw new ResearchError('RESEARCH_WEB_MALFORMED', 'DSH web search returned an invalid result shape.')
    }
    const sources = result.sources.slice(0, maxResults).map(toResearchSource)
    return createResearchDiscovery({
      query,
      sources,
      truncated: result.truncated || result.sources.length > sources.length,
      retrievedAt: timestamp(this.now()),
    })
  }

  async capture(discovery: ResearchDiscovery, sourceIndex: number, signal?: AbortSignal): Promise<ResearchEvidence> {
    const source = discovery.sources[sourceIndex]
    if (source === undefined) {
      throw new ResearchError('RESEARCH_SOURCE_SELECTION_INVALID', 'The selected research source does not exist in its durable discovery.')
    }
    throwIfAborted(signal)
    let result: DshWebFetchResult
    try {
      result = await this.web.fetch({ url: source.url }, signal)
    } catch (error) {
      throw translateWebFailure(error)
    }
    throwIfAborted(signal)
    if (typeof result !== 'object' || result === null || typeof result.url !== 'string' || typeof result.statusCode !== 'number'
      || typeof result.truncated !== 'boolean' || typeof result.body !== 'object' || result.body === null) {
      throw new ResearchError('RESEARCH_WEB_MALFORMED', 'DSH web fetch returned an invalid result shape.')
    }
    if (result.body.kind !== 'html' && result.body.kind !== 'text') {
      throw new ResearchCapabilityError('unsupported-body', 'The selected DSH web provider cannot supply HTML or text evidence.')
    }
    if (typeof result.body.content !== 'string') {
      throw new ResearchError('RESEARCH_WEB_MALFORMED', 'DSH web fetch returned non-string body content.')
    }
    const content = result.body.content.slice(0, MAX_EVIDENCE_CONTENT_CHARACTERS)
    const truncated = result.truncated || content.length < result.body.content.length
    return createResearchEvidence({
      query: discovery.query,
      requestedUrl: source.url,
      finalUrl: result.url,
      statusCode: result.statusCode,
      bodyKind: result.body.kind,
      content,
      truncated,
      retrievedAt: timestamp(this.now()),
      citations: [{
        id: `citation:${sourceIndex + 1}`,
        url: result.url,
        ...(source.title === undefined ? {} : { title: source.title }),
        ...(source.publishedAt === undefined ? {} : { publishedAt: source.publishedAt }),
      }],
    })
  }
}

function queryValue(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ResearchError('RESEARCH_QUERY_INVALID', 'Research discovery query must be a non-empty string.')
  }
  return value.trim()
}

function resultLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > MAX_RESEARCH_RESULTS) {
    throw new ResearchError('RESEARCH_RESULT_LIMIT_INVALID', `Research discovery maxResults must be an integer from 1 through ${MAX_RESEARCH_RESULTS}.`)
  }
  return value
}

function toResearchSource(value: DshWebSearchSource): ResearchSource {
  if (typeof value !== 'object' || value === null || typeof value.url !== 'string') {
    throw new ResearchError('RESEARCH_WEB_MALFORMED', 'DSH web search returned an invalid source.')
  }
  return {
    url: value.url,
    ...(value.title === undefined ? {} : { title: value.title }),
    ...(value.snippet === undefined ? {} : { snippet: value.snippet }),
    ...(value.publishedAt === undefined ? {} : { publishedAt: value.publishedAt }),
  }
}

function translateWebFailure(error: unknown): never {
  if (isAbortError(error)) throw error
  const code = errorCode(error)
  if (code === 'WEB_PROVIDER_UNAVAILABLE' || code === 'WEB_PROVIDER_AMBIGUOUS'
    || code === 'WEB_PROVIDER_CONFIGURED_MISSING' || code === 'WEB_PROVIDER_CONFIGURED_UNAVAILABLE') {
    throw new ResearchCapabilityError('web-provider-unavailable', 'No unambiguous usable DSH web provider is available.')
  }
  throw error
}

function timestamp(value: Date): string {
  if (!(value instanceof Date) || Number.isNaN(value.valueOf())) {
    throw new ResearchError('RESEARCH_CLOCK_INVALID', 'Research evidence clock returned an invalid date.')
  }
  return value.toISOString()
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  signal?.throwIfAborted()
}
