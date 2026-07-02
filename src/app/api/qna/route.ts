import { NextRequest, NextResponse } from 'next/server';
import { readWorkspaceFile, writeWorkspaceFile } from '@/lib/workspace';
import fs from 'fs';
import path from 'path';

// Ollama local model config
const OLLAMA_BASE = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'qwen3.5:4b';

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
      options: { temperature: 0.4, num_predict: 1500 },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.message?.content ?? '';
}

function loadCountryResearch(workspaceId: string, countryId: string, topicFile: string): string {
  const filePath = path.join(process.cwd(), 'workspaces', workspaceId, 'research', countryId, topicFile);
  if (!fs.existsSync(filePath)) return '';
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return [
      data.stance_summary ?? '',
      ...(data.stats ?? []),
      ...(data.controversies ?? []),
    ].join('\n');
  } catch {
    return '';
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

    const response = await callOllama([
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
      sub_issues: { id: string; title: string }[];
    }>(workspaceId, 'agenda.json');
    const session: Session =
      readWorkspaceFile(workspaceId, 'qna/session.json') ?? { messages: [] };

    // Classification: which countries does this question target?
    const targeted = await classifyTargetCountries(question, countries);
    const isBroadQuery = targeted.length === 0 || targeted.length > 3;

    let context = '';
    const citations: string[] = [];

    if (isBroadQuery) {
      // Broad: load stance summaries only (not full source chunks)
      for (const country of countries.slice(0, 20)) {
        const summary = loadCountryResearch(workspaceId, country.id, 'main_agenda.json');
        if (summary) {
          context += `\n\n=== ${country.name} — Main Agenda ===\n${summary.slice(0, 400)}`;
          citations.push(`${country.name} — Main Agenda`);
        }
      }
    } else {
      // Targeted: load full research for those countries
      for (const country of targeted) {
        const main = loadCountryResearch(workspaceId, country.id, 'main_agenda.json');
        if (main) {
          context += `\n\n=== ${country.name} — Main Agenda ===\n${main}`;
          citations.push(`${country.name} — Main Agenda`);
        }
        for (const sub of agendaData?.sub_issues ?? []) {
          const subResearch = loadCountryResearch(
            workspaceId, country.id, `subissue_${sub.id}.json`
          );
          if (subResearch) {
            context += `\n\n=== ${country.name} — ${sub.title} ===\n${subResearch}`;
            citations.push(`${country.name} — ${sub.title}`);
          }
        }
      }
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

    const responseText = await callOllama([
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
