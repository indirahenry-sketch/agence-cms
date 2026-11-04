import { redirect } from 'next/navigation'

// Le CMS n'a pas de site public : l'accueil renvoie vers l'espace d'administration
export default function Home() {
  redirect('/admin')
}
