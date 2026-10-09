import { defineConfig, type UserConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(async ({ mode, command }): Promise<UserConfig> => {
  const isProduction = mode === 'production';
  const isBuild = command === 'build';
  
  let pwaPlugin: any = null;
  if (isBuild) {
    try {
      const { VitePWA } = await import('vite-plugin-pwa');
      pwaPlugin = VitePWA;
    } catch (e: any) {
      console.warn('[Vite] Could not load VitePWA plugin:', e?.message || e);
    }
  }
  
  return {
    plugins: [
      react() as PluginOption,
      ...(pwaPlugin ? [pwaPlugin({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icons/*', 'manifest.webmanifest'],
        manifest: {
          id: 'slflix',
          name: 'SLFLIX PRO',
          short_name: 'SLFLIX',
          description: 'SLFLIX PRO - Free Movies, TV Shows & Live TV Streaming',
          theme_color: '#0a0a0f',
          background_color: '#0a0a0f',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/icons/icon-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/icons/icon-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/icons/slflix.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable'
            }
          ]
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] }
              }
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] }
              }
            },
            {
              urlPattern: /\/api\/(tv|home|movies|series|search|metadata|cineverse|omegatech).*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-metadata-cache',
                expiration: {
                  maxEntries: 150,
                  maxAgeSeconds: 60 * 60 * 24 * 7
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              urlPattern: /\/api\/tv\/img.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'tv-images-cache',
                expiration: {
                  maxEntries: 200,
                  maxAgeSeconds: 60 * 60 * 24 * 14
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            }
          ]
        },
        devOptions: {
          enabled: true,
          type: 'module'
        }
      })] : [])
    ],
    build: {
      outDir: 'dist',
      sourcemap: false,
      minify: 'esbuild',
      target: 'es2020',
      cssCodeSplit: true,
      assetsInlineLimit: 4096,
      reportCompressedSize: false,
      emptyOutDir: true,
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes('node_modules')) {
              if (
                id.includes('react') ||
                id.includes('react-dom') ||
                id.includes('react-router-dom') ||
                id.includes('framer-motion') ||
                id.includes('motion')
              ) {
                return 'vendor-framework';
              }
              if (id.includes('three') || id.includes('@paper-design')) {
                return 'vendor-three';
              }
              if (id.includes('hls.js')) {
                return 'vendor-hls';
              }
              if (id.includes('lucide-react')) {
                return 'vendor-icons';
              }
              return 'vendor-libs';
            }
          },
          chunkFileNames: isProduction ? 'assets/[hash].js' : 'assets/[name]-[hash].js',
          entryFileNames: isProduction ? 'assets/[hash].js' : 'assets/[name]-[hash].js',
          assetFileNames: isProduction ? 'assets/[hash].[ext]' : 'assets/[name]-[hash].[ext]',
        },
      },
    },
    esbuild: {
      drop: isProduction ? ['console', 'debugger'] : [],
      legalComments: 'none'
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'hls.js', 'lucide-react'],
      exclude: [],
    },
    define: {
      __DEV__: !isProduction,
    },
    
    server: {
      host: true,
      hmr: {
        port: 24678
      },
      proxy: {
        '/api-omegatech': {
          target: 'https://api.omegatech.app',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/api-omegatech/, ''),
          timeout: 15000
        },
        '/api-metadata': {
          target: 'https://h5-api.aoneroom.com/wefeed-h5api-bff',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/api-metadata/, ''),
          headers: {
            'Origin': 'https://moviebox.ph',
            'Referer': 'https://moviebox.ph/'
          },
          timeout: 15000
        },
        '/api-player': {
          target: 'https://123movienow.cc/wefeed-h5api-bff',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/api-player/, ''),
          headers: {
            'Origin': 'https://123movienow.cc',
            'Referer': 'https://123movienow.cc/'
          },
          timeout: 15000
        },
        '/api-cineverse': {
          target: 'https://cineverse.name.ng',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/api-cineverse/, ''),
          headers: {
            'Origin': 'https://cineverse.name.ng',
            'Referer': 'https://cineverse.name.ng/'
          },
          timeout: 15000
        },
        '/api-stream': {
          target: 'https://movieapi.giftedtech.co.ke',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/api-stream/, ''),
          headers: {
            'Origin': 'https://movieapi.giftedtech.co.ke',
            'Referer': 'https://movieapi.giftedtech.co.ke/'
          },
          timeout: 15000
        }
      }
    },
    // Production server configuration for standalone preview
    preview: {
      port: Number(process.env.PORT) || 3000,
      host: true,
      proxy: {
        '/api-omegatech': {
          target: 'https://api.omegatech.app',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/api-omegatech/, ''),
          timeout: 15000
        },
        '/api-metadata': {
          target: 'https://h5-api.aoneroom.com/wefeed-h5api-bff',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/api-metadata/, ''),
          headers: {
            'Origin': 'https://moviebox.ph',
            'Referer': 'https://moviebox.ph/'
          },
          timeout: 15000
        },
        '/api-player': {
          target: 'https://123movienow.cc/wefeed-h5api-bff',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/api-player/, ''),
          headers: {
            'Origin': 'https://123movienow.cc',
            'Referer': 'https://123movienow.cc/'
          },
          timeout: 15000
        },
        '/api-cineverse': {
          target: 'https://cineverse.name.ng',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/api-cineverse/, ''),
          headers: {
            'Origin': 'https://cineverse.name.ng',
            'Referer': 'https://cineverse.name.ng/'
          },
          timeout: 15000
        },
        '/api-stream': {
          target: 'https://movieapi.giftedtech.co.ke',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/api-stream/, ''),
          headers: {
            'Origin': 'https://movieapi.giftedtech.co.ke',
            'Referer': 'https://movieapi.giftedtech.co.ke/'
          },
          timeout: 15000
        }
      }
    }
  };
});
