import type { NotemdProviderDiagnostics, NotemdToolContext } from './notemd-services.js'
import {
  executeTool,
  outcomeOutput,
  providerDiagnosticSchema,
  modelDiscoverySchema,
  stringSchema,
  type ToolDefinitionFactory,
} from './tool-contract.js'

export function registerProviderTools(context: NotemdToolContext, defineTool: ToolDefinitionFactory): void {
  const diagnostics = providerDiagnosticsFrom(context.notemdTextTransformer)
  if (diagnostics === undefined) return

  context.tools.register(defineTool({
    name: 'notemd_provider_diagnostic',
    description: 'Probe the configured OpenAI-compatible provider without returning prompt, completion, or credentials.',
    parameters: {},
    output: outcomeOutput(
      { diagnostic: providerDiagnosticSchema },
      ['diagnostic'],
      [{ status: 'unavailable', properties: { code: stringSchema(), diagnostic: providerDiagnosticSchema }, required: ['code', 'diagnostic'] }],
    ),
    async execute(_args, execution) {
      const outcome = await executeTool(async () => ({ diagnostic: await diagnostics.diagnoseProvider(execution?.signal) }))
      return outcome.status === 'success' && outcome.diagnostic.status === 'unavailable'
        ? { status: 'unavailable', code: 'provider-unavailable', diagnostic: outcome.diagnostic }
        : outcome
    },
  }))

  context.tools.register(defineTool({
    name: 'notemd_provider_models',
    description: 'List configured provider models when standard OpenAI-compatible discovery is available.',
    parameters: {},
    output: outcomeOutput(
      { models: modelDiscoverySchema },
      ['models'],
      [{ status: 'unavailable', properties: { code: stringSchema(), models: modelDiscoverySchema }, required: ['code', 'models'] }],
    ),
    async execute(_args, execution) {
      const outcome = await executeTool(async () => ({ models: await diagnostics.discoverModels(execution?.signal) }))
      return outcome.status === 'success' && outcome.models.status === 'unavailable'
        ? { status: 'unavailable', code: 'model-discovery-unavailable', models: outcome.models }
        : outcome
    },
  }))
}

function providerDiagnosticsFrom(transformer: NotemdToolContext['notemdTextTransformer']): NotemdProviderDiagnostics | undefined {
  const candidate = transformer as Partial<NotemdProviderDiagnostics>
  return typeof candidate.diagnoseProvider === 'function' && typeof candidate.discoverModels === 'function'
    ? candidate as NotemdProviderDiagnostics
    : undefined
}
