# Mettre le tableau en ligne

Durée : environ 20 minutes. Sur l'offre gratuite, les modèles d'e-mail de Supabase ne sont pas modifiables : la première connexion se fait par le lien reçu, puis on définit un mot de passe depuis « Tableaux ». Il faut un compte Supabase et un compte Netlify, tous deux gratuits. Vos valeurs réelles remplacent les éléments entre `<chevrons>`.

## 1. Créer le projet Supabase

1. Sur <https://supabase.com/dashboard>, cliquez sur **New project**.
2. Choisissez un nom (`trame`), un mot de passe de base (conservez-le), et la région **Paris**.
3. Patientez jusqu'à ce que le projet soit prêt.

**E-mails :** le service fourni par Supabase n'envoie qu'aux membres de votre organisation Supabase, deux fois par heure au maximum. Pour que toute l'équipe puisse se connecter, configurez votre propre service d'envoi (voir l'étape 3 bis). Les invités ne reçoivent aucun e-mail.

## 2. Créer les tables

Dans **SQL Editor**, créez une requête, collez le contenu complet du fichier, cliquez sur **Run**. Faites-le dans cet ordre :

1. `supabase/migrations/20261109000000_schema.sql`
2. `supabase/migrations/20261109000100_collaboration.sql`
3. `supabase/migrations/20261110000100_tag_palette.sql`
4. `supabase/migrations/20261110000200_bulk_broadcast.sql`
5. `supabase/migrations/20261110000300_lines.sql`
6. `supabase/migrations/20261110000400_projects.sql`

Chaque exécution doit se terminer par « Success ».

## 3. Régler Supabase

| Où | Réglage |
| --- | --- |
| Authentication → Sign In / Providers | Activer **Allow anonymous sign-ins** (invités sans compte). Laisser **Allow new users to sign up** activé : le désactiver bloquerait aussi les invités |
| Authentication → Hooks | **Add hook → Before User Created**, type **Postgres**, schéma `app_private`, fonction `before_user_created`. Indispensable : sans lui, n'importe quelle adresse pourrait se créer un compte et modifier tous les tableaux |
| Realtime → Settings | Désactiver **Allow public access** |

## 3 bis. Comptes de l'équipe et envoi des e-mails

Toute personne qui a une adresse **@beta.gouv.fr** crée elle-même son compte : elle saisit son adresse, clique sur « Recevoir un lien par e-mail », ouvre le lien, puis définit un mot de passe depuis « Tableaux ». En cas d'oubli, elle refait la même chose. Les autres adresses sont refusées par le hook.

Deux réglages sont indispensables :

- **Authentication → Sign In / Providers → Email → Confirm email : activé** (c'est le cas par défaut). C'est le clic sur le lien qui prouve que la personne possède bien l'adresse @beta.gouv.fr.
- **Un vrai service d'envoi** (Authentication → Emails → SMTP Settings). Le service fourni par Supabase n'écrit qu'aux membres de votre organisation Supabase, deux fois par heure : les liens n'arriveraient pas aux autres. Brevo, par exemple, est gratuit jusqu'à 300 e-mails par jour. Renseignez l'hôte, le port, l'identifiant et la clé SMTP fournis par ce service, et une adresse d'expéditeur vérifiée chez lui. Augmentez ensuite la limite d'envoi dans Authentication → Rate Limits.

Pour une personne hors beta.gouv.fr : **Authentication → Users → Add user → Create new user**, avec **Auto Confirm User** et un mot de passe provisoire à lui transmettre. Cette voie ne passe pas par le hook. N'utilisez pas **Send invitation**, que le hook refuse.

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

**Passage aux projets (`20261110000400_projects.sql`) :** exécutez la migration, activez le hook (étape 3), configurez le service d'envoi (étape 3 bis), puis vérifiez la liste **Authentication → Users**. Tout compte non anonyme qui y figure aura accès à tous les tableaux : supprimez ceux que vous ne reconnaissez pas. Les tableaux existants sont rangés dans Envergo.

## Limites de l'offre gratuite

Vérifiées en novembre 2026, à revérifier sur les pages de tarifs.

- **Mise en pause après 7 jours sans activité.** Les données sont conservées ; il faut relancer le projet depuis le tableau de bord Supabase. Prévoyez-le avant un atelier.
- 500 Mo de base de données, 200 connexions simultanées.
- 2 millions de messages temps réel par mois.
- 30 connexions d'invités par heure et par adresse IP, réglable dans Authentication → Rate Limits. À augmenter pour un grand atelier dans un même bureau.

**Sauvegardes :** l'offre gratuite n'en garantit aucune que vous puissiez restaurer vous-même. Exportez régulièrement vos tableaux importants en JSON (menu ☰).
