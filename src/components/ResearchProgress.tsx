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

  const entries = Object.entries(progress);
  const done = entries.filter(([, v]) => v.status === 'done').length;
  const failed = entries.filter(([, v]) => v.status === 'failed').length;
  const researching = entries.filter(([, v]) => v.status === 'researching').length;
  const total = entries.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>Step 3 — Research in Progress</h2>
        <p className={styles.sub}>
          Per-country agents are researching in parallel. This may take 20-40 minutes depending on rate limits.
          You can leave this page — progress is saved automatically.
        </p>
      </div>

      {/* Progress bar */}
      <div className={`card ${styles.progressCard}`}>
        <div className={styles.progressStats}>
          <div className={styles.stat}><span className={styles.statNum}>{done}</span><span className={styles.statLabel}>Done</span></div>
          <div className={styles.stat}><span className={styles.statNum} style={{ color: 'var(--accent-primary)' }}>{researching}</span><span className={styles.statLabel}>Researching</span></div>
          <div className={styles.stat}><span className={styles.statNum} style={{ color: 'var(--text-muted)' }}>{total - done - researching - failed}</span><span className={styles.statLabel}>Queued</span></div>
          {failed > 0 && <div className={styles.stat}><span className={styles.statNum} style={{ color: 'var(--accent-danger)' }}>{failed}</span><span className={styles.statLabel}>Failed</span></div>}
        </div>
        <div className={styles.progressBar}>
          <div
            className={styles.progressFill}
            style={{ width: `${pct}%`, transition: 'width 0.5s ease' }}
          />
        </div>
        <div className={styles.progressPct}>{pct}% complete</div>
        {wsStatus === 'done' && (
          <div className={styles.doneMsg}>✓ All research complete — loading dashboard…</div>
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
              {STATUS_ICON[cp.status]}
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
