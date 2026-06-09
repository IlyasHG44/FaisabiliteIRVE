# Couche diagnostic — spec "donnée → seuil → niveau → conséquence"

> L'outil **signale** des points de vigilance, il ne rend **pas** de verdict GO/NO-GO.

Extrait d'études de faisabilité réelles, croisé avec les champs API réellement
validés (Enedis data-fair + Géorisques + API Carto).

## Philosophie — l'outil SIGNALE, il ne décide pas

**Pas de GO / NO-GO.** L'outil produit une **liste de points de vigilance**, pas un verdict.
Chaque critère est : 🟢 conforme · 🟡 à prendre en compte · 🟠 à vérifier. L'en-tête
résume *"N points à intégrer à l'étude"*. La décision reste humaine — l'outil dégrossit.

L'outil est **volontairement un cran plus vigilant** que les études BE à la main : on
préfère sur-signaler que rater (ex. pollution, séisme zone 3, argile 3/3 plus stricts
que la pratique BE observée — assumé).

Exemple constaté : une étude de faisabilité réelle qualifiait le séisme de "faible"
alors que Géorisques donne officiellement **zone 3 — modérée**. L'outil, factuellement
exact, a détecté l'erreur de l'analyste → argument fiabilité/QA.

Exemple constaté : une étude de faisabilité réelle qualifiait le séisme de "faible"
alors que Géorisques donne officiellement **zone 3 — modérée**. L'outil, factuellement
exact, a détecté l'erreur de l'analyste → argument fiabilité/QA.

## Principe transversal — exemption "équipements d'intérêt collectif"

Une IRVE / un poste de transformation = **installation nécessaire à un service public ou
d'intérêt collectif (réseau)**. À ce titre, elle bénéficie d'exemptions récurrentes que
les règles "construction de bâtiment" n'ont pas :
- **Zone N / A** : admise sous condition (art. N2/A2).
- **Marge de recul / Loi Barnier (L111-6)** : exemptée (L111-7 CU) — le recul vise les
  bâtiments, pas l'IRVE ; en plus inapplicable hors espaces urbanisés.

Conséquence : ces contraintes, bloquantes pour un bâtiment, ne sont pour l'IRVE que des
points de vigilance (🟡), **jamais** un frein — sauf **empiètement physique** sur une
emprise réservée (ER), qui reste un vrai 🟠 à vérifier.

## Échelle de verdict (reprise du PDF)

| Niveau | Code | Sens |
|---|---|---|
| 🟢 Acceptable | `ok` | Aucun frein identifié |
| 🟡 À prendre en compte | `watch` | Faisable, mais surcoût / délai / vigilance |
| 🟠 Peut-être bloquant | `risk` | Risque sérieux de refus / d'infaisabilité |
| 🔴 Bloquant | `blocker` | Stop — site à écarter en l'état |

## Étiquettes de conséquence (cumulables)

`€ impact financier` · `⏱ impact délai (DP)` · `✗ risque refus DP / faisabilité`

---

## 1. Risques naturels & technologiques — Géorisques (API validée)

| Critère | Source / champ | Seuil → verdict | Conséquence | Auto ? |
|---|---|---|---|---|
| Séisme | `/zonage_sismique` → `code_zone` | 1–2 → 🟢 · 3 → 🟡 · 4–5 → 🟠 | géotech parasismique si ≥3 | ✅ |
| Argiles (RGA) | `/rga` → `codeExposition` | 1 → 🟢 · 2 → 🟡 · 3 → 🟡 | € fondation poste si ≥2 | ✅ |
| Radon | `/radon` → `classe_potentiel` | **toujours 🟢 pour IRVE** (override : pas de bâtiment occupé) | — | ✅ + règle métier |
| Mouvement de terrain | `/mvt` rayon | 0 dans rayon → 🟢 · présence → 🟡 | € si présence | ✅ |
| Cavités | `/cavites` rayon | 0 → 🟢 · présence → 🟡/🟠 | ✗ si sous emprise | ✅ |
| Inondation (zonage) | `/gaspar/azi` géo | hors zone → 🟢 · dans AZI → 🟡 · dans PPRi → 🟠 | ✗ refus si PPRi | ✅ |
| Inondation (historique) | `/gaspar/catnat` | contexte seulement, n'abaisse pas le verdict si hors zone | — | ✅ |
| Pollution sols | `/ssp/casias` rayon 500 | 0 → 🟢 · 1–2 → 🟡 · >2 ou sous emprise → 🟠 | € étude pollution / terrassement | ✅ |
| Canalisations TMD | couche WMS / risque commune 24 | hors zone sécurité → 🟢 · dans zone → 🟠 | ✗ | ⚙️ WMS |
| Remontée de nappe | **BRGM** (hors Géorisques) | faible → 🟢 · forte/sub-affleurante → 🟡 | € pompage fond de fouille | ⚙️ BRGM WFS |

---

## 2. Urbanisme / PLU — Géoportail Urbanisme (à tester)

