import { execFile as executeFile } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFile = promisify(executeFile)
const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bundledInternalPackages = [
  '@notemd-harness/artifacts',
  '@notemd-harness/jobs',
  '@notemd-harness/knowledge',
  '@notemd-harness/llm-openai-compatible',
  '@notemd-harness/tools',
  '@notemd-harness/vault',
  '@notemd-harness/vault-local',
  '@notemd-harness/workflows',
] as const

interface BundleManifest {
  readonly dsh?: { readonly bundle?: { readonly patch?: string } }
  readonly bundledDependencies?: readonly string[]
  readonly dependencies?: Readonly<Record<string, string>>
}

export async function verifyBundle(rootDirectory = workspaceRoot): Promise<void> {
  const tarball = await locateTarball(rootDirectory)
  const entries = await listTarballEntries(tarball)
  assertTarballLayout(entries)

  const extractionRoot = await mkdtemp(join(tmpdir(), 'notemd-bundle-'))
  try {
    await execFile('tar', ['-xzf', tarball, '-C', extractionRoot])
    const packageRoot = join(extractionRoot, 'package')
    const manifest = await readManifest(join(packageRoot, 'package.json'))
    assertManifest(manifest)

    for (const packageName of bundledInternalPackages) {
      const packageDirectory = join(packageRoot, 'node_modules', ...packageName.split('/'))
      await readManifest(join(packageDirectory, 'package.json'))
    }
  } finally {
    await rm(extractionRoot, { recursive: true, force: true })
  }

  process.stdout.write(`Verified standalone bundle: ${tarball}\n`)
}

async function locateTarball(rootDirectory: string): Promise<string> {
  const artifactsDirectory = join(rootDirectory, 'artifacts')
  const entries = await readdir(artifactsDirectory, { withFileTypes: true })
  const tarballs = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.tgz'))
    .map((entry) => join(artifactsDirectory, entry.name))

  if (tarballs.length !== 1) {
    throw new Error(`Expected exactly one bundle tarball in ${artifactsDirectory}, found ${tarballs.length}.`)
  }
  return tarballs[0] as string
}

async function listTarballEntries(tarball: string): Promise<readonly string[]> {
  const { stdout } = await execFile('tar', ['-tzf', tarball])
  return stdout.split(/\r?\n/u).filter((entry) => entry.length > 0)
}

function assertTarballLayout(entries: readonly string[]): void {
  const requiredEntries = [
    'package/package.json',
    'package/cordis.patch.yml',
    'package/lib/index.js',
    'package/lib/index.d.ts',
    'package/lib/vault-local.js',
    'package/lib/jobs.js',
    'package/lib/knowledge.js',
    'package/lib/artifacts.js',
    'package/lib/llm.js',
    'package/lib/tools.js',
  ]

  for (const requiredEntry of requiredEntries) {
    if (!entries.includes(requiredEntry)) {
      throw new Error(`Bundle is missing required entry: ${requiredEntry}`)
    }
  }

  for (const packageName of bundledInternalPackages) {
    const packagePath = packageName.split('/').join('/')
    const compiledEntry = `package/node_modules/${packagePath}/lib/index.js`
    if (!entries.includes(compiledEntry)) {
      throw new Error(`Bundle is missing compiled dependency: ${compiledEntry}`)
    }
  }

  const forbiddenEntry = entries.find((entry) => (
    /(^|\/)(?:src|test|ref|fixtures|\.notemd)(?:\/|$)/u.test(entry)
    || /(?:\.tsbuildinfo|\.map)$/u.test(entry)
    || /(^|\/)\.env(?:\.|$)/u.test(entry)
  ))
  if (forbiddenEntry !== undefined) {
    throw new Error(`Bundle contains non-distribution content: ${forbiddenEntry}`)
  }
}

async function readManifest(path: string): Promise<BundleManifest> {
  return JSON.parse(await readFile(path, 'utf8')) as BundleManifest
}

function assertManifest(manifest: BundleManifest): void {
  if (manifest.dsh?.bundle?.patch !== './cordis.patch.yml') {
    throw new Error('Bundle package.json does not declare dsh.bundle.patch.')
  }

  for (const packageName of bundledInternalPackages) {
    if (!manifest.bundledDependencies?.includes(packageName)) {
      throw new Error(`Bundle package.json does not bundle ${packageName}.`)
    }
  }
  if (manifest.dependencies?.minisearch === undefined) {
    throw new Error('Bundle package.json does not declare the MiniSearch runtime dependency.')
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void verifyBundle().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
