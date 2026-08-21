# Notemd DeepSeek Harness Bundle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Deliver a standalone, installable DeepSeek Harness bundle that migrates Notemd portable note-workflow semantics without importing the Obsidian runtime.

**Architecture:** Focused packages own Vault contracts and provider, durable jobs, derived knowledge, workflow planning, artifacts, and an OpenAI-compatible adapter. A thin Harness bridge owns Cordis services and authority-separated Tools; the publishable bundle carries their patch layer.

**Tech Stack:** Node.js 22.19.0+, pnpm 10, TypeScript, Vitest, MiniSearch, native Node filesystem APIs, DeepSeek Harness 0.1.0-rc.5 source contracts, Cordis, and @deepseek-ai/dsh-tools.

## Global Constraints

- Work only in this repository; the source plugin at E:/convert/undo/obsidian-NoteMD_new remains read-only.
- Keep ref/ ignored and use ref/deepseek-harness commit 47f943859bef60e4160492346772ded9b24f765a as the DSH integration reference.
- Require Node >=22.19.0 and run pnpm through a shell that activates fnm v22.19.0.
- Treat @deepseek-ai/cordis 4.0.1 and @deepseek-ai/dsh-tools 0.1.0-rc.5 as runtime peers verified from ref/deepseek-harness; do not claim public-registry installation while those upstream packages are unavailable there.
- Do not import Obsidian, App, TFile, Notice, editor state, or command registration in production packages.
- Validate paths once at the vault boundary; every write requires an exact revision or an absent-file precondition.
- Store workspace state only in .notemd/ and machine state only in DSH_HOME/data/notemd/.
- Keep read, plan, write, artifact, and job observation as separate Tool operations. A write consumes an approval bound to one immutable plan digest.
- Baseline artifacts are portable source and manifests. Browser preview, Slidev, PPTX, PDF, SVG/PNG rendering, native process execution, and Tectonic remain optional providers.
- Do not commit secrets, access tokens, absolute user-machine paths, or ref/ contents.
- Follow red-green-refactor for every behavior: write a failing test, observe it fail, implement the minimum, rerun focused tests, then rerun the package suite.

## Package Map

- packages/notemd-vault: immutable revision, document, write-plan, and result contracts.
- packages/notemd-vault-local: containment-checked atomic filesystem provider.
- packages/notemd-jobs: idempotent persistent jobs and bounded cancellation-aware runner.
- packages/notemd-knowledge: MiniSearch-derived index rebuilt from the Vault.
- packages/notemd-workflows: plan-only note transformations and deterministic repairs.
- packages/notemd-artifacts: DiagramSpec and source artifact manifests.
- packages/notemd-llm-openai-compatible: fetch, SSE, cache, diagnostics, and stable LLM errors.
- packages/notemd-tools: Cordis service adapters and DSH Tool registrations.
- packages/notemd-bundle: installable DSH bundle, patch, profile sample, and runtime glue.

---

### Task 1: Bootstrap the Reproducible Workspace

**Files:**
- Create: package.json
- Create: pnpm-workspace.yaml
- Create: tsconfig.base.json
- Create: vitest.config.ts
- Create: .npmrc
- Create: packages/*/package.json
- Create: packages/*/tsconfig.json
- Create: fixtures/workspace/notes/architecture.md
- Test: packages/notemd-vault/test/revision.contract.test.ts

**Interfaces:**
- Produces a pnpm workspace with package names @notemd-harness/vault, @notemd-harness/vault-local, @notemd-harness/jobs, @notemd-harness/knowledge, @notemd-harness/workflows, @notemd-harness/artifacts, @notemd-harness/llm-openai-compatible, @notemd-harness/tools, and dsh-notemd.
- Root scripts are typecheck, test, test:coverage, lint, build, pack:bundle, and verify:bundle.

- [ ] **Step 1: Write the failing workspace discovery test**

~~~ts
import { expect, test } from 'vitest'
import { workspacePackageNames } from '../src/workspace-package-names.js'

test('declares every baseline migration package exactly once', () => {
  expect(workspacePackageNames()).toEqual([
    '@notemd-harness/vault',
    '@notemd-harness/vault-local',
    '@notemd-harness/jobs',
    '@notemd-harness/knowledge',
    '@notemd-harness/workflows',
    '@notemd-harness/artifacts',
    '@notemd-harness/llm-openai-compatible',
    '@notemd-harness/tools',
    'dsh-notemd',
  ])
})
~~~

