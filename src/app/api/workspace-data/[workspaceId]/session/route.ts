import { NextRequest, NextResponse } from 'next/server';
import { readWorkspaceFile, getWorkspace } from '@/lib/workspace';

export async function GET(
  _req: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  const { workspaceId } = params;
  const ws = getWorkspace(workspaceId);
  if (!ws) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
  }

  const manifest = readWorkspaceFile(workspaceId, 'session/manifest.json') ?? { segments: [] };
  const events = readWorkspaceFile(workspaceId, 'session/events.json') ?? [];
  const activities = readWorkspaceFile(workspaceId, 'session/activities.json') ?? {
    sessionStart: null,
    activities: [],
    globalPoints: [],
  };

  return NextResponse.json({ manifest, events, activities });
}

