import type { Criterion, Poste } from '../types';
import type { RisksRaw } from '../api/georisques';
import type { Nature, Prescriptions, Urbanisme } from '../api/apicarto';

// Codes SUP (servitudes d'utilité publique)
const SUP_MONUMENT = 'AC1'; // protection monuments historiques
const SUP_PPR_NATUREL = 'PM1'; // plans de prévention risques naturels (dont inondation)

// Seuils raccordement validés métier : 🟢 <50 m · 🟡 50–150 m · 🟠 >150 m
const RACC_OK = 50;
const RACC_WATCH = 150;

// Tout critère qui MENACE la faisabilité (✗) est remonté en niveau "alerte" (rouge),
// plus ferme qu'un simple "à vérifier" (orange = surcoût/vigilance).
export function escalateFeasibility(criteria: Criterion[]): Criterion[] {
  return criteria.map(c =>
    c.consequences.includes('feasibility') && c.level !== 'blocker'
      ? { ...c, level: 'blocker' }
      : c,
  );
}

export function raccordementCriterion(postes: Poste[], postesOk = true, enedisServed = true): Criterion {
  if (!enedisServed) {
    return {
      id: 'raccordement',
      label: 'Raccordement réseau',
      level: 'watch',
      detail: 'Commune hors réseau Enedis (régie / ELD locale) — distance non estimable ici. Se rapprocher du gestionnaire de réseau local.',
      consequences: [],
    };
  }
  if (!postesOk) {
    return {
      id: 'raccordement',
      label: 'Raccordement réseau',
      level: 'watch',
      detail: 'Open data Enedis indisponible — distance au poste à vérifier manuellement.',
      consequences: [],
    };
  }
  if (!postes.length) {
    return {
      id: 'raccordement',
      label: 'Raccordement réseau',
      level: 'risk',
      detail: 'Aucun poste HTA/BT dans le rayon de recherche.',
      consequences: ['financial', 'feasibility'],
    };
  }
  const d = Math.round(postes[0].dist);
  if (d < RACC_OK) {
    return {
      id: 'raccordement',
      label: 'Raccordement réseau',
      level: 'ok',
      detail: `Poste le plus proche à ${d} m — linéaire court.`,
      consequences: [],
    };
  }
  if (d <= RACC_WATCH) {
    return {
      id: 'raccordement',
      label: 'Raccordement réseau',
      level: 'watch',
      detail: `Poste le plus proche à ${d} m — linéaire modéré.`,
      consequences: ['financial'],
    };
  }
  return {
    id: 'raccordement',
    label: 'Raccordement réseau',
    level: 'risk',
    detail: `Poste le plus proche à ${d} m — linéaire important.`,
    consequences: ['financial'],
  };
}

// Réseaux enterrés — advisory permanent. L'open data et même les retours DT/DICT
// sont incomplets (cf. rapports de géodétection terrain) : seul un relevé fait foi.
export function reseauxCriterion(): Criterion {
  return {
    id: 'reseaux',
    label: 'Réseaux enterrés',
    level: 'watch',
    detail: 'Géodétection à prévoir avant travaux — open data et retours DT/DICT indicatifs seulement.',
    consequences: ['financial'],
  };
}