- [ ] **Step 2: Run the focused test and observe the missing-module failure**

Run: pnpm --filter @notemd-harness/vault test -- revision.contract.test.ts

Expected: FAIL because the workspace package and its module do not exist.

- [ ] **Step 3: Add the root toolchain and package manifests**

Use TypeScript strict mode, NodeNext module resolution, Vitest, and pnpm workspace ranges. Root package.json declares:

~~~json
{
  "engines": { "node": ">=22.19.0" },
  "packageManager": "pnpm@10.7.1",
  "scripts": {
    "typecheck": "tsc -b --pretty false",
    "test": "vitest run",
    "lint": "eslint . --max-warnings 0",
    "build": "pnpm typecheck && pnpm --recursive --if-present run build",
    "pack:bundle": "pnpm --filter dsh-notemd pack",
    "verify:bundle": "tsx scripts/verify-bundle.ts"
  }
}
~~~

- [ ] **Step 4: Implement the package-name module and fixture workspace**

~~~ts
export function workspacePackageNames(): readonly string[] {
  return [
    '@notemd-harness/vault',
    '@notemd-harness/vault-local',
    '@notemd-harness/jobs',
    '@notemd-harness/knowledge',
    '@notemd-harness/workflows',
    '@notemd-harness/artifacts',
    '@notemd-harness/llm-openai-compatible',
    '@notemd-harness/tools',
    'dsh-notemd',
  ]
}
~~~

- [ ] **Step 5: Verify bootstrap**

Run: pnpm install

Run: pnpm --filter @notemd-harness/vault test -- revision.contract.test.ts

Expected: the focused test passes and pnpm-lock.yaml records no private DSH registry dependency.

- [ ] **Step 6: Commit the bootstrap**

Run: git add package.json pnpm-workspace.yaml tsconfig.base.json vitest.workspace.ts .npmrc pnpm-lock.yaml packages fixtures scripts

Run: git commit -m "build: scaffold notemd harness workspace"

### Task 2: Establish Vault Contracts and the Safe Local Provider

**Files:**
- Create: packages/notemd-vault/src/index.ts
- Create: packages/notemd-vault/src/revision.ts
- Create: packages/notemd-vault-local/src/local-vault.ts
- Create: packages/notemd-vault-local/src/path-boundary.ts
- Create: packages/notemd-vault-local/src/write-lock.ts
- Test: packages/notemd-vault/test/revision.contract.test.ts
- Test: packages/notemd-vault-local/test/local-vault.test.ts

**Interfaces:**

~~~ts
export type Revision = string
export type ExpectedRevision = Revision | 'absent'
export interface VaultDocument { path: string; content: string; revision: Revision }
export interface PlannedWrite { path: string; content: string; expectedRevision: ExpectedRevision }
export interface WritePlan { id: string; digest: string; writes: readonly PlannedWrite[] }
export type WriteStatus = 'created' | 'updated' | 'skipped-stale' | 'rejected' | 'cancelled' | 'failed'
export interface WriteResult { path: string; status: WriteStatus; revision?: Revision; diagnostic?: string }
export interface NotemdVault {
  listMarkdown(signal?: AbortSignal): Promise<readonly string[]>
  read(path: string, signal?: AbortSignal): Promise<VaultDocument>
  apply(plan: WritePlan, signal?: AbortSignal): Promise<readonly WriteResult[]>
}
~~~

- [ ] **Step 1: Write failing vault tests**

~~~ts
test('rejects a path that escapes through a symlink', async () => {
  await expect(vault.read('escape/secret.md')).rejects.toMatchObject({ code: 'VAULT_PATH_ESCAPE' })
})

test('does not overwrite a changed document', async () => {
  const before = await vault.read('notes/a.md')
  await writeFile(join(root, 'notes/a.md'), 'newer')
  const [result] = await vault.apply(planFor('notes/a.md', 'replacement', before.revision))
  expect(result.status).toBe('skipped-stale')
})
~~~

- [ ] **Step 2: Run focused vault tests**

