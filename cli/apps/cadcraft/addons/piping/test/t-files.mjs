/* SPDX-License-Identifier: Apache-2.0 */
// Part of test.mjs (Piping): pipe runs in DWG and DXF (the add-on rule, docs/ADDONS-SPEC.md §7.3). Saved with the add-on and reopened
// with it → every run whole; reopened WITHOUT it → plain block references that draw, the 3D solids still on the 3D tab; moved
// and saved without it → reopened with it, the move is baked into the run's data and nothing else is lost.
const { ok, section, near, load } = globalThis.__ppTest;
import { started, h } from './t-addon.mjs';

const { Doc } = await load('doc.js');
const G = await load('geom.js');
const Cmd = await load('commands.js');
const O = await load('addons/objects.js');
const { solidsOf } = await load('model3d.js');
const { saveDwg } = await load('dwg-save.js');
const { writeDxf, readDxf } = await load('dxf.js');
const { writeDxf2000 } = await load('dxf2000.js');
const { readDwg } = await load('dwg/read.js');
const { importDwg } = await load('dwg-import.js');

section('Pipe runs and symbols in DWG and DXF, with and without the add-on');
const doc = h.doc;
const info = (e) => started.kinds.info(e);
const runsOf = (d) => d.all().filter((e) => info(e)?.kind === 'pipe');
const want = new Map(runsOf(doc).map((e) => [info(e).data.id, JSON.stringify(info(e).data)]));
const nSolids = solidsOf(doc.model3d).length;
const FORMATS = [
  { key: 'DWG 2018', write: (dd) => saveDwg(dd, { version: '2018' }).bytes, read: (b) => importDwg(readDwg(b)) },
  { key: 'DWG 2000', write: (dd) => saveDwg(dd, { version: '2000' }).bytes, read: (b) => importDwg(readDwg(b)) },
  { key: 'DXF R12', write: (dd) => writeDxf(dd).text, read: (t) => readDxf(t) },
  { key: 'DXF 2000', write: (dd) => writeDxf2000(dd).text, read: (t) => readDxf(t) },
];
ok(want.size === 3 && nSolids >= 3, 'the drawing has three runs (a main, a branch, a drain) and their solids', String(want.size));
for (const F of FORMATS) {
  let out;
  try { out = F.write(doc); } catch (err) { ok(false, F.key + ': saves', err.message); continue; }
  const d2 = new Doc();
  started.kinds.attach(d2);
  d2.load(F.read(out));
  const back = runsOf(d2);
  ok(back.length === 3 && back.every((e) => want.get(info(e).data.id) === JSON.stringify(info(e).data)), F.key + ': reopened with the add-on, all three runs are whole (every value)', back.map((e) => info(e).data.id).join());
  ok(solidsOf(d2.model3d).length === nSolids && solidsOf(d2.model3d).every((s) => s.closed), F.key + ': the solids are on the 3D tab again, closed');
  started.kinds.attach(doc);
}

// without the add-on
await started.loader.setEnabled('piping', false);
ok(!Cmd.lookup('PIPE'), 'switched off: PIPE is gone');
for (const F of FORMATS) {
  const d1 = new Doc();
  started.kinds.attach(d1);
  d1.load(F.read(F.write(doc)));
  const plain = d1.all().filter((e) => O.ObjectKinds.stored(e)?.kind === 'pipe');
  ok(plain.length === 3 && plain.every((e) => e.type === 'insert' && d1.blocks.get(e.block)?.entities.length > 0 && e.xd?.CC_PIPING), F.key + ': without the add-on, three plain block references that draw, with their CC_PIPING xdata');
  ok(solidsOf(d1.model3d).length === nSolids, F.key + ': and the solids are still there (ordinary 3D groups)');
  // edit without the add-on: move one run's reference, recolour the other, add a line
  const [a, b] = plain;
  const symPlain = d1.all().filter((e) => O.ObjectKinds.stored(e)?.kind === 'symbol');
  ok(symPlain.length === 1 && d1.blocks.get(symPlain[0].block)?.entities.length > 1, F.key + ': the instrument balloon too: a plain block reference that draws');
  d1.change('edit', () => {
    d1.update(a.id, G.txEntity(a, G.mTranslate(0, 100)));
    d1.update(b.id, { ...b, color: 3 });
    d1.add({ type: 'line', x1: 0, y1: 0, x2: 10, y2: 0, layer: '0' });
  });
  const aId = O.decodeItems(a.xd.CC_PIPING).data.id;
  const out2 = F.write(d1);
  // with the add-on again
  await started.loader.setEnabled('piping', true);
  const d2 = new Doc();
  started.kinds.attach(d2);
  d2.load(F.read(out2));
  const back = runsOf(d2);
  const moved = back.find((e) => info(e).data.id === aId), other = back.find((e) => info(e).data.id !== aId);
  const w0 = JSON.parse(want.get(aId));
  ok(moved && moved.x === 0 && moved.y === 0 && info(moved).data.pts.every((p, i) => near(p[0], w0.pts[i][0]) && near(p[1], w0.pts[i][1] + 100)), F.key + ': saved without the add-on and reopened with it: the move is in the run\'s points (back at the origin)', JSON.stringify(moved && [moved.x, moved.y, info(moved).data.pts]));
  ok(other && other.color === 3 && want.get(info(other).data.id) === JSON.stringify(info(other).data), F.key + ': the other run: every value, and its new color');
  ok(d2.all().some((e) => e.type === 'line'), F.key + ': the line added without the add-on is there');
  started.kinds.attach(doc);
  await started.loader.setEnabled('piping', false);
}
await started.loader.setEnabled('piping', true);
ok(Cmd.lookup('PIPE') && runsOf(doc).length === 3 && doc.all().some((e) => info(e)?.kind === 'symbol'), 'switched on again: the runs are runs, the symbol a symbol');
