import { chatWithRetry } from '@/lib/openrouter';
import { readWorkspaceFile, writeWorkspaceFile } from '@/lib/workspace';
import { searchWeb, SearchResult } from '@/lib/search';
import fs from 'fs';
import path from 'path';

export interface Source {
  url: string;
  title: string;
  publication_date: string;
  extracted_text: string;
  credibility_tier: 1 | 2 | 3;
  retrieved_at: string;
  verified: boolean;
  raw_content?: string;
}

function normalizeUrl(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    let hostname = url.hostname.toLowerCase();
    if (hostname.startsWith('www.')) {
      hostname = hostname.slice(4);
    }
    let normalized = hostname + url.pathname.toLowerCase();
    if (normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    let cleaned = urlStr.trim().toLowerCase();
    cleaned = cleaned.replace(/^(https?:\/\/)?(www\.)?/, '');
    if (cleaned.endsWith('/')) {
      cleaned = cleaned.slice(0, -1);
    }
    return cleaned;
  }
}

export type ConfidenceLevel = 'Well-sourced' | 'Sparse' | 'Insufficient';

export interface IndicatorValue {
  indicatorId: string;
  value: string | null;
  status: 'found' | 'insufficient_sourcing' | 'not_applicable';
  verified: boolean;
}

export interface TopicResearch {
  stance_summary: string;
  stats: string[];
  controversies: string[];
  questions: string[];
  allies: string[];
  adversaries: string[];
  recent_shifts: string;
  confidence: ConfidenceLevel;
  sources: Source[];
  indicator_values: IndicatorValue[];
}

export interface CountryResearchResult {
  countryId: string;
  countryName: string;
  mainAgenda: TopicResearch;
  subIssues: Record<string, TopicResearch>; // subissue id -> research
  geopolitical: {
    key_blocs: string[];
    adversarial_relationships: string[];
    recent_shifts: string;
    confidence: ConfidenceLevel;
  };
  status: 'done' | 'failed';
  error?: string;
}

function assessConfidence(sources: Source[]): ConfidenceLevel {
  const verified = sources.filter((s) => s.verified);
  if (verified.length === 0) return 'Insufficient';
  const tier1 = verified.filter((s) => s.credibility_tier === 1).length;
  const tier2 = verified.filter((s) => s.credibility_tier === 2).length;
  if (verified.length >= 3 && (tier1 + tier2) >= 2) return 'Well-sourced';
  if (verified.length >= 1) return 'Sparse';
  return 'Insufficient';
}

function buildSystemPrompt(
  countryName: string,
  committee: string,
  mainAgenda: string
): string {
  return `You are a rigorous MUN (Model United Nations) research analyst. Your task is to research ${countryName}'s positions for a committee called "${committee}" on the agenda: "${mainAgenda}".

CRITICAL RULES — follow these exactly:
1. NO SOURCE, NO CLAIM. If you cannot cite a real, checkable source URL for a specific claim, you MUST write "insufficient sourcing — verify before use" for that claim. Never fabricate plausible-sounding content.
2. NEUTRAL FRAMING. On contested claims (sovereignty, intervention, disputed territories), use "Country X states..." or "Sources report..." phrasing — never assert contested claims as settled fact.
3. CREDIBILITY TIERS:
   - Tier 1: Government statements, official UN/multilateral documents, Reuters, AP, AFP
   - Tier 2: Established think tanks (RAND, Brookings, CFR, etc.), major national newspapers of record
   - Tier 3: General news, regional outlets
   - NEVER cite: state propaganda outlets, anonymous blogs, unverified social media
4. OUTPUT FORMAT: Always respond with a single valid JSON object matching the exact schema requested. No markdown code fences, no extra text — just the JSON.`;
}

