/* SPDX-License-Identifier: Apache-2.0 */
// Part of test.mjs: a schematic saved as DXF R12, DXF 2000 and DWG (2000, 2007, 2018) by CadCraft's own writers and read
// back by its readers keeps every symbol, attribute, wire, number and sheet — no add-on code is involved in the file.
const { ok, section, load, mine, sheetDoc, Doc, KEEP, ROOT } = globalThis.__elTest;
import fs from 'node:fs';
import path from 'node:path';

const M = await mine('lib/model.js');
const W = await mine('lib/wires.js');
const D = await mine('lib/devices.js');
const S = await mine('lib/symbols.js');

/** The facts a reread drawing must keep. */
export function facts(doc) {
  const m = M.scan(doc);
  const nl = W.netlist(m);
  return {
    sheets: m.sheets.map((s) => s.number + ':' + s.title + ':' + s.plant).join('|'),
    devices: m.devices.map((d) => [d.sym, d.meta.std, d.fullTag, d.place, d.pins.map((p) => p.label).join('/'), d.attrs.XREF || '', d.attrs.XREF1 || '', d.attrs.DESC || '', d.attrs.MFR || '', d.attrs.PART || ''].join(';')).sort().join('\n'),
    wires: m.wires.length,
    nets: nl.nets.length,
    dots: m.dots.length,
    wirenos: m.wirenos.map((w) => w.value + (w.locked ? '!' : '')).sort().join(' '),
    junctions: nl.junctions.length,
  };
}
globalThis.__elTest.facts = facts;

/** The test schematic: two sheets, a start/stop circuit with a coil and contacts across sheets, numbers, dots. */
export function sampleSchematic(std = 'iec') {
  const { doc, place, wire } = sheetDoc(2);
  const xp = (p) => 20 + 39 * (p - 0.5);
  wire(0, [[25, 260], [405, 260]]); wire(0, [[25, 60], [405, 60]]);
  place(0, 'pushbutton.nc', xp(2), 225, { TAG: '-S1', DESC: 'Stop', MFR: 'Acme', PART: 'PB-NC-22' }, std);
  wire(0, [[xp(2), 260], [xp(2), 230]]);
  place(0, 'pushbutton.no', xp(2), 190, { TAG: '-S2', DESC: 'Start', MFR: 'Acme', PART: 'PB-NO-22' }, std);
  wire(0, [[xp(2), 220], [xp(2), 195]]);
  place(0, 'contact.no', xp(3), 190, { TAG: '-K1' }, std);
  wire(0, [[xp(2), 210], [xp(3), 210], [xp(3), 195]]);
  place(0, 'coil', xp(2), 140, { TAG: '-K1', DESC: 'Motor contactor', MFR: 'Acme', PART: 'CT-9A-24V' }, std);
  wire(0, [[xp(2), 185], [xp(2), 145]]);
  wire(0, [[xp(3), 185], [xp(3), 170], [xp(2), 170]]);
  wire(0, [[xp(2), 135], [xp(2), 60]]);
  place(1, 'contact.main.3p', xp(3), 180, { TAG: '-K1' }, std);
  place(1, 'motor.3ph', xp(3), 120, { TAG: '-M1', DESC: 'Pump', MFR: 'Motors Ltd', PART: 'M-0.75kW' }, std);
  for (const dx of [-5, 0, 5]) wire(1, [[xp(3) + dx, 175], [xp(3) + dx, 130]]);
  const m0 = M.scan(doc);
  doc.change('x', () => D.updateXrefs(doc, m0));
  const m1 = M.scan(doc);
  doc.change('n', () => { const nl = W.netlist(m1); W.updateDots(doc, m1, nl); W.numberWires(doc, m1, nl); });
  return doc;
}
globalThis.__elTest.sampleSchematic = sampleSchematic;

section('Files: a schematic in DXF and DWG, read back with no add-on code');
{
  const { writeDxf, readDxf } = await load('dxf.js');
  const { writeDxf2000 } = await load('dxf2000.js');
  const { saveDwg } = await load('dwg-save.js');
  const { importDwg } = await load('dwg-import.js');
  const { readDwg } = await load('dwg/read.js');
  for (const std of ['iec', 'ansi']) {
    const doc = sampleSchematic(std);
    const want = facts(doc);
    ok(want.dots >= 2 && want.wirenos.split(' ').length === want.nets && /CT-9A-24V/.test(want.devices), std + ': the sample has dots, numbers and parts', JSON.stringify({ dots: want.dots, nets: want.nets }));
    const outs = [];
    const dxf = writeDxf(doc); outs.push(['DXF R12', () => readDxf(dxf.text ?? dxf), dxf.text ?? dxf]);
    const d2 = writeDxf2000(doc); outs.push(['DXF 2000', () => readDxf(d2.text ?? d2), d2.text ?? d2]);
    for (const v of ['2000', '2007', '2018']) { const b = saveDwg(doc, { version: v }).bytes; outs.push(['DWG ' + v, () => importDwg(readDwg(b), { versionTag: 'x' }), b]); }
    for (const [how, read, data] of outs) {
      const back = new Doc();
      let err = null;
      try { back.load(read()); } catch (e) { err = e; }
      ok(!err, std + ' ' + how + ': opens', err?.stack);
      if (err) continue;
      const got = facts(back);
      for (const k of Object.keys(want)) ok(got[k] === want[k], std + ' ' + how + ': ' + k + ' kept', k === 'devices' ? diff(want[k], got[k]) : want[k] + ' → ' + got[k]);
      if (KEEP) { const dir = path.join(ROOT, 'tmp/electrical-test'); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'sample-' + std + '-' + how.replace(/\s+/g, '-') + (how.startsWith('DXF') ? '.dxf' : '.dwg')), data); }
    }
  }
}

function diff(a, b) {
  const A = a.split('\n'), B = b.split('\n');
  return 'missing: ' + A.filter((x) => !B.includes(x)).slice(0, 3).join(' || ') + ' ; extra: ' + B.filter((x) => !A.includes(x)).slice(0, 3).join(' || ');
}
