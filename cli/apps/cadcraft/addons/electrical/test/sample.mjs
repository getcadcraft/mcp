/* SPDX-License-Identifier: Apache-2.0 */
/**
 * sample.mjs — the public sample project (0.4 part 2, E.11): a direct-on-line motor starter on three schematic sheets and an
 * installation plan, built only through the add-on's modules, so it is ours to publish. Used by the Node tests and by
 * make-sample.mjs (which saves it as DWG and DXF for fixtures/electrical/).
 *
 *   Sheet 1  Power: L1 L2 L3 PE, -Q1 motor protection breaker, -K1 main contact, terminals -X1:1…4, cable -W1, motor -M1
 *   Sheet 2  Control: L+ / M rails, -F3 fuse, -S1 stop, -S2 start, -K1 hold-in contact, -K1 coil, -P1 "running" lamp, -Q1 aux
 *   Sheet 3  PLC: -A1 inputs (-S1 / -S2 contacts as feedback) and an output to -P2
 *   Model    Installation plan of a small workshop: board DB1, sockets, luminaires, a three-phase socket, routes; circuits C1–C4
 *   plus the reports (sheet list, terminal plan, cable list, parts list) on sheets of their own.
 */

export async function buildSample({ Doc, S, PJ, M, W, D, RP, IN, std = 'iec', reports = true }) {
  const doc = new Doc();
  doc.meta.name = 'Electrical sample';
  doc.meta.units = 'millimeters';
  const grid = (v) => Math.round(v / 2.5) * 2.5;
  const xp = (p, dx = 0) => grid(20 + 39 * (p - 0.5)) + dx;
  const sheets = [];
  const common = { PROJECT: 'Pump station P1', PLANT: 'PS1', LOC: 'CP1', DRAWN: 'CadCraft', DATE: '2026-10-13', REV: 'A' };
  doc.change('sheets', () => {
    for (const title of ['Power circuit', 'Control circuit', 'PLC']) sheets.push(PJ.addSheet(doc, { values: { ...common, TITLE: title } }));
  });
  const place = (sheet, key, x, y, attrs = {}, rot = 0) => {
    let e;
    doc.change('place', () => { const b = S.symbolBlock(key, std); S.ensureBlock(doc, b); e = doc.add({ type: 'insert', block: b.name, x, y, sx: 1, sy: 1, rot, layer: 'EL-SYMBOL', attrs: S.symbolAttrs(key, attrs) }, sheets[sheet].entities); });
    return e;
  };
  const wire = (sheet, pts, layer = 'EL-WIRE') => doc.change('wire', () => doc.add(pts.length === 2
    ? { type: 'line', x1: pts[0][0], y1: pts[0][1], x2: pts[1][0], y2: pts[1][1], layer }
    : { type: 'poly', closed: false, layer, pts: pts.map(([x, y]) => ({ x, y, b: 0 })) }, sheets[sheet].entities));
  const label = (sheet, x, y, s) => doc.change('label', () => doc.add({ type: 'text', x, y, h: 2.5, rot: 0, s, ha: 'right', va: 'middle', layer: 'EL-TEXT' }, sheets[sheet].entities));

  // ---- sheet 1: power
  const rails = [262.5, 255, 247.5];
  ['L1', 'L2', 'L3'].forEach((n, i) => { wire(0, [[30, rails[i]], [400, rails[i]]], 'EL-WIRE-L'); label(0, 28, rails[i], n); });
  wire(0, [[30, 240], [400, 240]], 'EL-WIRE-PE'); label(0, 28, 240, 'PE');
  const x = xp(3);
  place(0, 'breaker.motor', x, 220, { TAG: '-Q1', DESC: 'Motor protection 2.5–4 A', MFR: 'Volta', PART: 'MPB-4', ORDER: 'V-104-22' });
  place(0, 'contact.main.3p', x, 185, { TAG: '-K1' });
  [-5, 0, 5].forEach((dx, i) => {
    wire(0, [[x + dx, rails[i]], [x + dx, 225]]);
    wire(0, [[x + dx, 215], [x + dx, 190]]);
    place(0, 'terminal', x + dx, 140, { TAG: '-X1', P1: String(i + 1), MFR: 'Clampo', PART: 'TB-4' });
    wire(0, [[x + dx, 180], [x + dx, 142.5]]);
    wire(0, [[x + dx, 137.5], [x + dx, 100]]);
  });
  place(0, 'terminal', x + 15, 140, { TAG: '-X1', P1: '4', MFR: 'Clampo', PART: 'TB-4-PE' });
  wire(0, [[x + 15, 240], [x + 15, 142.5]]);
  place(0, 'motor.3ph', x, 90, { TAG: '-M1', DESC: 'Pump 1.5 kW', MFR: 'Motorworks', PART: 'MW-90L-4', ORDER: 'MW-1500-4' });
  doc.change('cable', () => { S.ensureBlock(doc, S.helperBlock('cable')); doc.add({ type: 'line', layer: 'EL-CABLE', x1: x - 9, y1: 117, x2: x + 12, y2: 123 }, sheets[0].entities); doc.add({ type: 'insert', block: 'EL_CABLE', x: x + 12, y: 123, sx: 1, sy: 1, rot: 0, layer: 'EL-CABLE', attrs: { TAG: '-W1', TYPE: 'H07RN-F 4G1.5', CORES: '4', LENGTH: '18', MFR: 'Cableco', PART: 'H07RN-4G1.5' } }, sheets[0].entities); });
  // the outgoing wires end on the motor's U V W (its pins are at y 100)

  // ---- sheet 2: control
  wire(1, [[30, 262.5], [400, 262.5]], 'EL-WIRE-24VDC'); label(1, 28, 262.5, 'L+');
  wire(1, [[30, 60], [400, 60]], 'EL-WIRE-0V'); label(1, 28, 60, 'M');
  const c = xp(2);
  place(1, 'fuse', c, 240, { TAG: '-F3', DESC: 'Control 2 A', MFR: 'Volta', PART: 'F-2A' });
  wire(1, [[c, 262.5], [c, 245]]);
  place(1, 'contact.no', c, 215, { TAG: '-Q1', P1: '13', P2: '14' });
  wire(1, [[c, 235], [c, 220]]);
  place(1, 'pushbutton.nc', c, 190, { TAG: '-S1', DESC: 'Stop', MFR: 'Volta', PART: 'PB-R-NC', ORDER: 'V-220-01' });
  wire(1, [[c, 210], [c, 195]]);
  place(1, 'pushbutton.no', c, 165, { TAG: '-S2', DESC: 'Start', MFR: 'Volta', PART: 'PB-G-NO', ORDER: 'V-220-10' });
  wire(1, [[c, 185], [c, 170]]);
  const c2 = xp(3);
  place(1, 'contact.no', c2, 165, { TAG: '-K1', P1: '13', P2: '14' });
  wire(1, [[c, 177.5], [c2, 177.5], [c2, 170]]);
  wire(1, [[c, 160], [c, 125]]);
  wire(1, [[c2, 160], [c2, 150], [c, 150]]);
  place(1, 'coil', c, 120, { TAG: '-K1', DESC: 'Pump contactor', MFR: 'Volta', PART: 'CT-9-24DC', ORDER: 'V-309-24' });
  wire(1, [[c, 115], [c, 60]]);
  const c3 = xp(5);
  place(1, 'contact.no', c3, 165, { TAG: '-K1', P1: '23', P2: '24' });
  wire(1, [[c3, 262.5], [c3, 170]]);
  place(1, 'lamp', c3, 120, { TAG: '-P1', DESC: 'Pump running', MFR: 'Volta', PART: 'PL-G-24' });
  wire(1, [[c3, 160], [c3, 125]]);
  wire(1, [[c3, 115], [c3, 60]]);

  // ---- sheet 3: PLC feedback
  const p = xp(2);
  place(2, 'contact.no', p, 215, { TAG: '-K1', P1: '33', P2: '34' });
  wire(2, [[p, 262.5], [p, 220]], 'EL-WIRE-24VDC');
  wire(2, [[30, 262.5], [400, 262.5]], 'EL-WIRE-24VDC'); label(2, 28, 262.5, 'L+');
  place(2, 'plc.input', p, 180, { TAG: '-A1', ADDR: 'I0.0', DESC: 'Pump running', MFR: 'Logix', PART: 'DI-16' });
  wire(2, [[p, 210], [p, 185]]);
  const q = xp(4);
  place(2, 'plc.output', q, 220, { TAG: '-A1', ADDR: 'Q0.0', DESC: 'Pump fault' });
  place(2, 'lamp', q, 180, { TAG: '-P2', DESC: 'Pump fault', MFR: 'Volta', PART: 'PL-R-24' });
  wire(2, [[q, 215], [q, 185]]);
  wire(2, [[q, 175], [q, 60]]);
  wire(2, [[30, 60], [400, 60]], 'EL-WIRE-0V'); label(2, 28, 60, 'M');

  // tags, numbers, dots, cross-references
  let m = M.scan(doc);
  doc.change('tag', () => D.autoTag(doc, m));
  m = M.scan(doc);
  doc.change('numbers', () => { const nl = W.netlist(m); W.updateDots(doc, m, nl); W.numberWires(doc, m, nl); });
  m = M.scan(doc);
  doc.change('xref', () => D.updateXrefs(doc, m));

  // ---- installation plan (model space, millimetres, 1:50 symbols)
  const sc = 50;
  const put = (key, px, py, attrs = {}, rot = 0) => doc.change('install', () => { const b = IN.installBlock(key); S.ensureBlock(doc, b); const up = S.uprightAttloc(b, rot); doc.add({ type: 'insert', block: IN.installBlockName(key), x: px, y: py, sx: sc, sy: sc, rot, layer: 'EL-INSTALL', attrs: IN.installAttrs(key, attrs), ...(up ? { attloc: up } : {}) }); });
  // the room: 12 m × 8 m
  doc.change('walls', () => doc.add({ type: 'poly', closed: true, layer: 'A-WALL', pts: [[0, 0], [12000, 0], [12000, 8000], [0, 8000]].map(([a, b]) => ({ x: a, y: b, b: 0 })) }));
  put('board', 300, 4000, { TAG: 'DB1', DESC: 'Workshop board', VOLTAGE: '230' }, Math.PI / 2);
  const route = (pts) => doc.change('route', () => doc.add({ type: 'poly', closed: false, layer: 'EL-ROUTE', pts: pts.map(([a, b]) => ({ x: a, y: b, b: 0 })) }));
  route([[300, 4000], [300, 7700], [11700, 7700], [11700, 300], [300, 300], [300, 4000]]);   // a tray round the room
  route([[6000, 7700], [6000, 1000]]);                                                       // down the middle for the lights
  for (const [px, py] of [[2000, 7800], [5000, 7800], [9000, 7800]]) put('socket.earth', px, py, { CIRCUIT: 'C1' }, Math.PI);
  for (const [px, py] of [[2000, 200], [5000, 200], [9000, 200]]) put('socket.double', px, py, { CIRCUIT: 'C2' });
  for (const py of [1500, 4000, 6500]) put('luminaire.linear', 6000, py, { CIRCUIT: 'C3', LOAD: '58' });
  put('switch', 600, 3500, { CIRCUIT: 'C3' });
  put('socket.3ph', 11800, 4000, { CIRCUIT: 'C4', LOAD: '7500', DESC: 'Compressor' }, Math.PI / 2);
  doc.change('circuits', () => {
    const def = (n, y, v) => IN.defineCircuit(doc, doc.model, { x: -3000, y }, { CIRCUIT: n, BOARD: 'DB1', ...v }, sc);
    def('C1', 5000, { DESC: 'Sockets north', BREAKER: '16', PHASE: 'L1', CABLE: 'NYM-J 3x2.5' });
    def('C2', 4500, { DESC: 'Sockets south', BREAKER: '16', PHASE: 'L1', CABLE: 'NYM-J 3x2.5' });
    def('C3', 4000, { DESC: 'Lights', BREAKER: '10', PHASE: 'L2', CABLE: 'NYM-J 3x1.5' });
    def('C4', 3500, { DESC: 'Compressor', BREAKER: '16', CURVE: 'C', PHASE: '3P', VOLTAGE: '400', PF: '0.85', CABLE: 'NYM-J 5x2.5' });
  });

  if (reports) {
    m = M.scan(doc);
    doc.change('reports', () => {
      for (const r of [RP.sheetList(m), RP.terminalPlan(m), RP.cableList(m), RP.partsList(m)]) RP.addReportSheets(doc, r, { values: common });
    });
  }
  doc.markSaved();
  return doc;
}

/** What the sample must say (the Node test checks it; facts.json gets the same numbers). */
export const SAMPLE_FACTS = {
  schematicSheets: 3,
  reportSheets: 4,
  devicesAtLeast: 19,
  coilK1Mirror: ['NO 1-2 /1.3', 'NO 3-4 /1.3', 'NO 5-6 /1.3', 'NO 13-14 /2.3', 'NO 23-24 /2.5', 'NO 33-34 /3.2'],
  circuits: { C1: 600, C2: 1200, C3: 174, C4: 7500 },
};
