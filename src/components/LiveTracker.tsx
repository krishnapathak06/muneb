'use client';

import { useState, useEffect, useRef } from 'react';
import styles from './LiveTracker.module.css';

// ─── Audio Types (preserved from original) ────────────────────────────────────
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

// ─── Session / Activity Types ─────────────────────────────────────────────────
export type PointType =
  | 'poi'
  | 'po'
  | 'ppp'
  | 'ror'
  | 'ppi'
  | 'yield_comments'
  | 'yield_delegate';

export const POINT_LABELS: Record<PointType, string> = {
  poi: 'Point of Information',
  po: 'Point of Order',
  ppp: 'Point of Personal Privilege',
  ror: 'Right of Reply',
  ppi: 'Point of Parliamentary Inquiry',
  yield_comments: 'Yield to Comments',
  yield_delegate: 'Yield to Another Delegate',
};

export interface PointEntry {
  id: string;
  type: PointType;
  raisedBy: string;
  content: string;
  answer?: string;
  raisedAtOffset: number;
  raisedAt: string;
}

export interface GlobalPoint extends PointEntry {
  activityId: string | null;
}

export interface SpeakerEntry {
  id: string;
  countryId: string;
  speechStartOffset: number;
  speechStartAt: string;
  speechText: string;
  points: PointEntry[];
}

export type ActivityStatus = 'setup' | 'active' | 'completed';

interface BaseActivity {
  id: string;
  type: string;
  startedAtOffset: number;
  startedAt: string;
  status: ActivityStatus;
}

export interface AttendanceActivity extends BaseActivity {
  type: 'attendance';
  attendanceIndex: number;
  rolls: { countryId: string; status: 'present' | 'present_and_voting' | 'absent' }[];
}

export interface GSLActivity extends BaseActivity {
  type: 'gsl';
  raisedBy: string;
  firstSpeakerTime: number;
  perSpeakerTime: number;
  outcome: 'passed' | 'failed' | null;
  speakers: SpeakerEntry[];
}

export interface ModCocActivity extends BaseActivity {
  type: 'mod_coc';
  raisedBy: string;
  topic: string;
  perSpeakerTime: number;
  totalSpeakers: number;
  outcome: 'passed' | 'failed' | null;
  speakers: SpeakerEntry[];
}

export interface UnmodCocActivity extends BaseActivity {
  type: 'unmod_coc';
  durationSeconds: number;
}

export type ActivityRecord =
  | AttendanceActivity
  | GSLActivity
  | ModCocActivity
  | UnmodCocActivity;

export interface SessionData {
  sessionStart: string | null;
  activities: ActivityRecord[];
  globalPoints: GlobalPoint[];
}

// ─── Constants ────────────────────────────────────────────────────────────────
export const SPEAKER_TIMES = [15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180];
export const SPEAKER_TIME_LABELS = SPEAKER_TIMES.map((s) => {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? `${m}m` : `${m}m ${r}s`;
});

export const UNMOD_DURATIONS = [300, 600, 900, 1200, 1800, 2700, 3600];
export const UNMOD_LABELS = UNMOD_DURATIONS.map((s) => {
  const m = s / 60;
  return m >= 60 ? '1h' : `${m}m`;
});

export const SPEAKER_COUNTS = Array.from({ length: 50 }, (_, i) => i + 1);

