'use client';

import { useState, useEffect } from 'react';
import styles from './CountryTopicView.module.css';

type ConfidenceLevel = 'Well-sourced' | 'Sparse' | 'Insufficient';

interface Source {
  url: string;
  title: string;
  publication_date: string;
  extracted_text: string;
  credibility_tier: 1 | 2 | 3;
}

interface TopicData {
  stance_summary: string;
  stats: string[];
  controversies: string[];
  questions: string[];
  allies: string[];
  adversaries: string[];
  recent_shifts: string;
  confidence: ConfidenceLevel;
  sources: Source[];
}

interface Props {
  workspaceId: string;
  countryId: string;
  countryName: string;
  topicId: string;
  topicLabel: string;
}

const CONFIDENCE_CLASS: Record<ConfidenceLevel, string> = {
  'Well-sourced': 'badge-green',
  'Sparse': 'badge-yellow',
  'Insufficient': 'badge-red',
};

const TIER_LABEL: Record<number, string> = { 1: 'Tier 1', 2: 'Tier 2', 3: 'Tier 3' };
const TIER_CLASS: Record<number, string> = { 1: 'badge-green', 2: 'badge-blue', 3: 'badge-gray' };

export default function CountryTopicView({ workspaceId, countryId, countryName, topicId, topicLabel }: Props) {
  const [data, setData] = useState<TopicData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSources, setExpandedSources] = useState(false);

  useEffect(() => {
    setLoading(true);
    setData(null);
    const fileName = topicId === 'main' ? 'main_agenda' : `subissue_${topicId}`;
    fetch(`/api/workspace-data/${workspaceId}/research/${countryId}/${fileName}`)
      .then((r) => r.json())
      .then((d) => {
        // The file IS the data (not wrapped in .data)
        if (d && !d.error) setData(d);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [workspaceId, countryId, topicId]);

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className="skeleton" style={{ height: 24, width: '40%', marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 14, width: '100%', marginBottom: 6 }} />
        <div className="skeleton" style={{ height: 14, width: '90%', marginBottom: 6 }} />
        <div className="skeleton" style={{ height: 14, width: '80%' }} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className={styles.noData}>
        <div style={{ fontSize: 32 }}>📭</div>
        <p>No research data found for {countryName} — {topicLabel}</p>
        <p className="text-sm text-muted">Research may still be in progress.</p>
      </div>
    );
  }

  const isInsufficient = data.stance_summary.includes('insufficient sourcing');

  return (
    <div className={`${styles.view} animate-fade-in`}>
      {/* Header */}
      <div className={styles.viewHeader}>
        <div>
          <div className={styles.countryLabel}>{countryName}</div>
          <h2 className={styles.topicLabel}>{topicLabel}</h2>
        </div>
        <div className={styles.headerRight}>
          <span className={`badge ${CONFIDENCE_CLASS[data.confidence]}`}>
            {data.confidence === 'Well-sourced' ? '✓' : data.confidence === 'Sparse' ? '⚠' : '✗'} {data.confidence}
          </span>
          <span className="badge badge-gray">{data.sources.length} sources</span>
        </div>
      </div>

      {isInsufficient && (
        <div className="alert alert-danger" style={{ marginBottom: 16 }}>
          ⚠ Insufficient sourcing detected — verify this section manually before citing in committee.
        </div>
      )}

      {/* Stance Summary */}
      <section className={`card ${styles.section}`}>
        <h3 className={styles.sectionTitle}>📌 Stance Summary</h3>
        <p className={styles.prose}>{data.stance_summary}</p>
      </section>

      {/* Stats */}
      {data.stats.length > 0 && (
        <section className={`card ${styles.section}`}>
          <h3 className={styles.sectionTitle}>📊 Key Statistics & Data Points</h3>
          <ul className={styles.bulletList}>
            {data.stats.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </section>
      )}

      {/* Controversies */}
      {data.controversies.length > 0 && (
        <section className={`card ${styles.section}`}>
          <h3 className={styles.sectionTitle}>⚡ Recent Controversies & Developments</h3>
          <ul className={styles.bulletList}>
            {data.controversies.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </section>
      )}

      {/* Questions */}
      {data.questions.length > 0 && (
        <section className={`card ${styles.section}`}>
          <h3 className={styles.sectionTitle}>❓ Sharp Committee Questions</h3>
          <div className={styles.questionList}>
            {data.questions.map((q, i) => (
              <div key={i} className={styles.question}>
                <div className={styles.questionNum}>{i + 1}</div>
                <p>{q}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Allies / Adversaries */}
      <section className={`card ${styles.section}`}>
        <h3 className={styles.sectionTitle}>🤝 Alliances & Tensions</h3>
        <div className={styles.allyGrid}>
          <div>
            <div className={styles.allyLabel}>Allies on this topic</div>
            <div className={styles.tagList}>
              {data.allies.length > 0 ? data.allies.map((a, i) => (
                <span key={i} className="badge badge-green">{a}</span>
              )) : <span className="text-muted text-sm">None identified</span>}
            </div>
          </div>
          <div>
            <div className={styles.allyLabel}>Adversarial positions</div>
            <div className={styles.tagList}>
              {data.adversaries.length > 0 ? data.adversaries.map((a, i) => (
                <span key={i} className="badge badge-red">{a}</span>
              )) : <span className="text-muted text-sm">None identified</span>}
            </div>
          </div>
        </div>
        {data.recent_shifts && (
          <div className={styles.shifts}>
            <div className={styles.allyLabel} style={{ marginBottom: 6 }}>Recent shifts</div>
            <p className={styles.prose}>{data.recent_shifts}</p>
          </div>
        )}
      </section>

      {/* Sources */}
      {data.sources.length > 0 && (
        <section className={`card ${styles.section}`}>
          <button
            className={styles.sourcesToggle}
            onClick={() => setExpandedSources(!expandedSources)}
          >
            <h3 className={styles.sectionTitle} style={{ margin: 0 }}>
              📚 Sources ({data.sources.length})
            </h3>
            <span style={{ color: 'var(--text-muted)' }}>{expandedSources ? '▾' : '▸'}</span>
          </button>
          {expandedSources && (
            <div className={styles.sourceList}>
              {data.sources.map((src, i) => (
                <div key={i} className={styles.source}>
                  <div className={styles.sourceTop}>
                    <a href={src.url} target="_blank" rel="noopener noreferrer" className={styles.sourceTitle}>
                      {src.title || src.url}
                    </a>
                    <span className={`badge ${TIER_CLASS[src.credibility_tier]}`}>{TIER_LABEL[src.credibility_tier]}</span>
                  </div>
                  {src.publication_date && (
                    <div className={styles.sourceMeta}>{src.publication_date}</div>
                  )}
                  {src.extracted_text && (
                    <blockquote className={styles.sourceQuote}>"{src.extracted_text.slice(0, 240)}"</blockquote>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
