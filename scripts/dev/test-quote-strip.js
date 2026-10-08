require('../pipeline/config');

const title = 'Rapid microbiological diagnostics for sepsis in critical care: integrating technological advances with antimicrobial stewardship';
const emailText = `Dear Dr. Yi,

I am a Senior Clinical Pharmacist at Liaquat National Hospital, Karachi, with over 17 years of experience and an MPhil in Pharmacy Practice. My research focuses on clinical pharmacy practice and hospital implementation science. I am writing to express my strong interest in pursuing a PhD under your supervision.

Your recent work, "Rapid microbiological diagnostics for sepsis in critical care: integrating technological advances with antimicrobial stewardship," aligns closely with my background. Specifically, the paper’s focus on integrating diagnostics with stewardship to prevent resistance directly complements my 2022 clinical trial on carbapenem de-escalation protocols and microbiological concordance. I believe my experience in inpatient medication safety and cardiovascular pharmacotherapy would allow me to contribute meaningfully to your team. I am eager to discuss potential PhD opportunities that bridge critical care diagnostics with practical stewardship implementation.

If this is not relevant to your work, just let me know and I will not write again.

Sincerely,
Dr. Shama Abidi, MPhil, PharmD, RPh
Senior Clinical Pharmacist, Liaquat National Hospital, Karachi`;

function checkTitleFragments(text, title) {
  const cleanTitle = title.trim().replace(/[.,;:\s]+$/, '');
  const titleWords = cleanTitle.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  
  // Replace the quoted title, allowing for commas or periods inside or outside the quotes
  const escaped = cleanTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const quoteRegex = new RegExp(`["']\\s*${escaped}[,.]?\\s*["']`, 'gi');
  const bodyWithoutTitle = text.replace(quoteRegex, ' ');
  const bodyNorm = bodyWithoutTitle.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');

  console.log('Body after removing quoted title:');
  console.log(bodyNorm.slice(0, 300));

  for (let i = 0; i <= titleWords.length - 4; i++) {
    const fourWords = titleWords.slice(i, i + 4).join(' ');
    if (bodyNorm.includes(` ${fourWords} `)) {
      console.log('Found 4-word title fragment:', fourWords);
      return false;
    }
  }
  console.log('PASSED: No unauthorized 4+ word title fragments!');
  return true;
}

checkTitleFragments(emailText, title);
