export async function replaceMermaidFenceBodies(
  content: string,
  repair: (body: string) => Promise<string>,
): Promise<string> {
  const fencePattern = /(?<prefix>^|\n)(?<fence>`{3,}|~{3,})mermaid(?<options>[^\n]*)\n(?<body>[\s\S]*?)\n\k<fence>(?=\n|$)/gu
  const matches = [...content.matchAll(fencePattern)]

  if (matches.length === 0) {
    return content
  }

  let repaired = ''
  let cursor = 0
  for (const match of matches) {
    const index = match.index
    const groups = match.groups
    if (index === undefined || groups === undefined) {
      continue
    }

    const body = groups.body ?? ''
    const repairedBody = (await repair(body)).trim()
    repaired += content.slice(cursor, index)
    repaired += `${groups.prefix ?? ''}${groups.fence ?? '```'}mermaid${groups.options ?? ''}\n${repairedBody}\n${groups.fence ?? '```'}`
    cursor = index + match[0].length
  }

  return repaired + content.slice(cursor)
}

export function normalizeFormulaDelimiters(content: string): string {
  return content
    .replace(/\\\[\s*([\s\S]*?)\s*\\\]/gu, (_match, body: string) => `$$\n${body.trim()}\n$$`)
    .replace(/\\\(\s*([\s\S]*?)\s*\\\)/gu, (_match, body: string) => `$${body.trim()}$`)
}
