# Relationship-aware portable graph projection

## Baseline and architecture

Source: Obsidian NotEMD 1.9.12, commit `0f493b8d3cd60553e5a517660ca1a729ce4acdfc`. DSH already provides approval-gated mutation plans, journaled apply, committed workspace events, durable jobs, artifact lineage and named export capabilities. The strongest applicable gap was the shared graph preview.

The previous projection flattened hierarchy into a three-column input-order grid. Parent-child links were absent, center-to-center arrows ended underneath node rectangles, parallel edges overlapped, self-links had no length, and labels were truncated. Seven renderers shared this failure mechanism.

## Implemented plan

A pure `packages/notemd-artifacts/src/graph-layout.ts` now owns hierarchy placement, bounded relationship-distance optimization and orthogonal route selection. Its SVG consumer displays hierarchy and explicit relations separately, connects at node boundaries, wraps full labels and derives canvas bounds from complete geometry.

Sibling/root swaps accept only strict Manhattan-distance improvement. Without explicit relationships, stable source order is preserved. Routing scores obstruction, overlap, crossings and length; self, parallel and reverse relations receive distinct routes. Layout remains deterministic and does not mutate semantic input.

All seven projection consumers use shared `graphProjectionVersion = '2'`: Mermaid, JSON Canvas, HTML, editable SVG, draw.io, Drawnix and Circuitikz. Canonical semantic/native fingerprints remain unchanged where their output is unchanged; editable SVG's canonical projection legitimately changes.

## Compatibility and host boundaries

- Drawnix semantic JSON retains every node and explicit relation. Native adapter interfaces and approval/job lifecycles remain intact.
- JSON Canvas's native coordinates use a separate implementation; improved SVG preview does not imply native layout parity.
- Browser CSS resolution and SVG-to-PDF conversion from Obsidian depend on DOM/CSSOM and its renderer. DSH does not own that pipeline; named Slidev/native export capabilities remain unchanged.
- DSH durable jobs already append stage results and retain them through interruption/resume. A duplicate session log store would introduce conflicting ownership.
- No preview modal exists here; structured errors remain a consumer responsibility rather than domain-level disclosure state.
- Retrieval searches indexed content refreshed by committed workspace events. README wording was corrected to avoid claiming a fresh vault read on every query.

## Limits and regression evidence

Layout is a bounded heuristic, not a global optimum or a promise of zero crossings. Routing compares the most recent 64 paths; each route candidate is scored against node obstacles. Dense graphs can still be expensive and require a specialist renderer. Text widths use deterministic estimates rather than platform font metrics. A separate annotation row retains labels when no nearby placement is clear.

A 1,500-node hierarchy test guards against recursion overflow. Geometry tests verify deterministic output, unchanged input, coverage, non-overlap, relationship distance improvement, node-boundary routes, self/parallel/reverse relations, complete labels and canvas enclosure.

Windows exposed a fixture issue unrelated to graph semantics: committed LF fixtures were checked out with CRLF, invalidating byte digests. `.gitattributes` now pins fixtures to LF. No historical fixture contents or expected hashes were changed. A new clean `graph-projection-1912-lock.json` records this intake; historical source quarantine evidence remains intact.

Installed-bundle acceptance also caught stale copied manuals. A prepack step now synchronizes both root language manuals into the bundle at the packaging boundary.

## Validation and delivery

- Focused geometry/renderer checks: 25 tests passed.
- Full suite: 66 suites, 262 tests passed.
- Typecheck, lint and build passed.
- Bundle packaging and standalone verification passed.
- `pnpm accept:dsh` passed against a clean disposable profile using DSH 0.1.0-rc.5.
- CI now verifies Linux/Windows tests, build and standalone bundle. Installed-host acceptance remains a separate lane requiring the compatible runtime.

Implementation and local acceptance are complete. This source update follows published 0.1.1; it does not replace registry assets or publish a new package. No GUI, external translation or model calls were used. Existing host runtime, user settings, notes and historical migration evidence were preserved.
