import { fetchElevation } from '../api/altimetrie';
import type { Site } from '../types';

// Module surélévation (PPRi) — logique validée avec Basile / DMZ :
//   surélévation minimale ≈ cote de référence (lue au PPRi) − altitude du site (IGN).
// L'altitude est récupérée automatiquement ; la cote de référence reste une saisie
// manuelle (elle est gravée dans la carte réglementaire, non extractible de façon fiable).

function georisquesLink(citycode: string | undefined): string {
  // Rapport risques de la commune (dont PPRi) sur Géorisques.
  return citycode
    ? `https://www.georisques.gouv.fr/mes-risques/connaitre-les-risques-pres-de-chez-moi/rapport?codeInsee=${citycode}`
    : 'https://www.georisques.gouv.fr/risques/inondations';
}

function renderResult(el: HTMLElement, alt: number | null, cote: number | null): void {
  if (alt === null) {
    el.innerHTML = '<span class="sur-muted">Altitude du site indisponible à ce point (hors couverture des données altimétriques).</span>';
    return;
  }
  if (cote === null || Number.isNaN(cote)) {
    el.innerHTML = `<span class="sur-muted">Altitude du site : <b>${alt.toFixed(2)} m NGF</b>. Saisis la cote de référence pour estimer la surélévation.</span>`;
    return;
  }
  const delta = cote - alt;
  if (delta <= 0) {
    el.innerHTML = `Site à <b>${alt.toFixed(2)} m NGF</b>, au-dessus de la cote de référence (${cote.toFixed(2)} m) → <b>pas de surélévation</b> a priori requise. À confirmer au règlement.`;
    return;
  }
  el.innerHTML = `Surélévation minimale estimée : <b class="sur-val">≈ ${delta.toFixed(2)} m</b> <span class="sur-muted">(${cote.toFixed(2)} − ${alt.toFixed(2)} m NGF)</span>`;
}

// Altitude du site (toujours affichée, dans la carte) — info utile hors PPRi.
export function renderSiteAltitude(el: HTMLElement, site: Site): void {
  el.innerHTML = '<span class="map-meta-k">Altitude du site</span><span class="map-meta-v" data-alt>calcul…</span>';
  const v = el.querySelector<HTMLElement>('[data-alt]')!;
  fetchElevation(site.lat, site.lon)
    .then(a => { v.textContent = a === null ? 'indisponible' : `${a.toFixed(1)} m NGF`; })
    .catch(() => { v.textContent = 'indisponible'; });
}

export function renderSurelevation(el: HTMLElement, site: Site): void {
  const link = georisquesLink(site.citycode);
  el.innerHTML = `
    <details class="theme" open>
      <summary class="theme-head">
        <h2 class="theme-title">Estimation de surélévation (PPRi)</h2>
        <span class="theme-chev" aria-hidden="true">▸</span>
      </summary>
      <div class="sur-inner">
        <p class="sur-lead">
          Site en zone PPR inondation. Consulte le zonage réglementaire
          (<a href="${link}" target="_blank" rel="noopener">consulter le zonage PPRi ↗</a>),
          relève la <b>cote de référence</b> la plus proche, puis saisis-la ci-dessous.
        </p>
        <div class="sur-row">
          <label class="sur-field">
            Altitude du site
            <span class="sur-auto" data-sur="alt">calcul…</span>
          </label>
          <label class="sur-field">
            Cote de référence (m NGF)
            <input type="number" step="0.01" inputmode="decimal" class="sur-input" data-sur="cote" placeholder="ex. 64.50" />
          </label>
        </div>
        <div class="sur-out" data-sur="out"></div>
        <p class="sur-note">
          Valeur indicative (altitude open data, précision ~0,2–0,5 m). La marge réglementaire
          éventuelle (revanche au-dessus des PHE) reste à vérifier dans le règlement du PPRi.
        </p>
      </div>
    </details>`;

  const altEl = el.querySelector<HTMLElement>('[data-sur="alt"]')!;
  const coteEl = el.querySelector<HTMLInputElement>('[data-sur="cote"]')!;
  const outEl = el.querySelector<HTMLElement>('[data-sur="out"]')!;

  let alt: number | null = null;
  const refresh = () => {
    const raw = coteEl.value.trim();
    renderResult(outEl, alt, raw === '' ? null : parseFloat(raw.replace(',', '.')));
  };

  coteEl.addEventListener('input', refresh);

  fetchElevation(site.lat, site.lon)
    .then(a => {
      alt = a;
      altEl.textContent = a === null ? 'indisponible' : `${a.toFixed(2)} m NGF`;
      refresh();
    })
    .catch(() => {
      altEl.textContent = 'indisponible';
      renderResult(outEl, null, null);
    });
}
