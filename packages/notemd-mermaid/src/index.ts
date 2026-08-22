import {
  validateDiagramIntent,
  type QuadrantPayload,
  type SwimlanePayload,
  type TimelinePayload,
} from '@notemd-harness/artifacts'

export type MermaidDiagramFamily =
  | 'architecture'
  | 'block'
  | 'c4'
  | 'classDiagram'
  | 'erDiagram'
  | 'flowchart'
  | 'gantt'
  | 'gitGraph'
  | 'journey'
  | 'kanban'
  | 'mindmap'
  | 'packet'
  | 'pie'
  | 'quadrantChart'
  | 'radar'
  | 'requirement'
  | 'sankey'
  | 'sequenceDiagram'
  | 'stateDiagram'
  | 'timeline'
  | 'treemap'
  | 'xyChart'
  | 'zenUML'
  | 'unknown'

export type MermaidNormalizationDiagnosticCode = 'mermaid-unclosed-fence' | 'mermaid-unknown-family'

export interface MermaidNormalizationDiagnostic {
  readonly code: MermaidNormalizationDiagnosticCode
  readonly message: string
  readonly line?: number
}

export interface MermaidBlock {
  readonly marker: '```' | '~~~'
  readonly openingLine: string
  readonly content: string
  readonly closingLine: string
  readonly startLine: number
  readonly endLine: number
  readonly family: MermaidDiagramFamily
}

export interface MermaidDiagramNormalization {
  readonly content: string
  readonly family: MermaidDiagramFamily
  readonly hadFence: boolean
  readonly fence: '```' | '~~~' | null
  readonly diagnostics: readonly MermaidNormalizationDiagnostic[]
}

export interface MermaidMarkdownNormalization {
  readonly content: string
  readonly blocks: readonly MermaidBlock[]
  readonly diagnostics: readonly MermaidNormalizationDiagnostic[]
}

export const canonicalMermaidFence = '```' as const

const MERMAID_FENCE_OPEN = /^(\s*)(```|~~~)\s*\(?\s*mermaid\s*\)?(?:\s+[^\r\n]*)?\s*$/iu
const MERMAID_FENCE_CLOSE = /^(\s*)(```|~~~)\s*$/u

const FAMILY_PREFIXES: readonly (readonly [string, MermaidDiagramFamily])[] = [
  ['architecture-beta', 'architecture'],
  ['block-beta', 'block'],
  ['c4component', 'c4'],
  ['c4container', 'c4'],
  ['c4context', 'c4'],
  ['c4deployment', 'c4'],
  ['c4dynamic', 'c4'],
  ['classdiagram', 'classDiagram'],
  ['erdiagram', 'erDiagram'],
  ['flowchart', 'flowchart'],
  ['graph', 'flowchart'],
  ['gantt', 'gantt'],
  ['gitgraph', 'gitGraph'],
  ['journey', 'journey'],
  ['kanban', 'kanban'],
  ['mindmap', 'mindmap'],
  ['packet-beta', 'packet'],
  ['pie', 'pie'],
  ['quadrantchart', 'quadrantChart'],
  ['radar-beta', 'radar'],
  ['requirementdiagram', 'requirement'],
  ['sankey-beta', 'sankey'],
  ['sequencediagram', 'sequenceDiagram'],
  ['statediagram', 'stateDiagram'],
  ['timeline', 'timeline'],
  ['treemap', 'treemap'],
  ['xychart-beta', 'xyChart'],
  ['zenuml', 'zenUML'],
]

export function normalizeMermaidDiagram(content: string): MermaidDiagramNormalization {
  const normalizedContent = normalizeLineEndings(content).trim()
  if (normalizedContent.length === 0) {
    return Object.freeze({ content: '', family: 'unknown', hadFence: false, fence: null, diagnostics: [] })
  }

  const fenced = readSingleFencedDefinition(normalizedContent)
  const raw = (fenced?.raw ?? normalizedContent).trim()
  const family = detectMermaidFamily(raw)
  const diagnostics = family === 'unknown'
    ? [diagnostic('mermaid-unknown-family', 'Mermaid family could not be identified.')]
    : []
  let normalized = sanitizeMermaidContent(raw)

  if (family === 'erDiagram') {
    normalized = repairBraceLessErEntityBlocks(normalized)
    normalized = repairTruncatedErRelationCardinality(normalized).trim()
  }

  return Object.freeze({
    content: normalized,
    family,
    hadFence: fenced !== null,
    fence: fenced?.marker ?? null,
    diagnostics: Object.freeze(diagnostics),
  })
}

export function normalizeMermaidDefinition(content: string): string {
  return normalizeMermaidDiagram(content).content
}

