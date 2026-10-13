// Adds the "most deficient ingredients" ranking to the analytics page.
// Run from the repository root:  node apply-shortage-ranking.mjs
// Safe to re-run: it does nothing if the change is already applied, and it
// writes nothing at all if any anchor is missing or ambiguous.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] ?? process.cwd();
const pagesPath = join(root, 'frontend/src/pages.tsx');
const stylesPath = join(root, 'frontend/src/styles.scss');
let pages = readFileSync(pagesPath, 'utf8');
let styles = readFileSync(stylesPath, 'utf8');

if (pages.includes('topShortages') && styles.includes('.shortage-ranking')) {
  console.log('Already applied, nothing to do.');
  process.exit(0);
}

const fail = (msg) => { console.error('NOT APPLIED: ' + msg); process.exit(1); };
const once = (text, needle, label) => {
  const n = text.split(needle).length - 1;
  if (n !== 1) fail(`${label}: expected exactly 1 match, found ${n}. Your pages.tsx differs from the version this script expects.`);
};

const anchorMax = 'const max=Math.max(1,...analytics.daily.map(d=>d.accepted+d.rejected));';
const anchorSection = '<section className="panel"><PanelTitle title="Расход, потери и дефицит"';
const anchorTable = '<tbody>{analytics.products.map(p=><tr key={p.id}><td><strong>{p.name}</strong></td>';

once(pages, anchorMax, 'const max=...');
once(pages, anchorSection, 'section "Расход, потери и дефицит"');
once(pages, anchorTable, 'analytics table body');

const ranking =
  " /* Ranking by number of shortage events: unit-free, quantities are never summed across g, ml and pcs. */" +
  " const ranked=[...analytics.products].sort((a,b)=>b.shortageCount-a.shortageCount||a.name.localeCompare(b.name,'ru'));" +
  " const topShortages=ranked.filter(p=>p.shortageCount>0).slice(0,5);";

const panel =
  '<section className="panel"><PanelTitle title="Самые дефицитные ингредиенты" subtitle="По числу отказов из-за нехватки за выбранный период"/>' +
  '{topShortages.length===0?<Empty text="За выбранный период дефицита не было"/>:' +
  '<ol className="shortage-ranking">{topShortages.map((p,i)=><li key={p.id}><strong>{i+1}. {p.name}</strong> · отказов: {p.shortageCount} · не хватало {qty(p.shortageQuantity,p.unit)}' +
  "{p.affectedDishes.length>0&&<small> · блюда: {p.affectedDishes.map(dishName).join(', ')}</small>}</li>)}</ol>}</section>";

pages = pages.replace(anchorMax, () => anchorMax + ranking);
pages = pages.replace(anchorSection, () => panel + anchorSection);
pages = pages.replace(anchorTable, () => anchorTable.replace('analytics.products.map', 'ranked.map'));

if (!styles.includes('.shortage-ranking')) {
  const eol = styles.includes('\r\n') ? '\r\n' : '\n';
  if (!styles.endsWith('\n')) styles += eol;
  styles += eol + '.shortage-ranking{margin:0;padding-left:1.25rem;display:grid;gap:.5rem}' + eol +
    '.shortage-ranking small{color:inherit;opacity:.75}' + eol;
}

writeFileSync(pagesPath, pages, 'utf8');
writeFileSync(stylesPath, styles, 'utf8');
console.log('Applied: frontend/src/pages.tsx and frontend/src/styles.scss updated.');
