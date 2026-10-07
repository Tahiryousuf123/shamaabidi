try {
  process.loadEnvFile('.env.local');
} catch {}

import { checkDuplicate } from '../lib/auto-find';

async function check() {
  const d1 = await checkDuplicate(
    'https://openalex.org/A5042456488',
    null,
    '0000-0002-8610-8636',
    'Courtney Ierano',
    'The Royal Melbourne Hospital Guidance Group'
  );
  console.log('Courtney Ierano dup check:', d1);

  const d2 = await checkDuplicate(
    'https://openalex.org/A5038001994',
    'optimas-gp@uow.edu.au',
    '0000-0003-2477-1646',
    'Andrew Bonney',
    'University of Wollongong'
  );
  console.log('Andrew Bonney dup check:', d2);
}

check().catch(console.error);