async function researchTopic(
  countryName: string,
  committee: string,
  mainAgenda: string,
  topicTitle: string,
  topicDescription: string,
  indicators: { id: string; label: string; description: string }[],
  previousContext?: string
): Promise<TopicResearch> {
  const systemPrompt = buildSystemPrompt(countryName, committee, mainAgenda);
  const contextNote = previousContext
    ? `\n\nContext from earlier research on this country (for cross-referencing):\n${previousContext.slice(0, 800)}`
    : '';

  const searchQuery = `${countryName} ${topicTitle} ${mainAgenda}`;
  const citations = await searchWeb(searchQuery);

  // NEW: per-indicator dedicated searches
  const indicatorCitationsMap: Record<string, SearchResult[]> = {};

  // Run in small concurrent batches (e.g. 3 at a time) rather than all 8 at once,
  // to avoid hammering Tavily/DDG with a sudden burst per country-topic call.
  const BATCH_SIZE = 3;
  for (let i = 0; i < indicators.length; i += BATCH_SIZE) {
    const batch = indicators.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((ind) => searchWeb(`${countryName} ${ind.label} ${topicTitle}`))
    );
    batch.forEach((ind, idx) => {
      indicatorCitationsMap[ind.id] = batchResults[idx];
    });
  }

  // Merge all indicator-specific citations into the overall citations pool
  // used for source verification later in this function
  const allIndicatorCitations = Object.values(indicatorCitationsMap).flat();
  const allCitations = [...citations, ...allIndicatorCitations];

  const searchGroundingContext = citations.length > 0
    ? `Grounding Search Results (real pages retrieved for this query):\n` +
      citations.map((c, i) => `[Source ${i+1}]: ${c.title}\nURL: ${c.url}\nExcerpt: ${c.content}`).join('\n\n')
    : 'No search results available. Rely on standard verified knowledge.';

  const indicatorsSection = indicators.length > 0
    ? `CRITICAL INDICATORS TO EXTRACT:\n` +
      `For this topic, you MUST extract values for each of the following indicators, using the dedicated search results provided for each one. In your JSON response, the "indicator_values" array must have EXACTLY one entry for each indicator listed here:\n\n` +
      indicators.map((ind) => {
        const indCitations = indicatorCitationsMap[ind.id] ?? [];
        const indGrounding = indCitations.length > 0
          ? indCitations.map((c, i) => `  [Result ${i+1}]: ${c.title}\n  URL: ${c.url}\n  Excerpt: ${c.content}`).join('\n')
          : '  No dedicated search results found for this indicator.';
        return `- [ID: ${ind.id}] ${ind.label}: ${ind.description}\n${indGrounding}`;
      }).join('\n\n') +
      `\n\nFor each entry in "indicator_values":\n` +
      `- "indicatorId" must match the ID from the list above.\n` +
      `- "status" must be exactly "found", "insufficient_sourcing", or "not_applicable".\n` +
      `- Base "found" values ONLY on the dedicated search results shown for that specific indicator, or on the general topic search results — not on inference/guessing.\n` +
      `- "value" should be the specific answer/value, or null if status is "insufficient_sourcing" or "not_applicable".\n` +
      `- "source_index" is the 0-indexed number of the source in the "sources" list below that supports this indicator value.`
    : '';

  const userPrompt = `Research ${countryName}'s stance on: "${topicTitle}" — ${topicDescription}${contextNote}

${searchGroundingContext}

${indicatorsSection}

Return a JSON object with EXACTLY this structure:
{
  "stance_summary": "2-3 paragraph summary of the country's position",
  "stats": ["3-5 specific, sourced statistics or data points relevant to this topic"],
  "controversies": ["2-3 recent controversies or key developments"],
  "questions": ["3-5 sharp, stats-grounded questions this country could be asked in committee"],
  "allies": ["countries that share similar positions on this topic"],
  "adversaries": ["countries with opposing positions"],
  "recent_shifts": "any notable recent policy shifts or new developments",
  "sources": [
    {
      "url": "https://...",
      "title": "Article/document title",
      "publication_date": "YYYY-MM-DD or approximate",
      "extracted_text": "key quote or excerpt supporting the claim",
      "credibility_tier": 1,
      "retrieved_at": "${new Date().toISOString()}"
    }
  ],
  "indicator_values": [
    {
      "indicatorId": "indicator-uuid-from-list",
      "value": "data point or answer, or null if not found",
      "status": "found",
      "source_index": 0
    }
  ]
}

If you cannot find sourced information for a section, write "insufficient sourcing — verify before use" for that field. Do NOT invent sources.`;

  const { content: responseText } = await chatWithRetry([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], { maxTokens: 3000 });

  try {
    const parsed = JSON.parse(responseText);
    const modelSources = parsed.sources ?? [];

    const normalizedCitations = allCitations.map(c => ({
      normalizedUrl: normalizeUrl(c.url),
      original: c
    }));

    const matchedCitationUrls = new Set<string>();
    const sources: Source[] = [];

    for (const s of modelSources) {
      const sNormalized = normalizeUrl(s.url ?? '');
      const matched = normalizedCitations.find(c => c.normalizedUrl === sNormalized);
      if (matched) {
        matchedCitationUrls.add(matched.normalizedUrl);
        sources.push({
          url: s.url ?? '',
          title: matched.original.title || s.title || '',
          publication_date: s.publication_date ?? '',
          extracted_text: matched.original.content || s.extracted_text || '',
          credibility_tier: (s.credibility_tier ?? 3) as 1 | 2 | 3,
          retrieved_at: s.retrieved_at ?? new Date().toISOString(),
          verified: true,
          raw_content: matched.original.rawContent || '',
        });
      } else {
        sources.push({
          url: s.url ?? '',
          title: s.title ?? '',
          publication_date: s.publication_date ?? '',
          extracted_text: s.extracted_text ?? '',
          credibility_tier: (s.credibility_tier ?? 3) as 1 | 2 | 3,
          retrieved_at: s.retrieved_at ?? new Date().toISOString(),
          verified: false,
          raw_content: '',
        });
      }
    }

    // Add under-reported citations
    for (const c of normalizedCitations) {
      if (!matchedCitationUrls.has(c.normalizedUrl)) {
        sources.push({
          url: c.original.url,
          title: c.original.title || c.original.url,
          publication_date: '',
          extracted_text: c.original.content,
          credibility_tier: 3,
          retrieved_at: new Date().toISOString(),
          verified: true,
          raw_content: c.original.rawContent || '',
        });
      }
    }

    // Verify indicator values against matched verified sources
    const indicatorValues: IndicatorValue[] = (parsed.indicator_values ?? []).map((v: any) => {
      const isFound = v.status === 'found';
      const sourceIndex = typeof v.source_index === 'number' ? v.source_index : -1;
      const matchedSource = sourceIndex >= 0 && sourceIndex < sources.length ? sources[sourceIndex] : null;
      
      const isVerified = isFound && !!matchedSource && matchedSource.verified;
      
      return {
        indicatorId: v.indicatorId || '',
        value: (isFound && !isVerified) ? null : (v.value || null),
        status: (isFound && !isVerified) ? 'insufficient_sourcing' : (v.status || 'insufficient_sourcing') as 'found' | 'insufficient_sourcing' | 'not_applicable',
        verified: isVerified,
      };
    });

    // Make sure we have entries for all expected indicators
    for (const ind of indicators) {
      if (!indicatorValues.some((v) => v.indicatorId === ind.id)) {
        indicatorValues.push({
          indicatorId: ind.id,
          value: null,
          status: 'insufficient_sourcing',
          verified: false,
        });
      }
    }

    return {
      stance_summary: parsed.stance_summary ?? 'insufficient sourcing — verify before use',
      stats: parsed.stats ?? [],
      controversies: parsed.controversies ?? [],
      questions: parsed.questions ?? [],
      allies: parsed.allies ?? [],
      adversaries: parsed.adversaries ?? [],
      recent_shifts: parsed.recent_shifts ?? '',
      confidence: assessConfidence(sources),
      sources,
      indicator_values: indicatorValues,
    };
  } catch {
    const defaultIndicatorValues = indicators.map((ind) => ({
      indicatorId: ind.id,
      value: null,
      status: 'insufficient_sourcing' as const,
      verified: false,
    }));

    return {
      stance_summary: 'insufficient sourcing — verify before use',
      stats: [],
      controversies: [],
      questions: [],
      allies: [],
      adversaries: [],
      recent_shifts: 'insufficient sourcing — verify before use',
      confidence: 'Insufficient',
      sources: [],
      indicator_values: defaultIndicatorValues,
    };
  }
}

