import { NextRequest, NextResponse } from 'next/server';
import { readWorkspaceFile, writeWorkspaceFile } from '@/lib/workspace';
import { chatWithRetry, MODEL } from '@/lib/openrouter';
import fs from 'fs';
import path from 'path';

// Ollama local model config
const OLLAMA_BASE = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'qwen3.5:4b';
const NUM_CTX = 262144;

interface QnaMessage {
  role: 'user' | 'assistant';
  content: string;
  citations?: string[];
  timestamp: string;
}

interface Session {
  messages: QnaMessage[];
}

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

async function callOllama(messages: OllamaMessage[]): Promise<string> {
  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages,
      stream: false,
      options: { temperature: 0.4, num_predict: 1500, num_ctx: NUM_CTX },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.message?.content ?? '';
}

async function callAIModel(messages: OllamaMessage[]): Promise<string> {
  if (process.env.OPENROUTER_API_KEY) {
    try {
      console.log(`[QnA] Attempting OpenRouter call with model: ${MODEL}`);
      const res = await chatWithRetry(messages as any, { temperature: 0.2 });
      return res.content;
    } catch (err: any) {
      const errMsg = err.message || '';
      console.warn(`[QnA] OpenRouter call failed: ${errMsg}. Falling back to local Ollama model.`);
    }
  } else {
    console.log('[QnA] OPENROUTER_API_KEY not configured. Falling back to local Ollama model.');
  }

  return await callOllama(messages);
}

function loadCountryResearch(workspaceId: string, countryId: string, topicFile: string): string {
  const filePath = path.join(process.cwd(), 'workspaces', workspaceId, 'research', countryId, topicFile);
  if (!fs.existsSync(filePath)) return '';
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const parts = [
      `Summary: ${data.stance_summary ?? ''}`,
      `Stats: ${(data.stats ?? []).join('; ')}`,
      `Controversies: ${(data.controversies ?? []).join('; ')}`,
      `Questions: ${(data.questions ?? []).join('; ')}`,
      `Allies: ${(data.allies ?? []).join(', ')}`,
      `Adversaries: ${(data.adversaries ?? []).join(', ')}`,
      `Recent Shifts: ${data.recent_shifts ?? ''}`
    ];
    
    if (data.indicator_values && Array.isArray(data.indicator_values)) {
      const indParts = data.indicator_values.map((val: any) => `${val.indicatorId}: ${val.value || val.status}`);
      if (indParts.length > 0) parts.push(`Indicators: ${indParts.join('; ')}`);
    }

    return parts.join('\n');
  } catch {
    return '';
  }
}

function loadRawSourceText(
  workspaceId: string,
  countryId: string,
  topicFile: string
): { text: string; sourceCount: number } {
  const topicPath = path.join(process.cwd(), 'workspaces', workspaceId, 'research', countryId, topicFile);
  if (!fs.existsSync(topicPath)) {
    return { text: '', sourceCount: 0 };
  }

  try {
    const topicData = JSON.parse(fs.readFileSync(topicPath, 'utf-8'));
    
    // 1. Gather all synthesis fields
    const synthesisParts = [
      `Summary: ${topicData.stance_summary ?? ''}`,
      `Statistics: ${(topicData.stats ?? []).join('; ')}`,
      `Controversies: ${(topicData.controversies ?? []).join('; ')}`,
      `Questions: ${(topicData.questions ?? []).join('; ')}`,
      `Allies: ${(topicData.allies ?? []).join(', ')}`,
      `Adversaries: ${(topicData.adversaries ?? []).join(', ')}`,
      `Recent Shifts: ${topicData.recent_shifts ?? ''}`
    ];

    if (topicData.indicator_values && Array.isArray(topicData.indicator_values)) {
      const indicatorsPath = path.join(process.cwd(), 'workspaces', workspaceId, 'indicators.json');
      let labelMap: Record<string, string> = {};
      if (fs.existsSync(indicatorsPath)) {
        try {
          const indicatorsData = JSON.parse(fs.readFileSync(indicatorsPath, 'utf-8'));
          for (const list of Object.values(indicatorsData)) {
            if (Array.isArray(list)) {
              for (const ind of list) {
                if (ind && ind.id && ind.label) {
                  labelMap[ind.id] = ind.label;
                }
              }
            }
          }
        } catch {}
      }

      const indParts = topicData.indicator_values.map((val: any) => {
        const label = labelMap[val.indicatorId] || val.indicatorId;
        const statusLabel = val.status === 'not_applicable' ? 'N/A' : (val.status === 'insufficient_sourcing' ? 'Insufficient sourcing' : val.value);
        return `${label}: ${statusLabel}`;
      });
      if (indParts.length > 0) {
        synthesisParts.push(`Indicators: ${indParts.join('; ')}`);
      }
    }

    const synthesisText = synthesisParts.join('\n');

    // 2. Gather verified sources from this topic data
    const topicSources = (topicData.sources ?? []) as any[];
    const verifiedSources = topicSources.filter((s) => s.verified);

    // Sort by credibility_tier ascending (tier 1 first)
    verifiedSources.sort((a, b) => (a.credibility_tier || 3) - (b.credibility_tier || 3));

    // 3. Read raw .txt files from raw_sources/ - UNTRUNCATED and loading ALL of them
    const rawDir = path.join(process.cwd(), 'workspaces', workspaceId, 'research', countryId, 'raw_sources');
    const sourceTexts: string[] = [];

    for (const src of verifiedSources) {
      const safeTitle = (src.title || 'source')
        .replace(/[^a-z0-9]/gi, '_')
        .replace(/_+/g, '_')
        .slice(0, 50);
      const filename = `${safeTitle}.txt`;
      const filePath = path.join(rawDir, filename);

      if (fs.existsSync(filePath)) {
        try {
          const rawText = fs.readFileSync(filePath, 'utf-8');
          sourceTexts.push(`Source: ${src.title}\nURL: ${src.url}\nContent:\n${rawText}`);
        } catch {}
      }
    }

    let combinedText = `=== SYNTHESIS ===\n${synthesisText}`;
    if (sourceTexts.length > 0) {
      combinedText += `\n\n=== RAW SOURCES ===\n${sourceTexts.join('\n\n')}`;
    }

    return { text: combinedText, sourceCount: verifiedSources.length };
  } catch (e) {
    console.error('[loadRawSourceText] error:', e);
    return { text: '', sourceCount: 0 };
  }
}

