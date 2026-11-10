/* SPDX-License-Identifier: Apache-2.0 */
// Part of test.mjs: AP.7 DXF-AAMA / ASTM D6673 — our pieces out and back in (exactly, through our xdata; and from the drawn
// lines alone, as another program would read them), the RUL file, nested grading, ezdxf as a second reader, and the nine
// makers' sample files in the corpus (outside git) read in.
const { ok, section, near, mine, ROOT, KEEP, CORPUS } = globalThis.__apTest;
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const AA = await mine('lib/aama.js');
const PC = await mine('lib/piece.js');
const GR = await mine('lib/grade.js');
const C = await mine('lib/curve.js');
const OUT = path.join(ROOT, 'tmp/apparel-test');
fs.mkdirSync(OUT, { recursive: true });
const PY = path.join(ROOT, 'tools/cadcraft-test/venv/bin/python');
const CHECK = path.join(ROOT, 'tools/apparel-test/aama_check.py');
const ezdxf = (file) => (fs.existsSync(PY) ? JSON.parse(execFileSync(PY, [CHECK, file], { encoding: 'utf8' })) : null);

section('AP.7 DXF-AAMA / ASTM: our pieces out and back in');
// a front bodice, graded in five sizes, with every kind of mark; a sleeve placed rotated; a facing mirrored
const S = { list: ['XS', 'S', 'M', 'L', 'XL'], base: 'M' };
let front = { ...PC.emptyPiece('mm'), name: 'Front', style: 'B1', qty: 2, fabric: 'Linen', cat: 'Body', note: 'Front panel',
  pts: [[0, 0, 0], [100, 0, 1], [250, 0, 0], [250, 200, 0], [200, 260, 1], [180, 380, 0], [80, 400, 0], [40, 370, 1], [0, 330, 0]],
  sa: { w: 10, e: { 0: 40 }, k: { 2: 'square' } }, sizes: S, size: 'M',
  notches: [{ i: 2, d: 100, k: 'slit' }, { i: 3, d: 30, k: 't' }, { i: 0, d: 50, k: 'v' }], grain: { a: [125, 100], b: [125, 300], s: 'both' }, fold: { a: [0, 0], b: [0, 330] },
  drills: [[60, 250]], buttons: [[30, 200, 12]], holes: [[30, 150, 16, 0]], lines: [{ p: [[150, 0, 0], [160, 120, 0], [170, 0, 0]] }] };
for (const [k, st] of [['p2', [10, 0]], ['p3', [10, 5]], ['p5', [6, 8]], ['p6', [3, 8]], ['p8', [0, 6]], ['gb', [5, 4]], ['d0', [2, 3]]]) front = GR.setRule(front, k, GR.uniform(S, st));
const sleeve = { ...PC.emptyPiece('mm'), name: 'Sleeve', style: 'B1', pts: [[0, 0, 0], [300, 0, 0], [280, 200, 1], [150, 260, 1], [20, 200, 1]], sa: { w: 12, e: {}, k: {} }, sizes: S, size: 'M', grades: {}, notches: [{ i: 1, d: 150, k: 'slit' }] };
const facing = { ...PC.emptyPiece('mm'), name: 'Facing', style: 'B1', pts: [[0, 0, 0], [60, 0, 0], [60, 330, 0], [0, 330, 0]], sa: null, pair: true };
const pieces = [{ data: front, place: { x: 0, y: 0, rot: 0, sx: 1, sy: 1 } }, { data: sleeve, place: { x: 600, y: 100, rot: Math.PI / 2, sx: 1, sy: 1 } }, { data: facing, place: { x: 1000, y: 0, rot: 0, sx: -1, sy: 1 } }];