async function researchGeopolitical(
  countryName: string,
  committee: string,
  mainAgenda: string
): Promise<CountryResearchResult['geopolitical']> {
  const systemPrompt = buildSystemPrompt(countryName, committee, mainAgenda);
  const searchQuery = `${countryName} geopolitical alliances ${mainAgenda}`;
  const citations = await searchWeb(searchQuery);

  const searchGroundingContext = citations.length > 0
    ? `Grounding Search Results:\n` +
      citations.map((c, i) => `[Source ${i+1}]: ${c.title}\nURL: ${c.url}\nExcerpt: ${c.content}`).join('\n\n')
    : '';

  const userPrompt = `Research ${countryName}'s geopolitical position relevant to "${mainAgenda}":

${searchGroundingContext}

Return a JSON object with EXACTLY this structure:
{
  "key_blocs": ["key alliances, blocs, or multilateral groupings this country belongs to"],
  "adversarial_relationships": ["countries or blocs in adversarial/opposing positions"],
  "recent_shifts": "notable recent shifts in alliances, trade deals, diplomatic ruptures, or policy reversals relevant to this agenda"
}`;

  const chatResult = await chatWithRetry([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], { maxTokens: 1000 });
  const responseText = chatResult.content;

  try {
    const parsed = JSON.parse(responseText);
    return {
      key_blocs: parsed.key_blocs ?? [],
      adversarial_relationships: parsed.adversarial_relationships ?? [],
      recent_shifts: parsed.recent_shifts ?? '',
      confidence: parsed.key_blocs?.length > 0 ? 'Well-sourced' : 'Sparse',
    };
  } catch {
    return {
      key_blocs: [],
      adversarial_relationships: [],
      recent_shifts: 'insufficient sourcing — verify before use',
      confidence: 'Insufficient',
    };
  }
}

export interface SubIssue {
  id: string;
  title: string;
  description: string;
}

export interface AgendaData {
  main_agenda: string;
  sub_issues: SubIssue[];
}

