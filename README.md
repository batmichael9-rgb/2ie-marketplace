# 2iE Marketplace

Marketplace interne des étudiants de l'Institut 2iE à Ouagadougou. Application PWA construite avec Next.js 16, TypeScript, Prisma et Supabase.

## 🚀 Technologies

- **Framework** : Next.js 16 (App Router)
- **Langage** : TypeScript
- **Base de données** : PostgreSQL (Supabase)
- **ORM** : Prisma
- **Authentification** : Session JWT avec bcrypt
- **Paiement** : Money Fusion (Orange Money, Moov Money, Wave, carte bancaire) — Payin acheteur + Payout vendeur 95 %
- **Styling** : Tailwind CSS
- **Validation** : Zod

## 📋 Prérequis

- Node.js 18+ et npm
- Un projet Supabase configuré
- (Optionnel) Un compte marchand Money Fusion pour les paiements en ligne et les reversements

## 🛠️ Installation locale

### 1. Cloner le dépôt

```bash
git clone https://github.com/batmichael9-rgb/2ie-marketplace.git
cd 2ie-marketplace
```

### 2. Installer les dépendances

```bash
npm install
```

### 3. Configuration de l'environnement

Créer un fichier `.env` à la racine du projet :

```bash
cp .env.example .env
```

Renseigner les variables suivantes dans `.env` :

```env
# Base de données Supabase
DATABASE_URL="postgresql://postgres.<project-ref>:<mot-de-passe>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require"

# Secret pour les sessions (générer avec: openssl rand -base64 48)
AUTH_SECRET="votre-secret-de-session-32-caracteres-minimum"

# URL publique de l'application
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Money Fusion (optionnel, paiements en ligne + reversements vendeur)
MONEYFUSION_API_URL="https://pay.moneyfusion.net/api/v1/payin"
MONEYFUSION_PRIVATE_KEY=""
# Proxy sortant à IP fixe (Fixie sur Vercel)
FIXIE_URL=""

# Commission plateforme en points de base (100 = 1 %, 500 = 5 %)
PLATFORM_FEE_BPS="500"

# Photos produits (Supabase Storage)
SUPABASE_URL="https://<project-ref>.supabase.co"
SUPABASE_SERVICE_ROLE_KEY=""
SUPABASE_STORAGE_BUCKET="products"

# Codes OTP par email (Resend ou Brevo)
RESEND_API_KEY=""
# BREVO_API_KEY=""
EMAIL_FROM="2iE Market <onboarding@resend.dev>"
```

### 4. Stockage des photos et envoi des emails

Les photos produits ne sont pas écrites sur le disque (Vercel est en lecture
seule) : elles sont envoyées dans un bucket public Supabase Storage.

1. Supabase > **Project Settings > API** : copier l'URL du projet et la clé
   **service_role** dans `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`.
2. Le bucket `products` (public) est créé automatiquement au premier envoi,
   ou manuellement dans **Storage > New bucket** (cocher « Public »).
