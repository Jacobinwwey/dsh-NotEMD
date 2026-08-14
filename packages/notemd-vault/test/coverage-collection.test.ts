import { expect, test } from 'vitest'

import configuration from '../../../vitest.config.js'

test('limits coverage collection to publishable package source files', () => {
  expect(configuration.test?.coverage?.include).toEqual(['packages/**/src/**/*.ts'])
  expect(configuration.test?.coverage?.exclude).toContain('**/*.d.ts')
})
