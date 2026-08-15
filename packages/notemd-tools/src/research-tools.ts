import {
  MAX_RESEARCH_RESULTS,
  type ResearchEvidence,
} from '@notemd-harness/research'

import type { NotemdToolContext } from './notemd-services.js'
import {
  ToolInputError,
  arraySchema,
  closedObjectSchema,
  executeTool,
  outcomeOutput,
  propertyOf,
  requiredString,
  requiredStringList,
  stringSchema,
  type ToolDefinitionFactory,
  workspaceMutationPlanSchema,
} from './tool-contract.js'

/** Registers the only Tool operations that cross the durable research boundary. */
export function registerResearchTools(context: NotemdToolContext, defineTool: ToolDefinitionFactory): void {
  context.tools.register(defineTool({
    name: 'notemd_research_discover',
    description: 'Discover bounded, citeable web sources through the configured DSH web capability.',
    parameters: {
      query: { type: 'string', required: true, description: 'Research query.' },
      maxResults: { type: 'integer', required: true, description: `Maximum sources to retain, from 1 through ${MAX_RESEARCH_RESULTS}.` },
    },
    output: researchDiscoveryOutput,
    async execute(args, execution) {
      return executeResearchTool(async () => ({
        discovery: await context.notemdResearch.discover({
          query: requiredString(args, 'query'),
          maxResults: requiredResultLimit(args),
        }, execution?.signal),
      }))
    },
  }))

  context.tools.register(defineTool({
    name: 'notemd_research_capture_evidence',
    description: 'Fetch one source selected from a durable research discovery and retain its evidence record.',
    parameters: {
      discoveryId: { type: 'string', required: true, description: 'Durable research discovery identifier.' },
      sourceIndex: { type: 'integer', required: true, description: 'Zero-based source position in that discovery.' },
    },
    output: researchEvidenceOutput,
    async execute(args, execution) {
      return executeResearchTool(async () => ({
        evidence: researchEvidenceView(await context.notemdResearch.capture(
          requiredString(args, 'discoveryId'),
          requiredSourceIndex(args),
          execution?.signal,
        )),
      }))
    },
  }))

  context.tools.register(defineTool({
    name: 'notemd_plan_research_synthesis',
    description: 'Create a reviewable research synthesis plan from durable evidence identifiers.',
    parameters: {
      path: { type: 'string', required: true, description: 'Workspace-relative Markdown path.' },
      evidenceIds: {
        type: 'array',
        required: true,
        description: 'Durable research evidence identifiers to synthesize.',
        items: { type: 'string' },
      },
    },
    output: outcomeOutput({ plan: workspaceMutationPlanSchema }, ['plan']),
    async execute(args, execution) {
      return executeResearchTool(async () => {
        const evidence = await context.notemdResearch.readEvidence(requiredEvidenceIds(args), execution?.signal)
        return {
          plan: await context.notemdWorkflows.planResearchSynthesis(
            requiredString(args, 'path'),
            evidence,
            execution?.signal,
          ),
        }
      })
    },
  }))
}

const researchSourceSchema = closedObjectSchema({
  url: stringSchema(),
  title: stringSchema(),
  snippet: stringSchema(),
  publishedAt: stringSchema(),
}, ['url'])

const researchDiscoverySchema = closedObjectSchema({
  version: { type: 'integer', const: 1 },
  id: stringSchema(),
  query: stringSchema(),
  sources: arraySchema(researchSourceSchema),
  truncated: { type: 'boolean' },
  retrievedAt: stringSchema(),
}, ['version', 'id', 'query', 'sources', 'truncated', 'retrievedAt'])

const evidenceCitationSchema = closedObjectSchema({
  id: stringSchema(),
  url: stringSchema(),
  title: stringSchema(),
  publishedAt: stringSchema(),
}, ['id', 'url'])

// The Tool returns evidence identity and citation metadata, never fetched body text.
// Synthesis reads the retained body through the catalog and frames it as untrusted input.
const researchEvidenceSchema = closedObjectSchema({
  version: { type: 'integer', const: 1 },
  id: stringSchema(),
  query: stringSchema(),
  requestedUrl: stringSchema(),
  finalUrl: stringSchema(),
  statusCode: { type: 'integer' },
  bodyKind: { type: 'string', enum: ['html', 'text'] },
  truncated: { type: 'boolean' },
  contentSha256: stringSchema(),
  retrievedAt: stringSchema(),
  citations: arraySchema(evidenceCitationSchema),
}, ['version', 'id', 'query', 'requestedUrl', 'finalUrl', 'statusCode', 'bodyKind', 'truncated', 'contentSha256', 'retrievedAt', 'citations'])

const researchDiscoveryOutput = outcomeOutput({ discovery: researchDiscoverySchema }, ['discovery'])
const researchEvidenceOutput = outcomeOutput({ evidence: researchEvidenceSchema }, ['evidence'])

async function executeResearchTool<T extends Record<string, unknown>>(operation: () => Promise<T>) {
  const outcome = await executeTool(operation)
  return outcome.status === 'failed' && outcome.code === 'research_capability_unavailable'
    ? { status: 'unavailable' as const, code: 'capability-unavailable' }
    : outcome
}

function requiredResultLimit(args: unknown): number {
  const value = propertyOf(args, 'maxResults')
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > MAX_RESEARCH_RESULTS) {
    throw new ToolInputError(`Tool parameter "maxResults" must be an integer from 1 through ${MAX_RESEARCH_RESULTS}.`)
  }
  return value
}

function requiredSourceIndex(args: unknown): number {
  const value = propertyOf(args, 'sourceIndex')
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new ToolInputError('Tool parameter "sourceIndex" must be a zero-based integer.')
  }
  return value
}

function requiredEvidenceIds(args: unknown): readonly string[] {
  const ids = requiredStringList(args, 'evidenceIds')
  if (ids.length === 0 || ids.some((id) => id.trim().length === 0) || new Set(ids).size !== ids.length) {
    throw new ToolInputError('Tool parameter "evidenceIds" must contain unique non-empty evidence identifiers.')
  }
  return ids
}

function researchEvidenceView(evidence: ResearchEvidence) {
  return {
    version: evidence.version,
    id: evidence.id,
    query: evidence.query,
    requestedUrl: evidence.requestedUrl,
    finalUrl: evidence.finalUrl,
    statusCode: evidence.statusCode,
    bodyKind: evidence.bodyKind,
    truncated: evidence.truncated,
    contentSha256: evidence.contentSha256,
    retrievedAt: evidence.retrievedAt,
    citations: evidence.citations.map((citation) => ({
      id: citation.id,
      url: citation.url,
      ...(citation.title === undefined ? {} : { title: citation.title }),
      ...(citation.publishedAt === undefined ? {} : { publishedAt: citation.publishedAt }),
    })),
  }
}
