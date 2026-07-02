import { NextRequest, NextResponse } from 'next/server';
import { createWorkspace, listWorkspaces } from '@/lib/workspace';

export async function GET() {
  try {
    const workspaces = listWorkspaces();
    return NextResponse.json({ workspaces });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name } = await req.json();
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Workspace name is required' }, { status: 400 });
    }
    const ws = createWorkspace(name.trim());
    return NextResponse.json({ workspace: ws });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
