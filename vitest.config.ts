import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Enable TypeScript support
    typecheck: {
      enabled: true
    },
    // Test environment
    environment: 'node',
    // Include patterns
    include: [
      'test/**/*.test.ts',
      'test/**/*.spec.ts'
    ],
    // Exclude patterns
    exclude: [
      'node_modules',
      'dist',
      'sources'
    ],
    // Test timeout
    testTimeout: 10000,
    // Reporter
    reporter: ['verbose', 'json'],
    // Coverage (optional)
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'test/',
        'dist/',
        'sources/'
      ]
    }
  }
});
