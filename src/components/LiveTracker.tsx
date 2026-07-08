'use client';

import { useState, useEffect, useRef } from 'react';
import { useWorkspace } from './WorkspaceContext';
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
  raisedBy: string;
  durationSeconds: number;
  outcome: 'passed' | 'failed' | null;
}

export interface VoteActivity extends BaseActivity {
  type: 'vote';
  drTitle: string;
  authors: string[];      // country IDs
  signatories: string[];  // country IDs
  votes: { countryId: string; vote: 'for' | 'against' | 'abstain' }[];
  outcome: 'passed' | 'failed' | null;
}

export interface CrisisActivity extends BaseActivity {
  type: 'crisis';
  content: string;
}

export interface PresidentialAddressActivity extends BaseActivity {
  type: 'presidential_address';
  content: string;
}

export type ActivityRecord =
  | AttendanceActivity
  | GSLActivity
  | ModCocActivity
  | UnmodCocActivity
  | VoteActivity
  | CrisisActivity
  | PresidentialAddressActivity;

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
  { label: '1 minute (default, recommended)', value: 60 },
  { label: '10 minutes (high memory risk)', value: 600 },
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

// ─── Inline Premium SVG Icons ────────────────────────────────────────────────
const IconAttendance = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
);
const IconGsl = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
);
const IconModCoc = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
);
const IconUnmod = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
);
const IconBolt = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
);
const IconClose = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>
);
const IconAudio = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
);
const IconVote = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>
);
const IconCrisis = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
);
const IconPresident = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
);


// ─── Country Avatar (matches SaaS dashboard avatar rows) ─────────────────────
const AVATAR_GRADIENTS = [
  ['#a1c4fd', '#c2e9fb'],
  ['#84fab0', '#8fd3f4'],
  ['#fccb90', '#d57edc'],
  ['#f6d365', '#fda085'],
  ['#a18cd1', '#fbc2eb'],
  ['#d4fc79', '#96e6a1'],
  ['#ffecd2', '#fcb69f'],
  ['#89f7fe', '#66a6ff'],
];

