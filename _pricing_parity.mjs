import fs from 'node:fs';
import * as P from './_pricing.mjs';
const inp = JSON.parse(fs.readFileSync(0, 'utf8'));
const out = inp.cases.map(c => P.nbaPayout(inp.pricing, c.app, c.mode, c.legs.map(l => ({ leg_factor: l.factor })), c.legs.map(l => !!l.hit)));
process.stdout.write(JSON.stringify(out));
