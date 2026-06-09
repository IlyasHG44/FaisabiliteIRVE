import type { Poste } from '../types';
import { timedFetch } from './http';

const BASE = 'https://opendata.enedis.fr/data-fair/api/v1/datasets/poste-electrique/lines';

export async function fetchPostes(lat: number, lon: number, radiusM: number): Promise<Poste[]> {
  const url = `${BASE}?geo_distance=${lon},${lat},${radiusM}m&size=100`;
  let res: Response;
  try {
    res = await timedFetch(url);
  } catch {
    throw new Error('Open data Enedis indisponible (timeout ou réseau).');
  }
  if (!res.ok) throw new Error(`API Enedis indisponible (${res.status}). Réessaie dans quelques instants.`);
  const data = await res.json();

  const postes: Poste[] = [];
  for (const rec of (data.results ?? [])) {
    if (!rec._geopoint || rec._geo_distance == null) continue;
    const [rlat, rlon] = (rec._geopoint as string).split(',').map(Number);
    postes.push({
      lat: rlat,
      lon: rlon,
      dist: rec._geo_distance as number,
      commune: (rec.nom_commune ?? '') as string,
    });
  }
  postes.sort((a, b) => a.dist - b.dist);
  return postes;
}

// Le secteur du site est-il desservi par Enedis ? On cherche un poste Enedis
// DE LA COMMUNE du site et PROCHE de lui (geo + code_commune). S'il n'y en a
// aucun, le site est quasi certainement en régie locale (ELD) → l'estimation
// raccordement Enedis n'a pas de sens. Couverture mixte gérée (on ne se fie pas
// au seul compte communal). En cas de doute (erreur/réseau), on suppose Enedis.
export async function isEnedisServed(lat: number, lon: number, citycode: string): Promise<boolean> {
  try {
    const url = `${BASE}?geo_distance=${lon},${lat},2500m&qs=code_commune:${encodeURIComponent(citycode)}&size=1`;
    const res = await timedFetch(url);
    if (!res.ok) return true;
    const data = await res.json();
    return (data.total ?? 0) > 0;
  } catch {
    return true;
  }
}
