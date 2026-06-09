# Repère — pré-diagnostic de faisabilité IRVE

D'une **adresse** (ou de **coordonnées GPS**) à une **synthèse de points de vigilance**
pour un site de recharge IRVE : réseau électrique, risques naturels et technologiques,
urbanisme. Un **filtre amont**, avant l'étude de faisabilité détaillée.

> L'outil **signale** des points à vérifier — il ne rend **pas** de verdict go/no-go.
> Il sert à dégrossir et à prioriser un portefeuille de sites, pas à décider.

## Pourquoi

Une étude de faisabilité + APD coûte cher (~18 k€ HT/site) et prend des semaines.
Repère interroge en ~30 s les bases publiques pour, sur **tout un portefeuille** :

- **filtrer** les sites avant de payer l'étude ;
- **dé-risquer tôt** (zonage, emplacements réservés, raccordement, géotechnique) et
  éviter le rework en phase DP ;
- **accélérer** la collecte de données (sections 1–5 d'une étude) ;
- servir de **contrôle qualité** (exhaustif, cohérent, sans fatigue).

Ce que l'outil ne fait pas (et ne doit pas) : visite de site, implantation/CAO,
géodétection, étude de raccordement Enedis, étude géotechnique, signature d'ingénieur.

## Stack

- **Vite + TypeScript** (vanilla, sans framework) — build statique, 100 % navigateur.
- **Leaflet** (carte), **jsPDF + html2canvas** (export).
- Aucun backend : déployable tel quel (Azure Static Web Apps, SharePoint, etc.).

## Lancer

```bash
npm install
npm run dev        # serveur de dev (hot-reload)
npm run build      # build de production → dist/
npm run preview    # sert le build

npx tsx scripts/verify-falaise.ts   # test de non-régression sur un site réel
```

## Sources de données (open data, sans clé)

| Source | Usage |
|---|---|
| **BAN** (adresse.data.gouv.fr) | géocodage, autocomplétion, géocodage inverse |
| **Enedis Open Data** | postes HTA/BT, distance de raccordement |
| **Géorisques** | séisme, argiles, radon, mouvements, cavités, inondation, pollution |
| **API Carto IGN / GPU** | zonage PLU, servitudes, emplacements réservés, Natura 2000 / ZNIEFF |

## Architecture

```
src/
├── main.ts              orchestration
├── types.ts             Criterion, RiskLevel, Consequence…
├── api/                 connecteurs (ban, enedis, georisques, apicarto, http)
├── diagnostic/rules.ts  moteur de règles (donnée → niveau → conséquence)
├── ui/                  autocomplete, map, synthesis, diagnostic
└── export/pdf.ts        export PDF
docs/regles-verdict.md   spec des règles métier (seuils, exemptions, principes)
```

## Principes métier (cf. `docs/regles-verdict.md`)

- **Exemption "équipements d'intérêt collectif"** : l'IRVE/le poste = réseau d'intérêt
  public → admis sous condition en zone N/A, exempté des marges de recul / Loi Barnier
  (L111-7 CU). Ces contraintes sont des points de vigilance (🟡/🟠), pas des freins —
  sauf **empiètement physique** sur une emprise réservée.
- **Override "pas de bâtiment occupé"** : le radon est sans objet pour une station IRVE.
- **Géodétection / DT-DICT** : signalés comme "à prévoir" — l'open data est indicatif,
  seul un relevé terrain fait foi.

## Limites assumées

- Données open data **indicatives**, sans garantie ni exhaustivité.
- Couverture **GPU variable** selon les communes (servitudes/prescriptions parfois non
  numérisées).
- Le **texte du règlement** (ex. conditions exactes en zone N) n'est pas lu
  automatiquement — l'outil nomme le fichier + l'article à vérifier.
- SPA non indexable (SEO) : sans objet pour un outil interne.

## Pistes (non implémentées)

- Tier "accélérateur BE" : génération du document de faisabilité.
- Backend on-prem : parsing du règlement PLU pour confirmer l'admissibilité.
- Détection automatique d'empiètement implantation × emprise réservée.
- Connecteurs BRGM (remontée de nappe), canalisations TMD (WMS).
