import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
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
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000', // 后端地址
        changeOrigin: true
      }
    }
  },
  optimizeDeps: {
    include: ['@mui/material']
  },
})