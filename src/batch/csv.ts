// CSV portefeuille — séparateur ';' (défaut Excel FR, évite le conflit avec les
// virgules des coordonnées). Tolère le BOM UTF-8 et une ligne d'en-tête optionnelle.

export interface SiteInput {
  reference: string; // libellé libre (optionnel)
  adresse: string; // adresse ou coordonnées
}

export const TEMPLATE_CSV =
  'reference;adresse\r\n' +
  'Site A;12 rue de la Paix 75002 Paris\r\n' +
  'Site B;45.6797, -0.3016\r\n';

export function parseSites(text: string): SiteInput[] {
  const clean = text.replace(/^﻿/, ''); // retire le BOM
  const out: SiteInput[] = [];
  for (const raw of clean.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const sep = line.indexOf(';');
    let reference = '';
    let adresse = line;
    if (sep >= 0) {
      reference = line.slice(0, sep).trim();
      adresse = line.slice(sep + 1).trim();
    }
    // saute l'en-tête éventuel
    if (adresse.toLowerCase() === 'adresse' && reference.toLowerCase() === 'reference') continue;
    if (!adresse) continue;
    out.push({ reference, adresse });
  }
  return out;
}

export interface SiteResult extends SiteInput {
  ok: boolean;
  error?: string;
  partial: boolean; // certaines sources indisponibles → counts incomplets
  alertes: number;
  aVerifier: number;
  aPrendreEnCompte: number;
  conformes: number;
}

function esc(s: string): string {
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildResultsCsv(rows: SiteResult[]): string {
  const header = 'reference;adresse;alertes;a_verifier;a_prendre_en_compte;conformes;statut';
  const lines = rows.map(r =>
    [
      esc(r.reference), esc(r.adresse),
      r.ok ? r.alertes : '', r.ok ? r.aVerifier : '', r.ok ? r.aPrendreEnCompte : '', r.ok ? r.conformes : '',
      r.ok ? (r.partial ? 'OK (partiel)' : 'OK') : esc(r.error ?? 'erreur'),
    ].join(';'),
  );
  return '﻿' + [header, ...lines].join('\r\n');
}
