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
    assertContains(config.stdout, '@jacobinwwey/notemd-deepseek-harness/workflows', 'DSH config dump does not resolve the workflows module.')

    const profileManifest = JSON.parse(await readFile(join(profileDirectory, 'package.json'), 'utf8')) as {
      readonly dependencies?: Readonly<Record<string, string>>
      readonly dsh?: { readonly profile?: { readonly bundles?: readonly string[] } }
    }
    assert(
      profileManifest.dependencies?.['@jacobinwwey/notemd-deepseek-harness'] !== undefined,
      'The clean profile did not install the NoteMD bundle dependency.',
    )
    assert(
      profileManifest.dsh?.profile?.bundles?.includes('@jacobinwwey/notemd-deepseek-harness') === true,
      'The clean profile did not activate the NoteMD bundle layer.',
    )

    const runnerPath = join(profileDirectory, 'notemd-acceptance-runner.mjs')
    await writeFile(runnerPath, runtimeAcceptanceRunner, 'utf8')
    const result = await runCommand(process.execPath, [runnerPath], { cwd: profileDirectory, environment })
    const evidence = parseRunnerEvidence(result.stdout)
    assert(evidence.readPath === 'notes/architecture.md', 'The installed read Tool returned the wrong fixture path.')
    assert(evidence.approvals === 2, 'The approval bridge did not receive the expected two requests.')
    assert(evidence.appliedStatus === 'updated', 'The approved plan was not applied through the installed ToolRuntime.')
    assert(evidence.staleStatus === 'skipped-stale', 'A stale plan was not rejected by the vault write precondition.')
    assert(evidence.jobState === 'completed', 'The installed formula planning job did not complete.')
    assert(evidence.providerStatus === 'unavailable', 'The installed provider diagnostic did not fail closed without a key.')

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
  readonly providerStatus: string
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
    readonly providerStatus: string
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
`

const runtimeAcceptanceRunner = String.raw`import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { Context, Service } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { CallId } from '@deepseek-ai/dsh-llm'

import NotemdArtifactsService from '@jacobinwwey/notemd-deepseek-harness/artifacts'
import NotemdJobsService from '@jacobinwwey/notemd-deepseek-harness/jobs'
import NotemdKnowledgeService from '@jacobinwwey/notemd-deepseek-harness/knowledge'
import NotemdTextTransformerService from '@jacobinwwey/notemd-deepseek-harness/llm'
import NotemdVaultLocalService from '@jacobinwwey/notemd-deepseek-harness/vault-local'
import NotemdWorkspaceChangeService from '@jacobinwwey/notemd-deepseek-harness/workspace-changes'
import NotemdWorkflowsService from '@jacobinwwey/notemd-deepseek-harness/workflows'
import { NotemdApprovalGateService, NotemdApprovalLedgerService } from '@jacobinwwey/notemd-deepseek-harness/approval'
import { apply as applyTools, inject as toolsInject } from '@jacobinwwey/notemd-deepseek-harness/tools'

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
await ctx.plugin(SystemPrompt, {})
await ctx.plugin(ToolRuntime, { mode: 'native' })
await ctx.plugin(AllowOnceApprovalService)
await ctx.plugin(NotemdVaultLocalService, { workspaceRoot })
await ctx.plugin(NotemdApprovalLedgerService, { workspaceRoot, approvalTtlMs: 300000 })
await ctx.plugin(NotemdApprovalGateService)
await ctx.plugin(NotemdWorkspaceChangeService, { scanIntervalMs: 5000 })
await ctx.plugin(NotemdTextTransformerService, {
  endpoint: 'https://api.deepseek.com/v1/chat/completions',
  model: 'deepseek-chat',
  apiKeyEnv: 'NOTEMD_ACCEPTANCE_UNUSED_KEY',
  timeoutMs: 1000,
})
await ctx.plugin(NotemdWorkflowsService)
await ctx.plugin(NotemdJobsService, { workspaceRoot, concurrency: 2 })
await ctx.plugin(NotemdKnowledgeService)
await ctx.plugin(NotemdArtifactsService)
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

const provider = await invoke('notemd_provider_diagnostic', {})
assert(provider.status === 'unavailable', 'The provider diagnostic should fail closed without an acceptance API key.')
const renderStatus = await invoke('notemd_artifact_render_status', {})
const exportStatus = await invoke('notemd_artifact_export_status', {})
assert(renderStatus.status === 'unavailable', 'The core bundle unexpectedly claimed a portable diagram renderer.')
assert(exportStatus.status === 'unavailable', 'The core bundle unexpectedly claimed a portable export provider.')

const jobStarted = await invoke('notemd_job_start_formula_repair', {
  idempotencyKey: 'acceptance-formula-repair',
  targets: ['notes/formula.md'],
})
assert(typeof jobStarted.job.id === 'string', 'The formula planning job did not create a durable record.')
const completedJob = await waitForJob(jobStarted.job.id)
assert(completedJob.state === 'completed', 'The formula planning job ended in state ' + completedJob.state + '.')
assert(completedJob.results[0]?.checkpoint?.plan?.id !== undefined, 'The formula planning job did not persist a plan checkpoint.')

const planned = await invoke('notemd_plan_formula_repair', { path: 'notes/formula.md' })
const plan = planned.plan
assert(Array.isArray(plan.writes) && plan.writes.length === 1, 'Formula planning did not return one write.')
assert(plan.writes[0].content.includes('$x^2 + y^2$'), 'Formula planning did not normalize delimiters.')

const approval = await invoke('notemd_request_plan_approval', { plan }, approvalAgent)
assert(approval.approved === true && typeof approval.approvalId === 'string', 'The approval Tool did not issue a receipt.')
assert(ctx.approval.requests.length === 1, 'The approval seam did not receive the plan approval request.')
assert(!ctx.approval.requests[0].reason.includes('x^2 + y^2'), 'The approval reason exposed planned content.')

const applied = await invoke('notemd_apply_approved_plan', { plan, approvalId: approval.approvalId }, approvalAgent)
assert(applied.results[0].status === 'updated', 'The approved formula plan was not applied.')
assert(applied.change?.origin === 'notemd-approved-plan', 'The approved formula plan did not publish a workspace change.')

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
assert(staleApply.results[0].status === 'skipped-stale', 'A stale plan overwrote the changed document.')
assert((await readFile(formulaPath, 'utf8')).includes('manual update'), 'The stale plan changed the newer document.')

process.stdout.write(JSON.stringify({
  readPath: read.document.path,
  approvals: ctx.approval.requests.length,
  appliedStatus: applied.results[0].status,
  staleStatus: staleApply.results[0].status,
  jobState: completedJob.state,
  providerStatus: provider.status,
}) + '\n')

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
