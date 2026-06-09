export interface Site {
  lat: number;
  lon: number;
  label: string;
  citycode?: string; // code INSEE — requis pour les endpoints Géorisques commune
}

export interface Poste {
  lat: number;
  lon: number;
  dist: number; // mètres
  commune: string;
}

export type VerdictLevel = 'good' | 'mid' | 'far';

export interface Verdict {
  level: VerdictLevel;
  text: string;
}

// ── Couche verdict (diagnostic faisabilité) ────────────────────────────────
// Échelle alignée sur la pratique des études de faisabilité : ok / watch / risk / blocker
export type RiskLevel = 'ok' | 'watch' | 'risk' | 'blocker';

// Étiquettes de conséquence cumulables
export type Consequence = 'financial' | 'delay' | 'feasibility';

export interface Criterion {
  id: string;
  label: string;
  level: RiskLevel;
  detail: string; // constat lisible (ex. "Séisme zone 2 - FAIBLE")
  consequences: Consequence[];
}
