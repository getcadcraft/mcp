/* SPDX-License-Identifier: Apache-2.0 */
// Part of test.mjs (P&ID): the diagram in DWG and DXF (the add-on rule, docs/ADDONS-SPEC.md §7.3). Saved with the add-on and
// reopened with it → every symbol and line whole, the lists identical; reopened WITHOUT it → plain block references that draw;
// moved and saved without it → reopened with it, the move is in the data and nothing else is lost. And the showcase drawing.
const { ok, section, near, load, ROOT } = globalThis.__pidTest;
import fs from 'node:fs';
import path from 'node:path';
import { started, h } from './t-addon.mjs';

const { Doc } = await load('doc.js');
const G = await load('geom.js');
const Cmd = await load('commands.js');
const O = await load('addons/objects.js');
const { saveDwg } = await load('dwg-save.js');
const { writeDxf, readDxf } = await load('dxf.js');
const { writeDxf2000 } = await load('dxf2000.js');
const { readDwg } = await load('dwg/read.js');
const { importDwg } = await load('dwg-import.js');
const MD = await import('../lib/model.js');
const LS = await import('../lib/lists.js');

section('The diagram in DWG and DXF, with and without the add-on');
const doc = h.doc;
const info = (e) => started.kinds.info(e);
const mine = (d) => d.all().filter((e) => ['pidsym', 'pidline', 'pidtable'].includes(info(e)?.kind));
const key = (e) => info(e).kind + JSON.stringify(info(e).data);
const want = mine(doc).map(key).sort();
const FORMATS = [
  { key: 'DWG 2018', write: (dd) => saveDwg(dd, { version: '2018' }).bytes, read: (b) => importDwg(readDwg(b)) },
  { key: 'DWG 2000', write: (dd) => saveDwg(dd, { version: '2000' }).bytes, read: (b) => importDwg(readDwg(b)) },
  { key: 'DXF R12', write: (dd) => writeDxf(dd).text, read: (t) => readDxf(t) },
  { key: 'DXF 2000', write: (dd) => writeDxf2000(dd).text, read: (t) => readDxf(t) },
];
ok(want.length >= 6, 'the drawing has symbols, lines and a list', String(want.length));
const listsOf = (d) => JSON.stringify(LS.allLists(MD.scan(d.all().filter((e) => ['pidsym', 'pidline'].includes(info(e)?.kind)).map((e) => ({ uid: String(e.id), e, kind: info(e).kind, data: info(e).data })))));
const wantLists = listsOf(doc);
for (const F of FORMATS) {
  let out;
  try { out = F.write(doc); } catch (err) { ok(false, F.key + ': saves', err.message); continue; }
  const d2 = new Doc();
  started.kinds.attach(d2);
  d2.load(F.read(out));
  ok(JSON.stringify(mine(d2).map(key).sort()) === JSON.stringify(want), F.key + ': reopened with the add-on, every symbol, line and list is whole (every value)', mine(d2).length + ' of ' + want.length);
  ok(listsOf(d2) === wantLists, F.key + ': and the four lists come out the same');
  started.kinds.attach(doc);
}

await started.loader.setEnabled('pid', false);
ok(!Cmd.lookup('PIDSYMBOL'), 'switched off: PIDSYMBOL is gone');
for (const F of FORMATS) {
  const d1 = new Doc();
  started.kinds.attach(d1);
  d1.load(F.read(F.write(doc)));
  const plain = d1.all().filter((e) => ['pidsym', 'pidline', 'pidtable'].includes(O.ObjectKinds.stored(e)?.kind));
  ok(plain.length === want.length && plain.every((e) => e.type === 'insert' && d1.blocks.get(e.block)?.entities.length > 0 && e.xd?.CC_PID), F.key + ': without the add-on, plain block references that draw, with their CC_PID data', plain.length + '');
  const [a, b] = plain;
  d1.change('edit', () => {
    d1.update(a.id, G.txEntity(a, G.mTranslate(0, 100)));
    d1.update(b.id, { ...b, color: 3 });
    d1.add({ type: 'line', x1: 0, y1: 0, x2: 10, y2: 0, layer: '0' });
  });
  const aData = O.decodeItems(a.xd.CC_PID).data;
  const out2 = F.write(d1);
  await started.loader.setEnabled('pid', true);
  const d2 = new Doc();
  started.kinds.attach(d2);
  d2.load(F.read(out2));
  const back = mine(d2);
  ok(back.length === want.length && d2.all().some((e) => e.type === 'line' && e.x2 === 10), F.key + ': edited without it and reopened with it: every object back, the new line kept');
  const moved = back.find((e) => JSON.stringify(info(e).kind === 'pidline' ? info(e).data.pts.map((p) => [p[0], p[1] - 100]) : null) === JSON.stringify(aData.pts)) || back.find((e) => info(e).kind === 'pidsym' && near(e.y, a.y + 100));
  ok(!!moved, F.key + ': the move made without the add-on is in the data (a line\'s points / a symbol\'s place)');
  started.kinds.attach(doc);
  await started.loader.setEnabled('pid', false);
}
await started.loader.setEnabled('pid', true);

section('The showcase drawing (fixtures/showcase/cadcraft-pid-plant)');
{
  const dir = path.join(ROOT, 'fixtures/showcase');
  const dwg = path.join(dir, 'cadcraft-pid-plant.dwg'), dxf = path.join(dir, 'cadcraft-pid-plant.dxf');
  if (!fs.existsSync(dwg)) console.log('  (not built yet: node tools/pid-test/make-showcase.mjs)');
  else {
    const CK = await import('../lib/checks.js');
    for (const [name, file, rd] of [['DWG', dwg, (f) => importDwg(readDwg(new Uint8Array(fs.readFileSync(f))))], ['DXF', dxf, (f) => readDxf(fs.readFileSync(f, 'utf8'))]]) {
      const d = new Doc();
      started.kinds.attach(d);
      d.load(rd(file));
      const items = d.all().filter((e) => ['pidsym', 'pidline'].includes(info(e)?.kind)).map((e) => ({ uid: String(e.id), e, kind: info(e).kind, data: info(e).data }));
      const m = MD.scan(items), found = CK.runChecks(m);
      ok(m.symbols.length === 16 && m.lines.length === 15 && !found.length, name + ': 16 symbols, 15 lines, no findings', m.symbols.length + '/' + m.lines.length + ' ' + found.map((f) => f.code).join());
      const ll = LS.lineList(m);
      ok(ll.rows.length === 6 && ll.rows.find((r) => r[0] === 'DN50-PW-102-A1A')?.[5] === 'P-101 (discharge)' && ll.rows.find((r) => r[0] === 'DN50-PW-102-A1A')?.[6] === 'E-101 (tube in)', name + ': six numbered lines; 102 runs from the pump to the exchanger through three valves and an orifice');
      started.kinds.attach(doc);
    }
  }
}
