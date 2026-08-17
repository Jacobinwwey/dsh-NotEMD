import { expect, test } from 'vitest'

import type { WorkspaceMutationPlan } from '@notemd-harness/mutation'

import { registerArtifactTools } from '../src/artifact-tools.js'
import type { NotemdToolContext } from '../src/notemd-services.js'
import type { ToolRegistrationSpec } from '../src/tool-contract.js'

interface ArtifactCall {
  readonly target: string
  readonly sourcePath: string
}

test('plans each SVG-capable target through a named source-bound Tool', async () => {
  const registered: ToolRegistrationSpec[] = []
  const calls: ArtifactCall[] = []
  const plan = {} as WorkspaceMutationPlan
  const context = {
    tools: { register: (tool: ToolRegistrationSpec) => registered.push(tool) },
    notemdVault: {
      read: async (path: string) => ({ path, content: '# Diagram', revision: 'rev-a' }),
    },
    notemdArtifacts: {
      planMermaidArtifact: (spec: { readonly canonicalTarget: string }, source: { readonly path: string }) => {
        calls.push({ target: spec.canonicalTarget, sourcePath: source.path })
        return plan
      },
      planVegaLiteArtifact: () => plan,
      planJsonCanvasArtifact: () => plan,
      planHtmlArtifact: () => plan,
      planEditableSvgArtifact: () => plan,
      planSlidevSource: async () => plan,
      planSlidevHtmlExport: async () => plan,
      planSlidevPdfExport: async () => plan,
      planSlidevPngExport: async () => plan,
      planSlidevPptxExport: async () => plan,
      planSlidevMp4Export: async () => plan,
      planCleanup: async () => [],
      mermaidRenderingCapability: () => ({ capability: 'diagram-rendering' as const, status: 'available' as const, reason: 'installed' }),
      vegaLiteRenderingCapability: () => ({ capability: 'diagram-rendering' as const, status: 'available' as const, reason: 'installed' }),
      jsonCanvasRenderingCapability: () => ({ capability: 'diagram-rendering' as const, status: 'available' as const, reason: 'installed' }),
      htmlRenderingCapability: () => ({ capability: 'diagram-rendering' as const, status: 'available' as const, reason: 'installed' }),
      editableSvgRenderingCapability: () => ({ capability: 'diagram-rendering' as const, status: 'available' as const, reason: 'installed' }),
      slidevSourceCapability: async () => ({ capability: 'document-export' as const, status: 'available' as const, reason: 'installed' }),
      slidevHtmlExportCapability: async () => ({ capability: 'document-export' as const, status: 'unavailable' as const, reason: 'not installed' }),
      slidevPdfExportCapability: async () => ({ capability: 'document-export' as const, status: 'unavailable' as const, reason: 'not installed' }),
      slidevPngExportCapability: async () => ({ capability: 'document-export' as const, status: 'unavailable' as const, reason: 'not installed' }),
      slidevPptxExportCapability: async () => ({ capability: 'document-export' as const, status: 'unavailable' as const, reason: 'not installed' }),
      slidevMp4ExportCapability: async () => ({ capability: 'document-export' as const, status: 'unavailable' as const, reason: 'not installed' }),
    },
  } as unknown as NotemdToolContext

  registerArtifactTools(context, (tool) => tool)

  const names = registered.map((tool) => tool.name)
  expect(names).toEqual(expect.arrayContaining([
    'notemd_plan_mermaid_artifact',
    'notemd_plan_vega_lite_artifact',
    'notemd_plan_json_canvas_artifact',
    'notemd_plan_html_artifact',
    'notemd_plan_editable_svg_artifact',
    'notemd_mermaid_render_status',
    'notemd_vega_lite_render_status',
    'notemd_json_canvas_render_status',
    'notemd_html_render_status',
    'notemd_editable_svg_render_status',
  ]))
  expect(names).not.toContain('notemd_artifact_render_status')
  expect(names).not.toContain('notemd_plan_source_artifact')

  const mermaidPlan = requiredTool(registered, 'notemd_plan_mermaid_artifact')
  await expect(mermaidPlan.execute({ spec: mermaidSpec() })).resolves.toMatchObject({ status: 'success', plan })
  expect(calls).toEqual([{ target: 'mermaid', sourcePath: 'notes/a.md' }])

  await expect(mermaidPlan.execute({ spec: { ...mermaidSpec(), canonicalTarget: 'html' } })).resolves.toEqual({
    status: 'rejected',
    code: 'invalid-input',
  })

  const status = requiredTool(registered, 'notemd_mermaid_render_status')
  await expect(status.execute({})).resolves.toEqual({
    status: 'success',
    capability: { capability: 'diagram-rendering', status: 'available', reason: 'installed' },
  })
})

function requiredTool(registered: readonly ToolRegistrationSpec[], name: string): ToolRegistrationSpec {
  const tool = registered.find((candidate) => candidate.name === name)
  if (tool === undefined) {
    throw new Error(`Tool ${name} was not registered.`)
  }
  return tool
}

function mermaidSpec() {
  return {
    schemaFamily: 'diagram-spec' as const,
    version: 2,
    title: 'Write Lifecycle',
    source: { path: 'notes/a.md', revision: 'rev-a' },
    evidenceRefs: [],
    generation: {
      promptPolicyId: 'notemd.diagram.mermaid.v2',
      provider: 'deepseek',
      model: 'deepseek-chat',
    },
    rendererIntent: { theme: 'light', fontFamily: 'Inter' },
    canonicalTarget: 'mermaid',
    graph: {
      intent: 'flowchart',
      nodes: [{ id: 'plan', label: 'Plan' }],
      edges: [],
    },
  }
}
