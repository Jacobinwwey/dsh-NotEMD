import type { DiagramChartInput, DiagramGraphInput } from './diagram-spec.js'
import { layoutGraph, wrapGraphText, type GraphLayoutEdge, type GraphLayoutNode } from './graph-layout.js'

/** Version every consumer's SVG derivative when the shared graph geometry changes. */
export const graphProjectionVersion = '2'

export interface SvgProjectionOptions {
  readonly title: string
  readonly rendererId: string
  readonly theme: string
  readonly fontFamily: string
  readonly projection?: string
  readonly subtitle?: string
}

const graphWidth = 960

export function renderGraphProjectionSvg(graph: DiagramGraphInput, options: SvgProjectionOptions): string {
  const layout = layoutGraph(graph)
  const colors = projectionColors(options.theme)
  const titleLines = wrapGraphText(options.title, layout.width - 64, 20)
  const subtitleLines = options.subtitle === undefined ? [] : wrapGraphText(options.subtitle, layout.width - 64, 13)
  const subtitleTop = 38 + titleLines.length * 26
  const headerBottom = subtitleTop + subtitleLines.length * 18 + 24
  const graphOffset = Math.max(0, headerBottom - 118)
  const graphHeight = layout.height + graphOffset
  const hierarchyMarkup = layout.hierarchy.map((edge) => `<polyline data-edge-kind="hierarchy" points="${routePoints(edge)}" fill="none" stroke="${colors.border}" stroke-width="2" />`).join('')
  const relationMarkup = layout.relations.map((edge) => renderGraphEdge(edge, colors, options.fontFamily)).join('')
  const nodeMarkup = layout.nodes.map((node, index) => renderGraphNode(node, index, colors, options.fontFamily)).join('')

  return svgDocument(
    layout.width,
    graphHeight,
    options,
    [
      `<rect width="${layout.width}" height="${graphHeight}" fill="${colors.background}" />`,
      `<text x="32" y="38" font-family="${escapeSvgAttribute(options.fontFamily)}" font-size="20" font-weight="700" fill="${colors.title}">${textSpans(titleLines, 32, 26)}</text>`,
      subtitleLines.length === 0 ? '' : `<text x="32" y="${subtitleTop}" font-family="${escapeSvgAttribute(options.fontFamily)}" font-size="13" fill="${colors.muted}">${textSpans(subtitleLines, 32, 18)}</text>`,
      `<g transform="translate(0 ${graphOffset})">`,
      hierarchyMarkup,
      relationMarkup,
      nodeMarkup,
      '</g>',
    ].join(''),
    colors,
  )
}

