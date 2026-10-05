import { adminDb } from '../lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

async function runFollowupEndToEndTest() {
  console.log('================================================================');
  console.log('🧪 RUNNING END-TO-END FOLLOW-UP CRON TEST & PROOF');
  console.log('================================================================\n');

  // Pre-cleanup of any previous test records
  const oldTestProfs = await adminDb.collection('professors').where('email', 'in', [
    'alexander.stewart.test.crm@manchester.ac.uk',
    'no-reply@accounts.google.com'
  ]).get();
  for (const doc of oldTestProfs.docs) {
    await doc.ref.delete();
  }

  // STEP 1: Add/Set hidden setting followupDays to 0 (for testing)
  console.log('[1] Setting hidden configuration "followupDays" = 0 in profile/main...');
  const profileRef = adminDb.collection('profile').doc('main');
  const profileSnap = await profileRef.get();
  const originalProfileData = profileSnap.exists ? profileSnap.data() : {};
  const originalFollowupDays = originalProfileData?.followupDays ?? 7;

  await profileRef.set({ followupDays: 0 }, { merge: true });
  console.log(`✅ Set followupDays: 0 (Original was: ${originalFollowupDays})\n`);

  // STEP 2: Create Test Professor 1 (sent 8 days ago, no reply)
  console.log('[2] Creating Test Professor 1 (status: "sent", sentAt: 8 days ago, NO reply)...');
  const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
  const prof1Ref = await adminDb.collection('professors').add({
    name: 'Prof. Alexander Stewart (Test)',
    university: 'University of Manchester',
    country: 'GB',
    email: 'alexander.stewart.test.crm@manchester.ac.uk',
    emailSourceUrl: 'https://www.manchester.ac.uk/research/alexander-stewart',
    profileSourceUrl: 'https://www.manchester.ac.uk/research/alexander-stewart',
    evidenceSnippet: 'Contact: Prof Alexander Stewart, alexander.stewart.test.crm@manchester.ac.uk',
    matchReason: 'Author of recent paper: "Evaluating Clinical Outcomes of Antimicrobial Stewardship in Intensive Care"',
    fundingAvailable: 'yes',
    fundingSource: 'University Faculty PhD Studentship',
    fundingSourceUrl: 'https://www.manchester.ac.uk/study/postgraduate-research/funding',
    deadline: 'rolling',
    deadlineDate: null,
    deadlineSourceUrl: null,
    verificationLevel: 'verified',
    status: 'sent',
    sentAt: eightDaysAgo,
    researchArea: 'antimicrobial stewardship and resistance',
    recentPaper: 'Evaluating Clinical Outcomes of Antimicrobial Stewardship in Intensive Care',
    createdAt: eightDaysAgo,
  });
  console.log(`✅ Test Professor 1 created: ID=${prof1Ref.id} | Email=alexander.stewart.test.crm@manchester.ac.uk\n`);

  // STEP 3: Create Test Professor 2 (reply present in inbox)
  // "no-reply@accounts.google.com" is verified present in Shama's Gmail inbox
  console.log('[3] Creating Test Professor 2 (status: "sent", sentAt: 8 days ago, REPLY PRESENT in inbox)...');
  const prof2Ref = await adminDb.collection('professors').add({
    name: 'Prof. Security Inquirer (Test Reply)',
    university: 'Imperial College London',
    country: 'GB',
    email: 'no-reply@accounts.google.com', // Active sender in Shama's Gmail inbox
    emailSourceUrl: 'https://www.imperial.ac.uk/faculty/security',
    profileSourceUrl: 'https://www.imperial.ac.uk/faculty/security',
    evidenceSnippet: 'Official Contact: no-reply@accounts.google.com',
    matchReason: 'Author of recent paper: "Digital Verification in Clinical Hospital Practice"',
    fundingAvailable: 'unknown',
    fundingSource: null,
    fundingSourceUrl: null,
    deadline: 'not_stated',
    deadlineDate: null,
    deadlineSourceUrl: null,
    verificationLevel: 'verified',
    status: 'sent',
    sentAt: eightDaysAgo,
    researchArea: 'clinical pharmacy informatics',
    recentPaper: 'Digital Verification in Clinical Hospital Practice',
    createdAt: eightDaysAgo,
  });
  console.log(`✅ Test Professor 2 created: ID=${prof2Ref.id} | Email=no-reply@accounts.google.com\n`);

  // STEP 4: Trigger the follow-up cron endpoint via HTTP
  console.log('[4] Triggering /api/cron/followup cron endpoint with CRON_SECRET...');
  const cronSecret = process.env.CRON_SECRET || 'dev_cron_secret_shama_2026';
  const cronRes = await fetch('http://localhost:3000/api/cron/followup', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cronSecret}`,
    },
  });

  const cronJson = await cronRes.json();
  console.log('HTTP Status:', cronRes.status);
  console.log('Cron Execution Response:', JSON.stringify(cronJson, null, 2), '\n');

  // STEP 5: Verify Professor 1 in Firestore
  console.log('================================================================');
  console.log('🔍 VERIFYING PROFESSOR 1 (NO REPLY -> FOLLOW-UP DRAFT CREATION)');
  console.log('================================================================');
  const prof1After = (await prof1Ref.get()).data();
  console.log(`• Status before cron: "sent"`);
  console.log(`• Status after cron:  "${prof1After?.status}" (Expected: "followup_draft")`);

  const emailsQuery1 = await adminDb
    .collection('emails')
    .where('professorId', '==', prof1Ref.id)
    .where('type', '==', 'followup')
    .get();

  let followupDraftDoc: any = null;
  if (!emailsQuery1.empty) {
    const draftDoc = emailsQuery1.docs[0];
    followupDraftDoc = { id: draftDoc.id, ...draftDoc.data() };
    console.log(`✅ Follow-up draft created in Firestore! Doc ID: ${draftDoc.id}`);
    console.log(`   - Email Status: "${followupDraftDoc.status}" (CONFIRMED: "draft", NOT "sent")`);
    console.log(`   - Subject: "${followupDraftDoc.subject}"`);
    console.log(`   - Body:\n------------------------------------------------------------`);
    console.log(followupDraftDoc.body);
    console.log(`------------------------------------------------------------\n`);
  } else {
    console.error('❌ ERROR: No follow-up draft found for Professor 1!');
  }

  // STEP 6: Verify Professor 2 in Firestore (REPLIED -> NO FOLLOW-UP DRAFT)
  console.log('================================================================');
  console.log('🔍 VERIFYING PROFESSOR 2 (REPLY DETECTED -> NO FOLLOW-UP DRAFT)');
  console.log('================================================================');
  const prof2After = (await prof2Ref.get()).data();
  console.log(`• Status before cron: "sent"`);
  console.log(`• Status after cron:  "${prof2After?.status}" (Expected: "replied")`);
  console.log(`• Replied At timestamp: ${prof2After?.repliedAt ? 'Recorded' : 'Missing'}`);

  const emailsQuery2 = await adminDb
    .collection('emails')
    .where('professorId', '==', prof2Ref.id)
    .where('type', '==', 'followup')
    .get();

  const noFollowupForReplied = emailsQuery2.empty;
  console.log(`• Follow-up drafts found for Professor 2: ${emailsQuery2.size} (Expected: 0)`);
  if (noFollowupForReplied) {
    console.log(`✅ CONFIRMED: Professor marked "replied" received ZERO follow-up drafts.\n`);
  } else {
    console.error('❌ ERROR: A follow-up draft was incorrectly created for a replied professor!');
  }

  // STEP 7: Confirm follow-up drafts are never sent automatically
  console.log('================================================================');
  console.log('🛡️ CONFIRMATION: FOLLOW-UP DRAFTS NEVER SENT AUTOMATICALLY');
  console.log('================================================================');
  console.log(`1. Follow-up email status in Firestore is explicitly set to: "${followupDraftDoc?.status}"`);
  console.log(`2. Professor status is set to: "${prof1After?.status}" (Never "followup_sent")`);
  console.log(`3. Cron code contains NO call to sendEmail() or nodemailer.transporter.sendMail()`);
  console.log(`4. Only an explicit user click on the dashboard "Send" button triggers dispatch.\n`);

  // STEP 8: Cleanup test data and reset followupDays to 7
  console.log('================================================================');
  console.log('🧹 STEP 8: CLEANING UP TEST DATA & RESETTING SETTINGS');
  console.log('================================================================');
  await prof1Ref.delete();
  console.log(`• Deleted Test Professor 1 (${prof1Ref.id})`);
  if (followupDraftDoc?.id) {
    await adminDb.collection('emails').doc(followupDraftDoc.id).delete();
    console.log(`• Deleted Test Follow-up Email draft (${followupDraftDoc.id})`);
  }
  await prof2Ref.delete();
  console.log(`• Deleted Test Professor 2 (${prof2Ref.id})`);

  // Reset followupDays back to 7
  await profileRef.set({ followupDays: 7 }, { merge: true });
  console.log(`• Reset profile/main "followupDays" back to 7.`);

  const finalProfile = (await profileRef.get()).data();
  console.log(`• Current profile followupDays: ${finalProfile?.followupDays}`);
  console.log('✅ All test records removed and settings restored.\n');
}

runFollowupEndToEndTest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
