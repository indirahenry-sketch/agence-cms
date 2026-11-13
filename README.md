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
| 7. Administration | Tableau de bord, visites sans cookie, support, journal d'audit, export et duplication de client | ✅ |
| 8. Sites | Thème générique pour tout nouveau client + maquette sur mesure (Poigny), domaines, SEO | ✅ |
| 9. Sécurité | 62 tests automatiques à chaque envoi, rôles rédacteur/lecteur, en-têtes de sécurité | ✅ |
| 10. Production | Render + Supabase, réveil automatique, sauvegarde nocturne avec test de restauration | 🟡 secrets de sauvegarde à ajouter |

### Interface 4 (9 novembre 2026)

- **Accueil client** « mon site en un coup d'œil » : grande vignette du site, une carte par section (Photos, Agenda, Blog, Tarifs) avec son état, et un **assistant « Bien démarrer »** en 4 étapes (logo, horaires, 3 photos, premier tarif) qui disparaît une fois fait.
- **Tous les sites** (agence) : recherche, filtres par étiquette et statut, tri, bandeaux Maintenance / Suspendu, bouton « Voir comme le client ». Nouveaux champs de fiche client : étiquettes et mode maintenance.
- **Médiathèque en grille** : aperçus, filtres par type et catégorie, envoi multiple par glisser-déposer, actions groupées ; **recadrage et point focal** des photos.
- **Agenda en calendrier** coloré par type ; clic sur un jour pour créer un événement ce jour-là.
- **Listes** : miniature, pastille Publié / Brouillon / Programmé, date relative, filtres en un clic. **Menus** : chaque lien affiche son texte et sa destination.
- **Ordre par glisser-déposer** des tarifs, services et photos ; **corbeille** de 30 jours avec « Restaurer ».
- **Aperçu en direct** : écran partagé formulaire / site (téléphone, tablette, ordinateur), rechargé à chaque sauvegarde automatique.
- **Barre du haut** : recherche globale (Ctrl+K), cloche de notifications, bouton soleil / lune (thème sombre). Réponse de l'agence sur les demandes de support.
- **Téléphone** : barre en bas (Accueil, Photos, +, Agenda, Plus) et listes en cartes.

### Version 3 (9 novembre 2026)

- **Nouveau client sans code** : un client sans maquette a automatiquement un site à ses couleurs, sa police et son logo (fiche client → onglet « Site et domaine »). S'il a une page publiée d'adresse `accueil`, elle devient l'accueil ; sinon l'accueil est composé de ses services, tarifs, photos, actualités, coordonnées et horaires.
- **Articles** : chaque article a sa page (`/blog/<adresse>`), une date de publication future le programme, bouton « Aperçu » sur les pages et articles, sauvegarde automatique des brouillons.
- **Rôles** : Rédacteur (brouillons, ne publie pas) et Lecteur (consultation seule) en plus d'Administrateur et Éditeur.
- **Clients** : statut « Archivé » ; supprimer un client supprime enfin tous ses contenus et fichiers ; outils de l'agence sur la fiche : exporter (JSON), dupliquer comme modèle.
- **Référencement** : case « Site visible sur Google », sitemap.xml, robots.txt, fiche établissement pour Google, redirections (menu Site → Redirections).
- **Domaines** : un domaine saisi dans la fiche client (ex. `www.client.fr`) sert le site sans le préfixe `/sites/…` dès qu'il pointe vers le serveur. L'admin n'est jamais accessible par le domaine d'un client.
- **Visites** : compteur sans cookie ni adresse IP sur le tableau de bord (pas de bandeau de consentement).
- **Serveur** : ne s'endort plus sur Render (il s'appelle lui-même toutes les 10 min ; `KEEP_AWAKE=false` pour couper) ; adresse de contrôle `/health`.
- **Sauvegarde** : chaque nuit (GitHub → Actions → « Sauvegarde »), base + test de restauration, photos le dimanche, gardées 14 jours. **À activer** : ajouter les secrets listés en tête de `.github/workflows/backup.yml`.

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

---

## Sites des clients servis par le CMS

Chaque site est une maquette HTML (dossier `apps/cms/src/sites/<client>/`) dont les repères `{{…}}` sont remplis à chaque visite avec les contenus du client. Adresse : **`<adresse du CMS>/sites/<identifiant court du client>`**.

Pour les Écuries de Poigny, le CMS pilote : nom, logo, téléphone, e-mail, adresse, horaires (et le badge « Ouvert / Fermé »), Instagram, tarifs (un onglet par catégorie, « Prix affiché » pour une fourchette, « Mettre en avant »), photos cochées « Afficher dans la galerie », prochains stages (Événements). Les réglages « Afficher les tarifs / la galerie / les événements » de la fiche client masquent les sections.

