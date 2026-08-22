# DSH NoteMD Mermaid and Diagram Contract Phase

> Chinese version: 2026-08-22-dsh-notemd-mermaid-diagram-contract.zh-CN.md

**Goal:** Close the non-Drawnix semantic parity gap identified by the Phase 17 audit without importing Obsidian host behavior, provider cache policy, or native renderer ownership.

**Source lock:** `ref/obsidian-NotEMD@07c629c6f99a1171a6a63eaf50ddb0dce0f5fed5`; portable source paths are `src/diagram/adapters/mermaid/normalize.ts`, `src/diagram/adapters/mermaid/validator.ts`, `src/diagram/diagramTypeCatalog.ts`, and the timeline/swimlane/quadrant Mermaid adapters. The source checkout remains read-only and Drawnix paths remain excluded.

**Architecture:** `@notemd-harness/mermaid` owns deterministic Mermaid normalization, closed-fence extraction, family detection, ER repairs, and semantic source rendering. `@notemd-harness/artifacts` owns a versioned three-axis diagram catalog and intent payload validation. Existing `DiagramSpec/v2`, renderer packages, approval, and DSH provider seams remain authoritative.

## Task 1: Lock the portable source semantics

- [x] Add `fixtures/migration/mermaid-normalization-lock.json` with the source commit, accepted semantics, exclusions, and fixture path.
- [x] Add the ER brace-less fixture and tests for BOM/line endings, fences, families, ER repair, and unclosed-fence diagnostics.
- [x] Exclude source Mermaid runtime initialization, legacy LLM/debug stages, Obsidian preview, and Drawnix behavior.

## Task 2: Implement deterministic normalization

- [x] Add `packages/notemd-mermaid` with strict TypeScript package boundaries.
- [x] Normalize BOM and line endings, preserve prose, extract only closed blocks, report unclosed fences, detect the source family set, repair brace-less ER entities and truncated cardinality, and leave unknown families explicit.
- [x] Add the deterministic normalization preflight to `planMermaidRepair` and `planBatchMermaidRepair`; only invalid normalized content reaches the LLM repair path.
- [x] Preserve the existing approval-gated mutation path and emit `mermaid.normalize` provenance for deterministic writes.

## Task 3: Implement the three-axis diagram contract

- [x] Add `diagram-catalog@1` and `diagram-intent@1` contracts under `packages/notemd-artifacts/src/diagram-catalog.ts`.
- [x] Keep semantic type, render target, and export format as independent fields; reject incompatible combinations, unknown fields, empty payloads, invalid quadrant coordinates, and malformed timeline/swimlane/quadrant payloads.
- [x] Record `svg-preview` as an explicit derivative. It is never treated as native Draw.io, Drawnix, Circuitikz, PPTX, or MP4 output.

## Task 4: Add executable semantic source adapters

- [x] Add `renderMermaidIntent()` for validated timeline, swimlane, and quadrant payloads with deterministic sanitization and stable identifiers.
- [x] Keep existing `@notemd-harness/render-mermaid` graph renderer and `DiagramSpec/v2` unchanged; the new adapter is a source contract boundary, not a second renderer authority.
- [x] Add focused tests for source output, collision-safe identifiers, and the explicit SVG derivative contract.

## Task 5: Release evidence

- [x] Run fresh root typecheck, lint, full test suite, coverage, build, packed-bundle verification, clean DSH acceptance, and diff checks serially.
- [x] Update the bilingual architecture audit, implementation plan, and migration progress with exact source locks, changed files, tests, limitations, and rejected alternatives.
- [x] Commit and push `main` non-force; verify local and remote SHA parity and a clean worktree at `bd6375998d91013f7b860b830afaa905b72bd285`.

## Rejected alternatives

- Do not copy `mermaidProcessor.ts` legacy stages wholesale; those stages combine host/runtime and LLM/debug behavior.
- Do not add a generic renderer selector or mode flag; render target and export format remain separate validated fields.
- Do not make SVG a universal fidelity claim; it remains an explicitly labelled preview derivative.
- Do not implement Drawnix, provider response cache, or Obsidian gallery/preview in this phase.
