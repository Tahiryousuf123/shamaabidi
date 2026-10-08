const dns = require('dns').promises;
const { db, FieldValue } = require('./db');
const {
  VERIFY_MAX,
  VERIFY_BUDGET_MIN,
  PERSONAL_DOMAINS,
  PERSONAL_MAX_SHARE,
  isNonPersonAuthor,
  isBlockedRoleEmail,
  extractDomain,
  USER_AGENT,
  CONTACT_EMAIL,
  sleep,
} = require('./config');

// ─── Blocklists & Constants ───────────────────────────────────────────────────
const BLOCKED_PREFIXES = [
  'noreply',
  'no-reply',
  'donotreply',
  'support',
  'info',
  'admin',
  'help',
  'privacy',
  'contact',
  'sales',
  'billing',
  'webmaster',
  'postmaster',
  'mailer-daemon',
  'editor',
  'office',
  'dept',
  'department',
  'enquir',
  'inquir',
  'hr',
  'journal',
  'permissions',
  'library',
  'secretary',
  'research',
  'admissions',
  'press',
  'media',
  'team',
  'service',
  'news',
  'reception',
  'registrar',
];

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'tempmail.com',
  '10minutemail.com',
  'guerrillamail.com',
  'temp-mail.org',
  'yopmail.com',
  'throwawaymail.com',
  'trashmail.com',
]);

const IMAGE_EXTENSIONS = /\.(png|jpg|jpeg|svg|gif|webp)$/i;

// In-memory DNS MX cache per domain
const mxCache = new Map();

// In-memory ROR/OpenAlex domain institution cache
const domainRorCache = new Map();

// Configure reliable nameservers if system defaults to loopback
try {
  const currentServers = require('dns').getServers();
  if (!currentServers.length || currentServers.every((s) => s.startsWith('127.'))) {
    require('dns').setServers(['8.8.8.8', '1.1.1.1']);
  }
} catch {
  // ignore
}

async function checkDomainMx(domain) {
  if (!domain || typeof domain !== 'string') return false;
  const cleanDomain = domain.toLowerCase().trim();

  if (mxCache.has(cleanDomain)) {
    return mxCache.get(cleanDomain);
  }

  try {
    const records = await dns.resolveMx(cleanDomain);
    const hasMx = Array.isArray(records) && records.length > 0;
    mxCache.set(cleanDomain, hasMx);
    return hasMx;
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'SERVFAIL') {
      try {
        require('dns').setServers(['8.8.8.8', '1.1.1.1']);
        const records = await dns.resolveMx(cleanDomain);
        const hasMx = Array.isArray(records) && records.length > 0;
        mxCache.set(cleanDomain, hasMx);
        return hasMx;
      } catch {
        mxCache.set(cleanDomain, false);
        return false;
      }
    }
    mxCache.set(cleanDomain, false);
    return false;
  }
}

// ─── Institution Resolution Helpers (Requirement 3) ───────────────────────────
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

