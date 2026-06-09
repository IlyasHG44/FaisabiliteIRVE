import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import type { Criterion, Consequence, RiskLevel, Site } from '../types';

const INK = '#13201b';
const ACCENT = '#1f8a4c';
const MUTED = '#6b7269';
const LINE = '#d9d5c6';
const WARN_BG = '#f7eecd';
const WARN = '#9a6b12';

const LEVEL_COLOR: Record<RiskLevel, string> = {
  ok: '#4f9a5e',
  watch: '#d8a93a',
  risk: '#c87a2a',
  blocker: '#b3402a',
};

const CONSEQUENCE_LABEL: Record<Consequence, string> = {
  financial: '€',
  delay: 'délai',
  feasibility: 'faisabilité',
};

// Mêmes regroupements que l'écran
const GROUPS: { title: string; ids: string[] }[] = [
  { title: 'Réseau électrique', ids: ['raccordement', 'reseaux'] },
  { title: 'Risques naturels', ids: ['seisme', 'argiles', 'radon', 'mvt', 'cavites', 'inondation'] },
  { title: 'Risques technologiques', ids: ['pollution', 'icpe'] },
  { title: 'Urbanisme & environnement', ids: ['plu', 'prescriptions', 'monument', 'nature'] },
];

const W = 210;
const H = 297;
const MARGIN = 18;
const CONTENT_W = W - MARGIN * 2;
const BOTTOM = H - 16;

