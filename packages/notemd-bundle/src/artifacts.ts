import { Service, type Context } from '@deepseek-ai/cordis'
import {
  ArtifactPlanner,
  DocumentExportPlanner,
  SpecialistArtifactPlanner,
  type ArtifactCapability,
  type DiagramSpecFor,
  type NotemdArtifacts,
  type SlidevHtmlExportSpec,
  type SlidevMp4ExportSpec,
  type SlidevPdfExportSpec,
  type SlidevPngExportSpec,
  type SlidevPptxExportSpec,
  type SlidevSourceSpec,
} from '@notemd-harness/artifacts'
import { SlidevMp4ArtifactRenderer } from '@notemd-harness/export-media'
import { SlidevPptxArtifactRenderer } from '@notemd-harness/export-pptx'
import {
  SlidevHtmlArtifactRenderer,
  SlidevPdfArtifactRenderer,
  SlidevPngArtifactRenderer,
  SlidevSourceArtifactRenderer,
} from '@notemd-harness/export-slidev'
import type { WorkspaceMutationPlan } from '@notemd-harness/mutation'
import { AllowlistedProcessBoundary } from '@notemd-harness/process'
import { DrawioArtifactRenderer } from '@notemd-harness/render-drawio'
import { DrawnixArtifactRenderer } from '@notemd-harness/render-drawnix'
import { CircuitikzArtifactRenderer } from '@notemd-harness/render-circuitikz'
import { EditableSvgRenderer } from '@notemd-harness/render-editable-svg'
import { HtmlSvgRenderer } from '@notemd-harness/render-html'
import { JsonCanvasSvgRenderer } from '@notemd-harness/render-json-canvas'
import { MermaidSvgRenderer } from '@notemd-harness/render-mermaid'
import { VegaLiteSvgRenderer } from '@notemd-harness/render-vega-lite'
import { StagedAssetStore } from '@notemd-harness/vault-local'
import type { VaultDocument } from '@notemd-harness/vault'

import { workspaceRootFrom, type WorkspaceRootConfig } from './workspace-root.js'

export class NotemdArtifactsService extends Service implements NotemdArtifacts {
  static inject = ['notemdVault', 'subprocess'] as const

  private svgPlanner: ArtifactPlanner | undefined
  private specialistPlanner: SpecialistArtifactPlanner | undefined
  private documentPlanner: DocumentExportPlanner | undefined
  private readonly workspaceRoot: string

  constructor(ctx: Context, config: WorkspaceRootConfig) {
    super(ctx, 'notemdArtifacts')
    this.workspaceRoot = workspaceRootFrom(config)
  }

  protected async [Service.init](): Promise<void> {
    this.svgPlanner = new ArtifactPlanner(this.ctx.notemdVault, {
      mermaid: new MermaidSvgRenderer(),
      vegaLite: new VegaLiteSvgRenderer(),
      jsonCanvas: new JsonCanvasSvgRenderer(),
      html: new HtmlSvgRenderer(),
      editableSvg: new EditableSvgRenderer(),
    })
    const process = new AllowlistedProcessBoundary(this.ctx.subprocess, this.workspaceRoot)
    const stagedAssets = await StagedAssetStore.open(this.workspaceRoot)
    this.specialistPlanner = new SpecialistArtifactPlanner({
      drawio: new DrawioArtifactRenderer(process),
      drawnix: new DrawnixArtifactRenderer(process),
      circuitikz: new CircuitikzArtifactRenderer(process, stagedAssets),
    })
    this.documentPlanner = new DocumentExportPlanner({
      source: new SlidevSourceArtifactRenderer(),
      html: new SlidevHtmlArtifactRenderer(process, stagedAssets),
      pdf: new SlidevPdfArtifactRenderer(process, stagedAssets),
      png: new SlidevPngArtifactRenderer(process, stagedAssets),
      pptx: new SlidevPptxArtifactRenderer(process, stagedAssets),
      mp4: new SlidevMp4ArtifactRenderer(process, stagedAssets),
    })
    this.ctx.effect(() => async () => {
      await process.dispose()
    }, 'notemdArtifacts.process')
  }

  planMermaidArtifact(spec: DiagramSpecFor<'mermaid'>, source: VaultDocument): WorkspaceMutationPlan {
    return this.requireSvgPlanner().planMermaidArtifact(spec, source)
  }

  planVegaLiteArtifact(spec: DiagramSpecFor<'vega-lite'>, source: VaultDocument): WorkspaceMutationPlan {
    return this.requireSvgPlanner().planVegaLiteArtifact(spec, source)
  }

  planJsonCanvasArtifact(spec: DiagramSpecFor<'json-canvas'>, source: VaultDocument): WorkspaceMutationPlan {
    return this.requireSvgPlanner().planJsonCanvasArtifact(spec, source)
  }

  planHtmlArtifact(spec: DiagramSpecFor<'html'>, source: VaultDocument): WorkspaceMutationPlan {
    return this.requireSvgPlanner().planHtmlArtifact(spec, source)
  }

  planEditableSvgArtifact(spec: DiagramSpecFor<'editable-svg'>, source: VaultDocument): WorkspaceMutationPlan {
    return this.requireSvgPlanner().planEditableSvgArtifact(spec, source)
  }

  planDrawioArtifact(spec: DiagramSpecFor<'drawio'>, source: VaultDocument, signal?: AbortSignal): Promise<WorkspaceMutationPlan> {
    return this.requireSpecialistPlanner().planDrawioArtifact(spec, source, signal)
  }

