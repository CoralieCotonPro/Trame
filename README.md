# Tableau blanc Envergo

Tableau blanc collaboratif et libre pour construire collectivement la roadmap d'Envergo.

> **État actuel : étape 1 sur 6.** Le projet est initialisé, mais le tableau n'est pas encore utilisable.

| Étape | Contenu | État |
| --- | --- | --- |
| 1 | Architecture et initialisation | Validée |
| 2 | Tableau local : post-it, texte, déplacement, zoom | À faire |
| 3 | Tags, couleurs et filtres | À faire |
| 4 | Supabase et sauvegarde persistante | À faire |
| 5 | Temps réel, participants, partage sécurisé | À faire |
| 6 | Exports, tests complémentaires, optimisations, Netlify | À faire |

Les choix techniques sont expliqués dans [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Démarrage local

Prérequis : Node.js 22 ou plus récent.

```bash
npm install
npm run dev
```

Ouvrez ensuite l'adresse affichée, en général <http://localhost:5173>.

## Commandes

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Lance l'application en développement |
| `npm run check` | Vérifie les types, le lint, les tests unitaires et le build |
| `npm test` | Lance les tests unitaires |
| `npm run test:e2e` | Lance les tests navigateur (une première fois : `npx playwright install chromium`) |

## Licence

[MIT](LICENSE)
