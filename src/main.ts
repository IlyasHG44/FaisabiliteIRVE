import './style.css';
import { geocode, reverseGeocode, parseCoords } from './api/ban';
import { fetchPostes, isEnedisServed } from './api/enedis';
import { fetchRisks } from './api/georisques';
import { fetchUrbanisme, fetchNature, fetchPrescriptions } from './api/apicarto';
import { fetchNearbyStations } from './api/irve';
import { raccordementCriterion, reseauxCriterion, riskCriteria, urbanismeCriteria, natureCriterion, prescriptionCriterion, bornesCriterion, escalateFeasibility } from './diagnostic/rules';
import { initAutocomplete } from './ui/autocomplete';
import { renderMap, renderOverlays } from './ui/map';
import { renderDiagnostic, renderDiagnosticScan, markScan, renderDiagnosticError } from './ui/diagnostic';
import { renderSurelevation, renderSiteAltitude } from './ui/surelevation';
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

function showResults(): void {
  $('home').classList.add('hidden');
  $('results').classList.remove('hidden');
  window.scrollTo({ top: 0 });
}

function showHome(): void {
  $('results').classList.add('hidden');
  $('home').classList.remove('hidden');
  window.scrollTo({ top: 0 });
}

// Export PDF = impression navigateur (le PDF reprend exactement la page, via le CSS print).
function exportPdf(): void { window.print(); }

// À l'impression, déplier tous les blocs repliés (groupes + surélévation) puis les
// restaurer après — garantit que le PDF contient tout, dépliés ou non.
let collapsedForPrint: HTMLDetailsElement[] = [];
window.addEventListener('beforeprint', () => {
  collapsedForPrint = Array.from(document.querySelectorAll<HTMLDetailsElement>('details.theme:not([open])'));
  collapsedForPrint.forEach(d => { d.open = true; });
});
window.addEventListener('afterprint', () => {
  collapsedForPrint.forEach(d => { d.open = false; });
  collapsedForPrint = [];
});

// Bloc latéral : postes électriques à proximité, numérotés comme sur la carte.
function renderPostes(el: HTMLElement, postes: Poste[]): void {
  if (!postes.length) {
    el.innerHTML = '<div class="postes-head">Postes électriques à proximité</div><div class="postes-empty">Aucun poste répertorié dans le rayon.</div>';
    return;
  }
  const rows = postes.slice(0, 8)
    .map((p, i) => `<li><span class="poste-id">P${i + 1}</span><span class="poste-dist">${Math.round(p.dist)} m</span></li>`)
    .join('');
  el.innerHTML = `<div class="postes-head">Postes électriques à proximité</div><ul class="postes-list">${rows}</ul>`;
}

async function run() {
  const radiusM = parseInt(($('radius') as HTMLSelectElement).value, 10);
  const goBtn = $('go') as HTMLButtonElement;
  const statusEl = $('status');

  goBtn.disabled = true;
  statusEl.className = 'status';

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
    statusEl.textContent = '';
    showResults();
    // Réseau non bloquant : s'il est lent/down, le reste du diagnostic tourne quand même.
    let postes: Poste[] = [];
    let postesOk = true;
    try {
      postes = await fetchPostes(site.lat, site.lon, radiusM);
    } catch {
      postesOk = false;
    }

    renderMap(site, postes);
    renderPostes($('postes-block'), postes);
    void runDiagnostic(site, postes, postesOk);
  } catch (e: unknown) {
    statusEl.className = 'status err';
    statusEl.textContent = 'Erreur : ' + (e instanceof Error ? e.message : String(e));
  } finally {
    goBtn.disabled = false;
  }
}

// Module surélévation : affiché uniquement si le site est en PPR inondation
// (critère 'inondation' non conforme). Caché sinon.
function mountSurelevation(site: Site, criteria: Criterion[]): void {
  const el = $('surelevation');
  const inPpri = criteria.some(c => c.id === 'inondation' && c.level !== 'ok');
  if (!inPpri) { el.classList.add('hidden'); el.innerHTML = ''; return; }
  el.classList.remove('hidden');
  renderSurelevation(el, site);
}

// Diagnostic faisabilité — isolé du flux principal : un échec (CORS, API) n'affecte
// pas l'affichage de la carte déjà rendue.
async function runDiagnostic(site: Site, postes: Poste[], postesOk: boolean) {
  const synthEl = $('synth');
  const themesEl = $('diagnostic');
  renderDiagnosticScan(synthEl, site.label);
  themesEl.innerHTML = '';
  if (!site.citycode) { renderDiagnosticError(themesEl, 'code INSEE manquant pour cette adresse'); return; }

  const cc = site.citycode;
  // Chaque source échoue indépendamment (un timeout n'efface pas tout) et allume
  // sa ligne du scan dès qu'elle répond.
  const track = <T, F>(id: string, p: Promise<T>, fallback: F): Promise<T | F> =>
    p.then((v): T | F => { markScan(synthEl, id, true); return v; })
     .catch((): T | F => { markScan(synthEl, id, false); return fallback; });

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

  renderDiagnostic(synthEl, themesEl, criteria, site.label);
  renderSiteAltitude($('map-meta'), site);
  mountSurelevation(site, criteria);
  renderOverlays({
    er: prescriptions?.erFeatures ?? [],
    zone: urb?.zoneFeature ?? null,
    ppr: urb?.pprFeatures ?? [],
  });
}

$('go').addEventListener('click', run);
$('brand-home').addEventListener('click', showHome);
document.getElementById('pdf-btn-top')?.addEventListener('click', exportPdf);

// Recherche depuis la barre supérieure (résultat) → relance un diagnostic
$('top-search').addEventListener('submit', e => {
  e.preventDefault();
  const v = ($('addr-top') as HTMLInputElement).value.trim();
  if (!v) return;
  picked = null;
  ($('addr') as HTMLInputElement).value = v;
  run();
});
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
});

// ── Mode Démo : rendu instantané depuis le cache (zéro appel API bloquant) ──
function loadDemo(d: DemoSiteCache): void {
  picked = null;
  ($('addr') as HTMLInputElement).value = d.site.label;
  showResults();

  renderMap(d.site, d.postes);
  renderPostes($('postes-block'), d.postes);
  renderDiagnostic($('synth'), $('diagnostic'), d.criteria, d.site.label);
  renderSiteAltitude($('map-meta'), d.site);
  mountSurelevation(d.site, d.criteria);

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
