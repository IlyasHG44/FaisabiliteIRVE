import { fetchPostes, isEnedisServed } from '../api/enedis';
import { fetchRisks } from '../api/georisques';
import { fetchUrbanisme, fetchNature, fetchPrescriptions } from '../api/apicarto';
import {
  raccordementCriterion, reseauxCriterion, riskCriteria,
  urbanismeCriteria, natureCriterion, prescriptionCriterion, escalateFeasibility,
} from './rules';
import type { Criterion, Poste, Site } from '../types';

export interface SiteDiagnosis {
  criteria: Criterion[];
  failed: string[]; // sources indisponibles
}

// Diagnostic complet d'un site (sans DOM) — réutilise le moteur du mode site unique.
// Résilient : chaque source qui échoue est ignorée et signalée dans `failed`.
export async function diagnoseSite(site: Site, radiusM = 2000): Promise<SiteDiagnosis> {
  const cc = site.citycode ?? '';

  let postes: Poste[] = [];
  let postesOk = true;
  try { postes = await fetchPostes(site.lat, site.lon, radiusM); } catch { postesOk = false; }

  const safe = <T>(p: Promise<T>): Promise<T | null> => p.catch(() => null);
  const [risks, urb, nature, prescriptions, enedisServed] = await Promise.all([
    safe(fetchRisks(site.lat, site.lon, cc)),
    safe(fetchUrbanisme(site.lat, site.lon)),
    safe(fetchNature(site.lat, site.lon)),
    safe(fetchPrescriptions(site.lat, site.lon)),
    isEnedisServed(site.lat, site.lon, cc).catch(() => true),
  ]);

  const built: Criterion[] = [
    raccordementCriterion(postes, postesOk, enedisServed),
    reseauxCriterion(),
  ];
  if (risks) built.push(...riskCriteria(risks));
  if (urb) built.push(...urbanismeCriteria(urb, risks));
  if (nature) built.push(natureCriterion(nature));
  if (prescriptions) built.push(prescriptionCriterion(prescriptions));

  const failed = ([[risks, 'risques'], [urb, 'urbanisme'], [nature, 'nature'], [prescriptions, 'ER']] as [unknown, string][])
    .filter(([v]) => !v)
    .map(([, n]) => n);

  return { criteria: escalateFeasibility(built), failed };
}
