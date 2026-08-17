import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import {
  ArtifactPlanner,
  DocumentExportPlanner,
  type SlidevSourceSpec,
} from '@notemd-harness/artifacts'
import type { WorkspaceMutationPlan } from '@notemd-harness/mutation'
import { EditableSvgRenderer } from '../../notemd-render-editable-svg/src/index.js'
import { HtmlSvgRenderer } from '../../notemd-render-html/src/index.js'
import { JsonCanvasSvgRenderer } from '../../notemd-render-json-canvas/src/index.js'
import { MermaidSvgRenderer } from '../../notemd-render-mermaid/src/index.js'
import { VegaLiteSvgRenderer } from '../../notemd-render-vega-lite/src/index.js'
import { SlidevSourceArtifactRenderer } from '../../notemd-export-slidev/src/index.js'
import { VaultKnowledgeIndex } from '@notemd-harness/knowledge'
import { LocalVault } from '@notemd-harness/vault-local'
import type { VaultDocument } from '@notemd-harness/vault'
import {
  NotemdWorkflowPlanner,
  sourceSiblingOriginalTextOutput,
  type TextTransformer,
} from '../src/index.js'

const fixtureRoot = new URL('../../../fixtures/migration/', import.meta.url)

const fixtureInputPaths: Readonly<Record<string, string>> = Object.freeze({
  'wiki-links': 'notes/source.md',
  'title-generation': 'notes/source.md',
  'chapter-split': 'notes/chapters.md',
  'research-synthesis': 'notes/research.md',
  translation: 'notes/source.md',
  'concept-extraction': 'notes/concepts.md',
  'original-text': 'notes/original.md',
  'extract-and-generate': 'notes/concepts.md',
  'duplicate-reconciliation': 'notes/duplicates.md',
  'mermaid-repair': 'notes/mermaid.md',
  'formula-repair': 'notes/formula.md',
  'local-retrieval': 'notes/knowledge.md',
  'diagram-source': 'notes/diagram.md',
  'slide-source': 'slides/architecture.md',
})

export interface FixtureOperationObservation {
  readonly operationId: string
  readonly outputSchema: string
  readonly targetPaths: readonly string[]
  readonly citationIds: readonly string[]
  readonly mutationPreconditions: Readonly<Record<string, string>>
}

export interface FixtureAdapterExecution {
  readonly fixtureId: string
  readonly operations: readonly FixtureOperationObservation[]
}

export interface MigrationFixtureAdapter {
  readonly fixtureId: string
  execute(): Promise<FixtureAdapterExecution>
}

class ScriptedTransformer implements TextTransformer {
  private readonly responses: string[]

  constructor(responses: readonly string[]) {
    this.responses = [...responses]
  }

  async complete(): Promise<{ text: string; model: string }> {
    const response = this.responses.shift()
    if (response === undefined) {
      throw new Error('The migration fixture did not configure enough deterministic completions.')
    }
    return { text: response, model: 'migration-fixture-model' }
  }
}

const wikiLinksAdapter: MigrationFixtureAdapter = {
  fixtureId: 'wiki-links',
  async execute() {
    return withFixtureWorkspace('wiki-links', async (vault) => {
      const source = await vault.read('notes/source.md')
      const workflows = new NotemdWorkflowPlanner(vault, new ScriptedTransformer([
        '# Atomic Writes\n\n[[Atomic Writes]] make a replacement visible as one transition.',
        '# Atomic Writes\n\n[[Atomic Writes]] make a replacement visible as one transition.',
      ]))
      const folderPlans = await workflows.planWikiLinksInFolder('notes')
      return executionFromObservations('wiki-links', [
        await observationForPlan(vault, 'file.process-add-links', 'workspace-mutation-plan/v1', await workflows.planWikiLinks(source.path)),
        ...(await observationsForPlans(vault, 'file.process-folder-add-links', 'workspace-mutation-plan/v1', folderPlans)),
      ])
    })
  },
}

