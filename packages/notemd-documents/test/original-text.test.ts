import { expect, test } from 'vitest'

import {
  createOriginalTextOutputPath,
  sourceSiblingOriginalTextOutput,
  workspaceMirroredOriginalTextOutput,
} from '../src/index.js'

test('keeps source-compatible and workspace-mirrored original-text destinations separate policies', () => {
  expect(createOriginalTextOutputPath(
    'notes/original.md',
    sourceSiblingOriginalTextOutput(),
  )).toBe('notes/original_Extracted.md')
  expect(createOriginalTextOutputPath(
    'notes/original.md',
    workspaceMirroredOriginalTextOutput('originals'),
  )).toBe('originals/notes/original.md')
})