async function queryRorByText(queryText) {
  if (!queryText) return null;
  const targetQuery = extractAcademicInstitutionQuery(queryText);
  if (!targetQuery) return null;

  try {
    const res = await fetch(`https://api.ror.org/organizations?query=${encodeURIComponent(targetQuery)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      const top = data.items?.[0];
      if (top) {
        const displayName =
          top.names?.find((n) => n.types.includes('ror_display'))?.value ||
          top.names?.[0]?.value ||
          targetQuery;
        return {
          displayName,
          ror: top.id,
          types: top.types || [],
        };
      }
    }
  } catch {
    // Non-fatal
  }

  return null;
}

function stripAccents(str) {
  return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function isDomainMatch(d1, d2) {
  if (!d1 || !d2) return false;
  d1 = d1.toLowerCase().replace(/^www\./, '').trim();
  d2 = d2.toLowerCase().replace(/^www\./, '').trim();
  if (d1 === d2) return true;
  if (d1.endsWith('.' + d2)) return true;
  if (d2.endsWith('.' + d1)) return true;
  return false;
}

async function queryInstitutionByDomain(domain) {
  if (!domain || PERSONAL_DOMAINS.has(domain)) return null;
  const cleanDomain = domain.toLowerCase().replace(/^www\./, '').trim();
  if (domainRorCache.has(cleanDomain)) return domainRorCache.get(cleanDomain);

  // 1. Try ROR v2 query with advanced domain filter, then standard query
  try {
    const rorUrls = [
      `https://api.ror.org/v2/organizations?query.advanced=domains:${encodeURIComponent(cleanDomain)}`,
      `https://api.ror.org/v2/organizations?query=${encodeURIComponent(cleanDomain)}`,
    ];
    for (const rUrl of rorUrls) {
      const res = await fetch(rUrl, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        let candidateMatch = null;
        for (const item of (data.items || [])) {
          if (item.status && item.status !== 'active') continue;
          const itemDomains = (item.domains || []).map((d) => d.toLowerCase().replace(/^www\./, '').trim());
          const linkDomains = (item.links || [])
            .filter((l) => l.type === 'website')
            .map((l) => extractDomain(l.value))
            .filter(Boolean);
          const allDomains = [...new Set([...itemDomains, ...linkDomains])];

          const exact = allDomains.some((d) => d === cleanDomain);
          const matched = allDomains.some((d) => isDomainMatch(d, cleanDomain));

          if (exact || matched) {
            const displayName =
              item.names?.find((n) => n.types.includes('ror_display'))?.value ||
              item.names?.[0]?.value;
            const resObj = {
              displayName,
              ror: item.id,
              types: item.types || ['education'],
              source: 'email-domain-ror',
              domains: allDomains,
            };
            if (exact) {
              domainRorCache.set(cleanDomain, resObj);
              return resObj;
            }
            if (!candidateMatch) candidateMatch = resObj;
          }
        }
        if (candidateMatch) {
          domainRorCache.set(cleanDomain, candidateMatch);
          return candidateMatch;
        }
      }
    }
  } catch {
    // Non-fatal
  }

  // 2. Try OpenAlex institutions search by domain, strictly validating exact/suffix domain match
  try {
    const res = await fetch(
      `https://api.openalex.org/institutions?search=${encodeURIComponent(cleanDomain)}&mailto=${CONTACT_EMAIL}`,
      {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (res.ok) {
      const data = await res.json();
      for (const item of (data.results || [])) {
        const homeDomain = extractDomain(item.homepage_url);
        if (homeDomain && isDomainMatch(homeDomain, cleanDomain)) {
          const resObj = {
            displayName: item.display_name,
            ror: item.ror || null,
            types: item.type ? [item.type] : ['education'],
            source: 'email-domain-openalex',
          };
          domainRorCache.set(cleanDomain, resObj);
          return resObj;
        }
      }
    }
  } catch {
    // Non-fatal
  }

  domainRorCache.set(cleanDomain, null);
  return null;
}

/**
 * Resolve institution strictly from the email owner in priority order:
 * (a) for institutional email domains, resolve domain -> ROR/OpenAlex (cached per domain, strictly validated)
 * (b) fallback to JATS affiliation -> ROR / clean text
 * (c) mark needs_review with reason 'institution-domain-mismatch' if domain does not match. Never put unverified institution in draft!
 */
async function resolveOwnerInstitution(candidate, email) {
  const domain = extractDomain(email);
  const isPersonal = !domain || PERSONAL_DOMAINS.has(domain);

  // (a) Priority 1 for institutional email: verified domain -> ROR/OpenAlex
  if (!isPersonal) {
    const domMatch = await queryInstitutionByDomain(domain);
    if (domMatch) {
      return {
        displayName: domMatch.displayName,
        ror: domMatch.ror,
        types: domMatch.types,
        institutionSource: domMatch.source || 'email-domain-ror',
      };
    }
  }

  // (b) Priority 2 / Fallback: Owner's own <aff> in JATS
  if (candidate.ownerAffiliation) {
    const rorMatch = await queryRorByText(candidate.ownerAffiliation);
    if (rorMatch) {
      return {
        displayName: rorMatch.displayName,
        ror: rorMatch.ror,
        types: rorMatch.types,
        institutionSource: 'jats-aff-ror',
      };
    }
    const cleanAff = extractAcademicInstitutionQuery(candidate.ownerAffiliation);
    if (cleanAff) {
      return {
        displayName: cleanAff,
        ror: null,
        types: ['education'],
        institutionSource: 'jats-aff',
      };
    }
  }

  // (c) If institutional email domain could not be resolved and no JATS aff, mark mismatch
  if (!isPersonal) {
    return {
      displayName: candidate.institution || 'Academic Medical Center',
      ror: candidate.ror || null,
      types: ['unverified'],
      institutionSource: 'institution-domain-mismatch',
    };
  }

  // Personal emails: use candidate institution if present
  if (candidate.institution && candidate.institution !== 'Academic Medical Center') {
    return {
      displayName: candidate.institution,
      ror: candidate.ror || null,
      types: ['unverified'],
      institutionSource: 'openalex-unverified',
    };
  }

  return {
    displayName: 'Academic Medical Center',
    ror: null,
    types: ['unverified'],
    institutionSource: 'openalex-unverified',
  };
}

const NON_ACADEMIC_SOCIETIES = /\b(accp|espid|nhs commissioners?|nhs commissioning|commissioners?|council|ministry|ministries|association|society)\b/i;

function checkIsNonAcademicInstitution(displayName, types = [], ownerAff = '') {
  const isEdu = types.includes('education');
  const isNonAcademicType = types.some((t) => ['government', 'company', 'nonprofit', 'other'].includes(t));

  if (isNonAcademicType && !isEdu) return true;

  if (NON_ACADEMIC_SOCIETIES.test(displayName) || (ownerAff && NON_ACADEMIC_SOCIETIES.test(ownerAff))) {
    if (!/\b(university|college|school of|academic)\b/i.test(displayName)) {
      return true;
    }
  }

  return false;
}

// ─── Institution Domain Match Helper ──────────────────────────────────────────
function isEmailDomainMatchingInstitution(emailOrDomain, param2, param3) {
  if (!emailOrDomain) return false;
  const cleanEmailDom = (
    emailOrDomain.includes('@') ? extractDomain(emailOrDomain) || emailOrDomain : emailOrDomain
  ).toLowerCase().trim();

  const instHomepage = param2 && param2.startsWith('http') ? param2 : param3 && param3.startsWith('http') ? param3 : null;
  const instName = param2 && !param2.startsWith('http') ? param2 : param3 && !param3.startsWith('http') ? param3 : null;

  // 1. Compare against institution homepage URL
  const homeDom = extractDomain(instHomepage);
  if (homeDom) {
    if (cleanEmailDom === homeDom || cleanEmailDom.endsWith('.' + homeDom) || homeDom.endsWith('.' + cleanEmailDom)) {
      return true;
    }
    const emailParts = cleanEmailDom.split('.');
    const homeParts = homeDom.split('.');
    if (emailParts.length >= 2 && homeParts.length >= 2) {
      const emailRoot = emailParts.slice(-2).join('.');
      const homeRoot = homeParts.slice(-2).join('.');
      if (emailRoot === homeRoot) return true;
    }
  }

  // 2. Compare against institution name tokens/acronyms
  if (instName) {
    const instLower = instName.toLowerCase();
    const prefix = cleanEmailDom.split('.')[0];
    if (prefix.length >= 4 && instLower.includes(prefix)) {
      return true;
    }
  }

  return false;
}

// ─── Single Email Verifier ────────────────────────────────────────────────────
async function verifyCandidateEmail(email, candidate = {}) {
  if (!email || typeof email !== 'string') {
    return { valid: false, hardReject: true, reason: 'Empty or non-string email' };
  }

  const clean = email.toLowerCase().trim().replace(/[.,;:\s>)]+$/, '');

  // 1. Hard Reject Checks
  if (isNonPersonAuthor(candidate.name)) {
    return { valid: false, hardReject: true, reason: 'non_person_author' };
  }

  if (IMAGE_EXTENSIONS.test(clean)) {
    return { valid: false, hardReject: true, reason: 'image_asset_extension' };
  }

  const parts = clean.split('@');
  if (parts.length !== 2) {
    return { valid: false, hardReject: true, reason: 'invalid_syntax' };
  }

  const [localPart, domain] = parts;
  if (!localPart || !domain || !domain.includes('.')) {
    return { valid: false, hardReject: true, reason: 'invalid_syntax' };
  }

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { valid: false, hardReject: true, reason: 'disposable_domain' };
  }

  if (isBlockedRoleEmail(clean)) {
    return { valid: false, hardReject: true, reason: 'generic_role_prefix' };
  }

  for (const prefix of BLOCKED_PREFIXES) {
    if (localPart.startsWith(prefix)) {
      return { valid: false, hardReject: true, reason: `generic_role_prefix (${prefix})` };
    }
  }

  const hasMx = await checkDomainMx(domain);
  if (!hasMx) {
    return { valid: false, hardReject: true, reason: `no_mx_records (${domain})` };
  }

  if (candidate.status === 'bounced') {
    return { valid: false, hardReject: true, reason: 'bounced' };
  }

  // 2. Personal Email Policy (Part C)
  const isPersonal = PERSONAL_DOMAINS.has(domain);
  let confidence = candidate.emailConfidence || (isPersonal ? 'personal-name-match' : 'institutional');

  if (isPersonal) {
    const rawTokens = (candidate.name || '')
      .replace(/^Dr\.\s*|^Prof\.\s*|^Professor\s*/i, '')
      .split(/\s+/)
      .map((t) => stripAccents(t).toLowerCase().replace(/[^a-z0-9]/g, ''))
      .filter((t) => t.length >= 3);
    const localClean = stripAccents(localPart).toLowerCase().replace(/[^a-z0-9]/g, '');
    const hasNameMatch = rawTokens.some((t) => localClean.includes(t));

    const fromPaperOrProfile = ['europepmc-fulltext', 'core-fulltext', 'pubmed-affiliation', 'orcid', 'faculty-page'].includes(candidate.emailSource);

    if (hasNameMatch) {
      confidence = 'personal-name-match';
    } else if (fromPaperOrProfile) {
      confidence = 'personal-from-paper';
    } else {
      return { valid: false, hardReject: true, reason: 'unverified_webmail_no_name_match' };
    }
  }

  // 3. Pre-existing Review Reason from Stage 2 (Weak binding, ambiguous corresp)
  let needsReview = false;
  let reviewReason = candidate.reviewReason || null;
  if (candidate.status === 'needs_review' && reviewReason) {
    needsReview = true;
  }

  // 4. Resolve Institution from Email Owner
  const instRes = await resolveOwnerInstitution(candidate, clean);
  const cleanInstName = instRes.displayName;

  // Check: Institutional domain mismatch or OpenAlex unverified institution
  if (instRes.institutionSource === 'institution-domain-mismatch') {
    needsReview = true;
    if (!reviewReason) reviewReason = 'institution-domain-mismatch';
  } else if (instRes.institutionSource === 'openalex-unverified') {
    needsReview = true;
    if (!reviewReason) reviewReason = 'openalex-unverified';
  }

  // Check: Government (e.g. VA Hospital), non-academic ROR type, or Society
  const rorTypes = instRes.types || [];
  const isEdu = rorTypes.includes('education');
  const isHealth = rorTypes.includes('healthcare');
  const isGov = rorTypes.includes('government') || /\b(va\.gov|veterans affairs|ministry)\b/i.test(domain + ' ' + cleanInstName);

  if (isGov && !isEdu) {
    needsReview = true;
    if (!reviewReason) reviewReason = 'government-institution';
  } else if (checkIsNonAcademicInstitution(cleanInstName, rorTypes, candidate.ownerAffiliation)) {
    needsReview = true;
    if (!reviewReason) reviewReason = 'non-academic-institution';
  }

  // Check: ORCID domain mismatch
  if (candidate.emailSource === 'orcid') {
    const matchesInst = isEmailDomainMatchingInstitution(domain, candidate.institutionHomepage, cleanInstName);
    if (!matchesInst) {
      confidence = 'orcid-domain-mismatch';
      needsReview = true;
      if (!reviewReason) reviewReason = 'orcid-domain-mismatch';
    }
  }

  const institutionType = isEdu ? 'education' : (isHealth ? 'healthcare' : (isGov ? 'government' : (rorTypes[0] || 'other')));

  return {
    valid: true,
    hardReject: false,
    needsReview,
    reviewReason,
    email: clean,
    confidence,
    institution: cleanInstName,
    institutionType,
    institutionSource: instRes.institutionSource,
    ror: instRes.ror || candidate.ror || null,
    rorTypes,
  };
}

