import type { NotemdToolContext } from './notemd-services.js'
import type { KnowledgeRetrievalRequest } from '@notemd-harness/knowledge'
import {
  arraySchema,
  executeTool,
  knowledgeMatchSchema,
  knowledgeRetrievalResultSchema,
  outcomeOutput,
  propertyOf,
  requiredString,
  ToolInputError,
  type ToolDefinitionFactory,
  vaultDocumentSchema,
} from './tool-contract.js'

export function registerReadTools(context: NotemdToolContext, defineTool: ToolDefinitionFactory): void {
  context.tools.register(defineTool({
    name: 'notemd_workspace_list',
    description: 'List Markdown paths in the configured NoteMD workspace.',
    parameters: {},
    output: outcomeOutput({ paths: arraySchema({ type: 'string' }) }, ['paths']),
    async execute(_args, execution) {
      return executeTool(async () => ({ paths: await context.notemdVault.listMarkdown(execution?.signal) }))
    },
  }))

  context.tools.register(defineTool({
    name: 'notemd_workspace_read',
    description: 'Read one Markdown document and its immutable revision from the NoteMD workspace.',
    parameters: {
      path: { type: 'string', required: true, description: 'Workspace-relative Markdown path.' },
    },
    output: outcomeOutput({ document: vaultDocumentSchema }, ['document']),
    async execute(args, execution) {
      return executeTool(async () => ({ document: await context.notemdVault.read(requiredString(args, 'path'), execution?.signal) }))
    },
  }))

  const knowledge = context.notemdKnowledge
  if (knowledge !== undefined) {
    context.tools.register(defineTool({
      name: 'notemd_knowledge_search',
      description: 'Search the derived NoteMD knowledge index without reading or changing source files.',
      parameters: {
        query: { type: 'string', required: true, description: 'Terms to search for.' },
      },
      output: outcomeOutput({ matches: arraySchema(knowledgeMatchSchema) }, ['matches']),
      async execute(args) {
        return executeTool(async () => ({ matches: await knowledge.search(requiredString(args, 'query')) }))
      },
    }))

    context.tools.register(defineTool({
      name: 'notemd_knowledge_retrieve',
      description: 'Retrieve scoped, citation-bearing NoteMD knowledge sections with deterministic context windows.',
      parameters: {
        query: { type: 'string', required: true, description: 'Terms to retrieve.' },
        taskRoots: { type: 'array', items: { type: 'string' }, description: 'Optional workspace roots that bound retrieval.' },
        currentPath: { type: 'string', description: 'Optional current file to exclude.' },
        topK: { type: 'integer', description: 'Maximum returned hits.' },
        windowSections: { type: 'integer', description: 'Adjacent section count included with each hit.' },
      },
      output: outcomeOutput({ result: knowledgeRetrievalResultSchema }, ['result']),
      async execute(args) {
        return executeTool(async () => ({ result: await knowledge.retrieve(knowledgeRetrievalRequest(args)) }))
      },
    }))
  }
}

function knowledgeRetrievalRequest(args: unknown): KnowledgeRetrievalRequest {
  const request: {
    query: string
    taskRoots?: readonly string[]
    currentPath?: string
    topK?: number
    windowSections?: number
  } = { query: requiredString(args, 'query') }
  const taskRoots = optionalStringList(args, 'taskRoots')
  const currentPath = optionalString(args, 'currentPath')
  const topK = optionalInteger(args, 'topK')
  const windowSections = optionalInteger(args, 'windowSections')
  if (taskRoots !== undefined) request.taskRoots = taskRoots
  if (currentPath !== undefined) request.currentPath = currentPath
  if (topK !== undefined) request.topK = topK
  if (windowSections !== undefined) request.windowSections = windowSections
  return request
}

function optionalString(args: unknown, key: string): string | undefined {
  const value = propertyOf(args, key)
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ToolInputError(`Tool parameter "${key}" must be a non-empty string when provided.`)
  }
  return value
}

function optionalStringList(args: unknown, key: string): readonly string[] | undefined {
  const value = propertyOf(args, key)
  if (value === undefined) {
    return undefined
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
    throw new ToolInputError(`Tool parameter "${key}" must be an array of non-empty strings when provided.`)
  }
  return value
}

function optionalInteger(args: unknown, key: string): number | undefined {
  const value = propertyOf(args, key)
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new ToolInputError(`Tool parameter "${key}" must be an integer when provided.`)
  }
  return value
}
