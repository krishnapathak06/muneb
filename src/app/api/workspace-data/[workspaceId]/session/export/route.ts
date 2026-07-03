import { NextRequest, NextResponse } from 'next/server';
import { readWorkspaceFile, getWorkspace } from '@/lib/workspace';

// ─── Types (mirror the frontend types) ───────────────────────────────────────
interface PointEntry {
  id: string;
  type: string;
  raisedBy: string;
  content: string;
  answer?: string;
  raisedAtOffset: number;
}

interface SpeakerEntry {
  id: string;
  countryId: string;
  speechStartOffset: number;
  speechText: string;
  points: PointEntry[];
}

interface ActivityRecord {
  id: string;
  type: string;
  startedAtOffset: number;
  status: string;
  // attendance
  attendanceIndex?: number;
  rolls?: { countryId: string; status: string }[];
  // gsl / mod_coc
  raisedBy?: string;
  firstSpeakerTime?: number;
  perSpeakerTime?: number;
  totalSpeakers?: number;
  topic?: string;
  outcome?: string | null;
  speakers?: SpeakerEntry[];
  // unmod
  durationSeconds?: number;
}

interface GlobalPoint extends PointEntry {
  activityId: string | null;
}

interface SessionData {
  sessionStart: string | null;
  activities: ActivityRecord[];
  globalPoints: GlobalPoint[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatOffset(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

const POINT_LABELS: Record<string, string> = {
  poi: 'Point of Information',
  po: 'Point of Order',
  ppp: 'Point of Personal Privilege',
  ror: 'Right of Reply',
  ppi: 'Point of Parliamentary Inquiry',
  yield_comments: 'Yield to Comments',
  yield_delegate: 'Yield to Another Delegate',
};

// ─── Export Route ─────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  const { workspaceId } = params;
  const ws = getWorkspace(workspaceId);
  if (!ws) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const sessionData = readWorkspaceFile<SessionData>(workspaceId, 'session/activities.json');
  if (!sessionData) {
    return NextResponse.json({ error: 'No session data found' }, { status: 404 });
  }

  const countries = (readWorkspaceFile<{ id: string; name: string }[]>(workspaceId, 'countries.json') ?? []);
  const getName = (id: string) => countries.find(c => c.id === id)?.name ?? id;

  const DIV = '═'.repeat(60);
  const lines: string[] = [];

  lines.push(DIV);
  lines.push('  COMMITTEE SESSION LOG');
  lines.push(`  Workspace: ${ws.name || ws.id}`);
  lines.push(`  Committee: ${ws.committee || '—'}`);
  lines.push(`  Agenda:    ${ws.agenda || '—'}`);
  lines.push(`  Session Start: ${sessionData.sessionStart ?? 'Unknown'}`);
  lines.push(DIV);
  lines.push('');

  for (const act of (sessionData.activities ?? [])) {
    const ts = `[+${formatOffset(act.startedAtOffset)}]`;

    if (act.type === 'attendance') {
      const rolls = act.rolls ?? [];
      const present = rolls.filter(r => r.status === 'present').length;
      const pv = rolls.filter(r => r.status === 'present_and_voting').length;
      const absent = rolls.filter(r => r.status === 'absent').length;

      lines.push(`${ts} ── ATTENDANCE ROLL #${act.attendanceIndex} ${'─'.repeat(34)}`);
      for (const r of rolls) {
        const label = r.status === 'present' ? 'Present'
          : r.status === 'present_and_voting' ? 'Present & Voting'
          : 'Absent';
        lines.push(`  ${getName(r.countryId).padEnd(26)} ${label}`);
      }
      lines.push(`  SUMMARY: ${present + pv} Present (${pv} P+V) · ${absent} Absent`);
      lines.push('');
    }

    if (act.type === 'gsl') {
      const outcomeStr = act.outcome === 'passed' ? '✓ PASSED' : act.outcome === 'failed' ? '✗ FAILED' : 'PENDING';
      lines.push(`${ts} ── GSL — ${outcomeStr} ${'─'.repeat(38)}`);
      if (act.raisedBy) lines.push(`  Raised by: ${getName(act.raisedBy)}`);
      if (act.perSpeakerTime) lines.push(`  Per speaker time: ${formatOffset(act.perSpeakerTime)}`);
      lines.push('');
      if (act.outcome === 'passed') {
        for (let i = 0; i < (act.speakers ?? []).length; i++) {
          const sp = act.speakers![i];
          lines.push(`  ▸ Speaker ${i + 1}: ${getName(sp.countryId)} [+${formatOffset(sp.speechStartOffset)}]`);
          if (sp.speechText) {
            const wrapped = sp.speechText.split('\n').map(l => `    ${l}`).join('\n');
            lines.push(wrapped);
          }
          for (const pt of (sp.points ?? [])) {
            lines.push(`    [${POINT_LABELS[pt.type] ?? pt.type}] Raised by: ${getName(pt.raisedBy)}`);
            if (pt.content) lines.push(`      Q: ${pt.content}`);
            if (pt.answer) lines.push(`      A: ${pt.answer}`);
          }
          lines.push('');
        }
      }
    }

    if (act.type === 'mod_coc') {
      const outcomeStr = act.outcome === 'passed' ? '✓ PASSED' : act.outcome === 'failed' ? '✗ FAILED' : 'PENDING';
      lines.push(`${ts} ── MODERATED CAUCUS — ${outcomeStr} ${'─'.repeat(28)}`);
      if (act.topic) lines.push(`  Topic: ${act.topic}`);
      if (act.raisedBy) lines.push(`  Raised by: ${getName(act.raisedBy)}`);
      if (act.perSpeakerTime) lines.push(`  Per speaker time: ${formatOffset(act.perSpeakerTime)} · Speakers: ${act.totalSpeakers ?? '?'}`);
      lines.push('');
      if (act.outcome === 'passed') {
        for (let i = 0; i < (act.speakers ?? []).length; i++) {
          const sp = act.speakers![i];
          lines.push(`  ▸ Speaker ${i + 1}: ${getName(sp.countryId)} [+${formatOffset(sp.speechStartOffset)}]`);
          if (sp.speechText) {
            const wrapped = sp.speechText.split('\n').map(l => `    ${l}`).join('\n');
            lines.push(wrapped);
          }
          for (const pt of (sp.points ?? [])) {
            lines.push(`    [${POINT_LABELS[pt.type] ?? pt.type}] Raised by: ${getName(pt.raisedBy)}`);
            if (pt.content) lines.push(`      Q: ${pt.content}`);
            if (pt.answer) lines.push(`      A: ${pt.answer}`);
          }
          lines.push('');
        }
      }
    }

    if (act.type === 'unmod_coc') {
      const dur = act.durationSeconds ?? 0;
      const durLabel = dur >= 3600 ? `${Math.floor(dur / 3600)}h` : `${Math.floor(dur / 60)}m`;
      lines.push(`${ts} ── UNMODERATED CAUCUS ${'─'.repeat(37)}`);
      lines.push(`  Duration: ${durLabel}`);
      lines.push('');
    }
  }

  // Global points
  const globalPoints = sessionData.globalPoints ?? [];
  if (globalPoints.length > 0) {
    lines.push(DIV);
    lines.push('  GLOBAL POINTS');
    lines.push(DIV);
    for (const pt of globalPoints) {
      lines.push(`  [+${formatOffset(pt.raisedAtOffset)}] [${POINT_LABELS[pt.type] ?? pt.type}] Raised by: ${getName(pt.raisedBy)}`);
      if (pt.content) lines.push(`    ${pt.content}`);
      if (pt.answer) lines.push(`    A: ${pt.answer}`);
    }
    lines.push(DIV);
  }

  const text = lines.join('\n');
  return new NextResponse(text, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': 'attachment; filename="session_export.txt"',
    },
  });
}
