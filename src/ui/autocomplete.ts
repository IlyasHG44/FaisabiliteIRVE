import { autocomplete, type BanFeature } from '../api/ban';
import type { Site } from '../types';

export function initAutocomplete(
  input: HTMLInputElement,
  dropdown: HTMLElement,
  onPick: (site: Site) => void,
): void {
  let items: BanFeature[] = [];
  let idx = -1;
  let timer: ReturnType<typeof setTimeout>;

  function hide() {
    dropdown.classList.add('hidden');
    items = [];
    idx = -1;
  }

  function draw() {
    if (!items.length) { hide(); return; }
    dropdown.innerHTML = items
      .map((it, i) => `<div data-i="${i}" class="${i === idx ? 'sel' : ''}">${it.label}<span class="ctx">${it.ctx}</span></div>`)
      .join('');
    dropdown.classList.remove('hidden');
    dropdown.querySelectorAll<HTMLElement>('div').forEach(el => {
      el.addEventListener('mousedown', e => {
        e.preventDefault();
        pick(parseInt(el.dataset['i']!, 10));
      });
    });
  }

  function pick(i: number) {
    const it = items[i];
    if (!it) return;
    input.value = it.label;
    onPick({ lat: it.lat, lon: it.lon, label: it.label, citycode: it.citycode });
    hide();
  }

  input.addEventListener('input', () => {
    onPick({ lat: 0, lon: 0, label: '' }); // reset picked
    const q = input.value.trim();
    clearTimeout(timer);
    if (q.length < 3) { hide(); return; }
    timer = setTimeout(async () => {
      items = await autocomplete(q);
      idx = -1;
      draw();
    }, 220);
  });

  input.addEventListener('keydown', e => {
    if (dropdown.classList.contains('hidden') || !items.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(idx + 1, items.length - 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(idx - 1, 0); draw(); }
    else if (e.key === 'Enter' && idx >= 0) { e.preventDefault(); pick(idx); }
  });

  document.addEventListener('click', e => {
    if (!(e.target as Element).closest('.field')) hide();
  });
}