3. Créer une clé API sur [Resend](https://resend.com) ou
   [Brevo](https://brevo.com), puis la placer dans `RESEND_API_KEY` ou
   `BREVO_API_KEY` et renseigner `EMAIL_FROM`.

> **Resend** offre 3 000 emails/mois mais, sans domaine vérifié, l'adresse
> `onboarding@resend.dev` ne peut écrire qu'au propriétaire du compte. Pour
> envoyer les codes à tous les utilisateurs (dont les adresses
> `@2ie-edu.org`), il faut vérifier un domaine. **Brevo** (300 emails/jour)
> permet de démarrer sans domaine en vérifiant simplement une adresse
> expéditrice.

### 5. Synchroniser la base de données

**⚠️ ATTENTION** : Ces commandes vont réinitialiser complètement votre base de données !

```bash
# Pousser le schéma vers Supabase (crée les tables)
npx prisma db push

# Peupler avec les données de démonstration
npm run db:seed
```

### 6. Lancer en développement

```bash
npm run dev
```

L'application sera accessible sur [http://localhost:3000](http://localhost:3000)

## 🔑 Comptes de démonstration

Après avoir exécuté `npm run db:seed`, les comptes suivants sont disponibles :

### Vendeurs

- Email : `fatou.ouedraogo@2ie-edu.org` / Mot de passe : `Demo2024!`
- Email : `ibrahim.kore@2ie-edu.org` / Mot de passe : `Demo2024!`
- Email : `awa.sawadogo@2ie-edu.org` / Mot de passe : `Demo2024!`

### Client

- Email : `etudiant@2ie.bf` / Mot de passe : `Client2024!`

## 📦 Déploiement en production

### 1. Configuration Supabase

1. Créer un projet sur [Supabase](https://supabase.com)
2. Récupérer la **Connection String** (Session Pooler recommandé)
3. Mettre à jour `DATABASE_URL` dans les variables d'environnement
4. Créer un bucket **public** `products` dans **Storage** (ou laisser la
   création automatique au premier envoi) et renseigner `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY` et `SUPABASE_STORAGE_BUCKET`

### 2. Générer un secret de session

```bash
openssl rand -base64 48
```

Copier le résultat dans `AUTH_SECRET`.

### 3. Pousser le schéma et les données

```bash
# En production, utiliser db push
npx prisma db push

# Peupler la base
npm run db:seed
```

### 4. Déployer sur Vercel (recommandé)

```bash
# Installer Vercel CLI
npm install -g vercel

# Déployer
vercel --prod
```

**Variables d'environnement Vercel** : Configurer toutes les variables de `.env` dans les paramètres du projet Vercel.

### 5. Configuration Money Fusion (optionnel)

Pour activer les paiements en ligne et les reversements vendeur :

1. Créer un compte marchand Money Fusion
2. Récupérer la clé privée (`MONEYFUSION_PRIVATE_KEY`) et l'URL de Payin (`MONEYFUSION_API_URL`)
3. Définir `FIXIE_URL` en production : tous les appels sortent par ces IP fixes, à autoriser côté Money Fusion
4. Renseigner les URL de notification `https://<votre-domaine>/api/payments/webhook` (Payin) et `https://<votre-domaine>/api/payouts/webhook` (Payout)
5. Exécuter les migrations `prisma/migrations/20261125120000_moneyfusion_v1/migration.sql` puis `prisma/migrations/20261125160000_auto_payout/migration.sql` dans l'éditeur SQL Supabase
6. (Recommandé) Définir `CRON_SECRET` : le cron quotidien `/api/cron/auto-payout` (configuré dans `vercel.json`) libère automatiquement les 95 % 48 h après une livraison non confirmée

Le flux de reversement est autonome : confirmation de réception par l'acheteur → virement immédiat ; à défaut, le cron et les chargements de tableau de bord déclenchent l'auto-release après 48 h. `/espace-admin` ne sert qu'au suivi des commissions et à la relance d'un virement en échec.

## 🔐 Gestion des rôles

### Vendeurs

- **Email requis** : Format strict `prenom.nom@2ie-edu.org`
- Toute autre extension est **refusée** (y compris `@2ie.bf`)
- Validation côté serveur ET client

### Clients

- **Email accepté** : N'importe quelle adresse email valide
- Pas de restriction de domaine

## 🔐 Vérification par code OTP

L'inscription (clients **et** vendeurs) et la réinitialisation du mot de
passe se font en deux étapes :

1. L'utilisateur saisit son email. Un code à **6 chiffres**, valable
   **10 minutes**, est envoyé par email. Les vendeurs doivent utiliser
   `prenom.nom@2ie-edu.org` ; les clients peuvent utiliser n'importe quelle
   adresse valide.
2. L'utilisateur saisit le code, choisit son mot de passe (hash bcrypt coût
   12) et complète son profil (prénom, nom, et nom de boutique pour un
   vendeur).

Sécurité : seul le hash bcrypt du code est stocké, un code ne peut être
utilisé qu'une fois, 5 tentatives maximum, et une minute d'attente entre deux
envois. En développement, si aucun service email n'est configuré, le code est
affiché dans la console du serveur.

Le lien **« Mot de passe oublié ? »** de la page de connexion suit le même
parcours et permet aussi aux comptes historiques (sans mot de passe) d'en
définir un.

## 📱 PWA (Progressive Web App)

L'application est installable sur mobile et desktop :

- Manifest : `/app/manifest.ts`
- Service Worker : `/public/sw.js`
- Page hors ligne : `/public/offline.html`

## 🗂️ Structure du projet

```
2ie-marketplace/
├── prisma/
│   ├── schema.prisma       # Schéma de base de données
│   └── seed.ts             # Données de démonstration
├── public/
│   ├── sw.js               # Service worker PWA
│   └── offline.html        # Page hors ligne
├── src/
│   ├── app/                # Pages Next.js (App Router)
│   │   ├── connexion/      # Page de connexion
│   │   ├── inscription/    # Page d'inscription
│   │   ├── espace-vendeur/ # Tableau de bord vendeur
│   │   ├── commander/      # Tunnel de commande
│   │   └── mes-commandes/  # Historique client
│   ├── components/         # Composants React
│   ├── lib/                # Utilitaires (auth, domain, validators)
│   └── server/actions/     # Server Actions
├── .env.example            # Exemple de configuration
├── package.json
└── README.md
```

## 🛠️ Commandes utiles

```bash
# Développement
npm run dev

# Build de production
npm run build

# Lancer en production
npm start

# Générer le client Prisma
npx prisma generate

# Pousser le schéma vers la DB
npx prisma db push

# Peupler la base
npm run db:seed

# Réinitialiser complètement la DB
npm run db:reset

# Ouvrir Prisma Studio (interface DB)
npm run db:studio
```

## 🔧 Migration de l'ancienne version

Si vous aviez une version sans mot de passe :

1. **Sauvegarder vos données** avant toute migration
2. Mettre à jour le schéma : `npx prisma db push`
3. Tous les utilisateurs devront se **réinscrire** avec un mot de passe

## 🐛 Résolution de problèmes

### Erreur de connexion à la base de données

- Vérifier que `DATABASE_URL` est correct
- Utiliser le **Session Pooler** de Supabase (port 5432)
- S'assurer que `?sslmode=require` est présent

### "AUTH_SECRET must be at least 32 characters"

- Générer un nouveau secret : `openssl rand -base64 48`
- Le copier dans la variable `AUTH_SECRET`

### Les images ne s'affichent pas en production

- Migrer vers Supabase Storage (à venir)
- En attendant, les images sont dans `/public/uploads/products/`

## 📄 Licence

Projet privé - Institut 2iE

## 👥 Auteur

Développé pour la communauté étudiante de l'Institut 2iE à Ouagadougou.
