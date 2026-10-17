#!/usr/bin/env node
/**
 * Test unitari di Keep_Watching: nessuna dipendenza, basta Node 18 o più recente.
 * Uso: node tests/run.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const results = { pass: 0, fail: 0 };
global.test = async (name, fn) => {
  try {
    await fn();
    results.pass++;
    console.log(`  ok   ${name}`);
  } catch (e) {
    results.fail++;
    console.log(`  FAIL ${name}\n       ${e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n       ') : e}`);
  }
};

(async () => {
  const dir = path.join(__dirname, 'unit');
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.test.js')).sort()) {
    console.log(`\n${file}`);
    const mod = require(path.join(dir, file));
    if (typeof mod === 'function') await mod();
  }
  console.log(`\n${results.pass} superati, ${results.fail} falliti`);
  process.exit(results.fail ? 1 : 0);
})();
