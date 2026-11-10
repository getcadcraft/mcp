/* SPDX-License-Identifier: Apache-2.0 */
// Part of test.mjs: AP.8 printing patterns — full size (a page per size, as big as the pieces) and tiled for home printers
// (A4 / Letter, overlap, match marks, the page grid, a cover page with the 10 cm / 4 in test square and the tile map), all
// through CadCraft's plot pipeline; the PDFs read back with poppler (pdfinfo, pdftotext) when installed.
const { ok, section, near, mine, ROOT, KEEP } = globalThis.__apTest;
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const PR = await mine('lib/print.js');
const PC = await mine('lib/piece.js');
const GR = await mine('lib/grade.js');
const { t } = await mine('lib/text.js');
const { graphics } = await mine('main.js');
const { toPdfPages } = await import(path.join(ROOT, 'public_html/assets/apps/cadcraft/dev/plot.js'));
const { Doc } = await import(path.join(ROOT, 'public_html/assets/apps/cadcraft/dev/doc.js'));

const have = (cmd) => { try { execFileSync('which', [cmd], { stdio: 'ignore' }); return true; } catch { return false; } };
const POPPLER = have('pdfinfo') && have('pdftotext');
const OUT = path.join(ROOT, 'tmp/apparel-test');
fs.mkdirSync(OUT, { recursive: true });
const draw = (d) => graphics(d, t);

section('AP.8 printing patterns (print.js), worked out by hand');
// a 500 × 700 mm piece with 10 mm allowance (cut line 520 × 720), three sizes, placed at (1000, 2000)
let data = { ...PC.emptyPiece('mm'), name: 'Coat front', pts: [[0, 0, 0], [500, 0, 0], [500, 700, 0], [0, 700, 0]], sa: { w: 10, e: {}, k: {} }, grain: { a: [250, 100], b: [250, 600], s: 'both' }, sizes: { list: ['S', 'M', 'L'], base: 'M' } };
data = GR.setRule(data, 'p1', GR.uniform(data.sizes, [20, 0]));
data = GR.setRule(data, 'p2', GR.uniform(data.sizes, [20, 30]));
data = GR.setRule(data, 'p3', GR.uniform(data.sizes, [0, 30]));
const doc = new Doc();
const e = { type: 'insert', x: 1000, y: 2000, rot: 0, sx: 1, sy: 1, layer: '0' };
const pieces = [{ e, data }];

