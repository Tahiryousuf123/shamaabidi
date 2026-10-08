const { db, FieldValue } = require('./db');
const {
  CONTACT_EMAIL,
  USER_AGENT,
  DISCOVER_MAX,
  DISCOVER_BUDGET_MIN,
  RELEVANCE_THRESHOLD,
  OA_SHARE,
  SEARCH_TOPICS,
  RELEVANCE_KEYWORDS,
  NEGATIVE_TOPICS,
  isNonPersonAuthor,
  sha1,
  normalizeKey,
  sleep,
} = require('./config');

// ─── In-Memory Caches ─────────────────────────────────────────────────────────
const authorTopicWorksCache = new Map();
const institutionCache = new Map();

// ─── Abstract & Name Extraction Helpers ───────────────────────────────────────
function reconstructAbstract(invertedIndex) {
  if (!invertedIndex || typeof invertedIndex !== 'object') return null;
  const words = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    if (Array.isArray(positions)) {
      for (const pos of positions) {
        words[pos] = word;
      }
    }
  }
  const joined = words.filter(Boolean).join(' ').trim();
  return joined.length > 0 ? joined : null;
}

function parseAuthorSurname(name) {
  if (!name || typeof name !== 'string') return '';
  let clean = name.replace(/^Dr\.\s*|^Prof\.\s*|^Professor\s*/i, '').trim();
  const tokens = clean.split(/\s+/).filter(Boolean);
  if (tokens.length === 1) return tokens[0];
  if (/^[A-Z]{1,3}\.?$/.test(tokens[tokens.length - 1])) {
    return tokens.slice(0, -1).join(' ');
  }
  if (/^[A-Z]\.?$/i.test(tokens[0]) && tokens.length === 2) {
    return tokens[1];
  }
  return tokens[tokens.length - 1];
}

function parseAuthorGivenNames(name) {
  if (!name || typeof name !== 'string') return '';
  let clean = name.replace(/^Dr\.\s*|^Prof\.\s*|^Professor\s*/i, '').trim();
  const tokens = clean.split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) return '';
  if (/^[A-Z]{1,3}\.?$/.test(tokens[tokens.length - 1])) {
    return tokens[tokens.length - 1];
  }
  if (/^[A-Z]\.?$/i.test(tokens[0]) && tokens.length === 2) {
    return tokens[0];
  }
  return tokens.slice(0, -1).join(' ');
}

// ─── Relevance Scoring & Negative Topics Filter (Requirement 3) ───────────────
function calculateRelevance(workTitle, abstractText = '', concepts = []) {
  const titleLower = (workTitle || '').toLowerCase();
  const absLower = (abstractText || '').toLowerCase();
  const conceptsText = concepts.map((c) => (c.display_name || '').toLowerCase()).join(' ');
  const combined = `${titleLower} ${absLower} ${conceptsText}`;

  // 1. Check negative / non-evidence-based topics
  for (const neg of NEGATIVE_TOPICS) {
    if (combined.includes(neg.toLowerCase())) {
      return {
        score: 0,
        distinctHits: 0,
        hasTitleHit: false,
        matchedKeywords: [],
        isNegativeTopic: true,
        matchedNegative: neg,
      };
    }
  }

  // 2. Positive keywords check
  const matchedKeywords = [];
  let hasTitleHit = false;

  for (const kw of RELEVANCE_KEYWORDS) {
    const kwLower = kw.toLowerCase();
    if (combined.includes(kwLower)) {
      matchedKeywords.push(kw);
      if (titleLower.includes(kwLower)) {
        hasTitleHit = true;
      }
    }
  }

  // Score formula: 15 per distinct hit + 20 bonus for title hit, capped at 100
  const distinctHits = matchedKeywords.length;
  const score = Math.min(100, distinctHits * 15 + (hasTitleHit ? 20 : 0));

  return {
    score,
    distinctHits,
    hasTitleHit,
    matchedKeywords,
    isNegativeTopic: false,
    matchedNegative: null,
  };
}

