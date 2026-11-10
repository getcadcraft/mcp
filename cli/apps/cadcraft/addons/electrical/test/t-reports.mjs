/* SPDX-License-Identifier: Apache-2.0 */
// Part of test.mjs: E.5 sheet list, E.6 terminal plan and cable list, E.7 parts list, tables on sheets and CSV;
// E.8 installation plans, E.9 panel schedule, E.10 checks.
const { ok, section, near, mine, sheetDoc, sampleSchematic, Doc } = globalThis.__elTest;

const M = await mine('lib/model.js');
const W = await mine('lib/wires.js');
const D = await mine('lib/devices.js');
const S = await mine('lib/symbols.js');
const RP = await mine('lib/reports.js');
const IN = await mine('lib/install.js');
const PN = await mine('lib/panel.js');
const CK = await mine('lib/checks.js');

/** A field connection: terminals -X1:1…3 between the contactor and the motor, a cable -W1 across the three wires. */
function withTerminals() {
  const { doc, place, wire, sheets } = sheetDoc(1);
  const x = 200;
  place(0, 'contact.main.3p', x, 220, { TAG: '-K1' });
  place(0, 'coil', 60, 150, { TAG: '-K1', MFR: 'Acme', PART: 'CT-9A' });
  place(0, 'motor.3ph', x, 60, { TAG: '-M1', MFR: 'Motors Ltd', PART: 'M-075' });
  for (const [i, dx] of [-5, 0, 5].entries()) {
    place(0, 'terminal', x + dx, 140, { TAG: '-X1', P1: String(i + 1), MFR: 'Clamp Co', PART: 'TB-2.5' });
    wire(0, [[x + dx, 215], [x + dx, 142.5]]);
    wire(0, [[x + dx, 137.5], [x + dx, 70]]);
  }
  let e;
  doc.change('cable', () => { S.ensureBlock(doc, S.helperBlock('cable')); doc.add({ type: 'line', layer: 'EL-CABLE', x1: x - 8, y1: 98, x2: x + 8, y2: 102 }, sheets[0].entities); e = doc.add({ type: 'insert', block: 'EL_CABLE', x: x + 8, y: 102, sx: 1, sy: 1, rot: 0, layer: 'EL-CABLE', attrs: { TAG: '-W1', TYPE: 'H07RN-F 4G1.5', CORES: '4', LENGTH: '12' } }, sheets[0].entities); });
  const m = M.scan(doc);
  doc.change('n', () => { const nl = W.netlist(m); W.numberWires(doc, m, nl); D.updateXrefs(doc, m); });
  return { doc, cable: e, sheets };
}

