import { defineConfig } from 'vitest/config';

/** Vitest configuration: jsdom environment, v8 coverage provider with thresholds (55% stmts / 43% branches / 50% funcs / 60% lines), and test file patterns scoped to tests/. */
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    css: true,
    coverage: {
      provider: 'v8',
      include: ['components/**/*.{ts,tsx}', 'hooks/**/*.{ts,tsx}', 'services/**/*.{ts,tsx}', 'utils/**/*.{ts,tsx}'],
      exclude: ['**/*.test.{ts,tsx}', '**/node_modules/**', '**/dist/**'],
      thresholds: {
        statements: 55,
        branches: 43,
        functions: 50,
        lines: 60,
      },
    },
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'tests/live/*_live.test.ts'],
  },
});