export function normalizeMermaidMarkdown(content: string): MermaidMarkdownNormalization {
  const normalizedContent = normalizeLineEndings(content)
  const lines = normalizedContent.split('\n')
  const blocks: MermaidBlock[] = []
  const diagnostics: MermaidNormalizationDiagnostic[] = []

  for (let startLine = 0; startLine < lines.length; startLine += 1) {
    const opening = parseMermaidFenceOpening(lines[startLine] ?? '')
    if (opening === null) {
      continue
    }

    let endLine = startLine + 1
    while (endLine < lines.length) {
      const closing = lines[endLine]?.match(MERMAID_FENCE_CLOSE)
      if (closing?.[2] === opening.marker) {
        const body = lines.slice(startLine + 1, endLine).join('\n')
        const normalized = normalizeMermaidDiagram(body)
        blocks.push(Object.freeze({
          marker: opening.marker,
          openingLine: lines[startLine] ?? '',
          content: body,
          closingLine: lines[endLine] ?? '',
          startLine,
          endLine,
          family: normalized.family,
        }))
        diagnostics.push(...normalized.diagnostics.map((item) => ({
          ...item,
          line: item.line ?? startLine + 1,
        })))
        startLine = endLine
        break
      }
      endLine += 1
    }

    if (endLine >= lines.length) {
      diagnostics.push(diagnostic(
        'mermaid-unclosed-fence',
        'Mermaid opening fence has no matching closing fence.',
        startLine + 1,
      ))
    }
  }

  if (blocks.length === 0) {
    return Object.freeze({
      content: normalizedContent,
      blocks: Object.freeze([]),
      diagnostics: Object.freeze(diagnostics),
    })
  }

  const output: string[] = []
  let cursor = 0
  for (const block of blocks) {
    output.push(...lines.slice(cursor, block.startLine))
    output.push(block.openingLine)
    const normalizedBody = normalizeMermaidDefinition(block.content)
    if (normalizedBody.length > 0) {
      output.push(normalizedBody)
    }
    output.push(block.closingLine)
    cursor = block.endLine + 1
  }
  output.push(...lines.slice(cursor))

  return Object.freeze({
    content: output.join('\n'),
    blocks: Object.freeze(blocks),
    diagnostics: Object.freeze(diagnostics),
  })
}

export function extractMermaidBlocks(content: string): readonly MermaidBlock[] {
  return normalizeMermaidMarkdown(content).blocks
}

export function detectMermaidFamily(definition: string): MermaidDiagramFamily {
  const firstMeaningfulLine = normalizeLineEndings(definition)
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0
      && line.toLowerCase() !== 'mermaid'
      && !line.startsWith('%%')
      && !line.startsWith('---'))
    ?.toLowerCase() ?? ''

  const family = FAMILY_PREFIXES.find(([prefix]) => hasFamilyPrefix(firstMeaningfulLine, prefix))
  return family?.[1] ?? 'unknown'
}

export function renderMermaidIntent(value: unknown): string {
  const intent = validateDiagramIntent(value)
  if (intent.renderTarget !== 'mermaid') {
    throw new TypeError('Mermaid intent rendering requires renderTarget mermaid.')
  }
  switch (intent.semanticType) {
    case 'timeline':
      return renderTimeline(intent.payload as TimelinePayload)
    case 'swimlane':
      return renderSwimlane(intent.payload as SwimlanePayload)
    case 'quadrant':
      return renderQuadrant(intent.payload as QuadrantPayload)
    default:
      throw new TypeError('Mermaid intent rendering is not registered for semantic type ' + intent.semanticType + '.')
  }
}

function readSingleFencedDefinition(content: string): { raw: string; marker: '```' | '~~~' } | null {
  const lines = content.split('\n')
  const opening = parseMermaidFenceOpening(lines[0] ?? '')
  if (opening === null) {
    return null
  }

  for (let index = 1; index < lines.length; index += 1) {
    const closing = lines[index]?.match(MERMAID_FENCE_CLOSE)
    if (closing?.[2] === opening.marker) {
      if (lines.slice(index + 1).some((line) => line.trim().length > 0)) {
        return null
      }
      return { raw: lines.slice(1, index).join('\n'), marker: opening.marker }
    }
  }
  return null
}

function parseMermaidFenceOpening(line: string): { marker: '```' | '~~~' } | null {
  const match = line.match(MERMAID_FENCE_OPEN)
  return match === null ? null : { marker: match[2] as '```' | '~~~' }
}

function hasFamilyPrefix(header: string, prefix: string): boolean {
  if (!header.startsWith(prefix)) {
    return false
  }
  if (header === prefix) {
    return true
  }
  const suffix = header.slice(prefix.length)
  return suffix.startsWith(' ') || suffix.startsWith('\t') || suffix.startsWith('-')
}

function normalizeLineEndings(content: string): string {
  return content.replace(/^\uFEFF/u, '').replace(/\r\n?/gu, '\n')
}

function sanitizeMermaidContent(definition: string): string {
  return definition
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim()
}

function isErAttributeLine(line: string): boolean {
  return /^\s*[a-z][a-z0-9_]*\s+[a-z][a-z0-9_]*\s*$/iu.test(line)
}

