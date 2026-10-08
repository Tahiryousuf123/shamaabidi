const { SENDER_SIGNATURE } = require('../pipeline/config');

const brokenDrafts = [
  {
    name: 'Zhang/Moutai',
    candidate: {
      name: 'Hua Zhang',
      paperTitle: 'A bibliometric analysis of the application trends of information technology in antimicrobial stewardship within hospitals',
      abstract: 'Information technology in antimicrobial stewardship hospital clinical practice.',
      year: 2024,
    },
    salutation: 'Dear Dr. Zhang,',
    subject: 'PhD Research Inquiry: A bibliometric analysis of the application trends  – Dr. Shama Abidi',
    body: `Dear Dr. Zhang,

I am writing to respectfully inquire about PhD research opportunities at Moutai Institute. I recently read with great interest your publication, "A bibliometric analysis of the application trends of information technology in antimicrobial stewardship within hospitals".

Your paper's focus on a bibliometric analysis of the application tr directly connects with my research on clinical pharmacy interventions and health services implementation. With over 17 years of clinical pharmacy practice at Liaquat National Hospital and an MPhil in Pharmacy Practice, my research includes prospective hospital trials on antimicrobial stewardship (evaluating carbapenem de-escalation and microbiological concordance [Ali et al., 2022]), medication safety [Baig et al., 2025], and cardiovascular pharmacotherapy [Abidi et al., 2024]. Given our aligned focus on antimicrobial stewardship, I would welcome the opportunity to discuss prospective PhD openings. My academic CV is attached for your review.

If this is not relevant to your work, just let me know and I will not write again.

Sincerely,
Dr. Shama Abidi, MPhil, PharmD, RPh
Senior Clinical Pharmacist, Liaquat National Hospital, Karachi`,
  },
  {
    name: 'Kolozsvári/Debrecen',
    candidate: {
      name: 'László Róbert Kolozsvári',
      paperTitle: 'Between Patient Pressure and Professional Responsibility: Antibiotic Prescribing Practices in Primary Care',
      abstract: 'Antibiotic prescribing in primary care clinical pharmacy practice.',
      year: 2024,
    },
    salutation: 'Dear Dr. Kolozsvári,',
    subject: 'PhD Research Inquiry: Between Patient Pressure and Professional Responsi – Dr. Shama Abidi',
    body: `Dear Dr. Kolozsvári,

I am writing to respectfully inquire about PhD research opportunities at University of Debrecen. I recently read with great interest your publication, "Between Patient Pressure and Professional Responsibility: Antibiotic Prescribing Practices in Primary Care".

Your paper's focus on between patient pressure and professional res directly connects with my research on clinical pharmacy interventions and health services implementation. With over 17 years of clinical pharmacy practice at Liaquat National Hospital and an MPhil in Pharmacy Practice, my research includes prospective hospital trials on antimicrobial stewardship (evaluating carbapenem de-escalation and microbiological concordance [Ali et al., 2022]), medication safety [Baig et al., 2025], and cardiovascular pharmacotherapy [Abidi et al., 2024]. Given our aligned focus on antibiotic prescribing, I would welcome the opportunity to discuss prospective PhD openings. My academic CV is attached for your review.

If this is not relevant to your work, just let me know and I will not write again.

Sincerely,
Dr. Shama Abidi, MPhil, PharmD, RPh
Senior Clinical Pharmacist, Liaquat National Hospital, Karachi`,
  },
  {
    name: 'Arya/UPenn',
    candidate: {
      name: 'Lily A. Arya',
      paperTitle: 'Development and implementation of a nurse-led clinical decision support tool for urinary tract infection',
      abstract: 'Clinical decision support for urinary tract infection.',
      year: 2023,
    },
    salutation: 'Dear Dr. Arya,',
    subject: 'PhD Research Inquiry: Development and implementation of a nurse-led clin – Dr. Shama Abidi',
    body: `Dear Dr. Arya,

I am writing to respectfully inquire about PhD research opportunities at University of Pennsylvania. I recently read with great interest your publication, "Development and implementation of a nurse-led clinical decision support tool for urinary tract infection".

Your paper's focus on development and implementation of a nurse-led directly connects with my research on clinical pharmacy interventions and health services implementation. With over 17 years of clinical pharmacy practice at Liaquat National Hospital and an MPhil in Pharmacy Practice, my research includes prospective hospital trials on antimicrobial stewardship (evaluating carbapenem de-escalation and microbiological concordance [Ali et al., 2022]), medication safety [Baig et al., 2025], and cardiovascular pharmacotherapy [Abidi et al., 2024]. Given our aligned focus on antibiotic prescribing, I would welcome the opportunity to discuss prospective PhD openings. My academic CV is attached for your review.

If this is not relevant to your work, just let me know and I will not write again.

Sincerely,
Dr. Shama Abidi, MPhil, PharmD, RPh
Senior Clinical Pharmacist, Liaquat National Hospital, Karachi`,
  },
];

