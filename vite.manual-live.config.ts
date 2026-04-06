import { resolve } from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, 'shared'),
      '@electron': resolve(__dirname, 'electron'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // 只执行显式标记为 manual/live 的诊断测试，避免混入默认回归。
    include: ['**/*.temp.test.ts', '**/*.temp.test.tsx'],
    exclude: configDefaults.exclude,
  },
})
