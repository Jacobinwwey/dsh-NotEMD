# NoteMD Harness Next-Level Runtime Design

**Status:** approved for implementation

## Intent

Extend the standalone bundle with durable, named *planning* jobs, explicit recovery, incremental knowledge synchronization, generic OpenAI-compatible provider observability, and honest optional-capability reporting. The work preserves the existing authority boundary:

```text
read snapshot -> immutable WritePlan -> user approval -> per-file atomic apply -> change notification -> index synchronization
```

Jobs never apply plans. A completed job may contain one or more immutable plans, but every plan still requires its own approval and `notemd_apply_approved_plan` call.

## Non-goals

- Porting Obsidian commands, UI state, `TFile`, editor state, or `requestUrl` transports.
- A generic `notemd_run(type, options)` entry point or a filesystem-write Tool.
- Automatic resumption that performs model calls after a restart.
- Claiming browser, native renderer, Slidev, PPTX, PDF, SVG/PNG, or Tectonic support without an explicitly installed provider.
- Treating an in-memory notification bus as a durable event-sourcing audit trail.

## Runtime Topology

```text
notemdWorkspaceChanges
  |-- WorkspaceChangeCoordinator (snapshot, ordered publication, external scan)
  |-- WorkspaceChangeBus
  `-- periodic scan owned by the bundle service

notemdKnowledge
  |-- VaultKnowledgeIndex
  `-- IncrementalKnowledgeSynchronizer <- WorkspaceChangeBus

notemdJobs
  |-- FileJobStore (records/checkpoints/recovery)
  `-- named planning executors -> WorkflowPlanner -> immutable WritePlan checkpoints

notemdTextTransformer
  `-- OpenAiCompatibleAdapter (complete, diagnose, discoverModels)
```

`notemd_apply_approved_plan` is the only mutation path. After it returns successful `created` or `updated` results, it reports a `notemd-approved-plan` change with the plan id and digest as causation metadata. The change coordinator updates its snapshot and publishes the event. The knowledge synchronizer reads affected documents afresh and performs `upsert` or `remove`; it never trusts event payloads as content.

External edits are reconciled by a periodic Vault scan. The scanner is intentionally polling-based: `fs.watch` does not offer the cross-platform delivery guarantees required for the safety boundary. Its cost is O(number of Markdown notes) per interval, so the default is conservative and the interval is deployment configuration, not a user-facing Tool toggle.

## Durable Named Jobs

`FileJobStore` records a validated `workflow` name, target checkpoints, attempt count, and lifecycle state. A checkpoint is emitted only after a target has completed planning and can hold a JSON-safe immutable `WritePlan`. The lifecycle is:

```text
queued -> running -> completed | failed
                 -> cancelling -> cancelled
running (process interrupted) -> queued
cancelling (process interrupted) -> cancelled
```

At service startup, `recoverInterrupted()` changes only interrupted records into an explicitly resumable state. It does not invoke providers or automatically execute jobs. A caller must invoke `notemd_job_resume`; this prevents restart-time cost, unexpected provider calls, and accidental writes.

The bundle exposes separate start operations such as formula repair, Mermaid repair, translation, wiki-link planning, title planning, research synthesis, and concept extraction. The service may internally use a registry of executor objects to resume persisted work, but no public Tool accepts a behavior-selecting `type` argument. A job result contains plans and status only; it cannot carry an approval receipt or cause a Vault mutation.

The store is single-workspace-process safe, not a distributed job scheduler. Two concurrently running DSH instances against the same workspace remain unsupported because JSON-file replacement cannot provide a cross-host execution lease. That limitation is documented rather than hidden behind optimistic locking claims.

## Change Semantics

```ts
export type WorkspaceChangeOrigin = 'notemd-approved-plan' | 'external-scan'

export interface WorkspaceChange {
  readonly path: string
  readonly kind: 'created' | 'updated' | 'deleted'
  readonly revision?: Revision
}

export interface WorkspaceChangeEvent {
  readonly id: string
  readonly occurredAt: string
  readonly origin: WorkspaceChangeOrigin
  readonly causationId: string
  readonly changes: readonly WorkspaceChange[]
}
```

`causationId` is a plan id for approved writes and a generated scan id for external changes. No note content, API key, approval secret, prompt, or agent object is placed into events. The durable approval ledger remains the audit mechanism for permission consumption; event delivery is intentionally best-effort and reconciled by the next scan.

## Provider Observability

The OpenAI-compatible adapter gains two explicit operations:

- `diagnoseProvider()`: sends one bounded plain-text completion, reports endpoint (without credentials/query/fragment), configured model, elapsed time, normalized error code, retryability, and usage when available. Completion text is not returned or stored.
- `discoverModels()`: issues standard OpenAI-compatible `GET /models` only when a configured `modelsEndpoint` exists or the configured completion endpoint ends in `/chat/completions`. Unsupported, unauthorized, malformed, or unavailable discovery becomes a structured `unavailable` result, not a false capability claim.

HTTP diagnostics never include a response body in a `LlmError`. This closes a credential and provider-debug leakage path in the current error normalizer.

Model discovery is advisory. The runtime does not reject a configured model merely because `/models` is disabled or incomplete.

## Optional Artifact Capabilities

Source artifact generation remains fully available. Renderer and export status are exposed through explicit, separate operations that return a stable `unavailable` object when no provider is installed. They do not initiate browser, native process, or renderer dependencies. This is deliberate: the core bundle must remain portable and deterministic.

## Acceptance Rules

1. An interrupted running planning job becomes queued on service recovery, retains completed checkpoints, and resumes only remaining targets after an explicit request.
2. A cancelled running job records cancellation and never applies a plan.
3. An approved write publishes only successful file changes; the knowledge index reads them incrementally.
4. An external create, update, or delete becomes a tagged change after a scan and updates the index.
5. Provider diagnostics and model discovery never expose API keys, authorization headers, response bodies, URL query parameters, or completion text.
6. The packed bundle profile exposes the new services and Tools while retaining clean-profile DSH acceptance.

## Rejected Alternatives

| Alternative | Rejection reason |
| --- | --- |
| Reuse the Obsidian batch progress store | It swallows I/O failures, stores incomplete lifecycle state, and relies on the Obsidian runtime. |
| Let background jobs call `vault.apply` | It breaks approval causality and permits restart-time writes. |
| Use only `fs.watch` | Its behavior is not dependable across the target operating systems and editor save patterns. |
| Copy the source provider registry | The source supports multiple transports; this bundle intentionally owns only a generic OpenAI-compatible boundary. |
| Treat `/models` failure as configuration invalid | Many compatible providers disable discovery while serving configured models correctly. |