export function riskCriteria(r: RisksRaw): Criterion[] {
  const out: Criterion[] = [];

  // Séisme : 1–2 ok · 3 watch · 4–5 risk (le poste reste une structure)
  if (r.seismeZone != null) {
    const z = r.seismeZone;
    out.push({
      id: 'seisme',
      label: 'Séisme',
      level: z <= 2 ? 'ok' : z === 3 ? 'watch' : 'risk',
      detail: `Zone de sismicité ${z}/5.`,
      consequences: z >= 3 ? ['financial'] : [],
    });
  }

  // Argiles (RGA) : impact direct sur les dalles poste + BESS (5×5 m).
  // 1 faible → ok · 2 moyenne → à prendre en compte · 3 forte → à vérifier (G2).
  if (r.argilesExposition != null) {
    const e = r.argilesExposition;
    const detail =
      e <= 1 ? 'Exposition 1/3 (faible).'
      : e === 2 ? 'Exposition 2/3 (moyenne) — dalles poste/BESS : fondations à adapter, étude de sol recommandée.'
      : 'Exposition 3/3 (forte) — dalles poste/BESS (5×5 m) : fondations spéciales + étude géotechnique G2 à prévoir.';
    out.push({
      id: 'argiles',
      label: 'Retrait-gonflement argiles',
      level: e <= 1 ? 'ok' : e === 2 ? 'watch' : 'risk',
      detail,
      consequences: e >= 2 ? ['financial'] : [],
    });
  }

  // Radon : OVERRIDE métier — toujours ok pour IRVE (pas de bâtiment occupé)
  if (r.radonClasse != null) {
    out.push({
      id: 'radon',
      label: 'Radon',
      level: 'ok',
      detail: `Potentiel ${r.radonClasse}/3 — sans objet (pas de local occupé).`,
      consequences: [],
    });
  }

  // Mouvement de terrain : présence dans 500 m → watch
  out.push({
    id: 'mvt',
    label: 'Mouvement de terrain',
    level: r.mvtCount > 0 ? 'watch' : 'ok',
    detail: r.mvtCount > 0
      ? `${r.mvtCount} mouvement(s) recensé(s) dans 500 m.`
      : 'Aucun mouvement recensé dans 500 m.',
    consequences: r.mvtCount > 0 ? ['financial'] : [],
  });

  // Cavités : présence dans 500 m → watch
  out.push({
    id: 'cavites',
    label: 'Cavités souterraines',
    level: r.cavitesCount > 0 ? 'watch' : 'ok',
    detail: r.cavitesCount > 0
      ? `${r.cavitesCount} cavité(s) recensée(s) dans 500 m.`
      : 'Aucune cavité recensée dans 500 m.',
    consequences: r.cavitesCount > 0 ? ['financial'] : [],
  });

  // Pollution sols (CASIAS) : 0 ok · 1–2 watch · >2 risk
  const n = r.pollutionSites.length;
  out.push({
    id: 'pollution',
    label: 'Pollution des sols',
    level: n === 0 ? 'ok' : n <= 2 ? 'watch' : 'risk',
    detail: n === 0
      ? 'Aucun ancien site industriel dans 500 m.'
      : `${n} ancien(s) site(s) industriel(s) dans 500 m (ex. ${r.pollutionSites[0]}).`,
    consequences: n > 0 ? ['financial'] : [],
  });

  // ICPE : SEVESO → risk (périmètre/PPRT) · autre ICPE → watch (voisinage) · 0 → ok
  out.push({
    id: 'icpe',
    label: 'Installations classées (ICPE)',
    level: r.icpeSeveso ? 'risk' : r.icpeCount > 0 ? 'watch' : 'ok',
    detail: r.icpeSeveso
      ? `Établissement SEVESO dans 500 m${r.icpeNames[0] ? ` (${r.icpeNames[0]})` : ''} — périmètre / PPRT à vérifier.`
      : r.icpeCount > 0
        ? `${r.icpeCount} ICPE dans 500 m${r.icpeNames[0] ? ` (ex. ${r.icpeNames[0]})` : ''} — voisinage industriel à prendre en compte.`
        : 'Aucune ICPE dans 500 m.',
    consequences: r.icpeSeveso ? ['feasibility'] : [],
  });

  return out;
}

// Urbanisme & inondation réglementaire — point-dans-polygone (API Carto GPU).
// `risks` sert uniquement de contexte historique pour l'inondation.
export function urbanismeCriteria(urb: Urbanisme, risks: RisksRaw | null): Criterion[] {
  const out: Criterion[] = [];

  // PLU : zonage validé métier — U ok · AU watch · A/N blocker
  const t = (urb.pluType ?? '').toUpperCase();
  if (urb.pluZone) {
    // N/A : non constructible a priori, MAIS les équipements d'intérêt collectif /
    // réseaux publics (poste, IRVE) y sont quasi toujours admis sous condition
    // (art. N2/A2 du règlement). Donc 🟠 "à vérifier", jamais un NO-GO automatique.
    const isNA = t === 'A' || t === 'N';
    const level: Criterion['level'] =
      t === 'U' ? 'ok' : t.startsWith('AU') ? 'watch' : isNA ? 'risk' : 'watch';
    const art = t === 'A' ? 'A2' : 'N2';
    const ref = urb.reglementFile ? ` (${urb.reglementFile}, art. ${art})` : ` (art. ${art})`;
    const detail = isNA
      ? `Zone ${urb.pluZone} (non constructible a priori). Les équipements d'intérêt collectif / réseaux publics y sont quasi systématiquement admis sous condition — à confirmer dans le règlement${ref}.`
      : `Zone ${urb.pluZone}${urb.pluLabel ? ` — ${urb.pluLabel}` : ''}.`;
    out.push({
      id: 'plu',
      label: 'Zonage PLU',
      level,
      detail,
      consequences: isNA ? ['feasibility'] : [],
    });
  } else {
    out.push({
      id: 'plu',
      label: 'Zonage PLU',
      level: 'watch',
      detail: 'Aucun document d\'urbanisme numérisé au point — à vérifier en mairie.',
      consequences: [],
    });
  }

  // Monument historique : présence de la servitude AC1 au point → watch (délai ABF)
  const monument = urb.supTypes.includes(SUP_MONUMENT);
  out.push({
    id: 'monument',
    label: 'Monument historique',
    level: monument ? 'watch' : 'ok',
    detail: monument
      ? 'Site dans un périmètre de protection ABF — avis requis.'
      : 'Hors périmètre de protection des monuments historiques.',
    consequences: monument ? ['delay'] : [],
  });

  // Inondation : verdict sur le PPR au point ; AZI/CATNAT = contexte historique
  const pprNaturel = urb.supTypes.includes(SUP_PPR_NATUREL);
  const histo: string[] = [];
  if (risks && risks.aziCount > 0) histo.push('zone inondable à proximité (atlas)');
  if (risks && risks.catnatInondationCount > 0) {
    histo.push(`${risks.catnatInondationCount} arrêté(s) CATNAT inondation sur la commune`);
  }
  const ctx = histo.length ? ` Contexte : ${histo.join(', ')}.` : '';
  out.push({
    id: 'inondation',
    label: 'Inondation',
    level: pprNaturel ? 'risk' : 'ok',
    detail: (pprNaturel
      ? 'Site dans un PPR naturel — nature et zonage à confirmer.'
      : 'Site hors zone inondable réglementée (PPR).') + ctx,
    consequences: pprNaturel ? ['feasibility'] : [],
  });

  return out;
}

