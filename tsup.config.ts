import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    main: 'electron/main.ts',
    preload: 'electron/preload.ts',
    appContextWorker: 'electron/appContextWorker.ts',
  },
  clean: true,
  dts: false,
  external: ['electron', 'better-sqlite3', 'sqlite-vec'],
  format: ['cjs'],
  minify: false,
  outDir: 'dist-electron',
  outExtension() {
    return {
      js: '.cjs',
    }
  },
  shims: false,
  sourcemap: true,
  splitting: false,
  target: 'node20',
})
