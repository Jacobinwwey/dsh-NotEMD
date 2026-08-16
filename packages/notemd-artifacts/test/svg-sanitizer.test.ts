import { expect, test } from 'vitest'

import { sanitizeSvg } from '../src/svg-sanitizer.js'

test('removes executable and remote SVG content while preserving local rendering references', () => {
  const sanitized = sanitizeSvg([
    '<svg xmlns="http://www.w3.org/2000/svg">',
    '  <script>alert(1)</script>',
    '  <foreignObject><iframe src="https://example.test/frame"></iframe></foreignObject>',
    '  <rect width="40" height="20" onload="steal()" fill="url(https://example.test/pattern)" />',
    '  <use href="javascript:alert(1)" />',
    '  <use href="#safe-marker" />',
    '  <image href="data:text/html;base64,PHNjcmlwdD4=" />',
    '  <image href="data:image/png;base64,iVBORw0KGgo=" />',
    '  <style>@import url(https://example.test/style.css)</style>',
    '</svg>',
  ].join('\n'))

  expect(sanitized).toContain('<rect width="40" height="20"')
  expect(sanitized).toContain('href="#safe-marker"')
  expect(sanitized).toContain('href="data:image/png;base64,iVBORw0KGgo="')
  expect(sanitized).not.toMatch(/<script|foreignObject|onload|https:\/\/example\.test|javascript:|data:text\/html|<style/iu)
})

test('rejects a document that does not retain an SVG root after sanitization', () => {
  expect(() => sanitizeSvg('<script>alert(1)</script>')).toThrow('SVG root')
})