// tiled on A4: printable 190 × 269 (10 mm margins, 8 mm name line), step 180 × 259 with 10 mm overlap
//   M: 520 × 720 → columns ⌈(520 − 10) / 180⌉ = 3, rows ⌈(720 − 10) / 259⌉ = 3 → 9 tiles + a cover
//   L: 540 × 750 → 3 columns (⌈530/180⌉ = 3), 3 rows (⌈740/259⌉ = 3)
const pages = PR.tiled(doc, pieces, ['M', 'L'], { draw, t, paper: 'a4', overlap: 10 });
const M = pages.filter((p) => p.size === 'M');
ok(M.length === 10 && M[0].cover && M[0].rows === 3 && M[0].cols === 3, 'size M on A4: a cover and 3 × 3 tiles', JSON.stringify(M.map((p) => p.name)));
ok(M.slice(1).map((p) => p.tile).join() === 'A1,A2,A3,B1,B2,B3,C1,C2,C3', 'tiles named by row letter (from the top) and column number');
ok(pages.filter((p) => p.size === 'L').length === 10, 'size L too (one PDF, every size)');
ok(M.every((p) => near(p.list.w, 210) && near(p.list.h, 297)), 'every page is A4 (210 × 297 mm)');
// the cut line's bottom-left corner: drawing (990, 1990) → content (0, −720) → tile C1 (top at −518): page (10, 279 − 202) = (10, 77)
const C1 = M.find((p) => p.tile === 'C1');
const prims = C1.list.views[0].strokes.flatMap((s) => s.prims).filter((q) => q.k === 'L');
ok(prims.some((q) => (near(q.x1, 10, 1e-6) && near(q.y1, 77, 1e-6)) || (near(q.x2, 10, 1e-6) && near(q.y2, 77, 1e-6))), 'the cut line\'s corner lands where worked out on C1: (10, 77) mm', JSON.stringify(prims.slice(0, 3)));
ok(C1.list.views[0].clip && near(C1.list.views[0].clip[2].x, 200) && near(C1.list.views[0].clip[2].y, 279), 'each tile is clipped to its printable area');
const texts = (p) => p.list.views.flatMap((v) => v.texts.map((x) => x.e.s));
ok(texts(M.find((p) => p.tile === 'A1')).some((s) => s === 'A1|A2') && texts(M.find((p) => p.tile === 'A2')).some((s) => s === 'A1|A2'), 'match marks: A1 and A2 both carry the A1|A2 diamonds');
ok(texts(M.find((p) => p.tile === 'B2')).some((s) => /^Page B2, size M/.test(s) && /above A2/.test(s) && /left B1/.test(s) && /right B3/.test(s) && /below C2/.test(s)), 'each tile names itself and its neighbours', texts(M.find((p) => p.tile === 'B2')).find((s) => /^Page/.test(s)));
// the cover: a 100 mm square
const cv = M[0].list.views.at(-1);
const sq = cv.strokes.flatMap((s) => s.prims).filter((q) => q.k === 'L' && near(Math.hypot(q.x2 - q.x1, q.y2 - q.y1), 100, 1e-9));
ok(sq.length === 4 && texts(M[0]).includes('10 cm') && texts(M[0]).some((s) => /must measure 10 cm/.test(s)), 'the cover has the 10 cm test square, said in words', String(sq.length));
ok(['A1', 'B2', 'C3'].every((n) => texts(M[0]).includes(n)), 'and the tile map with every tile\'s name');
// a small piece: one tile; a tile with nothing on it is left out
const small = PR.tiled(doc, [{ e, data: { ...data, pts: [[0, 0, 0], [100, 0, 0], [100, 100, 0], [0, 100, 0]], sizes: undefined, grades: undefined, grain: null } }], [], { draw, t });
ok(small.length === 2 && small[1].tile === 'A1', 'a piece that fits on a page: the cover and one page');
const L = PR.tiled(doc, [{ e, data: { ...data, pts: [[0, 0, 0], [800, 0, 0], [800, 50, 0], [50, 50, 0], [50, 800, 0], [0, 800, 0]], sizes: undefined, grades: undefined, grain: null, sa: null } }], [], { draw, t });
const lTiles = L.filter((p) => p.tile).map((p) => p.tile);
ok(L[0].rows === 4 && L[0].cols === 5 && !lTiles.includes('B3') && lTiles.includes('A1') && lTiles.includes('D5'), 'an L-shaped piece: tiles with nothing on them are left out', lTiles.join());
// inches: Letter
const inch = PR.tiled(doc, [{ e, data: { ...PC.emptyPiece('in'), name: 'Yoke', pts: [[0, 0, 0], [10, 0, 0], [10, 6, 0], [0, 6, 0]], sa: { w: 0.5, e: {}, k: {} } } }], [], { draw, t, paper: 'letter' });
ok(near(inch[0].list.w, 215.9) && texts(inch[0]).includes('4 in') && inch.length === 3, 'a piece in inches on Letter: 4 in test square; 11 × 7 in → 2 pages', JSON.stringify(inch.map((p) => p.name)));

