/* SPDX-License-Identifier: Apache-2.0 */
// Part of test.mjs: AP.5 the grade rule library — named rules, applied across size ranges and units, JSON and RUL in and out,
// untrusted files; GRADERULE at the command line.
const { ok, section, near, mine, CORPUS } = globalThis.__apTest;
import fs from 'node:fs';
import path from 'node:path';
const R = await mine('lib/rules.js');
const A = await mine('lib/aama.js');

section('AP.5 grade rule library (rules.js)');
const shoulder = R.cleanEntry({ name: 'shoulder +0.3 cm', u: 'mm', sizes: ['S', 'M', 'L'], base: 'M', rule: [-3, 0, 0, 0, 3, 1] });
ok(shoulder && shoulder.rule.join() === '-3,0,0,0,3,1', 'an entry: name, units, size range, base, rule');
ok(R.cleanEntry({ name: '', sizes: ['S'], rule: [0, 0] }) === null && R.cleanEntry({ name: 'x', sizes: ['S', 'M'], rule: [1] }) === null && R.cleanEntry({ name: 'x', sizes: ['S', 'M'], rule: [1, 'a', 2, 3] }) === null, 'refused: no name, wrong length, not numbers');
ok(R.cleanEntry({ name: 'x', sizes: ['S', 'M'], base: 'M', rule: [1, 2, 9, 9] }).rule.join() === '1,2,0,0', 'the base size never moves');
// the same rule on a piece with sizes XS S M L XL, base M: S and L as saved, XS and XL not in the rule → stay at the base
ok(R.ruleFor(shoulder, { list: ['XS', 'S', 'M', 'L', 'XL'], base: 'M' }, 'mm').join() === '0,0,-3,0,0,0,3,1,0,0', 'applied to another size range: matched by size name');
ok(R.ruleFor(shoulder, { list: ['S', 'M', 'L'], base: 'L' }, 'mm').join() === '-6,-1,-3,-1,0,0', 'another base: measured again from it');
ok(R.ruleFor(shoulder, { list: ['S', 'M', 'L'], base: 'M' }, 'in').map((v) => +v.toFixed(4)).join() === '-0.1181,0,0,0,0.1181,0.0394', 'in a drawing in inches: converted');
const lib = R.addEntry(R.addEntry([], shoulder), R.cleanEntry({ name: 'Side seam', u: 'mm', sizes: ['S', 'M', 'L'], base: 'M', rule: [-5, 0, 0, 0, 5, 0] }));
R.addEntry(lib, R.cleanEntry({ name: 'SHOULDER +0.3 CM', u: 'mm', sizes: ['S', 'M', 'L'], base: 'M', rule: [-4, 0, 0, 0, 4, 0] }));
ok(lib.length === 2 && lib[0].rule[0] === -4, 'saving under a name already there replaces it (case-insensitive)');
const back = R.fromJson(R.toJson(lib));
ok(!back.error && JSON.stringify(back.entries) === JSON.stringify(lib), 'JSON out and back in');
ok(R.fromJson('nope').error === 'json' && R.fromJson('{"format":"other","rules":[]}').error === 'format' && R.fromJson(JSON.stringify({ format: R.FORMAT, version: 9, rules: [] })).error === 'newer', 'refused: not JSON, another format, a newer version');
ok(R.fromJson(JSON.stringify({ format: R.FORMAT, version: 1, rules: [{ name: 'ok', sizes: ['S'], rule: [0, 0] }, { evil: true }, 7] })).entries.length === 1, 'bad entries in a file are dropped');
const rul = R.toRul([...lib, R.cleanEntry({ name: 'odd', u: 'mm', sizes: ['1', '2'], base: '1', rule: [0, 0, 1, 1] })], { name: 'Blouse' });
const parsed = A.parseRul(rul.text);
ok(rul.written.length === 2 && rul.left === 1 && parsed.sizes.join() === 'S,M,L' && parsed.sample === 'M' && JSON.stringify(parsed.rules.get(2)) === '[[-5,0],[0,0],[5,0]]', 'a RUL file: the rules sharing one size range (one left out, said)');
const fromR = R.fromRul(rul.text, 'Blouse');
ok(fromR.length === 2 && fromR[0].name === 'Blouse 1' && fromR[1].rule.join() === '-5,0,0,0,5,0', 'a RUL file read into the library: one entry per rule');
if (fs.existsSync(path.join(CORPUS, 'tfm/S350.rul'))) {
  const rich = R.fromRul(fs.readFileSync(path.join(CORPUS, 'tfm/S350.rul'), 'latin1'), 'S350');
  ok(rich.length > 20 && rich.every((e) => e.u === 'in' && e.sizes.length === 9 && e.base === 'L'), 'Richpeace\'s RUL into the library: ' + rich.length + ' rules in inches, base L');
}

section('GRADERULE at the command line');
{
  const { harness, startWith, memStorage } = await import('./t-addon.mjs');
  const h = harness();
  const st = await startWith(h, memStorage());
  await st.loader.setEnabled('apparel', true);
  const { doc, host, type, log } = h;
  const dataOf = (id) => st.kinds.info(doc.get(id))?.data;
  const mk = async (x0, name) => { await type('RECTANG', x0 + ',0', (x0 + 200) + ',300'); const r = doc.all().find((e) => e.type === 'poly'); host.setSelection(new Set([r.id])); await type('PIECE', 'N', name); return doc.all().find((e) => dataOf(e.id)?.name === name); };
  const a = await mk(0, 'Front'), b = await mk(400, 'Back');
  host.setSelection(new Set([a.id])); await type('GRADE', 'S', 'S M L', 'M', '200,300', '3,2', '');
  host.setSelection(new Set([b.id])); await type('GRADE', 'S', 'XS S M L XL', 'M', '');
  host.setSelection(new Set([a.id])); await type('GRADERULE', 'S', '200,300', 'Shoulder');
  ok(log.some((l) => /Saved the rule "Shoulder"/.test(l)), 'GRADERULE Save: a point\'s rule saved by name', log.slice(-2).join(' | '));
  host.setSelection(new Set()); await type('GRADERULE', 'L');
  ok(log.some((l) => /^Shoulder: sizes S M L, base M \(mm\)/.test(l)), 'List');
  host.setSelection(new Set([b.id])); await type('GRADERULE', 'A', 'shoulder', '600,300', '400,300', '');
  const g = dataOf(b.id).grades;
  ok(g.p2 && g.p2.join() === '0,0,-3,-2,0,0,3,2,0,0' && g.p3 && g.p3.join() === g.p2.join(), 'Apply: the rule on two points of a piece with XS–XL (XS and XL stay)', JSON.stringify(g));
  host.setSelection(new Set()); await type('GRADERULE', 'R', 'Shoulder');
  ok(log.some((l) => /Removed "Shoulder"/.test(l)), 'Remove');
}