function CountryAvatar({ name, size = 28 }: { name: string; size?: number }) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const [c1, c2] = AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
  const initial = name.slice(0, 2).toUpperCase();
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: '50%',
        background: `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`,
        color: '#1a1d23',
        fontSize: size * 0.38,
        fontWeight: 700,
        fontFamily: 'var(--font-mono)',
        flexShrink: 0,
        boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.55), 0 1px 3px rgba(0,0,0,0.07)',
        letterSpacing: '-0.02em',
      }}
    >
      {initial}
    </span>
  );
}

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
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = countries.find((c) => c.id === value);
  const filtered = search
    ? countries.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : countries;

  // Reset activeIndex when filter changes
  useEffect(() => {
    setActiveIndex(0);
  }, [search]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const visibleOptions = filtered.slice(0, 10);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(visibleOptions.length - 1, prev + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(0, prev - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (visibleOptions[activeIndex]) {
        onChange(visibleOptions[activeIndex].id);
        setSearch('');
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setSearch('');
    }
  };

  return (
    <div className={styles.delegateSelectWrapper}>
      <label className="label">{label}</label>
      {selected ? (
        <div className={styles.delegateSelected}>
          <span className={styles.delegateSelectedName}>{selected.name}</span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              onChange('');
              setSearch('');
            }}
          >
            <IconClose />
          </button>
        </div>
      ) : (
        <div className={styles.delegateSearchBox}>
          <input
            className="input"
            placeholder="Search delegates (use ↑↓ and Enter)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {search && (
            <div className={styles.delegateDropdown}>
              {filtered.slice(0, 10).map((c, idx) => (
                <button
                  key={c.id}
                  type="button"
                  className={`${styles.delegateOption} ${
                    idx === activeIndex ? styles.delegateOptionActive : ''
                  }`}
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

function DelegateMultiSelect({
  label,
  countries,
  selectedIds,
  onChange,
}: {
  label: string;
  countries: Country[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const filtered = search
    ? countries.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) &&
          !selectedIds.includes(c.id)
      )
    : countries.filter((c) => !selectedIds.includes(c.id));

  // Reset activeIndex when filter changes
  useEffect(() => {
    setActiveIndex(0);
  }, [search]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const visibleOptions = filtered.slice(0, 8);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(visibleOptions.length - 1, prev + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(0, prev - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (visibleOptions[activeIndex]) {
        onChange([...selectedIds, visibleOptions[activeIndex].id]);
        setSearch('');
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div className={styles.delegateSelect} style={{ position: 'relative' }}>
      <label className="label">{label}</label>
      
      {/* Selected tags */}
      {selectedIds.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {selectedIds.map(id => {
            const country = countries.find(c => c.id === id);
            if (!country) return null;
            return (
              <div
                key={id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '3px 8px',
                  background: 'var(--saas-bg-elevated)',
                  border: '1px solid var(--saas-border-default)',
                  borderRadius: 'var(--saas-radius-md)',
                  fontSize: 12,
                }}
              >
                <CountryAvatar name={country.name} size={16} />
                <span>{country.name}</span>
                <button
                  type="button"
                  onClick={() => onChange(selectedIds.filter(x => x !== id))}
                  style={{
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    color: 'var(--saas-text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 0 0 4px',
                  }}
                >
                  <IconClose />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className={styles.delegateSearchBox}>
        <input
          className="input"
          placeholder="Search and select delegates…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            // Delay to allow option clicks to register
            setTimeout(() => setIsOpen(false), 200);
          }}
        />
        {isOpen && filtered.length > 0 && (
          <div className={styles.delegateDropdown} style={{ position: 'absolute', width: '100%', zIndex: 10 }}>
            {filtered.slice(0, 8).map((c, idx) => (
              <button
                key={c.id}
                type="button"
                className={`${styles.delegateOption} ${
                  idx === activeIndex ? styles.delegateOptionActive : ''
                }`}
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevents input blur before selection
                  onChange([...selectedIds, c.id]);
                  setSearch('');
                }}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>
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
  isExpanded,
  onToggleExpand,
  onDelete,
}: {
  activity: ActivityRecord;
  countries: Country[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onDelete: () => void;
}) {
  const getName = (id: string) => countries.find((c) => c.id === id)?.name ?? id;

  const headerClickProps = {
    onClick: onToggleExpand,
    style: { cursor: 'pointer', userSelect: 'none' as const },
    title: isExpanded ? 'Click to collapse details' : 'Click to expand details'
  };

  const actionArea = (
    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
      <span className={styles.expandChevron} style={{ color: 'var(--saas-text-muted)', fontSize: 11 }}>
        {isExpanded ? 'Collapse ▲' : 'Expand Details ▼'}
      </span>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        style={{
          padding: '2px 6px',
          color: 'var(--saas-accent-danger)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 11,
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
        }}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
        Delete
      </button>
    </div>
  );

  if (activity.type === 'attendance') {
    const att = activity as AttendanceActivity;
    const present = att.rolls.filter((r) => r.status === 'present').length;
    const pv = att.rolls.filter((r) => r.status === 'present_and_voting').length;
    const absent = att.rolls.filter((r) => r.status === 'absent').length;
    return (
      <div className={`${styles.activityCard} ${styles.activityCardAttendance} ${styles.activityCardCompleted}`} id={`activity-card-${activity.id}`}>
        <div className={styles.activityCardHeader} {...headerClickProps}>
          <span className={`${styles.activityBadge} ${styles.badgeAttendance}`}>
            <IconAttendance /> Attendance Roll #{att.attendanceIndex}
          </span>
          <span className={styles.activityTimestamp}>[+{formatTime(activity.startedAtOffset)}]</span>
          {actionArea}
        </div>
        <div style={{ display: 'flex', gap: 24, marginTop: 4 }}>
          <span style={{ fontSize: 13, color: 'var(--saas-text-secondary)' }}>
            <strong style={{ color: 'var(--saas-text-primary)', fontSize: 15 }}>{present + pv}</strong> Present
          </span>
          <span style={{ fontSize: 13, color: 'var(--saas-text-secondary)' }}>
            <strong style={{ color: 'var(--saas-accent-warn)', fontSize: 15 }}>{pv}</strong> P+V
          </span>
          <span style={{ fontSize: 13, color: 'var(--saas-text-secondary)' }}>
            <strong style={{ color: 'var(--saas-accent-danger)', fontSize: 15 }}>{absent}</strong> Absent
          </span>
        </div>

        {isExpanded && (
          <div className={styles.expandedContent}>
            <div className={styles.expandedDivider} />
            <h5 className={styles.expandedSubTitle}>Roster Attendance Status</h5>
            <div className={styles.expandedAttendanceGrid}>
              {countries.map((c) => {
                const roll = att.rolls.find((r) => r.countryId === c.id);
                const status = roll?.status ?? 'absent';
                let badgeClass = 'badge-red';
                let statusLabel = 'Absent';
                if (status === 'present') {
                  badgeClass = 'badge-green';
                  statusLabel = 'Present';
                } else if (status === 'present_and_voting') {
                  badgeClass = 'badge-blue';
                  statusLabel = 'Present & Voting';
                }
                return (
                  <div key={c.id} className={styles.expandedAttendanceRow}>
                    <CountryAvatar name={c.name} size={18} />
                    <span className={styles.expandedCountryName}>{c.name}</span>
                    <span className={`badge ${badgeClass}`} style={{ fontSize: 9, padding: '2px 8px' }}>
                      {statusLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (activity.type === 'gsl') {
    const gsl = activity as GSLActivity;
    const gslSpeakerNames = gsl.speakers.slice(0, 4).map((s) => getName(s.countryId));
    return (
      <div className={`${styles.activityCard} ${styles.activityCardGSL} ${styles.activityCardCompleted}`} id={`activity-card-${activity.id}`}>
        <div className={styles.activityCardHeader} {...headerClickProps}>
          <span className={`${styles.activityBadge} ${styles.badgeGSL}`}>
            <IconGsl /> GSL
          </span>
          <span className={`${styles.outcomeBadge} ${gsl.outcome === 'passed' ? styles.outcomePassed : styles.outcomeFailed}`}>
            {gsl.outcome === 'passed' ? 'Passed' : 'Failed'}
          </span>
          <span className={styles.activityTimestamp}>[+{formatTime(activity.startedAtOffset)}]</span>
          {actionArea}
        </div>
        {gsl.outcome === 'passed' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <CountryAvatar name={getName(gsl.raisedBy)} />
              <span style={{ fontSize: 13, color: 'var(--saas-text-secondary)' }}>
                Raised by <strong style={{ color: 'var(--saas-text-primary)' }}>{getName(gsl.raisedBy)}</strong>
              </span>
            </div>
            <span style={{ color: 'var(--saas-border-strong)', fontSize: 12 }}>·</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {gslSpeakerNames.map((n, i) => (
                <span key={i} style={{ marginLeft: i === 0 ? 0 : -6 }}>
                  <CountryAvatar name={n} size={22} />
                </span>
              ))}
              {gsl.speakers.length > 4 && (
                <span style={{ fontSize: 11, color: 'var(--saas-text-muted)', marginLeft: 6, fontWeight: 600 }}>
                  +{gsl.speakers.length - 4}
                </span>
              )}
              <span style={{ fontSize: 13, color: 'var(--saas-text-secondary)', marginLeft: 8 }}>
                {gsl.speakers.length} speaker{gsl.speakers.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        )}

        {isExpanded && gsl.outcome === 'passed' && (
          <div className={styles.expandedContent}>
            <div className={styles.expandedDivider} />
            <h5 className={styles.expandedSubTitle}>Speech History</h5>
            {gsl.speakers.length > 0 ? (
              <div className={styles.expandedSpeakersList}>
                {gsl.speakers.map((sp, idx) => (
                  <div key={sp.id} className={styles.expandedSpeakerRow}>
                    <div className={styles.expandedSpeakerHeader}>
                      <div className={styles.speakerIndexInfo}>
                        <span className={styles.speakerIndex}>{idx + 1}.</span>
                        <CountryAvatar name={getName(sp.countryId)} size={20} />
                        <strong className={styles.speakerName}>{getName(sp.countryId)}</strong>
                      </div>
                      <span className={styles.speakerTimeOffset}>[+{formatTime(sp.speechStartOffset)}]</span>
                    </div>
                    {sp.speechText ? (
                      <p className={styles.speechProse}>"{sp.speechText}"</p>
                    ) : (
                      <p className={styles.speechEmpty}>No speech dictation saved.</p>
                    )}
                    {sp.points && sp.points.length > 0 && (
                      <div className={styles.speechPoints}>
                        <div className={styles.speechPointsTitle}>Points raised during speech:</div>
                        {sp.points.map((pt) => (
                          <div key={pt.id} className={styles.speechPointRow}>
                            <span className={`${styles.pointLabelBadge} ${pt.type === 'ppp' ? styles.badgePrivilege : pt.type === 'ppi' ? styles.badgeInquiry : styles.badgeOrder}`}>
                              {POINT_LABELS[pt.type] || pt.type}
                            </span>
                            <span className={styles.pointRaisedBy}>raised by {getName(pt.raisedBy)}</span>
                            <p className={styles.pointContentText}>"{pt.content}"</p>
                            {pt.answer && <p className={styles.pointAnswerText}>Answer: {pt.answer}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.speechEmpty}>No speakers recorded.</p>
            )}
          </div>
        )}
      </div>
    );
  }

  if (activity.type === 'mod_coc') {
    const mc = activity as ModCocActivity;
    const mcSpeakerNames = mc.speakers.slice(0, 4).map((s) => getName(s.countryId));
    return (
      <div className={`${styles.activityCard} ${styles.activityCardModCoc} ${styles.activityCardCompleted}`} id={`activity-card-${activity.id}`}>
        <div className={styles.activityCardHeader} {...headerClickProps}>
          <span className={`${styles.activityBadge} ${styles.badgeModCoc}`}>
            <IconModCoc /> Mod Coc
          </span>
          <span className={`${styles.outcomeBadge} ${mc.outcome === 'passed' ? styles.outcomePassed : styles.outcomeFailed}`}>
            {mc.outcome === 'passed' ? 'Passed' : 'Failed'}
          </span>
          <span className={styles.activityTimestamp}>[+{formatTime(activity.startedAtOffset)}]</span>
          {actionArea}
        </div>
        {mc.topic && (
          <p style={{ fontSize: 13.5, color: 'var(--saas-text-primary)', fontWeight: 600, margin: '6px 0 6px 0' }}>
            {mc.topic}
          </p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: 'var(--saas-text-secondary)' }}>
            Raised by <strong style={{ color: 'var(--saas-text-primary)' }}>{getName(mc.raisedBy)}</strong>
          </span>
          {mc.outcome === 'passed' && mc.speakers.length > 0 && (
            <>
              <span style={{ color: 'var(--saas-border-strong)', fontSize: 12 }}>·</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {mcSpeakerNames.map((n, i) => (
                  <span key={i} style={{ marginLeft: i === 0 ? 0 : -6 }}>
                    <CountryAvatar name={n} size={22} />
                  </span>
                ))}
                {mc.speakers.length > 4 && (
                  <span style={{ fontSize: 11, color: 'var(--saas-text-muted)', marginLeft: 4, fontWeight: 600 }}>
                    +{mc.speakers.length - 4}
                  </span>
                )}
                <span style={{ fontSize: 13, color: 'var(--saas-text-secondary)', marginLeft: 8 }}>
                  {mc.speakers.length} speaker{mc.speakers.length !== 1 ? 's' : ''}
                </span>
              </div>
            </>
          )}
        </div>

        {isExpanded && mc.outcome === 'passed' && (
          <div className={styles.expandedContent}>
            <div className={styles.expandedDivider} />
            <h5 className={styles.expandedSubTitle}>Speech History</h5>
            {mc.speakers.length > 0 ? (
              <div className={styles.expandedSpeakersList}>
                {mc.speakers.map((sp, idx) => (
                  <div key={sp.id} className={styles.expandedSpeakerRow}>
                    <div className={styles.expandedSpeakerHeader}>
                      <div className={styles.speakerIndexInfo}>
                        <span className={styles.speakerIndex}>{idx + 1}.</span>
                        <CountryAvatar name={getName(sp.countryId)} size={20} />
                        <strong className={styles.speakerName}>{getName(sp.countryId)}</strong>
                      </div>
                      <span className={styles.speakerTimeOffset}>[+{formatTime(sp.speechStartOffset)}]</span>
                    </div>
                    {sp.speechText ? (
                      <p className={styles.speechProse}>"{sp.speechText}"</p>
                    ) : (
                      <p className={styles.speechEmpty}>No speech dictation saved.</p>
                    )}
                    {sp.points && sp.points.length > 0 && (
                      <div className={styles.speechPoints}>
                        <div className={styles.speechPointsTitle}>Points raised during speech:</div>
                        {sp.points.map((pt) => (
                          <div key={pt.id} className={styles.speechPointRow}>
                            <span className={`${styles.pointLabelBadge} ${pt.type === 'ppp' ? styles.badgePrivilege : pt.type === 'ppi' ? styles.badgeInquiry : styles.badgeOrder}`}>
                              {POINT_LABELS[pt.type] || pt.type}
                            </span>
                            <span className={styles.pointRaisedBy}>raised by {getName(pt.raisedBy)}</span>
                            <p className={styles.pointContentText}>"{pt.content}"</p>
                            {pt.answer && <p className={styles.pointAnswerText}>Answer: {pt.answer}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.speechEmpty}>No speakers recorded.</p>
            )}
          </div>
        )}
      </div>
    );
  }

  if (activity.type === 'unmod_coc') {
    const uc = activity as UnmodCocActivity;
    const mins = uc.durationSeconds / 60;
    const label = mins >= 60 ? '1 hour' : `${mins} minutes`;
    return (
      <div className={`${styles.activityCard} ${styles.activityCardUnmod} ${styles.activityCardCompleted}`} id={`activity-card-${activity.id}`}>
        <div className={styles.activityCardHeader} {...headerClickProps}>
          <span className={`${styles.activityBadge} ${styles.badgeUnmod}`}>
            <IconUnmod /> Unmod Coc
          </span>
          {uc.outcome && (
            <span className={`${styles.outcomeBadge} ${uc.outcome === 'passed' ? styles.outcomePassed : styles.outcomeFailed}`}>
              {uc.outcome === 'passed' ? 'Passed' : 'Failed'}
            </span>
          )}
          <span className={styles.activityTimestamp}>[+{formatTime(activity.startedAtOffset)}]</span>
          {actionArea}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
          {uc.raisedBy && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <CountryAvatar name={getName(uc.raisedBy)} />
              <strong style={{ fontSize: 13, color: 'var(--saas-text-primary)' }}>{getName(uc.raisedBy)}</strong>
            </div>
          )}
          <span style={{ fontSize: 13, color: 'var(--saas-text-muted)', background: 'var(--saas-bg-elevated)', padding: '2px 10px', borderRadius: 20, border: '1px solid var(--saas-border-default)' }}>{label}</span>
        </div>
      </div>
    );
  }

  if (activity.type === 'vote') {
    const v = activity as VoteActivity;
    const forCount = v.votes?.filter((vt) => vt.vote === 'for').length ?? 0;
    const againstCount = v.votes?.filter((vt) => vt.vote === 'against').length ?? 0;
    const abstainCount = v.votes?.filter((vt) => vt.vote === 'abstain').length ?? 0;

    return (
      <div className={`${styles.activityCard} ${styles.activityCardVote} ${styles.activityCardCompleted}`} id={`activity-card-${activity.id}`}>
        <div className={styles.activityCardHeader} {...headerClickProps}>
          <span className={`${styles.activityBadge} ${styles.badgeVote}`}>
            <IconVote /> Formal Vote
          </span>
          {v.outcome && (
            <span className={`${styles.outcomeBadge} ${v.outcome === 'passed' ? styles.outcomePassed : styles.outcomeFailed}`}>
              {v.outcome === 'passed' ? 'Passed' : 'Failed'}
            </span>
          )}
          <span className={styles.activityTimestamp}>[+{formatTime(activity.startedAtOffset)}]</span>
          {actionArea}
        </div>
        <p style={{ fontSize: 13.5, color: 'var(--saas-text-primary)', fontWeight: 600, margin: '6px 0' }}>
          {v.drTitle || 'Substantive Vote'}
        </p>

        {/* Display Tally Overview badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--confidence-good)' }}>{forCount} For</span>
          <span style={{ color: 'var(--saas-border-strong)' }}>·</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--saas-accent-danger)' }}>{againstCount} Against</span>
          <span style={{ color: 'var(--saas-border-strong)' }}>·</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--saas-text-muted)' }}>{abstainCount} Abstain</span>
        </div>

        {isExpanded && (
          <div className={styles.expandedContent}>
            <div className={styles.expandedDivider} />
            
            {/* Authors */}
            {v.authors && v.authors.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <h6 style={{ fontSize: 11, fontWeight: 700, color: 'var(--saas-text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Authors / Sponsors</h6>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {v.authors.map(id => (
                    <div key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--saas-bg-elevated)', padding: '2px 8px', borderRadius: 4, border: '1px solid var(--saas-border-default)', fontSize: 12 }}>
                      <CountryAvatar name={getName(id)} size={16} />
                      <span>{getName(id)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Signatories */}
            {v.signatories && v.signatories.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <h6 style={{ fontSize: 11, fontWeight: 700, color: 'var(--saas-text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Signatories</h6>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {v.signatories.map(id => (
                    <div key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--saas-bg-elevated)', padding: '2px 8px', borderRadius: 4, border: '1px solid var(--saas-border-default)', fontSize: 12 }}>
                      <CountryAvatar name={getName(id)} size={16} />
                      <span>{getName(id)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Detailed votes list */}
            <div>
              <h6 style={{ fontSize: 11, fontWeight: 700, color: 'var(--saas-text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Individual Votes</h6>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6 }}>
                {(v.votes ?? []).map(vt => (
                  <div key={vt.countryId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', background: 'var(--saas-bg-elevated)', border: '1px solid var(--saas-border-default)', borderRadius: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                      <CountryAvatar name={getName(vt.countryId)} size={16} />
                      <span style={{ fontSize: 11.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getName(vt.countryId)}</span>
                    </div>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      color: vt.vote === 'for' ? 'var(--confidence-good)' : vt.vote === 'against' ? 'var(--saas-accent-danger)' : 'var(--saas-text-muted)'
                    }}>
                      {vt.vote}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (activity.type === 'crisis') {
    const c = activity as CrisisActivity;
    return (
      <div
        className={`${styles.activityCard} ${styles.activityCardCrisis} ${styles.activityCardCompleted}`}
        id={`activity-card-${activity.id}`}
        style={{ borderLeft: '4px solid var(--saas-accent-warn)' }}
      >
        <div className={styles.activityCardHeader}>
          <span className={`${styles.activityBadge} ${styles.badgeCrisis}`}>
            <IconCrisis /> Crisis Log
          </span>
          <span className={styles.activityTimestamp}>[+{formatTime(activity.startedAtOffset)}]</span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{
              marginLeft: 'auto',
              padding: '2px 6px',
              color: 'var(--saas-accent-danger)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
            }}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
            Delete
          </button>
        </div>
        <p style={{ fontSize: 13, color: 'var(--saas-text-primary)', fontStyle: 'italic', margin: '6px 0', whiteSpace: 'pre-wrap' }}>
          {c.content}
        </p>
      </div>
    );
  }

  if (activity.type === 'presidential_address') {
    const pa = activity as PresidentialAddressActivity;
    return (
      <div
        className={`${styles.activityCard} ${styles.activityCardPresident} ${styles.activityCardCompleted}`}
        id={`activity-card-${activity.id}`}
        style={{ borderLeft: '4px solid var(--saas-accent-primary)' }}
      >
        <div className={styles.activityCardHeader}>
          <span className={`${styles.activityBadge} ${styles.badgePresident}`}>
            <IconPresident /> Presidential Address
          </span>
          <span className={styles.activityTimestamp}>[+{formatTime(activity.startedAtOffset)}]</span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{
              marginLeft: 'auto',
              padding: '2px 6px',
              color: 'var(--saas-accent-danger)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
            }}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
            Delete
          </button>
        </div>
        <p style={{ fontSize: 13, color: 'var(--saas-text-primary)', margin: '6px 0', whiteSpace: 'pre-wrap' }}>
          {pa.content}
        </p>
      </div>
    );
  }

  return null;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function LiveTracker({ workspaceId, countries }: Props) {
  const {
    setActivities,
    setCountries,
    expandedActivityId,
    setExpandedActivityId,
    triggerScrollToActivityId,
    setTriggerScrollToActivityId,
  } = useWorkspace();

  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});

  // ── Audio recording state (preserved) ─────────────────────────────────────
  const [isMeetingActive, setIsMeetingActive] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [chunkSize, setChunkSize] = useState(60);
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
  
  // Reliability Refs: Screen Wake Lock, silent background audio, mic watchdog tracking, and cumulative recording offsets
  const wakeLockRef = useRef<any>(null);
  const silentAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioTrackRef = useRef<MediaStreamTrack | null>(null);
  const handleTrackDeathRef = useRef<(() => void) | null>(null);
  const cumulativeOffsetRef = useRef<number>(0);
  const webmHeaderRef = useRef<Uint8Array | null>(null);

  // ── Session data state ────────────────────────────────────────────────────
  const [sessionData, setSessionData] = useState<SessionData>({
    sessionStart: null,
    activities: [],
    globalPoints: [],
  });

  // ── UI workflow state ─────────────────────────────────────────────────────
  const [addActivityOpen, setAddActivityOpen] = useState(false);
  const [loadingSession, setLoadingSession] = useState(true);

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

  // Mic watchdog and recovery status states
  const [micWarningOpen, setMicWarningOpen] = useState(false);
  const [recoveringMic, setRecoveringMic] = useState(false);
  const [editAttendanceOpen, setEditAttendanceOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [activityToDelete, setActivityToDelete] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportingAudio, setExportingAudio] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Mid-session delegate additions
  const [addDelegateOpen, setAddDelegateOpen] = useState(false);
  const [newDelegateName, setNewDelegateName] = useState('');
  const [addDelegateError, setAddDelegateError] = useState<string | null>(null);
  const [addingDelegate, setAddingDelegate] = useState(false);

  // Sync session activities list with sidebar context
  useEffect(() => {
    setActivities(sessionData.activities);
  }, [sessionData.activities, setActivities]);

  // Sync countries array with sidebar context
  useEffect(() => {
    setCountries(countries);
  }, [countries, setCountries]);

  // Expand card if triggered from sidebar activities list
  useEffect(() => {
    if (expandedActivityId) {
      setExpandedCards((prev) => ({ ...prev, [expandedActivityId]: true }));
    }
  }, [expandedActivityId]);

  // Scroll to card if triggered from sidebar activities list
  useEffect(() => {
    if (triggerScrollToActivityId) {
      const el = document.getElementById(`activity-card-${triggerScrollToActivityId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTriggerScrollToActivityId(null);
      }
    }
  }, [triggerScrollToActivityId, setTriggerScrollToActivityId]);

  // Handle click outside of the export menu dropdown to close it
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setExportMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleCardExpand = (actId: string) => {
    const nextVal = !expandedCards[actId];
    setExpandedCards((prev) => ({ ...prev, [actId]: nextVal }));
    if (nextVal) {
      setExpandedActivityId(actId);
    } else if (expandedActivityId === actId) {
      setExpandedActivityId(null);
    }
  };

  // ── Load session on mount ──────────────────────────────────────────────────
  useEffect(() => {
    loadSession();
    audioRef.current = new Audio();
    audioRef.current.addEventListener('ended', handleAudioEnded);

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAddActivityOpen(false);
        setGlobalPointOpen(false);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);

    return () => {
      cleanupRecording();
      stopSpeakerTimer();
      releaseWakeLock();
      stopSilentAudio();
      window.removeEventListener('keydown', handleGlobalKeyDown);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeEventListener('ended', handleAudioEnded);
      }
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcuts for Global Points Modal
  useEffect(() => {
    const handleShortcut = (e: KeyboardEvent) => {
      if (!isMeetingActive) return;

      const isEditing =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable);

      const isHotkey =
        (!isEditing && (e.key.toLowerCase() === 'g' || e.key.toLowerCase() === 'p')) ||
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g');

      if (isHotkey) {
        e.preventDefault();
        setGlobalPointOpen(true);
      }
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [isMeetingActive]);

  async function loadSession() {
    try {
      const res = await fetch(`/api/workspace-data/${workspaceId}/session`);
      const data = await res.json();
      if (data.manifest) {
        setManifest(data.manifest);
        const totalDuration = (data.manifest.segments ?? []).reduce(
          (acc: number, s: any) => acc + s.duration,
          0
        );
        setRecordingSeconds(totalDuration);
      }
      if (data.activities) setSessionData(data.activities);
    } catch (err) {
      console.error('Failed to load session', err);
    } finally {
      setLoadingSession(false);
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

  async function handleAddDelegate(e: React.FormEvent) {
    e.preventDefault();
    if (!newDelegateName.trim()) return;

    setAddingDelegate(true);
    setAddDelegateError(null);

    try {
      const res = await fetch(`/api/workspace-data/${workspaceId}/add-delegate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ countryName: newDelegateName }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to add delegate');
      }

      const newCountry = data.country;
      // Update global context countries
      setCountries([...countries, newCountry]);

      // Update current activity if there is one active
      let updatedActivities = [...sessionData.activities];
      if (currentActivity) {
        if (currentActivity.type === 'attendance') {
          const att = currentActivity as AttendanceActivity;
          if (!att.rolls.some(r => r.countryId === newCountry.id)) {
            const updatedRolls = [...att.rolls, { countryId: newCountry.id, status: 'absent' as const }];
            updatedActivities = sessionData.activities.map(a =>
              a.id === currentActivity.id ? { ...a, rolls: updatedRolls } : a
            ) as ActivityRecord[];
          }
        } else if (currentActivity.type === 'vote') {
          const v = currentActivity as VoteActivity;
          if (v.status === 'active' && v.votes && !v.votes.some(vt => vt.countryId === newCountry.id)) {
            const updatedVotes = [...v.votes, { countryId: newCountry.id, vote: 'abstain' as const }];
            updatedActivities = sessionData.activities.map(a =>
              a.id === currentActivity.id ? { ...a, votes: updatedVotes } : a
            ) as ActivityRecord[];
          }
        }
      }

      const updatedSessionData = {
        ...sessionData,
        activities: updatedActivities,
      };

      await saveSessionData(updatedSessionData);

      setNewDelegateName('');
      setAddDelegateOpen(false);
    } catch (err) {
      setAddDelegateError((err as Error).message);
    } finally {
      setAddingDelegate(false);
    }
  }

  function updateLastAttendanceRoll(
    countryId: string,
    status: 'present' | 'present_and_voting' | 'absent'
  ) {
    const lastAttendanceIndex = [...sessionData.activities]
      .reverse()
      .findIndex((a) => a.type === 'attendance');
    if (lastAttendanceIndex === -1) return;

    // Convert reverse index to actual array index
    const actualIndex = sessionData.activities.length - 1 - lastAttendanceIndex;
    const att = sessionData.activities[actualIndex] as AttendanceActivity;

    const exists = att.rolls.some((r) => r.countryId === countryId);
    const newRolls = exists
      ? att.rolls.map((r) => (r.countryId === countryId ? { ...r, status } : r))
      : [...att.rolls, { countryId, status }];

    const updatedActivities = sessionData.activities.map((a, i) =>
      i === actualIndex ? { ...a, rolls: newRolls } : a
    ) as ActivityRecord[];

    const updatedData = {
      ...sessionData,
      activities: updatedActivities,
    };
    saveSessionData(updatedData);
  }

  function requestDeleteActivity(activityId: string) {
    setActivityToDelete(activityId);
    setDeleteConfirmOpen(true);
  }

  async function confirmDeleteActivity() {
    if (!activityToDelete) return;
    try {
      const updatedActivities = sessionData.activities.filter(
        (a) => a.id !== activityToDelete
      );
      const updatedSessionData = {
        ...sessionData,
        activities: updatedActivities,
      };
      await saveSessionData(updatedSessionData);
      setDeleteConfirmOpen(false);
      setActivityToDelete(null);
    } catch (err) {
      console.error('Failed to delete activity:', err);
    }
  }

  // ── Reliability Measures for Background Throttling & Wake Locks ──────────────
  
  async function requestWakeLock() {
    if (typeof window !== 'undefined' && 'wakeLock' in navigator) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        console.log('Screen Wake Lock acquired successfully');
      } catch (err) {
        console.warn('Failed to acquire Screen Wake Lock:', err);
      }
    }
  }

  function releaseWakeLock() {
    if (wakeLockRef.current) {
      try {
        wakeLockRef.current.release().then(() => {
          wakeLockRef.current = null;
          console.log('Screen Wake Lock released');
        }).catch((err: any) => {
          console.warn('Failed to release Screen Wake Lock:', err);
        });
      } catch (err) {
        console.warn('Failed to release Screen Wake Lock (sync):', err);
      }
    }
  }

  function playSilentAudio() {
    try {
      // 1-second base64 silent WAV file to prevent browser tab from going to sleep
      const audio = new Audio(
        'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA=='
      );
      audio.loop = true;
      audio.volume = 0.001; // virtually inaudible
      silentAudioRef.current = audio;
      audio.play().catch((err) => {
        console.warn('Autoplay policy prevented silent audio loop play:', err);
      });
    } catch (err) {
      console.warn('Failed to create or play silent audio loop:', err);
    }
  }

  function stopSilentAudio() {
    if (silentAudioRef.current) {
      try {
        silentAudioRef.current.pause();
        silentAudioRef.current = null;
      } catch (err) {
        console.warn('Failed to pause silent audio loop:', err);
      }
    }
  }

  function cleanupWatchdog() {
    if (audioTrackRef.current && handleTrackDeathRef.current) {
      audioTrackRef.current.removeEventListener('ended', handleTrackDeathRef.current);
      audioTrackRef.current.removeEventListener('mute', handleTrackDeathRef.current);
    }
    audioTrackRef.current = null;
    handleTrackDeathRef.current = null;
  }

  async function initiateRecording(stream: MediaStream, startOffset: number) {
    // 1. Clean up old watchdog to prevent duplicate event listeners
    cleanupWatchdog();

    // 2. Attach watchdog to the new audio track to detect disconnection or muting
    const track = stream.getAudioTracks()[0];
    if (track) {
      audioTrackRef.current = track;
      const deathHandler = () => {
        console.warn('Microphone watchdog triggered (track muted or ended)');
        setMicWarningOpen(true);
        attemptMicRecovery();
      };
      handleTrackDeathRef.current = deathHandler;
      track.addEventListener('ended', deathHandler);
      track.addEventListener('mute', deathHandler);
    }

    // 3. Set recording tracker refs
    cumulativeOffsetRef.current = startOffset;
    chunkStartTimeRef.current = Date.now();

    // 4. Create and start a single MediaRecorder instance
    let mimeType = 'audio/webm';
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
      mimeType = 'audio/webm;codecs=opus';
    } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
      mimeType = 'audio/mp4';
    }

    const recorder = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = recorder;

    recorder.onerror = () => {
      setAudioError('MediaRecorder encountered an error. Check microphone permissions.');
    };

    recorder.ondataavailable = async (e) => {
      if (e.data && e.data.size > 0) {
        const chunkBlob = e.data;
        const now = Date.now();
        const duration = (now - chunkStartTimeRef.current) / 1000;
        chunkStartTimeRef.current = now;

        const currentStartOffset = cumulativeOffsetRef.current;
        cumulativeOffsetRef.current += duration;

        // Process chunk to ensure valid WebM headers (EBML magic)
        const arrayBuffer = await chunkBlob.arrayBuffer();
        const chunkBytes = new Uint8Array(arrayBuffer);

        let finalBlob = chunkBlob;
        
        // Check if chunk starts with EBML Header (0x1A45DFA3)
        const hasHeader = chunkBytes.length >= 4 &&
          chunkBytes[0] === 0x1a &&
          chunkBytes[1] === 0x45 &&
          chunkBytes[2] === 0xdf &&
          chunkBytes[3] === 0xa3;

        if (hasHeader) {
          // Extract and store the header for future chunks
          const firstClusterIdx = findSequenceIndex(chunkBytes, [0x1f, 0x43, 0xb6, 0x75]);
          if (firstClusterIdx !== -1) {
            webmHeaderRef.current = chunkBytes.slice(0, firstClusterIdx);
            console.log('Saved WebM header of size:', webmHeaderRef.current.length);
          }
        } else if (webmHeaderRef.current) {
          // Prepend the saved header to make this chunk a valid standalone WebM file
          const merged = new Uint8Array(webmHeaderRef.current.length + chunkBytes.length);
          merged.set(webmHeaderRef.current, 0);
          merged.set(chunkBytes, webmHeaderRef.current.length);
          finalBlob = new Blob([merged], { type: mimeType });
          console.log('Prepended WebM header to chunk');
        }

        // Use a unique segment ID
        const segmentId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

        // Upload this chunk as its own segment
        const file = new File([finalBlob], `segment_${segmentId}.bin`, { type: mimeType });
        const fd = new FormData();
        fd.append('segmentId', segmentId);
        fd.append('startOffset', currentStartOffset.toString());
        fd.append('duration', duration.toString());
        fd.append('audio', file);

        try {
          const res = await fetch(
            `/api/workspace-data/${workspaceId}/session/upload-segment`,
            { method: 'POST', body: fd }
          );
          const data = await res.json();
          if (data.success) {
            // Load session to keep workspace activities and manifest segments synchronized
            loadSession();
          }
        } catch (err) {
          console.error('Failed to upload audio segment chunk', err);
        }
      }
    };

    // Start with timeslice argument to trigger ondataavailable periodically
    recorder.start(chunkSize * 1000);
    console.log(`MediaRecorder started with timeslice: ${chunkSize} seconds`);
  }

  async function attemptMicRecovery() {
    setRecoveringMic(true);
    try {
      // Reacquire mic stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      // Stop old recorder if active
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch (e) {
          // ignore if already closed
        }
      }

      // Query current cumulative duration from manifest segments
      const totalDuration = (manifest.segments ?? []).reduce((acc, s) => acc + s.duration, 0);

      // Re-initialize continuous recording
      await initiateRecording(stream, totalDuration);

      setMicWarningOpen(false);
      setRecoveringMic(false);
      console.log('Microphone recovery successful');
    } catch (err) {
      console.error('Failed to auto-recover mic:', err);
      setRecoveringMic(false);
    }
  }

  // ── Audio recording (preserved from original) ──────────────────────────────

  async function startMeeting() {
    if (loadingSession) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      setIsMeetingActive(true);
      setAudioError(null);
      setMicWarningOpen(false);

      const totalDuration = (manifest.segments ?? []).reduce((acc, s) => acc + s.duration, 0);
      setRecordingSeconds(totalDuration);
      currentSegmentStartOffsetRef.current = totalDuration;

      // Init session start timestamp if not set
      if (!sessionData.sessionStart) {
        const updated: SessionData = {
          ...sessionData,
          sessionStart: new Date().toISOString(),
        };
        await saveSessionData(updated);
      }

      // Initialize the continuous MediaRecorder with timeslicing
      await initiateRecording(stream, totalDuration);

      // Acquire Screen Wake Lock and play silent background loop audio
      await requestWakeLock();
      playSilentAudio();

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      setAudioError((err as Error).message);
    }
  }

  async function stopMeeting() {
    cleanupRecording();
    setIsMeetingActive(false);
    stopSpeakerTimer();
    
    // Release Screen Wake Lock and pause background audio
    releaseWakeLock();
    stopSilentAudio();

    setTimeout(loadSession, 1000);
  }

  function cleanupRecording() {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (chunkTimerRef.current) clearTimeout(chunkTimerRef.current);
    
    // Clean up watchdog track event listeners
    cleanupWatchdog();

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        // ignore state conflicts if already stopped
      }
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

  function pauseSpeakerTimer() {
    if (speakerTimerRef.current) clearInterval(speakerTimerRef.current);
    setSpeakerTimerRunning(false);
  }

  function resumeSpeakerTimer() {
    setSpeakerTimerRunning(true);
    if (speakerTimerRef.current) clearInterval(speakerTimerRef.current);
    speakerTimerRef.current = setInterval(() => {
      setSpeakerElapsed((prev) => prev + 1);
    }, 1000);
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const currentActivity =
    sessionData.activities.find((a) => a.status !== 'completed') ?? null;
  // A session that has been started is enough to add activities.
  // The mic doesn't need to be actively recording — timestamps will use recordingSeconds
  // which is 0 when the mic is off, but activities can still be logged.
  const canAddActivity = !currentActivity && !!sessionData.sessionStart;
  const getName = (id: string) => countries.find((c) => c.id === id)?.name ?? id;

  const speakerDisplayTime =
    speakerTimerMode === 'stopwatch'
      ? formatTime(speakerElapsed)
      : formatTime(Math.max(0, speakerTimeLimit - speakerElapsed));
  const speakerExpired = speakerElapsed >= speakerTimeLimit;
  const speakerWarning = !speakerExpired && (speakerTimeLimit - speakerElapsed <= 15);

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
    } else if (type === 'unmod_coc') {
      newActivity = {
        ...base,
        type: 'unmod_coc',
        status: 'setup',
        raisedBy: '',
        durationSeconds: 600,
        outcome: null,
      };
    } else if (type === 'vote') {
      newActivity = {
        ...base,
        type: 'vote',
        status: 'setup',
        drTitle: '',
        authors: [],
        signatories: [],
        votes: [],
        outcome: null,
      };
    } else if (type === 'crisis') {
      newActivity = {
        ...base,
        type: 'crisis',
        status: 'active',
        content: '',
      };
    } else {
      newActivity = {
        ...base,
        type: 'presidential_address',
        status: 'active',
        content: '',
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
    const exists = att.rolls.some((r) => r.countryId === countryId);
    const newRolls = exists
      ? att.rolls.map((r) => (r.countryId === countryId ? { ...r, status } : r))
      : [...att.rolls, { countryId, status }];
    mutateCurrent({
      rolls: newRolls,
    } as Partial<AttendanceActivity>);
  }

  function passActivity() {
    mutateCurrent({ outcome: 'passed', status: 'active' } as any);
    resetSpeakerState();
    if (currentActivity?.type === 'unmod_coc') {
      const uc = currentActivity as UnmodCocActivity;
      startSpeakerTimer(uc.durationSeconds);
      setSpeakerTimerMode('countdown');
    }
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

  async function handleExportRecording() {
    setExportingAudio(true);
    try {
      const res = await fetch(`/api/workspace-data/${workspaceId}/session/export-recording`);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to export recording');
      }

      // Extract filename from Content-Disposition header if available
      const contentDisposition = res.headers.get('Content-Disposition');
      let filename = 'recording.webm';
      if (contentDisposition && contentDisposition.includes('filename=')) {
        const parts = contentDisposition.split('filename=');
        if (parts.length > 1) {
          filename = parts[1].replace(/["']/g, '');
        }
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Audio export failed', err);
      alert(err instanceof Error ? err.message : 'Audio export failed');
    } finally {
      setExportingAudio(false);
    }
  }

  // ── Speaker Phase Renderer ─────────────────────────────────────────────────

  function renderSpeakerPhase(
    activity: GSLActivity | ModCocActivity,
    cardClass: string,
    badgeClass: string,
    title: string,
    IconComponent: React.ComponentType
  ) {
    return (
      <div key={activity.id} className={`${styles.activityCard} ${cardClass}`}>
        <div className={styles.activityCardHeader}>
          <span className={`${styles.activityBadge} ${badgeClass}`}>
            <IconComponent /> {title}
          </span>
          <div className={styles.activityHeaderRight}>
            <span className={styles.activityTimestamp}>[+{formatTime(activity.startedAtOffset)}]</span>
            <button
              type="button"
              className={`btn btn-secondary btn-sm ${styles.closeActivityBtn}`}
              onClick={handleCloseActivity}
              title="Close this activity and return to the timeline"
            >
              Close Activity
            </button>
          </div>
        </div>

        <div className={styles.speakerPhaseGrid}>
          {/* Left: Active Console */}
          <div className={styles.speakerPhaseLeft}>
            {!currentSpeakerStarted ? (
              <div className={styles.speakerSelectRow}>
                <DelegateSelect
                  label={`Select Speaker ${activity.speakers.length + 1}`}
                  countries={countries}
                  value={currentSpeakerCountryId}
                  onChange={setCurrentSpeakerCountryId}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!currentSpeakerCountryId}
                  onClick={() => handleStartSpeech(activity)}
                  style={{ width: '100%', height: 40, fontSize: 13, fontWeight: 700, marginTop: 8 }}
                >
                  Start Speech & Timer
                </button>
              </div>
            ) : (
              <div className={styles.speakerActiveConsole}>
                {/* Active Speaker Dashboard */}
                <div className={`${styles.activeSpeakerCard} ${
                  speakerExpired ? styles.speakerExpired : speakerWarning ? styles.speakerWarning : ''
                }`}>
                  <div className={styles.activeSpeakerMeta}>
                    <CountryAvatar name={getName(currentSpeakerCountryId)} size={32} />
                    <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                      <div className={styles.activeSpeakerTitle}>CURRENT SPEAKER</div>
                      <div className={styles.activeSpeakerName}>{getName(currentSpeakerCountryId)}</div>
                    </div>
                  </div>
                  
                  {/* Timer display */}
                  <div className={styles.activeSpeakerTimerBlock}>
                    <div className={styles.timerDisplayLarge}>{speakerDisplayTime}</div>
                    <div className={styles.timerLimitText}>Limit: {formatTime(speakerTimeLimit)}</div>
                  </div>

                  {/* Live Timer controls */}
                  <div className={styles.timerControlsRow}>
                    {speakerTimerRunning ? (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={pauseSpeakerTimer}
                        style={{ background: 'rgba(239, 68, 68, 0.08)', color: 'var(--saas-accent-danger)', borderColor: 'rgba(239, 68, 68, 0.15)' }}
                      >
                        ⏸ Pause
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={resumeSpeakerTimer}
                      >
                        ▶ Resume
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setSpeakerElapsed(0)}
                    >
                      ⟳ Reset
                    </button>
                    
                    {/* Timer Mode selector */}
                    <div className={styles.speakerTimerToggle} style={{ marginLeft: 'auto' }}>
                      <button
                        type="button"
                        className={`${styles.timerModeBtn} ${
                          speakerTimerMode === 'stopwatch' ? styles.timerModeBtnActive : ''
                        }`}
                        onClick={() => setSpeakerTimerMode('stopwatch')}
                      >
                        Stopwatch
                      </button>
                      <button
                        type="button"
                        className={`${styles.timerModeBtn} ${
                          speakerTimerMode === 'countdown' ? styles.timerModeBtnActive : ''
                        }`}
                        onClick={() => setSpeakerTimerMode('countdown')}
                      >
                        Countdown
                      </button>
                    </div>
                  </div>
                </div>

                {/* Speech Dictation Notes Textarea */}
                <div className={styles.dictationWrapper}>
                  <label className={styles.dictationLabel}>Speech Notes & Dictation Transcription</label>
                  <textarea
                    className={`input ${styles.speechTextarea}`}
                    placeholder="Type or dictate points made during the speech here..."
                    value={currentSpeechText}
                    onChange={(e) => setCurrentSpeechText(e.target.value)}
                    rows={5}
                  />
                </div>

                {/* Speaker actions */}
                <div className={styles.speakerActionsBar}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleAddNextSpeaker}
                    style={{ width: '100%' }}
                  >
                    Add Next Speaker
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right: Points feed (POI) & Speaker timeline */}
          <div className={styles.speakerPhaseRight}>
            
            {/* Points / POI entry log */}
            <div className={styles.poiSection}>
              <h5 className={styles.poiTitle}>Points & POIs Raised</h5>
              
              {currentSpeakerPoints.length > 0 && (
                <div className={styles.speakerPointsList} style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 12 }}>
                  {currentSpeakerPoints.map((pt) => (
                    <div key={pt.id} className={styles.pointRow}>
                      <span className={`${styles.pointTypeBadge} ${pt.type === 'ppp' ? styles.badgePrivilege : pt.type === 'ppi' ? styles.badgeInquiry : styles.badgeOrder}`}>
                        {POINT_LABELS[pt.type] || pt.type}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <CountryAvatar name={getName(pt.raisedBy)} size={18} />
                        <span className={styles.pointRaisedBy}>{getName(pt.raisedBy)}</span>
                      </div>
                      <p className={styles.pointContentText}>"{pt.content}"</p>
                      {pt.answer && <p className={styles.pointAnswerText}>Answer: {pt.answer}</p>}
                    </div>
                  ))}
                </div>
              )}

              {addingPointToCurrentSpeaker ? (
                <div className={styles.pointFormInline}>
                  <PointForm
                    draft={currentPointDraft}
                    onChange={setCurrentPointDraft}
                    countries={countries}
                  />
                  <div className={styles.pointFormActions}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setAddingPointToCurrentSpeaker(false);
                        setCurrentPointDraft({});
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={!currentPointDraft.type || !currentPointDraft.raisedBy || !currentPointDraft.content}
                      onClick={addCurrentSpeakerPoint}
                    >
                      Save Point
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className={styles.addPointBtn}
                  onClick={() => setAddingPointToCurrentSpeaker(true)}
                >
                  + Add Point / POI
                </button>
              )}
            </div>

            {/* Speakers timeline so far */}
            <div className={styles.prevSpeakersSection}>
              <div className={styles.prevSpeakersLabel}>Speakers so far ({activity.speakers.length})</div>
              {activity.speakers.length > 0 ? (
                <div className={styles.prevSpeakersScroll} style={{ maxHeight: 150, overflowY: 'auto' }}>
                  {activity.speakers.map((sp, idx) => (
                    <div key={sp.id} className={styles.prevSpeakerRow}>
                      <span className={styles.prevSpeakerNum}>{idx + 1}.</span>
                      <CountryAvatar name={getName(sp.countryId)} size={20} />
                      <span className={styles.prevSpeakerName}>{getName(sp.countryId)}</span>
                      <span className={styles.prevSpeakerTime}>{formatTime(sp.speechStartOffset)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.prevSpeakersEmpty}>No speakers recorded yet.</div>
              )}
            </div>

          </div>
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
              <IconAttendance /> Attendance Roll #{att.attendanceIndex}
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
                <div key={country.id} className={styles.attendanceRow} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <CountryAvatar name={country.name} size={20} />
                  <span className={styles.attendanceCountryName}>{country.name}</span>
                  <div className={styles.attendanceOptions}>
                    {(
                      ['present', 'present_and_voting', 'absent'] as const
                    ).map((s) => (
                      <button
                        type="button"
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
            type="button"
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
              <span className={`${styles.activityBadge} ${styles.badgeGSL}`}>
                <IconGsl /> GSL Setup
              </span>
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
                  type="button"
                  className="btn btn-danger"
                  disabled={!gsl.raisedBy}
                  onClick={failActivity}
                >
                  Failed
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!gsl.raisedBy}
                  onClick={passActivity}
                >
                  Passed → Open Speaker Phase
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
        `GSL — Active`,
        IconGsl
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
                <IconModCoc /> Mod Coc Setup
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
                  type="button"
                  className="btn btn-danger"
                  disabled={!mc.raisedBy || !mc.topic}
                  onClick={failActivity}
                >
                  Failed
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!mc.raisedBy || !mc.topic}
                  onClick={passActivity}
                >
                  Passed → Open Speaker Phase
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
        `Mod Coc — ${mc.topic || 'Active'}`,
        IconModCoc
      );
    }

    if (activity.type === 'unmod_coc') {
      const uc = activity as UnmodCocActivity;

      if (uc.status === 'setup') {
        return (
          <div key={activity.id} className={`${styles.activityCard} ${styles.activityCardUnmod}`}>
            <div className={styles.activityCardHeader}>
              <span className={`${styles.activityBadge} ${styles.badgeUnmod}`}>
                <IconUnmod /> Unmod Coc Setup
              </span>
              <span className={styles.activityTimestamp}>
                [+{formatTime(activity.startedAtOffset)}]
              </span>
            </div>
            <div className={styles.setupForm}>
              <DelegateSelect
                label="Raised By"
                countries={countries}
                value={uc.raisedBy}
                onChange={(v) => mutateCurrent({ raisedBy: v } as any)}
              />
              <div className={styles.formRow}>
                <label className="label" style={{ marginBottom: 8 }}>
                  Duration
                </label>
                <div className={styles.durationPills}>
                  {UNMOD_DURATIONS.map((d, i) => (
                    <button
                      key={d}
                      type="button"
                      className={`${styles.durationPill} ${
                        uc.durationSeconds === d ? styles.durationPillActive : ''
                      }`}
                      onClick={() => mutateCurrent({ durationSeconds: d } as any)}
                    >
                      {UNMOD_LABELS[i]}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.voteRow}>
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={!uc.raisedBy}
                  onClick={failActivity}
                >
                  Failed
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!uc.raisedBy}
                  onClick={passActivity}
                >
                  Passed → Open Unmod Caucus
                </button>
              </div>
            </div>
          </div>
        );
      }

      // Active phase with timer display
      return (
        <div key={activity.id} className={`${styles.activityCard} ${styles.activityCardUnmod}`}>
          <div className={styles.activityCardHeader}>
            <span className={`${styles.activityBadge} ${styles.badgeUnmod}`}>
              <IconUnmod /> Unmod Coc Active
            </span>
            <div className={styles.activityHeaderRight}>
              <span className={styles.activityTimestamp}>
                [+{formatTime(activity.startedAtOffset)}]
              </span>
              <button
                type="button"
                className={`btn btn-secondary btn-sm ${styles.closeActivityBtn}`}
                onClick={handleCloseActivity}
                title="Close this unmoderated caucus and return to the timeline"
              >
                Close Caucus
              </button>
            </div>
          </div>

          <div className={styles.speakerEntry}>
            <div className={styles.speakerTimerDisplay}>
              <div className={styles.speakerTimerTime}>{speakerDisplayTime}</div>
              <div className={styles.speakerTimerName}>
                Remaining Time (Raised by {getName(uc.raisedBy)})
              </div>
              <div className={styles.speakerTimerToggle}>
                <button
                  type="button"
                  className={`${styles.timerModeBtn} ${
                    speakerTimerMode === 'stopwatch' ? styles.timerModeBtnActive : ''
                  }`}
                  onClick={() => setSpeakerTimerMode('stopwatch')}
                >
                  Stopwatch
                </button>
                <button
                  type="button"
                  className={`${styles.timerModeBtn} ${
                    speakerTimerMode === 'countdown' ? styles.timerModeBtnActive : ''
                  }`}
                  onClick={() => setSpeakerTimerMode('countdown')}
                >
                  Countdown
                </button>
              </div>
              {!speakerTimerRunning && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{ marginTop: 12 }}
                  onClick={() => startSpeakerTimer(uc.durationSeconds)}
                >
                  Start / Resume Timer
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    if (activity.type === 'vote') {
      const v = activity as VoteActivity;

      if (v.status === 'setup') {
        return (
          <div key={activity.id} className={`${styles.activityCard} ${styles.activityCardVote}`}>
            <div className={styles.activityCardHeader}>
              <span className={`${styles.activityBadge} ${styles.badgeVote}`}>
                <IconVote /> Substantive Vote Setup
              </span>
              <span className={styles.activityTimestamp}>
                [+{formatTime(activity.startedAtOffset)}]
              </span>
            </div>
            <div className={styles.setupForm}>
              <div className={styles.formRow}>
                <label className="label">Draft Resolution Title</label>
                <input
                  className="input"
                  value={v.drTitle || ''}
                  onChange={(e) => mutateCurrent({ drTitle: e.target.value } as any)}
                  placeholder="e.g. Draft Resolution 1.1 (Sponsors: USA...)"
                />
              </div>

              <DelegateMultiSelect
                label="Authors (Sponsors)"
                countries={countries}
                selectedIds={v.authors || []}
                onChange={(ids) => mutateCurrent({ authors: ids } as any)}
              />

              <DelegateMultiSelect
                label="Signatories"
                countries={countries}
                selectedIds={v.signatories || []}
                onChange={(ids) => mutateCurrent({ signatories: ids } as any)}
              />

              <div style={{ marginTop: 16 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: '100%', height: 40, fontWeight: 700 }}
                  disabled={!v.drTitle}
                  onClick={() => {
                    const lastAttendance = [...sessionData.activities]
                      .reverse()
                      .find((a) => a.type === 'attendance') as AttendanceActivity | undefined;
                    const countriesToVote = lastAttendance
                      ? lastAttendance.rolls
                          .filter((r) => r.status === 'present' || r.status === 'present_and_voting')
                          .map((r) => r.countryId)
                      : countries.map((c) => c.id);

                    const initialVotes = countriesToVote.map((cid) => ({
                      countryId: cid,
                      vote: 'abstain' as const,
                    }));

                    mutateCurrent({
                      status: 'active',
                      votes: initialVotes,
                    } as any);
                  }}
                >
                  Start Voting Roll Call
                </button>
              </div>
            </div>
          </div>
        );
      }

      // Active substantive vote state
      const forCount = v.votes?.filter((v) => v.vote === 'for').length ?? 0;
      const againstCount = v.votes?.filter((v) => v.vote === 'against').length ?? 0;
      const abstainCount = v.votes?.filter((v) => v.vote === 'abstain').length ?? 0;
      
      const suggestedOutcome = forCount > againstCount ? 'passed' : 'failed';

      const handleMarkVote = (cid: string, choice: 'for' | 'against' | 'abstain') => {
        const exists = (v.votes ?? []).some((vt) => vt.countryId === cid);
        const updated = exists
          ? (v.votes ?? []).map((vt) => (vt.countryId === cid ? { ...vt, vote: choice } : vt))
          : [...(v.votes ?? []), { countryId: cid, vote: choice }];
        mutateCurrent({ votes: updated } as any);
      };

      const handleConfirmOutcome = (outcomeVal: 'passed' | 'failed') => {
        mutateCurrent({
          outcome: outcomeVal,
          status: 'completed',
        } as any);
      };

      return (
        <div key={activity.id} className={`${styles.activityCard} ${styles.activityCardVote}`}>
          <div className={styles.activityCardHeader}>
            <span className={`${styles.activityBadge} ${styles.badgeVote}`}>
              <IconVote /> SUBSTANTIVE VOTE ON: {v.drTitle}
            </span>
            <span className={styles.activityTimestamp}>
              [+{formatTime(activity.startedAtOffset)}]
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
            {/* Realtime tally dashboard */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 8,
              background: 'var(--saas-bg-elevated)',
              border: '1.5px solid var(--saas-border-default)',
              padding: 12,
              borderRadius: 'var(--saas-radius-lg)',
              textAlign: 'center'
            }}>
              <div>
                <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--confidence-good)' }}>FOR</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--confidence-good)' }}>{forCount}</div>
              </div>
              <div>
                <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--saas-accent-danger)' }}>AGAINST</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--saas-accent-danger)' }}>{againstCount}</div>
              </div>
              <div>
                <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--saas-text-muted)' }}>ABSTAIN</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--saas-text-muted)' }}>{abstainCount}</div>
              </div>
            </div>

            {/* Voting List */}
            <div style={{ maxHeight: 250, overflowY: 'auto', border: '1px solid var(--saas-border-default)', borderRadius: 'var(--saas-radius-lg)' }}>
              {(v.votes ?? []).map((vt) => {
                const cName = getName(vt.countryId);
                return (
                  <div key={vt.countryId} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderBottom: '1px solid var(--saas-border-default)',
                    background: 'var(--saas-bg-surface)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <CountryAvatar name={cName} size={20} />
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{cName}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        type="button"
                        className={`${styles.attendanceBtn} ${vt.vote === 'for' ? styles.attendanceBtnActive : ''}`}
                        onClick={() => handleMarkVote(vt.countryId, 'for')}
                        style={{ height: 26, padding: '0 8px', fontSize: 10, background: vt.vote === 'for' ? 'var(--confidence-good)' : '' }}
                      >
                        For
                      </button>
                      <button
                        type="button"
                        className={`${styles.attendanceBtn} ${vt.vote === 'against' ? styles.attendanceBtnActive : ''}`}
                        onClick={() => handleMarkVote(vt.countryId, 'against')}
                        style={{ height: 26, padding: '0 8px', fontSize: 10, background: vt.vote === 'against' ? 'var(--saas-accent-danger)' : '' }}
                      >
                        Against
                      </button>
                      <button
                        type="button"
                        className={`${styles.attendanceBtn} ${vt.vote === 'abstain' ? styles.attendanceBtnActive : ''}`}
                        onClick={() => handleMarkVote(vt.countryId, 'abstain')}
                        style={{ height: 26, padding: '0 8px', fontSize: 10 }}
                      >
                        Abstain
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Suggested Outcome and Final Action buttons */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              borderTop: '1px solid var(--saas-border-default)',
              paddingTop: 12,
              marginTop: 4
            }}>
              <div style={{ fontSize: 11, fontWeight: 650, color: 'var(--saas-text-muted)' }}>
                Tally Recommendation: <span style={{ fontWeight: 800, textTransform: 'uppercase', color: suggestedOutcome === 'passed' ? 'var(--confidence-good)' : 'var(--saas-accent-danger)' }}>
                  {suggestedOutcome === 'passed' ? 'Passed (For > Against)' : 'Failed (For ≤ Against)'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1, borderColor: 'var(--saas-accent-danger)', color: 'var(--saas-accent-danger)', background: 'transparent' }}
                  onClick={() => handleConfirmOutcome('failed')}
                >
                  Confirm Failed
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  onClick={() => handleConfirmOutcome('passed')}
                >
                  Confirm Passed
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (activity.type === 'crisis') {
      const c = activity as CrisisActivity;
      return (
        <div key={activity.id} className={`${styles.activityCard} ${styles.activityCardCrisis}`}>
          <div className={styles.activityCardHeader}>
            <span className={`${styles.activityBadge} ${styles.badgeCrisis}`}>
              <IconCrisis /> Crisis Segment Note
            </span>
            <span className={styles.activityTimestamp}>
              [+{formatTime(activity.startedAtOffset)}]
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12, textAlign: 'left' }}>
            <label className={styles.dictationLabel}>What happened?</label>
            <textarea
              className="textarea input"
              placeholder="Type or dictate the crisis details here…"
              value={c.content || ''}
              onChange={(e) => mutateCurrent({ content: e.target.value } as any)}
              rows={4}
              style={{ width: '100%', resize: 'vertical' }}
            />
            <button
              type="button"
              className="btn btn-primary"
              disabled={!c.content}
              onClick={() => mutateCurrent({ status: 'completed' } as any)}
            >
              Save Crisis Log
            </button>
          </div>
        </div>
      );
    }

    if (activity.type === 'presidential_address') {
      const pa = activity as PresidentialAddressActivity;
      return (
        <div key={activity.id} className={`${styles.activityCard} ${styles.activityCardPresident}`}>
          <div className={styles.activityCardHeader}>
            <span className={`${styles.activityBadge} ${styles.badgePresident}`}>
              <IconPresident /> Presidential Address Note
            </span>
            <span className={styles.activityTimestamp}>
              [+{formatTime(activity.startedAtOffset)}]
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12, textAlign: 'left' }}>
            <label className={styles.dictationLabel}>Address content</label>
            <textarea
              className="textarea input"
              placeholder="Type or dictate address transcription here…"
              value={pa.content || ''}
              onChange={(e) => mutateCurrent({ content: e.target.value } as any)}
              rows={4}
              style={{ width: '100%', resize: 'vertical' }}
            />
            <button
              type="button"
              className="btn btn-primary"
              disabled={!pa.content}
              onClick={() => mutateCurrent({ status: 'completed' } as any)}
            >
              Save Address Note
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
      {/* Persistent recording status bar */}
      <div className={styles.persistentIndicator}>
        <span className={`${styles.statusDot} ${isMeetingActive ? styles.statusRecording : ''}`} />
        
        {loadingSession ? (
          <span className={styles.persistentTimerText}>Loading session…</span>
        ) : isMeetingActive ? (
          <>
            <span className={styles.persistentTimerText}>
              ACTIVE: {formatTime(recordingSeconds)}
            </span>
            <button
              type="button"
              className="btn btn-sm btn-danger"
              onClick={stopMeeting}
              style={{ fontSize: 11, padding: '2px 8px', fontWeight: 700 }}
            >
              End Session
            </button>
          </>
        ) : (
          <>
            <span className={styles.persistentTimerText}>
              {sessionData.sessionStart ? 'PAUSED' : 'READY'}
            </span>
            <select
              className="select"
              value={chunkSize}
              onChange={(e) => setChunkSize(parseInt(e.target.value))}
              style={{ fontSize: 11, padding: '2px 4px', height: 24, minWidth: 100 }}
            >
              {CHUNK_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={startMeeting}
              style={{ fontSize: 11, padding: '2px 8px', fontWeight: 700 }}
            >
              {sessionData.sessionStart ? 'Resume Session' : 'Begin Session'}
            </button>
          </>
        )}
      </div>
      {/* ── Audio Error Full-Screen Overlay ───────────────────────────────── */}
      {audioError && (
        <div className={styles.audioErrorOverlay}>
          <div className={styles.audioErrorCard}>
            <div className={styles.audioErrorIcon}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
            </div>
            <h2 className={styles.audioErrorTitle}>Audio Recording Error</h2>
            <p className={styles.audioErrorDesc}>
              The committee session audio has stopped. Your session timer and all activity data
              are preserved.
            </p>
            <code className={styles.audioErrorMsg}>{audioError}</code>
            <div className={styles.audioErrorActions}>
              <button type="button" className="btn btn-ghost" onClick={() => setAudioError(null)}>
                Dismiss
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={async () => {
                  setAudioError(null);
                  setMicWarningOpen(true);
                  await attemptMicRecovery();
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
                : 'No Session Started'}
            </span>
          </div>
          {isMeetingActive && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className={styles.sessionTimer}>{formatTime(recordingSeconds)}</div>
              {micWarningOpen && (
                <div
                  style={{
                    backgroundColor: 'var(--saas-accent-danger)',
                    color: 'white',
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: 'var(--saas-radius-md)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    boxShadow: 'var(--saas-shadow-sm)',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m18.8 6-2 2a5.9 5.9 0 0 0-8.4 0l-2-2"/><path d="M14.5 10.3a2.1 2.1 0 0 0-2.8 0"/><path d="M12 14v8"/><path d="M9 17h6"/></svg>
                  {recoveringMic ? 'Reconnecting Mic…' : '⚠ Mic Disconnected'}
                </div>
              )}
            </div>
          )}
        </div>
        <div className={styles.sessionHeaderRight}>
          {sessionData.sessionStart && (
            <>
              {sessionData.activities.some((a) => a.type === 'attendance') && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setEditAttendanceOpen(true)}
                  style={{ marginRight: 8 }}
                >
                  Edit Attendance
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setAddDelegateOpen(true)}
                style={{ marginRight: 8 }}
              >
                + Add Delegate
              </button>
            </>
          )}
          {sessionData.activities.length > 0 && (
            <div ref={exportMenuRef} style={{ position: 'relative', display: 'inline-block' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setExportMenuOpen(!exportMenuOpen)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                Export
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
              </button>
              {exportMenuOpen && (
                <div
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: 'calc(100% + 4px)',
                    backgroundColor: 'var(--saas-bg-surface)',
                    border: '1px solid var(--saas-border-default)',
                    borderRadius: 'var(--saas-radius-md)',
                    boxShadow: 'var(--saas-shadow-md)',
                    zIndex: 110,
                    minWidth: 185,
                    display: 'flex',
                    flexDirection: 'column',
                    padding: 4,
                  }}
                >
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ textAlign: 'left', padding: '6px 12px', fontSize: 12, justifyContent: 'flex-start', border: 'none', background: 'transparent', width: '100%', cursor: 'pointer' }}
                    onClick={() => {
                      handleExport();
                      setExportMenuOpen(false);
                    }}
                  >
                    📝 Export Text Logs (.txt)
                  </button>
                  {manifest.segments && manifest.segments.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ textAlign: 'left', padding: '6px 12px', fontSize: 12, justifyContent: 'flex-start', border: 'none', background: 'transparent', width: '100%', cursor: 'pointer' }}
                      onClick={() => {
                        handleExportRecording();
                        setExportMenuOpen(false);
                      }}
                    >
                      🎵 Export Audio (.webm)
                    </button>
                  )}
                </div>
              )}
            </div>
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
                ? CompletedActivityCard({
                    activity,
                    countries,
                    isExpanded: !!expandedCards[activity.id],
                    onToggleExpand: () => toggleCardExpand(activity.id),
                    onDelete: () => requestDeleteActivity(activity.id),
                  })
                : renderActiveActivity(activity)
            )}
          </div>

          {canAddActivity && (
            <button
              type="button"
              className={styles.addActivityBtn}
              onClick={() => setAddActivityOpen(true)}
            >
              <span className={styles.addActivityPlus}>+</span> Add Activity
            </button>
          )}

          {!isMeetingActive && sessionData.activities.length === 0 && (
            <div className={styles.emptyTimeline}>
              <div className={styles.emptyTimelineIcon}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 17h6"/><path d="M9 12h6"/><path d="M9 7h6"/></svg>
              </div>
              <p className={styles.emptyTimelineText}>No committee session active</p>
              <p className={styles.emptyTimelineSub}>
                Begin a committee session to start tracking attendance, GSL, moderated and unmoderated caucuses.
              </p>
            </div>
          )}

          {isMeetingActive && sessionData.activities.length === 0 && !currentActivity && (
            <div className={styles.emptyTimeline}>
              <div className={styles.emptyTimelineIcon}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
              </div>
              <p className={styles.emptyTimelineText}>Session is running</p>
              <p className={styles.emptyTimelineSub}>Add your first activity to start logging records.</p>
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
                  { type: 'attendance', Icon: IconAttendance, label: 'Attendance', sub: 'Roll call' },
                  { type: 'gsl', Icon: IconGsl, label: 'GSL', sub: 'General Speakers List' },
                  { type: 'mod_coc', Icon: IconModCoc, label: 'Mod Coc', sub: 'Moderated Caucus' },
                  { type: 'unmod_coc', Icon: IconUnmod, label: 'Unmod Coc', sub: 'Unmoderated Caucus' },
                  { type: 'vote', Icon: IconVote, label: 'Formal Vote', sub: 'Vote on Draft Resolution' },
                  { type: 'crisis', Icon: IconCrisis, label: 'Crisis Log', sub: 'Crisis segment note' },
                  { type: 'presidential_address', Icon: IconPresident, label: 'President Address', sub: 'Executive board note' },
                ] as const
              ).map((opt) => (
                <button
                  type="button"
                  key={opt.type}
                  className={styles.activityTypeCard}
                  onClick={() => addActivity(opt.type as any)}
                >
                  <span className={styles.activityTypeIcon}><opt.Icon /></span>
                  <span className={styles.activityTypeLabel}>{opt.label}</span>
                  <span className={styles.activityTypeSub}>{opt.sub}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setAddActivityOpen(false)}
              style={{ marginTop: 20 }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Add Delegate Modal ────────────────────────────────────────────── */}
      {addDelegateOpen && (
        <div className={styles.modalOverlay} onClick={() => {
          if (!addingDelegate) {
            setAddDelegateOpen(false);
            setNewDelegateName('');
            setAddDelegateError(null);
          }
        }}>
          <div
            className={styles.activityPickerModal}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 420 }}
          >
            <h3 className={styles.modalTitle}>Add Delegate Mid-Session</h3>
            <p className={styles.modalSubtitle} style={{ textAlign: 'center', marginBottom: 20 }}>
              Enter the country or delegation name to add them to this committee session.
            </p>
            <form onSubmit={handleAddDelegate} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label className="label" htmlFor="new-delegate-name-input" style={{ fontSize: 12, fontWeight: 600 }}>Country / Delegation Name</label>
                <input
                  id="new-delegate-name-input"
                  className="input"
                  placeholder="e.g. Germany"
                  value={newDelegateName}
                  onChange={(e) => setNewDelegateName(e.target.value)}
                  disabled={addingDelegate}
                  autoFocus
                  required
                />
              </div>

              {addDelegateError && (
                <div style={{ color: 'var(--saas-accent-danger)', fontSize: 12, fontWeight: 500, textAlign: 'center' }}>
                  {addDelegateError}
                </div>
              )}

              <div className={styles.modalActions} style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setAddDelegateOpen(false);
                    setNewDelegateName('');
                    setAddDelegateError(null);
                  }}
                  disabled={addingDelegate}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={addingDelegate || !newDelegateName.trim()}
                >
                  {addingDelegate ? 'Adding…' : 'Add Delegate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Attendance Modal ─────────────────────────────────────────── */}
      {editAttendanceOpen && (
        <div className={styles.modalOverlay} onClick={() => setEditAttendanceOpen(false)}>
          <div
            className={styles.activityPickerModal}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 500, width: '100%' }}
          >
            {(() => {
              const lastAttendance = [...sessionData.activities]
                .reverse()
                .find((a) => a.type === 'attendance') as AttendanceActivity | undefined;
              
              if (!lastAttendance) {
                return (
                  <div style={{ textAlign: 'center', padding: 20 }}>
                    <p style={{ color: 'var(--saas-text-secondary)', fontSize: 14 }}>No attendance records found.</p>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => setEditAttendanceOpen(false)}
                      style={{ marginTop: 16 }}
                    >
                      Close
                    </button>
                  </div>
                );
              }

              return (
                <>
                  <h3 className={styles.modalTitle} style={{ marginBottom: 4 }}>Modify Committee Roster Attendance</h3>
                  <p className={styles.modalSubtitle} style={{ textAlign: 'center', marginBottom: 20 }}>
                    Editing Attendance Roll Call #{lastAttendance.attendanceIndex}
                  </p>

                  <div
                    style={{
                      maxHeight: 350,
                      overflowY: 'auto',
                      width: '100%',
                      border: '1px solid var(--saas-border-default)',
                      borderRadius: 'var(--saas-radius-lg)',
                      marginBottom: 16,
                      background: 'var(--saas-bg-surface)',
                    }}
                  >
                    {countries.map((country) => {
                      const roll = lastAttendance.rolls.find((r) => r.countryId === country.id);
                      const status = roll?.status ?? 'absent';
                      return (
                        <div
                          key={country.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 16px',
                            borderBottom: '1px solid var(--saas-border-default)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <CountryAvatar name={country.name} size={22} />
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--saas-text-primary)' }}>{country.name}</span>
                          </div>
                          <div className={styles.attendanceOptions} style={{ margin: 0 }}>
                            {(['present', 'present_and_voting', 'absent'] as const).map((s) => (
                              <button
                                type="button"
                                key={s}
                                className={`${styles.attendanceBtn} ${
                                  status === s ? styles.attendanceBtnActive : ''
                                }`}
                                onClick={() => updateLastAttendanceRoll(country.id, s)}
                                style={{ height: 28, fontSize: 10, padding: '0 10px' }}
                              >
                                {s === 'present' ? 'P' : s === 'present_and_voting' ? 'P+V' : 'A'}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => setEditAttendanceOpen(false)}
                      style={{ padding: '6px 16px', fontSize: 12 }}
                    >
                      Done
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── Delete Activity Confirmation Modal ────────────────────────────── */}
      {deleteConfirmOpen && (
        <div className={styles.modalOverlay} onClick={() => {
          setDeleteConfirmOpen(false);
          setActivityToDelete(null);
        }}>
          <div
            className={styles.activityPickerModal}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 400 }}
          >
            <h3 className={styles.modalTitle} style={{ color: 'var(--saas-accent-danger)', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12" y1="17" y2="17"/></svg>
              Delete Activity
            </h3>
            <p className={styles.modalSubtitle} style={{ textAlign: 'center', marginTop: 12, marginBottom: 20 }}>
              Are you sure you want to delete this activity? This action cannot be undone.
            </p>
            <div className={styles.modalActions} style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, width: '100%' }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setActivityToDelete(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-sm"
                style={{
                  backgroundColor: 'var(--saas-accent-danger)',
                  color: 'white',
                  border: 'none',
                  padding: '6px 16px',
                  borderRadius: 'var(--saas-radius-md)',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                onClick={confirmDeleteActivity}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Audio Export Loading Overlay ────────────────────────────────────── */}
      {exportingAudio && (
        <div className={styles.modalOverlay} style={{ zIndex: 9999 }}>
          <div
            className={styles.activityPickerModal}
            style={{ maxWidth: 300, textAlign: 'center', padding: 24 }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  border: '3px solid var(--saas-border-default)',
                  borderTopColor: 'var(--accent-primary)',
                  animation: 'spin 1s linear infinite',
                }}
              />
              <style>{`
                @keyframes spin {
                  0% { transform: rotate(0deg); }
                  100% { transform: rotate(360deg); }
                }
              `}</style>
              <h4 style={{ fontWeight: 600, color: 'var(--saas-text-primary)', margin: 0, fontSize: 15 }}>Merging Audio Chunks…</h4>
              <p style={{ fontSize: 11.5, color: 'var(--saas-text-muted)', margin: 0, lineHeight: 1.4 }}>
                Combining segments into a single continuous WebM recording. Please wait.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Global Point FAB ─────────────────────────────────────────────── */}
      {isMeetingActive && (
        <button
          type="button"
          className={styles.globalPointFAB}
          onClick={() => setGlobalPointOpen(true)}
          title="Raise a point at this timestamp"
        >
          <span className={styles.fabIcon}><IconBolt /></span>
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
              Add Point{' '}
              <span className={styles.globalPointTimestamp}>
                at [+{formatTime(recordingSeconds)}]
              </span>
            </h3>
            {currentActivity && (
              <p className={styles.modalSubtitle}>
                Active activity:{' '}
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
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setGlobalPointOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
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

// Helper to find a byte sequence in a Uint8Array (used to locate Matroska/WebM Cluster headers)
function findSequenceIndex(arr: Uint8Array, seq: number[]): number {
  for (let i = 0; i < arr.length - seq.length + 1; i++) {
    let match = true;
    for (let j = 0; j < seq.length; j++) {
      if (arr[i + j] !== seq[j]) {
        match = false;
        break;
      }
    }
    if (match) return i;
  }
  return -1;
}
