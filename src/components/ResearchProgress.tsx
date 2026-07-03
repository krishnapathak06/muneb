'use client';

import { useState, useEffect, useRef } from 'react';
import styles from './ResearchProgress.module.css';

type CountryStatus = 'queued' | 'researching' | 'done' | 'failed';

interface CountryProgress {
  name: string;
  status: CountryStatus;
  stage?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  embeddedCount?: number;
}

interface Props {
  workspaceId: string;
  onComplete: () => void;
}

const STATUS_ICON: Record<CountryStatus, string> = {
  queued: '○',
  researching: '◎',
  done: '✓',
  failed: '✗',
};

export default function ResearchProgress({ workspaceId, onComplete }: Props) {
  const [progress, setProgress] = useState<Record<string, CountryProgress>>({});
  const [wsStatus, setWsStatus] = useState('researching');
  const [restarting, setRestarting] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  async function poll() {
    try {
      const res = await fetch(`/api/research/status/${workspaceId}`);
      const data = await res.json();
      setProgress(data.progress ?? {});
      setWsStatus(data.workspaceStatus);
      if (data.workspaceStatus === 'done') {
        clearInterval(intervalRef.current!);
        setTimeout(onComplete, 1500);
      }
    } catch {}
  }

  useEffect(() => {
    poll();
    intervalRef.current = setInterval(poll, 4000);
    return () => clearInterval(intervalRef.current!);
  }, [workspaceId]);

  async function handleRestart() {
    if (!confirm('Are you sure you want to restart the research run? This will overwrite existing country research logs.')) return;
    setRestarting(true);
    try {
      const res = await fetch('/api/research/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      });
      if (!res.ok) throw new Error('Failed to restart research');
      setWsStatus('researching');
      poll();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setRestarting(false);
    }
  }

  const entries = Object.entries(progress);
  const done = entries.filter(([, v]) => v.status === 'done').length;
  const failed = entries.filter(([, v]) => v.status === 'failed').length;
  const researching = entries.filter(([, v]) => v.status === 'researching').length;
  const total = entries.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const totalEmbedded = entries.reduce((acc, [, v]) => acc + (v.embeddedCount ?? 0), 0);

  return (
    <div className={styles.container}>
      <div className={styles.header} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 className={styles.title}>Researching Committee Context</h2>
          <p className={styles.sub}>
            Per-country AI research agents are processing the background matrix in parallel.
            You can safely close this workspace — all progress updates are saved.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          style={{ marginTop: 8 }}
          onClick={handleRestart}
          disabled={restarting}
        >
          {restarting ? 'Restarting...' : 'Restart Research Run'}
        </button>
      </div>

      {/* Progress card */}
      <div className={styles.progressCard}>
        <div className={styles.progressStats}>
          <div className={styles.stat}>
            <span className={styles.statNum} style={{ color: 'var(--accent-success)' }}>{done}</span>
            <span className={styles.statLabel}>Completed</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statNum} style={{ color: 'var(--accent-primary)' }}>{researching}</span>
            <span className={styles.statLabel}>Researching</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statNum} style={{ color: 'var(--text-secondary)' }}>{total - done - researching - failed}</span>
            <span className={styles.statLabel}>Queued</span>
          </div>
          {failed > 0 && (
            <div className={styles.stat}>
              <span className={styles.statNum} style={{ color: 'var(--accent-danger)' }}>{failed}</span>
              <span className={styles.statLabel}>Failed</span>
            </div>
          )}
        </div>
        <div className={styles.progressBar}>
          <div
            className={styles.progressFill}
            style={{ width: `${pct}%`, transition: 'width 0.5s ease' }}
          />
        </div>
        <div className={styles.progressPct}>{pct}% Completed</div>
        
        <div className={styles.embeddedBanner}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
          <div>
            Analyzed and integrated <strong>{totalEmbedded}</strong> core intelligence sources.
          </div>
        </div>

        {wsStatus === 'done' && (
          <div className={styles.doneMsg}>Workspace analysis finalized. Refreshing dashboard views…</div>
        )}
      </div>

      {/* Country grid */}
      <div className={styles.grid}>
        {entries.map(([id, cp]) => (
          <div
            key={id}
            className={`${styles.countryItem} ${styles['status_' + cp.status]}`}
          >
            <span className={`${styles.statusIcon} ${cp.status === 'researching' ? 'animate-pulse' : ''}`}>
              {cp.status === 'done' && '✓'}
              {cp.status === 'researching' && '●'}
              {cp.status === 'queued' && '○'}
              {cp.status === 'failed' && '×'}
            </span>
            <div className={styles.countryInfo}>
              <div className={styles.countryName}>{cp.name}</div>
              {cp.stage && cp.status === 'researching' && (
                <div className={styles.countryStage}>{cp.stage}</div>
              )}
              {cp.error && <div className={styles.countryError}>{cp.error}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