| Critère | Source | Seuil → verdict | Conséquence | Auto ? |
|---|---|---|---|---|
| Zonage | GPU zonage | U → 🟢 · AU → 🟡 · A/N → 🟠 (équip. int. collectif sous condition) | ✗ | ✅ zonage |
| Emplacements réservés / marges de recul | API Carto `prescription-surf/lin` (buffer ~140 m) | ER → 🟠 (projet public, ex. élargissement voirie → refus DP) · recul → 🟡 | ✗ | ✅ (cas réel élargissement de voirie) |
| Eaux pluviales (art. 4) | GPU règlement | présence règle gestion EP → 🟡 | € + ✗ refus DP | ⚙️ parsing article |
| Limites séparatives (art. 6/7) | GPU + géométrie parcelle | recul non respecté → 🟠 | ✗ refus DP | ❌ géométrie/implantation |
| Aspect extérieur (art. 11) | GPU règlement | contrainte couleur/matériau → 🟡 | demande fabricant poste | ⚙️ parsing |
| Stationnement / espaces verts (art. 12/13) | GPU règlement | suppression places / arbres → 🟡 | ✗ faisabilité | ❌ jugement |

> Note : le **zonage** est auto. Le **règlement article par article** demande soit du
> parsing, soit une saisie assistée. Réaliste : auto-détecter la zone + remonter le PDF
> du règlement avec les articles clés surlignés, l'humain tranche.

---

## 3. Environnement & patrimoine — API Carto IGN (à tester)

| Critère | Source | Seuil → verdict | Conséquence | Auto ? |
|---|---|---|---|---|
| Natura 2000 / ZNIEFF | API Carto nature | hors + à distance → 🟢 · proche → 🟡 · dans zone → 🟠 | ⏱ + ✗ | ✅ |
| Monuments historiques (ABF) | API Carto patrimoine (périmètre 500m) | hors → 🟢 · dans périmètre → 🟡 | ⏱ avis ABF + délai DP | ✅ |
| Servitude aéronautique | GPU servitudes (SUP) | hors → 🟢 · dans → 🟡/🟠 | hauteur poste | ⚙️ |

---

## 4. Réseau électrique — Enedis (API validée)

| Critère | Source / champ | Seuil → verdict | Conséquence | Auto ? |
|---|---|---|---|---|
| Distance raccordement | Enedis `_geo_distance` (m) | **🟢 <50 m · 🟡 50–150 m · 🟠 >150 m** (validé) | € linéaire câble | ✅ |
| Densité postes | nb postes dans rayon | indicateur de marge réseau | — | ✅ |

> Seuils validés (métier) : 🟢 <50 m / 🟡 50–150 m / 🟠 >150 m. Remplace l'ancien
> barème du proto (`<300 m` = modéré), désormais obsolète.

---

## 5. DT / réseaux privés (section 5 du PDF)

Présence de réseaux (Enedis/Orange/SDEC/SUEZ/GRDF) à proximité de l'emprise.
- Pré-détection possible via open data (Enedis), reste = process DT-DICT réglementaire.
- Verdict type : présence réseau dans l'emprise → 🟡 `€ géodétection / risque dévoiement`.
- **Non bloquant pour un go/no-go** — c'est une phase aval.

---

## 6. Synthèse — points de vigilance (pas de verdict)

L'en-tête agrège un simple **compte** : *"N points à intégrer à l'étude"*, avec les chips
`X à vérifier · Y à prendre en compte · Z conformes`. Aucune décision GO/NO-GO.

Couleur de l'en-tête : 🟠 présent → ambre · 🟡 seulement → vert clair · tout 🟢 → vert.
Sortie = liste des critères 🟡/🟠 avec leurs étiquettes € / ⏱ / ✗, **sans** générer le
rapport 56 pages (ça c'est le tier "accélérateur BE").

---

## Arbitrages métier — VALIDÉS

1. ✅ **Seuils raccordement** : 🟢 <50 m / 🟡 50–150 m / 🟠 >150 m.
2. ✅ **Override "pas de bâti occupé"** : seul le **radon** est neutralisé (toujours 🟢).
   Argiles et séisme restent actifs (le poste = structure avec fondations).
3. ✅ **Frontière 🔴 / 🟠** (révisé après cas réel) :
   - 🟠 sous réserve : **zonage N/A** (équipements d'intérêt collectif admis sous
     condition, art. N2/A2 — cf. cas réel : commerce en zone N dont le projet avance) ·
     PPR au point · périmètre ABF · ZNIEFF · pollution · recul limites séparatives.
   - 🔴 hard-stop : réservé aux interdits absolus **non encore auto-détectés finement**
     (PPRi zone *rouge*, cœur Natura 2000). ⚠️ **Conséquence : aucun critère ne produit
     de 🔴 aujourd'hui → l'outil n'auto-rejette jamais (pire cas = GO SOUS RÉSERVE).**
     À confirmer : comportement voulu, ou réintroduire un vrai hard-stop ?

   Note : critère **"Réseaux enterrés"** ajouté (🟡 permanent) — géodétection à prévoir,
   open data/DT indicatifs seulement (cf. rapports terrain O'REZO). Appels API protégés
   par timeout 10 s ; Enedis non bloquant.
4. ✅ **Synthèse** : compte de points de vigilance (cf. section 6), plus de go/no-go.