function validateEmailDraft(emailText, candidate, fullSalutation, signature, subject = '') {
  const errors = [];
  const cleanPaperTitle = (candidate.paperTitle || candidate.recentWorkTitles?.[0] || '').trim().replace(/[.,;:\s]+$/, '');

  // 1. Signature untouched
  if (!emailText.endsWith(signature.trim())) {
    errors.push('Signature does not match constant SENDER_SIGNATURE or was modified.');
  }

  // 2. Salutation correct
  if (!emailText.startsWith(fullSalutation.trim())) {
    errors.push(`Salutation does not start with expected: "${fullSalutation.trim()}".`);
  }

  let bodyWithoutEnds = emailText;
  if (bodyWithoutEnds.startsWith(fullSalutation.trim())) {
    bodyWithoutEnds = bodyWithoutEnds.slice(fullSalutation.trim().length);
  }
  if (bodyWithoutEnds.endsWith(signature.trim())) {
    bodyWithoutEnds = bodyWithoutEnds.slice(0, -signature.trim().length);
  }
  bodyWithoutEnds = bodyWithoutEnds.trim();

  // 3. Opt-out sentence present
  const optOutText = 'If this is not relevant to your work, just let me know and I will not write again.';
  if (!bodyWithoutEnds.includes(optOutText)) {
    errors.push(`Missing required opt-out line: "${optOutText}".`);
  }

  // 4. Exact stored title present once
  if (cleanPaperTitle) {
    const escaped = cleanPaperTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = bodyWithoutEnds.match(new RegExp(escaped, 'gi')) || [];
    if (matches.length === 0) {
      errors.push(`Exact paper title "${cleanPaperTitle}" not found in email.`);
    } else if (matches.length > 1) {
      errors.push(`Exact paper title "${cleanPaperTitle}" appears more than once (${matches.length} times).`);
    }
  }

  // 5. Word count: 130 - 170 words total
  const totalWords = emailText.split(/\s+/).filter(Boolean).length;
  if (totalWords < 130 || totalWords > 170) {
    errors.push(`Total email word count (${totalWords}) is outside required 130-170 range.`);
  }

  // 6. Subject line checks
  if (subject) {
    if (subject.length > 90) {
      errors.push(`Subject line is too long (${subject.length} chars > 90 max).`);
    }
    if (/\b(in|for|of|and|the|a|an|to|with|at|on|cr|tr|res|clin)\s*$/i.test(subject) || /[a-zA-Z]–\s*$/.test(subject)) {
      errors.push('Subject line ends mid-word or with an incomplete preposition.');
    }
  }

  // 7. Check if body contains any 4+ word substring of the title other than the full quoted title
  if (cleanPaperTitle && cleanPaperTitle.length > 15) {
    const titleWords = cleanPaperTitle.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
    if (titleWords.length >= 4) {
      const escaped = cleanPaperTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const quoteRegex = new RegExp(`["']\\s*${escaped}[,.]?\\s*["']`, 'gi');
      const bodyWithoutTitle = bodyWithoutEnds.replace(quoteRegex, ' ');
      const bodyNorm = bodyWithoutTitle.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');

      for (let i = 0; i <= titleWords.length - 4; i++) {
        const fourWords = titleWords.slice(i, i + 4).join(' ');
        if (bodyNorm.includes(` ${fourWords} `)) {
          errors.push(`Body contains unauthorized 4+ word title substring fragment: "${fourWords}".`);
          break;
        }
      }
    }
  }

  // 8. Sentence ending check: check that sentences don't end mid-word or with truncated words
  const sentences = bodyWithoutEnds.split(/[.!?]\s+/);
  for (const s of sentences) {
    const trimmed = s.trim();
    if (trimmed && /\b(in|for|of|and|the|a|an|to|with|at|on|cr|tr|res|clin)$/i.test(trimmed)) {
      errors.push(`Sentence ends with an incomplete or cut-off word: "...${trimmed.slice(-25)}"`);
      break;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    totalWords,
  };
}

console.log('Testing Validator on the 3 Broken Drafts from Previous Run:\n');

for (const d of brokenDrafts) {
  console.log(`=== Testing ${d.name} ===`);
  const res = validateEmailDraft(d.body, d.candidate, d.salutation, SENDER_SIGNATURE, d.subject);
  console.log('Valid:', res.valid);
  console.log('Errors caught:');
  res.errors.forEach(e => console.log(' -', e));
  console.log('');
}
