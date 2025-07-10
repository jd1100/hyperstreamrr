import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // Ensure compatibility with Pear Desktop
    target: 'es2022',
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: 'index.html'
      },
      external: [
        // Keep Pear APIs external since they're provided by the runtime
        'pear-interface'
      ]
    }
  },
  define: {
    // Ensure global is available for Node.js-style modules
    global: 'globalThis'
  },
  server: {
    // For development, ensure compatibility with Pear's environment
    host: '0.0.0.0',
    port: 3000
  }
})