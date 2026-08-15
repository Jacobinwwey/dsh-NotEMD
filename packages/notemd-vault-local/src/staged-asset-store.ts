import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import {
  createStagedAssetRef,
  type ContentSha256,
  type StagedAssetRef,
} from '@notemd-harness/mutation'

export class StagedAssetIntegrityError extends Error {
  readonly code = 'STAGED_ASSET_INTEGRITY'

  constructor(message: string) {
    super(message)
    this.name = 'StagedAssetIntegrityError'
  }
}

export class StagedAssetStore {
  private constructor(private readonly assetDirectory: string) {}

  static async open(workspaceRoot: string): Promise<StagedAssetStore> {
    const assetDirectory = join(workspaceRoot, '.notemd', 'staging', 'assets')
    return new StagedAssetStore(assetDirectory)
  }

  async stageBytes(bytes: Uint8Array, mediaType: string): Promise<StagedAssetRef> {
    const content = Buffer.from(bytes)
    const stagedAsset = createStagedAssetRef({
      id: `asset-${randomUUID()}`,
      byteLength: content.byteLength,
      mediaType,
      sha256: createBinarySha256(content),
    })

    await writeDurableFile(this.pathFor(stagedAsset), content)
    return stagedAsset
  }

  async readBytes(reference: StagedAssetRef): Promise<Buffer> {
    const stagedAsset = createStagedAssetRef(reference)
    let content: Buffer
    try {
      content = await readFile(this.pathFor(stagedAsset))
    } catch (error) {
      if (isMissingPath(error)) {
        throw new StagedAssetIntegrityError(`Staged asset does not exist: ${stagedAsset.id}`)
      }
      throw error
    }

    if (content.byteLength !== stagedAsset.byteLength || createBinarySha256(content) !== stagedAsset.sha256) {
      throw new StagedAssetIntegrityError(`Staged asset no longer matches its declared digest: ${stagedAsset.id}`)
    }
    return content
  }

  private pathFor(stagedAsset: StagedAssetRef): string {
    return join(this.assetDirectory, stagedAsset.id)
  }
}

export function createBinarySha256(bytes: Uint8Array): ContentSha256 {
  return createHash('sha256').update(bytes).digest('hex')
}

export async function writeDurableFile(destination: string, content: Uint8Array): Promise<void> {
  await mkdir(dirname(destination), { recursive: true })
  const temporaryPath = `${destination}.${process.pid}.${randomUUID()}.notemd-tmp`

  try {
    const handle = await open(temporaryPath, 'wx', 0o600)
    try {
      await handle.writeFile(content)
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(temporaryPath, destination)
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined)
    throw error
  }
}

export async function writeNewDurableFile(destination: string, content: Uint8Array): Promise<void> {
  await mkdir(dirname(destination), { recursive: true })
  const handle = await open(destination, 'wx', 0o600)

  try {
    await handle.writeFile(content)
    await handle.sync()
  } catch (error) {
    await handle.close().catch(() => undefined)
    await rm(destination, { force: true }).catch(() => undefined)
    throw error
  }

  await handle.close()
}

function isMissingPath(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
