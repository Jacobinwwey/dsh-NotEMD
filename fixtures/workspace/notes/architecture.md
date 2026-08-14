# Atomic Writes

An atomic write makes a new document visible only after its full content has been persisted.

## Revision Safety

Every plan carries the revision it observed. A stale plan is rejected instead of overwriting newer work.
