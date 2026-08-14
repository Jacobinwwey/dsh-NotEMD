import { basename, extname } from 'node:path'

export interface ExtractedConcept {
  name: string
  summary: string
}

export class WorkflowResponseError extends Error {
  readonly code = 'WORKFLOW_RESPONSE_INVALID'

  constructor(message: string) {
    super(message)
    this.name = 'WorkflowResponseError'
  }
}

export function parseExtractedConcepts(response: string): readonly ExtractedConcept[] {
  let value: unknown
  try {
    value = JSON.parse(response)
  } catch {
    throw new WorkflowResponseError('Concept extraction must return JSON.')
  }

  if (!isObject(value) || !Array.isArray(value.concepts)) {
    throw new WorkflowResponseError('Concept extraction must contain a concepts array.')
  }

  return value.concepts.map((concept) => {
    if (!isObject(concept) || typeof concept.name !== 'string' || typeof concept.summary !== 'string') {
      throw new WorkflowResponseError('Each extracted concept must contain string name and summary fields.')
    }

    const name = concept.name.trim()
    const summary = concept.summary.trim()
    if (name.length === 0 || summary.length === 0 || /[\\/:\0]/u.test(name)) {
      throw new WorkflowResponseError('Concept names and summaries must be safe non-empty text.')
    }

    return { name, summary }
  })
}

export function conceptNoteContent(concept: ExtractedConcept, sourcePath: string): string {
  const sourceName = basename(sourcePath, extname(sourcePath))
  return `# ${concept.name}\n\n${concept.summary}\n\nSource: [[${sourceName}]]\n`
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
