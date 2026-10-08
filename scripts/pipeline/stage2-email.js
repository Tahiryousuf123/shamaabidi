const { db, FieldValue } = require('./db');
const {
  CONTACT_EMAIL,
  USER_AGENT,
  EMAIL_MAX,
  EMAIL_BUDGET_MIN,
  PERSONAL_DOMAINS,
  COMMON_SURNAMES,
  isNonPersonAuthor,
  isBlockedRoleEmail,
  NCBI_API_KEY,
  CORE_API_KEY,
  CORE_MAX,
  RELEVANCE_KEYWORDS,
  NEGATIVE_TOPICS,
  sha1,
  normalizeKey,
  sleep,
} = require('./config');

const https = require('https');
const http = require('http');

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

// Safe HTTP/HTTPS fetch helper with redirect following and graceful socket handling
function safeFetch(url, options = {}, redirectCount = 0) {
  if (redirectCount >= 3) {
    return Promise.resolve({ ok: false, status: 310, error: 'Too many redirects', text: async () => '' });
  }

  return new Promise((resolve) => {
    try {
      const parsed = new URL(url);
      const lib = parsed.protocol === 'https:' ? https : http;
      const req = lib.request(
        url,
        {
          method: options.method || 'GET',
          headers: options.headers || { 'User-Agent': USER_AGENT },
          timeout: options.timeout || 8000,
        },
        (res) => {
          if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
            const nextUrl = new URL(res.headers.location, url).href;
            return resolve(safeFetch(nextUrl, options, redirectCount + 1));
          }

          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            resolve({
              ok: res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode,
              statusText: res.statusMessage,
              text: async () => data,
              json: async () => JSON.parse(data),
              headers: {
                get: (h) => res.headers[h.toLowerCase()],
              },
            });
          });
        }
      );

      req.on('error', (err) => resolve({ ok: false, status: 0, error: err.message, text: async () => '' }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, status: 408, error: 'Timeout', text: async () => '' });
      });
      req.end();
    } catch (err) {
      resolve({ ok: false, status: 0, error: err.message, text: async () => '' });
    }
  });
}

// ─── Domain Throttling & Global Rate Limiting ─────────────────────────────────
const domainLastRequest = new Map();

async function throttleDomain(url, minIntervalMs = 1000) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const last = domainLastRequest.get(hostname) || 0;
    const now = Date.now();
    const wait = Math.max(0, minIntervalMs - (now - last));
    domainLastRequest.set(hostname, now + wait);
    if (wait > 0) {
      await sleep(wait);
    }
  } catch {
    // ignore URL parsing error
  }
}

// Global limit of 5 req/s to ebi.ac.uk (max 1 request every 200ms across all workers)
let ebiLastReqTime = 0;
const EBI_MIN_INTERVAL_MS = 200; // 5 req/sec
let ebiQueue = Promise.resolve();

async function throttleEbi() {
  return new Promise((resolve) => {
    ebiQueue = ebiQueue.then(async () => {
      const now = Date.now();
      const elapsed = now - ebiLastReqTime;
      if (elapsed < EBI_MIN_INTERVAL_MS) {
        await sleep(EBI_MIN_INTERVAL_MS - elapsed);
      }
      ebiLastReqTime = Date.now();
      resolve();
    });
  });
}

// ─── PMC HTTP Error Tracking ──────────────────────────────────────────────────
const pmcHttpErrorCounts = {
  '429': 0,
  '404': 0,
  '5xx': 0,
  timeout: 0,
  other: 0,
};

function resetPmcErrorCounts() {
  pmcHttpErrorCounts['429'] = 0;
  pmcHttpErrorCounts['404'] = 0;
  pmcHttpErrorCounts['5xx'] = 0;
  pmcHttpErrorCounts.timeout = 0;
  pmcHttpErrorCounts.other = 0;
}

