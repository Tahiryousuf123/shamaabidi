/**
 * Automated 50 PhD Professor Daily Discovery Runner
 * Run manually or via Task Scheduler / Cron at 12:00 AM PKT:
 * npm run find-50 OR node scripts/run-daily-50.js
 */

const path = require('path');

// Delegate directly to the autonomous 50 real professor discovery engine
require(path.join(__dirname, 'run-autonomous-50.js'));
