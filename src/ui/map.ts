import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Poste, Site } from '../types';

let map: L.Map | null = null;
let markerLayer: L.LayerGroup | null = null;
let overlayLayer: L.LayerGroup | null = null;
let legend: L.Control | null = null;

const ORTHO_URL =
  'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
  '&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM' +
  '&FORMAT=image/jpeg&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';

function initMap(): L.Map {
  const m = L.map('map', { scrollWheelZoom: false });

  const plan = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap', crossOrigin: true,
  });
  const satellite = L.tileLayer(ORTHO_URL, {
    maxZoom: 19, attribution: '© IGN / Géoplateforme', crossOrigin: true,
  });

  satellite.addTo(m); // satellite par défaut (effet "vue du ciel")
  L.control.layers({ 'Satellite (IGN)': satellite, 'Plan': plan }, undefined, { collapsed: true }).addTo(m);
  return m;
}

export function renderMap(site: Site, postes: Poste[]): void {
  if (!map) map = initMap();
  if (markerLayer) map.removeLayer(markerLayer);
  if (overlayLayer) { map.removeLayer(overlayLayer); overlayLayer = null; }
  map.setView([site.lat, site.lon], 18); // rapproché : vue sur le magasin/parcelle
  markerLayer = L.layerGroup().addTo(map);

  L.circleMarker([site.lat, site.lon], {
    radius: 9, color: '#ffffff', fillColor: '#1f8a4c', fillOpacity: 1, weight: 3,
  }).bindPopup(`<b>Site candidat</b><br>${site.label}`).addTo(markerLayer);

  postes.slice(0, 12).forEach(p => {
    L.circleMarker([p.lat, p.lon], {
      radius: 6, color: '#ffffff', fillColor: '#e7b53c', fillOpacity: 0.95, weight: 2,
    }).bindPopup(`Poste HTA/BT<br>${Math.round(p.dist)} m`).addTo(markerLayer!);
  });

  setTimeout(() => map!.invalidateSize(), 120);
}

export interface MapOverlays {
  er: GeoJSON.Feature[]; // emplacements réservés
  zone: GeoJSON.Feature | null; // zone PLU
  ppr: GeoJSON.Feature[]; // PPR (PM1)
}

function addGeo(features: GeoJSON.Feature[], style: L.PathOptions, popup: string): void {
  if (!features.length || !overlayLayer) return;
  L.geoJSON({ type: 'FeatureCollection', features } as GeoJSON.FeatureCollection, {
    style: () => style,
    onEachFeature: (_f, lyr) => lyr.bindPopup(popup),
  }).addTo(overlayLayer);
}

// Contraintes superposées sur la carte (par-dessus le satellite).
export function renderOverlays(o: MapOverlays): void {
  if (!map) return;
  if (overlayLayer) map.removeLayer(overlayLayer);
  overlayLayer = L.layerGroup().addTo(map);

  if (o.zone) {
    addGeo([o.zone], { color: '#1f8a4c', weight: 2, fillColor: '#1f8a4c', fillOpacity: 0.06 }, 'Zone PLU');
  }
  addGeo(o.ppr, { color: '#2f6fb0', weight: 2, fillColor: '#2f6fb0', fillOpacity: 0.18, dashArray: '4,3' }, 'PPR — plan de prévention des risques');
  addGeo(o.er, { color: '#b3402a', weight: 2, fillColor: '#b3402a', fillOpacity: 0.28, dashArray: '5,4' }, 'Emplacement réservé — ne pas y implanter d\'ouvrage pérenne');

  renderLegend(o);
  // On NE recadre PAS sur les contraintes (la zone PLU peut être immense) :
  // la vue reste centrée sur le site, au zoom rapproché défini par renderMap.
}

function renderLegend(o: MapOverlays): void {
  if (!map) return;
  if (legend) map.removeControl(legend);
  const rows: string[] = ['<span><i style="background:#1f8a4c"></i>Site</span>'];
  if (o.zone) rows.push('<span><i style="border:2px solid #1f8a4c;background:transparent"></i>Zone PLU</span>');
  if (o.ppr.length) rows.push('<span><i style="background:#2f6fb0"></i>PPR inondation</span>');
  if (o.er.length) rows.push('<span><i style="background:#b3402a"></i>Emplacement réservé</span>');

  legend = new L.Control({ position: 'bottomright' });
  legend.onAdd = () => {
    const div = L.DomUtil.create('div', 'map-legend');
    div.innerHTML = rows.join('');
    return div;
  };
  legend.addTo(map);
}
