/* SPDX-License-Identifier: Apache-2.0 */
// Part of test.mjs: MQ.5, the duct schedule as TakeoffCraft items. The PDF the add-on writes is read with pdf.js and
// TakeoffCraft's OWN modules (embed.js readEmbedded, model.js readProject + quantities + estimate, packs.js readPack +
// installPack): TakeoffCraft measures the marks at the sheet's scale and must get the schedule's lengths, counts and sheet
// metal back. Needs tools/takeoffcraft-test/node_modules (npm install there); without it the PDF checks are skipped.
const { ok, section, near, rel, load, mine, ROOT, APP } = globalThis.__hvTest;
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { started, h } from './t-addon.mjs';

const TC = path.join(ROOT, 'public_html/assets/apps/takeoffcraft/dev');
const tc = (f) => import(pathToFileURL(path.join(TC, f)).href);
const TI = await tc('i18n.js');
TI.init({ strings: JSON.parse(fs.readFileSync(path.join(TC, 'lang/en.json'), 'utf8')) });
const TM = await tc('model.js');
const TP = await tc('packs.js');
const TE = await tc('embed.js');
const TK = await mine('lib/takeoff.js');
const D = await mine('lib/duct.js');
const M = await mine('lib/mep-core.js');
const { Doc } = await load('doc.js');

