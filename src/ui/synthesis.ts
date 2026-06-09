import type { Poste, Site, Verdict } from '../types';

export function getVerdict(nearestDist: number): Verdict {
  if (nearestDist < 100) return { level: 'good', text: 'Très proche — raccordement a priori simple. Linéaire de câble court.' };
  if (nearestDist < 300) return { level: 'mid', text: 'Distance modérée — raccordement plausible, coût à confirmer.' };
  return { level: 'far', text: 'Poste éloigné — linéaire important probable, surcoût de raccordement à anticiper.' };
}

export function renderSynthesis(
  synEl: HTMLElement,
  plistEl: HTMLElement,
  site: Site,
  postes: Poste[],
  radiusKm: number,
): void {
  const n = postes.length;
  const nearest = n ? postes[0].dist : null;
  const within300 = postes.filter(p => p.dist < 300).length;
  const verdict = nearest != null ? getVerdict(nearest) : null;

  synEl.innerHTML = `
    <div class="addr">${site.label}</div>
    <div class="coords">${site.lat.toFixed(5)}, ${site.lon.toFixed(5)}</div>
    <div class="metric"><span class="k">Poste HTA/BT le plus proche</span><span class="v">${nearest != null ? Math.round(nearest) + ' m' : 'aucun'}</span></div>
    <div class="metric"><span class="k">Postes dans ${radiusKm} km</span><span class="v">${n}</span></div>
    <div class="metric"><span class="k">Postes à moins de 300 m</span><span class="v">${within300}</span></div>
    ${verdict
      ? `<div class="verdict ${verdict.level}">${verdict.text}</div>`
      : `<div class="verdict far">Aucun poste dans ce rayon — élargis la recherche.</div>`
    }`;

  plistEl.innerHTML = n
    ? postes.slice(0, 12).map((p, i) => `
        <li>
          <span class="name"><span class="pin">${i + 1}</span> ${p.commune || 'poste HTA/BT'}</span>
          <span class="dist">${Math.round(p.dist)} m</span>
        </li>`).join('')
    : '<li style="color:var(--muted)">Aucun poste dans le rayon.</li>';
}
