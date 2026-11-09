# Architecture

Ce document explique les choix structurants du tableau blanc Envergo. Il s'adresse à la personne qui maintient l'application, sans supposer une expertise particulière en temps réel.

## Vue d'ensemble

```
Navigateur (React + Konva)                    Supabase
┌───────────────────────────┐    REST/RPC    ┌──────────────────────────┐
│ Interface   → Store       │ ─────────────► │ PostgreSQL + RLS         │
│ Zustand     → File d'envoi│                │ (seule source de vérité) │
│               (IndexedDB) │ ◄───────────── │ Triggers de diffusion    │
│ Curseurs, glissements     │   WebSocket    │ Realtime (canaux privés) │
└───────────────────────────┘ ◄────────────► └──────────────────────────┘
         ▲ fichiers statiques
      Netlify (aucun serveur applicatif)
```

Netlify ne sert que des fichiers statiques. Tout le temps réel passe par Supabase : Netlify n'a besoin ni de WebSocket ni, à ce stade, de Netlify Functions.

## Pourquoi cette pile

| Besoin | Choix | Raison |
| --- | --- | --- |
| Canvas | **React Konva** | Dessin direct du texte et des formes, donc texte net à tout zoom ; export PNG natif ; adapté à plusieurs centaines d'objets avec le masquage des éléments hors écran. |
| État | **Zustand** | Abonnement par élément : déplacer un post-it ne redessine pas les autres. |
| Base et temps réel | **Supabase** | PostgreSQL, authentification, RLS et WebSocket réunis, sans serveur à maintenir. |

Solutions écartées : **tldraw**, dont la licence n'est pas libre au sens voulu ; **Excalidraw**, excellent mais difficile à adapter à des tags structurés en base ; **DOM + CSS**, plus simple pour le texte mais moins fluide au zoom avec 400 éléments.

Compromis de Konva : le canvas ne sait pas éditer du texte. Pendant l'édition, un champ HTML est superposé exactement à l'élément, puis retiré.

## Règles du canvas

- L'application cible l'ordinateur. La prise en charge des tablettes est volontairement hors périmètre.

- Les coordonnées sont stockées dans le repère du tableau. La caméra (`x`, `y`, `zoom`) reste locale à chaque personne et n'est jamais sauvegardée sur le serveur.
- Comme dans FigJam, glisser sur le vide trace une sélection rectangulaire (avec Shift, elle complète la sélection). Le tableau se déplace avec Espace + glisser, l'outil Main, le bouton central de la souris ou le défilement à deux doigts.
- Un post-it ne coupe jamais son contenu : sa hauteur affichée est au moins celle de son contenu.
- Seuls les éléments visibles à l'écran sont rendus. L'élément en cours de déplacement passe sur un calque dédié.
- Konva ne fait que dessiner : les clics sont résolus par un calcul géométrique sur les rectangles (`lib/geometry.ts`), plus léger que la détection de Konva.
- Le canvas étant invisible au clavier et aux lecteurs d'écran, une liste HTML masquée (`ElementsA11yList`) rend chaque élément atteignable. Les tests navigateur s'appuient aussi dessus.
- Chaque action produit une opération et son inverse, ce qui sert à la fois à l'annulation et à la sauvegarde. L'annulation ne concerne que ses propres actions.

## Tags

- Un post-it ne stocke que `catégorie → identifiant de valeur`. Libellés et couleurs vivent uniquement dans le catalogue (`stores/tagStore.ts`) : les modifier met à jour tous les post-it.
- La règle « une valeur par catégorie » tient à cette structure. Pour autoriser plusieurs valeurs, il faudra passer à une liste d'identifiants dans `types/board.ts`, `boardStore` et `lib/tags.ts`.
- Filtres : ET entre catégories, OU entre valeurs. Les post-it exclus restent en mémoire, à leur place, mais ne sont ni dessinés ni atteignables, ce qui les protège d'un « tout sélectionner + supprimer ». Les blocs de texte restent visibles pour garder la structure du tableau. Les filtres sont propres à chaque personne.
- Un post-it sélectionné reste affiché même s'il ne correspond plus aux filtres : changer ses tags ne le fait pas disparaître. Il est masqué une fois désélectionné.
- Un post-it créé sous un filtre reprend les valeurs filtrées, sinon il disparaîtrait aussitôt.
- La suppression d'une valeur ou d'une catégorie ne s'annule pas avec Ctrl/Cmd+Z : elle demande confirmation si des post-it l'utilisent.