Run: pnpm --filter @notemd-harness/vault-local test -- local-vault.test.ts

Expected: FAIL because LocalVault is missing.

- [ ] **Step 3: Implement deterministic revisions and boundary validation**

Revision is sha256 of UTF-8 content, not timestamp-only state. Path validation rejects absolute paths, empty segments, NUL, and dot-dot segments before filesystem access. Canonical root and canonical existing target or parent must satisfy:

~~~ts
if (candidate !== root && !candidate.startsWith(root + separator)) {
  throw new VaultBoundaryError('VAULT_PATH_ESCAPE', relativePath)
}
~~~

- [ ] **Step 4: Implement atomic writes and per-file serialization**

Each canonical target has one promise-chain lock. Write to a sibling temporary file with mode preservation, re-read the expected revision while holding the lock, then rename with bounded retry for EPERM, EACCES, and ENOTEMPTY. A failed replacement returns failed with its diagnostic; it never falls back to direct truncating write.

- [ ] **Step 5: Verify local vault behavior**

Run: pnpm --filter @notemd-harness/vault-local test -- local-vault.test.ts

Run: pnpm --filter @notemd-harness/vault-local typecheck

Expected: containment, absent-file creation, stale rejection, concurrent writers, and temporary-file cleanup pass.

- [ ] **Step 6: Commit vault providers**

Run: git add packages/notemd-vault packages/notemd-vault-local

Run: git commit -m "feat: add revision-safe local vault provider"

### Task 3: Add Durable Jobs and Derived Knowledge

**Files:**
- Create: packages/notemd-jobs/src/index.ts
- Create: packages/notemd-jobs/src/file-job-store.ts
- Create: packages/notemd-jobs/src/bounded-runner.ts
- Create: packages/notemd-knowledge/src/index.ts
- Create: packages/notemd-knowledge/src/knowledge-index.ts
- Test: packages/notemd-jobs/test/bounded-runner.test.ts
- Test: packages/notemd-knowledge/test/knowledge-index.test.ts

**Interfaces:**

~~~ts
export interface JobTargetResult { target: string; status: 'completed' | 'cancelled' | 'failed'; detail?: string }
export interface JobRecord<I> {
  id: string
  idempotencyKey: string
  input: Readonly<I>
  state: 'queued' | 'running' | 'completed' | 'cancelled' | 'failed'
  results: readonly JobTargetResult[]
}
export interface KnowledgeMatch { path: string; title: string; excerpt: string; score: number }
~~~

- [ ] **Step 1: Write failing job and knowledge tests**

~~~ts
test('returns the original record for the same idempotency key', async () => {
  expect((await jobs.start(input)).id).toBe((await jobs.start(input)).id)
})

test('rebuilds derived matches from vault documents', async () => {
  await index.rebuild()
  expect(await index.search('atomic writes')).toMatchObject([{ path: 'notes/architecture.md' }])
})
~~~

- [ ] **Step 2: Run focused tests**

Run: pnpm --filter @notemd-harness/jobs test -- bounded-runner.test.ts

Run: pnpm --filter @notemd-harness/knowledge test -- knowledge-index.test.ts

Expected: FAIL because neither service exists.

- [ ] **Step 3: Implement persistence and bounded execution**

Persist JSON job records below workspace/.notemd/jobs/. Clone inputs at the edge, cap active promises at configured concurrency, produce exactly one terminal record for every target, and propagate AbortSignal cancellation to pending targets. Do not persist functions, signals, secrets, or mutable caller objects.

- [ ] **Step 4: Implement the MiniSearch index**

Index only VaultDocument values. Store path, title, and stripped Markdown body; rebuild empties the index before reading the vault. A missing indexed path is a stale cache miss, never a read of cached content.

- [ ] **Step 5: Verify durable behavior**

Run: pnpm --filter @notemd-harness/jobs test

Run: pnpm --filter @notemd-harness/knowledge test

Expected: resume, cancellation, bounded concurrency, rebuild, upsert, delete, and ranking tests pass.

- [ ] **Step 6: Commit jobs and knowledge**

Run: git add packages/notemd-jobs packages/notemd-knowledge

Run: git commit -m "feat: add durable jobs and derived knowledge index"

