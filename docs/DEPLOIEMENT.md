# Mettre le tableau en ligne

Durée : environ 20 minutes. Il faut un compte Supabase et un compte Netlify, tous deux gratuits. Vos valeurs réelles remplacent les éléments entre `<chevrons>`.

## 1. Créer le projet Supabase

1. Sur <https://supabase.com/dashboard>, cliquez sur **New project**.
2. Choisissez un nom (`trame`), un mot de passe de base (conservez-le), et la région **Paris**.
3. Patientez jusqu'à ce que le projet soit prêt.

**Connectez-vous ensuite à l'application avec l'adresse e-mail de ce compte Supabase :** le service d'e-mail fourni n'envoie qu'aux membres de votre organisation Supabase, deux fois par heure au maximum. Pour un seul propriétaire, c'est suffisant. Pour plusieurs propriétaires, ajoutez-les à l'équipe ou configurez votre propre service d'envoi (Authentication → Emails → SMTP Settings). Les invités ne reçoivent aucun e-mail.

## 2. Créer les tables

Dans **SQL Editor**, créez une requête, collez le contenu complet du fichier, cliquez sur **Run**. Faites-le dans cet ordre :

1. `supabase/migrations/20261109000000_schema.sql`
2. `supabase/migrations/20261109000100_collaboration.sql`

Chaque exécution doit se terminer par « Success ».

## 3. Régler Supabase

| Où | Réglage |
| --- | --- |
| Authentication → Sign In / Providers | Activer **Allow anonymous sign-ins** (invités sans compte) |
| Realtime → Settings | Désactiver **Allow public access** |

## 4. Récupérer les deux valeurs publiques

Dans **Project Settings → API Keys** et **Data API**, notez :

- l'URL du projet, `https://<projet>.supabase.co` ;
- la clé **publishable** (`sb_publishable_…`).

**Ne copiez jamais la clé `secret` ou `service_role`.**

## 5. Publier sur Netlify

Dans un terminal, à la racine du projet :

```bash
source ~/.nvm/nvm.sh
npx netlify-cli login
npx netlify-cli sites:create --name <nom-du-site>
npx netlify-cli link --name <nom-du-site>
npx netlify-cli env:set VITE_SUPABASE_URL https://<projet>.supabase.co
npx netlify-cli env:set VITE_SUPABASE_PUBLISHABLE_KEY <clé-publishable>
npx netlify-cli deploy --build --prod
```

L'adresse du site s'affiche à la fin : `https://<nom-du-site>.netlify.app`.

## 6. Autoriser l'adresse du site

Dans Supabase, **Authentication → URL Configuration** :

- **Site URL** : `https://<nom-du-site>.netlify.app`
- **Redirect URLs** : ajouter `https://<nom-du-site>.netlify.app/**`

## 7. Vérifier

1. Ouvrez le site, saisissez votre e-mail et cliquez sur le lien reçu.
2. Créez un tableau et un post-it, attendez « Enregistré », rechargez : il est toujours là.
3. Cliquez sur **Partager**, créez un lien, ouvrez-le dans une fenêtre privée, saisissez un prénom.
4. Modifiez un post-it d'un côté : le changement apparaît de l'autre sans recharger.
5. Révoquez le lien : la fenêtre privée indique que l'accès est retiré.

## Publier une mise à jour

```bash
npx netlify-cli deploy --build --prod
```

Si un nouveau fichier est apparu dans `supabase/migrations/`, exécutez-le d'abord dans le SQL Editor.

## Limites de l'offre gratuite

Vérifiées en novembre 2026, à revérifier sur les pages de tarifs.

- **Mise en pause après 7 jours sans activité.** Les données sont conservées ; il faut relancer le projet depuis le tableau de bord Supabase. Prévoyez-le avant un atelier.
- 500 Mo de base de données, 200 connexions simultanées.
- 2 millions de messages temps réel par mois.
- 30 connexions d'invités par heure et par adresse IP, réglable dans Authentication → Rate Limits. À augmenter pour un grand atelier dans un même bureau.

**Sauvegardes :** l'offre gratuite n'en garantit aucune que vous puissiez restaurer vous-même. Exportez régulièrement vos tableaux importants en JSON (menu ☰).