for (const standard of ['aama', 'astm']) {
  const w = AA.writeAama(pieces, { standard, grading: 'rul', date: new Date(2026, 9, 14, 9, 30) });
  const file = path.join(OUT, 'bodice-' + standard + '.dxf');
  fs.writeFileSync(file, w.dxf); fs.writeFileSync(file.replace(/\.dxf$/, '.rul'), w.rul);
  ok(w.rul && /SIZE LIST: XS S M L XL/.test(w.rul) && /SAMPLE SIZE: M/.test(w.rul) && w.rules > 5, standard + ': a DXF and a RUL file (' + w.rules + ' rules)');
  const back = AA.readAama(w.dxf, w.rul);
  ok(back.pieces.length === 3 && back.pieces.every((p, i) => JSON.stringify(p.data) === JSON.stringify(PC.cleanPiece(pieces[i].data))), standard + ': read back, every piece is exactly as it was (our data rides along)', back.pieces.map((p) => p.data.name).join());
  ok(back.pieces.every((p, i) => Object.keys(pieces[i].place).every((k) => near(p.place[k], pieces[i].place[k]))), standard + ': and where it was (placement, rotation, mirror)');
  const ez = ezdxf(file);
  if (!ez) { console.log('  (no tools/cadcraft-test/venv: ezdxf checks skipped)'); continue; }
  const fb = ez.blocks.Front;
  ok(ez.version === 'AC1009' && ez.audit_errors === 0 && ez.appids.includes('CC_APPAREL'), standard + ' (ezdxf): R12, audits clean, CC_APPAREL registered', JSON.stringify([ez.version, ez.audit_errors]));
  ok(ez.inserts.join() === 'Front,Sleeve,Facing' && ez.header.includes('Units: METRIC') && ez.header.includes('Sample Size: M') && ez.header.some((h) => (standard === 'astm' ? /D 6673/ : /AAMA/).test(h)), standard + ' (ezdxf): one block per piece; the style header', JSON.stringify(ez.header));
  ok(fb && fb.closed_cut && fb.xdata && fb.layers['POLYLINE:14'] === 1 && fb.layers['POINT:2'] > 4 && fb.layers['LINE:7'] === 1 && fb.layers['LINE:6'] === 1 && fb.layers['POINT:13'] === 1 && fb.layers['POINT:80'] === 1 && fb.layers['POINT:82'] === 1 && fb.layers['POINT:4'] === 1 && (standard === 'aama' || (fb.layers['POLYLINE:84'] === 1 && fb.layers['POLYLINE:87'] === 1)), standard + ' (ezdxf): cut line (1' + (standard === 'astm' ? ', 84' : '') + '), sew line (14' + (standard === 'astm' ? ', 87' : '') + '), points, grain, fold, drill hole, slit / T / V notches', JSON.stringify(fb && fb.layers));
  ok(fb.notch_angles.length === 3 && fb.notch_angles.includes(180) && fb.rules.length > 10 && fb.texts.includes('Piece Name: Front') && fb.texts.includes('Quantity: 2') && fb.texts.includes('Material: Linen'), standard + ' (ezdxf): notch angles into the piece (the right side\'s: 180°), rule numbers, piece texts', JSON.stringify([fb.notch_angles, fb.texts]));
  if (!KEEP) { fs.rmSync(file, { force: true }); fs.rmSync(file.replace(/\.dxf$/, '.rul'), { force: true }); }
}