const titleGenerationAdapter: MigrationFixtureAdapter = {
  fixtureId: 'title-generation',
  async execute() {
    return withFixtureWorkspace('title-generation', async (vault) => {
      const source = await vault.read('notes/source.md')
      const workflows = new NotemdWorkflowPlanner(vault, new ScriptedTransformer([
        '# Atomic Writes\n\nAtomic writes make a replacement visible as one transition.',
        '# Atomic Writes\n\nAtomic writes make a replacement visible as one transition.',
      ]))
      const folderPlans = await workflows.planTitlesInFolder('notes')
      return executionFromObservations('title-generation', [
        await observationForPlan(vault, 'content.generate-from-title', 'workspace-mutation-plan/v1', await workflows.planTitleGeneration(source.path)),
        ...(await observationsForPlans(vault, 'content.batch-generate-from-titles', 'workspace-mutation-plan/v1', folderPlans)),
      ])
    })
  },
}

const chapterSplitAdapter: MigrationFixtureAdapter = {
  fixtureId: 'chapter-split',
  async execute() {
    return withFixtureWorkspace('chapter-split', async (vault) => {
      const plan = await new NotemdWorkflowPlanner(vault, new ScriptedTransformer([])).planChapterSplit('notes/chapters.md')
      return executionFromObservations('chapter-split', [
        await observationForPlan(vault, 'content.split-note-by-chapters', 'workspace-mutation-plan/v1', plan),
      ])
    })
  },
}

const researchSynthesisAdapter: MigrationFixtureAdapter = {
  fixtureId: 'research-synthesis',
  async execute() {
    return withFixtureWorkspace('research-synthesis', async (vault) => {
      const evidence = {
        version: 1 as const,
        id: 'evidence:revision-aware-mutations',
        query: 'revision-aware workspace mutations',
        requestedUrl: 'https://example.test/revision-aware',
        finalUrl: 'https://example.test/revision-aware',
        statusCode: 200,
        bodyKind: 'text' as const,
        content: 'A durable journal and verified replacement make mutations recoverable.',
        truncated: false,
        contentSha256: 'a'.repeat(64),
        retrievedAt: '2026-08-15T00:00:00.000Z',
        citations: [{ id: 'citation:revision-aware-mutations', url: 'https://example.test/revision-aware' }],
      }
      const plan = await new NotemdWorkflowPlanner(
        vault,
        new ScriptedTransformer(['# Research Topic\n\nEvidence-backed synthesis.']),
      ).planResearchSynthesis('notes/research.md', [evidence])
      return executionFromObservations('research-synthesis', [
        await observationForPlan(vault, 'research.summarize-topic', 'research-evidence-and-mutation-plan/v1', plan),
      ])
    })
  },
}

const translationAdapter: MigrationFixtureAdapter = {
  fixtureId: 'translation',
  async execute() {
    return withFixtureWorkspace('translation', async (vault) => {
      const workflows = new NotemdWorkflowPlanner(vault, new ScriptedTransformer([
        '# Atomare Schreibvorgange\n\nEine atomare Ersetzung bleibt konsistent.',
        '# Atomare Schreibvorgange\n\nEine atomare Ersetzung bleibt konsistent.',
      ]))
      const folderPlans = await workflows.planTranslationsInFolder('notes', 'de')
      return executionFromObservations('translation', [
        await observationForPlan(vault, 'translate.file', 'workspace-mutation-plan/v1', await workflows.planTranslation('notes/source.md', 'de')),
        ...(await observationsForPlans(vault, 'translate.folder-batch', 'workspace-mutation-plan/v1', folderPlans)),
      ])
    })
  },
}

const conceptExtractionAdapter: MigrationFixtureAdapter = {
  fixtureId: 'concept-extraction',
  async execute() {
    return withFixtureWorkspace('concept-extraction', async (vault) => {
      const response = '{"concepts":[{"name":"Atomic Writes","summary":"A replacement becomes visible atomically."}]}'
      const workflows = new NotemdWorkflowPlanner(vault, new ScriptedTransformer([response, response]))
      const folderPlans = await workflows.planConceptsInFolder('notes')
      return executionFromObservations('concept-extraction', [
        await observationForPlan(vault, 'concept.extract-file', 'workspace-mutation-plan/v1', await workflows.planConceptExtraction('notes/concepts.md')),
        ...(await observationsForPlans(vault, 'concept.extract-folder', 'workspace-mutation-plan/v1', folderPlans)),
      ])
    })
  },
}

