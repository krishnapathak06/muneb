import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceDir, getWorkspace, readWorkspaceFile } from '@/lib/workspace';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

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

// Fallback search to find local ffmpeg path
async function getFFmpegPath(): Promise<string> {
  const paths = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', 'ffmpeg'];
  for (const p of paths) {
    try {
      await execPromise(`${p} -version`);
      return p;
    } catch (_) {}
  }
  throw new Error('FFmpeg binary not found on the system');
}

export async function GET(
  req: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  try {
    const { workspaceId } = params;
    const wsDir = getWorkspaceDir(workspaceId);
    if (!fs.existsSync(wsDir)) {
      return NextResponse.json({ error: 'Workspace folder not found' }, { status: 404 });
    }

    // 1. Read manifest to find segments
    const manifestPath = 'session/manifest.json';
    const manifest = readWorkspaceFile<Manifest>(workspaceId, manifestPath);
    if (!manifest || !manifest.segments || manifest.segments.length === 0) {
      return NextResponse.json({ error: 'No audio segments found for this session' }, { status: 404 });
    }

    // Filter out segments whose files do not exist on disk
    const existingSegments = manifest.segments.filter((s) => {
      const segmentAbsPath = path.join(wsDir, s.file);
      return fs.existsSync(segmentAbsPath);
    });

    if (existingSegments.length === 0) {
      return NextResponse.json({ error: 'No valid audio recording files found on disk for this session' }, { status: 404 });
    }

    const wsMeta = getWorkspace(workspaceId);
    const workspaceName = wsMeta?.name || 'workspace';
    const safeWorkspaceName = workspaceName.replace(/[^a-zA-Z0-9_-]/g, '_');

    // 2. If there is only one segment, stream it directly
    if (existingSegments.length === 1) {
      const segment = existingSegments[0];
      const filePath = path.join(wsDir, segment.file);
      const nodeStream = fs.createReadStream(filePath);
      const webStream = new ReadableStream({
        start(controller) {
          nodeStream.on('data', (chunk) => controller.enqueue(chunk));
          nodeStream.on('end', () => controller.close());
          nodeStream.on('error', (err) => controller.error(err));
        },
        cancel() {
          nodeStream.destroy();
        }
      });

      return new NextResponse(webStream, {
        headers: {
          'Content-Type': 'audio/webm',
          'Content-Disposition': `attachment; filename="${safeWorkspaceName}_recording.webm"`,
        },
      });
    }

    // 3. If there are multiple segments, combine them using ffmpeg concat
    const segmentsDir = path.join(wsDir, 'session', 'segments');
    if (!fs.existsSync(segmentsDir)) {
      fs.mkdirSync(segmentsDir, { recursive: true });
    }

    // Create a temporary ffmpeg input list file in segments dir
    const listFileName = `concat_list_${Date.now()}.txt`;
    const listFilePath = path.join(segmentsDir, listFileName);
    
    // Write segment file paths to list file (ffmpeg concat demuxer format)
    const listContent = existingSegments
      .map((s) => {
        const segmentAbsPath = path.join(wsDir, s.file);
        const escapedPath = segmentAbsPath.replace(/'/g, "'\\''");
        return `file '${escapedPath}'`;
      })
      .join('\n');
    
    fs.writeFileSync(listFilePath, listContent, 'utf-8');

    // Output path
    const mergedFileName = `merged_${Date.now()}.webm`;
    const mergedFilePath = path.join(segmentsDir, mergedFileName);

    let ffmpegPath = '/opt/homebrew/bin/ffmpeg';
    try {
      ffmpegPath = await getFFmpegPath();
    } catch (ffmpegPathErr) {
      console.error(ffmpegPathErr);
      try { fs.unlinkSync(listFilePath); } catch (_) {}
      return NextResponse.json({ error: 'FFmpeg binary not found on server' }, { status: 500 });
    }

    // Run ffmpeg concat demuxer (lossless copy)
    const ffmpegCmd = `"${ffmpegPath}" -f concat -safe 0 -i "${listFilePath}" -c copy "${mergedFilePath}"`;
    
    try {
      await execPromise(ffmpegCmd);
    } catch (ffmpegErr) {
      console.error('[ffmpeg concat failed]', ffmpegErr);
      try { fs.unlinkSync(listFilePath); } catch (_) {}
      return NextResponse.json({ error: 'FFmpeg merging failed' }, { status: 500 });
    }

    // Clean up list file
    try { fs.unlinkSync(listFilePath); } catch (_) {}

    if (!fs.existsSync(mergedFilePath)) {
      return NextResponse.json({ error: 'Merged recording file not created' }, { status: 500 });
    }

    // Stream the merged file to client and delete it on close
    const nodeStream = fs.createReadStream(mergedFilePath);
    const webStream = new ReadableStream({
      start(controller) {
        nodeStream.on('data', (chunk) => controller.enqueue(chunk));
        nodeStream.on('end', () => controller.close());
        nodeStream.on('error', (err) => controller.error(err));
      },
      cancel() {
        nodeStream.destroy();
      }
    });

    nodeStream.on('close', () => {
      try {
        fs.unlinkSync(mergedFilePath);
        console.log('Cleaned up temporary merged file:', mergedFilePath);
      } catch (unlinkErr) {
        console.error('Failed to unlink temporary merged file:', unlinkErr);
      }
    });

    return new NextResponse(webStream, {
      headers: {
        'Content-Type': 'audio/webm',
        'Content-Disposition': `attachment; filename="${safeWorkspaceName}_recording.webm"`,
      },
    });
  } catch (err) {
    console.error('[export-recording]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
