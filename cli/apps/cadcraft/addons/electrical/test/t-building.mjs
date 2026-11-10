/* SPDX-License-Identifier: Apache-2.0 */
// Part of test.mjs: building installation symbols and residual-current devices (0.7 ELEC-BUILDING).
const { ok, section, near, load, mine, EN, Doc, APP } = globalThis.__elTest;
import fs from 'node:fs';
import path from 'node:path';

const IN = await mine('lib/install.js');
const S = await mine('lib/symbols.js');
const M = await mine('lib/model.js');
const PN = await mine('lib/panel.js');
const CK = await mine('lib/checks.js');
const { writeDxf2000 } = await load('dxf2000.js');
const { readDxf } = await load('dxf.js');
const { saveDwg } = await load('dwg-save.js');
const { readDwg } = await load('dwg/read.js');
const { importDwg } = await load('dwg-import.js');

section('ELEC-BUILDING: more building installation symbols (detectors, data, appliances, sub-board) and RCDs');
{
  // every installation symbol builds a block, has words and a group, and is drawn from plain entities
  const names = new Set();
  let build = true, words = true, groups = true, geom = true;
  for (const s of IN.INSTALL) {
    const b = IN.installBlock(s.key);
    names.add(b.name);
    if (!/^[A-Z0-9_]{1,31}$/.test(b.name) || !b.entities.length) build = false;
    if (!EN['inst.' + s.key] || !EN['igroup.' + s.group]) words = false;
    if (!IN.INSTALL_GROUPS.includes(s.group)) groups = false;
    for (const e of b.entities) for (const v of Object.values(e)) if (typeof v === 'number' && !Number.isFinite(v)) geom = false;
  }
  ok(IN.INSTALL.length >= 33 && names.size === IN.INSTALL.length && build && words && groups && geom, 'every installation symbol (' + IN.INSTALL.length + ') builds a block with a unique name, words in lang/en.json, a listed group and finite geometry');
  const keys = IN.INSTALL.map((s) => s.key);
  ok(['socket.data', 'socket.tel', 'socket.tv', 'switch.key', 'switch.timer', 'thermostat', 'luminaire.exit', 'detector.smoke', 'detector.heat', 'callpoint', 'sounder', 'fan', 'heater', 'cooker', 'evcharger', 'meter', 'board.sub'].every((k) => keys.includes(k)), 'the new ones: data, telephone and television outlets, key and time switch, thermostat, exit sign, smoke and heat detectors, call point, sounder, fan, water heater, cooker, EV charging point, meter, sub-board');
  ok(IN.installSymbol('board.sub').role === 'board' && IN.installBlock('board.sub').attdefs.some((d) => d.tag === 'VOLTAGE'), 'a sub-board is a board (circuits can start there)');

  // RCD symbols
  for (const key of ['rcd.2p', 'rcd.4p', 'rcbo']) {
    const s = S.symbol(key), b = S.symbolBlock(key, 'iec');
    ok(s && s.group === 'protection' && S.LETTERS[key] === 'F' && EN['sym.' + key] && S.readMeta(b)?.pins.length === s.pins.length, key + ': in Protection and switching, class letter F, words, pins in its EL attribute');
  }
  ok(S.symbol('rcd.2p').pins.length === 4 && S.symbol('rcd.4p').pins.length === 8 && S.symbol('rcd.4p').pins.filter((p) => p[3] === 'N').length === 2, 'two and four poles: 1/2 per line pole, N at the neutral');
  const bx = S.symbolBlock('rcd.4p', 'iec');
  ok(bx.entities.some((e) => e.type === 'text' && e.s === 'IΔ'), 'the residual-current box (IΔ) is drawn');
  ok(S.symbolBlock('rcbo', 'iec').entities.some((e) => e.type === 'text' && e.s === 'I>'), 'an RCBO also has the overcurrent box (I>)');
  ok(S.symbolBlock('rcd.4p', 'ansi').entities.length === bx.entities.length, 'ANSI falls back to the IEC drawing (listed as the same)');

  // circuits with an RCD: the label, the panel schedule column, the check
  const doc = new Doc();
  doc.meta.units = 'millimeters';
  const sc = IN.defaultScale('millimeters');
  const put = (key, x, y, attrs = {}) => { let e; doc.change('p', () => { S.ensureBlock(doc, IN.installBlock(key)); e = doc.add({ type: 'insert', block: IN.installBlockName(key), x, y, sx: sc, sy: sc, rot: 0, layer: 'EL-INSTALL', attrs: IN.installAttrs(key, attrs) }); }); return e; };
  put('board', 0, 0, { TAG: 'DB1' });
  put('socket', 1000, 0, { CIRCUIT: 'C1' }); put('socket.double', 2000, 0, { CIRCUIT: 'C2' }); put('socket', 3000, 0, { CIRCUIT: 'C3' });
  put('luminaire', 4000, 0, { CIRCUIT: 'C4' }); put('socket.data', 5000, 0, { CIRCUIT: 'C5' }); put('detector.smoke', 6000, 0, { CIRCUIT: 'C6' });
  doc.change('c', () => {
    const d = (n, rcd) => IN.defineCircuit(doc, doc.model, { x: -2000, y: -300 * Number(n.slice(1)) }, { CIRCUIT: n, DESC: n, BREAKER: '16', PHASE: 'L1', BOARD: 'DB1', RCD: rcd });
    d('C1', 'RCD1 30 mA A'); d('C2', ''); d('C3', 'RCD2 300 mA'); d('C4', ''); d('C5', ''); d('C6', '');
  });
  const model = M.scan(doc), inst = IN.installation(doc, model);
  ok(inst.circuits.get('C1').rcd === 'RCD1 30 mA A' && IN.rcdMilliamps('RCD1 30 mA A') === 30 && IN.rcdMilliamps('0,03 mA') === 0.03 && IN.rcdMilliamps('RCD1 type A') === null && IN.rcdMilliamps('') === null, 'the RCD text is read from the circuit label (30 mA found, none when there is no figure)');
  const no = CK.runChecks(doc, model).filter((c) => c.code === 'no-rcd').map((c) => /C\d/.exec(c.message)[0]).sort();
  ok(no.join() === 'C2,C3', 'the check names the socket circuits with no RCD (C2) or one over 30 mA (C3); a 30 mA one (C1), a lighting circuit, a data outlet and a detector are left alone', no.join());
  const sched = PN.panelSchedule(inst, inst.boards[0], new Map());
  ok(sched.columns.some((c) => c.key === 'rcd') && sched.rows.find((r) => r.circuit === 'C1').rcd === 'RCD1 30 mA A', 'the panel schedule has an RCD column');
  // the new attribute survives DXF 2000 and DWG
  for (const [label, d] of [['DXF 2000', readDxf(writeDxf2000(doc).text)], ['DWG 2018', importDwg(readDwg(saveDwg(doc, { version: '2018' }).bytes), { versionTag: 'x' })]]) {
    const lab = d.entities.filter((e) => e.type === 'insert' && e.block === 'EL_CIRCUIT').find((e) => e.attrs?.CIRCUIT === 'C1');
    ok(lab?.attrs?.RCD === 'RCD1 30 mA A', label + ': the circuit label keeps its RCD text', JSON.stringify(lab?.attrs));
  }
  // an RCD symbol is a block like the others: it saves and comes back
  const d2 = new Doc();
  d2.change('s', () => { const b = S.symbolBlock('rcd.4p', 'iec'); S.ensureBlock(d2, b); d2.add({ type: 'insert', block: b.name, x: 0, y: 0, sx: 1, sy: 1, rot: 0, layer: 'EL-SYMBOL', attrs: { TAG: '-F1' } }); });
  const r = importDwg(readDwg(saveDwg(d2, { version: '2010' }).bytes), { versionTag: 'x' });
  ok(r.entities.some((e) => e.type === 'insert' && /RCD_4P/.test(e.block)) && r.blocks.some((b) => /RCD_4P/.test(b.name) && b.entities.length >= 30), 'a four-pole RCD saved as DWG comes back as its block');
}
