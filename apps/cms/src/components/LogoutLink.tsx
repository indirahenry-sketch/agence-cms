import React from 'react'

/** Bouton « Se déconnecter » bien visible, en bas du menu latéral et sur le tableau de bord. */
export const LogoutLink: React.FC<{ variant?: 'nav' | 'button' }> = ({ variant = 'nav' }) => (
  <a href="/admin/logout" className={variant === 'nav' ? 'nav__link logout-link' : 'dash__btn dash__btn--danger'}>
    Se déconnecter
  </a>
)

export default LogoutLink
