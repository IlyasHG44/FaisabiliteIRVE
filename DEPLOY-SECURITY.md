# Sécurité de déploiement — SAFI

## 1. Durcissement statique (en place)

| Mesure | Où | Effet |
|---|---|---|
| Pas de sourcemap | `vite.config.ts` (`build.sourcemap: false`) | Le code TypeScript d'origine n'est jamais publié |
| Minification / mangling | `vite.config.ts` (`minify: true`) | Noms de fonctions/variables brouillés |
| En-têtes de sécurité (Netlify) | `public/_headers` | Anti-clickjacking, no-sniff, HSTS, Referrer-Policy |
| En-têtes de sécurité (Azure SWA) | `public/staticwebapp.config.json` | Idem, selon l'hébergeur retenu |
| Aucun secret dans le code | — | Toutes les API sont publiques, pas de clé exposée |

> ⚠️ **Limite honnête** : l'app étant 100 % navigateur, le « how » reste lisible
> (endpoints visibles dans l'onglet Réseau + chaînes dans le bundle). Le durcissement
> relève le niveau d'effort d'un curieux, **il ne protège pas le secret métier**.

## 2. Protection réelle du « how » → backend (à faire)

Déplacer l'orchestration des sources + le moteur de règles côté serveur :

```
Navigateur → /api/diagnostic?adresse=…  →  [backend: sources + règles]  →  critères qualifiés
```

Le navigateur ne reçoit que les **résultats** (libellé / niveau / détail). Restent cachés :
endpoints, combinaison des sources, seuils, overrides, `escalateFeasibility`.

**Implémentation cible (host-agnostique)** : une fonction serverless qui reprend
`src/api/*` + `src/diagnostic/rules.ts`. Le front n'appelle plus que cette fonction.
- Netlify → Netlify Functions (`netlify/functions/diagnostic.ts`)
- Azure → Azure Functions

**À prévoir côté backend** : rate-limiting (anti-aspiration), cache court par adresse,
éventuellement une clé/quota si l'accès doit être contrôlé. La carte (tuiles IGN/OSM)
reste côté client — ce n'est pas du secret.

## 3. À ne jamais publier
- Le code source (repo privé) — seul `dist/` est déployé.
- `docs/regles-verdict.md` (règles métier) — hors `src/`, non bundlé. Vérifié : absent de `dist/`.
