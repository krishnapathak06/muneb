'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useWorkspace } from './WorkspaceContext';
import styles from './Sidebar.module.css';

interface SidebarProps {
  onCollapseChange?: (collapsed: boolean) => void;
}

export default function Sidebar({ onCollapseChange }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [countryFilter, setCountryFilter] = useState('');

  const {
    workspaceName,
    workspaceStatus,
    activities,
    expandedActivityId,
    setExpandedActivityId,
    countries,
    selectedCountryId,
    setSelectedCountryId,
    selectedTopicId,
    setSelectedTopicId,
    viewMode,
    setViewMode,
    setTriggerScrollToActivityId,
  } = useWorkspace();

  // Sync state with localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('mun_sidebar_collapsed');
    if (saved === 'true') {
      setIsCollapsed(true);
      onCollapseChange?.(true);
    }
  }, []);

  const toggleCollapse = () => {
    const nextVal = !isCollapsed;
    setIsCollapsed(nextVal);
    localStorage.setItem('mun_sidebar_collapsed', String(nextVal));
    onCollapseChange?.(nextVal);
  };

  // Keyboard shortcut listener: Ctrl+. or Cmd+.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '.') {
        e.preventDefault();
        toggleCollapse();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCollapsed]);

  // Activity click handler (highlights, expands and scrolls)
  const handleActivityClick = (actId: string) => {
    setExpandedActivityId(actId);
    setTriggerScrollToActivityId(actId);
  };

  const isInsideWorkspace = !!workspaceName;

  // Filter countries for selector
  const filteredCountries = countries.filter((c) =>
    c.name.toLowerCase().includes(countryFilter.toLowerCase())
  );

  return (
    <aside className={`${styles.sidebar} ${isCollapsed ? styles.collapsed : ''}`}>
      {/* Logo Area */}
      <div className={styles.logoArea} onClick={() => router.push('/')}>
        <span className={styles.logoIcon}>⚖️</span>
        <div className={styles.logoText}>
          <span className={styles.logoTitle}>MUN Research</span>
          <span className={styles.logoSub}>
            {isInsideWorkspace ? workspaceName : 'Executive Board Suite'}
          </span>
        </div>
      </div>

      {/* Nav Section: Workspaces Home link */}
      <div className={styles.navSection}>
        <button
          type="button"
          className={`${styles.navLink} ${pathname === '/' ? styles.navLinkActive : ''}`}
          onClick={() => router.push('/')}
        >
          <span className={styles.navIcon}>🏛</span>
          <span className={styles.navLabel}>All Workspaces</span>
        </button>
      </div>

      {/* Dynamic workspace context scroll area */}
      {isInsideWorkspace && !isCollapsed && (
        <div className={styles.workspaceScrollArea}>
          
          {/* 1. Dashboard step toggles */}
          {workspaceStatus === 'done' && (
            <div className={styles.sectionGroup}>
              <span className={styles.sectionHeader}>View Explorer</span>
              <button
                type="button"
                className={`${styles.sidebarItem} ${viewMode === 'research' ? styles.sidebarItemActive : ''}`}
                onClick={() => setViewMode('research')}
              >
                <span className={styles.navIcon}>📚</span>
                <span className={styles.itemLabel}>Research Explorer</span>
              </button>
              <button
                type="button"
                className={`${styles.sidebarItem} ${viewMode === 'live' ? styles.sidebarItemActive : ''}`}
                onClick={() => setViewMode('live')}
              >
                <span className={styles.navIcon}>🎙️</span>
                <span className={styles.itemLabel}>Committee Tracker</span>
              </button>
            </div>
          )}

          {/* 2. Research Explorer sub-nav options */}
          {workspaceStatus === 'done' && viewMode === 'research' && (
            <>
              {/* Country selector */}
              <div className={styles.sectionGroup}>
                <span className={styles.sectionHeader}>Select Delegation</span>
                <div className={styles.searchBox}>
                  <input
                    className={styles.searchInput}
                    placeholder="Filter countries..."
                    value={countryFilter}
                    onChange={(e) => setCountryFilter(e.target.value)}
                  />
                </div>
                <div className={styles.scrollList}>
                  {filteredCountries.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`${styles.sidebarItem} ${selectedCountryId === c.id ? styles.sidebarItemActive : ''}`}
                      onClick={() => setSelectedCountryId(c.id)}
                    >
                      <span>🌍</span>
                      <span className={styles.itemLabel}>{c.name}</span>
                    </button>
                  ))}
                  {filteredCountries.length === 0 && (
                    <div style={{ fontSize: 11, paddingLeft: 12, color: 'var(--text-muted)' }}>No matches</div>
                  )}
                </div>
              </div>

              {/* Topic Selector */}
              <div className={styles.sectionGroup}>
                <span className={styles.sectionHeader}>Research Topic</span>
                <div className={styles.scrollList}>
                  <button
                    type="button"
                    className={`${styles.sidebarItem} ${selectedTopicId === 'overview' ? styles.sidebarItemActive : ''}`}
                    onClick={() => setSelectedTopicId('overview')}
                  >
                    <span>🏛️</span>
                    <span className={styles.itemLabel}>Country Overview</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.sidebarItem} ${selectedTopicId === 'main' ? styles.sidebarItemActive : ''}`}
                    onClick={() => setSelectedTopicId('main')}
                  >
                    <span>🌐</span>
                    <span className={styles.itemLabel}>Main Agenda</span>
                  </button>
                  {/* Sub-issues will map directly */}
                </div>
              </div>
            </>
          )}

          {/* 3. Live Tracker session log index */}
          {workspaceStatus === 'done' && viewMode === 'live' && (
            <div className={styles.sectionGroup}>
              <span className={styles.sectionHeader}>Session Activities ({activities.length})</span>
              <div className={styles.scrollList} style={{ maxHeight: 320 }}>
                {activities.map((act) => {
                  let icon = '📄';
                  let label = act.type;
                  let badgeClass = styles.badgeAtt;
                  if (act.type === 'attendance') {
                    icon = '📋';
                    label = `Attendance #${act.attendanceIndex}`;
                    badgeClass = styles.badgeAtt;
                  } else if (act.type === 'gsl') {
                    icon = '🎤';
                    label = 'GSL Speech';
                    badgeClass = styles.badgeGsl;
                  } else if (act.type === 'mod_coc') {
                    icon = '💬';
                    label = act.topic ? `Mod: ${act.topic}` : 'Mod Caucus';
                    badgeClass = styles.badgeMod;
                  } else if (act.type === 'unmod_coc') {
                    icon = '⏱️';
                    label = 'Unmod Caucus';
                    badgeClass = styles.badgeUnmod;
                  }

                  const isActive = expandedActivityId === act.id;

                  return (
                    <button
                      key={act.id}
                      type="button"
                      className={`${styles.sidebarItem} ${isActive ? styles.sidebarItemActive : ''}`}
                      onClick={() => handleActivityClick(act.id)}
                      style={{ padding: '8px 10px', height: 'auto' }}
                    >
                      <span className={styles.navIcon}>{icon}</span>
                      <div className={styles.activityListRow}>
                        <span className={styles.itemLabel} style={{ fontWeight: 600, fontSize: '12px' }}>
                          {label}
                        </span>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 2 }}>
                          <span className={`${styles.activityStatusBadge} ${badgeClass}`}>
                            {act.type}
                          </span>
                          <span style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>
                            {act.status}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
                {activities.length === 0 && (
                  <div style={{ fontSize: 11, paddingLeft: 12, color: 'var(--text-muted)' }}>
                    No activities recorded. Start session to log.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 4. Steps overview if not done yet */}
          {workspaceStatus !== 'done' && (
            <div className={styles.sectionGroup}>
              <span className={styles.sectionHeader}>Workspace Steps</span>
              <div className={styles.scrollList}>
                {['Intake', 'Sub-issues', 'Indicators', 'Researching'].map((step, i) => {
                  const stepNum = i;
                  return (
                    <div
                      key={step}
                      className={styles.sidebarItem}
                      style={{ cursor: 'default', background: 'transparent' }}
                    >
                      <span>{stepNum < (workspaceStatus === 'intake' ? 0 : workspaceStatus === 'sub-issues' ? 1 : workspaceStatus === 'indicators' ? 2 : 3) ? '✓' : '●'}</span>
                      <span className={styles.itemLabel}>{step}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      )}

      {/* Footer / Toggle Area */}
      <div className={styles.footer}>
        <button
          type="button"
          className={styles.collapseButton}
          onClick={toggleCollapse}
          title="Toggle Sidebar (Ctrl + .)"
        >
          <span className={styles.collapsedIcon}>{isCollapsed ? '→' : '←'}</span>
          <span className={styles.navLabel}>Collapse Sidebar</span>
        </button>
        <span className={styles.shortcutTip}>Ctrl + .</span>
      </div>
    </aside>
  );
}
