import type { NotemdToolContext } from './notemd-services.js'
import { objectOutput, requiredString, type ToolDefinitionFactory } from './tool-contract.js'

export function registerReadTools(context: NotemdToolContext, defineTool: ToolDefinitionFactory): void {
  context.tools.register(defineTool({
    name: 'notemd_workspace_list',
    description: 'List Markdown paths in the configured NoteMD workspace.',
    parameters: {},
    output: objectOutput,
    async execute(_args, execution) {
      return { paths: await context.notemdVault.listMarkdown(execution?.signal) }
    },
  }))

  context.tools.register(defineTool({
    name: 'notemd_workspace_read',
    description: 'Read one Markdown document and its immutable revision from the NoteMD workspace.',
    parameters: {
      path: { type: 'string', required: true, description: 'Workspace-relative Markdown path.' },
    },
    output: objectOutput,
    async execute(args, execution) {
      return { document: await context.notemdVault.read(requiredString(args, 'path'), execution?.signal) }
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
      output: objectOutput,
      async execute(args) {
        return { matches: await knowledge.search(requiredString(args, 'query')) }
      },
    }))
  }
}
