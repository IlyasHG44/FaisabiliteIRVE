// Smoke-test : rejoue le diagnostic complet sur un lieu public neutre et imprime
// les critères. Sert à vérifier que les connecteurs + le moteur de règles tournent.
// Lancer : npx tsx scripts/verify-diagnostic.ts
import { fetchPostes, isEnedisServed } from '../src/api/enedis';
import { fetchRisks } from '../src/api/georisques';
import { fetchUrbanisme, fetchNature, fetchPrescriptions } from '../src/api/apicarto';
import {
  raccordementCriterion,
  reseauxCriterion,
  riskCriteria,
  urbanismeCriteria,
  natureCriterion,
  prescriptionCriterion,
} from '../src/diagnostic/rules';

// Lieu public neutre (Place du Capitole, Toulouse)
const LAT = 43.604462;
const LON = 1.444247;
const INSEE = '31555';

const ICON: Record<string, string> = { ok: '🟢', watch: '🟡', risk: '🟠', blocker: '🔴' };

async function main() {
  console.log('Smoke-test diagnostic — lieu public neutre\n');

  const [postes, enedis, risks, urb, nature, prescriptions] = await Promise.all([
    fetchPostes(LAT, LON, 2000),
    isEnedisServed(LAT, LON, INSEE),
    fetchRisks(LAT, LON, INSEE),
    fetchUrbanisme(LAT, LON),
    fetchNature(LAT, LON),
    fetchPrescriptions(LAT, LON),
  ]);

  const criteria = [
    raccordementCriterion(postes, true, enedis),
    reseauxCriterion(),
    ...riskCriteria(risks),
    ...urbanismeCriteria(urb, risks),
    natureCriterion(nature),
    prescriptionCriterion(prescriptions),
  ];

  for (const c of criteria) {
    const tags = c.consequences.length ? `  [${c.consequences.join(', ')}]` : '';
    console.log(`${ICON[c.level]} ${c.label.padEnd(30)} ${c.detail}${tags}`);
  }
  const toAddress = criteria.filter(c => c.level !== 'ok').length;
  console.log(`\n  ${toAddress} point(s) à intégrer à l'étude`);
}

main().catch(e => {
  console.error('Échec :', e instanceof Error ? e.message : e);
  process.exit(1);
});