function repairBraceLessErEntityBlocks(definition: string): string {
  const lines = definition.split('\n')
  const rebuilt: string[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    const entityMatch = line.match(/^(\s*)([A-Z_][A-Z0-9_]*)\s*$/u)
    if (entityMatch === null) {
      if (line.trim().length > 0) {
        rebuilt.push(line)
      }
      continue
    }

    const baseIndent = entityMatch[1] ?? ''
    const entityName = entityMatch[2] ?? ''
    const attributes: string[] = []
    let cursor = index + 1
    while (cursor < lines.length) {
      const candidate = lines[cursor] ?? ''
      if (candidate.trim().length === 0) {
        cursor += 1
        continue
      }
      if (!isErAttributeLine(candidate)) {
        break
      }
      attributes.push(candidate.trim())
      cursor += 1
    }

    if (attributes.length === 0) {
      rebuilt.push(line)
      continue
    }

    rebuilt.push(`${baseIndent}${entityName} {`)
    for (const attribute of attributes) {
      rebuilt.push(`${baseIndent}    ${attribute}`)
    }
    rebuilt.push(`${baseIndent}}`)
    index = cursor - 1
  }

  return rebuilt.join('\n')
}

function repairTruncatedErRelationCardinality(definition: string): string {
  return definition
    .split('\n')
    .map((line) => {
      let repaired = line
      repaired = repaired.replace(/^(\s*\S+\s+)o(--|\.\.)(?=(\|\||\|o|o\{|\}\|)\s+\S+\s*:)/u, '$1}o$2')
      repaired = repaired.replace(/(\|\||\|o|\}\||\}o)(--|\.\.)(o)(?=\s+\S+\s*:)/u, '$1$2o{')
      return repaired
    })
    .join('\n')
}

function diagnostic(
  code: MermaidNormalizationDiagnosticCode,
  message: string,
  line?: number,
): MermaidNormalizationDiagnostic {
  return Object.freeze({ code, message, ...(line === undefined ? {} : { line }) })
}

function renderTimeline(payload: TimelinePayload): string {
  const lines = ['timeline']
  for (const event of payload.events) {
    lines.push(`  ${sanitizeSourceText(String(event.date)).replaceAll(':', '-')} : ${sanitizeSourceText(event.label)}`)
    for (const detail of event.details ?? []) {
      lines.push(`    : ${sanitizeSourceText(detail)}`)
    }
  }
  return lines.join('\n')
}

function renderSwimlane(payload: SwimlanePayload): string {
  const ids = uniqueIdentifiers([
    ...payload.lanes.map((lane) => lane.id),
    ...payload.lanes.flatMap((lane) => lane.steps.map((step) => step.id)),
  ])
  const lines = ['flowchart LR']
  for (const lane of payload.lanes) {
    const laneId = ids.get(lane.id) ?? 'lane'
    lines.push(`  subgraph ${laneId}["${sanitizeSourceText(lane.label)}"]`)
    for (const step of lane.steps) {
      const stepId = ids.get(step.id) ?? 'step'
      lines.push(`    ${stepId}["${sanitizeSourceText(step.label)}"]`)
    }
    for (let index = 0; index < lane.steps.length; index += 1) {
      const step = lane.steps[index]
      const nextStepId = step?.nextStepId ?? lane.steps[index + 1]?.id
      if (step === undefined || nextStepId === undefined) {
        continue
      }
      lines.push(`    ${ids.get(step.id) ?? 'step'} -->|${sanitizeSourceText(lane.label)}| ${ids.get(nextStepId) ?? 'step'}`)
    }
    lines.push('  end')
  }
  return lines.join('\n')
}

function renderQuadrant(quadrant: QuadrantPayload): string {
  const lines = [
    'quadrantChart',
    `  x-axis ${sanitizeSourceText(quadrant.xAxisLabel[0])} --> ${sanitizeSourceText(quadrant.xAxisLabel[1])}`,
    `  y-axis ${sanitizeSourceText(quadrant.yAxisLabel[0])} --> ${sanitizeSourceText(quadrant.yAxisLabel[1])}`,
    `  quadrant-1 ${sanitizeSourceText(quadrant.quadrantLabels[0])}`,
    `  quadrant-2 ${sanitizeSourceText(quadrant.quadrantLabels[1])}`,
    `  quadrant-3 ${sanitizeSourceText(quadrant.quadrantLabels[2])}`,
    `  quadrant-4 ${sanitizeSourceText(quadrant.quadrantLabels[3])}`,
  ]
  for (const item of quadrant.items) {
    const detail = item.detail === undefined ? '' : ` - ${sanitizeSourceText(item.detail)}`
    lines.push(`  "${sanitizeSourceText(item.label)}${detail}": [${item.x}, ${item.y}]`)
  }
  return lines.join('\n')
}

function uniqueIdentifiers(values: readonly string[]): Map<string, string> {
  const result = new Map<string, string>()
  const used = new Set<string>()
  for (const value of values) {
    const base = value.replace(/[^A-Za-z0-9_]/gu, '_') || 'node'
    let candidate = base
    let suffix = 2
    while (used.has(candidate)) {
      candidate = `${base}_${suffix}`
      suffix += 1
    }
    used.add(candidate)
    result.set(value, candidate)
  }
  return result
}

function sanitizeSourceText(value: string): string {
  return value
    .replace(/[\r\n]/gu, ' ')
    .replace(/[\x5B\x5D{}|`]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}
