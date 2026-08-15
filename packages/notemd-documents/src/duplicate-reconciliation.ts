export interface DuplicateTerm {
  readonly term: string
  readonly occurrences: number
}

export interface DuplicateConceptCandidate {
  readonly path: string
  readonly reason: 'exact-name' | 'plural-name' | 'normalized-name' | 'contained-name'
  readonly counterparts: readonly string[]
}

export function findDuplicateTerms(content: string): readonly DuplicateTerm[] {
  const counts = new Map<string, number>()
  for (const token of content.toLocaleLowerCase().match(/[\p{Letter}\p{Number}][\p{Letter}\p{Number}'-]*/gu) ?? []) {
    if ([...token].length < 3) {
      continue
    }
    counts.set(token, (counts.get(token) ?? 0) + 1)
  }
  return Object.freeze([...counts.entries()]
    .filter(([, occurrences]) => occurrences > 1)
    .map(([term, occurrences]) => Object.freeze({ term, occurrences }))
    .sort((left, right) => left.term.localeCompare(right.term)))
}

export function findDuplicateConceptCandidates(
  conceptPaths: readonly string[],
  comparisonPaths: readonly string[],
): readonly DuplicateConceptCandidate[] {
  const comparisonNames = comparisonPaths.map((path) => ({ path, name: basenameWithoutExtension(path) }))
  return Object.freeze(conceptPaths
    .map((path) => {
      const name = basenameWithoutExtension(path)
      const counterparts = comparisonNames.filter((candidate) => candidate.path !== path)
      const exact = counterparts.filter((candidate) => candidate.name.toLocaleLowerCase() === name.toLocaleLowerCase())
      if (exact.length > 0) {
        return candidate(path, 'exact-name', exact)
      }
      const singular = singularName(name)
      const plural = singular === name ? undefined : counterparts.filter((candidate) => singularName(candidate.name) === singular)
      if (plural !== undefined && plural.length > 0) {
        return candidate(path, 'plural-name', plural)
      }
      const normalized = normalizeConceptName(name)
      const normalizedMatches = counterparts.filter((candidate) => normalizeConceptName(candidate.name) === normalized)
      if (normalized.length > 0 && normalizedMatches.length > 0) {
        return candidate(path, 'normalized-name', normalizedMatches)
      }
      const words = normalizeConceptName(name).split(' ').filter(Boolean)
      if (words.length === 1) {
        const contained = counterparts.filter((candidate) => normalizeConceptName(candidate.name).split(' ').length > 1
          && normalizeConceptName(candidate.name).split(' ').includes(words[0] ?? ''))
        if (contained.length > 0) {
          return candidate(path, 'contained-name', contained)
        }
      }
      return undefined
    })
    .filter((candidate): candidate is DuplicateConceptCandidate => candidate !== undefined)
    .sort((left, right) => left.path.localeCompare(right.path)))
}

function candidate(
  path: string,
  reason: DuplicateConceptCandidate['reason'],
  counterparts: readonly { path: string }[],
): DuplicateConceptCandidate {
  return Object.freeze({ path, reason, counterparts: Object.freeze(counterparts.map((entry) => entry.path).sort()) })
}

function basenameWithoutExtension(path: string): string {
  const basename = path.split('/').at(-1) ?? path
  return basename.replace(/\.md$/iu, '')
}

function singularName(value: string): string {
  const lower = value.toLocaleLowerCase()
  if (lower.endsWith('ies') && lower.length > 3) {
    return `${lower.slice(0, -3)}y`
  }
  if (lower.endsWith('es') && lower.length > 2) {
    return lower.slice(0, -2)
  }
  if (lower.endsWith('s') && lower.length > 1) {
    return lower.slice(0, -1)
  }
  return lower
}

function normalizeConceptName(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[-_]/gu, ' ')
    .replace(/[^\p{Letter}\p{Number} ]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
}
