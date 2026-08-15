export interface OriginalTextOutputLocation {
  destinationFor(sourcePath: string): string
}

export function sourceSiblingOriginalTextOutput(suffix = '_Extracted'): OriginalTextOutputLocation {
  assertSuffix(suffix)
  return Object.freeze({
    destinationFor(sourcePath: string) {
      const extensionStart = sourcePath.toLocaleLowerCase().lastIndexOf('.md')
      const stem = extensionStart > 0 ? sourcePath.slice(0, extensionStart) : sourcePath
      return `${stem}${suffix}.md`
    },
  })
}

export function workspaceMirroredOriginalTextOutput(root: string): OriginalTextOutputLocation {
  const normalizedRoot = normalizeRoot(root)
  return Object.freeze({
    destinationFor(sourcePath: string) {
      return `${normalizedRoot}/${sourcePath}`
    },
  })
}

export function createOriginalTextOutputPath(sourcePath: string, output: OriginalTextOutputLocation): string {
  assertSourcePath(sourcePath)
  const destination = output.destinationFor(sourcePath)
  assertSourcePath(destination)
  return destination
}

function normalizeRoot(root: string): string {
  if (typeof root !== 'string' || root.length === 0 || root.startsWith('/') || root.endsWith('/') || root.includes('\\')) {
    throw new RangeError('Original-text output roots must be relative slash-separated paths.')
  }
  return root
}

function assertSuffix(suffix: string): void {
  if (typeof suffix !== 'string' || suffix.length === 0 || suffix.includes('/') || suffix.includes('\\') || suffix.includes('\u0000')) {
    throw new RangeError('Original-text suffixes must be non-empty filename fragments.')
  }
}

function assertSourcePath(path: string): void {
  if (typeof path !== 'string' || path.length === 0 || path.startsWith('/') || path.includes('\\') || path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new RangeError('Original-text paths must be relative slash-separated workspace paths.')
  }
}
