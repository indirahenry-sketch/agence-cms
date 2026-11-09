import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  // Produit un serveur autonome, utilisé par l'image Docker de production
  output: 'standalone',
  outputFileTracingRoot: path.resolve(dirname, '../..'),
  images: {
    localPatterns: [{ pathname: '/api/media/file/**' }],
  },
  // En-têtes de sécurité sur toutes les pages (CMS et sites publics)
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Les pages ne peuvent être affichées dans un cadre que par le CMS lui-même (aperçus du tableau de bord)
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
        ],
      },
    ]
  },
  // Autorise l'ouverture du serveur de dev via le tunnel Cloudflare (pnpm share) ou le Wi-Fi local
  allowedDevOrigins: ['*.trycloudflare.com', '192.168.*.*', '10.*.*.*'],
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }
    return webpackConfig
  },
  turbopack: {
    root: path.resolve(dirname, '../..'),
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