section('E.5 / E.6 / E.7 reports, tables and CSV');
{
  const doc = sampleSchematic();
  let model = M.scan(doc);
  const sl = RP.sheetList(model);
  ok(sl.rows.length === 2 && sl.rows[0].sheet === '1' && sl.rows[1].title === 'Sheet 2' && sl.rows[0].plant === 'A1', 'sheet list');
  const pl = RP.partsList(model);
  const k1 = pl.rows.find((r) => r.part === 'CT-9A-24V');
  ok(k1 && k1.qty === '1' && k1.tags === '-K1' && k1.desc === 'Motor contactor', 'parts list: one contactor for its coil and its contacts', JSON.stringify(pl.rows));
  ok(pl.rows.some((r) => r.part === 'PB-NO-22' && r.mfr === 'Acme') && pl.rows.some((r) => r.part === 'M-0.75kW'), 'parts list: buttons and the motor');
  const { doc: d2, cable, sheets } = withTerminals();
  model = M.scan(d2);
  const tp = RP.terminalPlan(model);
  ok(tp.rows.length === 3 && tp.rows.map((r) => r.no).join() === '1,2,3', 'terminal plan: three terminals in order', JSON.stringify(tp.rows.map((r) => r.no)));
  ok(tp.rows[0].top === '-K1:2' && tp.rows[0].bottom === '-M1:U' && tp.rows[2].bottom === '-M1:W', 'each side says what it connects to', JSON.stringify(tp.rows[0]));
  ok(tp.rows.every((r) => r.wire && r.strip === '=A1+S1-X1'), 'wire numbers and the strip', JSON.stringify(tp.rows[0]));
  const cl = RP.cableList(model);
  ok(cl.rows.length === 3 && cl.rows.every((r) => r.cable === '-W1' && r.type === 'H07RN-F 4G1.5'), 'cable list: three cores of -W1', JSON.stringify(cl.rows.length));
  ok(cl.rows[0].from === '-X1:1' && cl.rows[0].to === '-M1:U' && cl.rows[2].to === '-M1:W', 'cores from the terminals to the motor', JSON.stringify(cl.rows[0]));
  const pl2 = RP.partsList(model);
  const tb = pl2.rows.find((r) => r.part === 'TB-2.5');
  ok(tb && tb.qty === '3' && tb.tags === '-X1:1, -X1:2, -X1:3', 'terminals are counted one by one', JSON.stringify(tb));
  // CSV
  const csv = RP.toCsv({ columns: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B, b' }], rows: [{ a: '=1+1', b: 'say "hi"' }, { a: '-K1', b: '' }] });
  ok(csv === 'A,"B, b"\r\n\'=1+1,"say ""hi"""\r\n\'-K1,\r\n', 'CSV: quoting and no formulas', JSON.stringify(csv));
  // tables on sheets: a long list runs over several sheets
  const many = { title: 'Big list', columns: [{ key: 'n', label: 'No' }, { key: 's', label: 'Text' }], rows: Array.from({ length: 130 }, (_, i) => ({ n: String(i + 1), s: 'Row ' + (i + 1) })) };
  const before = d2.layouts.length;
  let made;
  d2.change('report', () => { made = RP.addReportSheets(d2, many); });
  ok(made.length >= 2 && d2.layouts.length === before + made.length && made[0].name === 'Big list (1 of ' + made.length + ')', 'a long report runs over ' + made.length + ' sheets', made.map((l) => l.name).join(' | '));
  const texts = made.flatMap((l) => [...l.entities.values()].filter((e) => e.type === 'text').map((e) => e.s));
  ok(texts.includes('Row 1') && texts.includes('Row 130') && texts.filter((s) => s === 'No').length === made.length, 'every row once, the heading on every sheet');
  const m3 = M.scan(d2);
  ok(m3.sheets.length === 1 + made.length && m3.sheets.at(-1).title === made.at(-1).name, 'report sheets are numbered sheets with a frame');
  const box = (l) => { let x0 = Infinity, x1 = -Infinity, y0 = Infinity; for (const e of l.entities.values()) if (e.type === 'line' && e.layer === 'EL-REPORT') { x0 = Math.min(x0, e.x1, e.x2); x1 = Math.max(x1, e.x1, e.x2); y0 = Math.min(y0, e.y1, e.y2); } return { x0, x1, y0 }; };
  ok(made.every((l) => { const b = box(l); return b.x0 >= 20 && b.x1 <= 410 && b.y0 >= 45; }), 'tables stay inside the frame\'s drawing area', JSON.stringify(box(made[0])));
  const w = RP.columnWidths([{ key: 'a', label: 'A' }], [{ a: 'x'.repeat(500) }], 100);
  ok(near(w[0], 100), 'a too-wide column is held to the width (cells are cut with …)');
  d2.undo();
  ok(d2.layouts.length === before, 'the whole report is one undo step');
}

section('E.8 installation plans: circuits, loads, cable lengths along routes');
{
  const doc = new Doc();
  doc.meta.units = 'millimeters';
  const sc = IN.defaultScale('millimeters');
  ok(sc === 50, 'symbols at 1:50 in a millimetre plan');
  const put = (key, x, y, attrs = {}) => { let e; doc.change('p', () => { S.ensureBlock(doc, IN.installBlock(key)); e = doc.add({ type: 'insert', block: IN.installBlockName(key), x, y, sx: sc, sy: sc, rot: 0, layer: 'EL-INSTALL', attrs: IN.installAttrs(key, attrs) }); }); return e; };
  const route = (pts) => doc.change('r', () => doc.add({ type: 'poly', closed: false, layer: 'EL-ROUTE', pts: pts.map(([x, y]) => ({ x, y, b: 0 })) }));
  put('board', 0, 0, { TAG: 'DB1' });
  // a tray along y = 1000 from x 0 to 10 000, a branch up at x 6000 to y 4000
  route([[0, 0], [0, 1000], [10000, 1000]]);
  route([[6000, 1000], [6000, 4000]]);
  const s1 = put('socket', 2000, 1200, { CIRCUIT: 'C1' }), s2 = put('socket.double', 9000, 1200, { CIRCUIT: 'C1' });
  const l1 = put('luminaire', 6000, 3000, { CIRCUIT: 'C2' }), l2 = put('luminaire', 6200, 4000, { CIRCUIT: 'C2' });
  const lost = put('socket', 20000, 20000, { CIRCUIT: 'C3' });
  const free = put('switch', 500, 500);
  doc.change('c', () => { IN.defineCircuit(doc, doc.model, { x: -2000, y: 0 }, { CIRCUIT: 'C1', DESC: 'Sockets', BREAKER: '16', PHASE: 'L1', BOARD: 'DB1' }); IN.defineCircuit(doc, doc.model, { x: -2000, y: -500 }, { CIRCUIT: 'C2', DESC: 'Lights', BREAKER: '10', PHASE: 'L1', BOARD: 'DB1' }); });
  let model = M.scan(doc);
  let inst = IN.installation(doc, model);
  ok(inst.boards.length === 1 && inst.circuits.size === 3 && inst.circuits.get('C1').watts === 600 && inst.circuits.get('C2').watts === 120, 'loads per circuit', JSON.stringify([...inst.circuits.values()].map((c) => [c.name, c.watts])));
  ok(near(inst.circuits.get('C1').amps, 600 / 230, 1e-9), 'current from the load and the voltage');
  const len = IN.cableLengths(doc, model, inst);
  // C1: board → (0,1000) 1 m, → x 9000 9 m along the tray; drops 0.2 m each; + 0.5 m per device + 1 m at the board
  const c1 = len.get('C1');
  ok(c1.routed && near(c1.metres, 1 + 9 + 0.2 + 0.2 + 2 * 0.5 + 1, 1e-6), 'C1: shared tray counted once, drops and allowances', String(c1.metres));
  const c2 = len.get('C2');
  // C2: 1 m up + 6 m along + 3 m up the branch (the 2nd luminaire is 0.2 m off the branch end at 4000)  + drops 0 and 0.2
  ok(c2.routed && near(c2.metres, 1 + 6 + 3 + 0 + 0.2 + 2 * 0.5 + 1, 1e-6), 'C2: up the branch', String(c2.metres));
  const c3 = len.get('C3');
  ok(!c3.routed && c3.unreached.length === 1 && c3.reason === 'no-route', 'a device far from any route is not reached');
  // library items count as loads
  doc.change('lib', () => { doc.defineBlock({ name: 'LIB_OVEN_v1', base: { x: 0, y: 0 }, entities: [] }); doc.add({ type: 'insert', block: 'LIB_OVEN_v1', x: 8000, y: 1300, sx: 1, sy: 1, rot: 0, attrs: { 'CC-ITEM-NAME': 'Oven', 'CC-ELEC-KW': '3.5' } }); });
  model = M.scan(doc); inst = IN.installation(doc, model);
  const oven = inst.loads.find((l) => l.library);
  ok(oven && oven.watts === 3500 && !oven.circuit, 'a library item with CC-ELEC-KW is a 3500 W load');
  doc.change('a', () => IN.assignCircuit(doc, [oven], 'C1'));
  model = M.scan(doc); inst = IN.installation(doc, model);
  ok(inst.circuits.get('C1').watts === 4100 && doc.model.get(oven.id).attloc?.CIRCUIT, 'assigning it puts it on C1 (shown as an attribute of its own)');
  ok(IN.libraryLoad({ 'CC-ELEC-AMPS': '10', 'CC-ELEC-VOLTS': '400', 'CC-ELEC-PHASE': '3' }) > 6928 && IN.libraryLoad({ 'CC-ELEC-HP': '2' }) === 1492 && IN.libraryLoad({}) === null, 'library loads from amps × volts (three phase) and horsepower');
  // E.9 panel schedule
  const sched = PN.panelSchedule(inst, inst.boards[0], IN.cableLengths(doc, model, inst));
  ok(sched.rows[0].circuit === 'C1' && sched.rows[0].load === '4100 W' && sched.rows[0].breaker === '16 A B' && sched.rows[0].current === '17.8 A', 'panel schedule rows', JSON.stringify(sched.rows[0]));
  ok(sched.phases.L1 === 4420 && sched.phases.L2 === 0 && near(sched.phases.unbalance, 3), 'everything on L1: unbalance 300 %', JSON.stringify(sched.phases));
  // three-phase and two-phase loads
  ok(PN.phasesOf('3P').length === 3 && PN.phasesOf('L2L3').join() === 'L2,L3' && PN.phasesOf('x').join() === 'L1', 'phase values');
  const bal = PN.balancePhases([{ name: 'A', watts: 3000, phase: 'L1', def: {} }, { name: 'B', watts: 2000, phase: 'L1', def: {} }, { name: 'C', watts: 1500, phase: 'L1', def: {} }, { name: 'D', watts: 1400, phase: 'L1', def: {} }, { name: 'M', watts: 3000, phase: '3P', def: {} }]);
  ok(bal.get('A') === 'L1' && bal.get('B') === 'L2' && bal.get('C') === 'L3' && bal.get('D') === 'L3' && !bal.has('M'), 'balancing: heaviest first onto the lightest phase', JSON.stringify([...bal]));
  const after = PN.phaseLoads([{ watts: 3000, phase: 'L1' }, { watts: 2000, phase: 'L2' }, { watts: 2900, phase: 'L3' }, { watts: 3000, phase: '3P' }]);
  ok(after.L1 === 4000 && after.L2 === 3000 && after.L3 === 3900 && near(after.unbalance, 1000 / (10900 / 3)), 'phase loads with a three-phase circuit split over all three');
  doc.change('b', () => PN.applyPhases(doc, inst, new Map([['C2', 'L2']])));
  model = M.scan(doc); inst = IN.installation(doc, model);
  ok(inst.circuits.get('C2').phase === 'L2', 'the new phase is written on the circuit label');
  // E.10 checks
  const checks = CK.runChecks(doc, model);
  const codes = checks.map((c) => c.code);
  ok(codes.includes('overload') && checks.find((c) => c.code === 'overload').message === 'Circuit C1 draws 17.8 A on a 16 A breaker', 'overloaded circuit', JSON.stringify(checks.map((c) => c.message)));
  ok(codes.includes('no-circuit') && codes.includes('no-breaker'), 'a device on no circuit; a circuit with no breaker (C3 has no label)');
  void s1; void s2; void l1; void l2; void lost; void free;
}

section('E.10 checks on a schematic');
{
  const { doc, place, wire } = sheetDoc(1);
  place(0, 'coil', 50, 150, { TAG: '-K1' });
  place(0, 'coil', 100, 150, { TAG: '-K1' });
  place(0, 'contact.no', 150, 150, { TAG: '-K7' });
  place(0, 'contact.nc', 200, 150, {});
  place(0, 'plc.input', 250, 150, { TAG: '-A1', ADDR: 'I0.0' });
  place(0, 'plc.input', 270, 150, { TAG: '-A2', ADDR: 'i0.0' });
  place(0, 'terminal', 300, 150, { TAG: '-X1', P1: '1' });
  place(0, 'terminal', 310, 150, { TAG: '-X1', P1: '1' });
  place(0, 'lamp', 350, 150, {});
  wire(0, [[350, 170], [350, 130]]);   // through the lamp's pins
  wire(0, [[30, 250], [60, 250]]);    // open both ends
  const model = M.scan(doc);
  const r = CK.runChecks(doc, model);
  const has = (code, re) => r.some((c) => c.code === code && (!re || re.test(c.message)));
  ok(has('dup-tag', /=A1\+S1-K1 is used twice/), 'two coils with one tag', JSON.stringify(r.map((c) => c.message)));
  ok(has('no-coil', /-K7/), 'a contact with no coil');
  ok(has('no-tag', /Break contact \(NC\) has no tag/), 'a contact with no tag');
  ok(has('dup-addr', /I0\.0/), 'a PLC address used twice (case does not matter)');
  ok(has('dup-tag', /-X1:1 is used twice/), 'one terminal number twice in a strip');
  ok(has('through', /Signal lamp|:P1/) && r.filter((c) => c.code === 'through').length === 2, 'a wire through a symbol shorts it');
  ok(r.filter((c) => c.code === 'open-end').length >= 2, 'open wire ends');
  ok(has('no-contact', /-K1/), 'a coil with no contact drawn is a warning');
  ok(r.findIndex((c) => c.level === 'warning') > r.findLastIndex((c) => c.level === 'error'), 'errors come before warnings');
  ok(r.every((c) => c.at && c.at.space && Number.isFinite(c.at.x)), 'every finding says where it is');
  const clean = sampleSchematic();
  const rc = CK.runChecks(clean, M.scan(clean));
  ok(!rc.some((c) => c.level === 'error'), 'the sample schematic has no errors', JSON.stringify(rc.filter((c) => c.level === 'error').map((c) => c.message)));
  // a cable with more wires than cores
  const { doc: d2, cable } = withTerminals();
  d2.change('c', () => { const cur = d2.layouts[0].entities.get(cable.id); d2.update(cable.id, { ...cur, attrs: { ...cur.attrs, CORES: '2' } }, d2.layouts[0].entities); });
  ok(CK.runChecks(d2, M.scan(d2)).some((c) => c.code === 'cable-cores' && /carries 3 wires but has 2 cores/.test(c.message)), 'a cable with too few cores');
}

section('Attribute text stays upright');
{
  const S = await mine('lib/symbols.js');
  const IN = await mine('lib/install.js');
  const b = IN.installBlock('socket');
  ok(S.uprightAttloc(b, 0) === null && S.uprightAttloc(b, Math.PI / 2) === null, 'nothing to do at 0° and 90°');
  const up = S.uprightAttloc(b, Math.PI);
  ok(up && up.CIRCUIT && Math.abs(up.CIRCUIT.rot - Math.PI) < 1e-12 && up.CIRCUIT.ha === 'right' && up.CIRCUIT.va === 'top' && !up.LOAD, 'turned half round: the visible text gets its own place, turned back (invisible ones are left alone)');
  ok(S.uprightAttloc(S.symbolBlock('coil'), -Math.PI / 2 - 0.1)?.TAG, 'also just past 270°');
}
