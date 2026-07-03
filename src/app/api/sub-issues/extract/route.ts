import { NextRequest, NextResponse } from 'next/server';
import { chatWithRetry } from '@/lib/openrouter';
import { readWorkspaceFile, writeWorkspaceFile, updateWorkspace } from '@/lib/workspace';
import { v4 as uuidv4 } from 'uuid';

export interface SubIssue {
  id: string;
  title: string;
  description: string;
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId, bgText, mainAgenda, committee } = await req.json();

    if (!workspaceId || !bgText) {
      return NextResponse.json({ error: 'Missing workspaceId or bgText' }, { status: 400 });
    }

    const prompt = `You are a MUN research analyst. Based on this Background Guide excerpt, propose exactly 4-5 sub-issues that meaningfully break down the main agenda: "${mainAgenda || 'the main agenda'}".

Background Guide excerpt:
${bgText.slice(0, 4000)}

Return a JSON array of sub-issues with EXACTLY this structure (no extra text, no markdown):
[
  {
    "title": "Short, specific sub-issue title",
    "description": "1-2 sentence description of what this sub-issue covers and why it matters"
  }
]

Requirements:
- 4-5 items total
- Each must be a distinct, meaningful dimension of the main agenda
- Titles should be concise (3-8 words)
- Descriptions should be concrete and specific to this agenda`;

    const chatResult = await chatWithRetry([
      { role: 'user', content: prompt },
    ], { maxTokens: 1000, temperature: 0.4 });
    const responseText = chatResult.content;

    let rawSubIssues: { title: string; description: string }[] = [];
    try {
      rawSubIssues = JSON.parse(responseText);
    } catch {
      // Try to extract JSON array from response
      const match = responseText.match(/\[[\s\S]*\]/);
      if (match) rawSubIssues = JSON.parse(match[0]);
    }

    const subIssues: SubIssue[] = rawSubIssues.slice(0, 5).map((si) => ({
      id: uuidv4(),
      title: si.title,
      description: si.description,
    }));

    return NextResponse.json({ subIssues });
  } catch (err) {
    console.error('[sub-issues/extract]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