function formatDate(): string {
  return new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export async function exportPdf(site: Site, criteria: Criterion[]): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let y = 0;

  const ensureSpace = (needed: number) => {
    if (y + needed > BOTTOM) { doc.addPage(); y = MARGIN; }
  };

  // ── En-tête ────────────────────────────────────────────────────────────
  doc.setFillColor(INK);
  doc.rect(0, 0, W, 26, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor('#ffffff');
  doc.text('Repère', MARGIN, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor('#b8c4bc');
  doc.text('Pré-diagnostic de faisabilité IRVE', MARGIN, 18);
  doc.text(formatDate(), W - MARGIN, 18, { align: 'right' });
  y = 36;

  // ── Site + synthèse ────────────────────────────────────────────────────
  const coordStr = `${site.lat.toFixed(5)}, ${site.lon.toFixed(5)}`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(INK);
  const titleLines: string[] = doc.splitTextToSize(site.label, CONTENT_W);
  doc.text(titleLines, MARGIN, y);
  y += titleLines.length * 6;
  // Coordonnées en sous-titre seulement si le titre ne les contient pas déjà
  if (!site.label.includes(site.lat.toFixed(5))) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(MUTED);
    doc.text(coordStr, MARGIN, y);
    y += 4;
  }
  y += 5;

  const counts = criteria.reduce<Record<RiskLevel, number>>(
    (a, c) => ({ ...a, [c.level]: a[c.level] + 1 }),
    { ok: 0, watch: 0, risk: 0, blocker: 0 },
  );
  const toAddress = counts.blocker + counts.risk + counts.watch;
  const tone = counts.blocker || counts.risk ? '#7a5a10' : counts.watch ? '#3a6a1e' : '#1c5c2e';
  const toneBg = counts.blocker || counts.risk ? '#fbf2d8' : counts.watch ? '#eef5e6' : '#e6f3e6';

  doc.setFillColor(toneBg);
  doc.roundedRect(MARGIN, y, CONTENT_W, 14, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(tone);
  const headline = toAddress > 0 ? `${toAddress} point(s) à intégrer à l'étude` : 'Aucun point de vigilance détecté';
  doc.text(headline, MARGIN + 5, y + 6.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(
    `${counts.risk} à vérifier · ${counts.watch} à prendre en compte · ${counts.ok} conforme(s)`,
    MARGIN + 5, y + 11,
  );
  y += 20;

  // ── Légende des niveaux ────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  let lx = MARGIN;
  const legend: [string, string][] = [
    [LEVEL_COLOR.ok, 'conforme'],
    [LEVEL_COLOR.watch, 'à prendre en compte'],
    [LEVEL_COLOR.risk, 'à vérifier'],
  ];
  for (const [col, lab] of legend) {
    doc.setFillColor(col);
    doc.circle(lx + 1, y - 1, 1.1, 'F');
    doc.setTextColor(MUTED);
    doc.text(lab, lx + 3.5, y);
    lx += 3.5 + doc.getTextWidth(lab) + 8;
  }
  y += 8;

  // ── Carte ──────────────────────────────────────────────────────────────
  const mapEl = document.getElementById('map');
  if (mapEl) {
    try {
      // Laisse les tuiles satellite finir de charger avant la capture (sinon rendu pâle)
      await new Promise(r => setTimeout(r, 450));
      const canvas = await html2canvas(mapEl, { useCORS: true, scale: 2, logging: false });
      const mapH = 58;
      doc.setDrawColor(LINE);
      doc.setLineWidth(0.3);
      doc.addImage(canvas.toDataURL('image/jpeg', 0.85), 'JPEG', MARGIN, y, CONTENT_W, mapH);
      doc.rect(MARGIN, y, CONTENT_W, mapH);
      y += mapH + 8;
    } catch {
      /* carte indisponible — on continue */
    }
  }

  // ── Critères groupés ───────────────────────────────────────────────────
  const byId = new Map(criteria.map(c => [c.id, c]));
  for (const group of GROUPS) {
    const items = group.ids.map(id => byId.get(id)).filter((c): c is Criterion => !!c);
    if (!items.length) continue;

    ensureSpace(12);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(ACCENT);
    doc.text(group.title.toUpperCase(), MARGIN, y);
    y += 2;
    doc.setDrawColor(LINE);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, y, W - MARGIN, y);
    y += 5;

    for (const c of items) {
      const detailLines: string[] = doc.splitTextToSize(c.detail, CONTENT_W - 8);
      const rowH = 6 + detailLines.length * 4;
      ensureSpace(rowH + 2);

      // pastille de niveau
      doc.setFillColor(LEVEL_COLOR[c.level]);
      doc.circle(MARGIN + 1.5, y - 1.4, 1.3, 'F');

      // libellé + conséquences (collées juste après le libellé)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(INK);
      doc.text(c.label, MARGIN + 6, y);
      if (c.consequences.length) {
        const labelW = doc.getTextWidth(c.label);
        const tag = c.consequences.map(k => CONSEQUENCE_LABEL[k]).join(' · ');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(WARN);
        doc.text(`·  ${tag}`, MARGIN + 6 + labelW + 2, y);
      }
      y += 4.5;

      // détail
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(MUTED);
      doc.text(detailLines, MARGIN + 6, y);
      y += detailLines.length * 4 + 3;
    }
    y += 4;
  }

  // ── Avertissement ──────────────────────────────────────────────────────
  ensureSpace(26);
  doc.setFillColor(WARN_BG);
  doc.roundedRect(MARGIN, y, CONTENT_W, 22, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(WARN);
  doc.text('Avertissement', MARGIN + 4, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(INK);
  const disclaimer = 'Données issues d\'open data publics (Enedis, Géorisques, IGN/GPU, BAN), à titre indicatif sans garantie de fiabilité ni d\'exhaustivité. Ce pré-diagnostic ne remplace pas une étude de faisabilité, une étude de raccordement Enedis ni une visite de site. Il sert à dégrossir et à prioriser, pas à décider.';
  doc.text(doc.splitTextToSize(disclaimer, CONTENT_W - 8), MARGIN + 4, y + 11);

  // ── Pied de page (toutes les pages) ────────────────────────────────────
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(MUTED);
    doc.text('Repère · pré-diagnostic IRVE · sources : Enedis, Géorisques, IGN/GPU, BAN', MARGIN, H - 8);
    doc.text(`${i}/${pages}`, W - MARGIN, H - 8, { align: 'right' });
  }

  const slug = site.label.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase().slice(0, 40);
  doc.save(`prediagnostic_${slug}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
