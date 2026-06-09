import './style.css';
import { geocode, reverseGeocode, parseCoords } from './api/ban';
import { fetchPostes, isEnedisServed } from './api/enedis';
import { fetchRisks } from './api/georisques';
import { fetchUrbanisme, fetchNature, fetchPrescriptions } from './api/apicarto';
import { raccordementCriterion, reseauxCriterion, riskCriteria, urbanismeCriteria, natureCriterion, prescriptionCriterion } from './diagnostic/rules';
import { initAutocomplete } from './ui/autocomplete';
import { renderMap, renderReservedAreas } from './ui/map';
import { renderSynthesis } from './ui/synthesis';
import { renderDiagnostic, renderDiagnosticLoading, renderDiagnosticError } from './ui/diagnostic';
import { exportPdf } from './export/pdf';
import type { Criterion, Poste, Site } from './types';

const $ = (id: string) => document.getElementById(id)!;

let picked: Site | null = null;

initAutocomplete(
  $('addr') as HTMLInputElement,
  $('ac'),
  site => { picked = site.lat !== 0 ? site : null; },
);

async function run() {
  const radiusM = parseInt(($('radius') as HTMLSelectElement).value, 10);
  const goBtn = $('go') as HTMLButtonElement;
  const statusEl = $('status');

  goBtn.disabled = true;
  statusEl.className = 'status';
  ($('pdf-btn') as HTMLButtonElement).classList.add('hidden'); // réaffiché quand le diagnostic est prêt

  try {
    let site = picked;
    if (!site) {
      const q = ($('addr') as HTMLInputElement).value.trim();
      if (!q) { statusEl.textContent = 'Saisis une adresse ou des coordonnées.'; return; }
      const coords = parseCoords(q);
      if (coords) {
        statusEl.textContent = 'Localisation des coordonnées…';
        site = await reverseGeocode(coords.lat, coords.lon);
      } else {
        statusEl.textContent = 'Géocodage de l\'adresse…';
        site = await geocode(q);
      }
    }
    statusEl.textContent = 'Interrogation de l\'open data Enedis…';
    // Enedis non bloquant : s'il est lent/down, le reste du diagnostic tourne quand même.
    let postes: Poste[] = [];
    let postesOk = true;
    try {
      postes = await fetchPostes(site.lat, site.lon, radiusM);
    } catch {
      postesOk = false;
    }
    statusEl.textContent = postesOk
      ? `Analyse terminée — ${postes.length} poste(s) dans le rayon.`
      : 'Réseau Enedis indisponible — diagnostic poursuivi sans le raccordement.';

    const radiusKm = radiusM / 1000;
    $('empty').classList.add('hidden');
    $('results').classList.remove('hidden');
    renderMap(site, postes);
    renderSynthesis($('syn'), $('plist'), site, postes, radiusKm);

    void runDiagnostic(site, postes, postesOk);
  } catch (e: unknown) {
    statusEl.className = 'status err';
    statusEl.textContent = 'Erreur : ' + (e instanceof Error ? e.message : String(e));
  } finally {
    goBtn.disabled = false;
  }
}

// Diagnostic faisabilité — isolé du flux principal : un échec (CORS, API) n'affecte
// pas l'affichage du raccordement déjà rendu.
async function runDiagnostic(site: Site, postes: Poste[], postesOk: boolean) {
  const diagEl = $('diagnostic');
  renderDiagnosticLoading(diagEl);
  if (!site.citycode) { renderDiagnosticError(diagEl, 'code INSEE manquant pour cette adresse'); return; }

  // Chaque source échoue indépendamment : un timeout n'efface pas tout le diagnostic.
  const [risks, urb, nature, prescriptions, enedisServed] = await Promise.all([
    fetchRisks(site.lat, site.lon, site.citycode).catch(() => null),
    fetchUrbanisme(site.lat, site.lon).catch(() => null),
    fetchNature(site.lat, site.lon).catch(() => null),
    fetchPrescriptions(site.lat, site.lon).catch(() => null),
    isEnedisServed(site.lat, site.lon, site.citycode).catch(() => true),
  ]);

  const criteria: Criterion[] = [
    raccordementCriterion(postes, postesOk, enedisServed),
    reseauxCriterion(),
  ];
  if (risks) criteria.push(...riskCriteria(risks));
  if (urb) criteria.push(...urbanismeCriteria(urb, risks));
  if (nature) criteria.push(natureCriterion(nature));
  if (prescriptions) criteria.push(prescriptionCriterion(prescriptions));

  renderDiagnostic(diagEl, criteria, site.label);
  renderReservedAreas(site, prescriptions?.erFeatures ?? []);

  // Signaler les sources éventuellement indisponibles (honnêteté du diagnostic)
  const failed = [
    [risks, 'risques'], [urb, 'urbanisme'], [nature, 'zones naturelles'], [prescriptions, 'emplacements réservés'],
  ].filter(([v]) => !v).map(([, n]) => n as string);
  if (failed.length) {
    $('status').textContent += ` · sources indisponibles : ${failed.join(', ')} (relancer)`;
  }

  // Le PDF reprend le diagnostic → disponible une fois les critères calculés
  const pdfBtn = $('pdf-btn') as HTMLButtonElement;
  pdfBtn.onclick = () => { void exportPdf(site, criteria); };
  pdfBtn.classList.remove('hidden');
}

$('go').addEventListener('click', run);
($('addr') as HTMLInputElement).addEventListener('keydown', e => {
  if (e.key === 'Enter') run();
});

// Exemples de l'état initial : remplissent le champ et lancent l'analyse
document.querySelectorAll<HTMLButtonElement>('.ex').forEach(btn => {
  btn.addEventListener('click', () => {
    picked = null;
    ($('addr') as HTMLInputElement).value = btn.dataset['q'] ?? '';
    run();
  });
});
