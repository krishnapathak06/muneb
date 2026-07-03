'use client';

import { useState, useEffect } from 'react';
import styles from './SubIssueStep.module.css';

interface SubIssue {
  id: string;
  title: string;
  description: string;
}

interface Props {
  workspaceId: string;
  committee: string;
  mainAgenda: string;
  countries: string[];
  bgText: string;
  onComplete: () => void;
}

export default function SubIssueStep({
  workspaceId, committee, mainAgenda, countries, bgText, onComplete,
}: Props) {
  const [subIssues, setSubIssues] = useState<SubIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    extractSubIssues();
  }, []);

  async function extractSubIssues(force = false) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/sub-issues/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, bgText, mainAgenda, committee, force }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSubIssues(data.subIssues);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function updateSubIssue(id: string, field: 'title' | 'description', value: string) {
    setSubIssues((prev) => prev.map((si) => si.id === id ? { ...si, [field]: value } : si));
  }

  function removeSubIssue(id: string) {
    setSubIssues((prev) => prev.filter((si) => si.id !== id));
  }

  function addSubIssue() {
    const id = Math.random().toString(36).slice(2);
    setSubIssues((prev) => [...prev, { id, title: '', description: '' }]);
  }

  function moveUp(i: number) {
    if (i === 0) return;
    const next = [...subIssues];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    setSubIssues(next);
  }

  function moveDown(i: number) {
    if (i === subIssues.length - 1) return;
    const next = [...subIssues];
    [next[i], next[i + 1]] = [next[i + 1], next[i]];
    setSubIssues(next);
  }

  async function handleApprove() {
    setSubmitting(true);
    setError('');
    try {
      // Start research
      const res = await fetch('/api/research/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          committee,
          mainAgenda,
          subIssues,
          countries,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      onComplete();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.stepHeader}>
        <h2 className={styles.title}>Step 2 — Sub-issue Review</h2>
        <p className={styles.sub}>
          Review and edit the proposed sub-issues. Research agents won't start until you explicitly approve.
        </p>
      </div>

      <div className={styles.context}>
        <div className={styles.contextItem}>
          <span className={styles.contextLabel}>Committee</span>
          <span className={styles.contextValue}>{committee || '—'}</span>
        </div>
        <div className={styles.contextItem}>
          <span className={styles.contextLabel}>Agenda</span>
          <span className={styles.contextValue}>{mainAgenda || '—'}</span>
        </div>
        <div className={styles.contextItem}>
          <span className={styles.contextLabel}>Countries</span>
          <span className={styles.contextValue}>{countries.length} countries</span>
        </div>
      </div>

      {loading ? (
        <div className={styles.loadingState}>
          <div className="animate-spin" style={{ fontSize: 20 }}>⟳</div>
          <span>Proposing sub-issues from Background Guide…</span>
        </div>
      ) : (
        <>
          <div className={styles.cardList}>
            {subIssues.map((si, i) => (
              <div key={si.id} className={`card ${styles.subIssueCard} animate-fade-in`} style={{ animationDelay: `${i * 60}ms` }}>
                <div className={styles.cardTop}>
                  <div className={styles.cardNumber}>{i + 1}</div>
                  <div className={styles.cardFields}>
                    <input
                      className={`input ${styles.titleInput}`}
                      value={si.title}
                      onChange={(e) => updateSubIssue(si.id, 'title', e.target.value)}
                      placeholder="Sub-issue title"
                    />
                    <textarea
                      className={`input ${styles.descInput}`}
                      value={si.description}
                      onChange={(e) => updateSubIssue(si.id, 'description', e.target.value)}
                      placeholder="1-2 sentence description…"
                      rows={2}
                    />
                  </div>
                  <div className={styles.cardActions}>
                    <button className="btn btn-ghost btn-sm" onClick={() => moveUp(i)} disabled={i === 0} title="Move up">↑</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => moveDown(i)} disabled={i === subIssues.length - 1} title="Move down">↓</button>
                    <button className="btn btn-danger btn-sm" onClick={() => removeSubIssue(si.id)} title="Remove">×</button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {subIssues.length < 6 && (
            <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={addSubIssue}>
              + Add Sub-issue
            </button>
          )}

          {error && <div className="alert alert-danger" style={{ marginTop: 16 }}>⚠ {error}</div>}

          <div className={styles.approveRow}>
            <button className="btn btn-secondary" onClick={() => extractSubIssues(true)}>↺ Re-generate</button>
            <button
              id="btn-approve-subissues"
              className="btn btn-primary btn-lg"
              onClick={handleApprove}
              disabled={submitting || subIssues.length === 0 || subIssues.some((si) => !si.title.trim())}
            >
              {submitting
                ? <><span className="animate-spin" style={{ display: 'inline-block' }}>⟳</span> Starting research…</>
                : `Approve & Start Research on ${countries.length} Countries →`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
