import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => ({
    plugins: [
        react(),
        tailwindcss(),
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    esbuild: {
        drop: mode === 'production' ? ['console', 'debugger'] : [],
    },
    build: {
        target: 'esnext',
        minify: 'esbuild',
        cssMinify: true,
        chunkSizeWarningLimit: 1000,
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (!id.includes('node_modules')) return undefined;
                    if (id.includes('/react-dom') || id.includes('/react-router') || id.includes('/react-router-dom') || id.includes('/scheduler')) return 'react-vendor';
                    if (id.includes('/react/')) return 'react-vendor';
                    if (id.includes('/firebase')) return 'firebase';
                    if (id.includes('/@codemirror') || id.includes('/@uiw')) return 'codemirror';
                    if (id.includes('/react-markdown') || id.includes('/html-react-parser') || id.includes('/html-dom-parser') || id.includes('/remark-') || id.includes('/rehype-') || id.includes('/micromark') || id.includes('/mdast') || id.includes('/unist') || id.includes('/hast')) return 'markdown';
                    return undefined;
                },
            },
        },
    },
    server: {
        proxy: {
            '/api': {
                target: 'http://localhost:8000',
                changeOrigin: true,
                secure: false,
                rewrite: (path) => path.replace(/^\/api/, ''),
            },
        },
    },
}))