### Task 4: Migrate Workflow Semantics into Plan-Only Operations

**Files:**
- Create: packages/notemd-workflows/src/index.ts
- Create: packages/notemd-workflows/src/plan-factory.ts
- Create: packages/notemd-workflows/src/markdown-transforms.ts
- Create: packages/notemd-workflows/src/concepts.ts
- Create: packages/notemd-workflows/src/mermaid.ts
- Create: packages/notemd-workflows/src/formulas.ts
- Test: packages/notemd-workflows/test/workflow-planning.test.ts
- Test: packages/notemd-workflows/test/markdown-transforms.test.ts

**Interfaces:**

~~~ts
export interface TextCompletion {
  text: string
  model: string
  usage?: { inputTokens: number; outputTokens: number }
}
export interface TextTransformer {
  complete(request: { system: string; prompt: string; signal?: AbortSignal }): Promise<TextCompletion>
}
export interface WorkflowPlanner {
  planWikiLinks(path: string, signal?: AbortSignal): Promise<WritePlan>
  planTranslation(path: string, language: string, signal?: AbortSignal): Promise<WritePlan>
  planTitleGeneration(path: string, signal?: AbortSignal): Promise<WritePlan>
  planResearchSynthesis(path: string, sources: readonly string[], signal?: AbortSignal): Promise<WritePlan>
  planConceptExtraction(path: string, signal?: AbortSignal): Promise<WritePlan>
  planMermaidRepair(path: string, signal?: AbortSignal): Promise<WritePlan>
  planFormulaRepair(path: string): Promise<WritePlan>
}
~~~

- [ ] **Step 1: Write failing golden workflow tests**

~~~ts
test('plans Mermaid replacement only inside a mermaid fence', async () => {
  const plan = await workflows.planMermaidRepair('notes/diagram.md')
  expect(plan.writes[0]?.content).toContain('~~~mermaid\nflowchart TD')
  expect(plan.writes[0]?.content).toContain('outside prose remains unchanged')
})

test('creates a concept note with an absent precondition', async () => {
  const plan = await workflows.planConceptExtraction('notes/architecture.md')
  expect(plan.writes).toContainEqual(expect.objectContaining({
    path: 'concepts/Atomic Writes.md',
    expectedRevision: 'absent',
  }))
})
~~~

- [ ] **Step 2: Run the workflow tests**

Run: pnpm --filter @notemd-harness/workflows test -- workflow-planning.test.ts

Expected: FAIL because WorkflowPlanner does not exist.

- [ ] **Step 3: Implement one planner per operation**

The planner reads through NotemdVault, asks TextTransformer only for model-required transformations, and produces immutable WritePlan values. Formula repair is deterministic. Mermaid repair passes only code-fence bodies to the transformer. Concept extraction parses a documented JSON object and rejects malformed response shapes instead of guessing. Duplicate analysis returns a diagnostic plan with no writes until a separate merge plan is requested.

- [ ] **Step 4: Implement plan digesting**

Canonicalize only path, expectedRevision, and content. Sort writes by path and calculate:

~~~ts
const digest = createHash('sha256').update(canonicalJson).digest('hex')
const id = 'notemd-plan-' + digest.slice(0, 20)
~~~

- [ ] **Step 5: Verify source-parity fixtures**

Run: pnpm --filter @notemd-harness/workflows test

Expected: golden fixtures cover links, title generation, translation, research synthesis, concepts, Mermaid, formulas, and duplicate analysis without Obsidian mocks.

- [ ] **Step 6: Commit workflow planning**

Run: git add packages/notemd-workflows fixtures/workspace

Run: git commit -m "feat: add portable note workflow planners"

### Task 5: Add Source Artifacts and an OpenAI-Compatible LLM Adapter

**Files:**
- Create: packages/notemd-artifacts/src/index.ts
- Create: packages/notemd-artifacts/src/diagram-spec.ts
- Create: packages/notemd-artifacts/src/artifact-manifest.ts
- Create: packages/notemd-llm-openai-compatible/src/index.ts
- Create: packages/notemd-llm-openai-compatible/src/sse.ts
- Create: packages/notemd-llm-openai-compatible/src/error.ts
- Create: packages/notemd-llm-openai-compatible/src/cache.ts
- Test: packages/notemd-artifacts/test/artifact-manifest.test.ts
- Test: packages/notemd-llm-openai-compatible/test/streaming.test.ts

