'use client';

import { useState, useEffect } from 'react';
import styles from './CountryOverviewView.module.css';

interface Source {
  url: string;
  title: string;
  publication_date: string;
  extracted_text: string;
  credibility_tier: 1 | 2 | 3;
  verified: boolean;
}

interface OverviewData {
  timeline: { date: string; event: string; significance: string; verified: boolean }[];
  key_conflicts: { title: string; description: string; status: string; relevance: string; sources: string[]; verified?: boolean }[];
  recent_shifts: { title: string; description: string; date: string; implications: string; sources: string[]; verified?: boolean }[];
  allies: { country: string; relationship_note: string; sources: string[]; verified?: boolean }[];
  adversaries: { country: string; relationship_note: string; sources: string[]; verified?: boolean }[];
  government_type: string;
  economic_profile: string;
  international_memberships: string[];
  sources: Source[];
}

interface Props {
  workspaceId: string;
  countryId: string;
  countryName: string;
}

export default function CountryOverviewView({ workspaceId, countryId, countryName }: Props) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedConflict, setExpandedConflict] = useState<number | null>(null);
  const [expandedShift, setExpandedShift] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    setData(null);
    setExpandedConflict(null);
    setExpandedShift(null);

    fetch(`/api/workspace-data/${workspaceId}/research/${countryId}/overview`)
      .then((r) => r.json())
      .then((d) => {
        if (d && !d.error) setData(d);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [workspaceId, countryId]);

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className="skeleton" style={{ height: 24, width: '40%', marginBottom: 16 }} />
        <div className="skeleton" style={{ height: 100, width: '100%', marginBottom: 16 }} />
        <div className="skeleton" style={{ height: 200, width: '100%' }} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className={styles.noData}>
        <div style={{ fontSize: 32 }}>📭</div>
        <p>No overview profile generated yet for {countryName}.</p>
        <p className="text-sm text-muted">Overview data is created during the workspace research phase.</p>
      </div>
    );
  }

  return (
    <div className={`${styles.view} animate-fade-in`}>
      {/* Header Profile Summary */}
      <div className={styles.summaryCard}>
        <h3 className={styles.sectionTitle}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6 }}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          General Country Profile
        </h3>
        <div className={styles.profileGrid}>
          <div className={styles.profileItem}>
            <span className={styles.profileLabel}>Government Type</span>
            <span className={styles.profileValue}>{data.government_type}</span>
          </div>
          <div className={styles.profileItem}>
            <span className={styles.profileLabel}>Economic Profile</span>
            <span className={styles.profileValue}>{data.economic_profile}</span>
          </div>
          <div className={styles.profileItem} style={{ gridColumn: 'span 2' }}>
            <span className={styles.profileLabel}>International Memberships</span>
            <div className={styles.membershipsList}>
              {data.international_memberships && data.international_memberships.length > 0 ? (
                data.international_memberships.map((m, i) => (
                  <span key={i} className="badge badge-gray">{m}</span>
                ))
              ) : (
                <span className="text-muted text-sm">None listed</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Timeline Section */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6 }}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          Key Timeline of Crucial Events
        </h3>
        {data.timeline && data.timeline.length > 0 ? (
          <div className={styles.timeline}>
            {data.timeline.map((item, i) => (
              <div key={i} className={styles.timelineItem}>
                <div className={styles.timelineMarker} />
                <div className={styles.timelineContent}>
                  <div className={styles.timelineHeader}>
                    <span className={styles.timelineDate}>{item.date}</span>
                    {item.verified && <span className="badge badge-green" style={{ fontSize: 9, padding: '1px 4px' }}>Grounded</span>}
                  </div>
                  <div className={styles.timelineEvent}>{item.event}</div>
                  <div className={styles.timelineSig}>
                    <strong>Significance:</strong> {item.significance}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-muted text-sm">No timeline events recorded.</div>
        )}
      </div>

      {/* Conflicts & Shifts Grid */}
      <div className={styles.splitGrid}>
        {/* Conflicts */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6 }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            Long-Standing Conflicts
          </h3>
          <div className={styles.accordionList}>
            {data.key_conflicts && data.key_conflicts.length > 0 ? (
              data.key_conflicts.map((c, i) => {
                const isExpanded = expandedConflict === i;
                return (
                  <div key={i} className={styles.accordionItem}>
                    <button
                      type="button"
                      className={styles.accordionHeader}
                      onClick={() => setExpandedConflict(isExpanded ? null : i)}
                    >
                      <span className={styles.accordionHeaderTitle}>
                        {c.title}
                        {c.verified && <span className="badge badge-green" style={{ fontSize: 9, padding: '1px 4px', marginLeft: 6 }}>Grounded</span>}
                      </span>
                      <span>{isExpanded ? '▲' : '▼'}</span>
                    </button>
                    {isExpanded && (
                      <div className={styles.accordionBody}>
                        <p className={styles.prose}><strong>Description:</strong> {c.description}</p>
                        <p className={styles.prose}><strong>Status:</strong> {c.status}</p>
                        <p className={styles.prose}><strong>MUN Relevance:</strong> {c.relevance}</p>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="text-muted text-sm">No conflicts identified.</div>
            )}
          </div>
        </div>

        {/* Geopolitical Shifts */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6 }}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            Recent Geopolitical Shifts
          </h3>
          <div className={styles.accordionList}>
            {data.recent_shifts && data.recent_shifts.length > 0 ? (
              data.recent_shifts.map((s, i) => {
                const isExpanded = expandedShift === i;
                return (
                  <div key={i} className={styles.accordionItem}>
                    <button
                      type="button"
                      className={styles.accordionHeader}
                      onClick={() => setExpandedShift(isExpanded ? null : i)}
                    >
                      <span className={styles.accordionHeaderTitle}>
                        {s.title}
                        {s.verified && <span className="badge badge-green" style={{ fontSize: 9, padding: '1px 4px', marginLeft: 6 }}>Grounded</span>}
                      </span>
                      <span className={styles.shiftDate}>{s.date} {isExpanded ? '▲' : '▼'}</span>
                    </button>
                    {isExpanded && (
                      <div className={styles.accordionBody}>
                        <p className={styles.prose}><strong>Description:</strong> {s.description}</p>
                        <p className={styles.prose}><strong>Implications:</strong> {s.implications}</p>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="text-muted text-sm">No recent shifts identified.</div>
            )}
          </div>
        </div>
      </div>

      {/* Allies / Adversaries Columns */}
      <div className={styles.splitGrid}>
        {/* Allies */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6 }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            Alliances & Key Allies
          </h3>
          <div className={styles.relList}>
            {data.allies && data.allies.length > 0 ? (
              data.allies.map((rel, i) => (
                <div key={i} className={styles.relCard}>
                  <div className={styles.relHeader}>
                    <span className={styles.relCountry}>{rel.country}</span>
                    {rel.verified && <span className="badge badge-green" style={{ fontSize: 9, padding: '1px 4px' }}>Grounded</span>}
                  </div>
                  <p className={styles.relNote}>{rel.relationship_note}</p>
                </div>
              ))
            ) : (
              <div className="text-muted text-sm">No allies specified.</div>
            )}
          </div>
        </div>

        {/* Adversaries */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6 }}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            Tensions & Adversaries
          </h3>
          <div className={styles.relList}>
            {data.adversaries && data.adversaries.length > 0 ? (
              data.adversaries.map((rel, i) => (
                <div key={i} className={styles.relCard}>
                  <div className={styles.relHeader}>
                    <span className={styles.relCountry}>{rel.country}</span>
                    {rel.verified && <span className="badge badge-green" style={{ fontSize: 9, padding: '1px 4px' }}>Grounded</span>}
                  </div>
                  <p className={styles.relNote}>{rel.relationship_note}</p>
                </div>
              ))
            ) : (
              <div className="text-muted text-sm">No adversaries specified.</div>
            )}
          </div>
        </div>
      </div>

      {/* Sources list */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6 }}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
          Grounded Overview Sources
        </h3>
        <div className={styles.sourcesGrid}>
          {data.sources && data.sources.length > 0 ? (
            data.sources.map((src, i) => (
              <div key={i} className={styles.sourceCard}>
                <div className={styles.sourceHeader}>
                  <span className={`badge ${src.verified ? 'badge-green' : 'badge-yellow'}`}>
                    {src.verified ? 'Verified' : 'Unverified'}
                  </span>
                  <span className="text-xs text-muted">Tier {src.credibility_tier || 3}</span>
                </div>
                <a href={src.url} target="_blank" rel="noopener noreferrer" className={styles.sourceTitle}>
                  {src.title || src.url}
                </a>
                {src.extracted_text && <p className={styles.sourceExtract}>"{src.extracted_text}"</p>}
              </div>
            ))
          ) : (
            <div className="text-muted text-sm">No sources cited for this country overview.</div>
          )}
        </div>
      </div>
    </div>
  );
}
