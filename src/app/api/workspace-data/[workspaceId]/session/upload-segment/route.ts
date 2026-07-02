import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceDir, readWorkspaceFile, writeWorkspaceFile } from '@/lib/workspace';
import fs from 'fs';
import path from 'path';

interface SegmentMeta {
  id: string;
  file: string;
  startOffset: number;
  duration: number;
}

interface Manifest {
  segments: SegmentMeta[];
  sessionStart?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  try {
    const { workspaceId } = params;
    const wsDir = getWorkspaceDir(workspaceId);
    if (!fs.existsSync(wsDir)) {
      return NextResponse.json({ error: 'Workspace folder not found' }, { status: 404 });
    }

    const formData = await req.formData();
    const segmentId = formData.get('segmentId') as string;
    const startOffset = parseFloat(formData.get('startOffset') as string || '0');
    const duration = parseFloat(formData.get('duration') as string || '0');
    const audioFile = formData.get('audio') as File | null;

    if (!segmentId || !audioFile) {
      return NextResponse.json({ error: 'Missing segmentId or audio file' }, { status: 400 });
    }

    // Determine extension from MIME type
    const mimeType = audioFile.type || 'audio/webm';
    let ext = '.webm';
    if (mimeType.includes('mp4')) ext = '.mp4';
    else if (mimeType.includes('mpeg')) ext = '.mp3';
    else if (mimeType.includes('wav')) ext = '.wav';
    else if (mimeType.includes('m4a') || mimeType.includes('aac')) ext = '.m4a';

    const filename = `segment_${segmentId}${ext}`;
    const segmentsDir = path.join(wsDir, 'session', 'segments');
    if (!fs.existsSync(segmentsDir)) {
      fs.mkdirSync(segmentsDir, { recursive: true });
    }

    const buffer = Buffer.from(await audioFile.arrayBuffer());
    fs.writeFileSync(path.join(segmentsDir, filename), buffer);

    // Update manifest
    const manifestPath = 'session/manifest.json';
    const manifest = readWorkspaceFile<Manifest>(workspaceId, manifestPath) ?? { segments: [] };
    
    if (!manifest.sessionStart) {
      manifest.sessionStart = new Date().toISOString();
    }

    // Remove if already exists (overwrite safety)
    manifest.segments = manifest.segments.filter((s) => s.id !== segmentId);
    manifest.segments.push({
      id: segmentId,
      file: `session/segments/${filename}`,
      startOffset,
      duration,
    });
    
    // Sort segments by startOffset to guarantee correct continuous timeline lookup
    manifest.segments.sort((a, b) => a.startOffset - b.startOffset);

    writeWorkspaceFile(workspaceId, manifestPath, manifest);

    return NextResponse.json({ success: true, segment: { id: segmentId, file: filename } });
  } catch (err) {
    console.error('[upload-segment]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
