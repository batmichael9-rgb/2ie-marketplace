# Audit de sécurité — 2iE Market

Date : 27 novembre 2026. Périmètre : `src/`, routes API, Server Actions, configuration Next.js, stockage Supabase et schéma Prisma.

## Synthèse

L'application est majoritairement saine : les prix et frais sont recalculés côté serveur, les accès aux commandes/messages/produits vérifient le propriétaire, et aucun secret `SUPABASE_SERVICE_ROLE_KEY` n'est préfixé `NEXT_PUBLIC_`. Les failles corrigées concernaient surtout la confiance accordée aux webhooks de paiement et le durcissement des entrées.

## Failles détectées et correctifs

### Critique

1. **Webhook Payin : commande créditée sans preuve de paiement**
   - `POST /api/payments/webhook` acceptait un `personal_Info.orderId` sans token et pouvait appliquer `SUCCEEDED` alors que la revérification serveur était absente ou encore `PENDING`. Un appelant connaissant un identifiant de commande pouvait donc la marquer payée.
   - Correctif : token Payin obligatoire, correspondance avec `Payment.providerTxnId`, et crédit uniquement si `checkPaymentStatus()` renvoie `SUCCEEDED`. Le montant vérifié doit correspondre au montant de la commande.

### Élevé

2. **Webhook Payout : statut de virement pris depuis le corps de la requête**
   - Le corps `completed`/`paid` suffisait lorsque Money Fusion répondait `PENDING`.
   - Correctif : seul `checkPayoutStatus() === PAID` clôture un virement ; seul `CANCELLED` le déclare en échec.

3. **Webhook PSP générique sans jeton**
   - La vérification de signature n'était appliquée que si un `notifyToken` était présent ; un corps sans jeton poursuivait le traitement.
   - Correctif : jeton obligatoire et strictement égal à celui du paiement, sinon `401`.

4. **Cron de reversement ouvert en production**
   - Sans `CRON_SECRET`, n'importe qui pouvait déclencher `/api/cron/auto-payout`.
   - Correctif : `503` en production si le secret est absent ; secret obligatoire via `Authorization: Bearer`.

5. **Absence d'en-têtes de sécurité HTTP**
   - Correctif dans `next.config.ts` : CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` et HSTS en production.

### Moyen

6. **Upload d'image : type MIME déclaré par le client**
   - Correctif : lecture de la signature binaire (JPEG, PNG, GIF, WebP) dans `src/lib/storage.ts` ; un fichier dont le contenu ne correspond pas au type annoncé est refusé. Taille limitée à 5 Mo et extension déduite du type réel.

7. **Recherche IA sans limite**
   - Endpoint public pouvant appeler un modèle payant sans plafond.
   - Correctif : 30 requêtes/minute par IP et requête limitée à 300 caractères.

8. **Pas de protection contre la force brute à la connexion**
   - Correctif : 20 tentatives par IP et 8 par adresse email sur 10 minutes.

9. **Codes de partage inter-boutiques**
   - Un code pouvait être envoyé avec n'importe quel produit, gonflant les conversions d'un autre vendeur.
   - Correctif : le code doit appartenir au produit **et** à la boutique commandés (checkout et `/api/payments/initialize`).

### Faible

10. **Événement Payout marqué traité alors que le statut était indécis**
    - Correctif : un statut `PENDING` reste non traité, permettant à un nouvel appel ou à la réconciliation 48 h de finaliser.

11. **Anciens logos verts encore servis**
    - Correctif : `manifest.json` et `sw.js` ne référencent plus que `/icon.jpg` ; `public/icons/`, `public/icon.svg`, `src/app/apple-icon.png` et l'ancienne route `/og-default.png` ont été supprimés. Les aperçus Open Graph retombent sur `/logo.jpg`.

## Points vérifiés sans faille

- **IDOR** : commandes (acheteur/vendeur/admin), profil (session uniquement), produits (propriétaire ou admin), conversations (membre), abonnements Push (propriétaire), reversements (vendeur propriétaire ou admin).
- **Paiements** : montants, commission 5 % et nets recalculés depuis le prix en base ; le client ne peut imposer ni prix ni statut.
- **Secrets** : `SUPABASE_SERVICE_ROLE_KEY`, `MONEYFUSION_PRIVATE_KEY`, `AUTH_SECRET` et `GEMINI_API_KEY` restent côté serveur ; `.env` n'est pas versionné.
- **Injections** : Prisma paramètre les requêtes ; l'unique SQL brut (`reserveStock`) utilise un tagged template paramétré.
- **XSS** : React échappe les descriptions, avis et messages ; le seul `dangerouslySetInnerHTML` est le script de thème constant du layout.
- **Validation** : toutes les Server Actions et routes API valident leurs entrées avec Zod, y compris les champs facultatifs (`null`/`""`).

## Limites et recommandations

- **RLS Supabase** : l'application n'utilise que Prisma côté serveur (aucun client Supabase public). Les politiques RLS ne s'appliquent donc pas au flux actuel ; si un client Supabase `anon` est introduit, il faudra activer RLS sur `profiles`, `shops`, `products`, `orders`, `reviews`, `messages` et interdire toute écriture hors Edge Function/service role.
- Le limiteur de débit est en mémoire (une instance). Sur plusieurs instances, utiliser un store partagé (Upstash/Redis).
- Le changement d'email depuis `/profil` ne demande pas de revérification : à renforcer si l'email devient un identifiant sensible.
- Configurer `MONEYFUSION_WEBHOOK_SECRET` en production ; la vérification serveur reste la protection principale.