// as another program reads it: our xdata taken out, only the drawn lines, points, texts and the RUL
{
  const w = AA.writeAama(pieces, { standard: 'aama', grading: 'rul' });
  const plain = w.dxf.replace(/\r\n1001\r\nCC_APPAREL(\r\n10[0-9]{2}\r\n[^\r\n]*)+/g, '');
  ok(!/CC_APPAREL\r\n1000/.test(plain), 'the xdata is gone from the copy');
  const r = AA.readAama(plain, w.rul);
  const f = r.pieces.find((p) => p.data.name === 'Front');
  ok(r.pieces.length === 3 && f && f.data.style === 'B1' && f.data.qty === 2 && f.data.fabric === 'Linen' && f.data.cat === 'Body' && f.data.note === 'Front panel', 'from the lines alone: three pieces with their names, style, quantity, fabric, category, annotation');
  // the sew line comes back as the sampled outline: the base corners are among its points
  const has = (pts, x, y) => pts.some((q) => near(q[0], x, 1e-3) && near(q[1], y, 1e-3));
  ok([[0, 0], [250, 0], [250, 200], [180, 380], [80, 400], [0, 330]].every(([x, y]) => has(f.data.pts, x, y)), 'its sew line runs through every base corner');
  ok(near(f.data.sa.w, 10, 0.05) && Object.values(f.data.sa.e).some((v) => near(v, 40, 0.05)), 'the seam allowance read from the distance between cut and sew line: 10, the hem 40', JSON.stringify(f.data.sa));
  ok(f.data.notches.length === 3 && f.data.notches.map((n) => n.k).sort().join() === 'slit,t,v' && f.data.drills.length === 1 && f.data.grain && f.data.fold && f.data.lines.length >= 1, 'notches (slit, T, V), drill hole, grain, fold and internal line come back');
  ok(f.data.sizes && f.data.sizes.list.join(' ') === 'XS S M L XL' && f.data.sizes.base === 'M', 'the RUL gives the size range and base');
  // graded: each sew point's rule moves it exactly as our grading did — the XL corners where worked out by hand (t-grade.mjs)
  const xl = GR.gradedPts(f.data, 'XL');
  ok([[270, 0], [270, 210], [192, 396], [86, 416], [0, 342]].every(([x, y]) => has(xl, x, y)), 'graded from the RUL: the XL corners are where they should be', JSON.stringify(xl.filter((q) => q[2] === 0).slice(0, 8)));
  const ms = C.sampled(C.ptsOf(GR.gradedPts(front, 'XS')), true).path.slice(0, -1);
  const xs = GR.gradedPts(f.data, 'XS');
  ok(xs.length === ms.length && xs.every((q, i) => near(q[0], ms[i].x, 0.011) && near(q[1], ms[i].y, 0.011)), 'every sampled point of the XS sew line matches ours (to the RUL\'s 0.01)', xs.length + ' / ' + ms.length);
  const fx = r.pieces.find((p) => p.data.name === 'Facing');
  ok(fx && fx.data.pair === true && fx.data.sa === null && C.area(C.sampled(C.ptsOf(fx.data.pts)).path) > 0, 'the mirrored facing: a net piece, counter-clockwise again, cut as a pair');
}

// nested: every size drawn as its own block
{
  const w = AA.writeAama(pieces, { standard: 'aama', grading: 'nested' });
  ok(!w.rul && /\r\nFront_XS\r\n/.test(w.dxf) && /\r\nFront_XL\r\n/.test(w.dxf) && /\r\nSleeve_L\r\n/.test(w.dxf) && /\r\nFacing\r\n/.test(w.dxf), 'nested: a block per piece per size, no RUL');
  const r = AA.readAama(w.dxf);
  ok(r.pieces.length === 3 && JSON.stringify(r.pieces[0].data) === JSON.stringify(PC.cleanPiece(front)), 'nested, ours: back exactly (the base size carries our data)');
  const plain = w.dxf.replace(/\r\n1001\r\nCC_APPAREL(\r\n10[0-9]{2}\r\n[^\r\n]*)+/g, '');
  const r2 = AA.readAama(plain);
  const f2 = r2.pieces.find((p) => p.data.name === 'Front');
  ok(f2 && f2.data.sizes?.list.join(' ') === 'XS S M L XL' && f2.data.sizes.base === 'M' && [[270, 0], [270, 210]].every(([x, y]) => GR.gradedPts(f2.data, 'XL').some((q) => near(q[0], x, 1e-3) && near(q[1], y, 1e-3))), 'nested, from the lines alone: the sizes and the grading come back (XL corners)', JSON.stringify(f2?.data.sizes));
}