// full size: one page per size, the pieces at 1:1 with 10 mm margins (and 8 mm for the size line)
const full = PR.fullSize(doc, pieces, ['S', 'M', 'L'], { draw, t });
ok(full.length === 3 && near(full[1].w, 540) && near(full[1].h, 748) && near(full[2].w, 560) && near(full[0].w, 520), 'full size: S 520, M 540, L 560 mm wide (cut lines 500 / 520 / 540 + margins)', JSON.stringify(full.map((p) => [p.w, p.h])));
ok(full.every((p) => !p.tooBig), 'all within the 5.08 m a PDF page can be');

// the PDFs, read back by poppler
const pdfA4 = await toPdfPages(pages.map((p) => p.list), { names: pages.map((p) => p.name), title: 'Coat pattern' });
const pdfFull = await toPdfPages(full.map((p) => p.list), { names: full.map((p) => p.name), title: 'Coat pattern' });
const fa = path.join(OUT, 'tiled-a4.pdf'), ff = path.join(OUT, 'full.pdf');
fs.writeFileSync(fa, pdfA4.bytes); fs.writeFileSync(ff, pdfFull.bytes);
if (!POPPLER) console.log('  (no poppler: pdfinfo / pdftotext checks skipped)');
else {
  const info = execFileSync('pdfinfo', [fa], { encoding: 'utf8' });
  ok(/Pages:\s+20/.test(info) && /Page size:\s+595\.2\d* x 841\.8\d* pts/.test(info), 'the tiled PDF: 20 A4 pages (two sizes × 10)', (info.match(/Pages:.*|Page size:.*/g) || []).join(' | '));
  const txt = execFileSync('pdftotext', ['-f', '1', '-l', '2', fa, '-'], { encoding: 'utf8' });
  ok(/must measure 10 cm/.test(txt) && /Page A1, size M/.test(txt), 'its text reads back: the test square note, the tile names');
  const fi = execFileSync('pdfinfo', ['-f', '1', '-l', '3', ff], { encoding: 'utf8' });
  const sizes = [...fi.matchAll(/Page\s+\d+ size:\s+([\d.]+) x ([\d.]+) pts/g)].map((m) => [+m[1], +m[2]]);
  ok(sizes.length === 3 && near(sizes[1][0], 540 / 25.4 * 72, 0.5) && near(sizes[2][0], 560 / 25.4 * 72, 0.5), 'the full-size PDF: one page per size, 540 and 560 mm wide (1:1)', JSON.stringify(sizes));
}
if (!KEEP) { fs.rmSync(fa, { force: true }); fs.rmSync(ff, { force: true }); }

section('PATTERNPRINT and the PDF exporters at the command line');
{
  const { harness, startWith, memStorage } = await import('./t-addon.mjs');
  const h = harness();
  const st = await startWith(h, memStorage());
  await st.loader.setEnabled('apparel', true);
  const { doc: d2, host, type, log } = h;
  await type('RECTANG', '0,0', '500,700');
  host.setSelection(new Set([d2.all().find((x) => x.type === 'poly').id]));
  await type('PIECE', '10', 'Coat front');
  const idle = async () => { for (let i = 0; i < 400 && h.eng.busy; i++) await new Promise((r) => setTimeout(r, 10)); };
  await type('PATTERNPRINT', 'T', 'A', '10'); await idle();
  ok(log.some((l) => /pattern A4\.pdf: 10 pages \(9 tiles and a cover page per size\)/.test(l)), 'PATTERNPRINT tiled on A4: 10 pages', log.slice(-2).join(' | '));
  await type('PATTERNPRINT', 'F'); await idle();
  ok(log.some((l) => /pattern full size\.pdf: 1 page at full size/.test(l)), 'PATTERNPRINT full size: one page', log.slice(-2).join(' | '));
  const ex = st.exporters().filter((x) => /^Apparel pattern/.test(x.label));
  const bytes = ex.length === 2 ? await ex[0].write(d2) : null;
  ok(ex.length === 2 && bytes && bytes.length > 1000 && String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-', 'EXPORT has the tiled and full-size PDFs', ex.map((x) => x.label).join(' | '));
}
