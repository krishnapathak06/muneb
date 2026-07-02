import { NextRequest, NextResponse } from 'next/server';
import { readWorkspaceFile, getWorkspaceDir } from '@/lib/workspace';
import fs from 'fs';
import path from 'path';

const AUDIO_MIME_TYPES: Record<string, string> = {
  '.webm': 'audio/webm',
  '.mp4': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
};

export async function GET(
  _req: NextRequest,
  { params }: { params: { workspaceId: string; file: string[] } }
) {
  const { workspaceId, file } = params;
  const fileName = file.join('/');
  const ext = path.extname(fileName).toLowerCase();

  try {
    if (ext && AUDIO_MIME_TYPES[ext]) {
      // Serve binary file
      const wsDir = getWorkspaceDir(workspaceId);
      const fullPath = path.join(wsDir, fileName);
      if (!fs.existsSync(fullPath)) {
        return new Response('File not found', { status: 404 });
      }
      const fileBuffer = fs.readFileSync(fullPath);
      return new Response(fileBuffer, {
        headers: {
          'Content-Type': AUDIO_MIME_TYPES[ext],
          'Content-Length': fileBuffer.length.toString(),
        },
      });
    }

    // Serve JSON metadata
    const data = readWorkspaceFile(workspaceId, fileName + '.json');
    if (data === null) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
