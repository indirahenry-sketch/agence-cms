# CMS multi-clients de l'agence

Espace de gestion centralisé pour les sites de tes clients : **Payload CMS 3 + Next.js + PostgreSQL**.

## État du projet

| Étape | Contenu | État |
| --- | --- | --- |
| 1. Installation | Monorepo, Docker local (Postgres, MinIO, Mailpit), configuration | ✅ |
| 2. Authentification | Connexion, invitation par e-mail, mot de passe oublié, verrouillage après 5 échecs | ✅ |
| 3. Clients | Fiche client (coordonnées, logo, domaines, couleurs, police, langues, statut) | ✅ |
| 4. Utilisateurs | Super admin, admin client, éditeur ; rôles par client | ✅ |
| 5. Isolation | Règles d’accès + hooks serveur + 33 tests automatiques | ✅ |
| 6. Contenus | Médias/galerie, catégories, événements, tarifs, pages, blog, informations, FR/EN | ✅ |
| 7. Administration | Tableau de bord (super admin et client), support, journal d'audit | 🟡 base faite |
| 8. Sites Next.js | Template multi-clients, revalidation | ⏳ |
| 9. Sécurité | Intégration continue GitHub (tests à chaque envoi) | 🟡 fichier prêt |
| 10. Production | Dockerfile, docker-compose de prod, sauvegardes | 🟡 fichiers prêts, non déployés |

---

## 1. Installer les outils (une seule fois, sur ton PC Windows)

Installe dans cet ordre, en acceptant les options par défaut :

1. **Git** : https://git-scm.com/download/win
2. **Node.js 22 (LTS)** : https://nodejs.org → bouton « LTS »
3. **Docker Desktop** : https://www.docker.com/products/docker-desktop → redémarre le PC après l'installation, puis lance Docker Desktop (la baleine doit être verte).
4. **VS Code** : https://code.visualstudio.com
5. **pnpm** : ouvre *PowerShell* et tape :
   ```powershell
   npm install -g pnpm
   ```
6. **cloudflared** (pour ouvrir le CMS sur ton iPad et ton téléphone) :
   ```powershell
   winget install --id Cloudflare.cloudflared
   ```

Vérifie que tout répond (ferme et rouvre PowerShell avant) :
```powershell
git --version ; node --version ; pnpm --version ; docker --version ; cloudflared --version
```

## 2. Lancer le CMS sur ton PC

Dans PowerShell, place-toi dans le dossier du projet (ex. `cd C:\Users\Noe\agence-cms`), puis :

```powershell
# 1. Installer les dépendances (2-3 minutes la première fois)
pnpm install

# 2. Créer ton fichier de configuration
Copy-Item apps\cms\.env.example apps\cms\.env
```

Ouvre `apps\cms\.env` dans VS Code et change au minimum :
- `PAYLOAD_SECRET` : génère une valeur avec
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `SEED_ADMIN_EMAIL` et `SEED_ADMIN_PASSWORD` : ton compte super admin
- `AGENCY_EMAIL` : l'adresse qui recevra les demandes de support

Puis :

```powershell
# 3. Démarrer la base de données, le stockage et la boîte mail de test
pnpm db:up

# 4. Créer ton compte super admin et un client de démonstration
pnpm seed

# 5. Démarrer le CMS
pnpm dev
```

Ouvre **http://localhost:3000/admin** et connecte-toi avec ton compte.

Comptes créés par `pnpm seed` :
- toi (super admin) : l'e-mail et le mot de passe de ton `.env`
- client de démo (admin client de « Boulangerie Démo ») : `client@demo.test` / `demo-client-2026`

Outils de dev :
- **http://localhost:8025** : tous les e-mails envoyés (invitations, mots de passe oubliés, support)
- **http://localhost:9001** : les fichiers envoyés (identifiant `minio`, mot de passe `minio-secret`)

## 3. L'ouvrir sur ton iPad et ton téléphone (n'importe quel réseau)

Laisse `pnpm dev` tourner, ouvre **un second** PowerShell dans le dossier du projet et tape :

```powershell
pnpm share
```

Au bout de quelques secondes, une adresse s'affiche, du type
`https://mots-au-hasard.trycloudflare.com`. Ouvre-la **suivie de `/admin`** sur ton iPad ou ton téléphone, en 4G ou sur n'importe quel Wi-Fi.

À savoir :
- l'adresse change à chaque `pnpm share` ;
- elle ne fonctionne que si ton PC est allumé et que les deux commandes tournent ;
- elle est publique : seule la page de connexion protège le CMS, donc utilise un vrai mot de passe ;
- `Ctrl + C` dans la fenêtre de `pnpm share` coupe l'accès.

L'adresse fixe et permanente (`https://cms.ton-agence.fr`) viendra avec la mise en ligne (étape 10).

## 4. Utiliser le CMS

**Ajouter un client** : *Clients → Créer*. Remplis le nom et l'identifiant court.

**Inviter un utilisateur** : *Utilisateurs → Créer*, saisis son e-mail, **laisse le mot de passe vide**, et dans *Clients* choisis l'entreprise et le rôle :
- **Administrateur client** : gère tout le contenu, les pages, les informations, ses éditeurs ;
- **Éditeur** : galerie, événements, tarifs, articles, horaires.

