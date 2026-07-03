import { NextRequest, NextResponse } from 'next/server';
import { readWorkspaceFile, writeWorkspaceFile, getWorkspace } from '@/lib/workspace';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId');
    const topicKey = searchParams.get('topicKey'); // e.g. "main" or "subissue_{id}"

    if (!workspaceId || !topicKey) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const ws = getWorkspace(workspaceId);
    if (!ws) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    try {
      const data = readWorkspaceFile<Record<string, any>>(workspaceId, 'layout_config.json') || {};
      return NextResponse.json(data[topicKey] || []);
    } catch {
      return NextResponse.json([]);
    }
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId, topicKey, layout } = await req.json();

    if (!workspaceId || !topicKey || !layout) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const ws = getWorkspace(workspaceId);
    if (!ws) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    let config: Record<string, any> = {};
    try {
      config = readWorkspaceFile<Record<string, any>>(workspaceId, 'layout_config.json') || {};
    } catch {
      config = {};
    }

    config[topicKey] = layout;
    writeWorkspaceFile(workspaceId, 'layout_config.json', config);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
