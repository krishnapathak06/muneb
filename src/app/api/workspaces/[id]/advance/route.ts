import { NextRequest, NextResponse } from 'next/server';
import { updateWorkspace, getWorkspace } from '@/lib/workspace';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await req.json();
    const ws = getWorkspace(id);
    if (!ws) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const updated = updateWorkspace(id, body);
    return NextResponse.json({ workspace: updated });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
