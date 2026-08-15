import { expect, test } from 'vitest'

import { parseMarkdownDocument } from '../src/index.js'

test('derives stable heading anchors and breadcrumbs without treating fenced headings as sections', () => {
  const document = parseMarkdownDocument({
    path: 'notes/architecture.md',
    content: [
      '# Architecture',
      '',
      '## Canonical Lock Ordering',
      'Acquire locks before checking revisions.',
      '',
      '```markdown',
      '## Not A Section',
      '```',
      '',
      '### Canonical Lock Ordering',
      'Nested material.',
    ].join('\n'),
  })

  expect(document.sections.map((section) => ({
    anchor: section.anchor,
    breadcrumb: section.breadcrumb,
    title: section.title,
  }))).toEqual([
    { anchor: 'architecture', breadcrumb: ['Architecture'], title: 'Architecture' },
    {
      anchor: 'canonical-lock-ordering',
      breadcrumb: ['Architecture', 'Canonical Lock Ordering'],
      title: 'Canonical Lock Ordering',
    },
    {
      anchor: 'canonical-lock-ordering-2',
      breadcrumb: ['Architecture', 'Canonical Lock Ordering', 'Canonical Lock Ordering'],
      title: 'Canonical Lock Ordering',
    },
  ])
  expect(document.sections.some((section) => section.title === 'Not A Section')).toBe(false)
  expect(document.sections[1]?.searchText).not.toContain('Not A Section')
})
