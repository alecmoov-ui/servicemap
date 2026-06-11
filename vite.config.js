import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// `npm run dev`   -> normal dev server
// `npm run build` -> ONE self-contained dist/index.html (no server needed,
//                    double-click to open). base './' keeps it file://-safe.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
  server: { port: 5173, host: true },
})
