import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Allow access from all network interfaces
    port: 5173,
    cors: true, // Enable CORS for all routes
    proxy: {
      // Proxy requests to the backend during development
      '/api': {
        target: 'https://squat-analyzer-backend.onrender.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  },
  preview: {
    port: 5173,
    cors: true
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    chunkSizeWarningLimit: 1500, // Increase from default 500kb to 1500kb for TensorFlow.js
    rollupOptions: {
      output: {
        manualChunks: {
          // Group TensorFlow.js libraries together
          tensorflow: [
            '@tensorflow/tfjs',
            '@tensorflow/tfjs-backend-webgl',
            '@tensorflow/tfjs-backend-cpu',
            '@tensorflow-models/pose-detection'
          ],
          // Group React and styling libraries
          vendor: [
            'react',
            'react-dom',
            'styled-components'
          ]
        }
      }
    }
  }
})
