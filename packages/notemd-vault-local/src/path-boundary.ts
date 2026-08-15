import { mkdir, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'

export interface ResolvedVaultPath {
  relativePath: string
  absolutePath: string
  lockKey: string
}

export class VaultBoundaryError extends Error {
  readonly code = 'VAULT_PATH_ESCAPE'

  constructor(relativePath: string) {
    super(`Vault path escapes the configured workspace: ${relativePath}`)
    this.name = 'VaultBoundaryError'
  }
}

export class VaultPathError extends Error {
  readonly code = 'VAULT_PATH_INVALID'

  constructor(relativePath: string) {
    super(`Vault path is invalid: ${relativePath}`)
    this.name = 'VaultPathError'
  }
}

export class VaultPathBoundary {
  private constructor(private readonly canonicalRoot: string) {}

  static async open(workspaceRoot: string): Promise<VaultPathBoundary> {
    return new VaultPathBoundary(await realpath(workspaceRoot))
  }

  get workspaceRoot(): string {
    return this.canonicalRoot
  }

  lockKey(relativePath: string): string {
    const resolved = this.resolveLexically(relativePath)
    return process.platform === 'win32' ? resolved.absolutePath.toLowerCase() : resolved.absolutePath
  }

  async resolveForRead(relativePath: string): Promise<ResolvedVaultPath> {
    const resolved = this.resolveLexically(relativePath)
    await this.assertExistingAncestorIsContained(resolved.absolutePath, relativePath)
    return resolved
  }

  async resolveForWrite(relativePath: string): Promise<ResolvedVaultPath> {
    const resolved = this.resolveLexically(relativePath)
    await this.assertExistingAncestorIsContained(resolved.absolutePath, relativePath)
    await mkdir(dirname(resolved.absolutePath), { recursive: true })
    await this.assertExistingAncestorIsContained(resolved.absolutePath, relativePath)
    return resolved
  }

  private resolveLexically(relativePath: string): ResolvedVaultPath {
    const normalizedPath = this.normalizeRelativePath(relativePath)
    const absolutePath = resolve(this.canonicalRoot, ...normalizedPath.split('/'))
    const relation = relative(this.canonicalRoot, absolutePath)

    if (relation === '..' || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
      throw new VaultBoundaryError(relativePath)
    }

    return {
      relativePath: normalizedPath,
      absolutePath,
      lockKey: process.platform === 'win32' ? absolutePath.toLowerCase() : absolutePath,
    }
  }

  private normalizeRelativePath(relativePath: string): string {
    const isWindowsDrivePath = /^[a-zA-Z]:[\\/]/u.test(relativePath)
    const segments = relativePath.split('/')

    if (
      relativePath.length === 0 ||
      relativePath.includes('\0') ||
      relativePath.includes('\\') ||
      isAbsolute(relativePath) ||
      isWindowsDrivePath ||
      relativePath.startsWith('//') ||
      segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')
    ) {
      throw new VaultPathError(relativePath)
    }

    return segments.join('/')
  }

  private async assertExistingAncestorIsContained(absolutePath: string, originalPath: string): Promise<void> {
    let candidate = absolutePath

    for (;;) {
      try {
        const canonicalCandidate = await realpath(candidate)
        const relation = relative(this.canonicalRoot, canonicalCandidate)

        if (relation === '..' || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
          throw new VaultBoundaryError(originalPath)
        }

        return
      } catch (error) {
        if (!isMissingPath(error)) {
          throw error
        }

        const parent = dirname(candidate)
        if (parent === candidate) {
          throw new VaultBoundaryError(originalPath)
        }
        candidate = parent
      }
    }
  }
}

function isMissingPath(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
