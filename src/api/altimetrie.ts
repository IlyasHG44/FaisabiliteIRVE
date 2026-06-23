import { timedFetch } from './http';

// Altitude au point via IGN RGE ALTI (open data, sans clé). Renvoie une cote en m NGF.
// Précision verticale ~0,2–0,5 m : valeur indicative, pas une cote de calcul.
const ALTI_URL =
  'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json' +
  '?resource=ign_rge_alti_wld&zonly=true';

interface AltiResponse {
  elevations?: number[];
}

export async function fetchElevation(lat: number, lon: number): Promise<number | null> {
  const url = `${ALTI_URL}&lon=${lon}&lat=${lat}`;
  const res = await timedFetch(url);
  if (!res.ok) throw new Error(`altimétrie IGN ${res.status}`);
  const data = (await res.json()) as AltiResponse;
  const alt = data.elevations?.[0];
  // L'API renvoie -99999 quand le point est hors couverture.
  if (typeof alt !== 'number' || alt < -1000) return null;
  return alt;
}
