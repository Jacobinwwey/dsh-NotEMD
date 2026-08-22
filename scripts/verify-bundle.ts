import { execFile as executeFile } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const execFile = promisify(executeFile)
const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bundledInternalPackages = [
  '@notemd-harness/artifacts',
  '@notemd-harness/composites',
  '@notemd-harness/documents',
  '@notemd-harness/export-media',
  '@notemd-harness/export-pptx',
  '@notemd-harness/export-slidev',
  '@notemd-harness/jobs',
  '@notemd-harness/knowledge',
  '@notemd-harness/llm-dsh',
  '@notemd-harness/llm-openai-compatible',
  '@notemd-harness/mermaid',
  '@notemd-harness/mutation',
  '@notemd-harness/process',
  '@notemd-harness/research',
  '@notemd-harness/render-circuitikz',
  '@notemd-harness/render-drawio',
  '@notemd-harness/render-drawnix',
  '@notemd-harness/render-editable-svg',
  '@notemd-harness/render-html',
  '@notemd-harness/render-json-canvas',
  '@notemd-harness/render-mermaid',
  '@notemd-harness/render-vega-lite',
  '@notemd-harness/tools',
  '@notemd-harness/vault',
  '@notemd-harness/vault-local',
  '@notemd-harness/workspace-events',
  '@notemd-harness/workflows',
] as const

interface BundleManifest {
  readonly name?: string
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
    await assertCanonicalReadmes(packageRoot, rootDirectory)

    for (const packageName of bundledInternalPackages) {
      const packageDirectory = join(packageRoot, 'node_modules', ...packageName.split('/'))
      await readManifest(join(packageDirectory, 'package.json'))
    }
    await verifyPackagedArtifactSchemaRegistry(packageRoot)
  } finally {
    await rm(extractionRoot, { recursive: true, force: true })
  }

  process.stdout.write(`Verified standalone bundle: ${tarball}\n`)
}

interface PackagedArtifactSchemaRegistry {
  readonly inspectArtifactSchema: (candidate: unknown) => {
    readonly ok: boolean
    readonly diagnostic?: { readonly code?: string }
  }
  readonly diagramCatalog?: {
    readonly schemaFamily: string
    readonly version: number
    readonly entries: readonly unknown[]
  }
  readonly validateDiagramIntent?: (candidate: unknown) => unknown
}

async function verifyPackagedArtifactSchemaRegistry(packageRoot: string): Promise<void> {
  const registryPath = join(packageRoot, 'node_modules', '@notemd-harness', 'artifacts', 'lib', 'index.js')
  const registry = await import(pathToFileURL(registryPath).href) as PackagedArtifactSchemaRegistry
  const validFixtures = [
    { schemaFamily: 'diagram-spec', version: 2 },
    { schemaFamily: 'diagram-lineage', version: 2 },
    { schemaFamily: 'document-export', version: 3 },
  ]
  for (const fixture of validFixtures) {
    const inspection = registry.inspectArtifactSchema(fixture)
    if (!inspection.ok) {
      throw new Error(`Packed artifact schema registry rejected valid fixture ${JSON.stringify(fixture)}.`)
    }
  }

  const invalidInspection = registry.inspectArtifactSchema({ schemaFamily: 'diagram-spec', version: 3 })
  if (invalidInspection.ok || invalidInspection.diagnostic?.code !== 'invalid-combination') {
    throw new Error('Packed artifact schema registry did not reject the invalid diagram-spec@3 combination with a structured diagnostic.')
  }
  if (registry.diagramCatalog?.schemaFamily !== 'diagram-catalog' || registry.diagramCatalog.version !== 1) {
    throw new Error('Packed artifact schema registry did not expose diagram-catalog@1.')
  }
  if (typeof registry.validateDiagramIntent !== 'function') {
    throw new Error('Packed artifact schema registry did not expose diagram-intent@1 validation.')
  }
  registry.validateDiagramIntent({
    schemaFamily: 'diagram-intent',
    version: 1,
    semanticType: 'timeline',
    renderTarget: 'mermaid',
    exportFormat: 'svg-preview',
    payload: { events: [{ id: 'release', date: '2026-08', label: 'Release' }] },
  })
}

async function assertCanonicalReadmes(packageRoot: string, rootDirectory: string): Promise<void> {
  const packageReadme = normalizeLineEndings(await readFile(join(packageRoot, 'README.md'), 'utf8'))
  const rootReadme = normalizeLineEndings(await readFile(join(rootDirectory, 'README.md'), 'utf8'))
  if (packageReadme !== rootReadme) {
    throw new Error('The packaged README.md must be an exact copy of the repository README.md.')
  }

  const packageChineseReadme = normalizeLineEndings(await readFile(join(packageRoot, 'docs', 'README.zh-CN.md'), 'utf8'))
  const rootChineseReadme = normalizeLineEndings(await readFile(join(rootDirectory, 'README.zh-CN.md'), 'utf8'))
  if (packageChineseReadme !== rootChineseReadme) {
    throw new Error('The packaged docs/README.zh-CN.md must be an exact copy of the repository README.zh-CN.md.')
  }
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/gu, '\n')
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
    'package/README.md',
    'package/docs/README.zh-CN.md',
    'package/lib/index.js',
    'package/lib/index.d.ts',
    'package/lib/vault-local.js',
    'package/lib/workspace-changes.js',
    'package/lib/jobs.js',
    'package/lib/knowledge.js',
    'package/lib/artifacts.js',
    'package/lib/research.js',
    'package/lib/llm.js',
    'package/lib/llm-openai-compatible-legacy.js',
    'package/lib/tools.js',
  ]

  for (const requiredEntry of requiredEntries) {
    if (!entries.includes(requiredEntry)) {
      throw new Error(`Bundle is missing required entry: ${requiredEntry}`)
    }
  }

  if (entries.includes('package/README.zh-CN.md')) {
    throw new Error('Bundle must keep the npm canonical README at package/README.md; publish the Chinese document under package/docs/README.zh-CN.md.')
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
  if (manifest.name !== 'dsh-notemd') {
    throw new Error(`Bundle package.json must publish as dsh-notemd, received ${JSON.stringify(manifest.name)}.`)
  }
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