**Interfaces:**

~~~ts
export interface DiagramSpec {
  version: 1
  title: string
  intent: 'flowchart' | 'sequence' | 'mindmap' | 'class' | 'er' | 'state'
  source: string
}
export interface ArtifactManifest {
  version: 1
  artifactId: string
  sourcePath: string
  sourceRevision: Revision
  renderer: 'source'
  ownedPaths: readonly string[]
}
export type StreamChunk =
  | { type: 'text'; text: string }
  | { type: 'tool-call'; id: string; name: string; arguments: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'finish'; reason: 'stop' | 'length' | 'tool-calls' }
~~~

- [ ] **Step 1: Write failing artifact and stream tests**

~~~ts
test('never deletes an artifact absent from its manifest', async () => {
  await expect(artifacts.planCleanup('unknown-id')).resolves.toEqual([])
})

test('emits usage before finish for an SSE completion', async () => {
  await expect(collect(adapter.stream(request))).resolves.toEqual([
    { type: 'text', text: 'hello' },
    { type: 'usage', inputTokens: 3, outputTokens: 2 },
    { type: 'finish', reason: 'stop' },
  ])
})
~~~

- [ ] **Step 2: Run focused tests**

Run: pnpm --filter @notemd-harness/artifacts test -- artifact-manifest.test.ts

Run: pnpm --filter @notemd-harness/llm-openai-compatible test -- streaming.test.ts

Expected: FAIL because artifact and adapter modules are missing.

- [ ] **Step 3: Implement portable artifacts**

Validate DiagramSpec before writing source JSON and Markdown companion plans. Include source path, revision, renderer, and exact owned paths in a versioned manifest. Cleanup plans can only list manifest-owned paths under .notemd/artifacts/.

- [ ] **Step 4: Implement the streaming adapter**

Use fetch with AbortSignal, parse SSE frame boundaries incrementally, preserve text and tool-call deltas, emit usage before a single finish chunk, and normalize non-success, malformed-stream, timeout, cancellation, and transport failures to LlmError codes. Cache successful complete responses by a canonical request digest with TTL; never cache cancellation or failures.

- [ ] **Step 5: Verify adapter conformance**

Run: pnpm --filter @notemd-harness/llm-openai-compatible test

Expected: non-streaming JSON, fragmented SSE, tool calls, usage ordering, AbortSignal, retryable diagnostics, and cache behavior pass.

- [ ] **Step 6: Commit artifacts and LLM**

Run: git add packages/notemd-artifacts packages/notemd-llm-openai-compatible

Run: git commit -m "feat: add source artifacts and openai compatible adapter"

### Task 6: Bind Plans to Approval and Expose DSH Services and Tools

**Files:**
- Create: packages/notemd-tools/src/index.ts
- Create: packages/notemd-tools/src/approval-ledger.ts
- Create: packages/notemd-tools/src/notemd-services.ts
- Create: packages/notemd-tools/src/read-tools.ts
- Create: packages/notemd-tools/src/plan-tools.ts
- Create: packages/notemd-tools/src/write-tools.ts
- Create: packages/notemd-tools/src/job-tools.ts
- Create: packages/notemd-tools/src/dsh-shims.d.ts
- Test: packages/notemd-tools/test/approval-ledger.test.ts
- Test: packages/notemd-tools/test/tools.contract.test.ts

**Interfaces:**

~~~ts
export interface ApprovalLedger {
  issue(plan: WritePlan): { planId: string; digest: string; approvalId: string }
  consume(plan: WritePlan, approvalId: string): boolean
}

export interface NotemdServices {
  vault: NotemdVault
  jobs: NotemdJobs
  knowledge: NotemdKnowledge
  workflows: WorkflowPlanner
  artifacts: NotemdArtifacts
}
~~~

- [ ] **Step 1: Write failing authority tests**

~~~ts
test('does not accept an approval for a mutated plan', () => {
  const approval = ledger.issue(originalPlan)
  expect(ledger.consume(mutatedPlan, approval.approvalId)).toBe(false)
})