La personne reçoit un e-mail avec un lien pour choisir son mot de passe (en dev, regarde sur http://localhost:8025).

**En tant que super admin**, le sélecteur *Client* (en haut à gauche) filtre l'interface sur un client ; vide, tu vois tout.

## 5. Les tests d'isolation

```powershell
pnpm test
```

33 tests vérifient, entre autres, qu'un client ne peut **jamais** lire, créer, modifier, supprimer ou déplacer les données d'un autre client, même en forçant l'identifiant de l'autre client dans ses requêtes. Ils tournent sur une base séparée (`cms_test`), jamais sur tes données.

## 6. Mettre le code sur GitHub

1. Crée un dépôt **privé** sur https://github.com/new (sans README).
2. Dans le dossier du projet :
   ```powershell
   git init
   git add .
   git commit -m "CMS : étapes 1 à 6"
   git branch -M main
   git remote add origin https://github.com/TON-COMPTE/agence-cms.git
   git push -u origin main
   ```
Le fichier `.env` n'est jamais envoyé (il est dans `.gitignore`). À chaque `git push`, GitHub relance automatiquement les tests (onglet *Actions*).

---

## Organisation du code

```
agence-cms/
├─ apps/cms/                 Le CMS (Payload + Next.js)
│  ├─ src/access/            Qui a le droit de faire quoi (isolation des clients)
│  ├─ src/hooks/             Vérifications serveur avant/après enregistrement
│  ├─ src/collections/       Les types de données (clients, tarifs, pages…)
│  ├─ src/components/        Écrans ajoutés à l'admin (tableau de bord)
│  ├─ src/migrations/        Évolutions de la base, versionnées
│  ├─ src/scripts/seed.ts    Création du premier compte
│  └─ tests/                 Tests automatiques
├─ infra/                    Docker (dev et prod), scripts de sauvegarde
└─ .github/workflows/        Tests automatiques sur GitHub
```

## Indépendance des fournisseurs

Aucun code ne dépend de Supabase ou de Cloudflare : tout passe par des variables du `.env`.

| Brique | En dev | Production gratuite | Tes serveurs |
| --- | --- | --- | --- |
| Base | Postgres (Docker) | Supabase | Postgres (Docker) |
| Fichiers | MinIO | Cloudflare R2 | MinIO |
| E-mails | Mailpit | Brevo (SMTP) | n'importe quel SMTP |

Un test bloque toute importation du SDK Supabase.

## Modifier les types de données

Après avoir modifié un fichier de `src/collections/` :

```powershell
pnpm --filter cms generate:types       # met à jour les types TypeScript
pnpm --filter cms generate:importmap   # si tu as ajouté un composant d'admin
pnpm --filter cms migrate:create nom-du-changement   # AVANT de mettre en production
```

En dev, la base se met à jour toute seule. En production, **uniquement** par les fichiers de migration.

## Problèmes fréquents

- **`pnpm db:up` échoue** : Docker Desktop n'est pas lancé (la baleine doit être verte).
- **Port 5432 déjà utilisé** : un autre PostgreSQL tourne sur ton PC ; arrête-le ou change le port dans `infra/docker-compose.dev.yml` et `DATABASE_URI`.
- **Question « data loss will occur… (y/N) » au démarrage** : un changement de structure supprimerait des données de dev. Réponds `y` si ce ne sont que des données de test, sinon `N` et demande-moi.
- **Repartir de zéro en dev** : `pnpm db:down`, puis `docker volume rm agence-cms-dev_pgdata`, puis `pnpm db:up` et `pnpm seed`.

## Mise en ligne de test (gratuite) : Render + Supabase

Pour les tests, le CMS tourne gratuitement sur Render, avec la base et les photos chez Supabase.
Adresse fixe : `https://<nom-du-service>.onrender.com`. Le serveur s'endort après 15 minutes sans visite et met environ une minute à se réveiller.

1. **Image Docker** : à chaque `git push` sur `main`, GitHub construit l'image et la publie dans `ghcr.io/<compte>/agence-cms` (onglet *Actions*, workflow « Image Docker »).
2. **Render** : *New → Web Service → Existing image*, image `ghcr.io/<compte>/agence-cms:latest`, avec un identifiant GitHub (jeton `read:packages`), offre **Free**.
3. **Variables d'environnement** sur Render : `PAYLOAD_SECRET`, `DATABASE_URI` (Supabase, *Session pooler*), `PUBLIC_SERVER_URL` (l'adresse onrender.com), `AGENCY_EMAIL`, et pour les photos `S3_BUCKET`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE=true` (Supabase Storage, compatible S3).
4. Au premier démarrage, les migrations créent les tables. Ouvre `/admin` : l'écran **« Créer le premier utilisateur »** apparaît, et ce premier compte devient super administrateur. Cet écran disparaît ensuite.

Pour une mise à jour, il suffit de faire un `git push`, puis *Manual Deploy → Deploy latest reference* sur Render.

## Sauvegarde et restauration

Voir `infra/scripts/backup.sh` et `infra/scripts/restore.sh` (utilisés sur le serveur à l'étape 10). Une sauvegarde se teste en la restaurant dans une base vide.
