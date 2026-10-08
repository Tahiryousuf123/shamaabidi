#!/usr/bin/env node
/**
 * Automated Daily PhD Professor Discovery Runner
 * Run manually or via npm run find-50:
 * npm run find-50 OR node scripts/run-daily-50.js
 */

const { main } = require('./run-pipeline');

if (require.main === module) {
  main();
}

module.exports = { main };