section('MQ.5: ducts to TakeoffCraft — a PDF with the takeoff inside, read by TakeoffCraft\'s own code');
const info = (e) => started.kinds.info(e);
const runs = h.doc.all().filter((e) => info(e)?.kind === 'duct').map((e) => D.cleanDuct(info(e).data));
const S = D.schedule(runs);
const r = await TK.ductTakeoffPdf(h.doc, runs);
ok(r.bytes.length > r.plain.length && new TextDecoder('latin1').decode(r.bytes.slice(0, 8)).startsWith('%PDF-1.4'), 'a PDF, the plotted plan with an incremental update after it');
ok(r.hash === await M.sha256Hex(r.plain), 'the takeoff stands for the plan as plotted (its SHA-256)');
ok(/^\d+(\/\d+)?" = 1'-0"$/.test(r.scale), 'an imperial drawing is plotted at an architectural scale: ' + r.scale);
const legacy = path.join(ROOT, 'tools/takeoffcraft-test/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
if (!fs.existsSync(legacy)) console.log('  (no pdf.js in tools/takeoffcraft-test: the PDF checks are skipped)');
else {
  const pdfjs = await import(pathToFileURL(legacy).href);
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(path.join(ROOT, 'tools/takeoffcraft-test/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
  const pdf = await pdfjs.getDocument({ data: r.bytes.slice(), standardFontDataUrl: path.join(ROOT, 'tools/takeoffcraft-test/node_modules/pdfjs-dist/standard_fonts') + '/' }).promise;
  ok(pdf.numPages === 1, 'pdf.js opens it: one page');
  const page = await pdf.getPage(1);
  const tx = await page.getTextContent();
  ok(tx.items.some((i) => /14×12/.test(i.str)), 'the page shows the plan (its size labels)');
  const emb = await TE.readEmbedded(pdf);
  ok(emb && emb.standsFor === r.hash, 'TakeoffCraft\'s readEmbedded finds the takeoff in it, standing for the plotted plan');
  const rp = TM.readProject(emb.takeoff);
  ok(rp.ok && !rp.warnings.length, 'readProject takes it with no warnings', JSON.stringify(rp.warnings || rp.error));
  const st = rp.state;
  const q = TM.quantities(st);
  const items = st.items;
  ok(items.length === S.ducts.length + S.fittings.length && items.every((it) => !it.mat && !it.lab && it.components.every((c) => !c.mat && !c.lab)), 'one item per duct size and per fitting; no rates anywhere', String(items.length));
  // every duct item: TakeoffCraft's measured length (marks at the sheet's scale) = the schedule's straight length
  let worst = 0;
  for (const row of S.ducts) {
    const it = items.find((x) => x.name === row.name);
    const got = it && q.get(it.id).lengthFt;
    worst = Math.max(worst, Math.abs((got ?? 0) - row.len));
    ok(it && it.type === 'linear' && it.unit === 'LF' && it.csi === '23 31 13' && rel(got, row.len, 1e-6), 'duct ' + row.name + ': TakeoffCraft measures ' + (got ?? 0).toFixed(4) + ' ft, the schedule says ' + row.len.toFixed(4));
  }
  for (const f of S.fittings) {
    const it = items.find((x) => x.name === f.name);
    ok(it && it.type === 'count' && q.get(it.id).count === f.n, 'fitting ' + f.name + ': counted ' + f.n);
  }
  // the assemblies: sheet metal from each item's formula = the schedule's area
  const est = TM.estimate(st, q);
  const sheet = est.rows.filter((x) => x.kind === 'component' && x.name === 'Sheet metal');
  const total = sheet.reduce((s, x) => s + x.qty, 0);
  ok(!est.errors && rel(total, S.totals.area, 1e-5), 'the assemblies\' sheet metal adds up to the schedule\'s ' + S.totals.area.toFixed(3) + ' ft² (' + total.toFixed(3) + ')');
  const sc = st.sheets[Object.keys(st.sheets)[0]].scale;
  const TU = await tc('units.js');
  const pre = TU.matchPreset(sc.ftPerUnit, 1);
  ok(pre && pre.label === r.scale, 'TakeoffCraft recognises the scale as its own preset ' + (pre?.label || '—'), JSON.stringify(sc));
  ok(sc.cal && rel(Math.hypot(sc.cal.b[0] - sc.cal.a[0], sc.cal.b[1] - sc.cal.a[1]) * sc.ftPerUnit, sc.cal.ft, 1e-9), 'its scale carries a check line: the longest piece measures what it is', JSON.stringify(sc));
}

// metric: a 600 × 300 run of 3 m in a drawing in millimetres → m and m²
{
  const md = new Doc();
  md.meta.units = 'millimeters';
  const run = D.cleanDuct({ id: 'mm0001', u: 'mm', k: 1, pts: [[0, 0], [3000, 0], [3000, 2000]], segs: [{ s: 'rect', w: 600, h: 300 }], z: 2700 });
  md.change('x', () => { md.add(started.kinds.create('hvac', 'duct', run, { layer: 'M-HVAC-SUPP' })); });
  const rm = await TK.ductTakeoffPdf(md, [run]);
  const st = TM.readProject(rm.project).state, q = TM.quantities(st);
  const Sm = D.schedule([run]);
  const it = st.items.find((x) => x.type === 'linear');
  const metres = q.get(it.id).lengthFt * 0.3048;
  ok(it.unit === 'm' && it.components[0].unit === 'm²' && rel(metres, Sm.ducts[0].len, 1e-6) && /^1:\d+$/.test(rm.scale), 'metric: items in m and m², 600 × 300 measured ' + metres.toFixed(4) + ' m = the schedule (' + Sm.ducts[0].len.toFixed(4) + '), scale ' + rm.scale);
  const est = TM.estimate(st, q);
  ok(rel(est.rows.filter((x) => x.kind === 'component').reduce((s, x) => s + x.qty, 0), Sm.totals.area, 1e-5), 'metric sheet metal = the schedule\'s ' + Sm.totals.area.toFixed(3) + ' m²');
  started.kinds.attach(h.doc);
}

section('MQ.5: the duct assemblies as a TakeoffCraft pack (TK.1 format)');
{
  const pack = TK.ductPack(runs, 'Level 2 HVAC');
  const res = TP.readPack(JSON.parse(JSON.stringify(pack)));
  ok(res.ok && !res.warnings.length && res.pack.id === 'hvac.level-2-hvac' && res.pack.license === 'CC0-1.0' && res.pack.status === 'starter', 'readPack takes it: CC0, starter, no warnings', JSON.stringify(res.warnings || res.error));
  ok(res.pack.items.length === S.ducts.length + S.fittings.length && res.pack.items.every((i) => i.sources.length === 2 && i.components.length === 1), 'every duct size and fitting, each with its sources and its sheet metal');
  const lib = TP.installPack([], res.pack, { system: 'both' });
  ok(lib.added === res.pack.items.length && lib.lib.every((e) => TP.rateUnset(e) && e.pack?.id === 'hvac.level-2-hvac'), 'installs into an empty library: every entry "set your rate"', JSON.stringify([lib.added, lib.lib.length]));
  ok(!JSON.stringify(pack).match(/"mat":|"lab":/), 'no rates in the pack');
}