test('registers a write tool separately from planning tools', () => {
  expect(toolNames).toContain('notemd_plan_translation')
  expect(toolNames).toContain('notemd_apply_approved_plan')
  expect(toolNames).not.toContain('notemd_run')
})
~~~

- [ ] **Step 2: Run focused Tool tests**

Run: pnpm --filter @notemd-harness/tools test -- tools.contract.test.ts

Expected: FAIL because the Tool bridge has not registered the operations.

- [ ] **Step 3: Implement one-time approval binding**

The ledger stores only plan id, digest, issuance time, expiry, and consumed state under workspace/.notemd/approvals/. It never stores content twice or secrets. A write must first call the Harness user-approval bridge, then consume a matching unexpired approval id; reused, expired, unknown, and digest-mismatched approvals return rejected before vault.apply.

- [ ] **Step 4: Implement Cordis services and Tool registrations**

Use the verified DSH public signature:

~~~ts
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const inject = ['tools', 'notemdVault', 'notemdJobs', 'notemdKnowledge', 'notemdWorkflows', 'notemdArtifacts']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'notemd_workspace_read',
    parameters: { path: { type: 'string', required: true } },
    output: {
      schema: { type: 'object' },
      render: (_args, value) => [{ type: 'json', value }],
    },
    execute: async args => ctx.notemdVault.read(args.path),
  }))
}
~~~

Register separate read, plan, write, artifact, job-status, and job-cancel Tools. Each output is a canonical object with explicit per-file status.

- [ ] **Step 5: Verify lifecycle and Tool contracts**

Run: pnpm --filter @notemd-harness/tools test

Expected: fake Cordis context confirms tool registration once, approval consumption survives no reload, provider disposal clears resources, and each Tool schema accepts and rejects expected arguments.

- [ ] **Step 6: Commit the Tool bridge**

Run: git add packages/notemd-tools

Run: git commit -m "feat: expose approval gated harness tools"

### Task 7: Assemble the Installable Bundle and Profile Contract

**Files:**
- Create: packages/notemd-bundle/package.json
- Create: packages/notemd-bundle/cordis.patch.yml
- Create: packages/notemd-bundle/src/index.ts
- Create: packages/notemd-bundle/src/vault-local.ts
- Create: packages/notemd-bundle/src/jobs.ts
- Create: packages/notemd-bundle/src/knowledge.ts
- Create: packages/notemd-bundle/src/tools.ts
- Create: packages/notemd-bundle/src/harness-types.d.ts
- Create: profiles/notemd/package.json
- Create: profiles/notemd/cordis.patch.yml
- Create: scripts/verify-bundle.ts
- Test: packages/notemd-bundle/test/patch.contract.test.ts
- Test: packages/notemd-bundle/test/runtime-adapter.test.ts

**Interfaces:**

~~~yaml
- insert:
    - id: notemd-vault
      name: 'dsh-notemd/vault-local'
      config:
        workspaceRoot: !!js process.cwd()
    - id: notemd-tools
      name: 'dsh-notemd/tools'
      inject: [tools, notemdVault, notemdJobs, notemdKnowledge, notemdWorkflows, notemdArtifacts]
~~~

- [ ] **Step 1: Write failing package and patch tests**

~~~ts
test('declares a DSH bundle patch and ships every referenced module', async () => {
  expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
  await expect(import('dsh-notemd/tools')).resolves.toHaveProperty('apply')
})
~~~

- [ ] **Step 2: Run the focused bundle test**

Run: pnpm --filter dsh-notemd test -- patch.contract.test.ts

Expected: FAIL because no bundle manifest or exports exist.

- [ ] **Step 3: Implement the bundle manifest and patch**

Package exports exactly index, vault-local, jobs, knowledge, artifacts, llm, and tools modules. It declares:

~~~json
{
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } },
  "peerDependencies": {
    "@deepseek-ai/cordis": "^4.0.1",
    "@deepseek-ai/dsh-tools": "0.1.0-rc.5"
  }
}
~~~

Use runtime ESM imports for those peers. Local dsh-shims.d.ts exists only to build while official public npm publication is unavailable; the local source integration test verifies the real exports.

- [ ] **Step 4: Implement self-contained configuration defaults**

