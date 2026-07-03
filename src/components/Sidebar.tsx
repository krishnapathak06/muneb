'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import styles from './Sidebar.module.css';

interface SidebarProps {
  onCollapseChange?: (collapsed: boolean) => void;
}

export default function Sidebar({ onCollapseChange }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);

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

  // Determine active states
  const isWorkspacesActive = pathname === '/' || pathname.startsWith('/workspace');

  return (
    <aside className={`${styles.sidebar} ${isCollapsed ? styles.collapsed : ''}`}>
      {/* Logo Section */}
      <div className={styles.logoArea}>
        <span className={styles.logoIcon}>⚖️</span>
        <div className={styles.logoText}>
          <span className={styles.logoTitle}>MUN Research</span>
          <span className={styles.logoSub}>Executive Board Suite</span>
        </div>
      </div>

      {/* Nav Section */}
      <nav className={styles.navSection}>
        <button
          type="button"
          className={`${styles.navLink} ${isWorkspacesActive ? styles.navLinkActive : ''}`}
          onClick={() => router.push('/')}
        >
          <span className={styles.navIcon}>🏛</span>
          <span className={styles.navLabel}>Workspaces</span>
        </button>
      </nav>

      {/* Footer / Toggle Section */}
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
