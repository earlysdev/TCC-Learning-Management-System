import fs from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/** Remove previously emitted `index-*.js|css` bundles while preserving Laravel public assets & images. */
function cleanStaleIndexBundles(outDir: string): Plugin {
  return {
    name: 'clean-stale-index-bundles',
    writeBundle(_, bundle) {
      const assetsDir = path.resolve(outDir, 'assets')
      if (!fs.existsSync(assetsDir)) return

      const emitted = new Set(Object.keys(bundle).map((file) => path.basename(file)))
      for (const entry of fs.readdirSync(assetsDir)) {
        if (/^index-.+\.(js|css)$/.test(entry) && !emitted.has(entry)) {
          fs.rmSync(path.join(assetsDir, entry), { force: true })
        }
      }
    },
  }
}

const outDir = '../backend/public'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), cleanStaleIndexBundles(outDir)],
  build: {
    outDir,
    emptyOutDir: false,
  },
})
