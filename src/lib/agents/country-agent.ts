import { chatWithRetry } from '@/lib/openrouter';
import { readWorkspaceFile, writeWorkspaceFile } from '@/lib/workspace';
import fs from 'fs';
import path from 'path';

export interface Source {
  url: string;
  title: string;
  publication_date: string;
  extracted_text: string;
  credibility_tier: 1 | 2 | 3;
  retrieved_at: string;
}

export type ConfidenceLevel = 'Well-sourced' | 'Sparse' | 'Insufficient';

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
  if (sources.length === 0) return 'Insufficient';
  const tier1 = sources.filter((s) => s.credibility_tier === 1).length;
  const tier2 = sources.filter((s) => s.credibility_tier === 2).length;
  if (sources.length >= 3 && (tier1 + tier2) >= 2) return 'Well-sourced';
  if (sources.length >= 1) return 'Sparse';
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
  previousContext?: string
): Promise<TopicResearch> {
  const systemPrompt = buildSystemPrompt(countryName, committee, mainAgenda);
  const contextNote = previousContext
    ? `\n\nContext from earlier research on this country (for cross-referencing):\n${previousContext.slice(0, 800)}`
    : '';

  const userPrompt = `Research ${countryName}'s stance on: "${topicTitle}" — ${topicDescription}${contextNote}

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
  ]
}

If you cannot find sourced information for a section, write "insufficient sourcing — verify before use" for that field. Do NOT invent sources.`;

  const responseText = await chatWithRetry([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], { maxTokens: 3000 });

  try {
    const parsed = JSON.parse(responseText);
    const sources: Source[] = (parsed.sources ?? []).map((s: Partial<Source>) => ({
      url: s.url ?? '',
      title: s.title ?? '',
      publication_date: s.publication_date ?? '',
      extracted_text: s.extracted_text ?? '',
      credibility_tier: (s.credibility_tier ?? 3) as 1 | 2 | 3,
      retrieved_at: s.retrieved_at ?? new Date().toISOString(),
    }));
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
    };
  } catch {
    return {
      stance_summary: 'insufficient sourcing — verify before use',
      stats: [],
      controversies: [],
      questions: [],
      allies: [],
      adversaries: [],
      recent_shifts: '',
      confidence: 'Insufficient',
      sources: [],
    };
  }
}

async function researchGeopolitical(
  countryName: string,
  committee: string,
  mainAgenda: string
): Promise<CountryResearchResult['geopolitical']> {
  const systemPrompt = buildSystemPrompt(countryName, committee, mainAgenda);
  const userPrompt = `Research ${countryName}'s geopolitical position relevant to "${mainAgenda}":

Return a JSON object with EXACTLY this structure:
{
  "key_blocs": ["key alliances, blocs, or multilateral groupings this country belongs to"],
  "adversarial_relationships": ["countries or blocs in adversarial/opposing positions"],
  "recent_shifts": "notable recent shifts in alliances, trade deals, diplomatic ruptures, or policy reversals relevant to this agenda"
}`;

  const responseText = await chatWithRetry([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], { maxTokens: 1000 });

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
  onProgress?: (stage: string) => void
): Promise<CountryResearchResult> {
  try {
    onProgress?.(`Researching main agenda: ${agendaData.main_agenda}`);

    const mainAgendaResearch = await researchTopic(
      countryName,
      committee,
      agendaData.main_agenda,
      agendaData.main_agenda,
      `The primary agenda of the ${committee}`
    );

    const mainContext = mainAgendaResearch.stance_summary;
    const subIssueResearch: Record<string, TopicResearch> = {};

    for (const subIssue of agendaData.sub_issues) {
      onProgress?.(`Researching sub-issue: ${subIssue.title}`);
      subIssueResearch[subIssue.id] = await researchTopic(
        countryName,
        committee,
        agendaData.main_agenda,
        subIssue.title,
        subIssue.description,
        mainContext
      );
    }

    onProgress?.('Researching geopolitical position');
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

    return result;
  } catch (err) {
    return {
      countryId,
      countryName,
      mainAgenda: {
        stance_summary: 'Research failed',
        stats: [], controversies: [], questions: [], allies: [], adversaries: [],
        recent_shifts: '', confidence: 'Insufficient', sources: [],
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