async function classifyTargetCountries(
  question: string,
  allCountries: { id: string; name: string }[]
): Promise<{ id: string; name: string }[]> {
  try {
    const countryListStr = allCountries.map((c) => `${c.id}:${c.name}`).join(', ');
    const systemPrompt = `You are a helper that identifies which countries are referenced in a user's question about a Model UN committee.
Given a question and a list of available countries in the format "id:Name", return a JSON array containing only the country IDs that are targeted by the question.

Example:
Available: "mexico:Mexico, usa:United States, china:China"
Question: "Who would block this resolution, Mexico or the US?"
Output: ["mexico", "usa"]

Example 2:
Available: "mexico:Mexico, usa:United States, china:China"
Question: "What is the stance of the G77?"
Output: []

Available countries:
${countryListStr}

Return ONLY a JSON array of strings (e.g. ["mexico", "usa"]). Do not add explanation or markdown code blocks.`;

    const response = await callAIModel([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: question }
    ]);

    let matchedIds: string[] = [];
    try {
      matchedIds = JSON.parse(response.trim());
    } catch {
      const match = response.match(/\[[\s\S]*\]/);
      if (match) matchedIds = JSON.parse(match[0]);
    }

    if (Array.isArray(matchedIds)) {
      const matchedSet = new Set(matchedIds.map((id) => String(id).toLowerCase().trim()));
      return allCountries.filter((c) => matchedSet.has(c.id.toLowerCase().trim()));
    }
  } catch (err) {
    console.error('[classifyTargetCountries] error', err);
  }
  // Fallback to naive substring matching if Ollama fails/is offline
  const lower = question.toLowerCase();
  return allCountries.filter((c) => lower.includes(c.name.toLowerCase()));
}

