import React from 'react'

export const metadata = { title: 'Espace de gestion' }

export default function FrontendLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  )
}
