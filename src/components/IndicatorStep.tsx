'use client';

import { useState, useEffect } from 'react';
import styles from './IndicatorStep.module.css';

interface Indicator {
  id: string;
  label: string;
  description: string;
}

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
  subIssues: SubIssue[];
  onComplete: () => void;
}

export default function IndicatorStep({
  workspaceId,
  committee,
  mainAgenda,
  countries,
  subIssues,
  onComplete,
}: Props) {
  const [indicators, setIndicators] = useState<Record<string, Indicator[]>>({});
  const [activeTab, setActiveTab] = useState<string>('main');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchIndicators();
  }, [workspaceId]);

  async function fetchIndicators() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/indicators?workspaceId=${workspaceId}`);
      if (!res.ok) throw new Error('Failed to fetch indicators');
      const data = await res.json();
      setIndicators(data || {});
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const activeIndicators = indicators[activeTab] || [];

  function updateIndicator(id: string, field: 'label' | 'description', value: string) {
    setIndicators((prev) => {
      const list = prev[activeTab] || [];
      const updatedList = list.map((ind) =>
        ind.id === id ? { ...ind, [field]: value } : ind
      );
      return { ...prev, [activeTab]: updatedList };
    });
  }

  function removeIndicator(id: string) {
    setIndicators((prev) => {
      const list = prev[activeTab] || [];
      const updatedList = list.filter((ind) => ind.id !== id);
      return { ...prev, [activeTab]: updatedList };
    });
  }

  function addIndicator() {
    const newId = Math.random().toString(36).slice(2);
    const newInd: Indicator = {
      id: newId,
      label: '',
      description: '',
    };
    setIndicators((prev) => {
      const list = prev[activeTab] || [];
      return { ...prev, [activeTab]: [...list, newInd] };
    });
  }

  function moveUp(i: number) {
    if (i === 0) return;
    setIndicators((prev) => {
      const list = [...(prev[activeTab] || [])];
      [list[i - 1], list[i]] = [list[i], list[i - 1]];
      return { ...prev, [activeTab]: list };
    });
  }

  function moveDown(i: number) {
    const list = indicators[activeTab] || [];
    if (i === list.length - 1) return;
    setIndicators((prev) => {
      const listCopy = [...(prev[activeTab] || [])];
      [listCopy[i], listCopy[i + 1]] = [listCopy[i + 1], listCopy[i]];
      return { ...prev, [activeTab]: listCopy };
    });
  }

  async function handleApprove() {
    setSubmitting(true);
    setError('');
    try {
      // 1. Save updated indicator definitions
      const resSave = await fetch('/api/indicators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, indicators }),
      });
      const saveResult = await resSave.json();
      if (saveResult.error) throw new Error(saveResult.error);

      // 2. Start the research run
      const resStart = await fetch('/api/research/start', {
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
      const startResult = await resStart.json();
      if (startResult.error) throw new Error(startResult.error);

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
        <h2 className={styles.title}>Refine Comparative Indicators</h2>
        <p className={styles.sub}>
          Review and customize the 8 metrics/indicators to compare across countries on each topic.
        </p>
      </div>

      <div className={styles.context}>
        <div className={styles.contextItem}>
          <span className={styles.contextLabel}>Committee</span>
          <span className={styles.contextValue}>{committee}</span>
        </div>
        <div className={styles.contextItem}>
          <span className={styles.contextLabel}>Agenda</span>
          <span className={styles.contextValue}>{mainAgenda}</span>
        </div>
        <div className={styles.contextItem}>
          <span className={styles.contextLabel}>Countries</span>
          <span className={styles.contextValue}>{countries.length} Loaded</span>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === 'main' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('main')}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
          Main Agenda
        </button>
        {subIssues.map((si) => (
          <button
            key={si.id}
            type="button"
            className={`${styles.tab} ${activeTab === `subissue_${si.id}` ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(`subissue_${si.id}`)}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            {si.title || 'Sub-issue'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={styles.loadingState}>
          <div className="animate-spin" style={{ fontSize: 20 }}>⟳</div>
          <span>Loading indicator templates...</span>
        </div>
      ) : (
        <div className={styles.cardList}>
          {activeIndicators.map((ind, i) => (
            <div key={ind.id} className={styles.card}>
              <div className={styles.cardTop}>
                <div className={styles.cardNumber}>{i + 1}</div>
                <div className={styles.cardFields}>
                  <input
                    type="text"
                    className={`input ${styles.titleInput}`}
                    placeholder="Indicator name (e.g. Defense Expenditure as % of GDP)"
                    value={ind.label}
                    onChange={(e) => updateIndicator(ind.id, 'label', e.target.value)}
                  />
                  <textarea
                    rows={2}
                    className={`input ${styles.descInput}`}
                    placeholder="Describe what this indicator measures and why it is critical for research comparison..."
                    value={ind.description}
                    onChange={(e) => updateIndicator(ind.id, 'description', e.target.value)}
                  />
                </div>
                <div className={styles.cardActions}>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => moveUp(i)} disabled={i === 0} title="Move up">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="18 15 12 9 6 15"/></svg>
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => moveDown(i)} disabled={i === activeIndicators.length - 1} title="Move down">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => removeIndicator(ind.id)} title="Remove">Remove</button>
                </div>
              </div>
            </div>
          ))}

          {activeIndicators.length === 0 && (
            <div className={styles.emptyState}>No indicators added yet for this topic. Click below to add one.</div>
          )}

          <button type="button" className="btn btn-secondary btn-sm" onClick={addIndicator} style={{ alignSelf: 'flex-start', marginTop: 12 }}>
            + Add Custom Indicator
          </button>
        </div>
      )}

      {error && <div className={styles.errorText} style={{ marginTop: 16 }}>{error}</div>}

      <div className={styles.approveRow}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>
          Review indicators for all topics before initiating country research.
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleApprove}
          disabled={submitting || loading}
        >
          {submitting ? 'Starting Research...' : 'Approve & Start Research'}
        </button>
      </div>
    </div>
  );
}