// ─── OpenAlex Institution Homepage Enrichment Helper ─────────────────────────
async function getInstitutionHomepage(instId) {
  if (!instId) return null;
  const cleanId = instId.replace(/^https?:\/\/openalex\.org\//, '').trim();
  if (institutionCache.has(cleanId)) return institutionCache.get(cleanId);

  try {
    const res = await fetch(`https://api.openalex.org/institutions/${cleanId}?mailto=${CONTACT_EMAIL}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = await res.json();
      const hp = data.homepage_url || null;
      institutionCache.set(cleanId, hp);
      return hp;
    }
  } catch {
    // Non-fatal
  }

  institutionCache.set(cleanId, null);
  return null;
}

// ─── OpenAlex Author Enrichment (ORCID preferred, else name + institution) ────
async function enrichAuthorViaOpenAlex(orcid, authorName, rawAffiliation) {
  // 1. Preferred: Match by ORCID
  if (orcid) {
    const cleanOrcid = orcid.replace(/^https?:\/\/orcid\.org\//, '').trim();
    try {
      const url = `https://api.openalex.org/authors?filter=orcid:${cleanOrcid}&mailto=${CONTACT_EMAIL}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        const data = await res.json();
        const a = data.results?.[0];
        if (a) {
          const instObj = a.last_known_institutions?.[0];
          const instHp = instObj?.id ? await getInstitutionHomepage(instObj.id) : null;
          return {
            openalexId: a.id,
            name: a.display_name || authorName,
            orcid: cleanOrcid,
            institution: instObj?.display_name || null,
            institutionHomepage: instHp,
            country: instObj?.country_code || null,
            ror: instObj?.ror || null,
            worksCount: a.works_count || 0,
            hIndex: a.summary_stats?.h_index || 0,
          };
        }
      }
    } catch {
      // Non-fatal
    }
  }

  // 2. Fallback: Match by author display name + institution keywords
  if (authorName) {
    try {
      const searchTerms = [authorName];
      const parts = authorName.trim().split(/\s+/);
      if (parts.length === 2 && parts[1].length <= 2) {
        searchTerms.push(`${parts[1]} ${parts[0]}`); // e.g. "Jordan I" -> "I Jordan"
      }

      for (const term of searchTerms) {
        const url = `https://api.openalex.org/authors?search=${encodeURIComponent(term)}&mailto=${CONTACT_EMAIL}&per-page=5`;
        const res = await fetch(url, {
          headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
          signal: AbortSignal.timeout(4000),
        });
        if (res.ok) {
          const data = await res.json();
          const results = data.results || [];
          if (results.length > 0) {
            let bestMatch = null;
            const affLower = (rawAffiliation || '').toLowerCase();

            if (affLower) {
              for (const cand of results) {
                const candInsts = (cand.last_known_institutions || []).concat(
                  (cand.affiliations || []).map((af) => af.institution).filter(Boolean)
                );
                for (const ci of candInsts) {
                  const ciName = (ci.display_name || '').toLowerCase();
                  if (ciName && (affLower.includes(ciName) || ciName.split(' ').some((w) => w.length > 4 && affLower.includes(w)))) {
                    bestMatch = { cand, inst: ci };
                    break;
                  }
                }
                if (bestMatch) break;
              }
            }

            const chosen = bestMatch ? bestMatch.cand : results[0];
            const chosenInst = bestMatch ? bestMatch.inst : chosen.last_known_institutions?.[0];
            const instHp = chosenInst?.id ? await getInstitutionHomepage(chosenInst.id) : null;

            return {
              openalexId: chosen.id,
              name: chosen.display_name || authorName,
              orcid: chosen.orcid ? chosen.orcid.replace(/^https?:\/\/orcid\.org\//, '').trim() : null,
              institution: chosenInst?.display_name || null,
              institutionHomepage: instHp,
              country: chosenInst?.country_code || null,
              ror: chosenInst?.ror || null,
              worksCount: chosen.works_count || 0,
              hIndex: chosen.summary_stats?.h_index || 0,
            };
          }
        }
      }
    } catch {
      // Non-fatal
    }
  }

  return null;
}

// ─── First-Only Author Topic Works Check (>= 2 works in topic list) ───────────
async function checkAuthorTopicWorks(openalexId) {
  if (!openalexId) return 0;
  const shortId = openalexId.replace(/^https?:\/\/openalex\.org\//, '').trim();
  if (authorTopicWorksCache.has(shortId)) {
    return authorTopicWorksCache.get(shortId);
  }

  try {
    const topicsSearch = SEARCH_TOPICS.join(' OR ');
    const url = `https://api.openalex.org/works?filter=author.id:${shortId}&search=${encodeURIComponent(topicsSearch)}&mailto=${CONTACT_EMAIL}&per-page=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = await res.json();
      const count = data.meta?.count || 0;
      authorTopicWorksCache.set(shortId, count);
      return count;
    }
  } catch {
    // Non-fatal
  }

  authorTopicWorksCache.set(shortId, 0);
  return 0;
}

// ─── Stage 1 Discovery Runner ─────────────────────────────────────────────────
async function runStage1Discover(options = {}) {
  const maxToDiscover = options.limit || DISCOVER_MAX;
  const isDryRun = Boolean(options.dryRun);
  const budgetMin = options.budgetMin || DISCOVER_BUDGET_MIN;
  const stageStartTime = Date.now();
  const stageBudgetMs = budgetMin * 60 * 1000;

  // Split target based on OA_SHARE configuration
  const epmcTarget = Math.round(maxToDiscover * OA_SHARE);
  const openalexTarget = maxToDiscover - epmcTarget;

  console.log(`\n================================================================`);
  console.log(`📡 STAGE 1: HYBRID OPEN-ACCESS-FIRST DISCOVERY`);
  console.log(`   Total Target: ${maxToDiscover} | Time Budget: ${budgetMin}m | Dry Run: ${isDryRun}`);
  console.log(`   Mix Configuration: OA_SHARE = ${OA_SHARE} (Europe PMC: ${epmcTarget}, OpenAlex OA: ${openalexTarget})`);
  console.log(`================================================================`);

  // Load persisted topic cursors from Firestore state/cursors (read-only in dry-run)
  let cursors = {};
  try {
    const cursorSnap = await db.collection('state').doc('cursors').get();
    if (cursorSnap.exists) {
      cursors = cursorSnap.data() || {};
    }
  } catch (err) {
    console.warn('   [Stage 1] Could not load state/cursors, starting fresh:', err.message);
  }

  let discoveredNew = 0;
  let skippedDup = 0;
  let rejectedRelevance = 0;
  let skippedJunior = 0;
  const discoveredCandidates = [];
  const errors = [];

  // ═════════════════════════════════════════════════════════════════════════════
  // MODE 1: Europe PMC REST Search (Direct Open-Access Query)
  // ═════════════════════════════════════════════════════════════════════════════
  if (epmcTarget > 0) {
    console.log(`\n----------------------------------------------------------------`);
    console.log(`🇪🇺 MODE 1: Europe PMC Open-Access REST Discovery (Target: ${epmcTarget})`);
    console.log(`----------------------------------------------------------------`);

    for (const topic of SEARCH_TOPICS) {
      if (discoveredNew >= epmcTarget) break;
      if (Date.now() - stageStartTime >= stageBudgetMs) {
        console.log(`⏱️ [Stage 1] Time budget of ${budgetMin}m reached during Europe PMC search.`);
        break;
      }

      const topicKey = normalizeKey(topic);
      const cursorKey = `epmc_${topicKey}`;
      const cursor = cursors[cursorKey] || '*';

      console.log(`\n🔍 Searching Europe PMC for: "${topic}" (cursor: ${cursor.slice(0, 15)}...)`);

      const epmcQuery = `(${topic}) AND OPEN_ACCESS:y AND HAS_FT:y AND PUB_YEAR:[2022 TO 2026]`;
      const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(epmcQuery)}&resultType=core&pageSize=100&cursorMark=${encodeURIComponent(cursor)}&format=json`;

      let epmcData;
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': USER_AGENT,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) {
          throw new Error(`Europe PMC HTTP ${res.status}: ${res.statusText}`);
        }

        epmcData = await res.json();
      } catch (err) {
        console.error(`   ❌ [Stage 1] Failed to query Europe PMC for "${topic}":`, err.message);
        errors.push({ source: 'epmc', topic, error: err.message });
        continue;
      }

      const results = epmcData.resultList?.result || [];
      const nextCursor = epmcData.nextCursorMark;

      let topicFetched = results.length;
      let topicRejected = 0;
      let topicAdded = 0;

      if (results.length === 0 || nextCursor === cursor) {
        console.log(`   ℹ️ No more works returned from Europe PMC for "${topic}". Resetting cursor to '*'.`);
        cursors[cursorKey] = '*';
        if (!isDryRun) {
          await db.collection('state')
            .doc('cursors')
            .set({ [cursorKey]: '*' }, { merge: true })
            .catch((e) => console.warn('Failed to persist Europe PMC cursor reset:', e.message));
        }
        console.log(`   📊 [Topic Discovery: Europe PMC] "${topic}": fetched ${topicFetched}, rejected ${topicRejected}, added ${topicAdded} (cursor reset to '*')`);
        continue;
      }

      for (const r of results) {
        if (discoveredNew >= epmcTarget) break;
        if (Date.now() - stageStartTime >= stageBudgetMs) break;

        const workTitle = r.title?.trim() || 'Clinical Pharmacy Research';
        const pubYear = parseInt(r.pubYear, 10) || new Date().getFullYear();
        const pmcid = r.pmcid || null;
        const pmid = r.pmid || null;
        const doi = r.doi || null;
        const cleanAbstract = r.abstractText
          ? r.abstractText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
          : null;

        const rel = calculateRelevance(workTitle, cleanAbstract, []);
        if (rel.isNegativeTopic) {
          rejectedRelevance++;
          console.log(`   ⛔ [Stage 1 Negative Topic Rejected] "${workTitle.slice(0, 60)}" (Matched: ${rel.matchedNegative})`);
          continue;
        }
        if (rel.distinctHits === 0 || rel.score < RELEVANCE_THRESHOLD) {
          rejectedRelevance++;
          continue;
        }
        const relScore = rel.score;
        const matchedKeywords = rel.matchedKeywords;

        const authorList = r.authorList?.author || [];
        if (authorList.length === 0) continue;

        // Candidate author roles: last author (senior) or first author (prolific)
        const authorsToInspect = [];
        if (authorList.length === 1) {
          authorsToInspect.push({ author: authorList[0], position: 'single' });
        } else {
          authorsToInspect.push({ author: authorList[authorList.length - 1], position: 'last' });
          authorsToInspect.push({ author: authorList[0], position: 'first' });
        }

        for (const { author, position } of authorsToInspect) {
          if (discoveredNew >= epmcTarget) break;
          if (Date.now() - stageStartTime >= stageBudgetMs) break;

          const rawFullName = author.fullName || `${author.firstName || ''} ${author.lastName || ''}`.trim();
          if (!rawFullName || rawFullName.length < 3 || isNonPersonAuthor(rawFullName)) continue;

          const rawOrcid = author.authorId?.type === 'ORCID' ? author.authorId.value : (author.authorId?.value || null);
          const rawAff = author.authorAffiliationDetailsList?.authorAffiliation?.[0]?.affiliation || '';

          // Enrich via OpenAlex for authorId, institution, and ROR
          const enriched = await enrichAuthorViaOpenAlex(rawOrcid, rawFullName, rawAff);

          let authorRole = null;
          if (position === 'last' || position === 'single') {
            authorRole = 'last_author';
          } else if (position === 'first') {
            // Check >= 2 works in topic list via OpenAlex works filter
            const openalexId = enriched?.openalexId;
            let topicWorks = 0;
            if (openalexId) {
              topicWorks = await checkAuthorTopicWorks(openalexId);
            }
            if (topicWorks >= 2) {
              authorRole = 'first_author_prolific';
            } else {
              skippedJunior++;
              continue; // Junior first author with < 2 topic works
            }
          }

          const authorName = enriched?.name || rawFullName;
          const authorId = enriched?.openalexId || null;
          const orcid = enriched?.orcid || (rawOrcid ? rawOrcid.replace(/^https?:\/\/orcid\.org\//, '').trim() : null);
          const instName = enriched?.institution || (rawAff ? rawAff.split(',')[0].trim() : 'Academic Medical Center');
          const instHomepage = enriched?.institutionHomepage || null;
          const countryCode = enriched?.country || 'International';
          const ror = enriched?.ror || null;

          // Deterministic unique docId
          const docId = authorId ? sha1(authorId) : (orcid ? sha1(`orcid_${orcid}`) : sha1(`${normalizeKey(authorName)}_${normalizeKey(instName)}`));

          // Deduplication check: candidates collection
          try {
            const existing = await db.collection('candidates').doc(docId).get();
            if (existing.exists) {
              const exData = existing.data() || {};
              const exCreated = exData.createdAt?.toDate ? exData.createdAt.toDate().toISOString() : (exData.createdAt || 'N/A');
              console.log(`   ⏭️ [Stage 1 Duplicate Skipped] "${authorName}" | Reason: Already in candidates | Collection: candidates | Doc ID: ${docId} | Status: ${exData.status || 'unknown'} | CreatedAt: ${exCreated}`);
              skippedDup++;
              continue;
            }
          } catch (e) {
            console.warn(`   ⚠️ Dedupe check warning for ${authorName}:`, e.message);
          }

          const candidateRecord = {
            name: authorName,
            surname: parseAuthorSurname(authorName),
            givenNames: parseAuthorGivenNames(authorName),
            authorRole,
            openalexId: authorId,
            orcid,
            institution: instName,
            institutionHomepage: instHomepage,
            country: countryCode,
            ror,
            paperTitle: workTitle.replace(/[.,;:\s]+$/, ''),
            doi: doi ? doi.replace(/^https?:\/\/doi\.org\//, '').trim() : null,
            pmcid: pmcid ? (pmcid.toUpperCase().startsWith('PMC') ? pmcid.toUpperCase() : `PMC${pmcid}`) : null,
            pmid: pmid ? String(pmid) : null,
            year: pubYear,
            abstract: cleanAbstract,
            worksCount: enriched?.worksCount || 0,
            hIndex: enriched?.hIndex || 0,
            topics: [topic],
            recentWorkTitles: [workTitle.replace(/[.,;:\s]+$/, '')],
            recentWorks: [
              {
                title: workTitle.replace(/[.,;:\s]+$/, ''),
                year: pubYear,
                doi,
                pmid,
                pmcid,
                abstract: cleanAbstract,
              },
            ],
            relevanceScore: relScore,
            matchedKeywords: matchedKeywords || [],
            email: null,
            emailSource: null,
            emailConfidence: null,
            status: 'discovered',
            discoverySource: 'epmc_oa',
            attempts: 0,
            lastError: null,
            createdAt: isDryRun ? new Date().toISOString() : FieldValue.serverTimestamp(),
            updatedAt: isDryRun ? new Date().toISOString() : FieldValue.serverTimestamp(),
          };

          if (isDryRun) {
            discoveredNew++;
            topicAdded++;
            discoveredCandidates.push({ id: docId, ...candidateRecord });
            console.log(`   ✨ [DRY-RUN EPMC #${discoveredNew}] ${authorName} (${instName}) [Role: ${authorRole}] [Score: ${relScore}] [PMCID: ${pmcid || 'none'}]`);
          } else {
            try {
              await db.collection('candidates').doc(docId).create(candidateRecord);
              discoveredNew++;
              topicAdded++;
              discoveredCandidates.push({ id: docId, ...candidateRecord });
              console.log(`   ✨ [Discovered EPMC #${discoveredNew}] ${authorName} (${instName}) [Role: ${authorRole}] [Score: ${relScore}] [PMCID: ${pmcid || 'none'}]`);
            } catch (createErr) {
              if (createErr.code === 6 || createErr.message?.includes('ALREADY_EXISTS')) {
                console.log(`   ⏭️ [Stage 1 Duplicate Skipped] "${authorName}" | Reason: Already exists (race) | Collection: candidates | Doc ID: ${docId}`);
                skippedDup++;
                topicRejected++;
              } else {
                console.warn(`   ⚠️ Failed to save candidate ${authorName}:`, createErr.message);
                errors.push({ authorName, error: createErr.message });
                topicRejected++;
              }
            }
          }
        }
      }

      // Save cursor ONLY AFTER the page's works are processed
      const updatedCursor = nextCursor || '*';
      cursors[cursorKey] = updatedCursor;
      if (!isDryRun) {
        await db.collection('state')
          .doc('cursors')
          .set({ [cursorKey]: updatedCursor }, { merge: true })
          .catch((e) => console.warn('Failed to update Europe PMC cursor doc:', e.message));
      }

      console.log(`   📊 [Topic Discovery: Europe PMC] "${topic}": fetched ${topicFetched}, rejected ${topicRejected}, added ${topicAdded}`);

      await sleep(250);
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // MODE 2: OpenAlex Works Search (with open_access.is_oa:true filter)
  // ═════════════════════════════════════════════════════════════════════════════
  if (discoveredNew < maxToDiscover) {
    const remainingOpenAlexTarget = maxToDiscover - discoveredNew;
    console.log(`\n----------------------------------------------------------------`);
    console.log(`🌐 MODE 2: OpenAlex Open-Access Discovery (Remaining Target: ${remainingOpenAlexTarget})`);
    console.log(`----------------------------------------------------------------`);

    for (const topic of SEARCH_TOPICS) {
      if (discoveredNew >= maxToDiscover) break;
      if (Date.now() - stageStartTime >= stageBudgetMs) {
        console.log(`⏱️ [Stage 1] Time budget of ${budgetMin}m reached during OpenAlex search.`);
        break;
      }

      const topicKey = normalizeKey(topic);
      const cursor = cursors[topicKey] || '*';

      console.log(`\n🔍 Searching OpenAlex OA for topic: "${topic}" (cursor: ${cursor.slice(0, 10)}...)`);

      const queryParams = new URLSearchParams({
        search: topic,
        filter: 'publication_year:2022-2026,open_access.is_oa:true',
        sort: 'publication_date:desc',
        'per-page': '50',
        cursor,
        mailto: CONTACT_EMAIL,
        select: 'id,title,publication_year,authorships,concepts,ids,doi,open_access,abstract_inverted_index',
      });

      const url = `https://api.openalex.org/works?${queryParams.toString()}`;

      let data;
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': USER_AGENT,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(8000),
        });

        if (!res.ok) {
          throw new Error(`OpenAlex HTTP ${res.status}: ${res.statusText}`);
        }

        data = await res.json();
      } catch (err) {
        console.error(`   ❌ [Stage 1] Failed to query OpenAlex for "${topic}":`, err.message);
        errors.push({ source: 'openalex', topic, error: err.message });
        continue;
      }

      const works = data.results || [];
      const nextCursor = data.meta?.next_cursor;

      let topicFetched = works.length;
      let topicRejected = 0;
      let topicAdded = 0;

      if (works.length === 0 || nextCursor === cursor) {
        console.log(`   ℹ️ No more works returned from OpenAlex for "${topic}". Resetting cursor to '*'.`);
        cursors[topicKey] = '*';
        if (!isDryRun) {
          await db.collection('state')
            .doc('cursors')
            .set({ [topicKey]: '*' }, { merge: true })
            .catch((e) => console.warn('Failed to persist OpenAlex cursor reset:', e.message));
        }
        console.log(`   📊 [Topic Discovery: OpenAlex] "${topic}": fetched ${topicFetched}, rejected ${topicRejected}, added ${topicAdded} (cursor reset to '*')`);
        continue;
      }

      for (const work of works) {
        if (discoveredNew >= maxToDiscover) break;
        if (Date.now() - stageStartTime >= stageBudgetMs) break;

        const workTitle = work.title?.trim() || 'Clinical Pharmacy Research';
        const pubYear = work.publication_year || new Date().getFullYear();
        const concepts = work.concepts || [];
        const workIds = work.ids || {};

        const doi = work.doi || workIds.doi || null;
        const rawPmid = workIds.pmid || null;
        const pmid = rawPmid ? rawPmid.replace('https://pubmed.ncbi.nlm.nih.gov/', '') : null;

        const oaUrl = work.open_access?.oa_url || '';
        const pmcMatch = oaUrl.match(/pmc\/articles\/(PMC\d+|\d+)/i) || (workIds.pmcid ? workIds.pmcid.match(/(PMC\d+|\d+)/i) : null);
        const pmcid = pmcMatch ? (pmcMatch[1].toUpperCase().startsWith('PMC') ? pmcMatch[1].toUpperCase() : `PMC${pmcMatch[1]}`) : null;

        const cleanAbstract = reconstructAbstract(work.abstract_inverted_index);
        const rel = calculateRelevance(workTitle, cleanAbstract, concepts);
        if (rel.isNegativeTopic) {
          rejectedRelevance++;
          topicRejected++;
          console.log(`   ⛔ [Stage 1 Negative Topic Rejected] "${workTitle.slice(0, 60)}" (Matched: ${rel.matchedNegative})`);
          continue;
        }
        if (rel.distinctHits === 0 || rel.score < RELEVANCE_THRESHOLD) {
          rejectedRelevance++;
          topicRejected++;
          continue;
        }
        const relScore = rel.score;
        const matchedKeywords = rel.matchedKeywords;

        const authorships = work.authorships || [];
        for (const authorship of authorships) {
          if (discoveredNew >= maxToDiscover) break;
          if (Date.now() - stageStartTime >= stageBudgetMs) break;

          const isLastAuthor = authorship.author_position === 'last';
          const isFirstAuthor = authorship.author_position === 'first';
          const isCorresponding = Boolean(authorship.is_corresponding);

          let authorRole = null;
          if (isLastAuthor && isCorresponding) {
            authorRole = 'corresponding_senior_author';
          } else if (isLastAuthor) {
            authorRole = 'last_author';
          } else if (isCorresponding) {
            authorRole = 'corresponding_author';
          } else if (isFirstAuthor) {
            // Check >= 2 works in topic list
            const author = authorship.author;
            const shortAuthorId = (author?.id || '').replace(/^https?:\/\/openalex\.org\//, '').trim();
            const topicWorks = await checkAuthorTopicWorks(shortAuthorId);
            if (topicWorks >= 2) {
              authorRole = 'first_author_prolific';
            } else {
              skippedJunior++;
              topicRejected++;
              continue;
            }
          } else {
            continue;
          }

          const author = authorship.author;
          if (!author || !author.id || !author.display_name) continue;

          const authorName = author.display_name.trim();
          if (authorName.length < 3 || authorName.split(' ').length < 2 || isNonPersonAuthor(authorName)) {
            topicRejected++;
            continue;
          }

          const authorId = author.id;
          const orcid = author.orcid ? author.orcid.replace(/^https?:\/\/orcid\.org\//, '').trim() : null;

          const inst = authorship.institutions?.[0];
          const instName = inst?.display_name || 'Academic Medical Center';
          const instHomepage = inst?.homepage_url || (inst?.id ? await getInstitutionHomepage(inst.id) : null);
          const countryCode = inst?.country_code || 'International';
          const ror = inst?.ror || null;

          const docId = sha1(authorId);

          try {
            const existing = await db.collection('candidates').doc(docId).get();
            if (existing.exists) {
              const exData = existing.data() || {};
              const exCreated = exData.createdAt?.toDate ? exData.createdAt.toDate().toISOString() : (exData.createdAt || 'N/A');
              console.log(`   ⏭️ [Stage 1 Duplicate Skipped] "${authorName}" | Reason: Already in candidates | Collection: candidates | Doc ID: ${docId} | Status: ${exData.status || 'unknown'} | CreatedAt: ${exCreated}`);
              skippedDup++;
              topicRejected++;
              continue;
            }
          } catch (e) {
            console.warn(`   ⚠️ Dedupe check warning for ${authorName}:`, e.message);
          }

          const cleanAbstract = reconstructAbstract(work.abstract_inverted_index);

          const candidateRecord = {
            name: authorName,
            surname: parseAuthorSurname(authorName),
            givenNames: parseAuthorGivenNames(authorName),
            authorRole,
            openalexId: authorId,
            orcid,
            institution: instName,
            institutionHomepage: instHomepage,
            country: countryCode,
            ror,
            paperTitle: workTitle.replace(/[.,;:\s]+$/, ''),
            doi,
            pmcid,
            pmid,
            year: pubYear,
            abstract: cleanAbstract,
            worksCount: author.works_count || 0,
            hIndex: author.summary_stats?.h_index || 0,
            topics: [topic],
            recentWorkTitles: [workTitle.replace(/[.,;:\s]+$/, '')],
            recentWorks: [
              {
                title: workTitle.replace(/[.,;:\s]+$/, ''),
                year: pubYear,
                doi,
                pmid,
                pmcid,
                abstract: cleanAbstract,
              },
            ],
            relevanceScore: relScore,
            matchedKeywords: matchedKeywords || [],
            email: null,
            emailSource: null,
            emailConfidence: null,
            status: 'discovered',
            discoverySource: 'openalex',
            attempts: 0,
            lastError: null,
            createdAt: isDryRun ? new Date().toISOString() : FieldValue.serverTimestamp(),
            updatedAt: isDryRun ? new Date().toISOString() : FieldValue.serverTimestamp(),
          };

          if (isDryRun) {
            discoveredNew++;
            topicAdded++;
            discoveredCandidates.push({ id: docId, ...candidateRecord });
            console.log(`   ✨ [DRY-RUN OPENALEX #${discoveredNew}] ${authorName} (${instName}) [Role: ${authorRole}] [Score: ${relScore}] [PMCID: ${pmcid || 'none'}]`);
          } else {
            try {
              await db.collection('candidates').doc(docId).create(candidateRecord);
              discoveredNew++;
              topicAdded++;
              discoveredCandidates.push({ id: docId, ...candidateRecord });
              console.log(`   ✨ [Discovered OpenAlex #${discoveredNew}] ${authorName} (${instName}) [Role: ${authorRole}] [Score: ${relScore}] [PMCID: ${pmcid || 'none'}]`);
            } catch (createErr) {
              if (createErr.code === 6 || createErr.message?.includes('ALREADY_EXISTS')) {
                console.log(`   ⏭️ [Stage 1 Duplicate Skipped] "${authorName}" | Reason: Already exists (race) | Collection: candidates | Doc ID: ${docId}`);
                skippedDup++;
                topicRejected++;
              } else {
                console.warn(`   ⚠️ Failed to save candidate ${authorName}:`, createErr.message);
                errors.push({ authorName, error: createErr.message });
                topicRejected++;
              }
            }
          }
        }
      }

      // Save cursor ONLY AFTER the page's works are processed
      const updatedCursor = nextCursor || '*';
      cursors[topicKey] = updatedCursor;
      if (!isDryRun) {
        await db.collection('state')
          .doc('cursors')
          .set({ [topicKey]: updatedCursor }, { merge: true })
          .catch((e) => console.warn('Failed to update OpenAlex cursor doc:', e.message));
      }

      console.log(`   📊 [Topic Discovery: OpenAlex] "${topic}": fetched ${topicFetched}, rejected ${topicRejected}, added ${topicAdded}`);

      await sleep(250);
    }
  }

  console.log(`\n📋 STAGE 1 SUMMARY:`);
  console.log(`   - Discovered New: ${discoveredNew}`);
  console.log(`   - Skipped Duplicates: ${skippedDup}`);
  console.log(`   - Skipped Junior Authors (<2 topic works): ${skippedJunior}`);
  console.log(`   - Rejected by Relevance: ${rejectedRelevance}`);
  console.log(`   - Errors: ${errors.length}`);

  return {
    discovered_new: discoveredNew,
    discovered_candidates: discoveredCandidates,
    skipped_dup: skippedDup,
    skipped_junior: skippedJunior,
    rejected_relevance: rejectedRelevance,
    errors,
  };
}

module.exports = {
  runStage1Discover,
  calculateRelevance,
  enrichAuthorViaOpenAlex,
  checkAuthorTopicWorks,
};
