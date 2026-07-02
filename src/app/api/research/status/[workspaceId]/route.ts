import { NextRequest, NextResponse } from 'next/server';
import { readWorkspaceFile, getWorkspace } from '@/lib/workspace';

export async function GET(
  _req: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  const { workspaceId } = params;
  const ws = getWorkspace(workspaceId);
  if (!ws) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });

  const progress = readWorkspaceFile(workspaceId, 'research_progress.json') ?? {};
  return NextResponse.json({ progress, workspaceStatus: ws.status });
}
