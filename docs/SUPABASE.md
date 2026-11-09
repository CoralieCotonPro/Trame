# Configuration de Supabase

## En local (développement et tests)

Prérequis : Docker Desktop démarré.

```bash
npm run db:start
npx supabase status -o env
```

Créez `.env.local` à la racine avec deux valeurs issues de cette commande :

```
VITE_SUPABASE_URL=<valeur de API_URL>
VITE_SUPABASE_PUBLISHABLE_KEY=<valeur de ANON_KEY>
```

Lancez ensuite `npm run dev`. Les e-mails de connexion n'arrivent pas dans une vraie boîte : ils sont visibles sur <http://127.0.0.1:54324>.

| Commande | Rôle |
| --- | --- |
| `npm run db:start` | Démarre la base locale |
| `npm run db:stop` | L'arrête, en conservant les données |
| `npm run db:reset` | **Efface tout** et réapplique les migrations |

Les tests navigateur (`npm run test:e2e`) utilisent cette base : elle doit être démarrée.

## En ligne

La procédure complète (création du projet, domaines autorisés, déploiement) sera ajoutée à l'étape 6.

## Sécurité

- Seules l'URL du projet et la clé publique vont dans le navigateur. La clé secrète (`service_role` / `secret`) ne doit jamais figurer dans une variable `VITE_`.
- La protection des données repose sur les règles de la base (Row Level Security), décrites dans `supabase/migrations/`.
