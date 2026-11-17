# 2iE Marketplace

Marketplace interne des étudiants de l'Institut 2iE à Ouagadougou. Application PWA construite avec Next.js 16, TypeScript, Prisma et Supabase.

## 🚀 Technologies

- **Framework** : Next.js 16 (App Router)
- **Langage** : TypeScript
- **Base de données** : PostgreSQL (Supabase)
- **ORM** : Prisma
- **Authentification** : Session JWT avec bcrypt
- **Paiement** : Cash + CinetPay Mobile Money
- **Styling** : Tailwind CSS
- **Validation** : Zod

## 📋 Prérequis

- Node.js 18+ et npm
- Un projet Supabase configuré
- (Optionnel) Un compte CinetPay pour les paiements Mobile Money

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

# CinetPay (optionnel, pour Mobile Money)
CINETPAY_API_KEY=""
CINETPAY_SITE_ID=""
CINETPAY_API_URL="https://api-checkout.cinetpay.com/v2"

# Commission plateforme en points de base (100 = 1%)
PLATFORM_FEE_BPS="0"
```

### 4. Synchroniser la base de données

**⚠️ ATTENTION** : Ces commandes vont réinitialiser complètement votre base de données !

```bash
# Pousser le schéma vers Supabase (crée les tables)
npx prisma db push

# Peupler avec les données de démonstration
npm run db:seed
```

### 5. Lancer en développement

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

### 5. Configuration CinetPay (optionnel)

Pour activer les paiements Mobile Money :

1. Créer un compte marchand sur [CinetPay](https://cinetpay.com)
2. Récupérer `CINETPAY_API_KEY` et `CINETPAY_SITE_ID`
3. Les ajouter aux variables d'environnement

## 🔐 Gestion des rôles

### Vendeurs

- **Email requis** : Format strict `prenom.nom@2ie-edu.org`
- Toute autre extension est **refusée** (y compris `@2ie.bf`)
- Validation côté serveur ET client

### Clients

- **Email accepté** : N'importe quelle adresse email valide
- Pas de restriction de domaine

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
│   ├── uploads/            # Images produits (local)
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
