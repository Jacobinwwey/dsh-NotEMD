import { createWritePlan, type NotemdVault, type WritePlan } from '@notemd-harness/vault'

import { conceptNoteContent, parseExtractedConcepts } from './concepts.js'
import { replaceMermaidFenceBodies, normalizeFormulaDelimiters } from './markdown-transforms.js'
import { mermaidRepairSystemPrompt } from './mermaid.js'
import { createDocumentPlan, replaceDocumentPlan, translationTargetPath } from './plan-factory.js'

export * from './concepts.js'
export * from './formulas.js'
export * from './markdown-transforms.js'
export * from './mermaid.js'
export * from './plan-factory.js'

export interface TextCompletion {
  text: string
  model: string
  usage?: {
    inputTokens: number
    outputTokens: number
  }
}

export interface TextTransformer {
  complete(request: { system: string; prompt: string; signal?: AbortSignal }): Promise<TextCompletion>
}

export interface WorkflowPlanner {
  planWikiLinks(path: string, signal?: AbortSignal): Promise<WritePlan>
  planTranslation(path: string, language: string, signal?: AbortSignal): Promise<WritePlan>
  planTitleGeneration(path: string, signal?: AbortSignal): Promise<WritePlan>
  planResearchSynthesis(path: string, sources: readonly string[], signal?: AbortSignal): Promise<WritePlan>
  planConceptExtraction(path: string, signal?: AbortSignal): Promise<WritePlan>
  planMermaidRepair(path: string, signal?: AbortSignal): Promise<WritePlan>
  planFormulaRepair(path: string): Promise<WritePlan>
}

export class NotemdWorkflowPlanner implements WorkflowPlanner {
  constructor(
    private readonly vault: NotemdVault,
    private readonly transformer: TextTransformer,
  ) {}

  async planWikiLinks(path: string, signal?: AbortSignal): Promise<WritePlan> {
    return this.planDocumentCompletion(
      path,
      'Add precise Obsidian wiki-links where they improve navigability. Return the full Markdown document only.',
      signal,
    )
  }

  async planTranslation(path: string, language: string, signal?: AbortSignal): Promise<WritePlan> {
    const document = await this.vault.read(path, signal)
    const text = await this.complete(
      'Translate Markdown faithfully. Preserve structure and return the complete translated Markdown only.',
      `Language: ${language}\n\n${document.content}`,
      signal,
    )
    return createDocumentPlan(translationTargetPath(document.path, language), text)
  }

  async planTitleGeneration(path: string, signal?: AbortSignal): Promise<WritePlan> {
    return this.planDocumentCompletion(
      path,
      'Generate an accurate title and return the complete Markdown document with a single leading H1.',
      signal,
    )
  }

  async planResearchSynthesis(path: string, sources: readonly string[], signal?: AbortSignal): Promise<WritePlan> {
    const document = await this.vault.read(path, signal)
    const text = await this.complete(
      'Synthesize the supplied sources into the Markdown document. Return the complete Markdown only and mark uncertainty.',
      `Document:\n${document.content}\n\nSources:\n${sources.join('\n')}`,
      signal,
    )
    return replaceDocumentPlan(document, text)
  }

  async planConceptExtraction(path: string, signal?: AbortSignal): Promise<WritePlan> {
    const document = await this.vault.read(path, signal)
    const text = await this.complete(
      'Extract concepts as strict JSON: {"concepts":[{"name":"...","summary":"..."}]}. Do not return Markdown.',
      document.content,
      signal,
    )
    const concepts = parseExtractedConcepts(text)
    const writes = concepts.map((concept) => ({
      path: `concepts/${concept.name}.md`,
      content: conceptNoteContent(concept, document.path),
      expectedRevision: 'absent' as const,
    }))
    return createWritePlan(writes)
  }

  async planMermaidRepair(path: string, signal?: AbortSignal): Promise<WritePlan> {
    const document = await this.vault.read(path, signal)
    const content = await replaceMermaidFenceBodies(document.content, async (body) =>
      this.complete(mermaidRepairSystemPrompt, body, signal),
    )
    return replaceDocumentPlan(document, content)
  }

  async planFormulaRepair(path: string): Promise<WritePlan> {
    const document = await this.vault.read(path)
    return replaceDocumentPlan(document, normalizeFormulaDelimiters(document.content))
  }

  private async planDocumentCompletion(path: string, system: string, signal?: AbortSignal): Promise<WritePlan> {
    const document = await this.vault.read(path, signal)
    return replaceDocumentPlan(document, await this.complete(system, document.content, signal))
  }

  private async complete(system: string, prompt: string, signal?: AbortSignal): Promise<string> {
    const request: { system: string; prompt: string; signal?: AbortSignal } = { system, prompt }
    if (signal !== undefined) {
      request.signal = signal
    }
    const completion = await this.transformer.complete(request)
    if (typeof completion.text !== 'string') {
      throw new Error('The text transformer returned a non-string completion.')
    }
    return completion.text
  }
}