The patch supplies every config key for each row. The profile sample points only at fixtures/workspace through a relative DSH expression and contains no keys or absolute machine paths. A user override replaces an entire config object, so documentation includes a complete override example.

- [ ] **Step 5: Verify bundle contents and profile layering**

Run: pnpm pack:bundle

Run: pnpm verify:bundle

Expected: tarball includes compiled modules, types, package.json, and cordis.patch.yml; it excludes source reference, tests, secrets, and mutable state.

- [ ] **Step 6: Commit bundle assembly**

Run: git add packages/notemd-bundle profiles scripts

Run: git commit -m "feat: package standalone notemd harness bundle"

### Task 8: Run Clean-Profile Acceptance and Documentation Closure

**Files:**
- Create: docs/walkthroughs/2026-08-14-notemd-deepseek-harness-validation.md
- Create: docs/walkthroughs/2026-08-14-notemd-deepseek-harness-validation.zh-CN.md
- Modify: README.md
- Create: README.zh-CN.md
- Test: scripts/accept-dsh-profile.ts

**Interfaces:**
- Consumes the packed tarball and ref/deepseek-harness at the pinned commit.
- Produces an isolated temporary DSH_HOME and profile, deleted only after test evidence is recorded.

- [ ] **Step 1: Write a failing clean-profile acceptance test**

~~~ts
test('installs the tarball and exposes notemd tools in a clean profile', async () => {
  const result = await runDsh(['--profile', profile, '--dump-config'], { dshHome })
  expect(result.stdout).toContain('notemd-vault')
  expect(result.stdout).toContain('notemd-tools')
})
~~~

- [ ] **Step 2: Run the acceptance test**

Run: pnpm tsx scripts/accept-dsh-profile.ts

Expected: FAIL before the packed bundle is installable.

- [ ] **Step 3: Prepare the local DSH source runtime**

Install dependencies only under ref/deepseek-harness with pnpm using Node 22.19.0. Run its documented source CLI through pnpm dsh, install the local tarball in a fresh profile, then inspect the resolved patch. Do not modify the cloned source or publish it.

- [ ] **Step 4: Verify lifecycle and real Tool invocation**

Use a clean profile to run dsh plugin add against the tarball, dsh --dump-config, and a Web or headless tool invocation that reads fixture Markdown, plans a formula repair, obtains an approval, applies it, then verifies a stale plan is rejected. Remove the test profile and retain only non-secret test logs.

- [ ] **Step 5: Run final quality gates**

Run: pnpm typecheck

Run: pnpm lint

Run: pnpm test

Run: pnpm build

Run: pnpm pack:bundle

Run: pnpm verify:bundle

Run: pnpm tsx scripts/accept-dsh-profile.ts

Run: git diff --check

Expected: every command exits 0; the validation walkthrough records commands, package versions, DSH reference commit, test counts, and known optional-capability exclusions in English and Chinese.

- [ ] **Step 6: Commit and push only verified work**

Run: git add README.md README.zh-CN.md docs/walkthroughs pnpm-lock.yaml

Run: git commit -m "docs: validate standalone harness bundle"

Run: git remote add origin git@github.com:Jacobinwwey/notemd-deepseek-harness.git

Run: git fetch origin main

Run: git push origin main

Expected: a non-force push happens only after local main is based on or fast-forwards remote main.

## Plan Review

- Spec coverage: Tasks 2 through 7 implement every baseline package, authority-separated Tools, lifecycle-aware services, workspace state boundaries, OpenAI-compatible streaming, artifacts, and package/profile composition. Task 8 exercises packing, clean profile loading, real Tool invocation, stale write protection, and bilingual documentation.
- Deliberate exclusions: Obsidian runtime, UI, preview and renderer process stacks, provider-specific transports other than OpenAI-compatible, and Tectonic remain out of the baseline. The code reports unavailable optional capability rather than silently emulating it.
- Type consistency: Vault produces WritePlan; workflows and artifacts produce plans; the approval ledger consumes the same immutable plan digest; vault.apply returns explicit WriteResult values; DSH Tools expose those canonical values.
- Reference risk: public npm resolution for DSH packages returned 404 during planning. The bundle declares exact peer names and version from the pinned source, while acceptance runs against that source checkout. Do not claim registry-install acceptance until upstream packages are published.
