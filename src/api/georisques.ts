// Connecteur Géorisques — endpoints validés sur le terrain (cf. docs/regles-verdict.md)
import { timedFetch } from './http';

const BASE = 'https://www.georisques.gouv.fr/api/v1';

// latlon attendu par l'API : "lon,lat"
const ll = (lat: number, lon: number) => `${lon},${lat}`;

async function getJson(url: string): Promise<any> {
  const res = await timedFetch(url);
  if (!res.ok) throw new Error(`Géorisques ${res.status} sur ${url}`);
  return res.json();
}

export interface RisksRaw {
  seismeZone: number | null; // 1..5
  argilesExposition: number | null; // 1..3
  radonClasse: number | null; // 1..3
  mvtCount: number; // mouvements de terrain dans le rayon
  cavitesCount: number;
  aziCount: number; // zones inondables (atlas)
  catnatInondationCount: number; // arrêtés CATNAT inondation (historique commune)
  pollutionSites: string[]; // CASIAS dans 500 m
  icpeCount: number; // installations classées dans 500 m
  icpeSeveso: boolean; // au moins un établissement SEVESO dans 500 m
  icpeNames: string[]; // raisons sociales des ICPE
  remonteeNappeStatut: string | null; // statut remontée de nappe à l'adresse (rapport Géorisques)
}

// Récupère le statut "remontée de nappe" depuis le rapport risques par adresse.
// Source distincte des autres indicateurs (endpoint agrégé) → isolée et non bloquante.
async function fetchRemonteeNappe(pt: string): Promise<string | null> {
  try {
    const r = await getJson(`${BASE}/resultats_rapport_risque?latlon=${pt}&rayon=10`);
    const find = (o: any): any => {
      if (o && typeof o === 'object') {
        if ('remonteeNappe' in o) return o.remonteeNappe;
        for (const v of Object.values(o)) {
          const f = find(v);
          if (f) return f;
        }
      }
      return null;
    };
    const rn = find(r);
    return (rn?.libelleStatutAdresse ?? rn?.libelleStatutCommune) || null;
  } catch {
    return null; // statut absent → critère neutre, le reste du diagnostic tient
  }
}

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function fetchRisks(
  lat: number,
  lon: number,
  citycode: string,
): Promise<RisksRaw> {
  const pt = ll(lat, lon);

  // Endpoints géo (rayon) et commune (code_insee) lancés en parallèle
  const [seisme, argiles, radon, mvt, cavites, azi, catnat, casias, icpe, remonteeNappeStatut] = await Promise.all([
    getJson(`${BASE}/zonage_sismique?latlon=${pt}`),
    getJson(`${BASE}/rga?latlon=${pt}`),
    getJson(`${BASE}/radon?code_insee=${citycode}`),
    getJson(`${BASE}/mvt?latlon=${pt}&rayon=500&page_size=1`),
    getJson(`${BASE}/cavites?latlon=${pt}&rayon=500&page_size=1`),
    getJson(`${BASE}/gaspar/azi?latlon=${pt}&rayon=1000&page_size=1`),
    getJson(`${BASE}/gaspar/catnat?code_insee=${citycode}&page_size=50`),
    getJson(`${BASE}/ssp/casias?latlon=${pt}&rayon=500&page_size=20`),
    getJson(`${BASE}/installations_classees?latlon=${pt}&rayon=500&page_size=20`),
    fetchRemonteeNappe(pt),
  ]);

  const icpeData: any[] = icpe.data ?? [];
  const isSeveso = (s: unknown) => /seveso/i.test(String(s)) && !/non[-\s]?seveso/i.test(String(s));

  // zonage_sismique renvoie plusieurs communes du secteur → filtrer sur la nôtre
  const seismeRow =
    (seisme.data ?? []).find((d: any) => d.code_insee === citycode) ?? seisme.data?.[0];

  const catnatInondation = (catnat.data ?? []).filter((d: any) =>
    /inondation/i.test(d.libelle_risque_jo ?? ''),
  ).length;

  return {
    seismeZone: num(seismeRow?.code_zone),
    argilesExposition: num(argiles?.codeExposition),
    radonClasse: num(radon.data?.[0]?.classe_potentiel),
    mvtCount: num(mvt?.results) ?? 0,
    cavitesCount: num(cavites?.results) ?? 0,
    aziCount: num(azi?.results) ?? 0,
    catnatInondationCount: catnatInondation,
    pollutionSites: (casias.data ?? [])
      .map((d: any) => d.nom_etablissement as string)
      .filter(Boolean),
    icpeCount: num(icpe?.results) ?? icpeData.length,
    icpeSeveso: icpeData.some((d) => isSeveso(d.statutSeveso)),
    icpeNames: icpeData.map((d) => d.raisonSociale as string).filter(Boolean),
    remonteeNappeStatut,
  };
}
