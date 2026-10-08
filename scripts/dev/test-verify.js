const { verifyCandidateEmail } = require('../pipeline/stage3-verify');

const testCases = [
  {
    label: 'Generic role prefix (info@)',
    email: 'info@harvard.edu',
    candidate: { name: 'Dr. John Harvard', institution: 'Harvard University' },
    expectedValid: false,
    expectedReasonSubstr: 'generic_role_prefix',
  },
  {
    label: 'Generic role prefix (noreply@)',
    email: 'noreply@ox.ac.uk',
    candidate: { name: 'Dr. Oxford Researcher', institution: 'University of Oxford' },
    expectedValid: false,
    expectedReasonSubstr: 'generic_role_prefix',
  },
  {
    label: 'Generic role prefix (support@)',
    email: 'support@stanford.edu',
    candidate: { name: 'Dr. Jane Stanford', institution: 'Stanford University' },
    expectedValid: false,
    expectedReasonSubstr: 'generic_role_prefix',
  },
  {
    label: 'Disposable domain (mailinator.com)',
    email: 'x@mailinator.com',
    candidate: { name: 'Dr. Fake Person', institution: 'Fake Institute' },
    expectedValid: false,
    expectedReasonSubstr: 'disposable_domain',
  },
  {
    label: 'Non-existent domain (no MX records)',
    email: 'a@no-such-domain-xyz-123.com',
    candidate: { name: 'Dr. Missing Domain', institution: 'Unknown' },
    expectedValid: false,
    expectedReasonSubstr: 'no_mx_records',
  },
  {
    label: 'Image asset extension (logo@2x.png)',
    email: 'logo@2x.png',
    candidate: { name: 'Asset Graphic', institution: 'Unknown' },
    expectedValid: false,
    expectedReasonSubstr: 'image_asset_extension',
  },
  {
    label: 'Invalid syntax (missing @ or domain)',
    email: 'not-an-email-address',
    candidate: { name: 'Bad Syntax', institution: 'Unknown' },
    expectedValid: false,
    expectedReasonSubstr: 'invalid_syntax',
  },
  {
    label: 'Valid academic email (pusan.ac.kr)',
    email: 'socioliberal@pusan.ac.kr',
    candidate: { name: 'J. I. Yi', institution: 'Pusan National University Hospital', ownerAffiliation: 'Pusan National University Hospital' },
    expectedValid: true,
  },
  {
    label: 'Valid academic email (musc.edu)',
    email: 'mediwala@musc.edu',
    candidate: { name: 'Krutika Mediwala Hornback', institution: 'Medical University of South Carolina', ownerAffiliation: 'Medical University of South Carolina' },
    expectedValid: true,
  },
];

async function runUnitTests() {
  console.log('================================================================');
  console.log('🧪 STAGE 3 EMAIL VERIFICATION UNIT TEST SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;
  const results = [];

  for (const tc of testCases) {
    const res = await verifyCandidateEmail(tc.email, tc.candidate);
    let ok = false;

    if (tc.expectedValid) {
      ok = res.valid === true && res.hardReject === false;
    } else {
      ok = res.valid === false && res.hardReject === true && res.reason.includes(tc.expectedReasonSubstr);
    }

    if (ok) {
      passed++;
      results.push({
        Test: tc.label,
        Email: tc.email,
        Result: 'PASS',
        Reason: res.reason || (res.needsReview ? `NEEDS_REVIEW: ${res.reviewReason}` : 'VERIFIED'),
      });
    } else {
      failed++;
      results.push({
        Test: tc.label,
        Email: tc.email,
        Result: 'FAIL',
        Reason: res.reason || 'Unexpected result',
      });
    }
  }

  console.table(results);
  console.log(`\nSummary: ${passed}/${testCases.length} Passed, ${failed} Failed.`);

  if (failed > 0) {
    process.exit(1);
  }
}

runUnitTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
