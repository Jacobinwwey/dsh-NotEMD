# Atomic Workspace Mutations

A mutation proposal binds every destination to the revision that was observed
when the plan was created. The executor must reject a stale revision before it
publishes a workspace change.

## Canonical Lock Ordering

Acquire every destination lock in normalized lexical order before checking any
revision. A batch either observes a coherent set of revisions or reports a
conflict; it must not expose an interleaved partial write.

## Recovery Evidence

The journal records prepared, staged, applying, verified, and committed states.
Recovery replays only a plan whose staged assets still match their digests.
