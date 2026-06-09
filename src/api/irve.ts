import { timedFetch } from './http';

// Fichier consolidé national des bornes de recharge (Etalab, via ODRE / Opendatasoft).
const BASE = 'https://odre.opendatasoft.com/api/explore/v2.1/catalog/datasets/bornes-irve/records';

export interface NearbyStations {
  count: number; // stations distinctes dans le rayon
  nearestM: number | null;
  maxPowerKW: number | null;
  sampleOperator: string | null;
}

function haversineM(la1: number, lo1: number, la2: number, lo2: number): number {
  const R = 6371000, r = Math.PI / 180;
  const dLa = (la2 - la1) * r, dLo = (lo2 - lo1) * r;
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Bornes publiques dans un rayon (bbox côté API + distance exacte côté client).
// La fonction distance() d'ODS ne marche pas sur leur champ géo → on filtre nous-mêmes.
export async function fetchNearbyStations(lat: number, lon: number, radiusM = 500): Promise<NearbyStations> {
  const dLat = radiusM / 111320;
  const dLon = radiusM / (111320 * Math.cos(lat * Math.PI / 180));
  const where =
    `consolidated_latitude>=${lat - dLat} AND consolidated_latitude<=${lat + dLat}` +
    ` AND consolidated_longitude>=${lon - dLon} AND consolidated_longitude<=${lon + dLon}`;
  const url = `${BASE}?where=${encodeURIComponent(where)}&limit=100` +
    `&select=nom_station,id_station_itinerance,consolidated_latitude,consolidated_longitude,puissance_nominale,nom_operateur`;

  const res = await timedFetch(url);
  if (!res.ok) throw new Error(`IRVE ${res.status}`);
  const data = await res.json();

  const stations = new Set<string>();
  let nearest = Infinity, maxPower = 0, nearestOp: string | null = null;
  for (const rec of (data.results ?? [])) {
    const la = Number(rec.consolidated_latitude), lo = Number(rec.consolidated_longitude);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) continue;
    const d = haversineM(lat, lon, la, lo);
    if (d > radiusM) continue;
    stations.add(rec.id_station_itinerance || `${rec.nom_station}@${la.toFixed(5)},${lo.toFixed(5)}`);
    let p = Number(rec.puissance_nominale);
    if (p > 1000) p /= 1000; // garde-fou W→kW
    if (Number.isFinite(p)) maxPower = Math.max(maxPower, p);
    if (d < nearest) { nearest = d; nearestOp = (rec.nom_operateur as string) || null; }
  }

  return {
    count: stations.size,
    nearestM: stations.size ? Math.round(nearest) : null,
    maxPowerKW: maxPower || null,
    sampleOperator: nearestOp,
  };
}
