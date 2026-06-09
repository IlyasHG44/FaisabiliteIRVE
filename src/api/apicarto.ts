// Connecteur API Carto IGN (module GPU) — requêtes point-dans-polygone.
// Donne le zonage PLU et les servitudes d'utilité publique (SUP) AU point exact.
import { timedFetch } from './http';

const BASE = 'https://apicarto.ign.fr/api/gpu';

async function getJson(url: string): Promise<any> {
  const res = await timedFetch(url);
  if (!res.ok) throw new Error(`API Carto ${res.status} sur ${url}`);
  return res.json();
}

export interface Urbanisme {
  pluZone: string | null; // ex. "UE"
  pluLabel: string | null; // libellé long
  pluType: string | null; // U / AU / A / N
  reglementFile: string | null; // nom du fichier règlement régissant la zone
  supTypes: string[]; // codes SUP au point (ex. ["AC1"])
}

export interface Prescriptions {
  emplacementReserve: boolean; // ER (type 05) — projet public, ex. élargissement voirie
  margeRecul: boolean; // marge de recul / alignement (type 15)
  reculText: string | null; // valeur encodée de la marge de recul (ex. "100m")
  erLabels: string[]; // libellés des ER (ex. "Emplacement Réservé n°17")
  erFeatures: GeoJSON.Feature[]; // géométries ER pour l'overlay carte
}

// Emplacements réservés & marges de recul dans un buffer ~140 m autour du point.
// L'ER/recul longe souvent la voirie, à l'écart du bâti → on élargit la recherche.
export async function fetchPrescriptions(lat: number, lon: number): Promise<Prescriptions> {
  const d = 0.0016;
  const poly = {
    type: 'Polygon',
    coordinates: [[
      [lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d],
    ]],
  };
  const geom = encodeURIComponent(JSON.stringify(poly));
  const layer = async (name: string): Promise<any[]> => {
    try {
      const j = await getJson(`${BASE}/${name}?geom=${geom}`);
      return j.features ?? [];
    } catch {
      return [];
    }
  };
  const [surf, lin] = await Promise.all([layer('prescription-surf'), layer('prescription-lin')]);
  const all = [...surf, ...lin];
  const erRaw = all.filter(f => f.properties?.typepsc === '05');
  const reculFeature = all.find(f => f.properties?.typepsc === '15');
  const erFeatures: GeoJSON.Feature[] = erRaw
    .filter(f => f.geometry)
    .map(f => ({
      type: 'Feature',
      geometry: f.geometry,
      properties: { label: f.properties?.libelle ?? 'Emplacement réservé' },
    }));
  return {
    emplacementReserve: erRaw.length > 0,
    margeRecul: !!reculFeature,
    reculText: reculFeature?.properties?.txt ?? null,
    erLabels: [...new Set(erRaw.map(f => f.properties?.libelle).filter(Boolean))] as string[],
    erFeatures,
  };
}

export interface Nature {
  natura2000: boolean; // habitats ou oiseaux au point
  znieff: boolean; // ZNIEFF type 1 ou 2 au point
}

export async function fetchNature(lat: number, lon: number): Promise<Nature> {
  const base = 'https://apicarto.ign.fr/api/nature';
  const geom = encodeURIComponent(JSON.stringify({ type: 'Point', coordinates: [lon, lat] }));
  const count = async (path: string): Promise<number> => {
    const j = await getJson(`${base}/${path}?geom=${geom}`);
    return (j.features ?? []).length;
  };
  const [habitat, oiseaux, znieff1, znieff2] = await Promise.all([
    count('natura-habitat'),
    count('natura-oiseaux'),
    count('znieff1'),
    count('znieff2'),
  ]);
  return {
    natura2000: habitat + oiseaux > 0,
    znieff: znieff1 + znieff2 > 0,
  };
}

export async function fetchUrbanisme(lat: number, lon: number): Promise<Urbanisme> {
  const geom = encodeURIComponent(JSON.stringify({ type: 'Point', coordinates: [lon, lat] }));

  const [zoneRes, supRes] = await Promise.all([
    getJson(`${BASE}/zone-urba?geom=${geom}`),
    getJson(`${BASE}/assiette-sup-s?geom=${geom}`),
  ]);

  const zone = zoneRes.features?.[0]?.properties ?? null;
  const supTypes: string[] = (supRes.features ?? [])
    .map((f: any) => (f.properties?.suptype as string)?.toUpperCase())
    .filter(Boolean);

  return {
    pluZone: zone?.libelle ?? null,
    pluLabel: zone?.libelong ?? null,
    pluType: zone?.typezone ?? null,
    reglementFile: zone?.nomfic ?? null,
    supTypes: [...new Set(supTypes)],
  };
}
