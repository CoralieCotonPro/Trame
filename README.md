# Trame

Trame est un tableau blanc collaboratif et libre pour construire collectivement la roadmap d'Envergo.

> **État actuel : étape 6 sur 6.** L'application est complète et testée en local. Sa mise en ligne suit le guide [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md).

| Étape | Contenu | État |
| --- | --- | --- |
| 1 | Architecture et initialisation | Validée |
| 2 | Tableau local : post-it, texte, déplacement, zoom | Validée |
| 3 | Tags, couleurs et filtres | Validée |
| 4 | Supabase et sauvegarde persistante | Validée |
| 5 | Temps réel, participants, partage sécurisé | Validée |
| 6 | Exports, tests complémentaires, optimisations, Netlify | Validée, mise en ligne en cours |

- [État des fonctionnalités et limites connues](docs/ETAT.md)
- [Mise en ligne](docs/DEPLOIEMENT.md)
- [Base de données locale](docs/SUPABASE.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Format d'export JSON](docs/FORMAT.md)

## Démarrage local

Prérequis : Node.js 22 ou plus récent, et Docker Desktop. Voir [docs/SUPABASE.md](docs/SUPABASE.md) pour la base de données.

```bash
npm install
npm run dev
```

Ouvrez ensuite l'adresse affichée, en général <http://localhost:5173>.

## Raccourcis

| Action | Raccourci |
| --- | --- |
| Nouveau post-it / nouveau texte | `N` / `T` |
| Outil sélection / main | `V` / `H` |
| Déplacer le tableau | `Espace` + glisser, outil Main, ou deux doigts sur le trackpad |
| Sélection rectangulaire | Glisser sur le vide (avec `Shift` : ajoute à la sélection) |
| Sélection multiple | `Shift` + clic |
| Modifier l'élément sélectionné | Double-clic ou `Entrée` |
| Valider la saisie | `Échap` ou `Ctrl/Cmd+Entrée` |
| Copier, coller, dupliquer | `Ctrl/Cmd+C`, `V`, `D` |
| Tout sélectionner | `Ctrl/Cmd+A` |
| Annuler / rétablir | `Ctrl/Cmd+Z` / `Ctrl/Cmd+Shift+Z` |
| Supprimer | `Suppr` ou `Retour arrière` |
| Déplacer finement | Flèches (avec `Shift` : plus grand pas) |
| Zoomer | Molette, ou `Ctrl/Cmd` + molette |

## Commandes

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Lance l'application en développement |
| `npm run check` | Vérifie les types, le lint, les tests unitaires et le build |
| `npm test` | Lance les tests unitaires |
| `npm run test:e2e` | Lance les tests navigateur (une première fois : `npx playwright install chromium`) |

## Licence

[MIT](LICENSE)