const originalTextAdapter: MigrationFixtureAdapter = {
  fixtureId: 'original-text',
  async execute() {
    return withFixtureWorkspace('original-text', async (vault) => {
      const plan = await new NotemdWorkflowPlanner(
        vault,
        new ScriptedTransformer(['The source statement remains preserved.', 'The commentary is generated.']),
      ).planOriginalTextExtraction(
        'notes/original.md',
        ['What statement is preserved?', 'What commentary is generated?'],
        sourceSiblingOriginalTextOutput(),
      )
      return executionFromObservations('original-text', [
        await observationForPlan(vault, 'content.extract-original-text', 'workspace-mutation-plan/v1', plan),
      ])
    })
  },
}

const extractAndGenerateAdapter: MigrationFixtureAdapter = {
  fixtureId: 'extract-and-generate',
  async execute() {
    return withFixtureWorkspace('extract-and-generate', async (vault) => {
      const plan = await new NotemdWorkflowPlanner(
        vault,
        new ScriptedTransformer([
          '{"concepts":[{"name":"Atomic Writes","summary":"Visibility-safe replacement."}]}',
          '# Atomic Writes\n\nA generated explanation.',
        ]),
      ).planExtractAndGenerate('notes/concepts.md')
      return executionFromObservations('extract-and-generate', [
        await observationForPlan(vault, 'workflow.extract-and-generate', 'workspace-mutation-plan/v1', plan),
      ])
    })
  },
}

const duplicateReconciliationAdapter: MigrationFixtureAdapter = {
  fixtureId: 'duplicate-reconciliation',
  async execute() {
    return withFixtureWorkspace('duplicate-reconciliation', async (vault) => {
      const workflows = new NotemdWorkflowPlanner(vault, new ScriptedTransformer([]))
      const duplicatePath = 'notes/duplicates.md'
      const diagnostics = await workflows.checkFileDuplicates(duplicatePath)
      const source = await vault.read(duplicatePath)
      const deletionPlan = await workflows.planConceptDedupe([duplicatePath])
      return {
        fixtureId: 'duplicate-reconciliation',
        operations: Object.freeze([
          observationFromDiagnostic(
            'duplicate.check-file',
            'duplicate-diagnostic/v1',
            source,
            diagnostics.length > 0,
          ),
          await observationForPlan(vault, 'concept.dedupe', 'duplicate-mutation-plan/v1', deletionPlan),
        ]),
      }
    })
  },
}

const mermaidRepairAdapter: MigrationFixtureAdapter = {
  fixtureId: 'mermaid-repair',
  async execute() {
    return withFixtureWorkspace('mermaid-repair', async (vault) => {
      const plan = await new NotemdWorkflowPlanner(
        vault,
        new ScriptedTransformer(['flowchart TD\n  Plan --> Approval']),
      ).planMermaidRepair('notes/mermaid.md')
      return executionFromObservations('mermaid-repair', [
        await observationForPlan(vault, 'mermaid.batch-fix', 'workspace-mutation-plan/v1', plan),
      ])
    })
  },
}

const formulaRepairAdapter: MigrationFixtureAdapter = {
  fixtureId: 'formula-repair',
  async execute() {
    return withFixtureWorkspace('formula-repair', async (vault) => {
      const workflows = new NotemdWorkflowPlanner(vault, new ScriptedTransformer([]))
      const folderPlans = await workflows.planFormulaRepairsInFolder('notes')
      return executionFromObservations('formula-repair', [
        await observationForPlan(vault, 'formula.fix-file', 'workspace-mutation-plan/v1', await workflows.planFormulaRepair('notes/formula.md')),
        ...(await observationsForPlans(vault, 'formula.batch-fix', 'workspace-mutation-plan/v1', folderPlans)),
      ])
    })
  },
}

const localRetrievalAdapter: MigrationFixtureAdapter = {
  fixtureId: 'local-retrieval',
  async execute() {
    return withFixtureWorkspace('local-retrieval', async (vault, root) => {
      await writeWorkspaceFileAtRoot(root, 'notes/current.md', '# Current\n\nCanonical lock ordering is mentioned here too.')
      const source = await vault.read('notes/knowledge.md')
      const index = new VaultKnowledgeIndex(vault)
      await index.rebuild()
      const result = await index.retrieve({
        query: 'canonical lock ordering',
        taskRoots: ['notes'],
        currentPath: 'notes/current.md',
        topK: 1,
        windowSections: 1,
      })
      const match = result.matches[0]
      if (match === undefined) {
        throw new Error('The local retrieval fixture did not produce a knowledge match.')
      }
      return {
        fixtureId: 'local-retrieval',
        operations: Object.freeze([
          Object.freeze({
            operationId: 'knowledge.retrieve',
            outputSchema: 'knowledge-query-result/v1',
            targetPaths: Object.freeze([source.path]),
            citationIds: Object.freeze([match.citationId]),
            mutationPreconditions: Object.freeze({ [source.path]: 'source-revision' }),
          }),
        ]),
      }
    })
  },
}

