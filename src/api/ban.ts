import type { Site } from '../types';

const BASE = 'https://api-adresse.data.gouv.fr/search/';

export interface BanFeature {
  label: string;
  ctx: string;
  lat: number;
  lon: number;
  citycode: string;
}

export async function autocomplete(q: string): Promise<BanFeature[]> {
  const url = `${BASE}?autocomplete=1&limit=6&q=${encodeURIComponent(q)}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.features ?? []).map((f: any) => ({
    label: f.properties.label as string,
    ctx: (f.properties.context ?? '') as string,
    lat: f.geometry.coordinates[1] as number,
    lon: f.geometry.coordinates[0] as number,
    citycode: (f.properties.citycode ?? '') as string,
  }));
}

// Détecte une saisie de coordonnées ("48.8566, 2.3522" ou "2.3522 48.8566").
// Exige des décimales (les coordonnées en ont toujours) pour éviter les faux positifs.
export function parseCoords(q: string): { lat: number; lon: number } | null {
  const nums = (q.match(/-?\d{1,3}\.\d+/g) ?? []).map(Number);
  if (nums.length !== 2) return null;
  const [a, b] = nums;
  if (Math.abs(a) > 90 && Math.abs(b) > 90) return null;
  // Par défaut "lat, lon" ; heuristique France pour corriger un ordre inversé
  let lat = a, lon = b;
  const inFrLat = (n: number) => n >= 41 && n <= 52;
  if (!inFrLat(a) && inFrLat(b)) { lat = b; lon = a; }
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

// Géocodage inverse : récupère commune + code INSEE pour des coordonnées données.
// On conserve les coordonnées EXACTES saisies (la précision est l'objectif).
export async function reverseGeocode(lat: number, lon: number): Promise<Site> {
  const url = `${BASE.replace('/search/', '/reverse/')}?lon=${lon}&lat=${lat}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Localisation indisponible (${res.status})`);
  const data = await res.json();
  const f = data.features?.[0];
  const commune = f?.properties?.city ?? '';
  return {
    lat,
    lon,
    label: `${lat.toFixed(5)}, ${lon.toFixed(5)}${commune ? ` · ${commune}` : ''}`,
    citycode: f?.properties?.citycode,
  };
}

export async function geocode(q: string): Promise<Site> {
  const url = `${BASE}?limit=1&q=${encodeURIComponent(q)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Géocodage indisponible (${res.status})`);
  const data = await res.json();
  if (!data.features?.length) throw new Error('Adresse introuvable. Précise commune + code postal.');
  const f = data.features[0];
  return {
    lon: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
    label: f.properties.label,
    citycode: f.properties.citycode,
  };
}
