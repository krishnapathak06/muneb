'use client';

import { useState, useEffect } from 'react';
import CountryTopicView from './dashboard/CountryTopicView';
import CountryOverviewView from './dashboard/CountryOverviewView';
import QnaFeed from './dashboard/QnaFeed';
import LiveTracker from './LiveTracker';
import styles from './Dashboard.module.css';

interface SubIssue { id: string; title: string; }
interface Country { id: string; name: string; }

interface Props { workspaceId: string; }

export default function Dashboard({ workspaceId }: Props) {
  const [countries, setCountries] = useState<Country[]>([]);
  const [subIssues, setSubIssues] = useState<SubIssue[]>([]);
  const [mainAgenda, setMainAgenda] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<string>('overview');
  const [countrySearch, setCountrySearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'research' | 'live'>('research');
  const [isChatOpen, setIsChatOpen] = useState(false);

  useEffect(() => {
    loadWorkspaceData();
  }, [workspaceId]);

  async function loadWorkspaceData() {
    try {
      const [countriesRes, agendaRes] = await Promise.all([
        fetch(`/api/workspace-data/${workspaceId}/countries`),
        fetch(`/api/workspace-data/${workspaceId}/agenda`),
      ]);
      const countriesData: { id: string; name: string }[] = await countriesRes.json();
      const agendaData: { main_agenda: string; sub_issues: { id: string; title: string }[] } =
        await agendaRes.json();

      const countryList = Array.isArray(countriesData) ? countriesData : [];
      setCountries(countryList);
      setSubIssues(agendaData?.sub_issues ?? []);
      setMainAgenda(agendaData?.main_agenda ?? '');
      if (countryList.length > 0) {
        setSelectedCountry(countryList[0]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const filteredCountries = countries.filter((c) =>
    c.name.toLowerCase().includes(countrySearch.toLowerCase())
  );

  const topics = [
    { id: 'overview', label: 'Country Overview' },
    { id: 'main', label: 'Main Agenda' },
    ...subIssues.map((si) => ({ id: si.id, label: si.title })),
  ];

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className="animate-spin" style={{ fontSize: 20 }}>⟳</div>
        <span>Loading dashboard analytics…</span>
      </div>
    );
  }

  return (
    <div className={styles.dashboard}>
      {/* View Mode Toggle */}
      <div className={styles.viewModeToggle}>
        <div className="tabs">
          <button
            type="button"
            id="tab-view-research"
            className={`tab ${viewMode === 'research' ? 'active' : ''}`}
            onClick={() => setViewMode('research')}
          >
            Research Explorer
          </button>
          <button
            type="button"
            id="tab-view-live"
            className={`tab ${viewMode === 'live' ? 'active' : ''}`}
            onClick={() => setViewMode('live')}
          >
            Live Committee Tracker
          </button>
        </div>
      </div>

      {viewMode === 'live' ? (
        <LiveTracker workspaceId={workspaceId} countries={countries} />
      ) : (
        <>
          {/* Combined Top Bar */}
          <div className={styles.topBar}>
            {/* Country Selector group */}
            <div className={styles.countryGroup}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              <div className={styles.countrySelector}>
                <input
                  className="input"
                  placeholder="Search countries…"
                  value={countrySearch}
                  onChange={(e) => setCountrySearch(e.target.value)}
                  style={{ width: 180, height: 32, fontSize: 13 }}
                />
                {countrySearch && (
                  <div className={styles.dropdown}>
                    {filteredCountries.slice(0, 12).map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        className={styles.dropdownItem}
                        onClick={() => {
                          setSelectedCountry(c);
                          setCountrySearch('');
                        }}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedCountry && !countrySearch && (
                <div className={styles.selectedCountry}>
                  <span>{selectedCountry.name}</span>
                  <button type="button" className={styles.clearCountry} onClick={() => { setSelectedCountry(null); setCountrySearch(''); }}>×</button>
                </div>
              )}
            </div>

            {/* Vertical Divider line */}
            <div className={styles.divider} />

            {/* Topic Selector Pills group */}
            <div className={styles.topicGroup}>
              {topics.map((t) => (
                <button
                  type="button"
                  key={t.id}
                  id={`tab-${t.id}`}
                  className={`${styles.topicPill} ${selectedTopic === t.id ? styles.topicPillActive : ''}`}
                  onClick={() => setSelectedTopic(t.id)}
                >
                  {t.id === 'overview' && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6 }}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                  )}
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.body}>
            {/* Main research view */}
            <div className={styles.mainPanel}>
              {selectedCountry ? (
                selectedTopic === 'overview' ? (
                  <CountryOverviewView
                    workspaceId={workspaceId}
                    countryId={selectedCountry.id}
                    countryName={selectedCountry.name}
                  />
                ) : (
                  <CountryTopicView
                    workspaceId={workspaceId}
                    countryId={selectedCountry.id}
                    countryName={selectedCountry.name}
                    topicId={selectedTopic}
                    topicLabel={topics.find((t) => t.id === selectedTopic)?.label ?? ''}
                  />
                )
              ) : (
                <div className={styles.noSelection}>
                  <div style={{ fontSize: 32, color: 'var(--text-muted)' }}>
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                  </div>
                  <h3>Select a Country to View Research</h3>
                  <p>Choose a country from the dropdown selection above to display detailed analysis.</p>
                </div>
              )}
            </div>

            {/* Floating Q&A Dialogue popup */}
            {isChatOpen && (
              <div className={styles.chatPopup}>
                <div className={styles.chatHeader}>
                  <span>💬 Q&A Dialogue</span>
                  <button type="button" className={styles.chatCloseBtn} onClick={() => setIsChatOpen(false)}>×</button>
                </div>
                <div className={styles.chatPopupBody}>
                  <QnaFeed workspaceId={workspaceId} />
                </div>
              </div>
            )}

            {/* Floating pop-up launcher button */}
            <button type="button" className={styles.chatToggleBtn} onClick={() => setIsChatOpen(!isChatOpen)}>
              {isChatOpen ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
