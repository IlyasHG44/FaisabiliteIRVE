import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Poste, Site } from '../types';

let map: L.Map | null = null;
let layer: L.LayerGroup | null = null;
let reservedLayer: L.GeoJSON | null = null;

export function renderMap(site: Site, postes: Poste[]): void {
  if (!map) {
    map = L.map('map', { scrollWheelZoom: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
      crossOrigin: true, // permet la capture html2canvas (PDF) sans canvas "tainted"
    }).addTo(map);
  }
  if (layer) map.removeLayer(layer);
  if (reservedLayer) { map.removeLayer(reservedLayer); reservedLayer = null; }
  map.setView([site.lat, site.lon], 16);
  layer = L.layerGroup().addTo(map);

  L.circleMarker([site.lat, site.lon], {
    radius: 9, color: '#13201b', fillColor: '#1f8a4c', fillOpacity: 1, weight: 2,
  }).bindPopup(`<b>Site candidat</b><br>${site.label}`).addTo(layer);

  postes.slice(0, 12).forEach(p => {
    L.circleMarker([p.lat, p.lon], {
      radius: 6, color: '#9a6b12', fillColor: '#e7b53c', fillOpacity: 0.9, weight: 1.5,
    }).bindPopup(`Poste HTA/BT<br>${Math.round(p.dist)} m`).addTo(layer!);
  });

  setTimeout(() => map!.invalidateSize(), 120);
}

// Overlay des emplacements réservés (foncier réservé à la collectivité) : zone à éviter
// pour une implantation pérenne — sinon risque de retrait imposé lors des travaux.
export function renderReservedAreas(site: Site, features: GeoJSON.Feature[]): void {
  if (!map) return;
  if (reservedLayer) { map.removeLayer(reservedLayer); reservedLayer = null; }
  if (!features.length) return;

  reservedLayer = L.geoJSON(
    { type: 'FeatureCollection', features } as GeoJSON.FeatureCollection,
    {
      style: { color: '#b3402a', weight: 2, fillColor: '#b3402a', fillOpacity: 0.28, dashArray: '5,4' },
      onEachFeature: (f, lyr) => {
        const label = (f.properties?.['label'] as string) ?? 'Emplacement réservé';
        lyr.bindPopup(`<b>${label}</b><br>Foncier réservé — ne pas y implanter d'ouvrage pérenne.`);
      },
    },
  ).addTo(map);

  try {
    const b = reservedLayer.getBounds().extend([site.lat, site.lon]);
    map.fitBounds(b, { padding: [30, 30], maxZoom: 17 });
  } catch {
    /* bounds indisponibles — on garde la vue courante */
  }
}
