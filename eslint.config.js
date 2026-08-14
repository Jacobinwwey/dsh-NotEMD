import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['**/lib/**', '**/*.d.ts', 'artifacts/**', 'ref/**'],
  },
  {
    ignores: ['artifacts/**', 'coverage/**', 'lib/**', 'node_modules/**', 'ref/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'separate-type-imports' }],
    },
  },
)
