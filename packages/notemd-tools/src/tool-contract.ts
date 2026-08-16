export interface ToolExecutionContext {
  readonly signal?: AbortSignal
  readonly agent?: unknown
  readonly callId?: unknown
}

export interface ToolContentBlock {
  readonly type: 'text'
  readonly text: string
}

export type ToolSchema = Record<string, unknown>

export interface ToolRegistrationSpec {
  readonly name: string
  readonly description: string
  readonly parameters: Record<string, unknown>
  readonly output: {
    readonly schema: ToolSchema
    render(args: unknown, value: unknown): readonly ToolContentBlock[]
  }
  execute(args: unknown, execution?: ToolExecutionContext): Promise<unknown>
}

export type ToolDefinitionFactory = (definition: ToolRegistrationSpec) => ToolRegistrationSpec

export const toolOutcomeStatuses = ['success', 'conflict', 'rejected', 'unavailable', 'cancelled', 'failed'] as const
export type ToolOutcomeStatus = (typeof toolOutcomeStatuses)[number]

export interface ToolFailure {
  readonly status: Exclude<ToolOutcomeStatus, 'success'>
  readonly code: string
}

export class ToolInputError extends Error {
  readonly code = 'invalid-input'

  constructor(message: string) {
    super(message)
    this.name = 'ToolInputError'
  }
}

export interface ToolOutcomeVariant {
  readonly status: Exclude<ToolOutcomeStatus, 'success'>
  readonly properties: Record<string, ToolSchema>
  readonly required: readonly string[]
}

export function outcomeOutput(
  successProperties: Record<string, ToolSchema>,
  successRequired: readonly string[],
  variants: readonly ToolOutcomeVariant[] = [],
): ToolRegistrationSpec['output'] {
  return {
    schema: {
      oneOf: [
        outcomeBranch('success', successProperties, successRequired),
        ...toolOutcomeStatuses
          .filter((status): status is Exclude<ToolOutcomeStatus, 'success'> => status !== 'success')
          .map((status) => outcomeBranch(status, { code: stringSchema() }, ['code'])),
        ...variants.map((variant) => outcomeBranch(variant.status, variant.properties, variant.required)),
      ],
    },
    render(_args: unknown, value: unknown): readonly ToolContentBlock[] {
      const text = JSON.stringify(value)
      if (text === undefined) {
        throw new TypeError('Tool output must be JSON serializable.')
      }
      return [{ type: 'text', text }]
    },
  }
}

export async function executeTool<T extends Record<string, unknown>>(
  operation: () => Promise<T>,
): Promise<{ readonly status: 'success' } & T | ToolFailure> {
  try {
    return { status: 'success', ...await operation() }
  } catch (error) {
    return failedToolOutcome(error)
  }
}

export function failedToolOutcome(error: unknown): ToolFailure {
  if (error instanceof ToolInputError) {
    return { status: 'rejected', code: error.code }
  }
  if (isAbortError(error)) {
    return { status: 'cancelled', code: 'operation-cancelled' }
  }
  const code = errorCode(error)
  return { status: 'failed', code: code ?? 'operation-failed' }
}

export function requiredString(args: unknown, key: string): string {
  const value = propertyOf(args, key)
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ToolInputError(`Tool parameter "${key}" must be a non-empty string.`)
  }
  return value
}

export function requiredStringList(args: unknown, key: string): readonly string[] {
  const value = propertyOf(args, key)
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new ToolInputError(`Tool parameter "${key}" must be an array of strings.`)
  }
  return value
}

export function requiredObject(args: unknown, key: string): Record<string, unknown> {
  const value = propertyOf(args, key)
  if (!isRecord(value)) {
    throw new ToolInputError(`Tool parameter "${key}" must be an object.`)
  }
  return value
}

