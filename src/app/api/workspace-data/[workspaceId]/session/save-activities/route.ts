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

    const data = await req.json();
    if (!data || typeof data !== 'object') {
      return NextResponse.json({ error: 'Invalid session data' }, { status: 400 });
    }

    writeWorkspaceFile(workspaceId, 'session/activities.json', data);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[save-activities]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