const CHUNK_OPTIONS = [
  { label: '30 seconds (for testing)', value: 30 },
  { label: '1 minute (for testing)', value: 60 },
  { label: '10 minutes (default)', value: 600 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Country {
  id: string;
  name: string;
}

interface Props {
  workspaceId: string;
  countries: Country[];
}

// ─── Sub-components (defined at module level for stable identity) ─────────────

function DelegateSelect({
  label,
  countries,
  value,
  onChange,
}: {
  label: string;
  countries: Country[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const selected = countries.find((c) => c.id === value);
  const filtered = search
    ? countries.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : countries;

  return (
    <div className={styles.delegateSelectWrapper}>
      <label className="label">{label}</label>
      {selected ? (
        <div className={styles.delegateSelected}>
          <span className={styles.delegateSelectedName}>{selected.name}</span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              onChange('');
              setSearch('');
            }}
          >
            ×
          </button>
        </div>
      ) : (
        <div className={styles.delegateSearchBox}>
          <input
            className="input"
            placeholder="Search delegates…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <div className={styles.delegateDropdown}>
              {filtered.slice(0, 10).map((c) => (
                <button
                  key={c.id}
                  className={styles.delegateOption}
                  onClick={() => {
                    onChange(c.id);
                    setSearch('');
                  }}
                >
                  {c.name}
                </button>
              ))}
              {filtered.length === 0 && (
                <span className={styles.delegateNoResults}>No matches</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PointForm({
  draft,
  onChange,
  countries,
}: {
  draft: Partial<PointEntry>;
  onChange: (d: Partial<PointEntry>) => void;
  countries: Country[];
}) {
  return (
    <div className={styles.pointFormFields}>
      <div className={styles.formRow}>
        <label className="label">Type</label>
        <select
          className="select"
          value={draft.type ?? ''}
          onChange={(e) => onChange({ ...draft, type: e.target.value as PointType })}
        >
          <option value="">Select type…</option>
          {(Object.keys(POINT_LABELS) as PointType[]).map((pt) => (
            <option key={pt} value={pt}>
              {POINT_LABELS[pt]}
            </option>
          ))}
        </select>
      </div>
      <DelegateSelect
        label="Raised By"
        countries={countries}
        value={draft.raisedBy ?? ''}
        onChange={(id) => onChange({ ...draft, raisedBy: id })}
      />
      <div className={styles.formRow}>
        <label className="label">Content</label>
        <textarea
          className={`input ${styles.pointContentArea}`}
          rows={2}
          value={draft.content ?? ''}
          onChange={(e) => onChange({ ...draft, content: e.target.value })}
          placeholder="Point content…"
        />
      </div>
      {draft.type === 'poi' && (
        <div className={styles.formRow}>
          <label className="label">Answer (original speaker&apos;s reply)</label>
          <textarea
            className={`input ${styles.pointContentArea}`}
            rows={2}
            value={draft.answer ?? ''}
            onChange={(e) => onChange({ ...draft, answer: e.target.value })}
            placeholder="Speaker&apos;s reply to the point…"
          />
        </div>
      )}
    </div>
  );
}

function CompletedActivityCard({
  activity,
  countries,
}: {
  activity: ActivityRecord;
  countries: Country[];
}) {
  const getName = (id: string) => countries.find((c) => c.id === id)?.name ?? id;

  if (activity.type === 'attendance') {
    const att = activity as AttendanceActivity;
    const present = att.rolls.filter((r) => r.status === 'present').length;
    const pv = att.rolls.filter((r) => r.status === 'present_and_voting').length;
    const absent = att.rolls.filter((r) => r.status === 'absent').length;
    return (
      <div className={`${styles.activityCard} ${styles.activityCardAttendance} ${styles.activityCardCompleted}`}>
        <div className={styles.activityCardHeader}>
          <span className={`${styles.activityBadge} ${styles.badgeAttendance}`}>
            📋 Attendance Roll #{att.attendanceIndex}
          </span>
          <span className={styles.activityTimestamp}>[+{formatTime(activity.startedAtOffset)}]</span>
        </div>
        <p className={styles.completedSummary}>
          {present + pv} Present · {pv} P+V · {absent} Absent
        </p>
      </div>
    );
  }

  if (activity.type === 'gsl') {
    const gsl = activity as GSLActivity;
    return (
      <div className={`${styles.activityCard} ${styles.activityCardGSL} ${styles.activityCardCompleted}`}>
        <div className={styles.activityCardHeader}>
          <span className={`${styles.activityBadge} ${styles.badgeGSL}`}>🎙 GSL</span>
          <span
            className={`${styles.outcomeBadge} ${
              gsl.outcome === 'passed' ? styles.outcomePassed : styles.outcomeFailed
            }`}
          >
            {gsl.outcome === 'passed' ? '✓ Passed' : '✗ Failed'}
          </span>
          <span className={styles.activityTimestamp}>[+{formatTime(activity.startedAtOffset)}]</span>
        </div>
        {gsl.outcome === 'passed' && (
          <p className={styles.completedSummary}>
            Raised by {getName(gsl.raisedBy)} · {gsl.speakers.length} speaker
            {gsl.speakers.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    );
  }

  if (activity.type === 'mod_coc') {
    const mc = activity as ModCocActivity;
    return (
      <div className={`${styles.activityCard} ${styles.activityCardModCoc} ${styles.activityCardCompleted}`}>
        <div className={styles.activityCardHeader}>
          <span className={`${styles.activityBadge} ${styles.badgeModCoc}`}>🗣 Mod Coc</span>
          <span
            className={`${styles.outcomeBadge} ${
              mc.outcome === 'passed' ? styles.outcomePassed : styles.outcomeFailed
            }`}
          >
            {mc.outcome === 'passed' ? '✓ Passed' : '✗ Failed'}
          </span>
          <span className={styles.activityTimestamp}>[+{formatTime(activity.startedAtOffset)}]</span>
        </div>
        {mc.outcome === 'passed' && (
          <p className={styles.completedSummary}>
            {mc.topic} · {mc.speakers.length} speaker{mc.speakers.length !== 1 ? 's' : ''}
          </p>
        )}
        {mc.outcome === 'failed' && mc.topic && (
          <p className={styles.completedSummary}>Topic: {mc.topic}</p>
        )}
      </div>
    );
  }

  if (activity.type === 'unmod_coc') {
    const uc = activity as UnmodCocActivity;
    const mins = uc.durationSeconds / 60;
    const label = mins >= 60 ? '1 hour' : `${mins} minutes`;
    return (
      <div className={`${styles.activityCard} ${styles.activityCardUnmod} ${styles.activityCardCompleted}`}>
        <div className={styles.activityCardHeader}>
          <span className={`${styles.activityBadge} ${styles.badgeUnmod}`}>☕ Unmod Coc</span>
          <span className={styles.activityTimestamp}>[+{formatTime(activity.startedAtOffset)}]</span>
        </div>
        <p className={styles.completedSummary}>{label}</p>
      </div>
    );
  }

  return null;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function LiveTracker({ workspaceId, countries }: Props) {
  // ── Audio recording state (preserved) ─────────────────────────────────────
  const [isMeetingActive, setIsMeetingActive] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [chunkSize, setChunkSize] = useState(600);
  const [manifest, setManifest] = useState<Manifest>({ segments: [] });
  const [audioError, setAudioError] = useState<string | null>(null);

  // ── Audio playback state (preserved) ──────────────────────────────────────
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // ── Audio recording refs (preserved) ──────────────────────────────────────
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const currentSegmentIdRef = useRef<string | null>(null);
  const currentSegmentStartOffsetRef = useRef<number>(0);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const chunkTimerRef = useRef<NodeJS.Timeout | null>(null);
  const chunkStartTimeRef = useRef<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // ── Session data state ────────────────────────────────────────────────────
  const [sessionData, setSessionData] = useState<SessionData>({
    sessionStart: null,
    activities: [],
    globalPoints: [],
  });

  // ── UI workflow state ─────────────────────────────────────────────────────
  const [addActivityOpen, setAddActivityOpen] = useState(false);

  // Speaker phase state
  const [currentSpeakerCountryId, setCurrentSpeakerCountryId] = useState('');
  const [currentSpeechText, setCurrentSpeechText] = useState('');
  const [currentSpeakerStarted, setCurrentSpeakerStarted] = useState(false);
  const [currentSpeakerPoints, setCurrentSpeakerPoints] = useState<PointEntry[]>([]);
  const [addingPointToCurrentSpeaker, setAddingPointToCurrentSpeaker] = useState(false);
  const [currentPointDraft, setCurrentPointDraft] = useState<Partial<PointEntry>>({});

  // Speaker timer state
  const [speakerTimerMode, setSpeakerTimerMode] = useState<'stopwatch' | 'countdown'>('stopwatch');
  const [speakerElapsed, setSpeakerElapsed] = useState(0);
  const [speakerTimerRunning, setSpeakerTimerRunning] = useState(false);
  const [speakerTimeLimit, setSpeakerTimeLimit] = useState(90);
  const speakerTimerRef = useRef<NodeJS.Timeout | null>(null);
  const speakerStartOffsetRef = useRef<number>(0);

  // Global floating point
  const [globalPointOpen, setGlobalPointOpen] = useState(false);
  const [globalPointDraft, setGlobalPointDraft] = useState<Partial<PointEntry>>({});

  // ── Load session on mount ──────────────────────────────────────────────────
  useEffect(() => {
    loadSession();
    audioRef.current = new Audio();
    audioRef.current.addEventListener('ended', handleAudioEnded);
    return () => {
      cleanupRecording();
      stopSpeakerTimer();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeEventListener('ended', handleAudioEnded);
      }
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadSession() {
    try {
      const res = await fetch(`/api/workspace-data/${workspaceId}/session`);
      const data = await res.json();
      if (data.manifest) setManifest(data.manifest);
      if (data.activities) setSessionData(data.activities);
    } catch (err) {
      console.error('Failed to load session', err);
    }
  }

  async function saveSessionData(updated: SessionData) {
    setSessionData(updated);
    try {
      await fetch(`/api/workspace-data/${workspaceId}/session/save-activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
    } catch (err) {
      console.error('Failed to save session data', err);
    }
  }

  // ── Audio recording (preserved from original) ──────────────────────────────

  async function startMeeting() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      setIsMeetingActive(true);
      setRecordingSeconds(0);
      setAudioError(null);
      currentSegmentStartOffsetRef.current = 0;

      // Init session start timestamp if not set
      if (!sessionData.sessionStart) {
        const updated: SessionData = {
          ...sessionData,
          sessionStart: new Date().toISOString(),
        };
        await saveSessionData(updated);
      }

      startNextSegment(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      setAudioError((err as Error).message);
    }
  }

  function startNextSegment(cumulativeOffset: number) {
    if (!mediaStreamRef.current) return;

    const segmentId = Date.now().toString();
    currentSegmentIdRef.current = segmentId;
    currentSegmentStartOffsetRef.current = cumulativeOffset;
    chunkStartTimeRef.current = Date.now();

    let mimeType = 'audio/webm';
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
      mimeType = 'audio/webm;codecs=opus';
    } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
      mimeType = 'audio/mp4';
    }

    const recorder = new MediaRecorder(mediaStreamRef.current, { mimeType });
    mediaRecorderRef.current = recorder;

    recorder.onerror = () => {
      setAudioError('MediaRecorder encountered an error. Check microphone permissions.');
    };

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = async () => {
      const duration = (Date.now() - chunkStartTimeRef.current) / 1000;
      if (chunks.length === 0 || duration < 0.5) return;

      const blob = new Blob(chunks, { type: mimeType });
      const file = new File([blob], `segment_${segmentId}.bin`, { type: mimeType });

      const fd = new FormData();
      fd.append('segmentId', segmentId);
      fd.append('startOffset', cumulativeOffset.toString());
      fd.append('duration', duration.toString());
      fd.append('audio', file);

      try {
        const res = await fetch(
          `/api/workspace-data/${workspaceId}/session/upload-segment`,
          { method: 'POST', body: fd }
        );
        const data = await res.json();
        if (data.success) loadSession();
      } catch (err) {
        console.error('Failed to upload segment', err);
      }
    };

    recorder.start();

    chunkTimerRef.current = setTimeout(() => {
      const elapsed = (Date.now() - chunkStartTimeRef.current) / 1000;
      stopCurrentSegmentOnly();
      startNextSegment(cumulativeOffset + elapsed);
    }, chunkSize * 1000);
  }

  function stopCurrentSegmentOnly() {
    if (chunkTimerRef.current) clearTimeout(chunkTimerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }

  async function stopMeeting() {
    cleanupRecording();
    setIsMeetingActive(false);
    stopSpeakerTimer();
    setTimeout(loadSession, 1000);
  }

  function cleanupRecording() {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (chunkTimerRef.current) clearTimeout(chunkTimerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
  }

  // ── Audio playback (preserved from original) ───────────────────────────────

  const totalPlaybackDuration = manifest.segments.reduce((acc, s) => acc + s.duration, 0);

  function findSegmentForTime(time: number) {
    if (manifest.segments.length === 0) return null;
    const seg = manifest.segments.find(
      (s) => time >= s.startOffset && time < s.startOffset + s.duration
    );
    if (seg) return { segment: seg, timeInSegment: time - seg.startOffset };
    const last = manifest.segments[manifest.segments.length - 1];
    if (time >= last.startOffset)
      return { segment: last, timeInSegment: Math.min(time - last.startOffset, last.duration) };
    return { segment: manifest.segments[0], timeInSegment: 0 };
  }

  function syncAudioPlayback(targetTime: number, startPlaying: boolean) {
    if (!audioRef.current) return;
    const lookup = findSegmentForTime(targetTime);
    if (!lookup) return;
    const { segment, timeInSegment } = lookup;
    const targetUrl = `${window.location.origin}/api/workspace-data/${workspaceId}/${segment.file}`;
    if (audioRef.current.src !== targetUrl) {
      audioRef.current.src = targetUrl;
      audioRef.current.load();
    }
    audioRef.current.currentTime = timeInSegment;
    audioRef.current.playbackRate = playbackSpeed;
    setCurrentTime(targetTime);
    if (startPlaying) {
      audioRef.current
        .play()
        .then(() => {
          setIsPlaying(true);
          startProgressInterval();
        })
        .catch(console.error);
    } else {
      audioRef.current.pause();
      setIsPlaying(false);
      stopProgressInterval();
    }
  }

  function handleAudioEnded() {
    if (!audioRef.current) return;
    const lookup = findSegmentForTime(currentTime);
    if (!lookup) {
      setIsPlaying(false);
      return;
    }
    const idx = manifest.segments.findIndex((s) => s.id === lookup.segment.id);
    if (idx !== -1 && idx < manifest.segments.length - 1) {
      syncAudioPlayback(manifest.segments[idx + 1].startOffset, true);
    } else {
      setIsPlaying(false);
      stopProgressInterval();
    }
  }

  function startProgressInterval() {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    progressIntervalRef.current = setInterval(() => {
      if (!audioRef.current || !isPlaying) return;
      const lookup = findSegmentForTime(currentTime);
      if (lookup) {
        const ct = lookup.segment.startOffset + audioRef.current.currentTime;
        setCurrentTime(ct);
        if (audioRef.current.currentTime >= lookup.segment.duration) handleAudioEnded();
      }
    }, 150);
  }

  function stopProgressInterval() {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
  }

  function togglePlayPause() {
    if (totalPlaybackDuration === 0) return;
    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
      stopProgressInterval();
    } else {
      syncAudioPlayback(currentTime, true);
    }
  }

  function handleScrub(time: number) {
    syncAudioPlayback(Math.max(0, Math.min(time, totalPlaybackDuration)), isPlaying);
  }

  // ── Speaker Timer ──────────────────────────────────────────────────────────

  function startSpeakerTimer(timeLimit: number) {
    speakerStartOffsetRef.current = recordingSeconds;
    setSpeakerElapsed(0);
    setSpeakerTimerRunning(true);
    setSpeakerTimeLimit(timeLimit);
    if (speakerTimerRef.current) clearInterval(speakerTimerRef.current);
    speakerTimerRef.current = setInterval(() => {
      setSpeakerElapsed((prev) => prev + 1);
    }, 1000);
  }

  function stopSpeakerTimer() {
    if (speakerTimerRef.current) clearInterval(speakerTimerRef.current);
    setSpeakerTimerRunning(false);
    setSpeakerElapsed(0);
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const currentActivity =
    sessionData.activities.find((a) => a.status !== 'completed') ?? null;
  const canAddActivity = !currentActivity && isMeetingActive;
  const getName = (id: string) => countries.find((c) => c.id === id)?.name ?? id;

  const speakerDisplayTime =
    speakerTimerMode === 'stopwatch'
      ? formatTime(speakerElapsed)
      : formatTime(Math.max(0, speakerTimeLimit - speakerElapsed));
  const speakerWarning =
    speakerTimerMode === 'countdown' && speakerElapsed >= speakerTimeLimit - 15;
  const speakerExpired =
    speakerTimerMode === 'countdown' && speakerElapsed >= speakerTimeLimit;

  // ── Activity management ────────────────────────────────────────────────────

  function mutateCurrent(updates: Partial<ActivityRecord>) {
    if (!currentActivity) return;
    const id = currentActivity.id;
    const updated: SessionData = {
      ...sessionData,
      activities: sessionData.activities.map((a) =>
        a.id === id ? ({ ...a, ...updates } as ActivityRecord) : a
      ),
    };
    saveSessionData(updated);
  }

  function addActivity(type: ActivityRecord['type']) {
    const now = new Date().toISOString();
    const offset = recordingSeconds;
    const base = { id: genId(), startedAtOffset: offset, startedAt: now };

    let newActivity: ActivityRecord;

    if (type === 'attendance') {
      const attendanceCount =
        sessionData.activities.filter((a) => a.type === 'attendance').length + 1;
      newActivity = {
        ...base,
        type: 'attendance',
        attendanceIndex: attendanceCount,
        status: 'active',
        rolls: countries.map((c) => ({ countryId: c.id, status: 'absent' as const })),
      };
    } else if (type === 'gsl') {
      newActivity = {
        ...base,
        type: 'gsl',
        status: 'setup',
        raisedBy: '',
        firstSpeakerTime: 90,
        perSpeakerTime: 60,
        outcome: null,
        speakers: [],
      };
    } else if (type === 'mod_coc') {
      newActivity = {
        ...base,
        type: 'mod_coc',
        status: 'setup',
        raisedBy: '',
        topic: '',
        perSpeakerTime: 90,
        totalSpeakers: 8,
        outcome: null,
        speakers: [],
      };
    } else {
      newActivity = {
        ...base,
        type: 'unmod_coc',
        status: 'setup',
        durationSeconds: 600,
      };
    }

    saveSessionData({
      ...sessionData,
      activities: [...sessionData.activities, newActivity],
    });
    setAddActivityOpen(false);
    resetSpeakerState();
  }

  function resetSpeakerState() {
    setCurrentSpeakerCountryId('');
    setCurrentSpeechText('');
    setCurrentSpeakerStarted(false);
    setCurrentSpeakerPoints([]);
    setAddingPointToCurrentSpeaker(false);
    setCurrentPointDraft({});
    stopSpeakerTimer();
  }

  function completeAttendance() {
    mutateCurrent({ status: 'completed' });
  }

  function updateAttendanceRoll(
    countryId: string,
    status: 'present' | 'present_and_voting' | 'absent'
  ) {
    if (!currentActivity || currentActivity.type !== 'attendance') return;
    const att = currentActivity as AttendanceActivity;
    mutateCurrent({
      rolls: att.rolls.map((r) =>
        r.countryId === countryId ? { ...r, status } : r
      ),
    } as Partial<AttendanceActivity>);
  }

  function passActivity() {
    mutateCurrent({ outcome: 'passed', status: 'active' } as any);
    resetSpeakerState();
  }

  function failActivity() {
    mutateCurrent({ outcome: 'failed', status: 'completed' } as any);
  }

  function completeUnmod() {
    mutateCurrent({ status: 'completed' });
  }

  function handleStartSpeech(activity: GSLActivity | ModCocActivity) {
    const isFirst = activity.speakers.length === 0;
    const timeLimit =
      activity.type === 'gsl' && isFirst
        ? (activity as GSLActivity).firstSpeakerTime
        : activity.perSpeakerTime;
    setCurrentSpeakerStarted(true);
    startSpeakerTimer(timeLimit);
  }

  function commitCurrentSpeaker(activity: GSLActivity | ModCocActivity) {
    if (!currentSpeakerCountryId) return;
    const newSpeaker: SpeakerEntry = {
      id: genId(),
      countryId: currentSpeakerCountryId,
      speechStartOffset: speakerStartOffsetRef.current,
      speechStartAt: new Date().toISOString(),
      speechText: currentSpeechText,
      points: currentSpeakerPoints,
    };
    mutateCurrent({ speakers: [...activity.speakers, newSpeaker] } as any);
  }

  function handleAddNextSpeaker() {
    if (!currentActivity) return;
    if (currentActivity.type !== 'gsl' && currentActivity.type !== 'mod_coc') return;
    if (currentSpeakerStarted && currentSpeakerCountryId) {
      commitCurrentSpeaker(currentActivity as GSLActivity | ModCocActivity);
    }
    resetSpeakerState();
  }

  function handleCloseActivity() {
    if (!currentActivity) return;
    if (
      (currentActivity.type === 'gsl' || currentActivity.type === 'mod_coc') &&
      currentSpeakerStarted &&
      currentSpeakerCountryId
    ) {
      commitCurrentSpeaker(currentActivity as GSLActivity | ModCocActivity);
    }
    mutateCurrent({ status: 'completed' } as any);
    resetSpeakerState();
  }

  function addCurrentSpeakerPoint() {
    const d = currentPointDraft;
    if (!d.type || !d.raisedBy || !d.content) return;
    const point: PointEntry = {
      id: genId(),
      type: d.type as PointType,
      raisedBy: d.raisedBy,
      content: d.content,
      answer: d.answer,
      raisedAtOffset: recordingSeconds,
      raisedAt: new Date().toISOString(),
    };
    setCurrentSpeakerPoints((prev) => [...prev, point]);
    setCurrentPointDraft({});
    setAddingPointToCurrentSpeaker(false);
  }

  function addGlobalPoint() {
    const d = globalPointDraft;
    if (!d.type || !d.raisedBy || !d.content) return;
    const point: GlobalPoint = {
      id: genId(),
      type: d.type as PointType,
      raisedBy: d.raisedBy,
      content: d.content,
      answer: d.answer,
      raisedAtOffset: recordingSeconds,
      raisedAt: new Date().toISOString(),
      activityId: currentActivity?.id ?? null,
    };
    saveSessionData({
      ...sessionData,
      globalPoints: [...sessionData.globalPoints, point],
    });
    setGlobalPointDraft({});
    setGlobalPointOpen(false);
  }

  async function handleExport() {
    try {
      const res = await fetch(`/api/workspace-data/${workspaceId}/session/export`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'session_export.txt';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed', err);
    }
  }

  // ── Speaker Phase Renderer ─────────────────────────────────────────────────

  function renderSpeakerPhase(
    activity: GSLActivity | ModCocActivity,
    cardClass: string,
    badgeClass: string,
    title: string
  ) {
    return (
      <div key={activity.id} className={`${styles.activityCard} ${cardClass}`}>
        <div className={styles.activityCardHeader}>
          <span className={`${styles.activityBadge} ${badgeClass}`}>{title}</span>
          <div className={styles.activityHeaderRight}>
            <span className={styles.activityTimestamp}>[+{formatTime(activity.startedAtOffset)}]</span>
            <button
              className={`btn btn-ghost btn-sm ${styles.closeActivityBtn}`}
              onClick={handleCloseActivity}
            >
              Close Activity
            </button>
          </div>
        </div>

        {/* Previous speakers list */}
        {activity.speakers.length > 0 && (
          <div className={styles.prevSpeakers}>
            <div className={styles.prevSpeakersLabel}>Speakers so far</div>
            {activity.speakers.map((sp, i) => (
              <div key={sp.id} className={styles.prevSpeakerRow}>
                <span className={styles.prevSpeakerNum}>{i + 1}.</span>
                <span className={styles.prevSpeakerName}>{getName(sp.countryId)}</span>
                <span className={styles.prevSpeakerTime}>[+{formatTime(sp.speechStartOffset)}]</span>
                {sp.points.length > 0 && (
                  <span className={styles.prevSpeakerPointsTag}>
                    {sp.points.length}pt
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Current speaker entry */}
        <div className={styles.speakerEntry}>
          {!currentSpeakerStarted ? (
            <div className={styles.speakerSelectRow}>
              <DelegateSelect
                label={`Speaker ${activity.speakers.length + 1}`}
                countries={countries}
                value={currentSpeakerCountryId}
                onChange={setCurrentSpeakerCountryId}
              />
              <button
                className="btn btn-primary"
                disabled={!currentSpeakerCountryId}
                onClick={() => handleStartSpeech(activity)}
              >
                ▶ Start Speech
              </button>
            </div>
          ) : (
            <>
              {/* Big Timer Display */}
              <div
                className={`${styles.speakerTimerDisplay} ${
                  speakerExpired
                    ? styles.speakerTimerExpired
                    : speakerWarning
                    ? styles.speakerTimerWarning
                    : ''
                }`}
              >
                <div className={styles.speakerTimerTime}>{speakerDisplayTime}</div>
                <div className={styles.speakerTimerName}>{getName(currentSpeakerCountryId)}</div>
                <div className={styles.speakerTimerToggle}>
                  <button
                    className={`${styles.timerModeBtn} ${
                      speakerTimerMode === 'stopwatch' ? styles.timerModeBtnActive : ''
                    }`}
                    onClick={() => setSpeakerTimerMode('stopwatch')}
                  >
                    ⏱ Stopwatch
                  </button>
                  <button
                    className={`${styles.timerModeBtn} ${
                      speakerTimerMode === 'countdown' ? styles.timerModeBtnActive : ''
                    }`}
                    onClick={() => setSpeakerTimerMode('countdown')}
                  >
                    ⏳ Countdown
                  </button>
                </div>
              </div>

              {/* Speech textarea */}
              <textarea
                className={`input ${styles.speechTextarea}`}
                placeholder="Type or dictate the speech…"
                value={currentSpeechText}
                onChange={(e) => setCurrentSpeechText(e.target.value)}
                rows={5}
              />

              {/* Saved points for this speaker */}
              {currentSpeakerPoints.length > 0 && (
                <div className={styles.speakerPointsList}>
                  {currentSpeakerPoints.map((pt) => (
                    <div key={pt.id} className={styles.pointRow}>
                      <span className={styles.pointTypeBadge}>{POINT_LABELS[pt.type]}</span>
                      <span className={styles.pointRaisedBy}>↑ {getName(pt.raisedBy)}</span>
                      <span className={styles.pointContent}>{pt.content}</span>
                      {pt.answer && (
                        <span className={styles.pointAnswer}>A: {pt.answer}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Add point inline */}
              {addingPointToCurrentSpeaker ? (
                <div className={styles.pointFormInline}>
                  <PointForm
                    draft={currentPointDraft}
                    onChange={setCurrentPointDraft}
                    countries={countries}
                  />
                  <div className={styles.pointFormActions}>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setAddingPointToCurrentSpeaker(false);
                        setCurrentPointDraft({});
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={
                        !currentPointDraft.type ||
                        !currentPointDraft.raisedBy ||
                        !currentPointDraft.content
                      }
                      onClick={addCurrentSpeakerPoint}
                    >
                      Save Point
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className={styles.addPointBtn}
                  onClick={() => setAddingPointToCurrentSpeaker(true)}
                >
                  + Add Point
                </button>
              )}

              <div className={styles.speakerActions}>
                <button className="btn btn-secondary" onClick={handleAddNextSpeaker}>
                  Add Next Speaker
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Active Activity Renderer ───────────────────────────────────────────────

  function renderActiveActivity(activity: ActivityRecord) {
    if (activity.type === 'attendance') {
      const att = activity as AttendanceActivity;
      return (
        <div
          key={activity.id}
          className={`${styles.activityCard} ${styles.activityCardAttendance}`}
        >
          <div className={styles.activityCardHeader}>
            <span className={`${styles.activityBadge} ${styles.badgeAttendance}`}>
              📋 Attendance Roll #{att.attendanceIndex}
            </span>
            <span className={styles.activityTimestamp}>
              [+{formatTime(activity.startedAtOffset)}]
            </span>
          </div>
          <div className={styles.attendanceTable}>
            {countries.map((country) => {
              const roll = att.rolls.find((r) => r.countryId === country.id);
              const status = roll?.status ?? 'absent';
              return (
                <div key={country.id} className={styles.attendanceRow}>
                  <span className={styles.attendanceCountryName}>{country.name}</span>
                  <div className={styles.attendanceOptions}>
                    {(
                      ['present', 'present_and_voting', 'absent'] as const
                    ).map((s) => (
                      <button
                        key={s}
                        className={`${styles.attendanceBtn} ${
                          status === s ? styles.attendanceBtnActive : ''
                        }`}
                        onClick={() => updateAttendanceRoll(country.id, s)}
                      >
                        {s === 'present' ? 'P' : s === 'present_and_voting' ? 'P+V' : 'A'}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <button
            className="btn btn-primary"
            style={{ marginTop: 16 }}
            onClick={completeAttendance}
          >
            Close Roll Call
          </button>
        </div>
      );
    }

    if (activity.type === 'gsl') {
      const gsl = activity as GSLActivity;

      if (gsl.status === 'setup') {
        return (
          <div key={activity.id} className={`${styles.activityCard} ${styles.activityCardGSL}`}>
            <div className={styles.activityCardHeader}>
              <span className={`${styles.activityBadge} ${styles.badgeGSL}`}>🎙 GSL — Setup</span>
              <span className={styles.activityTimestamp}>
                [+{formatTime(activity.startedAtOffset)}]
              </span>
            </div>
            <div className={styles.setupForm}>
              <DelegateSelect
                label="Raised By"
                countries={countries}
                value={gsl.raisedBy}
                onChange={(v) => mutateCurrent({ raisedBy: v } as any)}
              />
              <div className={styles.formRow}>
                <label className="label">First Speaker Time</label>
                <select
                  className="select"
                  value={gsl.firstSpeakerTime}
                  onChange={(e) => mutateCurrent({ firstSpeakerTime: parseInt(e.target.value) } as any)}
                >
                  {SPEAKER_TIMES.map((t, i) => (
                    <option key={t} value={t}>
                      {SPEAKER_TIME_LABELS[i]}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.formRow}>
                <label className="label">Per Speaker Time</label>
                <select
                  className="select"
                  value={gsl.perSpeakerTime}
                  onChange={(e) => mutateCurrent({ perSpeakerTime: parseInt(e.target.value) } as any)}
                >
                  {SPEAKER_TIMES.map((t, i) => (
                    <option key={t} value={t}>
                      {SPEAKER_TIME_LABELS[i]}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.voteRow}>
                <button
                  className="btn btn-danger"
                  disabled={!gsl.raisedBy}
                  onClick={failActivity}
                >
                  ✗ Failed
                </button>
                <button
                  className="btn btn-primary"
                  disabled={!gsl.raisedBy}
                  onClick={passActivity}
                >
                  ✓ Passed → Open Speaker Phase
                </button>
              </div>
            </div>
          </div>
        );
      }

      return renderSpeakerPhase(
        gsl,
        styles.activityCardGSL,
        styles.badgeGSL,
        `🎙 GSL — Active`
      );
    }

    if (activity.type === 'mod_coc') {
      const mc = activity as ModCocActivity;

      if (mc.status === 'setup') {
        return (
          <div
            key={activity.id}
            className={`${styles.activityCard} ${styles.activityCardModCoc}`}
          >
            <div className={styles.activityCardHeader}>
              <span className={`${styles.activityBadge} ${styles.badgeModCoc}`}>
                🗣 Mod Coc — Setup
              </span>
              <span className={styles.activityTimestamp}>
                [+{formatTime(activity.startedAtOffset)}]
              </span>
            </div>
            <div className={styles.setupForm}>
              <DelegateSelect
                label="Raised By"
                countries={countries}
                value={mc.raisedBy}
                onChange={(v) => mutateCurrent({ raisedBy: v } as any)}
              />
              <div className={styles.formRow}>
                <label className="label">Topic</label>
                <input
                  className="input"
                  value={mc.topic}
                  onChange={(e) => mutateCurrent({ topic: e.target.value } as any)}
                  placeholder="Moderated caucus topic…"
                />
              </div>
              <div className={styles.formRow}>
                <label className="label">Per Speaker Time</label>
                <select
                  className="select"
                  value={mc.perSpeakerTime}
                  onChange={(e) => mutateCurrent({ perSpeakerTime: parseInt(e.target.value) } as any)}
                >
                  {SPEAKER_TIMES.map((t, i) => (
                    <option key={t} value={t}>
                      {SPEAKER_TIME_LABELS[i]}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.formRow}>
                <label className="label">Number of Speakers</label>
                <select
                  className="select"
                  value={mc.totalSpeakers}
                  onChange={(e) => mutateCurrent({ totalSpeakers: parseInt(e.target.value) } as any)}
                >
                  {SPEAKER_COUNTS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.voteRow}>
                <button
                  className="btn btn-danger"
                  disabled={!mc.raisedBy || !mc.topic}
                  onClick={failActivity}
                >
                  ✗ Failed
                </button>
                <button
                  className="btn btn-primary"
                  disabled={!mc.raisedBy || !mc.topic}
                  onClick={passActivity}
                >
                  ✓ Passed → Open Speaker Phase
                </button>
              </div>
            </div>
          </div>
        );
      }

      return renderSpeakerPhase(
        mc,
        styles.activityCardModCoc,
        styles.badgeModCoc,
        `🗣 Mod Coc — ${mc.topic || 'Active'}`
      );
    }

    if (activity.type === 'unmod_coc') {
      const uc = activity as UnmodCocActivity;
      return (
        <div key={activity.id} className={`${styles.activityCard} ${styles.activityCardUnmod}`}>
          <div className={styles.activityCardHeader}>
            <span className={`${styles.activityBadge} ${styles.badgeUnmod}`}>
              ☕ Unmod Coc — Setup
            </span>
            <span className={styles.activityTimestamp}>
              [+{formatTime(activity.startedAtOffset)}]
            </span>
          </div>
          <div className={styles.setupForm}>
            <label className="label" style={{ marginBottom: 8 }}>
              Duration
            </label>
            <div className={styles.durationPills}>
              {UNMOD_DURATIONS.map((d, i) => (
                <button
                  key={d}
                  className={`${styles.durationPill} ${
                    uc.durationSeconds === d ? styles.durationPillActive : ''
                  }`}
                  onClick={() => mutateCurrent({ durationSeconds: d } as any)}
                >
                  {UNMOD_LABELS[i]}
                </button>
              ))}
            </div>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={completeUnmod}>
              Confirm
            </button>
          </div>
        </div>
      );
    }

    return null;
  }

  // ── Main Render ────────────────────────────────────────────────────────────

  return (
    <div className={styles.trackerContainer}>
      {/* ── Audio Error Full-Screen Overlay ───────────────────────────────── */}
      {audioError && (
        <div className={styles.audioErrorOverlay}>
          <div className={styles.audioErrorCard}>
            <div className={styles.audioErrorIcon}>⚠</div>
            <h2 className={styles.audioErrorTitle}>Audio Recording Error</h2>
            <p className={styles.audioErrorDesc}>
              The committee session audio has stopped. Your session timer and all activity data
              are preserved.
            </p>
            <code className={styles.audioErrorMsg}>{audioError}</code>
            <div className={styles.audioErrorActions}>
              <button className="btn btn-ghost" onClick={() => setAudioError(null)}>
                Dismiss
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setAudioError(null);
                  startNextSegment(currentSegmentStartOffsetRef.current);
                }}
              >
                Try to Restart Mic
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Session Header ─────────────────────────────────────────────────── */}
      <div className={styles.sessionHeader}>
        <div className={styles.sessionHeaderLeft}>
          <div className={styles.recordIndicator}>
            <span
              className={`${styles.statusDot} ${isMeetingActive ? styles.statusRecording : ''}`}
            />
            <span className={styles.recordingLabel}>
              {isMeetingActive
                ? 'Session Active'
                : sessionData.sessionStart
                ? 'Session Paused'
                : 'No Session'}
            </span>
          </div>
          {isMeetingActive && (
            <div className={styles.sessionTimer}>{formatTime(recordingSeconds)}</div>
          )}
        </div>
        <div className={styles.sessionHeaderRight}>
          {sessionData.activities.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={handleExport}>
              ↓ Export .txt
            </button>
          )}
          {!isMeetingActive ? (
            <div className={styles.sessionStartGroup}>
              <select
                className="select"
                value={chunkSize}
                onChange={(e) => setChunkSize(parseInt(e.target.value))}
                style={{ minWidth: 160, fontSize: 12 }}
              >
                {CHUNK_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button className="btn btn-primary" onClick={startMeeting}>
                🔴 Begin Committee Session
              </button>
            </div>
          ) : (
            <button className="btn btn-danger" onClick={stopMeeting}>
              ⏹ End Session
            </button>
          )}
        </div>
      </div>

      {/* ── Main Two-Column Layout ────────────────────────────────────────── */}
      <div className={styles.trackerMain}>
        {/* Left: Activity Timeline */}
        <div className={styles.timelineCol}>
          <div className={styles.activityTimeline}>
            {sessionData.activities.map((activity) =>
              activity.status === 'completed'
                ? CompletedActivityCard({ activity, countries })
                : renderActiveActivity(activity)
            )}
          </div>

          {canAddActivity && (
            <button
              className={styles.addActivityBtn}
              onClick={() => setAddActivityOpen(true)}
            >
              <span className={styles.addActivityPlus}>+</span>
              Add Activity
            </button>
          )}

          {!isMeetingActive && sessionData.activities.length === 0 && (
            <div className={styles.emptyTimeline}>
              <div className={styles.emptyTimelineIcon}>🏛</div>
              <p>No committee session started yet.</p>
              <p className={styles.emptyTimelineSub}>
                Press &ldquo;Begin Committee Session&rdquo; to start recording and tracking
                activities.
              </p>
            </div>
          )}

          {isMeetingActive && sessionData.activities.length === 0 && !currentActivity && (
            <div className={styles.emptyTimeline}>
              <div className={styles.emptyTimelineIcon}>📋</div>
              <p>Session is running. Add your first activity.</p>
            </div>
          )}
        </div>

        {/* Right: Audio Playback */}
        <div className={styles.audioCol}>
          {totalPlaybackDuration > 0 ? (
            <div className={`card ${styles.playbackCard}`}>
              <h4 className={styles.audioColTitle}>🎧 Session Recording</h4>
              <div className={styles.playerTop}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={togglePlayPause}
                  style={{ width: 80 }}
                >
                  {isPlaying ? '⏸ Pause' : '▶ Play'}
                </button>
                <div className={styles.playerTimeline}>
                  <span className={styles.timeLabel}>{formatTime(currentTime)}</span>
                  <input
                    className={styles.seekBar}
                    type="range"
                    min={0}
                    max={totalPlaybackDuration}
                    step={0.1}
                    value={currentTime}
                    onChange={(e) => handleScrub(parseFloat(e.target.value))}
                  />
                  <span className={styles.timeLabel}>{formatTime(totalPlaybackDuration)}</span>
                </div>
              </div>
              <div className={styles.playerSpeedControl}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 8 }}>
                  Speed
                </span>
                {[1, 1.25, 1.5, 2].map((sp) => (
                  <button
                    key={sp}
                    className={`tab ${playbackSpeed === sp ? 'active' : ''}`}
                    onClick={() => {
                      setPlaybackSpeed(sp);
                      if (audioRef.current) audioRef.current.playbackRate = sp;
                    }}
                    style={{ padding: '2px 8px', fontSize: 11 }}
                  >
                    {sp}x
                  </button>
                ))}
              </div>
            </div>
          ) : (
            isMeetingActive && (
              <div className={`card ${styles.recordingIndicatorCard}`}>
                <div className={styles.recordingLivePulse} />
                <span className={styles.recordingLiveText}>Recording in progress…</span>
                <span className={styles.recordingLiveSub}>
                  {manifest.segments.length} segment
                  {manifest.segments.length !== 1 ? 's' : ''} saved
                </span>
              </div>
            )
          )}

          {/* Global points log */}
          {sessionData.globalPoints.length > 0 && (
            <div className={`card ${styles.globalPointsLog}`}>
              <h4 className={styles.audioColTitle}>⚡ Global Points</h4>
              {sessionData.globalPoints.map((pt) => (
                <div key={pt.id} className={styles.globalPointLogRow}>
                  <span className={styles.globalPointTime}>[+{formatTime(pt.raisedAtOffset)}]</span>
                  <span className={styles.pointTypeBadge}>{POINT_LABELS[pt.type]}</span>
                  <span className={styles.globalPointRaisedBy}>{getName(pt.raisedBy)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Add Activity Picker Modal ─────────────────────────────────────── */}
      {addActivityOpen && (
        <div className={styles.modalOverlay} onClick={() => setAddActivityOpen(false)}>
          <div
            className={styles.activityPickerModal}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={styles.modalTitle}>Select Activity Type</h3>
            <div className={styles.activityTypeGrid}>
              {(
                [
                  { type: 'attendance', icon: '📋', label: 'Attendance', sub: 'Roll call' },
                  { type: 'gsl', icon: '🎙', label: 'GSL', sub: 'General Speakers List' },
                  { type: 'mod_coc', icon: '🗣', label: 'Mod Coc', sub: 'Moderated Caucus' },
                  { type: 'unmod_coc', icon: '☕', label: 'Unmod Coc', sub: 'Unmoderated Caucus' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.type}
                  className={styles.activityTypeCard}
                  onClick={() => addActivity(opt.type)}
                >
                  <span className={styles.activityTypeIcon}>{opt.icon}</span>
                  <span className={styles.activityTypeLabel}>{opt.label}</span>
                  <span className={styles.activityTypeSub}>{opt.sub}</span>
                </button>
              ))}
            </div>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setAddActivityOpen(false)}
              style={{ marginTop: 16 }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Global Point FAB ─────────────────────────────────────────────── */}
      {isMeetingActive && (
        <button
          className={styles.globalPointFAB}
          onClick={() => setGlobalPointOpen(true)}
          title="Raise a point at this timestamp"
        >
          <span className={styles.fabIcon}>⚡</span>
        </button>
      )}

      {/* ── Global Point Modal ────────────────────────────────────────────── */}
      {globalPointOpen && (
        <div className={styles.modalOverlay} onClick={() => setGlobalPointOpen(false)}>
          <div
            className={styles.globalPointModal}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={styles.modalTitle}>
              ⚡ Add Point{' '}
              <span className={styles.globalPointTimestamp}>
                at [+{formatTime(recordingSeconds)}]
              </span>
            </h3>
            {currentActivity && (
              <p className={styles.modalSubtitle}>
                Active:{' '}
                {currentActivity.type === 'attendance'
                  ? 'Attendance Roll'
                  : currentActivity.type === 'gsl'
                  ? 'GSL'
                  : currentActivity.type === 'mod_coc'
                  ? 'Mod Coc'
                  : 'Unmod Coc'}
              </p>
            )}
            <PointForm
              draft={globalPointDraft}
              onChange={setGlobalPointDraft}
              countries={countries}
            />
            <div className={styles.modalActions}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setGlobalPointOpen(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={
                  !globalPointDraft.type ||
                  !globalPointDraft.raisedBy ||
                  !globalPointDraft.content
                }
                onClick={addGlobalPoint}
              >
                Save Point
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
