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

**Clé SMTP Brevo :** elle expire après 90 jours sans envoi, et au plus tard à la date choisie à sa création (novembre 2027 pour la clé actuelle). La fonction planifiée `netlify/functions/brevo-keepalive.mts` demande donc chaque mois un lien de connexion pour l'adresse `TRAME_KEEPALIVE_EMAIL` (variable Netlify, compte Trame existant), ce qui maintient la clé active. Elle utilise aussi la clé API du widget (`BREVO_API_KEY`, droit « Emails transactionnels »), qui expire de la même façon. Un échec apparaît dans Netlify → Logs → Functions. Le renouvellement annuel reste manuel : générer une nouvelle clé dans Brevo, puis la coller dans Supabase → SMTP Settings → Password.

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

Tout passe par GitHub (https://github.com/CoralieCotonPro/Trame). Le robot `.github/workflows/production.yml` s'en charge :

1. **Une proposition** (pull request) est ouverte depuis une branche. Le robot lance toutes les vérifications, puis publie un **aperçu** à l'adresse `https://pr-<numéro>--trame-envergo.netlify.app`, indiquée en commentaire de la proposition. Cet aperçu utilise la base de production.
2. **On fusionne la proposition** (bouton **Merge** sur GitHub). Le robot vérifie à nouveau, applique les nouveaux fichiers de `supabase/migrations/` à la base, puis publie le site. Si une étape échoue, rien n'est mis en ligne. Le suivi se trouve dans l'onglet **Actions** du dépôt.

Ce que le robot utilise :

| Où | Nom | Rôle |
| --- | --- | --- |
| GitHub → Settings → Secrets and variables → Actions → Secrets | `SUPABASE_ACCESS_TOKEN` | Clé Supabase limitée au projet Trame : Project Settings (lecture), Database et Migrations (écriture) |
| idem | `NETLIFY_AUTH_TOKEN` | Clé personnelle Netlify |
| idem → Variables | `SUPABASE_PROJECT_ID`, `NETLIFY_SITE_ID` | Identifiants du projet et du site |
| idem → Variables | `SUPABASE_POOLER_URL` | Adresse IPv4 de la base, sans mot de passe : les machines GitHub n'ont pas d'IPv6 |

**Si la clé Supabase ou Netlify expire ou est supprimée**, la mise en ligne échoue avec une erreur d'authentification : recréez-la avec les mêmes droits et remplacez le secret sur GitHub (crayon à côté de son nom).

**Dernier recours, sans GitHub :** `npx netlify-cli deploy --build --prod` publie le site depuis un ordinateur ; appliquez d'abord les nouvelles migrations avec `npx supabase db push --remote`.

**Passage aux projets (`20261110000400_projects.sql`) :** exécutez la migration, activez le hook (étape 3), configurez le service d'envoi (étape 3 bis), puis vérifiez la liste **Authentication → Users**. Tout compte non anonyme qui y figure aura accès à tous les tableaux : supprimez ceux que vous ne reconnaissez pas. Les tableaux existants sont rangés dans Envergo.

## Limites de l'offre gratuite

Vérifiées en novembre 2026, à revérifier sur les pages de tarifs.

- **Mise en pause après 7 jours sans activité.** Les données sont conservées ; il faut relancer le projet depuis le tableau de bord Supabase. Prévoyez-le avant un atelier.
- 500 Mo de base de données, 200 connexions simultanées.
- 2 millions de messages temps réel par mois.
- 30 connexions d'invités par heure et par adresse IP, réglable dans Authentication → Rate Limits. À augmenter pour un grand atelier dans un même bureau.

**Sauvegardes :** l'offre gratuite n'en garantit aucune que vous puissiez restaurer vous-même. Exportez régulièrement vos tableaux importants en JSON (menu ☰).
