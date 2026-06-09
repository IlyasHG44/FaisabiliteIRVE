import type { Consequence, Criterion, RiskLevel } from '../types';
import { FEATURES } from '../config';

const CONSEQUENCE_LABEL: Record<Consequence, string> = {
  financial: '€ impact financier',
  delay: '⏱ délai',
  feasibility: '✗ faisabilité',
};

// Libellés "flag" (et non verdict) — l'outil signale, il ne décide pas.
const COUNT_LABEL: Record<RiskLevel, (n: number) => string> = {
  blocker: n => `${n} alerte${n > 1 ? 's' : ''}`,
  risk: n => `${n} à vérifier`,
  watch: n => `${n} à prendre en compte`,
  ok: n => `${n} conforme${n > 1 ? 's' : ''}`,
};

// Regroupement thématique (lecture type rapport)
const GROUPS: { title: string; ids: string[] }[] = [
  { title: 'Réseau électrique', ids: ['raccordement', 'reseaux'] },
  { title: 'Risques naturels', ids: ['seisme', 'argiles', 'radon', 'mvt', 'cavites', 'inondation'] },
  { title: 'Risques technologiques', ids: ['pollution', 'icpe'] },
  { title: 'Urbanisme & environnement', ids: ['plu', 'prescriptions', 'monument', 'nature'] },
  { title: 'Marché / concurrence', ids: ['bornes'] },
];

function renderCriterion(c: Criterion): string {
  const tags = c.consequences
    .map(k => `<span class="conseq conseq-${k}">${CONSEQUENCE_LABEL[k]}</span>`)
    .join('');
  return `
    <div class="crit crit-${c.level}">
      <span class="crit-dot dot-${c.level}"></span>
      <div class="crit-body">
        <div class="crit-head">
          <span class="crit-label">${c.label}</span>
          ${tags ? `<span class="crit-tags">${tags}</span>` : ''}
        </div>
        <div class="crit-detail">${c.detail}</div>
      </div>
    </div>`;
}

function renderGroup(title: string, criteria: Criterion[]): string {
  if (!criteria.length) return '';
  // Récap : une pastille colorée par critère, dans l'en-tête repliable.
  const dots = criteria.map(c => `<span class="gdot dot-${c.level}"></span>`).join('');
  // Ouvert d'office si un point à vérifier (🟠) / bloquant ; replié sinon.
  const open = criteria.some(c => c.level === 'risk' || c.level === 'blocker') ? ' open' : '';
  return `
    <details class="diag-group"${open}>
      <summary class="diag-group-head">
        <span class="diag-group-title">${title}</span>
        <span class="diag-group-dots">${dots}</span>
      </summary>
      <div class="crit-grid">${criteria.map(renderCriterion).join('')}</div>
    </details>`;
}

export function renderDiagnostic(el: HTMLElement, criteria: Criterion[], siteLabel: string): void {
  const counts = criteria.reduce<Record<RiskLevel, number>>(
    (acc, c) => ({ ...acc, [c.level]: acc[c.level] + 1 }),
    { ok: 0, watch: 0, risk: 0, blocker: 0 },
  );

  const toAddress = counts.blocker + counts.risk + counts.watch;
  const tone = counts.blocker ? 'no-go' : counts.risk ? 'reserve' : counts.watch ? 'go' : 'go-franc';
  const headline = toAddress > 0
    ? `${toAddress} point${toAddress > 1 ? 's' : ''} à intégrer à l'étude`
    : 'Aucun point de vigilance détecté';

  const order: RiskLevel[] = ['blocker', 'risk', 'watch', 'ok'];
  const chips = order
    .filter(l => counts[l] > 0)
    .map(l => `<span class="count count-${l}">${COUNT_LABEL[l](counts[l])}</span>`)
    .join('');

  const byId = new Map(criteria.map(c => [c.id, c]));
  const groups = GROUPS
    .map(g => renderGroup(g.title, g.ids.map(id => byId.get(id)).filter((c): c is Criterion => !!c)))
    .join('');

  el.innerHTML = `
    <div class="hero hero-${tone}">
      <div class="hero-main">
        <div class="hero-decision">${headline}</div>
        <div class="hero-rationale">Pré-diagnostic indicatif — à confirmer en étude détaillée.</div>
        <div class="hero-addr">${siteLabel}</div>
      </div>
      <div class="hero-counts">${chips}</div>
    </div>
    ${groups}`;
}

const SCAN_SOURCES: [string, string][] = [
  ['reseau', 'Réseau Enedis'],
  ['risques', 'Risques naturels & technologiques'],
  ['urbanisme', 'Urbanisme (PLU, servitudes)'],
  ['nature', 'Zones naturelles protégées'],
  ['prescriptions', 'Emplacements réservés'],
  ...(FEATURES.bornes ? [['bornes', 'Bornes de recharge (concurrence)'] as [string, string]] : []),
];

export function renderDiagnosticScan(el: HTMLElement): void {
  el.innerHTML = `
    <div class="scan">
      <div class="scan-title">Analyse des bases publiques…</div>
      <ul class="scan-list">
        ${SCAN_SOURCES.map(([id, label]) =>
          `<li class="scan-row" data-scan="${id}"><span class="scan-dot"></span>${label}</li>`,
        ).join('')}
      </ul>
    </div>`;
}

export function markScan(el: HTMLElement, id: string, ok: boolean): void {
  el.querySelector(`[data-scan="${id}"]`)?.classList.add(ok ? 'scan-ok' : 'scan-fail');
}

export function renderDiagnosticError(el: HTMLElement, message: string): void {
  el.innerHTML = `<div class="diag-err">Diagnostic indisponible — ${message}</div>`;
}
