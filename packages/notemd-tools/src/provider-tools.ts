import type { NotemdToolContext } from './notemd-services.js'
import { objectOutput, type ToolDefinitionFactory } from './tool-contract.js'

export function registerProviderTools(context: NotemdToolContext, defineTool: ToolDefinitionFactory): void {
  context.tools.register(defineTool({
    name: 'notemd_provider_diagnostic',
    description: 'Probe the configured OpenAI-compatible provider without returning prompt, completion, or credentials.',
    parameters: {},
    output: objectOutput,
    async execute(_args, execution) {
      return context.notemdTextTransformer.diagnoseProvider(execution?.signal)
    },
  }))

  context.tools.register(defineTool({
    name: 'notemd_provider_models',
    description: 'List configured provider models when standard OpenAI-compatible discovery is available.',
    parameters: {},
    output: objectOutput,
    async execute(_args, execution) {
      return context.notemdTextTransformer.discoverModels(execution?.signal)
    },
  }))
}