async function classifyTargetSubIssues(
  question: string,
  subIssues: { id: string; title: string; description: string }[]
): Promise<{ id: string; title: string }[]> {
  if (subIssues.length === 0) return [];
  try {
    const subIssueListStr = subIssues.map((si) => `${si.id}:${si.title} — ${si.description}`).join('\n');
    const systemPrompt = `You are a helper that identifies which sub-issues are referenced in a user's question about a Model UN committee.
Given a question and a list of available sub-issues in the format "id:Title — Description", return a JSON array containing only the sub-issue IDs that the question is specifically and directly about.
If the question is general or not about any specific sub-issues, return an empty array [].

Available sub-issues:
${subIssueListStr}

Return ONLY a JSON array of strings (e.g. ["subissue-uuid-1", "subissue-uuid-2"]). Do not add explanation or markdown code blocks.`;

    const response = await callAIModel([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: question }
    ]);

    let matchedIds: string[] = [];
    try {
      matchedIds = JSON.parse(response.trim());
    } catch {
      const match = response.match(/\[[\s\S]*\]/);
      if (match) matchedIds = JSON.parse(match[0]);
    }

    if (Array.isArray(matchedIds)) {
      const matchedSet = new Set(matchedIds.map((id) => String(id).toLowerCase().trim()));
      return subIssues
        .filter((si) => matchedSet.has(si.id.toLowerCase().trim()))
        .map((si) => ({ id: si.id, title: si.title }));
    }
  } catch (err) {
    console.error('[classifyTargetSubIssues] error', err);
  }
  const lower = question.toLowerCase();
  return subIssues
    .filter((si) => lower.includes(si.title.toLowerCase()))
    .map((si) => ({ id: si.id, title: si.title }));
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId, question } = await req.json();
    if (!workspaceId || !question) {
      return NextResponse.json({ error: 'Missing workspaceId or question' }, { status: 400 });
    }

    const countries: { id: string; name: string }[] =
      readWorkspaceFile(workspaceId, 'countries.json') ?? [];
    const agendaData = readWorkspaceFile<{
      main_agenda: string;
      sub_issues: { id: string; title: string; description: string }[];
    }>(workspaceId, 'agenda.json');
    const session: Session =
      readWorkspaceFile(workspaceId, 'qna/session.json') ?? { messages: [] };

    const targetedCountries = await classifyTargetCountries(question, countries);
    const targetedSubIssues = await classifyTargetSubIssues(question, agendaData?.sub_issues ?? []);

    const isBroadQuery = targetedCountries.length === 0 || targetedCountries.length > 3;

    let context = '';
    const citations: string[] = [];

    if (isBroadQuery) {
      const suffix = ' (summary only — broad query)';
      for (const country of countries.slice(0, 20)) {
        const summary = loadCountryResearch(workspaceId, country.id, 'main_agenda.json');
        if (summary) {
          context += `\n\n=== ${country.name} — Main Agenda ===\n${summary.slice(0, 500)}`;
          citations.push(`${country.name} — Main Agenda${suffix}`);
        }
      }
    } else {
      for (const country of targetedCountries) {
        const mainRaw = loadRawSourceText(workspaceId, country.id, 'main_agenda.json');
        if (mainRaw.text) {
          context += `\n\n=== ${country.name} — Main Agenda ===\n${mainRaw.text}`;
          citations.push(`${country.name} — Main Agenda (${mainRaw.sourceCount} sources)`);
        }
        for (const sub of targetedSubIssues) {
          const subRaw = loadRawSourceText(workspaceId, country.id, `subissue_${sub.id}.json`);
          if (subRaw.text) {
            context += `\n\n=== ${country.name} — ${sub.title} ===\n${subRaw.text}`;
            citations.push(`${country.name} — ${sub.title} (${subRaw.sourceCount} sources)`);
          }
        }
      }
    }

    // Token length verification check (Part 1 limit: 256k tokens)
    const estimatedTokens = Math.ceil(context.length / 4);
    const expectedResponseBudget = 2048;

    if (estimatedTokens + expectedResponseBudget > NUM_CTX) {
      return NextResponse.json(
        {
          error: 'context_exceeded',
          message: 'This question requires more source material than the local model can process at once. Try narrowing to fewer countries or sub-issues.',
          estimatedTokens,
          limit: NUM_CTX,
        },
        { status: 400 }
      );
    }

    const systemPrompt = `You are a MUN research assistant for the committee agenda: "${agendaData?.main_agenda ?? 'unknown'}".
Answer questions using ONLY the pre-generated research context provided below. Do not make up any information not present in this context.
If the research doesn't contain enough information to answer, say so explicitly.
Always mention which country-topic sections you drew from.

Research context:
${context || 'No research data available for this query.'}`;

    // Build conversation history (last 6 for context window)
    const historyMessages: OllamaMessage[] = session.messages.slice(-6).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const responseText = await callAIModel([
      { role: 'system', content: systemPrompt },
      ...historyMessages,
      { role: 'user', content: question },
    ]);

    // Persist session
    session.messages.push({
      role: 'user',
      content: question,
      timestamp: new Date().toISOString(),
    });
    session.messages.push({
      role: 'assistant',
      content: responseText,
      citations,
      timestamp: new Date().toISOString(),
    });
    writeWorkspaceFile(workspaceId, 'qna/session.json', session);

    return NextResponse.json({ answer: responseText, citations });
  } catch (err) {
    console.error('[qna]', err);
    const msg = (err as Error).message;
    const isOllamaDown = msg.includes('ECONNREFUSED') || msg.includes('fetch failed');
    return NextResponse.json(
      {
        error: isOllamaDown
          ? 'Ollama is not running. Start it with: ollama serve'
          : msg,
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get('workspaceId');
  if (!workspaceId)
    return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 });
  const session: Session =
    readWorkspaceFile(workspaceId, 'qna/session.json') ?? { messages: [] };
  return NextResponse.json({ messages: session.messages });
}