export async function runCountryAgent(
  workspaceId: string,
  countryName: string,
  countryId: string,
  committee: string,
  agendaData: AgendaData,
  onProgress?: (stage: string, embeddedCount?: number) => void
): Promise<CountryResearchResult> {
  try {
    let totalVerified = 0;
    onProgress?.(`Researching main agenda: ${agendaData.main_agenda}`, totalVerified);

    // Load indicators config
    const indicatorsPath = path.join(process.cwd(), 'workspaces', workspaceId, 'indicators.json');
    let indicatorsMap: Record<string, { id: string; label: string; description: string }[]> = {};
    if (fs.existsSync(indicatorsPath)) {
      try {
        indicatorsMap = JSON.parse(fs.readFileSync(indicatorsPath, 'utf-8'));
      } catch (e) {
        console.error('[CountryAgent] Failed to read indicators.json:', e);
      }
    }

    const mainAgendaResearch = await researchTopic(
      countryName,
      committee,
      agendaData.main_agenda,
      agendaData.main_agenda,
      `The primary agenda of the ${committee}`,
      indicatorsMap['main'] || []
    );

    // Count verified in main agenda
    totalVerified += (mainAgendaResearch.sources ?? []).filter(s => s.verified).length;
    onProgress?.(`Main agenda research complete`, totalVerified);

    const mainContext = mainAgendaResearch.stance_summary;
    const subIssueResearch: Record<string, TopicResearch> = {};

    for (const subIssue of agendaData.sub_issues) {
      onProgress?.(`Researching sub-issue: ${subIssue.title}`, totalVerified);
      const subResearch = await researchTopic(
        countryName,
        committee,
        agendaData.main_agenda,
        subIssue.title,
        subIssue.description,
        indicatorsMap[`subissue_${subIssue.id}`] || [],
        mainContext
      );
      subIssueResearch[subIssue.id] = subResearch;
      totalVerified += (subResearch.sources ?? []).filter(s => s.verified).length;
      onProgress?.(`Sub-issue: ${subIssue.title} complete`, totalVerified);
    }

    onProgress?.('Researching geopolitical position', totalVerified);
    const geopolitical = await researchGeopolitical(countryName, committee, agendaData.main_agenda);

    const result: CountryResearchResult = {
      countryId,
      countryName,
      mainAgenda: mainAgendaResearch,
      subIssues: subIssueResearch,
      geopolitical,
      status: 'done',
    };

    // Persist to disk
    const researchDir = path.join(process.cwd(), 'workspaces', workspaceId, 'research', countryId);
    fs.mkdirSync(researchDir, { recursive: true });
    fs.writeFileSync(path.join(researchDir, 'main_agenda.json'), JSON.stringify(mainAgendaResearch, null, 2));
    for (const [subId, subResearch] of Object.entries(subIssueResearch)) {
      fs.writeFileSync(path.join(researchDir, `subissue_${subId}.json`), JSON.stringify(subResearch, null, 2));
    }
    fs.writeFileSync(path.join(researchDir, 'geopolitical.json'), JSON.stringify(geopolitical, null, 2));

    // Flat sources list
    const allSources = [
      ...mainAgendaResearch.sources,
      ...Object.values(subIssueResearch).flatMap((s) => s.sources),
    ];
    fs.writeFileSync(path.join(researchDir, 'sources.json'), JSON.stringify(allSources, null, 2));

    // Save full text raw sources as separate .txt files
    const rawSourcesDir = path.join(researchDir, 'raw_sources');
    fs.mkdirSync(rawSourcesDir, { recursive: true });
    
    for (let i = 0; i < allSources.length; i++) {
      const src = allSources[i];
      if (src.raw_content) {
        // Safe filename: replace non-alphanumeric characters
        const safeTitle = (src.title || `source_${i}`)
          .replace(/[^a-z0-9]/gi, '_')
          .replace(/_+/g, '_')
          .slice(0, 50);
        const filename = `${safeTitle || 'source'}.txt`;
        const contentHeader = `URL: ${src.url}\nTitle: ${src.title}\nRetrieved At: ${src.retrieved_at}\n\n`;
        try {
          fs.writeFileSync(path.join(rawSourcesDir, filename), contentHeader + src.raw_content);
        } catch (e) {
          console.error('[CountryAgent] Failed to write raw source file:', e);
        }
      }
    }

    return result;
  } catch (err) {
    return {
      countryId,
      countryName,
      mainAgenda: {
        stance_summary: 'Research failed',
        stats: [], controversies: [], questions: [], allies: [], adversaries: [],
        recent_shifts: '', confidence: 'Insufficient', sources: [],
        indicator_values: [],
      },
      subIssues: {},
      geopolitical: {
        key_blocs: [], adversarial_relationships: [], recent_shifts: '', confidence: 'Insufficient',
      },
      status: 'failed',
      error: (err as Error).message,
    };
  }
}