// ─── Helper Functions: Name Parsing & Rule 1b Binding ─────────────────────────
function stripAccents(str) {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function parseCandidateNames(candidateName) {
  let clean = (candidateName || '').replace(/^Dr\.\s*|^Prof\.\s*|^Professor\s*/i, '').trim();
  const tokens = clean.split(/\s+/).filter(Boolean);
  let surname = '';
  let firstName = '';
  let firstInitial = '';

  if (tokens.length === 1) {
    surname = tokens[0];
    firstInitial = tokens[0][0]?.toLowerCase() || '';
  } else if (/^[A-Z]{1,3}\.?$/.test(tokens[tokens.length - 1])) {
    // "Mpabalwani EM", "Azerefegne EF"
    surname = tokens.slice(0, -1).join(' ');
    firstInitial = tokens[tokens.length - 1][0]?.toLowerCase() || '';
  } else if (/^[A-Z]\.?$/i.test(tokens[0]) && tokens.length === 2) {
    // "X. Chen"
    surname = tokens[1];
    firstInitial = tokens[0][0]?.toLowerCase() || '';
  } else {
    // "Carl Llor", "Matthew Arthur Brown", "Mamoon A. Aldeyab", "Urias Bautista-Sánchez"
    surname = tokens[tokens.length - 1];
    firstName = stripAccents(tokens[0]).replace(/[^a-z0-9]/g, '');
    firstInitial = firstName[0] || '';
  }

  const surnameTokens = stripAccents(surname)
    .split(/[\s\-_\.]+/)
    .map((t) => t.replace(/[^a-z0-9]/g, ''))
    .filter((t) => t.length >= 3);
  const fullSurnameClean = stripAccents(surname).replace(/[^a-z0-9]/g, '');

  return {
    surname: fullSurnameClean,
    surnameTokens,
    firstName,
    firstInitial,
    rawSurname: surname,
  };
}

// Rule 1b: Local part contains candidate's surname (>=3 chars, accents stripped) AND (first name or first initial)
function isRule1bMatch(email, candidateName) {
  if (!email || !email.includes('@') || !candidateName) return false;
  const localPart = stripAccents(email.split('@')[0]).replace(/[^a-z0-9]/g, '');
  const { surname, surnameTokens, firstName, firstInitial } = parseCandidateNames(candidateName);

  const matchedSurnameToken =
    (surname.length >= 3 && localPart.includes(surname)) ||
    surnameTokens.some((st) => localPart.includes(st));

  if (!matchedSurnameToken) return false;

  const matchesFirst = Boolean(firstName && firstName.length >= 2 && localPart.includes(firstName));
  const matchesInitial = Boolean(
    firstInitial &&
      (localPart.startsWith(firstInitial) ||
        localPart.endsWith(firstInitial) ||
        localPart.includes(`${firstInitial}${surname}`) ||
        localPart.includes(`${surname}${firstInitial}`) ||
        localPart.includes(firstInitial))
  );

  return matchesFirst || matchesInitial;
}

// Strictly binds an email to a specific contrib from JATS XML
function matchEmailToContrib(email, contrib, correspMap, allContribs = []) {
  if (!email || !contrib) return { matched: false };
  const cleanEmail = email.toLowerCase().trim();

  // 1. Direct email tag inside <contrib>
  if (contrib.directEmail && contrib.directEmail.toLowerCase() === cleanEmail) {
    return { matched: true, rule: '1a' };
  }

  // 2. Rule 1b check: email local part contains author's surname + first name/initial
  if (isRule1bMatch(cleanEmail, contrib.fullName)) {
    return { matched: true, rule: '1b' };
  }

  // If another author in the paper matches this email under Rule 1b, then this email definitely belongs to THEM, not this contrib!
  const belongsToOtherRule1b = allContribs.some(
    (other) => other !== contrib && isRule1bMatch(cleanEmail, other.fullName)
  );
  if (belongsToOtherRule1b) {
    return { matched: false };
  }

  // 3. Check corresp notes linked to this contrib
  for (const rid of contrib.correspRids || []) {
    if (!correspMap.has(rid)) continue;
    const note = correspMap.get(rid);
    if (!note.emails.map((e) => e.toLowerCase()).includes(cleanEmail)) continue;

    const emIdx = note.text.toLowerCase().indexOf(cleanEmail);
    if (emIdx !== -1) {
      // Find clause preceding this email (look back up to semicolon or 200 chars)
      const prevSemi = note.text.lastIndexOf(';', emIdx);
      const clauseStart = prevSemi !== -1 ? prevSemi + 1 : Math.max(0, emIdx - 200);
      const precedingText = note.text.slice(clauseStart, emIdx).toLowerCase();

      const { surname, surnameTokens, firstName } = parseCandidateNames(contrib.fullName);
      if (
        (surname.length >= 3 && precedingText.includes(surname)) ||
        surnameTokens.some((st) => precedingText.includes(st))
      ) {
        return { matched: true, rule: '1a' };
      }

      // Check initials pattern in trailing text e.g. (U.B.-S.) or (A.L.R.-P.)
      const trailingText = note.text.slice(emIdx + cleanEmail.length, emIdx + cleanEmail.length + 50);
      const initials = (firstName + ' ' + (contrib.surname || ''))
        .split(/[\s\-]+/)
        .map((w) => w[0]?.toUpperCase())
        .filter(Boolean)
        .join('');
      const initialsDotted = (firstName + ' ' + (contrib.surname || ''))
        .split(/[\s\-]+/)
        .map((w) => w[0]?.toUpperCase())
        .filter(Boolean)
        .join('.');
      if (
        (initials.length >= 2 && trailingText.toUpperCase().includes(initials)) ||
        (initialsDotted.length >= 2 && trailingText.toUpperCase().includes(initialsDotted))
      ) {
        return { matched: true, rule: '1a' };
      }
    }

    // If the note has ONLY this 1 email, and among allContribs only this contrib is linked to it:
    if (note.emails.length === 1) {
      const linkedContribs = allContribs.filter((c) => c.correspRids.includes(rid) || c.isCorresp);
      if (linkedContribs.length <= 1) {
        return { matched: true, rule: '1a' };
      }
    }
  }

  return { matched: false };
}

// ─── Academic Institution Resolution & Filtering ──────────────────────────────
function extractAcademicInstitutionQuery(text) {
  if (!text) return '';
  const segments = text.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  const uniSeg = segments.find((s) => /\buniversity\b/i.test(s));
  if (uniSeg) return uniSeg.replace(/^\d+\s*/, '').trim();
  const colSeg = segments.find((s) => /\bcollege\b/i.test(s));
  if (colSeg) return colSeg.replace(/^\d+\s*/, '').trim();
  const instSeg = segments.find((s) => /\b(institute|faculty|hospital|school)\b/i.test(s));
  if (instSeg) return instSeg.replace(/^\d+\s*/, '').trim();
  return segments[0].replace(/^\d+\s*/, '').trim();
}

async function resolveAcademicInstitutionDetails(rawAff, candidate = {}) {
  const queryText = (rawAff || candidate.institution || '').trim();
  if (!queryText) return { valid: false, displayName: 'Academic Medical Center', types: ['unknown'] };

  const targetQuery = extractAcademicInstitutionQuery(queryText);
  try {
    const res = await fetch(`https://api.ror.org/organizations?query=${encodeURIComponent(targetQuery)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      const top = data.items?.[0];
      if (top) {
        const displayName = top.names?.find((n) => n.types.includes('ror_display'))?.value || top.names?.[0]?.value || targetQuery;
        const types = top.types || [];
        const ror = top.id;

        const isEducation = types.includes('education');
        const isFacilityOrOther = types.includes('facility') || types.includes('other');
        const isHealthcareAcademic = types.includes('healthcare') && /\b(university|college|school|academic|teaching)\b/i.test(displayName + ' ' + queryText);
        const isNonAcademicType = types.some((t) => ['government', 'company', 'nonprofit'].includes(t));

        const hasFacultyConfirmation = candidate.emailSource === 'faculty-page' || Boolean(candidate.facultyUrl);

        if (isNonAcademicType && !hasFacultyConfirmation && !isEducation) {
          return { valid: false, reason: 'rejected_non_academic', displayName, ror, types };
        }
        if (isEducation || isFacilityOrOther || isHealthcareAcademic) {
          return { valid: true, displayName, ror, types };
        }
        if (types.includes('healthcare') && !hasFacultyConfirmation) {
          return { valid: false, reason: 'rejected_non_academic', displayName, ror, types };
        }
        return { valid: true, displayName, ror, types };
      }
    }
  } catch {
    // Non-fatal
  }

  // Fallback: check keywords directly
  const isEducationFallback = /\b(university|college|faculty of|school of medicine|institute of technology)\b/i.test(targetQuery);
  if (isEducationFallback) {
    return { valid: true, displayName: targetQuery, ror: candidate.ror || null, types: ['education'] };
  }

  return { valid: false, reason: 'rejected_non_academic', displayName: targetQuery, types: ['unknown'] };
}

// ─── JATS XML Parser for Authors, Affiliations, and Corresp Notes ─────────────
function parseJatsXml(xml) {
  const affMap = new Map();
  const correspMap = new Map();
  const contribs = [];

  // 1. Affiliations
  const affMatches = xml.match(/<aff[\s\S]*?<\/aff>/gi) || [];
  for (const a of affMatches) {
    const idMatch = a.match(/id=["']([^"']+)["']/i);
    const id = idMatch ? idMatch[1] : '';
    const text = a
      .replace(/<label[^>]*>[\s\S]*?<\/label>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (id) affMap.set(id, text);
  }

  // 2. Author notes & Corresp blocks
  const allNotes = [];
  const anMatch = xml.match(/<author-notes[\s\S]*?<\/author-notes>/i);
  if (anMatch) {
    const fnOrCor = anMatch[0].match(/<(fn|corresp)[\s\S]*?<\/\1>/gi) || [anMatch[0]];
    allNotes.push(...fnOrCor);
  }
  const directCorresp = xml.match(/<corresp[\s\S]*?<\/corresp>/gi) || [];
  allNotes.push(...directCorresp);

  for (const note of allNotes) {
    const idMatch = note.match(/id=["']([^"']+)["']/i);
    const id = idMatch ? idMatch[1] : `note_${correspMap.size}`;
    const emails = (note.match(EMAIL_REGEX) || []).map((e) => e.toLowerCase().trim());
    const text = note.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (emails.length > 0) {
      correspMap.set(id, { id, emails, text });
    }
  }

  // 3. Contribs
  const contribMatches = xml.match(/<contrib[\s\S]*?<\/contrib>/gi) || [];
  for (const c of contribMatches) {
    const snMatch = c.match(/<surname[^>]*>([^<]+)<\/surname>/i);
    const gnMatch = c.match(/<given-names[^>]*>([^<]+)<\/given-names>/i);
    if (!snMatch) continue;

    const surname = snMatch[1].trim();
    const givenNames = gnMatch ? gnMatch[1].trim() : '';
    const fullName = `${givenNames} ${surname}`.trim();

    const isCorresp = c.includes('corresp="yes"');
    const correspRids = [];
    const xrefs = c.match(/<xref[^>]*rid=["']([^"']+)["'][^>]*>/gi) || [];
    for (const x of xrefs) {
      if (x.includes('corresp') || x.includes('author-notes') || x.includes('cor')) {
        const m = x.match(/rid=["']([^"']+)["']/i);
        if (m) correspRids.push(m[1]);
      }
    }

    const affRids = [];
    const xrefAff = c.match(/<xref[^>]*ref-type=["']aff["'][^>]*rid=["']([^"']+)["']/gi) || [];
    for (const xa of xrefAff) {
      const m = xa.match(/rid=["']([^"']+)["']/i);
      if (m) affRids.push(m[1]);
    }

    const directEmailMatch = c.match(/<email[^>]*>([^<]+)<\/email>/i);
    const directEmail = directEmailMatch ? directEmailMatch[1].toLowerCase().trim() : null;

    let primaryAff = '';
    for (const ar of affRids) {
      if (affMap.has(ar)) {
        primaryAff = affMap.get(ar);
        break;
      }
    }
    if (!primaryAff && affMap.size > 0) {
      primaryAff = affMap.values().next().value;
    }

    contribs.push({
      surname,
      givenNames,
      fullName,
      isCorresp,
      correspRids,
      directEmail,
      affiliation: primaryAff,
    });
  }

  // 4. Abstract
  let paperAbstract = null;
  const absMatch = xml.match(/<abstract[\s\S]*?<\/abstract>/i);
  if (absMatch) {
    paperAbstract = absMatch[0]
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return { contribs, affMap, correspMap, paperAbstract };
}

// ─── A. PubMed E-utilities Email Resolver (Strict Rule 1b Binding) ────────────
async function resolveViaPubMed(candidate) {
  const works = candidate.recentWorks || [];
  let pmid = works.find((w) => w.pmid)?.pmid;

  const apiKeyParam = NCBI_API_KEY ? `&api_key=${encodeURIComponent(NCBI_API_KEY)}` : '';
  const ncbiInterval = NCBI_API_KEY ? 125 : 350;

  // If no PMID stored, try looking up via title
  if (!pmid && works[0]?.title) {
    try {
      await throttleDomain('https://eutils.ncbi.nlm.nih.gov', ncbiInterval);
      const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(
        works[0].title
      )}&retmode=json&tool=phdreach&email=${CONTACT_EMAIL}${apiKeyParam}`;
      const sRes = await fetch(searchUrl, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(6000),
      });
      if (sRes.ok) {
        const sData = await sRes.json();
        const idList = sData.esearchresult?.idlist || [];
        if (idList.length > 0) pmid = idList[0];
      }
    } catch {
      // ignore lookup error
    }
  }

  if (!pmid) {
    return { status: 'skipped' };
  }

  try {
    await throttleDomain('https://eutils.ncbi.nlm.nih.gov', ncbiInterval);
    const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&retmode=xml&tool=phdreach&email=${CONTACT_EMAIL}${apiKeyParam}`;
    const res = await fetch(fetchUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return { status: 'http_error', error: `HTTP ${res.status}` };
    }
    const xml = await res.text();

    const { surname } = parseCandidateNames(candidate.name);
    const authorRegex = new RegExp(`<Author[\\s\\S]*?<LastName>${surname}<\\/LastName>[\\s\\S]*?<\\/Author>`, 'i');
    const authorMatch = xml.match(authorRegex);

    const candNames = parseCandidateNames(candidate.name);
    const isCommonSurname = COMMON_SURNAMES.has(candNames.surname.toLowerCase());

    if (authorMatch) {
      const authorBlock = authorMatch[0];
      const emailsInBlock = authorBlock.match(EMAIL_REGEX) || [];
      for (const em of emailsInBlock) {
        const cleanEm = em.toLowerCase().trim();
        if (isBlockedRoleEmail(cleanEm)) continue;
        if (isRule1bMatch(cleanEm, candidate.name)) {
          const domain = cleanEm.split('@')[1]?.toLowerCase();
          const isPersonal = PERSONAL_DOMAINS.has(domain);
          let status = 'found';
          let reviewReason = null;
          if (isPersonal) {
            status = 'needs_review';
            reviewReason = 'webmail-weak-binding';
          } else if (isCommonSurname) {
            status = 'needs_review';
            reviewReason = 'common-surname-weak-binding';
          }
          return {
            status,
            reviewReason,
            email: cleanEm,
            source: 'pubmed-affiliation',
            bindingRule: '1b',
            bindingStrength: 'weak',
            emailOwner: candidate.name,
            confidence: isPersonal ? 'personal-name-match' : 'institutional',
            emailEvidence: {
              source: 'pubmed-affiliation',
              id: pmid,
              location: 'author-affiliation',
              snippet: cleanEm,
            },
          };
        }
      }
    }

    // Fallback: check other emails in PubMed XML matching candidate under Rule 1b
    const allEmails = xml.match(EMAIL_REGEX) || [];
    for (const em of allEmails) {
      const cleanEm = em.toLowerCase().trim();
      if (isRule1bMatch(cleanEm, candidate.name)) {
        const domain = cleanEm.split('@')[1]?.toLowerCase();
        const isPersonal = PERSONAL_DOMAINS.has(domain);
        let status = 'found';
        let reviewReason = null;
        if (isPersonal) {
          status = 'needs_review';
          reviewReason = 'webmail-weak-binding';
        } else if (isCommonSurname) {
          status = 'needs_review';
          reviewReason = 'common-surname-weak-binding';
        }
        return {
          status,
          reviewReason,
          email: cleanEm,
          source: 'pubmed-affiliation',
          bindingRule: '1b',
          bindingStrength: 'weak',
          emailOwner: candidate.name,
          confidence: isPersonal ? 'personal-name-match' : 'institutional',
          emailEvidence: {
            source: 'pubmed-affiliation',
            id: pmid,
            location: 'author-affiliation',
            snippet: cleanEm,
          },
        };
      }
    }

    return { status: 'failed' };
  } catch (err) {
    return { status: 'http_error', error: err.message };
  }
}

// ─── Europe PMC Full Text XML Fetcher with Retry & Rate Limiting ──────────────
async function fetchPmcFullTextXmlWithRetry(cleanPmcid, candidate) {
  const xmlUrl = `https://www.ebi.ac.uk/europepmc/webservices/rest/${cleanPmcid}/fullTextXML`;
  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    await throttleEbi();
    try {
      const res = await fetch(xmlUrl, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/xml,text/xml' },
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        const xml = await res.text();
        return { ok: true, xml, status: 200, url: xmlUrl };
      }

      console.warn(`   ⚠️ [Europe PMC fullTextXML Non-200] Status: ${res.status} | URL: ${xmlUrl} | Candidate: ${candidate.name} (Attempt ${attempt}/${MAX_RETRIES})`);

      if (res.status === 429) {
        pmcHttpErrorCounts['429']++;
      } else if (res.status === 404) {
        pmcHttpErrorCounts['404']++;
        return { ok: false, status: 404, url: xmlUrl };
      } else if (res.status >= 500) {
        pmcHttpErrorCounts['5xx']++;
      } else {
        pmcHttpErrorCounts.other++;
      }

      // Exponential backoff with Retry-After for 429 and 5xx
      if (attempt < MAX_RETRIES && (res.status === 429 || res.status >= 500)) {
        let delayMs = 1000 * Math.pow(2, attempt);
        const retryAfterHeader = res.headers.get('retry-after');
        if (retryAfterHeader) {
          const seconds = parseInt(retryAfterHeader, 10);
          if (!isNaN(seconds) && seconds > 0) delayMs = seconds * 1000;
        }
        console.log(`      ⏳ Backing off for ${delayMs}ms before retry due to HTTP ${res.status}...`);
        await sleep(delayMs);
        continue;
      }

      return { ok: false, status: res.status, url: xmlUrl };
    } catch (err) {
      const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError' || err.message?.toLowerCase().includes('timeout');
      if (isTimeout) {
        pmcHttpErrorCounts.timeout++;
      } else {
        pmcHttpErrorCounts.other++;
      }

      console.warn(`   ⚠️ [Europe PMC fullTextXML Error] ${isTimeout ? 'Timeout' : 'NetworkError'}: ${err.message} | URL: ${xmlUrl} | Candidate: ${candidate.name} (Attempt ${attempt}/${MAX_RETRIES})`);

      if (attempt < MAX_RETRIES) {
        const delayMs = 1000 * Math.pow(2, attempt);
        console.log(`      ⏳ Backing off for ${delayMs}ms before retry due to timeout/network error...`);
        await sleep(delayMs);
        continue;
      }

      return { ok: false, status: isTimeout ? 'timeout' : 'error', url: xmlUrl, error: err.message };
    }
  }

  return { ok: false, status: 'exhausted', url: xmlUrl };
}

