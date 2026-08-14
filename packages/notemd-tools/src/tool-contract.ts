export interface ToolExecutionContext {
  readonly signal?: AbortSignal
  readonly agent?: unknown
  readonly callId?: unknown
}

export interface ToolContentBlock {
  readonly type: 'text'
  readonly text: string
}

export interface ToolRegistrationSpec {
  readonly name: string
  readonly description: string
  readonly parameters: Record<string, unknown>
  readonly output: {
    readonly schema: Record<string, unknown>
    render(args: unknown, value: unknown): readonly ToolContentBlock[]
  }
  execute(args: unknown, execution?: ToolExecutionContext): Promise<unknown>
}

export type ToolDefinitionFactory = (definition: ToolRegistrationSpec) => ToolRegistrationSpec

export class ToolInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ToolInputError'
  }
}

export const objectOutput = {
  schema: { type: 'object', additionalProperties: true },
  render(_args: unknown, value: unknown): readonly ToolContentBlock[] {
    const text = JSON.stringify(value)
    if (text === undefined) {
      throw new TypeError('Tool output must be JSON serializable.')
    }
    return [{ type: 'text', text }]
  },
} as const

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

export function diagnostic(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
