import type { Consequence, Criterion, RiskLevel } from '../types';
import { FEATURES } from '../config';

// Étiquettes d'impact — on montre la conséquence (output), jamais la source (comment).
const CONSEQUENCE_LABEL: Record<Consequence, string> = {
  financial: '€ coût',
  delay: '⏱ délai',
  feasibility: '✗ faisabilité',
};

const LEVEL_LABEL: Record<RiskLevel, string> = {
  blocker: 'Point d\'attention',
  risk: 'À vérifier',
  watch: 'À prendre en compte',
  ok: 'Conforme',
};

// Glyphe par niveau (au-delà de la couleur seule, pour l'accessibilité).
const LEVEL_GLYPH: Record<RiskLevel, string> = {
  blocker: '!!',
  risk: '!',
  watch: 'i',
  ok: '✓',
};

// Regroupement thématique (lecture type rapport)
const GROUPS: { title: string; ids: string[] }[] = [
  { title: 'Réseau électrique', ids: ['raccordement', 'reseaux'] },
  { title: 'Risques naturels', ids: ['seisme', 'argiles', 'radon', 'mvt', 'cavites', 'inondation', 'nappe'] },
  { title: 'Risques technologiques', ids: ['pollution', 'icpe'] },
  { title: 'Urbanisme & environnement', ids: ['plu', 'prescriptions', 'monument', 'nature'] },
  { title: 'Marché / concurrence', ids: ['bornes'] },
];

function renderCriterion(c: Criterion): string {
  const tags = c.consequences
    .map(k => `<span class="impact impact-${k}">${CONSEQUENCE_LABEL[k]}</span>`)
    .join('');
  const dimmed = c.level === 'ok' ? ' is-dimmed' : '';
  return `
    <article class="crit crit-${c.level}">
      <span class="crit-glyph glyph-${c.level}" aria-hidden="true">${LEVEL_GLYPH[c.level]}</span>
      <div class="crit-body">
        <div class="crit-head">
          <h3 class="crit-label${dimmed}">${c.label}</h3>
          <span class="chip chip-${c.level}"><span aria-hidden="true">${LEVEL_GLYPH[c.level]}</span>${LEVEL_LABEL[c.level]}</span>
        </div>
        <p class="crit-detail">${c.detail}</p>
        ${tags ? `<div class="crit-tags">${tags}</div>` : ''}
      </div>
    </article>`;
}

function renderGroup(title: string, criteria: Criterion[]): string {
  if (!criteria.length) return '';
  // Récap : une pastille colorée par critère dans l'en-tête.
  const dots = criteria.map(c => `<span class="tdot tdot-${c.level}"></span>`).join('');
  // Ouvert d'office si un point à vérifier / d'attention ; replié sinon.
  const open = criteria.some(c => c.level === 'risk' || c.level === 'blocker') ? ' open' : '';
  return `
    <details class="theme"${open}>
      <summary class="theme-head">
        <h2 class="theme-title">${title}</h2>
        <span class="theme-dots">${dots}</span>
        <span class="theme-chev" aria-hidden="true">▸</span>
      </summary>
      <div class="crit-list">${criteria.map(renderCriterion).join('')}</div>
    </details>`;
}

function formatDate(): string {
  return new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

// synthEl : carte de synthèse pleine largeur · themesEl : colonne des thèmes
export function renderDiagnostic(
  synthEl: HTMLElement,
  themesEl: HTMLElement,
  criteria: Criterion[],
  siteLabel: string,
): void {
  const counts = criteria.reduce<Record<RiskLevel, number>>(
    (acc, c) => ({ ...acc, [c.level]: acc[c.level] + 1 }),
    { ok: 0, watch: 0, risk: 0, blocker: 0 },
  );

  const toAddress = counts.blocker + counts.risk + counts.watch;
  const summary = toAddress > 0
    ? `<b>${toAddress} point${toAddress > 1 ? 's' : ''} de vigilance</b> à intégrer à l'étude.`
    : 'Aucun point de vigilance détecté.';

  const order: RiskLevel[] = ['blocker', 'risk', 'watch', 'ok'];
  const countCells = order.map(l => `
    <div class="count-cell count-${l}">
      <div class="count-n"><span class="count-glyph" aria-hidden="true">${LEVEL_GLYPH[l]}</span>${String(counts[l]).padStart(2, '0')}</div>
      <div class="count-lab">${LEVEL_LABEL[l]}</div>
    </div>`).join('');

  synthEl.className = 'synth-card';
  synthEl.innerHTML = `
    <div class="synth-top">
      <div class="synth-meta">
        <span>${formatDate()}</span>
        <span class="synth-sep"></span>
        <span>Pré-diagnostic — filtre amont</span>
      </div>
      <h1 class="synth-addr">${siteLabel}</h1>
      <p class="synth-summary">${summary}</p>
    </div>
    <div class="count-grid">${countCells}</div>
    <div class="synth-note">Filtre amont destiné à dégrossir et prioriser un portefeuille de sites. Ne se substitue pas à une étude détaillée et ne formule pas de GO/NO-GO.</div>`;

  const byId = new Map(criteria.map(c => [c.id, c]));
  themesEl.innerHTML = GROUPS
    .map(g => renderGroup(g.title, g.ids.map(id => byId.get(id)).filter((c): c is Criterion => !!c)))
    .join('');
}

// Libellés thématiques (output), jamais les noms des sources interrogées (comment).
const SCAN_SOURCES: [string, string][] = [
  ['reseau', 'Réseau électrique'],
  ['risques', 'Risques naturels & technologiques'],
  ['urbanisme', 'Urbanisme & servitudes'],
  ['nature', 'Zones naturelles protégées'],
  ['prescriptions', 'Emplacements réservés'],
  ...(FEATURES.bornes ? [['bornes', 'Bornes de recharge à proximité'] as [string, string]] : []),
];

export function renderDiagnosticScan(el: HTMLElement, siteLabel: string): void {
  el.className = 'scan-card';
  el.innerHTML = `
    <p class="scan-kicker">Analyse en cours</p>
    <h2 class="scan-addr">${siteLabel}</h2>
    <p class="scan-lead">Interrogation des bases publiques. Aucune décision automatique — l'outil collecte et qualifie.</p>
    <div class="scan-track"><div class="scan-bar" id="scan-bar" style="width:0%"></div></div>
    <ul class="scan-list">
      ${SCAN_SOURCES.map(([id, label]) =>
        `<li class="scan-row" data-scan="${id}"><span class="scan-dot"></span><span class="scan-label">${label}</span><span class="scan-status">en attente</span></li>`,
      ).join('')}
    </ul>`;
}

export function markScan(el: HTMLElement, id: string, ok: boolean): void {
  const row = el.querySelector<HTMLElement>(`[data-scan="${id}"]`);
  if (row) {
    row.classList.add(ok ? 'scan-ok' : 'scan-fail');
    const status = row.querySelector('.scan-status');
    if (status) status.textContent = ok ? 'réponse · ok' : 'pas de réponse';
  }
  // Barre de progression : proportion de lignes traitées
  const rows = el.querySelectorAll('.scan-row');
  const done = el.querySelectorAll('.scan-ok, .scan-fail').length;
  const bar = el.querySelector<HTMLElement>('#scan-bar');
  if (bar && rows.length) bar.style.width = Math.round((done / rows.length) * 100) + '%';
}

export function renderDiagnosticError(el: HTMLElement, message: string): void {
  el.className = '';
  el.innerHTML = `<div class="diag-err">Diagnostic indisponible — ${message}</div>`;
}
