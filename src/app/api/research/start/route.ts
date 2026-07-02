import { NextRequest, NextResponse } from 'next/server';
import { writeWorkspaceFile, updateWorkspace, getWorkspace } from '@/lib/workspace';
import { orchestrateResearch } from '@/lib/agents/orchestrator';
import { v4 as uuidv4 } from 'uuid';

// In-memory job tracker (resets on server restart — progress is also persisted to disk)
const activeJobs = new Map<string, Promise<void>>();

export async function POST(req: NextRequest) {
  try {
    const { workspaceId, committee, mainAgenda, subIssues, countries } = await req.json();

    if (!workspaceId || !committee || !mainAgenda || !subIssues || !countries) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const ws = getWorkspace(workspaceId);
    if (!ws) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });

    // Save confirmed agenda data
    const agendaData = { main_agenda: mainAgenda, sub_issues: subIssues };
    writeWorkspaceFile(workspaceId, 'agenda.json', agendaData);

    // Save countries with slugified IDs
    const countriesWithIds = countries.map((name: string) => ({
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name,
    }));
    writeWorkspaceFile(workspaceId, 'countries.json', countriesWithIds);

    // Update status
    updateWorkspace(workspaceId, { status: 'researching', committee, agenda: mainAgenda });

    // Start research asynchronously (fire-and-forget; progress tracked on disk)
    if (!activeJobs.has(workspaceId)) {
      const job = orchestrateResearch(workspaceId, countriesWithIds, committee, agendaData).then(() => {
        updateWorkspace(workspaceId, { status: 'done' });
        activeJobs.delete(workspaceId);
      }).catch((err) => {
        console.error('[research/start]', err);
        activeJobs.delete(workspaceId);
      });
      activeJobs.set(workspaceId, job);
    }

    return NextResponse.json({ started: true, countries: countriesWithIds.length });
  } catch (err) {
    console.error('[research/start]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
