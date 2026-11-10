/* SPDX-License-Identifier: Apache-2.0 */
// Part of test.mjs: the public sample project (E.11) — built, checked clean, its lists right, saved and read back; and, when
// fixtures/electrical/ has been made from it (make-sample.mjs), the files there say the same.
const { ok, section, near, load, mine, Doc, ROOT, facts } = globalThis.__elTest;
import fs from 'node:fs';
import path from 'node:path';

const L = { Doc, S: await mine('lib/symbols.js'), PJ: await mine('lib/project.js'), M: await mine('lib/model.js'), W: await mine('lib/wires.js'), D: await mine('lib/devices.js'), RP: await mine('lib/reports.js'), IN: await mine('lib/install.js') };
const CK = await mine('lib/checks.js');
const PN = await mine('lib/panel.js');
const { buildSample, SAMPLE_FACTS: F } = await mine('test/sample.mjs');

section('E.11 the sample project');
{
  const doc = await buildSample(L);
  const m = L.M.scan(doc);
  const schem = m.sheets.filter((s) => s.frame && ['Power circuit', 'Control circuit', 'PLC'].includes(s.title));
  ok(schem.length === F.schematicSheets && doc.layouts.length === F.schematicSheets + F.reportSheets, 'three schematic sheets and four report sheets', doc.layouts.map((l) => l.name).join(' | '));
  ok(m.devices.length >= F.devicesAtLeast, 'devices', String(m.devices.length));
  const k1 = m.devices.find((d) => d.role === 'coil' && d.tag === '-K1');
  const mirror = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => k1?.attrs['XREF' + i]).filter(Boolean);
  ok(JSON.stringify(mirror) === JSON.stringify(F.coilK1Mirror), 'the contactor lists its six contacts', JSON.stringify(mirror));
  const found = CK.runChecks(doc, m);
  const errors = found.filter((f) => f.level === 'error');
  ok(!errors.length, 'no errors in the sample', JSON.stringify(errors.map((f) => f.message)));
  const tp = L.RP.terminalPlan(m);
  ok(tp.rows.length === 4 && tp.rows[0].top === '-K1:2' && tp.rows[0].bottom === '-M1:U' && tp.rows[3].top === '', 'terminal plan: -X1:1–4, from the contactor to the motor', JSON.stringify(tp.rows.map((r) => [r.no, r.top, r.bottom])));
  const cl = L.RP.cableList(m);
  ok(cl.rows.length === 3 && cl.rows.every((r) => r.cable === '-W1') && cl.rows[2].to === '-M1:W', 'cable list: three cores of -W1', JSON.stringify(cl.rows.map((r) => [r.core, r.from, r.to])));
  const pl = L.RP.partsList(m);
  ok(pl.rows.find((r) => r.part === 'CT-9-24DC')?.qty === '1' && pl.rows.find((r) => r.part === 'TB-4')?.qty === '3', 'parts list: one contactor, three terminals of one kind', JSON.stringify(pl.rows.map((r) => [r.qty, r.part])));
  const inst = L.IN.installation(doc, m);
  for (const [n, w] of Object.entries(F.circuits)) ok(inst.circuits.get(n)?.watts === w, 'circuit ' + n + ' carries ' + w + ' W', String(inst.circuits.get(n)?.watts));
  const len = L.IN.cableLengths(doc, m, inst);
  ok([...len.values()].every((x) => x.routed && !x.unreached.length), 'every circuit is reached along the routes', JSON.stringify([...len].map(([k, v]) => [k, v.metres.toFixed(1), v.reason])));
  // C3 (lights): board (300,4000) → up 3.7 m → along 5.7 m to x 6000 → down to y 1500: 6.2 m; the switch 0.3 m off the tray at y 3500 (0.5 m back down from the board)
  ok(near(len.get('C3').metres, 3.7 + 5.7 + 6.2 + 0.5 + 0.3 + 4 * 0.5 + 1, 1e-6), 'the lights\' cable runs the shortest shared way', len.get('C3').metres.toFixed(3));
  const sched = PN.panelSchedule(inst, inst.boards[0], len);
  ok(sched.rows.length === 4 + 5 && sched.phases.L1 === 1800 + 2500 && near(sched.phases.L3, 2500), 'panel schedule: four circuits, the compressor on all three phases', JSON.stringify(sched.phases));
  // DWG and DXF keep it all
  const want = facts(doc);
  const { saveDwg } = await load('dwg-save.js');
  const { importDwg } = await load('dwg-import.js');
  const { readDwg } = await load('dwg/read.js');
  const { writeDxf2000 } = await load('dxf2000.js');
  const { readDxf } = await load('dxf.js');
  const b1 = new Doc(); b1.load(importDwg(readDwg(saveDwg(doc, { version: '2018' }).bytes), { versionTag: 'x' }));
  const b2 = new Doc(); const dx = writeDxf2000(doc); b2.load(readDxf(dx.text ?? dx));
  for (const [how, b] of [['DWG 2018', b1], ['DXF 2000', b2]]) {
    const got = facts(b);
    ok(Object.keys(want).every((k) => got[k] === want[k]), 'the sample through ' + how, Object.keys(want).filter((k) => got[k] !== want[k]).join(', '));
    const bi = L.IN.installation(b, L.M.scan(b));
    ok(Object.entries(F.circuits).every(([n, w]) => bi.circuits.get(n)?.watts === w), how + ': circuits and loads');
  }
  // the published copy, once it exists
  const dir = path.join(ROOT, 'fixtures/electrical');
  for (const f of ['electrical-sample.dwg', 'electrical-sample.dxf']) {
    const file = path.join(dir, f);
    if (!fs.existsSync(file)) { console.log('  (skip) ' + path.relative(ROOT, file) + ' not made yet — node …/electrical/test/make-sample.mjs --out fixtures/electrical'); continue; }
    const b = new Doc();
    const data = fs.readFileSync(file);
    b.load(f.endsWith('.dwg') ? importDwg(readDwg(new Uint8Array(data)), { versionTag: 'x' }) : readDxf(data.toString('latin1')));
    const got = facts(b);
    ok(Object.keys(want).every((k) => got[k] === want[k]), path.relative(ROOT, file) + ' is the sample', Object.keys(want).filter((k) => got[k] !== want[k]).join(', '));
  }
}