// ─── B. Europe PMC Full Text XML Resolver (Strict Author Binding) ─────────────
async function resolveViaEuropePmc(candidate, isDryRun = false) {
  const works = candidate.recentWorks || [];
  let pmcid = candidate.pmcid || works.find((w) => w.pmcid)?.pmcid;

  // Fallback to DOI, PMID, or Title search if no PMCID stored
  if (!pmcid) {
    const doi = works[0]?.doi ? works[0].doi.replace(/^https?:\/\/doi\.org\//, '').trim() : null;
    const pmid = works[0]?.pmid || null;
    const title = works[0]?.title || null;

    let query = null;
    if (doi) query = `DOI:"${doi}"`;
    else if (pmid) query = `EXT_ID:${pmid}`;
    else if (title) query = `TITLE:"${title.slice(0, 80)}"`;

    if (query) {
      try {
        await throttleEbi();
        const sUrl = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(
          query
        )}&format=json&pageSize=1`;
        const sRes = await fetch(sUrl, {
          headers: { 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(6000),
        });
        if (sRes.ok) {
          const sData = await sRes.json();
          const first = sData.resultList?.result?.[0];
          if (first?.pmcid) pmcid = first.pmcid;
        }
      } catch {
        // ignore lookup error
      }
    }
  }

  if (!pmcid) {
    return { status: 'skipped_no_pmcid' };
  }

  const cleanPmcid = pmcid.toUpperCase().startsWith('PMC') ? pmcid.toUpperCase() : `PMC${pmcid}`;

  // Fetch fullTextXML with retry and exponential backoff
  let fetchResult = await fetchPmcFullTextXmlWithRetry(cleanPmcid, candidate);

  // Fallback on 404
  if (!fetchResult.ok && fetchResult.status === 404) {
    const doi = works[0]?.doi ? works[0].doi.replace(/^https?:\/\/doi\.org\//, '').trim() : null;
    const title = works[0]?.title || null;
    let fallbackQuery = doi ? `DOI:"${doi}"` : (title ? `TITLE:"${title.slice(0, 80)}"` : null);

    if (fallbackQuery) {
      console.log(`      🔄 [PMC 404 Fallback] Querying alternative PMCID via ${fallbackQuery}...`);
      try {
        await throttleEbi();
        const sUrl = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(
          fallbackQuery
        )}&format=json&pageSize=1`;
        const sRes = await fetch(sUrl, {
          headers: { 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(6000),
        });
        if (sRes.ok) {
          const sData = await sRes.json();
          const altPmcid = sData.resultList?.result?.[0]?.pmcid;
          if (altPmcid && altPmcid !== cleanPmcid) {
            console.log(`      🔄 [PMC 404 Fallback] Found alternate PMCID: ${altPmcid}. Fetching XML...`);
            fetchResult = await fetchPmcFullTextXmlWithRetry(altPmcid, candidate);
          }
        }
      } catch {
        // ignore fallback error
      }
    }
  }

  if (!fetchResult.ok) {
    return { status: 'http_error', error: `HTTP ${fetchResult.status}` };
  }

  // Parse authors, affiliations, and corresp notes
  const { contribs, affMap, correspMap, paperAbstract } = parseJatsXml(fetchResult.xml);

  const allCorrespEmails = [];
  for (const cn of correspMap.values()) {
    allCorrespEmails.push(...cn.emails);
  }

  // 1. Check Binding for Candidate
  let bound = null;
  const candNorm = parseCandidateNames(candidate.name);

  // Match candidate's contrib in the paper (surname + first initial)
  const candidateContrib = contribs.find((c) => {
    const cNorm = parseCandidateNames(c.fullName);
    const snMatch =
      cNorm.surname === candNorm.surname ||
      (candNorm.surnameTokens && candNorm.surnameTokens.some((st) => cNorm.surname.includes(st))) ||
      (cNorm.surnameTokens && cNorm.surnameTokens.some((st) => candNorm.surname.includes(st)));
    const initMatch = cNorm.firstInitial === candNorm.firstInitial;
    return snMatch && initMatch;
  });

  for (const em of allCorrespEmails) {
    if (candidateContrib) {
      const match = matchEmailToContrib(em, candidateContrib, correspMap, contribs);
      if (match.matched) {
        bound = {
          email: em,
          rule: match.rule,
          strength: match.rule === '1a' ? 'strong' : 'weak',
          owner: candidateContrib.fullName,
          location: match.rule === '1a' ? 'jats-corresp-xref' : 'rule1b-localpart',
        };
        break;
      }
    }
    if (isRule1bMatch(em, candidate.name)) {
      bound = {
        email: em,
        rule: '1b',
        strength: 'weak',
        owner: candidate.name,
        location: 'rule1b-localpart',
      };
      break;
    }
  }

  // Check Ambiguous Corresp: several emails in free-text note with no per-author link
  if (!bound && candidateContrib && (candidateContrib.correspRids?.length > 0 || candidateContrib.isCorresp)) {
    for (const rid of candidateContrib.correspRids || []) {
      const note = correspMap.get(rid);
      if (note && note.emails.length > 1) {
        return {
          status: 'ambiguous_corresp',
          emails: note.emails,
          source: 'europepmc-fulltext',
          bindingRule: 'ambiguous',
          bindingStrength: 'weak',
          emailOwner: candidateContrib.fullName,
          reviewReason: 'ambiguous-corresp',
          ownerAffiliation: candidateContrib.affiliation || null,
          paperAbstract,
          emailEvidence: {
            source: 'europepmc-fulltext',
            id: cleanPmcid,
            location: `corresp-rid-${rid}`,
            snippet: note.text.slice(0, 200),
          },
        };
      }
    }
  }

  if (bound) {
    const emailDomain = bound.email.split('@')[1]?.toLowerCase();
    const isPersonal = PERSONAL_DOMAINS.has(emailDomain);
    const isCommonSurname = COMMON_SURNAMES.has(candNorm.surname.toLowerCase());

    let status = 'found';
    let reviewReason = null;
    if (bound.strength === 'weak') {
      if (isPersonal) {
        status = 'needs_review';
        reviewReason = 'webmail-weak-binding';
      } else if (isCommonSurname) {
        status = 'needs_review';
        reviewReason = 'common-surname-weak-binding';
      }
    }

    return {
      status,
      reviewReason,
      email: bound.email,
      source: 'europepmc-fulltext',
      bindingRule: bound.rule,
      bindingStrength: bound.strength,
      emailOwner: bound.owner,
      ownerAffiliation: candidateContrib?.affiliation || null,
      paperAbstract,
      confidence: isPersonal ? 'personal-name-match' : 'institutional',
      emailEvidence: {
        source: 'europepmc-fulltext',
        id: cleanPmcid,
        location: bound.location,
        snippet: bound.email,
      },
    };
  }

  // 2. Author Mismatch Reassignment (Requirement 1)
  // If an email is found in <corresp> but belongs to a DIFFERENT author in the paper
  if (allCorrespEmails.length > 0) {
    let otherAuthor = null;
    let otherContribIdx = -1;
    for (const em of allCorrespEmails) {
      if (isBlockedRoleEmail(em)) continue;
      for (let idx = 0; idx < contribs.length; idx++) {
        const contrib = contribs[idx];
        const match = matchEmailToContrib(em, contrib, correspMap, contribs);
        if (match.matched) {
          // Rule 2: Skip reassignment to authors that are clearly junior (middle authors with no corresponding flag)
          const isMiddle = idx > 0 && idx < contribs.length - 1;
          const isCorresponding = contrib.isCorresp || match.isCorresponding || (contrib.correspRids && contrib.correspRids.length > 0);
          if (isMiddle && !isCorresponding) {
            continue; // Skip junior middle authors
          }
          otherAuthor = {
            name: contrib.fullName,
            email: em,
            aff: contrib.affiliation,
            rule: match.rule,
            isCorresp: isCorresponding,
          };
          otherContribIdx = idx;
          break;
        }
      }
      if (otherAuthor) break;
    }

    if (otherAuthor && otherAuthor.name && otherAuthor.email && !isNonPersonAuthor(otherAuthor.name)) {
      const emailDomain = otherAuthor.email.split('@')[1]?.toLowerCase();
      const isPersonal = PERSONAL_DOMAINS.has(emailDomain);
      const otherNorm = parseCandidateNames(otherAuthor.name);
      const isCommonSurname = COMMON_SURNAMES.has(otherNorm.surname.toLowerCase());

      const strength = otherAuthor.rule === '1a' ? 'strong' : 'weak';
      let otherStatus = 'email_found';
      let otherReviewReason = null;
      if (strength === 'weak') {
        if (isPersonal) {
          otherStatus = 'needs_review';
          otherReviewReason = 'webmail-weak-binding';
        } else if (isCommonSurname) {
          otherStatus = 'needs_review';
          otherReviewReason = 'common-surname-weak-binding';
        }
      }

      // Re-derive seniority and authorRole
      let otherRole = 'corresponding_author';
      if (otherAuthor.isCorresp) {
        otherRole = otherContribIdx === contribs.length - 1 ? 'corresponding_senior_author' : 'corresponding_author';
      } else if (otherContribIdx === contribs.length - 1) {
        otherRole = 'last_author';
      } else if (otherContribIdx === 0) {
        otherRole = 'first_author';
      }

      // Re-derive institution from author's own affiliation - DO NOT inherit original candidate's institution
      let otherInst = 'Academic Medical Center';
      if (otherAuthor.aff) {
        const cleanAff = extractAcademicInstitutionQuery(otherAuthor.aff) || otherAuthor.aff.split(',')[0].trim();
        if (cleanAff) otherInst = cleanAff;
      }

      // Re-derive relevance score from paper topics and seniority
      let derivedScore = 30;
      const contentToScore = `${candidate.paperTitle || ''} ${paperAbstract || ''}`.toLowerCase();
      for (const kw of RELEVANCE_KEYWORDS) {
        if (contentToScore.includes(kw)) derivedScore += 10;
      }
      for (const neg of NEGATIVE_TOPICS) {
        if (contentToScore.includes(neg)) derivedScore -= 50;
      }
      if (otherRole === 'corresponding_senior_author') derivedScore += 25;
      else if (otherRole === 'last_author' || otherRole === 'corresponding_author') derivedScore += 15;
      else if (otherRole === 'first_author') derivedScore += 10;
      derivedScore = Math.max(10, Math.min(100, derivedScore));

      // Dedupe new person against existing candidates (email sha1 and name+institution)
      const otherEmailClean = otherAuthor.email.toLowerCase().trim();
      const otherNameInstKey = sha1(`${normalizeKey(otherAuthor.name)}_${normalizeKey(otherInst)}`);
      let alreadyExists = false;

      if (!isDryRun) {
        try {
          const snapEm = await db.collection('candidates').where('email', '==', otherEmailClean).limit(1).get();
          if (!snapEm.empty) alreadyExists = true;
          if (!alreadyExists) {
            const snapDoc = await db.collection('candidates').doc(otherNameInstKey).get();
            if (snapDoc.exists) alreadyExists = true;
          }
        } catch {
          // Non-fatal
        }
      }

      if (!isDryRun && !alreadyExists) {
        // Create new candidate doc for corresponding author
        const correspDocId = sha1(`epmc_corresp_${cleanPmcid}_${normalizeKey(otherAuthor.name)}`);
        await db.collection('candidates').doc(correspDocId).set(
          {
            name: otherAuthor.name,
            surname: otherNorm.rawSurname || otherNorm.surname,
            givenNames: otherNorm.firstName,
            authorRole: otherRole,
            institution: otherInst,
            ownerAffiliation: otherAuthor.aff || null,
            ror: null,
            email: otherAuthor.email,
            emailSource: 'europepmc-fulltext',
            emailConfidence: isPersonal ? 'personal-name-match' : 'institutional',
            bindingRule: otherAuthor.rule,
            bindingStrength: strength,
            emailOwner: otherAuthor.name,
            emailEvidence: {
              source: 'europepmc-fulltext',
              id: cleanPmcid,
              location: 'corresp-mismatch-reassigned',
              snippet: otherAuthor.email,
            },
            status: otherStatus,
            reviewReason: otherReviewReason,
            pmcid: cleanPmcid,
            doi: candidate.doi || works[0]?.doi || null,
            paperTitle: candidate.paperTitle || works[0]?.title || null,
            abstract: candidate.abstract || paperAbstract || null,
            year: candidate.year || works[0]?.year || null,
            topics: candidate.topics || [],
            recentWorkTitles: candidate.recentWorkTitles || [],
            relevanceScore: derivedScore,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        // Reset original candidate doc back to 'discovered' with note
        if (candidate.ref) {
          await candidate.ref.update({
            status: 'discovered',
            note: 'email-belongs-to-other-author',
            email: null,
            emailSource: null,
            emailConfidence: null,
            updatedAt: FieldValue.serverTimestamp(),
          }).catch(() => {});
        }
      }

      return {
        status: 'author_mismatch_reassigned',
        reassignedTo: otherAuthor.name,
        email: otherAuthor.email,
        institution: otherInst,
        authorRole: otherRole,
        relevanceScore: derivedScore,
        bindingRule: otherAuthor.rule,
        bindingStrength: strength,
        originalCandidate: candidate.name,
      };
    }
  }

  return { status: 'failed' };
}

// ─── C. CORE API v3 Full Text Resolver ───────────────────────────────────────
let coreLoggedNoKey = false;
let coreRunRequests = 0;

async function resolveViaCore(candidate) {
  const works = candidate.recentWorks || [];
  const doi = candidate.doi || works.find((w) => w.doi)?.doi;
  const pmcid = candidate.pmcid || works.find((w) => w.pmcid)?.pmcid;

  // Run only for candidates with DOI and no PMCID
  if (!doi || pmcid) {
    return { status: 'skipped_no_doi' };
  }

  if (!CORE_API_KEY) {
    if (!coreLoggedNoKey) {
      console.log('   ℹ️ CORE skipped (no key)');
      coreLoggedNoKey = true;
    }
    return { status: 'skipped_no_key' };
  }

  if (coreRunRequests >= CORE_MAX) {
    return { status: 'skipped_max_requests' };
  }

  const cleanDoi = doi.replace(/^https?:\/\/doi\.org\//i, '').trim();
  const coreUrl = `https://api.core.ac.uk/v3/search/works?q=doi:%22${encodeURIComponent(cleanDoi)}%22&limit=1`;

  let attempt = 0;
  coreRunRequests++;

  while (attempt < 3) {
    attempt++;
    try {
      await throttleDomain('https://api.core.ac.uk', 500);
      const res = await fetch(coreUrl, {
        headers: {
          Authorization: `Bearer ${CORE_API_KEY}`,
          'User-Agent': USER_AGENT,
        },
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        const json = await res.json();
        const data = json.results?.[0] || json;
        const fullText = data?.fullText;
        if (!fullText || typeof fullText !== 'string' || fullText.length < 50) {
          return { status: 'failed', reason: 'no_fulltext' };
        }

        const textEmails = (fullText.match(EMAIL_REGEX) || []).map((e) => e.toLowerCase().trim());
        const uniqueEmails = [...new Set(textEmails)].filter((e) => !isBlockedRoleEmail(e));

        for (const em of uniqueEmails) {
          const rule1b = isRule1bMatch(em, candidate.name);
          const nameProximity = isFullNameNearEmail(fullText, candidate.name);

          if (rule1b || nameProximity) {
            const domain = em.split('@')[1]?.toLowerCase();
            const isPersonal = PERSONAL_DOMAINS.has(domain);
            return {
              status: 'found',
              email: em,
              source: 'core-fulltext',
              bindingRule: rule1b ? '1b' : '1c',
              bindingStrength: 'strong',
              emailOwner: candidate.name,
              confidence: isPersonal ? 'personal-name-match' : 'institutional',
              emailEvidence: {
                source: 'core-fulltext',
                id: cleanDoi,
                location: 'core-v3-fulltext',
                snippet: em,
              },
            };
          }
        }

        return { status: 'failed', reason: 'no_name_match' };
      }

      if (attempt < 3 && (res.status === 429 || res.status >= 500)) {
        let delayMs = 1000 * Math.pow(2, attempt);
        const retryAfter = res.headers.get('retry-after');
        if (retryAfter && !isNaN(parseInt(retryAfter, 10))) {
          delayMs = parseInt(retryAfter, 10) * 1000;
        }
        await sleep(delayMs);
        continue;
      }

      return { status: 'http_error', error: `HTTP ${res.status}` };
    } catch (err) {
      if (attempt < 3) {
        await sleep(1000 * Math.pow(2, attempt));
        continue;
      }
      return { status: 'http_error', error: err.message };
    }
  }

  return { status: 'failed', reason: 'fetch_error' };
}

// ─── D. ORCID Public API Resolver (Strict Rule 1c) ────────────────────────────
async function resolveViaOrcid(candidate) {
  if (!candidate.orcid) {
    return { status: 'skipped', reason: 'no_orcid' };
  }
  const cleanOrcid = candidate.orcid.replace(/^https?:\/\/orcid\.org\//, '').trim();

  try {
    await throttleDomain('https://pub.orcid.org');
    const url = `https://pub.orcid.org/v3.0/${cleanOrcid}/person`;
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
      },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      return { status: 'http_error', error: `HTTP ${res.status}`, reason: 'fetch_error' };
    }
    const data = await res.json();

    // Check emails
    const emailsList = data?.emails?.email || [];
    for (const item of emailsList) {
      if (item.email && typeof item.email === 'string') {
        const cleanEm = item.email.toLowerCase().trim();
        if (isBlockedRoleEmail(cleanEm)) continue;
        const emailDomain = cleanEm.split('@')[1]?.toLowerCase();
        const isPersonal = PERSONAL_DOMAINS.has(emailDomain);
        return {
          status: 'found',
          email: cleanEm,
          source: 'orcid',
          bindingRule: '1b_orcid',
          bindingStrength: 'strong',
          emailOwner: candidate.name,
          confidence: isPersonal ? 'personal-name-match' : 'institutional',
          emailEvidence: {
            source: 'orcid',
            id: cleanOrcid,
            location: 'orcid-public-emails',
            snippet: cleanEm,
          },
          researcherUrls: [],
        };
      }
    }

    // Collect researcher URLs if no public email
    const urlsList = data?.['researcher-urls']?.['researcher-url'] || [];
    const researcherUrls = urlsList.map((u) => u.url?.value).filter(Boolean);

    return {
      status: 'failed',
      reason: 'no_public_email',
      email: null,
      source: null,
      researcherUrls,
    };
  } catch (err) {
    return { status: 'http_error', error: err.message, reason: 'fetch_error' };
  }
}

// ─── Robots.txt Helper ────────────────────────────────────────────────────────
const robotsCache = new Map();

async function fetchRobotsTxt(origin) {
  if (robotsCache.has(origin)) {
    return robotsCache.get(origin);
  }
  try {
    const robotsUrl = `${origin}/robots.txt`;
    const res = await safeFetch(robotsUrl, { timeout: 4000 });
    if (res.ok) {
      const txt = await res.text();
      robotsCache.set(origin, txt);
      return txt;
    }
  } catch {
    // Non-fatal
  }
  robotsCache.set(origin, null);
  return null;
}

function isAllowedByRobots(urlStr, robotsTxt) {
  if (!robotsTxt) return true;
  try {
    const parsed = new URL(urlStr);
    const pathname = parsed.pathname;
    const lines = robotsTxt.split('\n');
    let isUserAgentWildcard = false;
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (/^User-agent:\s*\*/i.test(line)) {
        isUserAgentWildcard = true;
      } else if (/^User-agent:/i.test(line)) {
        isUserAgentWildcard = false;
      } else if (isUserAgentWildcard && /^Disallow:\s*(.+)/i.test(line)) {
        const disallowPath = line.match(/^Disallow:\s*(.+)/i)[1].trim();
        if (disallowPath && pathname.startsWith(disallowPath)) {
          return false;
        }
      }
    }
  } catch {
    return true;
  }
  return true;
}

// ─── Proximity Check Helper (Rule 1c: Full Name within 300 characters) ────────
function isFullNameNearEmail(pageText, candidateName) {
  if (!pageText || !candidateName) return false;

  const rawClean = candidateName.replace(/^Dr\.\s*|^Prof\.\s*|^Professor\s*/i, '').trim();
  const tokens = rawClean.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return false;

  const firstName = stripAccents(tokens[0]).replace(/[^a-z0-9]/g, '');
  const lastName = stripAccents(tokens[tokens.length - 1]).replace(/[^a-z0-9]/g, '');

  if (firstName.length < 2 || lastName.length < 2) return false;

  const cleanText = stripAccents(pageText).replace(/[^a-z0-9@.\-\s]/g, ' ');
  const emailMatch = cleanText.match(EMAIL_REGEX);
  if (!emailMatch) return false;

  for (const em of emailMatch) {
    const emIdx = cleanText.indexOf(em);
    if (emIdx === -1) continue;

    const startWindow = Math.max(0, emIdx - 300);
    const endWindow = Math.min(cleanText.length, emIdx + em.length + 300);
    const windowSnippet = cleanText.slice(startWindow, endWindow);

    if (windowSnippet.includes(firstName) && windowSnippet.includes(lastName)) {
      return true;
    }
  }

  return false;
}

// ─── D. Faculty Page Crawler (Strict Rule 1c) ─────────────────────────────────
async function resolveViaFacultyPage(candidate, researcherUrls = []) {
  const crawlUrls = [];

  // (a) ORCID researcher-urls
  for (const rUrl of researcherUrls) {
    if (rUrl && rUrl.startsWith('http') && !crawlUrls.includes(rUrl)) {
      crawlUrls.push(rUrl);
    }
  }

  // (b) OpenAlex institution homepage
  const instHp = candidate.institutionHomepage;
  if (instHp && instHp.startsWith('http') && !crawlUrls.includes(instHp)) {
    crawlUrls.push(instHp);
  }

  if (crawlUrls.length === 0) {
    return { status: 'skipped', reason: 'no_homepage' };
  }

  let encounteredHttpError = false;
  let robotsBlockedCount = 0;

  for (const targetUrl of crawlUrls) {
    try {
      const parsed = new URL(targetUrl);
      const origin = parsed.origin;

      // 1. Robots.txt check
      const robotsTxt = await fetchRobotsTxt(origin);
      if (!isAllowedByRobots(targetUrl, robotsTxt)) {
        console.log(`      🤖 Robots.txt disallowed crawl for: ${targetUrl}`);
        robotsBlockedCount++;
        continue;
      }

      // 2. 1 req/s domain throttling
      await throttleDomain(origin, 1000);

      const res = await safeFetch(targetUrl, { timeout: 8000 });
      if (!res.ok) {
        if (res.status >= 400) encounteredHttpError = true;
        continue;
      }

      const html = await res.text();
      const stripped = html.replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ');

      // Check proximity on target page
      const mailtoMatches = html.match(/mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi) || [];
      const textEmailMatches = stripped.match(EMAIL_REGEX) || [];
      const candidateEmails = [
        ...mailtoMatches.map((m) => m.replace(/^mailto:/i, '').toLowerCase().trim()),
        ...textEmailMatches.map((e) => e.toLowerCase().trim()),
      ].filter((em) => !isBlockedRoleEmail(em));

      for (const sem of candidateEmails) {
        if (isFullNameNearEmail(stripped, candidate.name)) {
          const domain = sem.split('@')[1]?.toLowerCase();
          const isPersonal = PERSONAL_DOMAINS.has(domain);

          return {
            status: 'found',
            email: sem,
            source: 'faculty-page',
            bindingRule: '1c',
            bindingStrength: 'strong',
            emailOwner: candidate.name,
            confidence: isPersonal ? 'personal-name-match' : 'institutional',
            emailEvidence: {
              source: 'faculty-page',
              id: targetUrl,
              location: 'page-text-within-300chars',
              snippet: sem,
            },
          };
        }
      }

      // If on institution homepage, crawl at most 2 people/faculty/staff/team sublinks
      if (targetUrl === instHp) {
        const linkMatches = html.match(/href=["'](\/[^"'#\s]*?(people|faculty|staff|team)[^"'#\s]*?)["']/gi) || [];
        const subpaths = [
          ...new Set(
            linkMatches
              .map((m) => {
                const sub = m.match(/href=["']([^"']+)["']/i);
                return sub ? sub[1] : null;
              })
              .filter(Boolean)
          ),
        ].slice(0, 2);

        for (const sub of subpaths) {
          try {
            const subUrl = new URL(sub, origin).href;
            if (!isAllowedByRobots(subUrl, robotsTxt)) {
              robotsBlockedCount++;
              continue;
            }
            await throttleDomain(origin, 1000);

            const sres = await safeFetch(subUrl, { timeout: 8000 });
            if (sres.ok) {
              const shtml = await sres.text();
              const sstripped = shtml.replace(/<script[\s\S]*?<\/script>/gi, '')
                .replace(/<style[\s\S]*?<\/style>/gi, '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ');

              const subCandidateEmails = [
                ...(shtml.match(/mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi) || []).map((m) =>
                  m.replace(/^mailto:/i, '').toLowerCase().trim()
                ),
                ...(sstripped.match(EMAIL_REGEX) || []).map((e) => e.toLowerCase().trim()),
              ].filter((em) => !isBlockedRoleEmail(em));

              for (const sem of subCandidateEmails) {
                if (isFullNameNearEmail(sstripped, candidate.name)) {
                  const domain = sem.split('@')[1]?.toLowerCase();
                  const isPersonal = PERSONAL_DOMAINS.has(domain);

                  return {
                    status: 'found',
                    email: sem,
                    source: 'faculty-page',
                    bindingRule: '1c',
                    bindingStrength: 'strong',
                    emailOwner: candidate.name,
                    confidence: isPersonal ? 'personal-name-match' : 'institutional',
                    emailEvidence: {
                      source: 'faculty-page',
                      id: subUrl,
                      location: 'page-text-within-300chars',
                      snippet: sem,
                    },
                  };
                }
              }
            }
          } catch {
            // ignore sublink error
          }
        }
      }
    } catch {
      encounteredHttpError = true;
    }
  }

  if (encounteredHttpError) {
    return { status: 'http_error', reason: 'fetch_error' };
  }
  if (robotsBlockedCount > 0 && crawlUrls.length === robotsBlockedCount) {
    return { status: 'failed', reason: 'robots_blocked' };
  }

  return { status: 'failed', reason: 'no_name_match' };
}

// ─── Stage 2 Find Email Runner ────────────────────────────────────────────────
async function runStage2Email(options = {}) {
  const maxToProcess = options.limit || EMAIL_MAX;
  const isDryRun = Boolean(options.dryRun);
  const budgetMin = options.budgetMin || EMAIL_BUDGET_MIN;
  const stageStartTime = Date.now();
  const stageBudgetMs = budgetMin * 60 * 1000;

  console.log(`\n================================================================`);
  console.log(`📬 STAGE 2: FIND CANDIDATE EMAILS (Strict Author-Email Binding)`);
  console.log(`   Budget Target: ${maxToProcess} | Time Budget: ${budgetMin}m | Concurrency: 4 | Dry Run: ${isDryRun}`);
  console.log(`   Global Limit: 5 req/s to ebi.ac.uk | 1 req/s per faculty domain`);
  console.log(`================================================================`);

  resetPmcErrorCounts();

  let snapshot;
  try {
    if (options.candidates && options.candidates.length > 0) {
      snapshot = {
        docs: options.candidates.map((c) => ({
          id: c.id,
          ref: c.ref || null,
          data: () => c,
        })),
        size: options.candidates.length,
      };
    } else if (options.candidateIds && options.candidateIds.length > 0) {
      const docs = await Promise.all(
        options.candidateIds.map((id) => db.collection('candidates').doc(id).get())
      );
      snapshot = { docs: docs.filter((d) => d.exists) };
    } else {
      // 1. Query only status 'discovered' (orderBy updatedAt asc)
      let discoveredDocs = [];
      try {
        const snap = await db
          .collection('candidates')
          .where('status', '==', 'discovered')
          .orderBy('updatedAt', 'asc')
          .limit(maxToProcess)
          .get();
        discoveredDocs = snap.docs;
      } catch (orderErr) {
        // Fallback without orderBy in case composite index is building
        const snap = await db
          .collection('candidates')
          .where('status', '==', 'discovered')
          .limit(maxToProcess)
          .get();
        discoveredDocs = snap.docs;
      }

      const combinedDocs = [...discoveredDocs];

      // 2. Query 'no_email' separately, only where retryAfter <= now
      if (combinedDocs.length < maxToProcess) {
        const remainingLimit = maxToProcess - combinedDocs.length;
        const now = new Date();
        try {
          const noEmailSnap = await db
            .collection('candidates')
            .where('status', '==', 'no_email')
            .where('retryAfter', '<=', now)
            .limit(remainingLimit)
            .get();
          combinedDocs.push(...noEmailSnap.docs);
        } catch {
          // Non-fatal if index or field does not exist yet
        }
      }

      snapshot = {
        docs: combinedDocs,
        size: combinedDocs.length,
        empty: combinedDocs.length === 0,
      };
    }
  } catch (err) {
    console.error('   ❌ [Stage 2] Failed to query candidates from Firestore:', err.message);
    return { attempted: 0, found: 0, errors: [err.message] };
  }

  if (!snapshot.docs || snapshot.docs.length === 0) {
    console.log('   ℹ️ No candidates pending email resolution (status=discovered or retriable no_email).');
    return { attempted: 0, found: 0, author_mismatch_reassigned: 0, errors: [] };
  }

  let attempted = 0;
  let foundCount = 0;
  let noEmailCount = 0;
  let authorMismatchReassigned = 0;

  const foundBySource = {
    'pubmed-affiliation': 0,
    'europepmc-fulltext': 0,
    'core-fulltext': 0,
    orcid: 0,
    'faculty-page': 0,
  };

  const sourceDiagnostics = {
    pubmed: { attempted: 0, found: 0, failed: 0, skipped: 0, http_errors: 0 },
    'pmc-fulltext': { attempted: 0, found: 0, failed: 0, skipped_no_pmcid: 0, http_errors: 0 },
    'core-fulltext': { attempted: 0, found: 0, failed: 0, skipped_no_doi: 0, http_errors: 0 },
    orcid: { attempted: 0, found: 0, failed: 0, skipped: 0, http_errors: 0, reasons: { no_orcid: 0, no_public_email: 0, fetch_error: 0 } },
    'faculty-page': { attempted: 0, found: 0, failed: 0, skipped: 0, http_errors: 0, reasons: { no_homepage: 0, robots_blocked: 0, fetch_error: 0, no_name_match: 0 } },
  };

  const processedCandidates = [];
  const errors = [];
  const docsToProcess = snapshot.docs;
  let currentIndex = 0;

  const CONCURRENCY = 4;
  const workers = new Array(CONCURRENCY).fill(null).map(async (_, workerId) => {
    while (currentIndex < docsToProcess.length) {
      if (Date.now() - stageStartTime >= stageBudgetMs) {
        console.log(`⏱️ [Stage 2 Worker ${workerId}] Budget of ${budgetMin}m reached. Stopping cleanly.`);
        break;
      }

      const doc = docsToProcess[currentIndex++];
      if (!doc) break;
      attempted++;
      const cand = { id: doc.id, ref: doc.ref, ...doc.data() };
      const candId = doc.id;
      const candNum = attempted;

      // Requirement 3: Skip non-person authors
      if (isNonPersonAuthor(cand.name)) {
        console.log(`   ⏭️ [Stage 2 Non-Person Skipped] "${cand.name}" matches group/consortium keyword.`);
        if (!isDryRun) {
          await doc.ref.update({
            status: 'rejected',
            rejectReason: 'non_person_author',
            updatedAt: FieldValue.serverTimestamp(),
          }).catch(() => {});
        }
        processedCandidates.push({
          name: cand.name,
          email: 'N/A',
          emailOwner: 'N/A',
          bindingRule: 'none',
          result: 'REJECTED: non_person_author',
        });
        continue;
      }

      console.log(`   [Worker ${workerId + 1}] Candidate #${candNum}: ${cand.name} (${cand.institution})...`);

      let hit = null;

      // 1. PubMed
      const pubmedRes = await resolveViaPubMed(cand);
      if (pubmedRes.status === 'skipped') {
        sourceDiagnostics.pubmed.skipped++;
      } else {
        sourceDiagnostics.pubmed.attempted++;
        if (pubmedRes.status === 'found') {
          sourceDiagnostics.pubmed.found++;
          hit = pubmedRes;
          console.log(`      ✅ [Hit: PubMed] ${cand.name} -> ${hit.email} (Rule: ${hit.bindingRule})`);
        } else if (pubmedRes.status === 'http_error') {
          sourceDiagnostics.pubmed.http_errors++;
        } else {
          sourceDiagnostics.pubmed.failed++;
        }
      }

      // 2. Europe PMC Full Text XML
      if (!hit) {
        const epmcRes = await resolveViaEuropePmc(cand, isDryRun);
        if (epmcRes.status === 'skipped_no_pmcid') {
          sourceDiagnostics['pmc-fulltext'].skipped_no_pmcid++;
        } else {
          sourceDiagnostics['pmc-fulltext'].attempted++;
          if (epmcRes.status === 'found') {
            sourceDiagnostics['pmc-fulltext'].found++;
            hit = epmcRes;
            console.log(`      ✅ [Hit: Europe PMC] ${cand.name} -> ${hit.email} (Rule: ${hit.bindingRule})`);
          } else if (epmcRes.status === 'author_mismatch_reassigned') {
            authorMismatchReassigned++;
            hit = epmcRes;
            console.log(`      🔀 [Stage 2 Author Mismatch Reassigned] Email belongs to "${hit.reassignedTo}" <${hit.email}> [Inst: ${hit.institution}] [Role: ${hit.authorRole}] [Score: ${hit.relevanceScore}], not "${cand.name}". Created new candidate and reset "${cand.name}" to 'discovered'.`);
          } else if (epmcRes.status === 'http_error') {
            sourceDiagnostics['pmc-fulltext'].http_errors++;
          } else {
            sourceDiagnostics['pmc-fulltext'].failed++;
          }
        }
      }

      // 3. CORE API v3 Full Text (only for candidates with DOI and no PMCID)
      if (!hit) {
        const coreRes = await resolveViaCore(cand);
        if (coreRes.status === 'skipped_no_doi' || coreRes.status === 'skipped_no_key' || coreRes.status === 'skipped_max_requests') {
          sourceDiagnostics['core-fulltext'].skipped_no_doi++;
        } else {
          sourceDiagnostics['core-fulltext'].attempted++;
          if (coreRes.status === 'found') {
            sourceDiagnostics['core-fulltext'].found++;
            hit = coreRes;
            console.log(`      ✅ [Hit: CORE FullText] ${cand.name} -> ${hit.email} (Rule: ${hit.bindingRule})`);
          } else if (coreRes.status === 'http_error') {
            sourceDiagnostics['core-fulltext'].http_errors++;
          } else {
            sourceDiagnostics['core-fulltext'].failed++;
          }
        }
      }

      // 4. ORCID Public Profile
      let researcherUrls = [];
      if (!hit) {
        const orcidRes = await resolveViaOrcid(cand);
        if (orcidRes.status === 'skipped') {
          sourceDiagnostics.orcid.skipped++;
          if (orcidRes.reason) sourceDiagnostics.orcid.reasons[orcidRes.reason] = (sourceDiagnostics.orcid.reasons[orcidRes.reason] || 0) + 1;
        } else {
          sourceDiagnostics.orcid.attempted++;
          if (orcidRes.status === 'found') {
            sourceDiagnostics.orcid.found++;
            hit = orcidRes;
            console.log(`      ✅ [Hit: ORCID] ${cand.name} -> ${hit.email} (Rule: ${hit.bindingRule})`);
          } else if (orcidRes.status === 'http_error') {
            sourceDiagnostics.orcid.http_errors++;
            if (orcidRes.reason) sourceDiagnostics.orcid.reasons[orcidRes.reason] = (sourceDiagnostics.orcid.reasons[orcidRes.reason] || 0) + 1;
          } else {
            sourceDiagnostics.orcid.failed++;
            if (orcidRes.reason) sourceDiagnostics.orcid.reasons[orcidRes.reason] = (sourceDiagnostics.orcid.reasons[orcidRes.reason] || 0) + 1;
            researcherUrls = orcidRes.researcherUrls || [];
          }
        }
      }

      // 5. Faculty / Lab page
      if (!hit) {
        const facultyRes = await resolveViaFacultyPage(cand, researcherUrls);
        if (facultyRes.status === 'skipped') {
          sourceDiagnostics['faculty-page'].skipped++;
          if (facultyRes.reason) sourceDiagnostics['faculty-page'].reasons[facultyRes.reason] = (sourceDiagnostics['faculty-page'].reasons[facultyRes.reason] || 0) + 1;
        } else {
          sourceDiagnostics['faculty-page'].attempted++;
          if (facultyRes.status === 'found') {
            sourceDiagnostics['faculty-page'].found++;
            hit = facultyRes;
            console.log(`      ✅ [Hit: Faculty Page] ${cand.name} -> ${hit.email} (Rule: ${hit.bindingRule})`);
          } else if (facultyRes.status === 'http_error') {
            sourceDiagnostics['faculty-page'].http_errors++;
            if (facultyRes.reason) sourceDiagnostics['faculty-page'].reasons[facultyRes.reason] = (sourceDiagnostics['faculty-page'].reasons[facultyRes.reason] || 0) + 1;
          } else {
            sourceDiagnostics['faculty-page'].failed++;
            if (facultyRes.reason) sourceDiagnostics['faculty-page'].reasons[facultyRes.reason] = (sourceDiagnostics['faculty-page'].reasons[facultyRes.reason] || 0) + 1;
          }
        }
      }

      // Process Outcome
      if (hit && (hit.status === 'found' || hit.status === 'needs_review' || hit.status === 'ambiguous_corresp')) {
        const normEmail = hit.email ? hit.email.toLowerCase().trim() : (hit.emails?.[0]?.toLowerCase().trim() || null);
        const emailDomain = normEmail ? normEmail.split('@')[1]?.toLowerCase() : null;
        const isPersonal = emailDomain ? PERSONAL_DOMAINS.has(emailDomain) : false;
        const confidence = isPersonal ? 'personal-name-match' : (hit.confidence || 'institutional');
        const finalStatus = (hit.status === 'needs_review' || hit.status === 'ambiguous_corresp') ? 'needs_review' : 'email_found';

        if (finalStatus === 'email_found') {
          foundCount++;
          foundBySource[hit.source] = (foundBySource[hit.source] || 0) + 1;
        }

        const updatedCand = {
          email: normEmail,
          emailSource: hit.source,
          emailConfidence: confidence,
          bindingRule: hit.bindingRule || '1a',
          bindingStrength: hit.bindingStrength || 'strong',
          emailOwner: hit.emailOwner || cand.name,
          emailEvidence: hit.emailEvidence || null,
          ownerAffiliation: hit.ownerAffiliation || cand.ownerAffiliation || null,
          abstract: cand.abstract || hit.paperAbstract || null,
          status: finalStatus,
          reviewReason: hit.reviewReason || null,
          candidateEmails: hit.emails || null,
          attempts: (cand.attempts || 0) + 1,
          updatedAt: isDryRun ? new Date().toISOString() : FieldValue.serverTimestamp(),
        };

        if (isDryRun) {
          console.log(`      [DRY-RUN WOULD SAVE] ${cand.name} -> ${normEmail || 'multi-emails'} (${hit.source}, Rule: ${hit.bindingRule}, Status: ${finalStatus})`);
        } else {
          try {
            await db.collection('candidates').doc(candId).update(updatedCand);
          } catch (writeErr) {
            console.warn(`      ⚠️ Failed to update candidate ${cand.name}:`, writeErr.message);
            errors.push({ name: cand.name, error: writeErr.message });
          }
        }

        processedCandidates.push({
          id: candId,
          ...cand,
          ...updatedCand,
          result: finalStatus === 'needs_review' ? `NEEDS_REVIEW (${hit.reviewReason})` : `FOUND (${hit.source})`,
        });
      } else if (hit && hit.status === 'author_mismatch_reassigned') {
        processedCandidates.push({
          name: cand.name,
          email: hit.email,
          emailOwner: hit.reassignedTo,
          bindingRule: hit.bindingRule || '1a',
          bindingStrength: hit.bindingStrength || 'strong',
          status: 'reassigned',
          result: `REASSIGNED -> ${hit.reassignedTo}`,
        });
      } else {
        noEmailCount++;
        const attempts = (cand.attempts || 0) + 1;
        const newStatus = attempts >= 3 ? 'no_email' : 'discovered';
        const retryAfterDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // now + 30 days

        console.log(`      ❌ No email found for ${cand.name} across PubMed, PMC, ORCID, or faculty pages.`);

        if (isDryRun) {
          console.log(`      [DRY-RUN WOULD LOG NO EMAIL] Status: ${newStatus} (Attempts: ${attempts}) | retryAfter: +30d`);
        } else {
          try {
            const updatePayload = {
              status: newStatus,
              attempts,
              lastError: 'No email found adhering to strict author binding rules',
              updatedAt: FieldValue.serverTimestamp(),
            };
            if (newStatus === 'no_email') {
              updatePayload.retryAfter = retryAfterDate;
            }
            await db.collection('candidates').doc(candId).update(updatePayload);
          } catch (updateErr) {
            console.warn(`      ⚠️ Failed to mark candidate ${cand.name} without email:`, updateErr.message);
          }
        }

        processedCandidates.push({
          name: cand.name,
          email: 'N/A',
          emailOwner: 'N/A',
          bindingRule: 'none',
          result: 'FAILED (no email match)',
        });
      }
    }
  });

  await Promise.all(workers);

  console.log(`\n📋 STAGE 2 SUMMARY:`);
  console.log(`   - Attempted: ${attempted}`);
  console.log(`   - Emails Found: ${foundCount}`);
  console.log(`     * PubMed: ${foundBySource['pubmed-affiliation']}`);
  console.log(`     * Europe PMC: ${foundBySource['europepmc-fulltext']}`);
  console.log(`     * ORCID: ${foundBySource.orcid}`);
  console.log(`     * Faculty Page: ${foundBySource['faculty-page']}`);
  console.log(`   - Author Mismatches Reassigned: ${authorMismatchReassigned}`);
  console.log(`   - No Email: ${noEmailCount}`);
  console.log(`\n📊 PMC FullTextXML HTTP Error Breakdown:`);
  console.log(`   - 429 Too Many Requests: ${pmcHttpErrorCounts['429']}`);
  console.log(`   - 404 Not Found:         ${pmcHttpErrorCounts['404']}`);
  console.log(`   - 5xx Server Error:       ${pmcHttpErrorCounts['5xx']}`);
  console.log(`   - Timeout / Abort:        ${pmcHttpErrorCounts.timeout}`);
  console.log(`   - Other:                  ${pmcHttpErrorCounts.other}`);

  console.log(`\n📋 STAGE 2 AUTHOR-EMAIL BINDING TABLE:`);
  console.table(processedCandidates);

  return {
    attempted,
    found: foundCount,
    found_by_source: foundBySource,
    source_diagnostics: sourceDiagnostics,
    author_mismatch_reassigned: authorMismatchReassigned,
    pmc_http_errors: pmcHttpErrorCounts,
    no_email: noEmailCount,
    processed_candidates: processedCandidates,
    errors,
  };
}

module.exports = {
  runStage2Email,
  resolveViaPubMed,
  resolveViaEuropePmc,
  resolveViaOrcid,
  resolveViaFacultyPage,
  isFullNameNearEmail,
  isRule1bMatch,
  parseCandidateNames,
  resolveAcademicInstitutionDetails,
  pmcHttpErrorCounts,
  resetPmcErrorCounts,
  fetchPmcFullTextXmlWithRetry,
  parseJatsXml,
  matchEmailToContrib,
};