// the RUL reader on both separators and orders
{
  const r = AA.parseRul('ASTM/D13 Proposal 1 Version: D 6673-04\nUNITS: ENGLISH\nNUMBER OF SIZES: 3\nSIZE LIST: S M L\nSAMPLE SIZE: M\nRULE: DELTA 1\n  -0.25,  0.00   0.00,  0.00   0.25,  0.50\nRULE: DELTA 7\n  1 2 3 4\n  5 6\nEND\n');
  ok(r.units === 'ENGLISH' && r.sizes.join() === 'S,M,L' && r.sample === 'M' && JSON.stringify(r.rules.get(1)) === '[[-0.25,0],[0,0],[0.25,0.5]]' && r.rules.get(7).length === 3, 'parseRul: comma or space pairs, rules over several lines');
  ok(AA.parseRul('junk') === null && AA.parseRul('') === null, 'parseRul: not a RUL → null');
}

section('AP.7: the nine makers\' sample files (corpus, outside git)');
if (!fs.existsSync(CORPUS)) console.log('  (no ' + CORPUS + ': skipped)');
else {
  const read = (f, r) => AA.readAama(fs.readFileSync(path.join(CORPUS, f), 'latin1'), r ? fs.readFileSync(path.join(CORPUS, r), 'latin1') : null);
  const clo = read('tfm/W SS Graded.dxf', 'tfm/W SS Graded.rul');
  ok(clo.pieces.length >= 3 && clo.pieces.every((p) => p.data.sizes?.list.join(' ') === 'XS S M L XL 2XL' && p.data.sizes.base === 'XS'), 'CLO, base + RUL: pieces in six sizes, base XS', JSON.stringify(clo.pieces.map((p) => [p.data.name, p.data.pts.length])));
  ok(clo.pieces.some((p) => Object.keys(p.data.grades || {}).length > 3), 'CLO: points carry grade rules');
  // rule 8 is on the first point of the first block; in 2XL it moves (50, −41.11) from XS (the RUL above)
  const rp = AA.parseRul(fs.readFileSync(path.join(CORPUS, 'tfm/W SS Graded.rul'), 'latin1'));
  const p0 = clo.pieces[0].data;
  const ruled = Object.values(p0.grades || {}).find((r) => near(r[10], rp.rules.get(8)[5][0], 1e-6) && near(r[11], rp.rules.get(8)[5][1], 1e-6));
  ok(!!ruled, 'CLO: a point with "# 8" moves by rule 8 in 2XL (' + rp.rules.get(8)[5].join(', ') + ')');
  const rich = read('tfm/S350.dxf', 'tfm/S350.rul');
  ok(rich.units === 'in' && rich.pieces.length === 4 && rich.pieces[0].data.u === 'in' && rich.pieces[0].data.sizes?.list.length === 9 && rich.pieces[0].data.sizes.base === 'L', 'Richpeace, inches + RUL: four pieces, nine sizes, base L', JSON.stringify(rich.pieces.map((p) => p.data.name)));
  ok(rich.pieces.reduce((s, p) => s + p.data.notches.filter((n) => n.k === 't').length, 0) > 0, 'Richpeace: its T-notches (layer 80) read as T');
  const ger = read('tfm/Relaxed Chino.dxf');
  const gg = ger.pieces.filter((p) => p.data.sizes?.list.length === 28 && p.data.sizes.base === '32');
  ok(ger.pieces.length === 3 && gg.length === 2 && gg.every((p) => Object.keys(p.data.grades || {}).length > 0), 'Gerber, nested: three pieces; two graded in 28 sizes from the drawn sizes, base 32 (the sample size)', JSON.stringify(ger.pieces.map((p) => [p.data.name, p.data.sizes?.list.length, p.data.sizes?.base])));
  ok(ger.notes.some((n) => n.key === 'aama.note.ungraded' && n.vars.n === 28), 'Gerber: the third (26 corners × 28 sizes) is more than one piece holds: its sample size, and it says so');
  for (const [f, n] of [['assyst/HOH_BL_L_PROD_MN_AAMA_ASSYST.DXF', 14], ['assyst/HOH_BL_L_PROD_MN_ASTM_ASSYST.DXF', 14], ['lectra/HOH_BL_L_MN_AAMA_LECTRA.dxf', 17], ['lectra/HOH_BL_L_MN_ASTM_LECTRA_.dxf', 17], ['tfm/Browzwear_T_Shirt_SS_CL_CREW_TEE.dxf', 4], ['clo/front_panel.dxf', 1], ['seamlint/real-foundation-skirt-astm.dxf', 4], ['packing/E1.dxf', 3], ['chandu/COMFORT-FIT.dxf', 13], ['parafashion/Skirt from traditional block 1.dxf', 4], ['anty/4485_OP_BOK_L_HR2618_30_1.dxf', 3], ['vitryne/tshirt.dxf', 3]]) {
    const r = read(f);
    const okSa = r.pieces.every((p) => !p.data.sa || (p.data.sa.w >= 0 && p.data.sa.w < 60));
    ok(r.pieces.length === n && okSa && r.pieces.every((p) => p.data.pts.length >= 3), f.split('/')[0] + ': ' + n + ' pieces read' + (r.pieces.some((p) => p.data.sa) ? ' (with their seam allowance)' : ''), r.pieces.length + ' ' + JSON.stringify(r.pieces.slice(0, 3).map((p) => [p.data.name, p.data.pts.length, p.data.sa?.w])));
  }
  const lec = read('lectra/HOH_BL_L_MN_AAMA_LECTRA.dxf');
  ok(lec.pieces.filter((p) => p.data.sa && p.data.sa.w > 0).length >= 10, 'Lectra AAMA: the sew line on layer 0 is found, so the allowance is read', lec.pieces.map((p) => p.data.sa?.w).join(' '));
  ok(read('assyst/HOH_BL_L_PROD_MN_AAMA_ASSYST.DXF').notes.some((n) => n.key === 'aama.note.norul'), 'ASSYST: rule numbers but no RUL → only the sample size, and it says so');
  ok(clo.pieces.every((p) => JSON.stringify(p.data).length < 12000), 'every imported piece fits in a CadCraft object (≤ 12 000 characters)', String(Math.max(...clo.pieces.map((p) => JSON.stringify(p.data).length))));
}

