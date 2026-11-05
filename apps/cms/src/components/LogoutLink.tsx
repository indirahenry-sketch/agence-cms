import React from 'react'

/** Bouton « Se déconnecter » bien visible, en bas du menu latéral et sur le tableau de bord. */
export const LogoutLink: React.FC<{ variant?: 'nav' | 'button' }> = ({ variant = 'nav' }) => (
  <a
    href="/admin/logout"
    className={variant === 'nav' ? 'logout-link' : 'welcome__button welcome__button--ghost'}
    style={
      variant === 'nav'
        ? { display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, padding: '10px 0', fontWeight: 600, color: 'var(--theme-error-500)', textDecoration: 'none' }
        : undefined
    }
  >
    ⎋ Se déconnecter
  </a>
)

export default LogoutLink
