import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import os from 'os'

function getDevHost(): string {
  if (process.env.TAURI_DEV_HOST) return process.env.TAURI_DEV_HOST
  const ifaces = os.networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address
    }
  }
  return 'localhost'
}

// https://vitejs.dev/config/
export default defineConfig(() => {
  const devHost = getDevHost();
  return {
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_'],
  define: {
    __DEV_HOST__: JSON.stringify(devHost),
  },
  plugins: [
    react(),
    {
      name: 'mime-type-mjs',
      configureServer(server) {
        return () => {
          server.middlewares.use((req, res, next) => {
            if (req.url && req.url.endsWith('.mjs')) {
              res.setHeader('Content-Type', 'application/javascript');
            }
            next();
          });
        };
      }
    }
  ],
  server: {
    host: "0.0.0.0",
    port: 1420,
    strictPort: true,
    hmr: {
      protocol: "ws",
      host: devHost,
      port: 1420,
    },
    watch: {
      ignored: ['**/src-tauri/**'],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true
      }
    }
  },
  optimizeDeps: {
    include: ['@mui/material']
  },
  build: {
    target: process.env.TAURI_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: process.env.TAURI_DEBUG ? false : 'esbuild',
    sourcemap: !!process.env.TAURI_DEBUG,
  },
  };
})