import './style.css';
import { geocode, reverseGeocode, parseCoords } from './api/ban';
import { fetchPostes, isEnedisServed } from './api/enedis';
import { fetchRisks } from './api/georisques';
import { fetchUrbanisme, fetchNature, fetchPrescriptions } from './api/apicarto';
import { fetchNearbyStations } from './api/irve';
import { raccordementCriterion, reseauxCriterion, riskCriteria, urbanismeCriteria, natureCriterion, prescriptionCriterion, bornesCriterion, escalateFeasibility } from './diagnostic/rules';
import { initAutocomplete } from './ui/autocomplete';
import { renderMap, renderOverlays } from './ui/map';
import { renderSynthesis } from './ui/synthesis';
import { renderDiagnostic, renderDiagnosticScan, markScan, renderDiagnosticError } from './ui/diagnostic';
import { exportPdf } from './export/pdf';
import { initPortfolio } from './ui/portfolio';
import { DEMO_SITES, type DemoSiteCache } from './demo/demoData';
import { FEATURES } from './config';
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
  renderDiagnosticScan(diagEl);
  if (!site.citycode) { renderDiagnosticError(diagEl, 'code INSEE manquant pour cette adresse'); return; }

  const cc = site.citycode;
  // Chaque source échoue indépendamment (un timeout n'efface pas tout) et allume
  // sa ligne du scan dès qu'elle répond.
  const track = <T, F>(id: string, p: Promise<T>, fallback: F): Promise<T | F> =>
    p.then((v): T | F => { markScan(diagEl, id, true); return v; })
     .catch((): T | F => { markScan(diagEl, id, false); return fallback; });

  const [risks, urb, nature, prescriptions, bornes, enedisServed] = await Promise.all([
    track('risques', fetchRisks(site.lat, site.lon, cc), null),
    track('urbanisme', fetchUrbanisme(site.lat, site.lon), null),
    track('nature', fetchNature(site.lat, site.lon), null),
    track('prescriptions', fetchPrescriptions(site.lat, site.lon), null),
    FEATURES.bornes ? track('bornes', fetchNearbyStations(site.lat, site.lon), null) : Promise.resolve(null),
    track('reseau', isEnedisServed(site.lat, site.lon, cc), true),
  ]);

  const built: Criterion[] = [
    raccordementCriterion(postes, postesOk, enedisServed),
    reseauxCriterion(),
  ];
  if (risks) built.push(...riskCriteria(risks));
  if (urb) built.push(...urbanismeCriteria(urb, risks));
  if (nature) built.push(natureCriterion(nature));
  if (prescriptions) built.push(prescriptionCriterion(prescriptions));
  if (bornes) built.push(bornesCriterion(bornes));
  const criteria = escalateFeasibility(built);

  renderDiagnostic(diagEl, criteria, site.label);
  renderOverlays({
    er: prescriptions?.erFeatures ?? [],
    zone: urb?.zoneFeature ?? null,
    ppr: urb?.pprFeatures ?? [],
  });

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

// Mode portefeuille : clic sur une ligne → ouvre le diagnostic détaillé du site
initPortfolio((adresse: string) => {
  picked = null;
  ($('addr') as HTMLInputElement).value = adresse;
  run();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ── Mode Démo : rendu instantané depuis le cache (zéro appel API bloquant) ──
function loadDemo(d: DemoSiteCache): void {
  picked = null;
  ($('addr') as HTMLInputElement).value = d.site.label;
  $('status').className = 'status';
  $('status').textContent = `Mode démo — ${d.site.label} (résultat en cache)`;
  $('empty').classList.add('hidden');
  $('results').classList.remove('hidden');

  renderMap(d.site, d.postes);
  renderSynthesis($('syn'), $('plist'), d.site, d.postes, 2);
  renderDiagnostic($('diagnostic'), d.criteria, d.site.label);

  const pdfBtn = $('pdf-btn') as HTMLButtonElement;
  pdfBtn.onclick = () => { void exportPdf(d.site, d.criteria); };
  pdfBtn.classList.remove('hidden');

  // Overlays carte en best-effort (non bloquant : si l'API tombe, la carte reste propre)
  void (async () => {
    try {
      const [urb, presc] = await Promise.all([
        fetchUrbanisme(d.site.lat, d.site.lon).catch(() => null),
        fetchPrescriptions(d.site.lat, d.site.lon).catch(() => null),
      ]);
      renderOverlays({ er: presc?.erFeatures ?? [], zone: urb?.zoneFeature ?? null, ppr: urb?.pprFeatures ?? [] });
    } catch { /* carte sans overlays — sans gravité */ }
  })();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Bouton "Mode démo" : ouvre un petit sélecteur des sites en cache
const demoPicker = $('demo-picker');
demoPicker.innerHTML = DEMO_SITES.map((s, i) => `<button class="demo-item" data-i="${i}">${s.name}</button>`).join('');
demoPicker.querySelectorAll<HTMLButtonElement>('.demo-item').forEach(btn => {
  btn.addEventListener('click', () => {
    demoPicker.classList.add('hidden');
    loadDemo(DEMO_SITES[parseInt(btn.dataset['i']!, 10)].data);
  });
});
$('demo-btn').addEventListener('click', () => demoPicker.classList.toggle('hidden'));