// ─── Stage 3 Verify Runner ────────────────────────────────────────────────────
async function runStage3Verify(options = {}) {
  const maxToProcess = options.limit || VERIFY_MAX;
  const isDryRun = Boolean(options.dryRun);
  const budgetMin = options.budgetMin || VERIFY_BUDGET_MIN;
  const stageStartTime = Date.now();
  const stageBudgetMs = budgetMin * 60 * 1000;

  console.log(`\n================================================================`);
  console.log(`🛡️ STAGE 3: VERIFY CANDIDATE EMAILS & INSTITUTIONS`);
  console.log(`   Budget Target: ${maxToProcess} | Time Budget: ${budgetMin}m | Dry Run: ${isDryRun}`);
  console.log(`================================================================`);

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
        empty: options.candidates.length === 0,
      };
    } else {
      // 1. Query only status 'email_found' - do not requeue 'needs_review' every round!
      const emailFoundSnap = await db
        .collection('candidates')
        .where('status', '==', 'email_found')
        .limit(maxToProcess)
        .get();

      let combinedDocs = [...emailFoundSnap.docs];

      // 2. Query 'needs_review' separately only where retryAfter <= now
      if (combinedDocs.length < maxToProcess) {
        const remainingLimit = maxToProcess - combinedDocs.length;
        const now = new Date();
        try {
          const reviewSnap = await db
            .collection('candidates')
            .where('status', '==', 'needs_review')
            .where('retryAfter', '<=', now)
            .limit(remainingLimit)
            .get();
          combinedDocs.push(...reviewSnap.docs);
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
    console.error('   ❌ [Stage 3] Failed to query candidates for verification:', err.message);
    return { attempted: 0, passed: 0, needs_review: 0, rejected: 0, rejected_by_reason: {}, errors: [err.message] };
  }

  if (!snapshot.docs || snapshot.docs.length === 0) {
    console.log('   ℹ️ No candidates pending verification (status=email_found or retriable needs_review).');
    return { attempted: 0, passed: 0, needs_review: 0, rejected: 0, rejected_by_reason: {}, orcid_domain_mismatches: 0, errors: [] };
  }

  let attempted = 0;
  let passedCount = 0;
  let needsReviewCount = 0;
  let rejectedCount = 0;
  let orcidDomainMismatches = 0;
  const rejectedByReason = {};
  const processedCandidates = [];
  const errors = [];
  const verifyReport = [];

  for (const doc of snapshot.docs) {
    if (Date.now() - stageStartTime >= stageBudgetMs) {
      console.log(`⏱️ [Stage 3] Time budget of ${budgetMin}m reached. Stopping cleanly.`);
      break;
    }

    attempted++;
    const cand = doc.data();

    console.log(`   [${attempted}/${snapshot.size}] Verifying: ${cand.name} <${cand.email || 'N/A'}> (Source: ${cand.emailSource || 'n/a'})...`);

    const result = await verifyCandidateEmail(cand.email, cand);

    if (result.hardReject) {
      rejectedCount++;
      const reasonKey = result.reason?.split(' ')[0] || 'Verification Failed';
      rejectedByReason[reasonKey] = (rejectedByReason[reasonKey] || 0) + 1;

      console.log(`      ❌ HARD REJECTED: ${result.reason}`);
      verifyReport.push({
        Name: cand.name,
        Institution: (cand.institution || '').slice(0, 30),
        Email: cand.email || 'N/A',
        Status: 'rejected',
        Reason: result.reason,
      });

      if (isDryRun) {
        console.log(`      📝 [DRY-RUN WOULD MARK REJECTED] ${cand.name}: ${result.reason}`);
      } else {
        try {
          await doc.ref.update({
            status: 'rejected',
            rejectReason: result.reason,
            lastError: result.reason,
            updatedAt: FieldValue.serverTimestamp(),
          });
        } catch (updateErr) {
          console.warn(`      ⚠️ Failed to mark candidate rejected:`, updateErr.message);
          errors.push({ name: cand.name, error: updateErr.message });
        }
      }
    } else if (result.needsReview) {
      needsReviewCount++;
      console.log(`      ⚠️ NEEDS REVIEW: ${result.reviewReason} (Institution: ${result.institution})`);
      verifyReport.push({
        Name: cand.name,
        Institution: (result.institution || cand.institution || '').slice(0, 30),
        Email: result.email,
        Status: 'needs_review',
        Reason: result.reviewReason,
      });

      const updatedCand = {
        ...cand,
        email: result.email,
        emailConfidence: result.confidence,
        institution: result.institution,
        institutionType: result.institutionType,
        institutionSource: result.institutionSource,
        ror: result.ror,
        rorTypes: result.rorTypes || [],
        status: 'needs_review',
        reviewReason: result.reviewReason,
        retryAfter: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: isDryRun ? new Date().toISOString() : FieldValue.serverTimestamp(),
      };
      processedCandidates.push(updatedCand);

      if (isDryRun) {
        console.log(`      📝 [DRY-RUN WOULD MARK NEEDS_REVIEW] ${cand.name}: ${result.reviewReason} | retryAfter: +30d`);
      } else {
        try {
          await doc.ref.update({
            email: result.email,
            emailConfidence: result.confidence,
            institution: result.institution,
            institutionType: result.institutionType,
            institutionSource: result.institutionSource,
            ror: result.ror,
            rorTypes: result.rorTypes || [],
            status: 'needs_review',
            reviewReason: result.reviewReason,
            retryAfter: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            updatedAt: FieldValue.serverTimestamp(),
          });
        } catch (updateErr) {
          console.warn(`      ⚠️ Failed to mark candidate needs_review:`, updateErr.message);
          errors.push({ name: cand.name, error: updateErr.message });
        }
      }
    } else {
      passedCount++;
      console.log(`      ✅ PASSED & VERIFIED [${result.institutionSource} -> ${result.institution} (${result.institutionType})]`);
      verifyReport.push({
        Name: cand.name,
        Institution: (result.institution || '').slice(0, 30),
        Email: result.email,
        Status: 'verified',
        Reason: 'PASSED',
      });

      const updatedCand = {
        ...cand,
        email: result.email,
        emailConfidence: result.confidence,
        institution: result.institution,
        institutionType: result.institutionType,
        institutionSource: result.institutionSource,
        ror: result.ror,
        rorTypes: result.rorTypes || [],
        status: 'verified',
        reviewReason: null,
        updatedAt: isDryRun ? new Date().toISOString() : FieldValue.serverTimestamp(),
      };
      processedCandidates.push(updatedCand);

      if (isDryRun) {
        console.log(`      📝 [DRY-RUN WOULD MARK VERIFIED] ${cand.name} (${result.institution})`);
      } else {
        try {
          await doc.ref.update({
            email: result.email,
            emailConfidence: result.confidence,
            institution: result.institution,
            institutionType: result.institutionType,
            institutionSource: result.institutionSource,
            ror: result.ror,
            rorTypes: result.rorTypes || [],
            status: 'verified',
            reviewReason: null,
            updatedAt: FieldValue.serverTimestamp(),
          });
        } catch (updateErr) {
          console.warn(`      ⚠️ Failed to mark candidate verified:`, updateErr.message);
          errors.push({ name: cand.name, error: updateErr.message });
        }
      }
    }

    await sleep(50);
  }

  console.log(`\n📋 STAGE 3 SUMMARY:`);
  console.log(`   - Candidates Attempted: ${attempted}`);
  console.log(`   - Passed (Verified):     ${passedCount}`);
  console.log(`   - Needs Review:          ${needsReviewCount}`);
  console.log(`   - Rejected:              ${rejectedCount}`);
  if (Object.keys(rejectedByReason).length > 0) {
    console.log(`   - Rejected Breakdown:`);
    for (const [r, cnt] of Object.entries(rejectedByReason)) {
      console.log(`     * ${r}: ${cnt}`);
    }
  }

  console.log(`\n📋 CANDIDATE VERIFICATION TABLE:`);
  console.table(verifyReport);

  return {
    attempted,
    passed: passedCount,
    needs_review: needsReviewCount,
    rejected: rejectedCount,
    rejected_by_reason: rejectedByReason,
    orcid_domain_mismatches: orcidDomainMismatches,
    processed_candidates: processedCandidates,
    verify_report: verifyReport,
    errors,
  };
}

module.exports = {
  runStage3Verify,
  verifyCandidateEmail,
  checkDomainMx,
  resolveOwnerInstitution,
  isEmailDomainMatchingInstitution,
};