// Emplacements réservés & marges de recul (API Carto prescriptions).
// ER = projet public (élargissement voirie…) → 🟠 ; marge de recul seule → 🟡.
export function prescriptionCriterion(p: Prescriptions): Criterion {
  if (!p.emplacementReserve && !p.margeRecul) {
    return {
      id: 'prescriptions',
      label: 'Emplacement réservé / recul',
      level: 'ok',
      detail: 'Aucun emplacement réservé ni marge de recul à proximité.',
      consequences: [],
    };
  }

  // n'affiche la valeur que si c'est une vraie distance (contient un chiffre)
  const reculVal = p.reculText && /\d/.test(p.reculText) ? ` de ${p.reculText}` : '';

  // Emplacement réservé : seul vrai frein IRVE — uniquement si l'implantation empiète
  // sur l'emprise réservée (projet public, ex. élargissement voirie).
  if (p.emplacementReserve) {
    const list = p.erLabels.length ? ` (${p.erLabels.slice(0, 3).join(', ')})` : '';
    const reculNote = p.margeRecul
      ? ` La marge de recul${reculVal} vise les bâtiments, pas l'IRVE (exemption équipements d'intérêt collectif, L111-7 CU).`
      : '';
    return {
      id: 'prescriptions',
      label: 'Emplacement réservé / recul',
      level: 'risk',
      detail: `Emplacement réservé à proximité${list} — vérifier que l'implantation n'empiète pas sur l'emprise réservée (ex. élargissement voirie).${reculNote}`,
      consequences: ['feasibility'],
    };
  }

  // Marge de recul seule : vise les constructions, l'IRVE en est généralement exemptée.
  return {
    id: 'prescriptions',
    label: 'Emplacement réservé / recul',
    level: 'watch',
    detail: `Marge de recul${reculVal} le long de la voie — vise les bâtiments ; les IRVE / équipements d'intérêt collectif en sont généralement exemptés (L111-7 CU), a fortiori en zone urbanisée. À confirmer.`,
    consequences: [],
  };
}

// Zones naturelles protégées (API Carto nature) — point-dans-polygone.
// Natura 2000 = contrainte forte (🟠) ; ZNIEFF seule = vigilance (🟡).
export function natureCriterion(n: Nature): Criterion {
  if (n.natura2000) {
    return {
      id: 'nature',
      label: 'Zones naturelles protégées',
      level: 'risk',
      detail: 'Site en zone Natura 2000 — évaluation des incidences requise.',
      consequences: ['delay', 'feasibility'],
    };
  }
  if (n.znieff) {
    return {
      id: 'nature',
      label: 'Zones naturelles protégées',
      level: 'watch',
      detail: 'Site en ZNIEFF — sensibilité écologique à prendre en compte.',
      consequences: ['delay'],
    };
  }
  return {
    id: 'nature',
    label: 'Zones naturelles protégées',
    level: 'ok',
    detail: 'Hors Natura 2000 et ZNIEFF.',
    consequences: [],
  };
}
