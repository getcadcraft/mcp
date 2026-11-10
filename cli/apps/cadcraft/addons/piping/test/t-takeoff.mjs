/* SPDX-License-Identifier: Apache-2.0 */
// Part of test.mjs (Piping): MQ.5, the pipe schedule as TakeoffCraft items, read back with TakeoffCraft's OWN modules
// (embed.js, model.js readProject + quantities + estimate, packs.js). The sloped drain is measured along its slope (its marks
// carry TakeoffCraft's rake slope), so TakeoffCraft's length is the schedule's true length; steel pipe's weight comes out of its
// assembly. Needs tools/takeoffcraft-test/node_modules for the PDF checks.
const { ok, section, rel, mine, ROOT } = globalThis.__ppTest;
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
const TU = await tc('units.js');
const TK = await mine('lib/takeoff.js');
const PP = await mine('lib/pipe.js');
const M = await mine('lib/mep-core.js');

section('MQ.5: pipes to TakeoffCraft — a PDF with the takeoff inside, read by TakeoffCraft\'s own code');
const info = (e) => started.kinds.info(e);
const runs = h.doc.all().filter((e) => info(e)?.kind === 'pipe').map((e) => PP.cleanPipe(info(e).data));
const S = PP.schedule(runs);
const r = await TK.pipeTakeoffPdf(h.doc, runs);
ok(r.hash === await M.sha256Hex(r.plain) && /" = 1'-0"$/.test(r.scale), 'the plan plotted at ' + r.scale + ', the takeoff standing for it');
const legacy = path.join(ROOT, 'tools/takeoffcraft-test/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
if (!fs.existsSync(legacy)) console.log('  (no pdf.js in tools/takeoffcraft-test: the PDF checks are skipped)');
else {
  const pdfjs = await import(pathToFileURL(legacy).href);
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(path.join(ROOT, 'tools/takeoffcraft-test/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
  const pdf = await pdfjs.getDocument({ data: r.bytes.slice(), standardFontDataUrl: path.join(ROOT, 'tools/takeoffcraft-test/node_modules/pdfjs-dist/standard_fonts') + '/' }).promise;
  const emb = await TE.readEmbedded(pdf);
  ok(emb && emb.standsFor === r.hash, 'TakeoffCraft\'s readEmbedded finds the takeoff');
  const rp = TM.readProject(emb.takeoff);
  ok(rp.ok && !rp.warnings.length, 'readProject takes it with no warnings', JSON.stringify(rp.warnings || rp.error));
  const st = rp.state, q = TM.quantities(st);
  ok(st.items.length === S.pipes.length + S.fittings.length && st.items.every((it) => !it.mat && !it.lab), 'an item per pipe size and per fitting and valve; no rates');
  for (const row of S.pipes) {
    const it = st.items.find((x) => x.name === row.name), got = it && q.get(it.id).lengthFt;
    ok(it && it.unit === 'LF' && rel(got, row.len, 1e-6), 'pipe ' + row.name + ': TakeoffCraft measures ' + (got ?? 0).toFixed(4) + ' ft, the schedule says ' + row.len.toFixed(4) + (row.slope ? ' (along its slope)' : ''));
  }
  ok(st.items.find((x) => /4" PVC/.test(x.name))?.csi === '22 13 16' && st.items.find((x) => /Pipe 2" steel/.test(x.name))?.csi === '22 11 16' && st.items.find((x) => /^Gate valve/.test(x.name))?.csi === '22 05 23', 'CSI numbers by system: sanitary 22 13 16, domestic water 22 11 16, its valves 22 05 23');
  for (const f of S.fittings) {
    const it = st.items.find((x) => x.name === f.name);
    ok(it && it.type === 'count' && q.get(it.id).count === f.n, f.name + ': counted ' + f.n);
  }
  const est = TM.estimate(st, q);
  const w = est.rows.filter((x) => x.kind === 'component' && x.name === 'Pipe weight').reduce((s, x) => s + x.qty, 0);
  ok(!est.errors && rel(w, S.totals.weight, 1e-6), 'steel pipe weight from the assemblies: ' + w.toFixed(2) + ' lb = the schedule\'s ' + S.totals.weight.toFixed(2));
  const sc = st.sheets[Object.keys(st.sheets)[0]].scale;
  ok(TU.matchPreset(sc.ftPerUnit, 1)?.label === r.scale, 'TakeoffCraft recognises the scale');
}

section('MQ.5: the pipe assemblies as a TakeoffCraft pack');
{
  const pack = TK.pipePack(runs, 'Plumbing L1');
  const res = TP.readPack(JSON.parse(JSON.stringify(pack)));
  ok(res.ok && !res.warnings.length && res.pack.id === 'piping.plumbing-l1', 'readPack takes it, no warnings', JSON.stringify(res.warnings || res.error));
  ok(res.pack.items.length === S.pipes.length + S.fittings.length && res.pack.items.find((i) => /steel/.test(i.name) && i.type === 'linear')?.components[0]?.name === 'Pipe weight', 'every pipe, fitting and valve; steel pipe with its weight');
  const lib = TP.installPack([], res.pack, { system: 'both' });
  ok(lib.added === res.pack.items.length && lib.lib.every((e) => TP.rateUnset(e)), 'installs: every entry "set your rate"');
}
