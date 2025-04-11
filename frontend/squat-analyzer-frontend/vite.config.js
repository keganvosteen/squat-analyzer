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
    chunkSizeWarningLimit: 2000, // Increase from 1500kb to 2000kb for TensorFlow.js
    minify: 'terser', // Use terser for better minification
    terserOptions: {
      compress: {
        drop_console: false, // Keep console logs for debugging
        pure_funcs: ['console.debug'], // But remove debug logs
      }
    },
    rollupOptions: {
      output: {
        // Improve code splitting
        manualChunks: {
          // Group TensorFlow.js libraries together
          'tensorflow-core': [
            '@tensorflow/tfjs-core',
          ],
          'tensorflow-backends': [
            '@tensorflow/tfjs-backend-webgl',
            '@tensorflow/tfjs-backend-cpu',
          ],
          'tensorflow-models': [
            '@tensorflow-models/pose-detection'
          ],
          // Group React and styling libraries
          'react-vendor': [
            'react',
            'react-dom',
          ],
          'ui-vendor': [
            'styled-components',
            'lucide-react'
          ]
        },
        // Optimize chunk size
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: 'assets/[ext]/[name]-[hash].[ext]'
      }
    },
    // Optimize for mobile
    target: 'es2018',
    cssCodeSplit: true,
    assetsInlineLimit: 4096, // Inline small assets (4kb or less)
    reportCompressedSize: true
  },
  // Optimize CSS
  css: {
    devSourcemap: true,
    postcss: {
      plugins: [],
    }
  },
  // PWA features for mobile
  base: './'
})
