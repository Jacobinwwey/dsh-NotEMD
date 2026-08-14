export type DiagramIntent = 'flowchart' | 'sequence' | 'mindmap' | 'class' | 'er' | 'state'

export interface DiagramSpec {
  version: 1
  title: string
  intent: DiagramIntent
  source: string
}

export class DiagramSpecError extends Error {
  readonly code = 'ARTIFACT_SPEC_INVALID'

  constructor(message: string) {
    super(message)
    this.name = 'DiagramSpecError'
  }
}

export function validateDiagramSpec(value: unknown): DiagramSpec {
  if (!isObject(value) || value.version !== 1 || typeof value.title !== 'string' || typeof value.source !== 'string') {
    throw new DiagramSpecError('Diagram specifications require version, title, intent, and source fields.')
  }
  if (!isDiagramIntent(value.intent) || value.title.trim().length === 0 || value.source.trim().length === 0) {
    throw new DiagramSpecError('Diagram specifications require a supported intent and non-empty title and source.')
  }

  return {
    version: 1,
    title: value.title.trim(),
    intent: value.intent,
    source: value.source,
  }
}

function isDiagramIntent(value: unknown): value is DiagramIntent {
  return value === 'flowchart' || value === 'sequence' || value === 'mindmap' || value === 'class' || value === 'er' || value === 'state'
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
