const allowedElements = new Set([
  'svg',
  'g',
  'defs',
  'marker',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'title',
  'desc',
  'use',
  'image',
  'lineargradient',
  'radialgradient',
  'stop',
  'clippath',
  'mask',
  'pattern',
  'symbol',
])

const contentDroppingElements = new Set([
  'script',
  'style',
  'foreignobject',
  'iframe',
  'object',
  'embed',
  'audio',
  'video',
  'canvas',
  'animate',
  'animatemotion',
  'animatetransform',
  'set',
  'discard',
  'metadata',
])

export class SvgSanitizationError extends Error {
  readonly code = 'SVG_INVALID'

  constructor(message: string) {
    super(message)
    this.name = 'SvgSanitizationError'
  }
}

interface ParsedSvgTag {
  readonly name: string
  readonly closing: boolean
  readonly selfClosing: boolean
  readonly attributes: readonly SvgAttribute[]
}

interface SvgAttribute {
  readonly name: string
  readonly value: string | undefined
}

export function sanitizeSvg(input: string): string {
  if (typeof input !== 'string') {
    throw new SvgSanitizationError('SVG content must be a string.')
  }

  let output = ''
  let cursor = 0
  while (cursor < input.length) {
    const tagStart = input.indexOf('<', cursor)
    if (tagStart === -1) {
      output += input.slice(cursor)
      break
    }
    output += input.slice(cursor, tagStart)

    const tagEnd = findTagEnd(input, tagStart)
    if (tagEnd === -1) {
      break
    }
    const rawTag = input.slice(tagStart + 1, tagEnd)
    cursor = tagEnd + 1

    if (rawTag.startsWith('!--')) {
      const commentEnd = input.indexOf('-->', tagStart + 4)
      cursor = commentEnd === -1 ? input.length : commentEnd + 3
      continue
    }
    if (rawTag.startsWith('!') || rawTag.startsWith('?')) {
      continue
    }

    const tag = parseSvgTag(rawTag)
    if (tag === undefined) {
      continue
    }
    if (contentDroppingElements.has(tag.name)) {
      if (!tag.closing && !tag.selfClosing) {
        cursor = skipElementContent(input, cursor, tag.name)
      }
      continue
    }
    if (!allowedElements.has(tag.name)) {
      continue
    }
    if (tag.closing) {
      output += `</${tag.name}>`
      continue
    }

    const attributes = tag.attributes
      .filter((attribute) => isSafeAttribute(attribute))
      .map((attribute) => renderAttribute(attribute))
      .join('')
    output += `<${tag.name}${attributes}${tag.selfClosing ? ' />' : '>'}`
  }

  const sanitized = output.trim()
  if (!/^<svg(?:\s|>)/iu.test(sanitized)) {
    throw new SvgSanitizationError('SVG root was removed or is malformed.')
  }
  return sanitized
}

function findTagEnd(input: string, start: number): number {
  let quote: '"' | "'" | undefined
  for (let index = start + 1; index < input.length; index += 1) {
    const character = input[index]
    if (character === '"' || character === "'") {
      if (quote === undefined) {
        quote = character
      } else if (quote === character) {
        quote = undefined
      }
    } else if (character === '>' && quote === undefined) {
      return index
    }
  }
  return -1
}

function parseSvgTag(rawTag: string): ParsedSvgTag | undefined {
  const trimmed = rawTag.trim()
  const closing = trimmed.startsWith('/')
  const body = (closing ? trimmed.slice(1) : trimmed).trim()
  const nameMatch = /^([A-Za-z][A-Za-z0-9:.-]*)/u.exec(body)
  if (nameMatch === null) {
    return undefined
  }
  const name = nameMatch[1]?.toLocaleLowerCase()
  if (name === undefined) {
    return undefined
  }
  const attributeSource = body.slice(nameMatch[0].length)
  return {
    name,
    closing,
    selfClosing: !closing && /\/\s*$/u.test(attributeSource),
    attributes: closing ? [] : parseAttributes(attributeSource),
  }
}

function parseAttributes(source: string): readonly SvgAttribute[] {
  const attributes: SvgAttribute[] = []
  let index = 0
  while (index < source.length) {
    index = skipWhitespace(source, index)
    if (index >= source.length || (source[index] ?? '') === '/') {
      break
    }
    const nameStart = index
    while (index < source.length && !/[\s=/>]/u.test(source[index] ?? '')) {
      index += 1
    }
    const name = source.slice(nameStart, index)
    if (name.length === 0) {
      index += 1
      continue
    }
    index = skipWhitespace(source, index)
    if ((source[index] ?? '') !== '=') {
      attributes.push({ name, value: undefined })
      continue
    }
    index = skipWhitespace(source, index + 1)
    const quote = source[index] ?? ''
    let value = ''
    if (quote === '"' || quote === "'") {
      const valueStart = index + 1
      index = valueStart
      while (index < source.length && (source[index] ?? '') !== quote) {
        index += 1
      }
      value = source.slice(valueStart, index)
      if ((source[index] ?? '') === quote) {
        index += 1
      }
    } else {
      const valueStart = index
      while (index < source.length && !/[\s>]/u.test(source[index] ?? '')) {
        index += 1
      }
      value = source.slice(valueStart, index)
    }
    attributes.push({ name, value })
  }
  return attributes
}

function skipWhitespace(source: string, index: number): number {
  let cursor = index
  while (cursor < source.length && /\s/u.test(source[cursor] ?? '')) {
    cursor += 1
  }
  return cursor
}

function skipElementContent(input: string, from: number, name: string): number {
  const closingTag = `</${name}`
  const lowerInput = input.toLocaleLowerCase()
  const closingStart = lowerInput.indexOf(closingTag, from)
  if (closingStart === -1) {
    return input.length
  }
  const closingEnd = findTagEnd(input, closingStart)
  return closingEnd === -1 ? input.length : closingEnd + 1
}

function isSafeAttribute(attribute: SvgAttribute): boolean {
  const name = attribute.name.toLocaleLowerCase()
  const value = attribute.value
  if (name.startsWith('on') || name === 'style' || name === 'xml:base' || name === 'base') {
    return false
  }
  if (value === undefined) {
    return name !== 'href' && name !== 'xlink:href' && name !== 'src'
  }
  if (name === 'href' || name === 'xlink:href' || name === 'src') {
    return isSafeReference(value)
  }
  if (/^\s*(?:javascript|vbscript|data):/iu.test(value)) {
    return false
  }
  return containsOnlyLocalUrlReferences(value)
}

function isSafeReference(value: string): boolean {
  const normalized = value.trim()
  return normalized.startsWith('#') || /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=\s]+$/u.test(normalized)
}

function containsOnlyLocalUrlReferences(value: string): boolean {
  const withoutLocalReferences = value.replace(/url\(\s*(['"]?)\s*#[^)'"\s]+\1\s*\)/giu, '')
  return !/url\s*\(/iu.test(withoutLocalReferences)
}

function renderAttribute(attribute: SvgAttribute): string {
  if (attribute.value === undefined) {
    return ` ${attribute.name}`
  }
  return ` ${attribute.name}="${escapeAttribute(attribute.value)}"`
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/"/gu, '&quot;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
}
