import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // TypeScript is checked explicitly via npm run build:tsc before Vitest in
    // package scripts. Keeping Vitest typecheck enabled starts a second checker
    // process and can leave CI waiting after tests have already passed.
    typecheck: {
      enabled: false
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
    reporter: ['verbose'],
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
