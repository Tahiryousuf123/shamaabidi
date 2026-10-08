const fetch = globalThis.fetch;

const institutions = [
  'Pusan National University Hospital',
  'Medical University of South Carolina',
  'Moutai Institute',
  'University of Pennsylvania',
  'University of Salerno',
  'Qassim University',
  'University of Debrecen',
  'Morehouse School of Medicine',
  'The Ohio State University Wexner Medical Center',
  'Homeopathy Research Institute',
  'Huazhong University of Science and Technology',
  'Hospices Civils de Lyon',
  'Shaoxing People\'s Hospital',
  'Umm al-Qura University',
  'Tongde Hospital of Zhejiang Province',
  'Cheng Ching Hospital',
  'Chonnam National University',
  'National Defence University of Malaysia',
  'East Tennessee State University',
  'William S. Middleton Memorial Veterans Hospital',
  'Alberta Pharmacists Association',
  'Birla Institute of Technology and Science, Pilani',
  'University of Liverpool',
  'Hamdard University',
  'National University of Singapore',
  'London School of Hygiene & Tropical Medicine',
  'Faculty of Public Health'
];

async function check() {
  console.log(`Auditing ${institutions.length} Institutions in ROR:`);
  console.log('='.repeat(90));
  const results = [];

  for (const inst of institutions) {
    try {
      const res = await fetch(`https://api.ror.org/organizations?query=${encodeURIComponent(inst)}`);
      const data = await res.json();
      const top = data.items?.[0];
      if (top) {
        const displayName = top.names?.find(n => n.types.includes('ror_display'))?.value || top.names?.[0]?.value || inst;
        results.push({
          inputName: inst,
          resolvedName: displayName,
          rorId: top.id,
          rawTypes: top.types || [],
        });
      } else {
        results.push({
          inputName: inst,
          resolvedName: 'NOT FOUND',
          rorId: 'none',
          rawTypes: ['none'],
        });
      }
    } catch (e) {
      results.push({
        inputName: inst,
        resolvedName: 'ERROR: ' + e.message,
        rorId: 'error',
        rawTypes: ['error'],
      });
    }
  }

  console.table(results);
  return results;
}

check();
