import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

export default defineConfig({
  plugins: [react()],
  // as vite.config.js: components show the app version
  define: { __APP_VERSION__: JSON.stringify(version) },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src_beach/__tests__/setup.js'],
    include: ['src_beach/**/*.{test,spec}.{js,jsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src_beach/**/*.{js,jsx}'],
      exclude: [
        'src_beach/**/*.test.{js,jsx}',
        'src_beach/**/*.spec.{js,jsx}',
        'src_beach/__tests__/**',
        'src_beach/i18n_beach/**',
      ],
    },
  },
})
