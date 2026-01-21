import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