const diagramSourceAdapter: MigrationFixtureAdapter = {
  fixtureId: 'diagram-source',
  async execute() {
    return withFixtureWorkspace('diagram-source', async (vault) => {
      const source = await vault.read('notes/diagram.md')
      const planner = new ArtifactPlanner(vault, {
        mermaid: new MermaidSvgRenderer(),
        vegaLite: new VegaLiteSvgRenderer(),
        jsonCanvas: new JsonCanvasSvgRenderer(),
        html: new HtmlSvgRenderer(),
        editableSvg: new EditableSvgRenderer(),
      })
      const plan = planner.planMermaidArtifact(mermaidSpec(source), source)
      return executionFromObservations('diagram-source', [
        await observationForPlan(vault, 'diagram.generate', 'diagram-spec-and-artifact-plan/v1', plan),
      ])
    })
  },
}

const slideSourceAdapter: MigrationFixtureAdapter = {
  fixtureId: 'slide-source',
  async execute() {
    return withFixtureWorkspace('slide-source', async (vault) => {
      const source = await vault.read('slides/architecture.md')
      const renderer = new SlidevSourceArtifactRenderer()
      const planner = new DocumentExportPlanner({
        source: renderer,
        html: renderer as never,
        pdf: renderer as never,
        png: renderer as never,
        pptx: renderer as never,
        mp4: renderer as never,
      })
      const spec: SlidevSourceSpec = {
        version: 1,
        title: 'Recoverable Mutations',
        source: { path: source.path, revision: source.revision },
        theme: 'default',
      }
      const plan = await planner.planSlidevSource(spec, source)
      return executionFromObservations('slide-source', [
        await observationForPlan(vault, 'diagram.generate', 'slide-source-and-layout-report/v1', plan),
      ])
    })
  },
}

export const migrationFixtureAdapters: Readonly<Record<string, MigrationFixtureAdapter>> = Object.freeze({
  'wiki-links': wikiLinksAdapter,
  'title-generation': titleGenerationAdapter,
  'chapter-split': chapterSplitAdapter,
  'research-synthesis': researchSynthesisAdapter,
  translation: translationAdapter,
  'concept-extraction': conceptExtractionAdapter,
  'original-text': originalTextAdapter,
  'extract-and-generate': extractAndGenerateAdapter,
  'duplicate-reconciliation': duplicateReconciliationAdapter,
  'mermaid-repair': mermaidRepairAdapter,
  'formula-repair': formulaRepairAdapter,
  'local-retrieval': localRetrievalAdapter,
  'diagram-source': diagramSourceAdapter,
  'slide-source': slideSourceAdapter,
})

function executionFromObservations(
  fixtureId: string,
  operations: readonly FixtureOperationObservation[],
): FixtureAdapterExecution {
  if (operations.length === 0) {
    throw new Error(`Fixture ${fixtureId} produced no executable observations.`)
  }
  return {
    fixtureId,
    operations: Object.freeze([...operations]),
  }
}

async function observationsForPlans(
  vault: LocalVault,
  operationId: string,
  outputSchema: string,
  plans: readonly WorkspaceMutationPlan[],
): Promise<readonly FixtureOperationObservation[]> {
  if (plans.length === 0) {
    throw new Error(`The ${operationId} folder fixture produced no plans.`)
  }
  const sourceRefs = [...new Set(plans.flatMap((plan) => plan.provenance.sourceRefs))]
  const sourceDocuments = await Promise.all(sourceRefs.map((path) => vault.read(path)))
  const sourceRevisions = new Map(sourceDocuments.map((document) => [document.path, document.revision]))
  return Object.freeze([
    observationFromMutations(
      operationId,
      outputSchema,
      plans.flatMap((plan) => plan.mutations),
      sourceRevisions,
      plans.flatMap((plan) => plan.provenance.evidenceRefs),
      sourceRefs,
    ),
  ])
}