export function propertyOf(args: unknown, key: string): unknown {
  if (!isRecord(args)) {
    throw new ToolInputError('Tool arguments must be an object.')
  }
  return args[key]
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function stringSchema(): ToolSchema {
  return { type: 'string' }
}

export function integerSchema(): ToolSchema {
  return { type: 'integer' }
}

export function numberSchema(): ToolSchema {
  return { type: 'number' }
}

export function nullSchema(): ToolSchema {
  return { type: 'null' }
}

export function arraySchema(items: ToolSchema): ToolSchema {
  return { type: 'array', items }
}

export function closedObjectSchema(
  properties: Record<string, ToolSchema>,
  required: readonly string[],
): ToolSchema {
  const requiredNames = new Set(required)
  if (requiredNames.size !== required.length || [...requiredNames].some((name) => !Object.hasOwn(properties, name))) {
    throw new RangeError('Closed tool-schema required properties must identify unique declared fields.')
  }

  return {
    type: 'object',
    additionalProperties: false,
    properties: Object.fromEntries(
      Object.entries(properties).map(([name, schema]) => [
        name,
        requiredNames.has(name) ? { ...schema, required: true } : schema,
      ]),
    ),
  }
}

export const workspaceMutationPlanSchema = closedObjectSchema({
  version: { type: 'integer', const: 1 },
  id: stringSchema(),
  digest: stringSchema(),
  provenance: provenanceSchema(),
  mutations: arraySchema({
    oneOf: [
      closedObjectSchema({
        kind: { type: 'string', const: 'write-text' },
        destination: stringSchema(),
        expectedRevision: stringSchema(),
        provenance: provenanceSchema(),
        conflictPolicy: { type: 'string', const: 'reject' },
        mediaType: stringSchema(),
        content: stringSchema(),
        contentSha256: stringSchema(),
      }, ['kind', 'destination', 'expectedRevision', 'provenance', 'conflictPolicy', 'mediaType', 'content', 'contentSha256']),
      closedObjectSchema({
        kind: { type: 'string', const: 'write-bytes' },
        destination: stringSchema(),
        expectedRevision: stringSchema(),
        provenance: provenanceSchema(),
        conflictPolicy: { type: 'string', const: 'reject' },
        mediaType: stringSchema(),
        contentSha256: stringSchema(),
        stagedAsset: stagedAssetSchema(),
      }, ['kind', 'destination', 'expectedRevision', 'provenance', 'conflictPolicy', 'mediaType', 'contentSha256', 'stagedAsset']),
      closedObjectSchema({
        kind: { type: 'string', const: 'delete' },
        destination: stringSchema(),
        expectedRevision: stringSchema(),
        provenance: provenanceSchema(),
        conflictPolicy: { type: 'string', const: 'reject' },
        expectedContentSha256: stringSchema(),
      }, ['kind', 'destination', 'expectedRevision', 'provenance', 'conflictPolicy', 'expectedContentSha256']),
    ],
  }),
}, ['version', 'id', 'digest', 'provenance', 'mutations'])

export const workspaceMutationReceiptSchema = closedObjectSchema({
  version: { type: 'integer', const: 1 },
  planId: stringSchema(),
  planDigest: stringSchema(),
  status: { type: 'string', enum: ['committed', 'conflict', 'rejected', 'cancelled', 'failed', 'recovered'] },
  mutations: arraySchema(closedObjectSchema({
    destination: stringSchema(),
    kind: { type: 'string', enum: ['write-text', 'write-bytes', 'delete'] },
    status: { type: 'string', enum: ['committed', 'conflict', 'rejected', 'cancelled', 'failed', 'recovered'] },
    revision: stringSchema(),
    diagnosticCode: stringSchema(),
  }, ['destination', 'kind', 'status'])),
}, ['version', 'planId', 'planDigest', 'status', 'mutations'])

export const workspaceChangeEventSchema = closedObjectSchema({
  id: stringSchema(),
  occurredAt: stringSchema(),
  origin: { type: 'string', enum: ['notemd-mutation-receipt', 'external-scan'] },
  causationId: stringSchema(),
  changes: arraySchema(closedObjectSchema({
    path: stringSchema(),
    kind: { type: 'string', enum: ['created', 'updated', 'deleted'] },
    revision: stringSchema(),
  }, ['path', 'kind'])),
}, ['id', 'occurredAt', 'origin', 'causationId', 'changes'])

export const vaultDocumentSchema = closedObjectSchema({
  path: stringSchema(),
  content: stringSchema(),
  revision: stringSchema(),
}, ['path', 'content', 'revision'])

export const knowledgeMatchSchema = closedObjectSchema({
  path: stringSchema(),
  title: stringSchema(),
  excerpt: stringSchema(),
  score: numberSchema(),
}, ['path', 'title', 'excerpt', 'score'])

export const knowledgeRetrievalResultSchema = closedObjectSchema({
  query: stringSchema(),
  taskRoots: arraySchema(stringSchema()),
  currentPath: stringSchema(),
  matches: arraySchema(closedObjectSchema({
    path: stringSchema(),
    title: stringSchema(),
    excerpt: stringSchema(),
    score: numberSchema(),
    anchor: stringSchema(),
    breadcrumb: arraySchema(stringSchema()),
    citationId: stringSchema(),
    context: stringSchema(),
    explanation: closedObjectSchema({
      includedByRoot: stringSchema(),
      matchedTerms: arraySchema(stringSchema()),
      window: closedObjectSchema({ before: integerSchema(), after: integerSchema() }, ['before', 'after']),
    }, ['includedByRoot', 'matchedTerms', 'window']),
  }, ['path', 'title', 'excerpt', 'score', 'anchor', 'breadcrumb', 'citationId', 'context', 'explanation'])),
}, ['query', 'taskRoots', 'matches'])

export const artifactCapabilitySchema = closedObjectSchema({
  capability: { type: 'string', enum: ['diagram-rendering', 'document-export'] },
  status: { type: 'string', enum: ['available', 'unavailable'] },
  reason: stringSchema(),
}, ['capability', 'status', 'reason'])

export const jobRecordSchema = closedObjectSchema({
  id: stringSchema(),
  workflow: stringSchema(),
  state: { type: 'string', enum: ['queued', 'running', 'cancelling', 'completed', 'cancelled', 'failed'] },
  targets: arraySchema(stringSchema()),
  attempt: integerSchema(),
  results: arraySchema(closedObjectSchema({
    target: stringSchema(),
    status: { type: 'string', enum: ['completed', 'cancelled', 'failed'] },
    detail: stringSchema(),
    checkpoint: closedObjectSchema({
      proposalId: stringSchema(),
      proposalDigest: stringSchema(),
      evidenceRefs: arraySchema(stringSchema()),
    }, ['proposalId', 'proposalDigest', 'evidenceRefs']),
  }, ['target', 'status'])),
  createdAt: stringSchema(),
  updatedAt: stringSchema(),
}, ['id', 'workflow', 'state', 'targets', 'attempt', 'results', 'createdAt', 'updatedAt'])

export const providerDiagnosticSchema: ToolSchema = {
  oneOf: [
    closedObjectSchema({
      status: { type: 'string', const: 'available' },
      endpoint: stringSchema(),
      model: stringSchema(),
      elapsedMs: numberSchema(),
      usage: closedObjectSchema({ inputTokens: integerSchema(), outputTokens: integerSchema() }, ['inputTokens', 'outputTokens']),
    }, ['status', 'endpoint', 'model', 'elapsedMs']),
    closedObjectSchema({
      status: { type: 'string', const: 'unavailable' },
      endpoint: stringSchema(),
      model: stringSchema(),
      elapsedMs: numberSchema(),
      error: closedObjectSchema({ code: stringSchema(), retryable: { type: 'boolean' }, message: stringSchema() }, ['code', 'retryable', 'message']),
    }, ['status', 'endpoint', 'model', 'elapsedMs', 'error']),
  ],
}

export const modelDiscoverySchema: ToolSchema = {
  oneOf: [
    closedObjectSchema({
      status: { type: 'string', const: 'available' },
      endpoint: stringSchema(),
      models: arraySchema(closedObjectSchema({ id: stringSchema(), ownedBy: stringSchema() }, ['id'])),
    }, ['status', 'endpoint', 'models']),
    closedObjectSchema({
      status: { type: 'string', const: 'unavailable' },
      endpoint: stringSchema(),
      reason: stringSchema(),
    }, ['status', 'endpoint', 'reason']),
  ],
}

function outcomeBranch(
  status: ToolOutcomeStatus,
  properties: Record<string, ToolSchema>,
  required: readonly string[],
): ToolSchema {
  return closedObjectSchema({
    status: { type: 'string', const: status },
    ...properties,
  }, ['status', ...required])
}

function provenanceSchema(): ToolSchema {
  return closedObjectSchema({
    operationId: stringSchema(),
    sourceRefs: arraySchema(stringSchema()),
    evidenceRefs: arraySchema(stringSchema()),
  }, ['operationId', 'sourceRefs', 'evidenceRefs'])
}

function stagedAssetSchema(): ToolSchema {
  return closedObjectSchema({
    id: stringSchema(),
    byteLength: integerSchema(),
    mediaType: stringSchema(),
    sha256: stringSchema(),
  }, ['id', 'byteLength', 'mediaType', 'sha256'])
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined
  }
  const code = error.code
  return typeof code === 'string' && code.trim().length > 0 ? code.toLocaleLowerCase() : undefined
}
