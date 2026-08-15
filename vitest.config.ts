import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const workspaceRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: workspaceRoot,
  resolve: {
    alias: {
      '@notemd-harness/mutation': fileURLToPath(
        new URL('./packages/notemd-mutation/src/index.ts', import.meta.url),
      ),
      '@notemd-harness/artifacts': fileURLToPath(
        new URL('./packages/notemd-artifacts/src/index.ts', import.meta.url),
      ),
      '@notemd-harness/jobs': fileURLToPath(new URL('./packages/notemd-jobs/src/index.ts', import.meta.url)),
      '@notemd-harness/documents': fileURLToPath(
        new URL('./packages/notemd-documents/src/index.ts', import.meta.url),
      ),
      '@notemd-harness/knowledge': fileURLToPath(
        new URL('./packages/notemd-knowledge/src/index.ts', import.meta.url),
      ),
      '@notemd-harness/llm-dsh': fileURLToPath(
        new URL('./packages/notemd-llm-dsh/src/index.ts', import.meta.url),
      ),
      '@notemd-harness/llm-openai-compatible': fileURLToPath(
        new URL('./packages/notemd-llm-openai-compatible/src/index.ts', import.meta.url),
      ),
      '@notemd-harness/tools': fileURLToPath(new URL('./packages/notemd-tools/src/index.ts', import.meta.url)),
      '@notemd-harness/vault': fileURLToPath(new URL('./packages/notemd-vault/src/index.ts', import.meta.url)),
      '@notemd-harness/vault-local': fileURLToPath(
        new URL('./packages/notemd-vault-local/src/index.ts', import.meta.url),
      ),
      '@notemd-harness/workspace-events': fileURLToPath(
        new URL('./packages/notemd-workspace-events/src/index.ts', import.meta.url),
      ),
      '@notemd-harness/workflows': fileURLToPath(
        new URL('./packages/notemd-workflows/src/index.ts', import.meta.url),
      ),
      '@jacobinwwey/notemd-deepseek-harness': fileURLToPath(
        new URL('./packages/notemd-bundle/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['packages/*/test/**/*.test.ts'],
    globals: false,
    testTimeout: 10_000,
    hookTimeout: 10_000,
    coverage: {
      include: ['packages/**/src/**/*.ts'],
      exclude: ['**/*.d.ts'],
    },
  },
})
