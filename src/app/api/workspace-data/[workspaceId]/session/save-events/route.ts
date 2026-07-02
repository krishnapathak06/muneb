import { NextRequest, NextResponse } from 'next/server';
import { writeWorkspaceFile, getWorkspace } from '@/lib/workspace';

export async function POST(
  req: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  try {
    const { workspaceId } = params;
    const ws = getWorkspace(workspaceId);
    if (!ws) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    const { events } = await req.json();
    if (!Array.isArray(events)) {
      return NextResponse.json({ error: 'Events must be an array' }, { status: 400 });
    }

    writeWorkspaceFile(workspaceId, 'session/events.json', events);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[save-events]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