export function renderChartProjectionSvg(chart: DiagramChartInput, options: SvgProjectionOptions): string {
  const colors = projectionColors(options.theme)
  const width = graphWidth
  const height = 560
  const left = 84
  const top = 118
  const plotWidth = width - left - 72
  const plotHeight = height - top - 100
  const values = chart.series.flatMap((series) => series.points.map((point) => ({
    series: series.label,
    x: String(point.x),
    y: point.y,
  })))
  const minY = Math.min(0, ...values.map((value) => value.y))
  const maxY = Math.max(1, ...values.map((value) => value.y))
  const range = Math.max(1, maxY - minY)
  const labels = [...new Set(values.map((value) => value.x))]
  const xFor = (label: string) => left + (labels.length <= 1 ? plotWidth / 2 : labels.indexOf(label) * (plotWidth / (labels.length - 1)))
  const yFor = (value: number) => top + plotHeight - ((value - minY) / range) * plotHeight
  const axes = [
    `<line x1="${left}" y1="${top}" x2="${left}" y2="${top + plotHeight}" stroke="${colors.axis}" />`,
    `<line x1="${left}" y1="${top + plotHeight}" x2="${left + plotWidth}" y2="${top + plotHeight}" stroke="${colors.axis}" />`,
    ...labels.map((label) => `<text x="${xFor(label)}" y="${top + plotHeight + 28}" text-anchor="middle" font-family="${escapeSvgAttribute(options.fontFamily)}" font-size="12" fill="${colors.muted}">${escapeSvgText(label)}</text>`),
    `<text x="${left - 12}" y="${top + 6}" text-anchor="end" font-family="${escapeSvgAttribute(options.fontFamily)}" font-size="12" fill="${colors.muted}">${escapeSvgText(String(maxY))}</text>`,
    `<text x="${left - 12}" y="${top + plotHeight}" text-anchor="end" font-family="${escapeSvgAttribute(options.fontFamily)}" font-size="12" fill="${colors.muted}">${escapeSvgText(String(minY))}</text>`,
  ].join('')
  const seriesMarkup = chart.series.map((series, seriesIndex) => {
    const color = seriesColor(seriesIndex)
    const points = series.points.map((point) => ({ x: xFor(String(point.x)), y: yFor(point.y) }))
    if (chart.chartType === 'bar') {
      const barWidth = Math.max(14, Math.min(48, plotWidth / Math.max(1, labels.length * chart.series.length) - 8))
      return points.map((point) => {
        const offset = (seriesIndex - (chart.series.length - 1) / 2) * (barWidth + 4)
        const zeroY = yFor(0)
        return `<rect x="${point.x + offset - barWidth / 2}" y="${Math.min(point.y, zeroY)}" width="${barWidth}" height="${Math.abs(point.y - zeroY)}" fill="${color}" rx="2" />`
      }).join('')
    }
    if (chart.chartType === 'table') {
      return series.points.map((point, pointIndex) => `<text x="${left}" y="${top + 30 + (seriesIndex * series.points.length + pointIndex) * 24}" font-family="${escapeSvgAttribute(options.fontFamily)}" font-size="14" fill="${colors.text}">${escapeSvgText(`${series.label}: ${point.x} = ${point.y}`)}</text>`).join('')
    }
    const polyline = points.map((point) => `${point.x},${point.y}`).join(' ')
    const area = chart.chartType === 'area'
      ? `<polygon points="${left},${top + plotHeight} ${polyline} ${points.at(-1)?.x ?? left},${top + plotHeight}" fill="${color}" fill-opacity="0.22" />`
      : ''
    const line = chart.chartType === 'point' || chart.chartType === 'scatter' || chart.chartType === 'pie'
      ? ''
      : `<polyline points="${polyline}" fill="none" stroke="${color}" stroke-width="3" />`
    const dots = points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="5" fill="${color}" />`).join('')
    return `${area}${line}${dots}`
  }).join('')
  const legend = chart.series.map((series, index) => {
    const x = left + index * 172
    return `<rect x="${x}" y="86" width="12" height="12" fill="${seriesColor(index)}" /><text x="${x + 18}" y="97" font-family="${escapeSvgAttribute(options.fontFamily)}" font-size="13" fill="${colors.text}">${escapeSvgText(series.label)}</text>`
  }).join('')

  return svgDocument(width, height, options, [
    `<rect width="${width}" height="${height}" fill="${colors.background}" />`,
    `<text x="32" y="38" font-family="${escapeSvgAttribute(options.fontFamily)}" font-size="20" font-weight="700" fill="${colors.title}">${escapeSvgText(options.title)}</text>`,
    options.subtitle === undefined ? '' : `<text x="32" y="64" font-family="${escapeSvgAttribute(options.fontFamily)}" font-size="13" fill="${colors.muted}">${escapeSvgText(options.subtitle)}</text>`,
    legend,
    axes,
    seriesMarkup,
  ].join(''), colors)
}

export function escapeSvgText(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
}

export function escapeSvgAttribute(value: string): string {
  return escapeSvgText(value)
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;')
}

function svgDocument(width: number, height: number, options: SvgProjectionOptions, content: string, colors: ProjectionColors): string {
  const projection = options.projection === undefined ? '' : ` data-notemd-projection="${escapeSvgAttribute(options.projection)}"`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" data-notemd-renderer="${escapeSvgAttribute(options.rendererId)}"${projection}><title>${escapeSvgText(options.title)}</title><defs><marker id="notemd-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="${colors.edge}" /></marker></defs>${content}</svg>`
}

function routePoints(edge: GraphLayoutEdge): string {
  return edge.points.map((point) => `${point.x},${point.y}`).join(' ')
}

function textSpans(lines: readonly string[], x: number, lineHeight: number): string {
  return lines.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeSvgText(line)}</tspan>`).join('')
}

function renderGraphEdge(
  edge: GraphLayoutEdge,
  colors: ProjectionColors,
  fontFamily: string,
): string {
  const label = edge.label === undefined
    ? ''
    : `<rect x="${edge.label.x}" y="${edge.label.y}" width="${edge.label.width}" height="${edge.label.height}" fill="${colors.background}" /><text x="${edge.label.x + edge.label.width / 2}" y="${edge.label.y + 20}" text-anchor="middle" font-family="${escapeSvgAttribute(fontFamily)}" font-size="12" fill="${colors.muted}">${textSpans(edge.label.lines, edge.label.x + edge.label.width / 2, 16)}</text>`
  return `<g data-edge-kind="relation" data-from="${escapeSvgAttribute(edge.from)}" data-to="${escapeSvgAttribute(edge.to)}"><polyline points="${routePoints(edge)}" fill="none" stroke="${colors.edge}" stroke-width="2" marker-end="url(#notemd-arrow)" />${label}</g>`
}

function renderGraphNode(node: GraphLayoutNode, index: number, colors: ProjectionColors, fontFamily: string): string {
  const fill = nodeFill(index, colors)
  const lines = node.lines
  const text = textSpans(lines, node.x + node.width / 2, 18)
  return `<rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="6" fill="${fill}" stroke="${colors.border}" /><text x="${node.x + node.width / 2}" y="${node.y + node.height / 2 - (lines.length - 1) * 9}" text-anchor="middle" dominant-baseline="middle" font-family="${escapeSvgAttribute(fontFamily)}" font-size="14" fill="${colors.text}">${text}</text>`
}

interface ProjectionColors {
  readonly background: string
  readonly title: string
  readonly text: string
  readonly muted: string
  readonly border: string
  readonly edge: string
  readonly axis: string
  readonly nodeFill: readonly string[]
}

function projectionColors(theme: string): ProjectionColors {
  if (theme.toLocaleLowerCase().includes('dark')) {
    return {
      background: '#101826',
      title: '#f8fafc',
      text: '#e2e8f0',
      muted: '#94a3b8',
      border: '#475569',
      edge: '#94a3b8',
      axis: '#64748b',
      nodeFill: ['#173b63', '#24436d', '#1f5160', '#4b355f'],
    }
  }
  return {
    background: '#ffffff',
    title: '#172033',
    text: '#172033',
    muted: '#526176',
    border: '#9aafc6',
    edge: '#5f7189',
    axis: '#7890aa',
    nodeFill: ['#e7f1ff', '#eef4fb', '#e8f7f2', '#f6effb'],
  }
}

function nodeFill(index: number, colors: ProjectionColors): string {
  return colors.nodeFill[index % colors.nodeFill.length] ?? colors.nodeFill[0] ?? '#ffffff'
}

function seriesColor(index: number): string {
  const palette = ['#1177cc', '#0d9488', '#b45309', '#9333ea', '#dc2626']
  return palette[index % palette.length] ?? palette[0] ?? '#1177cc'
}
