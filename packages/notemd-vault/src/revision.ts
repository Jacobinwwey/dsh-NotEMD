import { createHash } from 'node:crypto'

export type Revision = string
export type ExpectedRevision = Revision | 'absent'

export interface VaultDocument {
  path: string
  content: string
  revision: Revision
}

export interface NotemdVault {
  listMarkdown(signal?: AbortSignal): Promise<readonly string[]>
  read(path: string, signal?: AbortSignal): Promise<VaultDocument>
}

export function createRevision(content: string): Revision {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}