## Modèle de données (étape 4)

Tables demandées : `boards`, `elements`, `tag_categories`, `tag_values`, `element_tags`, `board_permissions`, `board_share_links`. Adaptations :

- `elements` reçoit `revision`, `content_revision`, `created_by` et `updated_by`. `z_index` est un nombre décimal, et l'`id` départage les égalités.
- `element_tags` contient `board_id` et `category_id`, avec :
  - `PRIMARY KEY (element_id, category_id)` : **une seule valeur par catégorie et par post-it**. Pour autoriser plusieurs valeurs plus tard, il suffira de passer à `(element_id, tag_value_id)`.
  - `FOREIGN KEY (tag_value_id, category_id) → tag_values(id, category_id)` : la valeur appartient bien à la catégorie.
  - `FOREIGN KEY (category_id, board_id) → tag_categories(id, board_id)` et `(element_id, board_id) → elements(id, board_id)` : tout appartient au **même tableau**.
- `board_permissions` utilise `user_id` et `granted_by_link_id`. La révocation d'un lien supprime en cascade les accès qu'il a accordés.
- Libellés et couleurs de tags n'existent que dans `tag_values` : renommer ou recolorer met à jour tous les post-it.

Les limites (longueur des textes, format des couleurs, nombre d'éléments par tableau) sont des contraintes SQL, donc appliquées même si le navigateur est contourné.

## Permissions

Chaque personne possède un vrai compte Supabase : par e-mail pour le propriétaire, **anonyme** pour les invités, qui n'ont qu'un pseudonyme à saisir. La RLS peut ainsi s'appuyer partout sur `auth.uid()`.

| Action | Propriétaire | Édition | Lecture seule | Sans accès |
| --- | :-: | :-: | :-: | :-: |
| Lire le tableau, être présent | oui | oui | oui | non |
| Modifier éléments et tags | oui | oui | non | non |
| Gérer les liens et les droits | oui | non | non | non |
| Créer un tableau | oui (compte e-mail) | non si anonyme | non si anonyme | non |

Fonctionnement d'un lien de partage :

1. Le propriétaire génère un lien contenant un jeton aléatoire de 256 bits. Seule son empreinte SHA-256 est enregistrée, et le jeton n'est affiché qu'une fois.
2. L'invité ouvre le lien et obtient une session anonyme, puis appelle la fonction SQL `redeem_share_link(jeton)`.
3. La fonction vérifie le jeton, l'expiration et la révocation, puis inscrit l'invité dans `board_permissions`.
4. Toutes les requêtes suivantes sont contrôlées par la RLS. Connaître l'identifiant d'un tableau ne donne aucun droit.

Le jeton est placé dans le fragment de l'URL (`#…`), qui n'est pas transmis aux serveurs.

## Collaboration

Deux chemins distincts, car ils n'ont pas les mêmes exigences :

| | Données durables | Éphémère |
| --- | --- | --- |
| Contenu | éléments, tags, catégories | curseurs, glissement en cours, participants |
| Passage | RPC → PostgreSQL → trigger → diffusion | Broadcast / Presence |
| Stockage | oui | jamais |

Deux canaux privés par tableau, contrôlés par RLS sur `realtime.messages` :

- `board:<id>` : changements émis par la base et glissements. Émission réservée aux éditeurs.
- `board:<id>:presence` : participants et curseurs. Ouvert à tous les membres, lecture seule comprise.

Pendant un glissement, la position est diffusée quelques fois par seconde et interpolée chez les autres. La position finale est écrite en base au relâchement.

## Sauvegarde

- Chaque modification entre dans une **file d'envoi conservée dans IndexedDB**, qui survit à un rechargement. La base reste la référence.
- Seuls les champs modifiés sont envoyés, par petits lots. Le tableau entier n'est jamais réécrit.
- « Enregistré » ne s'affiche qu'après confirmation du serveur. En cas d'échec : nouvelles tentatives espacées et état visible.
- À la reconnexion : envoi de la file, puis rechargement complet du tableau, simple et fiable pour quelques centaines de lignes.

## Conflits

| Situation | Résolution |
| --- | --- |
| Éléments différents | Aucun conflit : écritures indépendantes. |
| Même élément, champs différents (l'un déplace, l'autre édite) | Fusion : seuls les champs modifiés sont écrits. |
| Même position, taille, couleur ou tag | La dernière écriture reçue par le serveur gagne. |
| Même texte | Écriture conditionnelle sur `content_revision`, voir ci-dessous. |
| Modification d'un élément supprimé | La suppression gagne ; la personne en est informée. |

**Texte simultané.** Yjs n'est pas retenu : il nécessiterait une couche de synchronisation et de persistance supplémentaire, disproportionnée pour des post-it de quelques phrases. À la place :

1. Pendant qu'une personne édite, les autres voient « Prénom modifie… » sur l'élément.
2. Si deux personnes valident malgré tout, la seconde écriture est refusée, et son texte est conservé dans un post-it copie placé juste à côté.

**Limite assumée :** il n'y a pas de fusion caractère par caractère. Aucun texte n'est perdu, mais une personne doit réconcilier les deux versions à la main.

## Limites gratuites de Supabase

Vérifiées le 9 novembre 2026 sur la documentation Supabase, et susceptibles de changer :

| Ressource | Offre gratuite |
| --- | --- |
| Base de données | 500 Mo |
| Messages temps réel | 2 millions par mois |
| Connexions simultanées | 200 |
| Débit | 100 messages/s, dont 20 messages de présence/s |
| Inactivité | Projet mis en pause après une semaine |
| Connexions anonymes | 30 par heure et par adresse IP (réglable) |

## Risques techniques

| Risque | Impact | Parade | Vérification |
| --- | --- | --- | --- |
| Curseurs trop coûteux : un message envoyé est multiplié par le nombre de destinataires | Dépassement des 100 messages/s à 10 participants | Curseurs dans Broadcast et non Presence, envoi seulement en mouvement, fréquence ajustée au nombre de participants, désactivation possible | Mesure à l'étape 5 |
| Sessions anonymes avec canaux privés : la documentation ne le confirme pas explicitement | Invités bloqués | Les anonymes ont le rôle `authenticated`, donc cela devrait fonctionner | Premier test de l'étape 5 |
| Révocation pendant une connexion WebSocket ouverte | Un invité révoqué continue de recevoir un temps | Les écritures sont refusées immédiatement ; expulsion du canal à prévoir | Test de l'étape 5 |
| Mise en pause du projet gratuit | Tableau inaccessible après 7 jours d'inactivité | Réactivation dans le tableau de bord ; les données sont conservées | Documentation à l'étape 6 |
| Abus de création de sessions anonymes | Base encombrée | Limite par IP, Turnstile recommandé, purge des comptes anonymes inactifs | Étape 5 |
| Performances Konva avec 400 éléments | Saccades | Masquage hors écran, calque de glissement, mesure du texte en cache | Test de charge à l'étape 6 |

## Organisation du code

```
src/
  components/{board,elements,toolbar,tags,collaboration,dialogs}/
  hooks/  stores/  services/  lib/  types/  utils/  styles/
supabase/migrations/
tests/{unit,e2e}/
```

Les dossiers sont créés au fur et à mesure des étapes. La logique métier (`lib/`, `stores/`) reste indépendante de l'affichage, et l'accès au réseau reste confiné à `services/`.
