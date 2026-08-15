import {
  createContentSha256,
  createWorkspaceMutationPlan,
  type WorkspaceMutationPlan,
} from '@notemd-harness/mutation'
import type { NotemdVault } from '@notemd-harness/vault'

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
  planWikiLinks(path: string, signal?: AbortSignal): Promise<WorkspaceMutationPlan>
  planTranslation(path: string, language: string, signal?: AbortSignal): Promise<WorkspaceMutationPlan>
  planTitleGeneration(path: string, signal?: AbortSignal): Promise<WorkspaceMutationPlan>
  planResearchSynthesis(path: string, sources: readonly string[], signal?: AbortSignal): Promise<WorkspaceMutationPlan>
  planConceptExtraction(path: string, signal?: AbortSignal): Promise<WorkspaceMutationPlan>
  planMermaidRepair(path: string, signal?: AbortSignal): Promise<WorkspaceMutationPlan>
  planFormulaRepair(path: string): Promise<WorkspaceMutationPlan>
}

export class NotemdWorkflowPlanner implements WorkflowPlanner {
  constructor(
    private readonly vault: NotemdVault,
    private readonly transformer: TextTransformer,
  ) {}

  async planWikiLinks(path: string, signal?: AbortSignal): Promise<WorkspaceMutationPlan> {
    return this.planDocumentCompletion(
      path,
      'file.process-add-links',
      'Add precise Obsidian wiki-links where they improve navigability. Return the full Markdown document only.',
      signal,
    )
  }

  async planTranslation(path: string, language: string, signal?: AbortSignal): Promise<WorkspaceMutationPlan> {
    const document = await this.vault.read(path, signal)
    const text = await this.complete(
      'Translate Markdown faithfully. Preserve structure and return the complete translated Markdown only.',
      `Language: ${language}\n\n${document.content}`,
      signal,
    )
    return createDocumentPlan(translationTargetPath(document.path, language), text, {
      operationId: 'translate.file',
      sourceRefs: [document.path],
      evidenceRefs: [],
    })
  }

  async planTitleGeneration(path: string, signal?: AbortSignal): Promise<WorkspaceMutationPlan> {
    return this.planDocumentCompletion(
      path,
      'content.generate-from-title',
      'Generate an accurate title and return the complete Markdown document with a single leading H1.',
      signal,
    )
  }

  async planResearchSynthesis(path: string, sources: readonly string[], signal?: AbortSignal): Promise<WorkspaceMutationPlan> {
    const document = await this.vault.read(path, signal)
    const text = await this.complete(
      'Synthesize the supplied sources into the Markdown document. Return the complete Markdown only and mark uncertainty.',
      `Document:\n${document.content}\n\nSources:\n${sources.join('\n')}`,
      signal,
    )
    return replaceDocumentPlan(document, text, {
      operationId: 'research.summarize-topic',
      sourceRefs: [document.path],
      evidenceRefs: [],
    })
  }

  async planConceptExtraction(path: string, signal?: AbortSignal): Promise<WorkspaceMutationPlan> {
    const document = await this.vault.read(path, signal)
    const text = await this.complete(
      'Extract concepts as strict JSON: {"concepts":[{"name":"...","summary":"..."}]}. Do not return Markdown.',
      document.content,
      signal,
    )
    const concepts = parseExtractedConcepts(text)
    const provenance = {
      operationId: 'concept.extract-file',
      sourceRefs: [document.path],
      evidenceRefs: [],
    }
    return createWorkspaceMutationPlan({
      provenance,
      mutations: concepts.map((concept) => {
        const content = conceptNoteContent(concept, document.path)
        return {
          kind: 'write-text' as const,
          destination: `concepts/${concept.name}.md`,
          expectedRevision: 'absent' as const,
          provenance,
          conflictPolicy: 'reject' as const,
          mediaType: 'text/markdown',
          content,
          contentSha256: createContentSha256(content),
        }
      }),
    })
  }

  async planMermaidRepair(path: string, signal?: AbortSignal): Promise<WorkspaceMutationPlan> {
    const document = await this.vault.read(path, signal)
    const content = await replaceMermaidFenceBodies(document.content, async (body) =>
      this.complete(mermaidRepairSystemPrompt, body, signal),
    )
    return replaceDocumentPlan(document, content, {
      operationId: 'mermaid.batch-fix',
      sourceRefs: [document.path],
      evidenceRefs: [],
    })
  }

  async planFormulaRepair(path: string): Promise<WorkspaceMutationPlan> {
    const document = await this.vault.read(path)
    return replaceDocumentPlan(document, normalizeFormulaDelimiters(document.content), {
      operationId: 'formula.fix-file',
      sourceRefs: [document.path],
      evidenceRefs: [],
    })
  }

  private async planDocumentCompletion(
    path: string,
    operationId: string,
    system: string,
    signal?: AbortSignal,
  ): Promise<WorkspaceMutationPlan> {
    const document = await this.vault.read(path, signal)
    return replaceDocumentPlan(document, await this.complete(system, document.content, signal), {
      operationId,
      sourceRefs: [document.path],
      evidenceRefs: [],
    })
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
