import { NextRequest, NextResponse } from 'next/server';
import { writeWorkspaceFile, getWorkspace } from '@/lib/workspace';
import { chatWithRetry } from '@/lib/openrouter';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: NextRequest) {
  try {
    const { workspaceId, mainAgenda, subIssues } = await req.json();

    if (!workspaceId || !mainAgenda || !subIssues) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const ws = getWorkspace(workspaceId);
    if (!ws) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    const indicatorsData: Record<string, { id: string; label: string; description: string }[]> = {};

    // 1. Generate for Main Agenda
    console.log(`[Indicators] Generating main agenda indicators for workspace ${workspaceId}`);
    const mainPrompt = `Based on this topic — "${mainAgenda}" (Main Agenda) — within the context of the agenda "${mainAgenda}", propose exactly 8 specific, concrete indicators that would be useful to compare across countries on this topic.

Requirements:
- Each indicator must be a specific, well-defined data point or comparison axis (e.g. "Defense Spending (% of GDP)", "Ratification Status of [Relevant Treaty]", "Number of Bilateral Security Agreements") — not vague categories.
- Indicators should be things that could plausibly be found or estimated via research for most countries in this committee, though not all will have data for every indicator.
- Avoid indicators that only apply to a handful of major powers — bias toward things broadly comparable across a diverse country list.

Return a JSON array with EXACTLY this structure, without markdown backticks:
[
  { "label": "Short indicator name", "description": "1 sentence on what this measures and why it's relevant" }
]`;

    const mainRes = await chatWithRetry([
      { role: 'system', content: 'You are a Model UN research expert. Return only raw JSON matching the schema.' },
      { role: 'user', content: mainPrompt }
    ], { temperature: 0.3 });

    try {
      const parsedMain = JSON.parse(mainRes.content);
      if (!Array.isArray(parsedMain)) throw new Error('Main indicators response is not an array');
      indicatorsData['main'] = parsedMain.slice(0, 8).map((ind: any) => ({
        id: uuidv4(),
        label: ind.label || 'Indicator',
        description: ind.description || ''
      }));
    } catch (e) {
      console.error('[Indicators] Failed to parse main agenda indicators:', e, mainRes.content);
      // Fallback indicators
      indicatorsData['main'] = Array.from({ length: 8 }).map((_, i) => ({
        id: uuidv4(),
        label: `General Indicator ${i + 1}`,
        description: 'Standard indicator for country stance comparison.'
      }));
    }

    // 2. Generate for each Sub-Issue
    for (const si of subIssues) {
      console.log(`[Indicators] Generating indicators for sub-issue: ${si.title}`);
      const subPrompt = `Based on this topic — "${si.title}: ${si.description}" — within the context of the agenda "${mainAgenda}", propose exactly 8 specific, concrete indicators that would be useful to compare across countries on this topic.

Requirements:
- Each indicator must be a specific, well-defined data point or comparison axis (e.g. "Defense Spending (% of GDP)", "Ratification Status of [Relevant Treaty]", "Number of Bilateral Security Agreements") — not vague categories.
- Indicators should be things that could plausibly be found or estimated via research for most countries in this committee, though not all will have data for every indicator.
- Avoid indicators that only apply to a handful of major powers — bias toward things broadly comparable across a diverse country list.

Return a JSON array with EXACTLY this structure, without markdown backticks:
[
  { "label": "Short indicator name", "description": "1 sentence on what this measures and why it's relevant" }
]`;

      const subRes = await chatWithRetry([
        { role: 'system', content: 'You are a Model UN research expert. Return only raw JSON matching the schema.' },
        { role: 'user', content: subPrompt }
      ], { temperature: 0.3 });

      try {
        const parsedSub = JSON.parse(subRes.content);
        if (!Array.isArray(parsedSub)) throw new Error('Sub-issue indicators response is not an array');
        indicatorsData[`subissue_${si.id}`] = parsedSub.slice(0, 8).map((ind: any) => ({
          id: uuidv4(),
          label: ind.label || 'Indicator',
          description: ind.description || ''
        }));
      } catch (e) {
        console.error(`[Indicators] Failed to parse indicators for sub-issue ${si.id}:`, e, subRes.content);
        indicatorsData[`subissue_${si.id}`] = Array.from({ length: 8 }).map((_, i) => ({
          id: uuidv4(),
          label: `General Indicator ${i + 1}`,
          description: 'Standard indicator for country stance comparison.'
        }));
      }
    }

    // Write to indicators.json
    writeWorkspaceFile(workspaceId, 'indicators.json', indicatorsData);

    // Write default layout_config.json
    const layoutConfig: Record<string, { indicatorId: string; visible: boolean; order: number }[]> = {};
    for (const [key, list] of Object.entries(indicatorsData)) {
      layoutConfig[key] = list.map((ind, i) => ({
        indicatorId: ind.id,
        visible: true,
        order: i
      }));
    }
    writeWorkspaceFile(workspaceId, 'layout_config.json', layoutConfig);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Indicators Generate] Error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
