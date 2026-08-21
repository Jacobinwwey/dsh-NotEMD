import { execFile as executeFile } from 'node:child_process'
import { cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { verifyBundle } from './verify-bundle.js'

const execFile = promisify(executeFile)
const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dshSourceRoot = join(workspaceRoot, 'ref', 'deepseek-harness')
const profileName = 'notemd-acceptance'

interface CommandOutput {
  readonly stdout: string
  readonly stderr: string
}

export async function acceptDshProfile(): Promise<void> {
  await runPnpm(workspaceRoot, ['build'])
  await runPnpm(workspaceRoot, ['pack:bundle'])
  await verifyBundle(workspaceRoot)

  const acceptanceRoot = await mkdtemp(join(workspaceRoot, 'artifacts', 'notemd-dsh-acceptance-'))
  try {
    const dshHome = join(acceptanceRoot, 'dsh-home')
    const fixtureWorkspace = join(acceptanceRoot, 'workspace')
    const tarball = await locateBundleTarball()
    await mkdir(dshHome, { recursive: true })
    await cp(join(workspaceRoot, 'fixtures', 'workspace'), fixtureWorkspace, { recursive: true })
    await writeFile(join(fixtureWorkspace, 'notes', 'formula.md'), formulaFixture, 'utf8')

    const environment = {
      ...process.env,
      DSH_HOME: dshHome,
      NOTEMD_ACCEPTANCE_WORKSPACE: fixtureWorkspace,
    }

    await runPnpm(dshSourceRoot, ['dsh', 'plugin', '--profile', profileName, 'add', tarball], environment)

    const profileDirectory = join(dshHome, 'profiles', profileName)
    await writeFile(join(profileDirectory, 'cordis.patch.yml'), profileOverlay, 'utf8')

    const config = await runPnpm(dshSourceRoot, ['dsh', '--profile', profileName, '--dump-config'], environment)
    assertContains(config.stdout, 'notemd-vault', 'DSH config dump does not contain the vault provider.')
    assertContains(config.stdout, 'notemd-workspace-changes', 'DSH config dump does not contain the workspace change provider.')
    assertContains(config.stdout, 'notemd-tools', 'DSH config dump does not contain the Tool provider.')
    assertContains(config.stdout, 'dsh-notemd/workflows', 'DSH config dump does not resolve the workflows module.')

    const profileManifest = JSON.parse(await readFile(join(profileDirectory, 'package.json'), 'utf8')) as {
      readonly dependencies?: Readonly<Record<string, string>>
      readonly dsh?: { readonly profile?: { readonly bundles?: readonly string[] } }
    }
    assert(
      profileManifest.dependencies?.['dsh-notemd'] !== undefined,
      'The clean profile did not install the NoteMD bundle dependency.',
    )
    assert(
      profileManifest.dsh?.profile?.bundles?.includes('dsh-notemd') === true,
      'The clean profile did not activate the NoteMD bundle layer.',
    )

    const runnerPath = join(profileDirectory, 'notemd-acceptance-runner.mjs')
    await writeFile(runnerPath, runtimeAcceptanceRunner, 'utf8')
    const result = await runCommand(process.execPath, [runnerPath], { cwd: profileDirectory, environment })
    const evidence = parseRunnerEvidence(result.stdout)
    assert(evidence.readPath === 'notes/architecture.md', 'The installed read Tool returned the wrong fixture path.')
    assert(evidence.approvals === 2, 'The approval bridge did not receive the expected two requests.')
    assert(evidence.appliedStatus === 'committed', 'The approved mutation proposal was not applied through the installed ToolRuntime.')
    assert(evidence.staleStatus === 'conflict', 'A stale mutation proposal was not rejected by the vault write precondition.')
    assert(evidence.jobState === 'completed', 'The installed formula planning job did not complete.')
    assert(evidence.researchStatus === 'unavailable', 'The installed research Tool did not report an unconfigured DSH web capability as unavailable.')
    assert(evidence.mermaidRendererStatus === 'available', 'The installed Mermaid renderer did not report its capability.')
    assert(['available', 'unavailable'].includes(evidence.drawioRendererStatus), 'The installed Draw.io capability Tool returned an invalid status.')
    assert(['available', 'unavailable'].includes(evidence.drawnixRendererStatus), 'The installed Drawnix capability Tool returned an invalid status.')
    assert(['available', 'unavailable'].includes(evidence.circuitikzRendererStatus), 'The installed Circuitikz capability Tool returned an invalid status.')
    assert(evidence.legacyProviderToolMissing, 'The default DSH bridge registered a legacy provider diagnostic Tool.')

    process.stdout.write('Clean DeepSeek Harness profile acceptance passed.\n')
  } finally {
    await rm(acceptanceRoot, { recursive: true, force: true })
  }
}

async function locateBundleTarball(): Promise<string> {
  const artifactsDirectory = join(workspaceRoot, 'artifacts')
  const entries = await readdir(artifactsDirectory, { withFileTypes: true })
  const tarballs = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.tgz'))
    .map((entry) => join(artifactsDirectory, entry.name))

  if (tarballs.length !== 1) {
    throw new Error(`Expected exactly one packed bundle in ${artifactsDirectory}, found ${tarballs.length}.`)
  }
  return tarballs[0] as string
}

async function runPnpm(
  cwd: string,
  arguments_: readonly string[],
  environment: NodeJS.ProcessEnv = process.env,
): Promise<CommandOutput> {
  return runCommand(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', arguments_, { cwd, environment })
}

async function runCommand(
  command: string,
  arguments_: readonly string[],
  options: { readonly cwd: string; readonly environment: NodeJS.ProcessEnv },
): Promise<CommandOutput> {
  try {
    const output = await execFile(command, [...arguments_], {
      cwd: options.cwd,
      env: options.environment,
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
      shell: process.platform === 'win32',
    })
    return { stdout: output.stdout, stderr: output.stderr }
  } catch (error: unknown) {
    const failure = error as { readonly message?: unknown; readonly stdout?: unknown; readonly stderr?: unknown }
    const stdout = typeof failure.stdout === 'string' ? failure.stdout : ''
    const stderr = typeof failure.stderr === 'string' ? failure.stderr : ''
    const message = typeof failure.message === 'string' ? failure.message : String(error)
    throw new Error(`Command failed: ${command} ${arguments_.join(' ')}\n${message}\n${stdout}\n${stderr}`)
  }
}

function parseRunnerEvidence(stdout: string): {
  readonly readPath: string
  readonly approvals: number
  readonly appliedStatus: string
  readonly staleStatus: string
  readonly jobState: string
  readonly researchStatus: string
  readonly mermaidRendererStatus: string
  readonly drawioRendererStatus: string
  readonly drawnixRendererStatus: string
  readonly circuitikzRendererStatus: string
  readonly legacyProviderToolMissing: boolean
} {
  const line = stdout.trim().split(/\r?\n/u).at(-1)
  if (line === undefined) {
    throw new Error('The DSH ToolRuntime acceptance runner produced no evidence.')
  }
  return JSON.parse(line) as {
    readonly readPath: string
    readonly approvals: number
    readonly appliedStatus: string
    readonly staleStatus: string
    readonly jobState: string
    readonly researchStatus: string
    readonly mermaidRendererStatus: string
    readonly drawioRendererStatus: string
    readonly drawnixRendererStatus: string
    readonly circuitikzRendererStatus: string
    readonly legacyProviderToolMissing: boolean
  }
}

function assertContains(value: string, expected: string, message: string): void {
  assert(value.includes(expected), message)
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

const formulaFixture = '# Formula\n\\( x^2 + y^2 \\)\n'

const profileOverlay = `- id: notemd-vault
  config:
    workspaceRoot: !!js process.env.NOTEMD_ACCEPTANCE_WORKSPACE

- id: notemd-jobs
  config:
    workspaceRoot: !!js process.env.NOTEMD_ACCEPTANCE_WORKSPACE
    concurrency: 2

- id: notemd-approval
  config:
    workspaceRoot: !!js process.env.NOTEMD_ACCEPTANCE_WORKSPACE
    approvalTtlMs: 300000

- id: notemd-artifacts
  config:
    workspaceRoot: !!js process.env.NOTEMD_ACCEPTANCE_WORKSPACE
`

const runtimeAcceptanceRunner = String.raw`import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { Context, Service } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import LlmRuntime, { CallId } from '@deepseek-ai/dsh-llm'
import WebRuntime from '@deepseek-ai/dsh-web'
import { LocalSubprocessRuntime } from '@deepseek-ai/dsh-subprocess-local'

import NotemdArtifactsService from 'dsh-notemd/artifacts'
import NotemdJobsService from 'dsh-notemd/jobs'
import NotemdKnowledgeService from 'dsh-notemd/knowledge'
import NotemdTextTransformerService from 'dsh-notemd/llm'
import NotemdResearchService from 'dsh-notemd/research'
import NotemdVaultLocalService from 'dsh-notemd/vault-local'
import NotemdWorkspaceChangeService from 'dsh-notemd/workspace-changes'
import NotemdWorkflowsService from 'dsh-notemd/workflows'
import { NotemdApprovalGateService, NotemdApprovalLedgerService } from 'dsh-notemd/approval'
import { apply as applyTools, inject as toolsInject } from 'dsh-notemd/tools'

class AllowOnceApprovalService extends Service {
  requests = []

  constructor(ctx) {
    super(ctx, 'approval')
  }

  async request(request) {
    this.requests.push({ reason: request.reason, toolName: request.toolName })
    return 'allowed-once'
  }
}

const workspaceRoot = process.env.NOTEMD_ACCEPTANCE_WORKSPACE
assert(typeof workspaceRoot === 'string' && workspaceRoot.length > 0, 'The acceptance workspace is unavailable.')

const ctx = new Context()
await ctx.plugin(LlmRuntime)
await ctx.plugin(WebRuntime, {})
await ctx.plugin(LocalSubprocessRuntime)
await ctx.plugin(SystemPrompt, {})
await ctx.plugin(ToolRuntime, { mode: 'native' })
await ctx.plugin(AllowOnceApprovalService)
await ctx.plugin(NotemdVaultLocalService, { workspaceRoot })
await ctx.plugin(NotemdApprovalLedgerService, { workspaceRoot, approvalTtlMs: 300000 })
await ctx.plugin(NotemdApprovalGateService)
await ctx.plugin(NotemdWorkspaceChangeService, { scanIntervalMs: 5000 })
await ctx.plugin(NotemdTextTransformerService, {
  provider: 'deepseek',
  model: 'deepseek-chat',
  maxTokens: 1024,
  promptPolicyId: 'notemd.acceptance.v1',
})
await ctx.plugin(NotemdWorkflowsService)
await ctx.plugin(NotemdResearchService, { workspaceRoot })
await ctx.plugin(NotemdJobsService, { workspaceRoot, concurrency: 2 })
await ctx.plugin(NotemdKnowledgeService)
await ctx.plugin(NotemdArtifactsService, { workspaceRoot })
await ctx.plugin(Object.assign(applyTools, { inject: toolsInject }))

let callNumber = 0
const approvalAgent = { id: 'notemd-acceptance' }

async function invoke(name, arguments_, agent) {
  const result = await ctx.tools.execute({
    callId: CallId('notemd-acceptance-' + ++callNumber),
    name,
    arguments: arguments_,
    signal: AbortSignal.timeout(10000),
    ...(agent === undefined ? {} : { agent }),
  })
  assert(result.isError === false && Object.hasOwn(result, 'value'), 'Tool failed: ' + name + ' ' + JSON.stringify(result))
  return result.value
}

const read = await invoke('notemd_workspace_read', { path: 'notes/architecture.md' })
assert(read.document.path === 'notes/architecture.md', 'The read Tool did not return the fixture document.')

const legacyProviderToolMissing = await toolIsMissing('notemd_provider_diagnostic')
assert(legacyProviderToolMissing, 'The default DSH bridge unexpectedly registered a legacy provider diagnostic Tool.')
const research = await invoke('notemd_research_discover', { query: 'research capability test', maxResults: 1 })
assert(research.status === 'unavailable' && research.code === 'capability-unavailable', 'The empty DSH web runtime did not report research as unavailable.')
const mermaidRenderStatus = await invoke('notemd_mermaid_render_status', {})
const drawioRenderStatus = await invoke('notemd_drawio_render_status', {})
const drawnixRenderStatus = await invoke('notemd_drawnix_render_status', {})
const circuitikzRenderStatus = await invoke('notemd_circuitikz_render_status', {})
const genericExportToolMissing = await toolIsMissing('notemd_artifact_export_status')
assert(mermaidRenderStatus.status === 'success' && mermaidRenderStatus.capability.status === 'available', 'The core bundle did not load the Mermaid renderer.')
assert(genericExportToolMissing, 'The generic document export Tool must not be registered.')
assert(drawioRenderStatus.status === 'success' && ['available', 'unavailable'].includes(drawioRenderStatus.capability.status), 'The Draw.io capability Tool returned an invalid result: ' + JSON.stringify(drawioRenderStatus))
assert(drawnixRenderStatus.status === 'success' && ['available', 'unavailable'].includes(drawnixRenderStatus.capability.status), 'The Drawnix capability Tool returned an invalid result: ' + JSON.stringify(drawnixRenderStatus))
assert(circuitikzRenderStatus.status === 'success' && ['available', 'unavailable'].includes(circuitikzRenderStatus.capability.status), 'The Circuitikz capability Tool returned an invalid result: ' + JSON.stringify(circuitikzRenderStatus))

const slidevSourceSpec = {
  version: 1,
  title: 'Approval Lifecycle',
  source: { path: read.document.path, revision: read.document.revision },
  theme: 'default',
}
const slidevSourceStatus = await invoke('notemd_slidev_source_status', {})
const slidevHtmlStatus = await invoke('notemd_slidev_html_export_status', {})
const slidevPdfStatus = await invoke('notemd_slidev_pdf_export_status', {})
const slidevPngStatus = await invoke('notemd_slidev_png_export_status', {})
const slidevPptxStatus = await invoke('notemd_slidev_pptx_export_status', {})
const slidevMp4Status = await invoke('notemd_slidev_mp4_export_status', {})
assert(slidevSourceStatus.status === 'success' && slidevSourceStatus.capability.status === 'available', 'Slidev source preparation is not available.')
for (const status of [slidevHtmlStatus, slidevPdfStatus, slidevPngStatus, slidevPptxStatus, slidevMp4Status]) {
  assert(status.status === 'success' && ['available', 'unavailable'].includes(status.capability.status), 'Slidev export capability returned an invalid result: ' + JSON.stringify(status))
}
const slidevSourcePlan = await invoke('notemd_plan_slidev_source', { spec: slidevSourceSpec })
assert(slidevSourcePlan.status === 'success', 'The installed Slidev source Tool did not create a proposal.')
assert(slidevSourcePlan.plan.mutations.some(mutation => mutation.destination.endsWith('/slides.md')), 'The Slidev source proposal omitted prepared Markdown.')

const artifact = await invoke('notemd_plan_mermaid_artifact', {
  spec: {
    schemaFamily: 'diagram-spec',
    version: 2,
    title: 'Approval Lifecycle',
    source: { path: read.document.path, revision: read.document.revision },
    evidenceRefs: [],
    generation: {
      promptPolicyId: 'notemd.acceptance.mermaid.v2',
      provider: 'deepseek',
      model: 'deepseek-chat',
    },
    rendererIntent: { theme: 'light', fontFamily: 'Inter' },
    canonicalTarget: 'mermaid',
    graph: {
      intent: 'flowchart',
      nodes: [{ id: 'plan', label: 'Plan' }, { id: 'apply', label: 'Apply' }],
      edges: [{ from: 'plan', to: 'apply', label: 'approved' }],
    },
  },
})
assert(artifact.status === 'success', 'The installed Mermaid planning Tool did not create an artifact proposal.')
assert(artifact.plan.mutations.some(mutation => mutation.destination.endsWith('/diagram.mmd')), 'The Mermaid artifact proposal omitted its canonical source.')
assert(artifact.plan.mutations.some(mutation => mutation.destination.endsWith('/preview.svg')), 'The Mermaid artifact proposal omitted its SVG preview.')

const drawioArtifact = await invoke('notemd_plan_drawio_artifact', {
  spec: {
    schemaFamily: 'diagram-spec',
    version: 2,
    title: 'Approval Lifecycle',
    source: { path: read.document.path, revision: read.document.revision },
    evidenceRefs: [],
    generation: {
      promptPolicyId: 'notemd.acceptance.drawio.v2',
      provider: 'deepseek',
      model: 'deepseek-chat',
    },
    rendererIntent: { theme: 'light', fontFamily: 'Inter' },
    canonicalTarget: 'drawio',
    graph: {
      intent: 'flowchart',
      nodes: [{ id: 'plan', label: 'Plan' }, { id: 'apply', label: 'Apply' }],
      edges: [{ from: 'plan', to: 'apply', label: 'approved' }],
    },
  },
})
assert(drawioArtifact.status === 'success', 'The installed Draw.io planning Tool did not create an artifact proposal.')
assert(drawioArtifact.plan.mutations.some(mutation => mutation.destination.endsWith('/diagram.drawio')), 'The Draw.io artifact proposal omitted its canonical XML source.')
assert(drawioArtifact.plan.mutations.some(mutation => mutation.destination.endsWith('/preview.svg')), 'The Draw.io artifact proposal omitted its labelled SVG projection.')

const jobStarted = await invoke('notemd_job_start_formula_repair', {
  idempotencyKey: 'acceptance-formula-repair',
  targets: ['notes/formula.md'],
})
assert(typeof jobStarted.job.id === 'string', 'The formula planning job did not create a durable record.')
const completedJob = await waitForJob(jobStarted.job.id)
assert(completedJob.state === 'completed', 'The formula planning job ended in state ' + completedJob.state + '.')
assert(completedJob.results[0]?.checkpoint?.proposalId !== undefined, 'The formula planning job did not persist a mutation proposal checkpoint.')

const planned = await invoke('notemd_plan_formula_repair', { path: 'notes/formula.md' })
const plan = planned.plan
assert(Array.isArray(plan.mutations) && plan.mutations.length === 1, 'Formula planning did not return one mutation.')
assert(plan.mutations[0]?.kind === 'write-text' && plan.mutations[0].content.includes('$x^2 + y^2$'), 'Formula planning did not normalize delimiters.')

const approval = await invoke('notemd_request_plan_approval', { plan }, approvalAgent)
assert(approval.status === 'success' && typeof approval.approvalId === 'string', 'The approval Tool did not issue a receipt.')
assert(ctx.approval.requests.length === 1, 'The approval seam did not receive the plan approval request.')
assert(!ctx.approval.requests[0].reason.includes('x^2 + y^2'), 'The approval reason exposed planned content.')

const applied = await invoke('notemd_apply_approved_plan', { plan, approvalId: approval.approvalId }, approvalAgent)
assert(applied.status === 'success' && applied.receipt.status === 'committed', 'The approved formula proposal was not applied.')
assert(applied.change?.origin === 'notemd-mutation-receipt', 'The approved formula proposal did not publish a workspace change.')

const formulaPath = join(workspaceRoot, 'notes', 'formula.md')
const normalized = await readFile(formulaPath, 'utf8')
assert(normalized.includes('$x^2 + y^2$'), 'The applied formula plan did not persist its normalized content.')

const staleCandidate = await invoke('notemd_plan_formula_repair', { path: 'notes/formula.md' })
const stalePlan = staleCandidate.plan
await writeFile(formulaPath, '# Formula\n\\( manual update \\)\n', 'utf8')
const staleApproval = await invoke('notemd_request_plan_approval', { plan: stalePlan }, approvalAgent)
const staleApply = await invoke('notemd_apply_approved_plan', {
  plan: stalePlan,
  approvalId: staleApproval.approvalId,
}, approvalAgent)
assert(staleApply.status === 'conflict' && staleApply.receipt.status === 'conflict', 'A stale mutation proposal overwrote the changed document.')
assert((await readFile(formulaPath, 'utf8')).includes('manual update'), 'The stale mutation proposal changed the newer document.')

process.stdout.write(JSON.stringify({
  readPath: read.document.path,
  approvals: ctx.approval.requests.length,
  appliedStatus: applied.receipt.status,
  staleStatus: staleApply.receipt.status,
  jobState: completedJob.state,
  researchStatus: research.status,
  mermaidRendererStatus: mermaidRenderStatus.capability.status,
  drawioRendererStatus: drawioRenderStatus.capability.status,
  drawnixRendererStatus: drawnixRenderStatus.capability.status,
  circuitikzRendererStatus: circuitikzRenderStatus.capability.status,
  legacyProviderToolMissing,
}) + '\n')

async function toolIsMissing(name) {
  try {
    const result = await ctx.tools.execute({
      callId: CallId('notemd-acceptance-' + ++callNumber),
      name,
      arguments: {},
      signal: AbortSignal.timeout(10000),
    })
    return result.isError === true
  } catch {
    return true
  }
}

async function waitForJob(id) {
  const deadline = Date.now() + 5000
  let latestState = 'missing'
  while (Date.now() < deadline) {
    const status = await invoke('notemd_job_status', { jobId: id })
    if (status.job !== null) {
      latestState = status.job.state
      if (['completed', 'cancelled', 'failed'].includes(status.job.state)) return status.job
    }
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('The formula planning job did not settle within 5000ms; last state: ' + latestState + '.')
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
`

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void acceptDshProfile().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
