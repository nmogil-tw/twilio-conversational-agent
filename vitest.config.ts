/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'tests/**',
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'examples/**'
      ]
    },
    testTimeout: 30000, // Extended timeout for integration tests
    hookTimeout: 10000  // Extended timeout for setup/teardown
  }
})