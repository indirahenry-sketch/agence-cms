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
