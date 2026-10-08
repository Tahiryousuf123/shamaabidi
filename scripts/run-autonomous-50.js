#!/usr/bin/env node
/**
 * Autonomous PhD Professor Outreach Runner
 * Thin wrapper delegating to the staged, queue-based pipeline.
 */

const { main } = require('./run-pipeline');

if (require.main === module) {
  main();
}

module.exports = { main };
