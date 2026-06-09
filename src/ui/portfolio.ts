import { resolveSite } from '../api/ban';
import { diagnoseSite } from '../diagnostic/diagnose';
import { parseSites, buildResultsCsv, TEMPLATE_CSV, type SiteInput, type SiteResult } from '../batch/csv';
import type { Criterion, RiskLevel } from '../types';

const $ = (id: string) => document.getElementById(id)!;
const CONCURRENCY = 3;

function download(filename: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function counts(criteria: Criterion[]): Record<RiskLevel, number> {
  return criteria.reduce<Record<RiskLevel, number>>(
    (a, c) => ({ ...a, [c.level]: a[c.level] + 1 }),
    { ok: 0, watch: 0, risk: 0, blocker: 0 },
  );
}

const severity = (r: SiteResult): number =>
  r.ok ? r.alertes * 1e6 + r.aVerifier * 1e3 + r.aPrendreEnCompte : -1;

let results: SiteResult[] = [];
let onOpen: (adresse: string) => void = () => {};

function renderTable(): void {
  const sorted = [...results].sort((a, b) => severity(b) - severity(a));
  const rows = sorted.map(r => {
    if (!r.ok) {
      return `<tr class="pf-err"><td>${r.reference || '—'}</td><td>${r.adresse}</td>
        <td colspan="4" class="pf-errmsg">${r.error ?? 'erreur'}</td></tr>`;
    }
    const partial = r.partial ? ' <span class="pf-partial" title="Sources indisponibles — résultat partiel, relancer">⚠</span>' : '';
    return `<tr data-adresse="${encodeURIComponent(r.adresse)}">
      <td>${r.reference || '—'}${partial}</td><td class="pf-addr">${r.adresse}</td>
      <td class="pf-n pf-blocker">${r.alertes || ''}</td>
      <td class="pf-n pf-risk">${r.aVerifier || ''}</td>
      <td class="pf-n pf-watch">${r.aPrendreEnCompte || ''}</td>
      <td class="pf-n pf-ok">${r.conformes}</td></tr>`;
  }).join('');

  $('pf-results').innerHTML = `
    <table class="pf-table">
      <thead><tr>
        <th>Réf.</th><th>Adresse</th>
        <th><span class="gdot dot-blocker"></span>alertes</th>
        <th><span class="gdot dot-risk"></span>à vérifier</th>
        <th><span class="gdot dot-watch"></span>à intégrer</th>
        <th><span class="gdot dot-ok"></span>OK</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

  $('pf-results').querySelectorAll<HTMLElement>('tr[data-adresse]').forEach(tr => {
    tr.addEventListener('click', () => onOpen(decodeURIComponent(tr.dataset['adresse']!)));
  });
}

async function analyze(sites: SiteInput[]): Promise<void> {
  results = [];
  let done = 0;
  const setProgress = () => { $('pf-progress').textContent = `${done}/${sites.length} site(s) analysé(s)`; };
  setProgress();
  $('pf-results').innerHTML = '';
  ($('pf-export') as HTMLButtonElement).classList.add('hidden');

  let idx = 0;
  const worker = async () => {
    while (idx < sites.length) {
      const i = idx++;
      const s = sites[i];
      let res: SiteResult;
      try {
        const site = await resolveSite(s.adresse);
        const { criteria, failed } = await diagnoseSite(site);
        const c = counts(criteria);
        res = { ...s, ok: true, partial: failed.length > 0, alertes: c.blocker, aVerifier: c.risk, aPrendreEnCompte: c.watch, conformes: c.ok };
      } catch (e: unknown) {
        res = { ...s, ok: false, partial: false, error: e instanceof Error ? e.message : 'erreur', alertes: 0, aVerifier: 0, aPrendreEnCompte: 0, conformes: 0 };
      }
      results.push(res);
      done++;
      setProgress();
      renderTable();
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, sites.length) }, worker));
  $('pf-progress').textContent = `${sites.length} site(s) analysé(s) — classés par gravité.`;
  if (results.length) ($('pf-export') as HTMLButtonElement).classList.remove('hidden');
}

export function initPortfolio(onOpenSite: (adresse: string) => void): void {
  onOpen = onOpenSite;

  $('pf-template').addEventListener('click', () => download('modele_sites.csv', TEMPLATE_CSV));

  const fileInput = $('pf-file') as HTMLInputElement;
  $('pf-import').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    ($('pf-input') as HTMLTextAreaElement).value = await f.text();
    fileInput.value = '';
  });

  $('pf-run').addEventListener('click', () => {
    const sites = parseSites(($('pf-input') as HTMLTextAreaElement).value);
    if (!sites.length) { $('pf-progress').textContent = 'Aucun site valide (1 par ligne).'; return; }
    void analyze(sites);
  });

  $('pf-export').addEventListener('click', () =>
    download(`portefeuille_${new Date().toISOString().slice(0, 10)}.csv`, buildResultsCsv([...results].sort((a, b) => severity(b) - severity(a)))),
  );
}