async function observationForPlan(
  vault: LocalVault,
  operationId: string,
  outputSchema: string,
  plan: WorkspaceMutationPlan,
): Promise<FixtureOperationObservation> {
  const sourceRefs = [...new Set(plan.provenance.sourceRefs)]
  const sourceDocuments = await Promise.all(sourceRefs.map((path) => vault.read(path)))
  const sourceRevisions = new Map<string, string>()
  for (const document of sourceDocuments) {
    sourceRevisions.set(document.path, document.revision)
  }
  return observationFromMutations(operationId, outputSchema, plan.mutations, sourceRevisions, plan.provenance.evidenceRefs, sourceRefs)
}

function observationFromMutations(
  operationId: string,
  outputSchema: string,
  mutations: readonly WorkspaceMutationPlan['mutations'][number][],
  sourceRevisions: ReadonlyMap<string, string>,
  citationIds: readonly string[],
  sourceRefs: readonly string[] = [],
): FixtureOperationObservation {
  const targetPaths = [...new Set(mutations.map((mutation) => mutation.destination))].sort((left, right) => left.localeCompare(right))
  const preconditions = new Map(mutations
    .slice()
    .sort((left, right) => left.destination.localeCompare(right.destination))
    .map((mutation) => [
      mutation.destination,
      mutation.expectedRevision === 'absent'
        ? 'absent'
        : sourceRevisions.get(mutation.destination) === mutation.expectedRevision
          ? 'source-revision'
          : mutation.expectedRevision,
    ] as const))
  for (const sourceRef of sourceRefs) {
    if (sourceRevisions.has(sourceRef) && !preconditions.has(sourceRef)) {
      preconditions.set(sourceRef, 'source-revision')
    }
  }
  return Object.freeze({
    operationId,
    outputSchema,
    targetPaths: Object.freeze(targetPaths),
    citationIds: Object.freeze([...new Set(citationIds)].sort((left, right) => left.localeCompare(right))),
    mutationPreconditions: Object.freeze(Object.fromEntries([...preconditions.entries()].sort(([left], [right]) => left.localeCompare(right)))),
  })
}

function observationFromDiagnostic(
  operationId: string,
  outputSchema: string,
  source: VaultDocument,
  hasDuplicates: boolean,
): FixtureOperationObservation {
  if (!hasDuplicates) {
    throw new Error('The duplicate diagnostic fixture must contain at least one duplicate.')
  }
  return Object.freeze({
    operationId,
    outputSchema,
    targetPaths: Object.freeze([source.path]),
    citationIds: Object.freeze([]),
    mutationPreconditions: Object.freeze({ [source.path]: 'source-revision' }),
  })
}

async function withFixtureWorkspace<T>(
  fixtureId: string,
  callback: (vault: LocalVault, root: string) => Promise<T>,
): Promise<T> {
  const inputPath = fixtureInputPaths[fixtureId]
  if (inputPath === undefined) {
    throw new Error(`No input path is registered for migration fixture ${fixtureId}.`)
  }
  const root = await mkdtemp(join(tmpdir(), `notemd-migration-${fixtureId}-`))
  try {
    const content = await readFile(new URL(inputPath, fixtureRoot), 'utf8')
    await writeWorkspaceFileAtRoot(root, inputPath, content)
    return await callback(await LocalVault.open(root), root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

async function writeWorkspaceFileAtRoot(root: string, path: string, content: string): Promise<void> {
  const absolutePath = join(root, ...path.split('/'))
  await mkdir(dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, content, 'utf8')
}

function mermaidSpec(source: VaultDocument) {
  return {
    schemaFamily: 'diagram-spec' as const,
    version: 2 as const,
    title: 'Mutation Flow',
    source: { path: source.path, revision: source.revision },
    evidenceRefs: [],
    generation: {
      promptPolicyId: 'notemd.diagram.mermaid.v2',
      provider: 'deepseek',
      model: 'deepseek-chat',
    },
    rendererIntent: { theme: 'light', fontFamily: 'Inter' },
    canonicalTarget: 'mermaid' as const,
    graph: {
      intent: 'flowchart' as const,
      nodes: [
        { id: 'plan', label: 'Plan' },
        { id: 'approval', label: 'Approval' },
        { id: 'apply', label: 'Apply' },
      ],
      edges: [
        { from: 'plan', to: 'approval' },
        { from: 'approval', to: 'apply' },
      ],
    },
  }
}