- Les photos passent par `/sites/<client>/media/<id>` : seules les photos publiques (galerie, logo, événements) du client concerné sont servies, le stockage reste privé.
- Le site est marqué « Maquette » et masqué des moteurs de recherche tant que le client n'a pas validé.
- Le client est créé par la migration `20261104_211500_ecuries_poigny` (rien n'est recréé s'il existe déjà).

**Haras de Montesugui** (`/sites/haras-montesugui`) : duplication de la V10 de Poigny avec un habillage classique (bordeaux, ivoire et or, polices Cormorant Garamond / EB Garamond / Cinzel, vouvoiement). Mêmes sections pilotées par le CMS. Créé au démarrage du CMS et par `pnpm seed` (fichier `src/sites/haras-montesugui/seed.ts`), avec les tarifs, services, agenda et photos de démonstration de Poigny. **À compléter dans la fiche client** : téléphone, e-mail et adresse (valeurs provisoires `06 00 00 00 00` / `contact@haras-montesugui.fr`), logo (le logo du haras — sceau bordeaux et or, tête de cheval — est affiché tant qu'aucun autre n'est envoyé), photos (la vue aérienne, l'allée des boxes et le cheval au paddock ouvrent la galerie ; les autres viennent de Poigny), puis publication des mentions légales. La bannière d'accueil est la vue aérienne du haras.

**Centre Équestre de Sourdun** (`/sites/centre-equestre-sourdun`) : dernière version de sa maquette (accueil, cours et horaires, tarifs, réserver, blog). Gérés dans le CMS : nom, logo, coordonnées (y compris l'e-mail du formulaire « Réserver »), activités et leurs profils (« Pour mon enfant », « École ou groupe »…), photos, articles, agenda, menus, bannières et pop-ups. Le planning des cours et les grilles tarifaires restent dans la maquette (`src/sites/centre-equestre-sourdun/`). Migration `20261113_084741_cms_v7_sourdun` : nouveaux profils de services, icônes (groupe, balade, écurie) et sections de menu (Activités, Cours et horaires, Réserver), ajouts seulement.

---

## Version 2 (6 novembre 2026)

**Nouveau dans le CMS :** menus de navigation (principal, secondaire, pied de page, sous-menus, glisser-déposer), bannières et pop-ups datés, services, tags, catégories renommables par type (Photos, Services, Tarifs, Articles, Blog), blocs de page (titre, section texte + image + boutons, vidéo, groupe de boutons), vidéos et documents dans la médiathèque (50 Mo max), type et horaires des événements, journal des connexions.

**Site public :** la V10 « agenda + blog » des Écuries de Poigny lit désormais menus, services, agenda, articles, bannières et pop-ups depuis le CMS. Les pages publiées sont servies à `/sites/<client>/<adresse-de-la-page>`.

**Sécurité :** un admin client ne peut plus modifier le mot de passe, l'e-mail ou supprimer le compte d'un membre qui appartient aussi à un autre client ; un client suspendu ne peut plus se connecter ni rien modifier ; le logo doit venir de la médiathèque du client ; les liens « javascript: » sont refusés ; les captures du support restent privées.

**Interface :** thème clair (fond lavande, accent violet, menu à icônes), tableau de bord avec chiffres clés, vignettes des sites et raccourcis clients.

Audit complet : voir le document « Audit du CMS multi-sites ».

---

## Version 5 (9 novembre 2026)

- **Modèles de pages** : chaque nouveau client reçoit « Mentions légales », « Politique de confidentialité » et « Contact » en brouillon, pré-remplis avec sa fiche (les [crochets] restent à compléter). Bouton « Ajouter les pages légales et contact » dans la fiche client pour les clients existants ; la duplication recrée ces pages au nom du nouveau client.
- **Annonces aux clients** (groupe Agence) : messages de l'agence affichés en haut du tableau de bord des clients visés (tous ou certains), entre deux dates, masquables par le client.
- **Modifier depuis le site** : un utilisateur connecté au CMS qui visite `/sites/<client>` voit une barre « Mode édition » et un crayon sur chaque section (photos, services, tarifs, agenda, articles, coordonnées, menu, bannière) qui ouvre le bon écran. Jamais pour les visiteurs, les lecteurs, les autres clients, sur le domaine du client ni dans les vignettes.
- Migration `20261109_053121_cms_v5_annonces` ; tests : 76 (8 nouveaux).