section('IMPORT and EXPORT through CadCraft');
{
  const { harness, startWith, memStorage } = await import('./t-addon.mjs');
  const h = harness();
  const st = await startWith(h, memStorage());
  await st.loader.setEnabled('apparel', true);
  const { doc } = h;
  const w = AA.writeAama(pieces, { standard: 'aama', grading: 'nested' });
  h.picked = { name: 'bodice.dxf', text: async () => w.dxf, arrayBuffer: async () => new TextEncoder().encode(w.dxf).buffer };
  // what IMPORT does (CadCraft registers IMPORT once per page, bound to the first loader: this process has started several)
  const CA = await import(path.join(ROOT, 'public_html/assets/apps/cadcraft/dev/addons/cadcraft-api.js'));
  const imp = st.importers().find((x) => /Apparel/.test(x.label));
  CA.addImported(doc, await imp.read(h.picked));
  const got = doc.all().filter((e) => st.kinds.info(e)?.kind === 'piece');
  ok(got.length === 3 && st.kinds.info(got[0]).data.name === 'Front' && near(got[1].rot, Math.PI / 2) && got[2].sx === -1, 'IMPORT: the pieces come in as pieces, placed as they were', JSON.stringify(got.map((e) => [e.rot, e.sx])));
  const exp = st.exporters().find((x) => /DXF-AAMA pattern/.test(x.label));
  const text = exp ? String(exp.write(doc)) : '';
  ok(/AC1009/.test(text) && /Front_XL/.test(text) && AA.readAama(text).pieces.length === 3, 'EXPORT: DXF-AAMA with every size drawn, readable again');
}
