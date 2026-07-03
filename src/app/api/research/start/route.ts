import { NextRequest, NextResponse } from 'next/server';
import { writeWorkspaceFile, readWorkspaceFile, updateWorkspace, getWorkspace } from '@/lib/workspace';
import { orchestrateResearch } from '@/lib/agents/orchestrator';
import { v4 as uuidv4 } from 'uuid';

// In-memory job tracker (resets on server restart — progress is also persisted to disk)
const activeJobs = new Map<string, Promise<void>>();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    let { workspaceId, committee, mainAgenda, subIssues, countries } = body;

    if (!workspaceId) {
      return NextResponse.json({ error: 'Missing required workspaceId' }, { status: 400 });
    }

    const ws = getWorkspace(workspaceId);
    if (!ws) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });

    // Auto-load parameters from disk if not provided in the POST request body
    if (!committee) committee = ws.committee || '';
    if (!mainAgenda) mainAgenda = ws.agenda || '';
    if (!subIssues) {
      try {
        const agendaData = readWorkspaceFile<{ main_agenda: string; sub_issues: any[] }>(workspaceId, 'agenda.json');
        subIssues = agendaData?.sub_issues || [];
      } catch {
        subIssues = [];
      }
    }
    if (!countries) {
      try {
        const countriesList = readWorkspaceFile<{ id: string; name: string }[]>(workspaceId, 'countries.json');
        countries = countriesList?.map((c) => c.name) || [];
      } catch {
        countries = [];
      }
    }

    if (!committee || !mainAgenda || !countries || countries.length === 0) {
      return NextResponse.json({ error: 'Missing required configuration data to run research' }, { status: 400 });
    }

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