  planDrawnixArtifact(spec: DiagramSpecFor<'drawnix'>, source: VaultDocument, signal?: AbortSignal): Promise<WorkspaceMutationPlan> {
    return this.requireSpecialistPlanner().planDrawnixArtifact(spec, source, signal)
  }

  planCircuitikzArtifact(spec: DiagramSpecFor<'circuitikz'>, source: VaultDocument, signal?: AbortSignal): Promise<WorkspaceMutationPlan> {
    return this.requireSpecialistPlanner().planCircuitikzArtifact(spec, source, signal)
  }

  planSlidevSource(spec: SlidevSourceSpec, source: VaultDocument, signal?: AbortSignal): Promise<WorkspaceMutationPlan> {
    return this.requireDocumentPlanner().planSlidevSource(spec, source, signal)
  }

  planSlidevHtmlExport(spec: SlidevHtmlExportSpec, source: VaultDocument, signal?: AbortSignal): Promise<WorkspaceMutationPlan> {
    return this.requireDocumentPlanner().planSlidevHtmlExport(spec, source, signal)
  }

  planSlidevPdfExport(spec: SlidevPdfExportSpec, source: VaultDocument, signal?: AbortSignal): Promise<WorkspaceMutationPlan> {
    return this.requireDocumentPlanner().planSlidevPdfExport(spec, source, signal)
  }

  planSlidevPngExport(spec: SlidevPngExportSpec, source: VaultDocument, signal?: AbortSignal): Promise<WorkspaceMutationPlan> {
    return this.requireDocumentPlanner().planSlidevPngExport(spec, source, signal)
  }

  planSlidevPptxExport(spec: SlidevPptxExportSpec, source: VaultDocument, signal?: AbortSignal): Promise<WorkspaceMutationPlan> {
    return this.requireDocumentPlanner().planSlidevPptxExport(spec, source, signal)
  }

  planSlidevMp4Export(spec: SlidevMp4ExportSpec, source: VaultDocument, signal?: AbortSignal): Promise<WorkspaceMutationPlan> {
    return this.requireDocumentPlanner().planSlidevMp4Export(spec, source, signal)
  }

  planCleanup(artifactId: string): Promise<readonly string[]> {
    return this.requireSvgPlanner().planCleanup(artifactId)
  }

  mermaidRenderingCapability(): ArtifactCapability {
    return this.requireSvgPlanner().mermaidRenderingCapability()
  }

  vegaLiteRenderingCapability(): ArtifactCapability {
    return this.requireSvgPlanner().vegaLiteRenderingCapability()
  }

  jsonCanvasRenderingCapability(): ArtifactCapability {
    return this.requireSvgPlanner().jsonCanvasRenderingCapability()
  }

  htmlRenderingCapability(): ArtifactCapability {
    return this.requireSvgPlanner().htmlRenderingCapability()
  }

  editableSvgRenderingCapability(): ArtifactCapability {
    return this.requireSvgPlanner().editableSvgRenderingCapability()
  }

  drawioRenderingCapability(signal?: AbortSignal): Promise<ArtifactCapability> {
    return this.requireSpecialistPlanner().drawioRenderingCapability(signal)
  }

  drawnixRenderingCapability(signal?: AbortSignal): Promise<ArtifactCapability> {
    return this.requireSpecialistPlanner().drawnixRenderingCapability(signal)
  }

  circuitikzRenderingCapability(signal?: AbortSignal): Promise<ArtifactCapability> {
    return this.requireSpecialistPlanner().circuitikzRenderingCapability(signal)
  }

  slidevSourceCapability(signal?: AbortSignal): Promise<ArtifactCapability> {
    return this.requireDocumentPlanner().slidevSourceCapability(signal)
  }

  slidevHtmlExportCapability(signal?: AbortSignal): Promise<ArtifactCapability> {
    return this.requireDocumentPlanner().slidevHtmlExportCapability(signal)
  }

  slidevPdfExportCapability(signal?: AbortSignal): Promise<ArtifactCapability> {
    return this.requireDocumentPlanner().slidevPdfExportCapability(signal)
  }

  slidevPngExportCapability(signal?: AbortSignal): Promise<ArtifactCapability> {
    return this.requireDocumentPlanner().slidevPngExportCapability(signal)
  }

  slidevPptxExportCapability(signal?: AbortSignal): Promise<ArtifactCapability> {
    return this.requireDocumentPlanner().slidevPptxExportCapability(signal)
  }

  slidevMp4ExportCapability(signal?: AbortSignal): Promise<ArtifactCapability> {
    return this.requireDocumentPlanner().slidevMp4ExportCapability(signal)
  }

  private requireSvgPlanner(): ArtifactPlanner {
    if (this.svgPlanner === undefined) {
      throw new Error('NoteMD artifacts service is not initialized.')
    }
    return this.svgPlanner
  }

  private requireSpecialistPlanner(): SpecialistArtifactPlanner {
    if (this.specialistPlanner === undefined) {
      throw new Error('NoteMD artifacts service is not initialized.')
    }
    return this.specialistPlanner
  }

  private requireDocumentPlanner(): DocumentExportPlanner {
    if (this.documentPlanner === undefined) {
      throw new Error('NoteMD document export service is not initialized.')
    }
    return this.documentPlanner
  }
}

export default NotemdArtifactsService
