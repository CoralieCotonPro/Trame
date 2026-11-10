# Format d'export JSON

Un export contient tout le tableau, dans un fichier lisible et versionné.

```json
{
  "format": "trame-tableau",
  "version": 1,
  "exportedAt": "2026-11-09T18:00:00.000Z",
  "board": { "name": "Roadmap Envergo" },
  "categories": [{ "id": "c1", "name": "Sizing", "sortOrder": 0 }],
  "values": [{ "id": "v1", "categoryId": "c1", "label": "M", "color": "#aab2f0", "sortOrder": 2 }],
  "elements": [
    {
      "id": "e1", "type": "postit",
      "x": 100, "y": 200, "width": 200, "height": 160, "zIndex": 1,
      "content": { "body": "Mon texte" },
      "style": { "color": "yellow" },
      "tags": { "c1": "v1" }
    },
    {
      "id": "e2", "type": "text",
      "x": 100, "y": 40, "width": 320, "height": 24, "zIndex": 2,
      "content": { "text": "Mon titre" },
      "style": { "level": "h1", "color": "#2b2a27", "align": "left" }
    }
  ]
}
```

| Champ | Valeurs |
| --- | --- |
| `style.color` d'un post-it | `yellow`, `red`, `gray`, `green`, `blue`, `pink` |
| `style.level` d'un texte | `h1`, `h2`, `h3`, `body`, `small` |
| `style.align` d'un texte | `left`, `center`, `right` |
| `tags` | Par identifiant de catégorie : l'identifiant d'une valeur de cette catégorie |
| Trait (`type: "line"`) | `x`, `y`, `width`, `height` : rectangle englobant ; `style.start` : coin de départ (`tl`, `tr`, `bl`, `br`), le trait finit au coin opposé ; `style.thickness` : `thin` ou `thick` ; `style.arrow` : `none` ou `end` ; `content` vide |
| Liens | Dans `body` ou `text`, notés `[mots](https://adresse)`. Seules les adresses `http` et `https` deviennent des liens. |

**Limites :** 2000 éléments, 50 catégories, 500 valeurs, 5000 caractères par texte, 10 Mo par fichier.

**Import :** le fichier est entièrement vérifié avant toute modification, puis une confirmation est demandée. Le contenu du tableau est remplacé et de nouveaux identifiants sont générés.

**Versions :** toute évolution incompatible du format doit incrémenter `version` (`src/lib/boardFile.ts`) et ajouter la conversion depuis les versions précédentes. Une version inconnue est refusée.

Les nouveaux formats d'export visuels (SVG, PDF) s'ajoutent dans `src/services/boardTransfer.ts`.
