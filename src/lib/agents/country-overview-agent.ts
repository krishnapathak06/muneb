import { chatWithRetry } from '@/lib/openrouter';
import { searchWeb } from '@/lib/search';
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

export interface CountryOverviewResult {
  timeline: { date: string; event: string; significance: string; sources: string[]; verified: boolean }[];
  key_conflicts: { title: string; description: string; status: string; relevance: string; sources: string[] }[];
  recent_shifts: { title: string; description: string; date: string; implications: string; sources: string[] }[];
  allies: { country: string; relationship_note: string; sources: string[] }[];
  adversaries: { country: string; relationship_note: string; sources: string[] }[];
  government_type: string;
  economic_profile: string;
  international_memberships: string[];
  sources: Source[];
}

export async function runCountryOverviewAgent(
  workspaceId: string,
  countryName: string,
  countryId: string
): Promise<CountryOverviewResult> {
  try {
    // 1. Fire parallel search requests
    const queries = [
      `${countryName} government political system key international memberships regional blocs`,
      `${countryName} foreign policy major conflicts alliances tensions recent shifts`,
      `${countryName} economic profile key sectors industries timeline history`,
    ];

    const results = await Promise.all(queries.map((q) => searchWeb(q)));
    const citations = results.flat();

    const searchGroundingContext = citations.length > 0
      ? `Grounding Search Results (real pages retrieved for this query):\n` +
        citations.map((c, i) => `[Source ${i+1}]: ${c.title}\nURL: ${c.url}\nExcerpt: ${c.content}`).join('\n\n')
      : 'No search results available. Rely on standard verified knowledge.';

    const systemPrompt = `You are a Model United Nations overview research agent. Your task is to generate a comprehensive, diplomatically and historically significant general overview/profile for ${countryName}.
Your analysis must be strictly grounded in the real search results provided. If a fact or relationship is not supported by real search citations, label it as insufficient rather than fabricating.
Return EXACTLY a JSON response matching this schema:
{
  "timeline": [
    { "date": "Date of event", "event": "Brief description of event", "significance": "Why this event is crucial for MUN framing", "sources": ["https://..."] }
  ],
  "key_conflicts": [
    { "title": "Conflict name", "description": "Overview of the conflict", "status": "Current status", "relevance": "Why it is relevant to understanding the country's positioning", "sources": ["https://..."] }
  ],
  "recent_shifts": [
    { "title": "Development title", "description": "Overview of development", "date": "Date or timeframe", "implications": "Diplomatic/policy implications", "sources": ["https://..."] }
  ],
  "allies": [
    { "country": "Country Name", "relationship_note": "Brief note on strength/nature of relationship", "sources": ["https://..."] }
  ],
  "adversaries": [
    { "country": "Country Name", "relationship_note": "Brief note on strength/nature of relationship", "sources": ["https://..."] }
  ],
  "government_type": "Government type / political system",
  "economic_profile": "Brief economic profile (sectors, recent developments)",
  "international_memberships": ["UN Security Council seat (if applicable)", "NATO", "EU", etc.],
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

Ensure you provide exactly:
- A timeline of crucial diplomatically significant events.
- 3-4 key long-standing conflicts in depth.
- 4-5 major recent geopolitical shifts (e.g. new alliances, policy reversals, leadership changes).
- Allies (notes + sources).
- Adversaries (notes + sources).
- government_type, economic_profile, international_memberships.

Do NOT output markdown format, only return valid JSON.`;

    const userPrompt = `Generate the Model UN Country Overview for ${countryName}.
${searchGroundingContext}`;

    const chatResponse = await chatWithRetry([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]);

    const responseText = chatResponse.content;
    let parsed: any;
    try {
      parsed = JSON.parse(responseText.trim());
    } catch {
      const match = responseText.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
      else throw new Error('Failed to parse agent JSON');
    }

    // 2. Perform Source Verification
    const sources: Source[] = [];
    const modelSources = parsed.sources ?? [];

    for (const modelSrc of modelSources) {
      const normModel = normalizeUrl(modelSrc.url);
      const match = citations.find((c) => normalizeUrl(c.url) === normModel);

      if (match) {
        sources.push({
          url: match.url,
          title: match.title || modelSrc.title,
          publication_date: modelSrc.publication_date || 'Unknown',
          extracted_text: modelSrc.extracted_text || '',
          credibility_tier: modelSrc.credibility_tier || 3,
          retrieved_at: new Date().toISOString(),
          verified: true,
          raw_content: match.rawContent || '',
        });
      } else {
        sources.push({
          url: modelSrc.url,
          title: modelSrc.title,
          publication_date: modelSrc.publication_date || 'Unknown',
          extracted_text: modelSrc.extracted_text || '',
          credibility_tier: modelSrc.credibility_tier || 3,
          retrieved_at: new Date().toISOString(),
          verified: false,
        });
      }
    }

    // Add search citations that are not listed but are verified
    for (const c of citations) {
      const normC = normalizeUrl(c.url);
      const exists = sources.some((s) => normalizeUrl(s.url) === normC);
      if (!exists) {
        sources.push({
          url: c.url,
          title: c.title,
          publication_date: 'Unknown',
          extracted_text: c.content ? c.content.slice(0, 150) : '',
          credibility_tier: 3,
          retrieved_at: new Date().toISOString(),
          verified: true,
          raw_content: c.rawContent || '',
        });
      }
    }

    // 3. Save raw text content of verified sources to raw_sources/
    const wsDir = path.join(process.cwd(), 'workspaces', workspaceId);
    const rawSourcesDir = path.join(wsDir, 'research', countryId, 'raw_sources');
    if (!fs.existsSync(rawSourcesDir)) {
      fs.mkdirSync(rawSourcesDir, { recursive: true });
    }

    for (const s of sources) {
      if (s.verified && s.raw_content) {
        const safeTitle = (s.title || 'source')
          .replace(/[^a-z0-9]/gi, '_')
          .replace(/_+/g, '_')
          .slice(0, 50);
        const filename = `${safeTitle}.txt`;
        fs.writeFileSync(path.join(rawSourcesDir, filename), s.raw_content);
      }
    }

    // 4. Update the verification state of timeline & details
    const verifiedUrls = new Set(sources.filter((s) => s.verified).map((s) => normalizeUrl(s.url)));

    const verifyItems = (items: any[]) => {
      return (items || []).map((item) => {
        const itemUrls = (item.sources || []).map((u: string) => normalizeUrl(u));
        const hasVerified = itemUrls.some((u: string) => verifiedUrls.has(u));
        return {
          ...item,
          verified: hasVerified,
        };
      });
    };

    const timeline = verifyItems(parsed.timeline || []).map((t: any) => ({
      date: t.date || 'Unknown',
      event: t.event || '',
      significance: t.significance || '',
      sources: t.sources || [],
      verified: t.verified,
    }));

    const overviewResult: CountryOverviewResult = {
      timeline,
      key_conflicts: verifyItems(parsed.key_conflicts || []),
      recent_shifts: verifyItems(parsed.recent_shifts || []),
      allies: verifyItems(parsed.allies || []),
      adversaries: verifyItems(parsed.adversaries || []),
      government_type: parsed.government_type || 'Unknown',
      economic_profile: parsed.economic_profile || 'Unknown',
      international_memberships: parsed.international_memberships || [],
      sources: sources.map(({ raw_content, ...rest }) => rest as Source), // strip raw_content for final overview.json size
    };

    // Save to workspaces/{workspaceId}/research/{countryId}/overview.json
    const researchDir = path.join(wsDir, 'research', countryId);
    if (!fs.existsSync(researchDir)) {
      fs.mkdirSync(researchDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(researchDir, 'overview.json'),
      JSON.stringify(overviewResult, null, 2)
    );

    return overviewResult;
  } catch (err) {
    console.error(`[CountryOverviewAgent] Failed for ${countryName}:`, err);
    // Fallback profile
    const emptyResult: CountryOverviewResult = {
      timeline: [],
      key_conflicts: [],
      recent_shifts: [],
      allies: [],
      adversaries: [],
      government_type: 'Insufficient information',
      economic_profile: 'Insufficient information',
      international_memberships: [],
      sources: [],
    };
    return emptyResult;
  }
}
