'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

interface WorkspaceMeta {
  id: string;
  name: string;
  committee: string;
  agenda: string;
  createdAt: string;
  status: string;
}

const STATUS_LABELS: Record<string, string> = {
  intake: 'Intake',
  'sub-issues': 'Sub-issues Review',
  researching: 'Researching…',
  done: 'Ready',
};

const STATUS_CLASSES: Record<string, string> = {
  intake: 'badge-gray',
  'sub-issues': 'badge-yellow',
  researching: 'badge-blue',
  done: 'badge-green',
};

export default function HomePage() {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<WorkspaceMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    fetch('/api/workspaces')
      .then((r) => r.json())
      .then((d) => setWorkspaces(d.workspaces ?? []))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    const res = await fetch('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() }),
    });
    const data = await res.json();
    if (data.workspace) {
      router.push(`/workspace/${data.workspace.id}`);
    }
    setCreating(false);
  }

  return (
    <main className={styles.main}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.logo}>
            <span className={styles.logoIcon}>⚖️</span>
            <div>
              <div className={styles.logoTitle}>MUN Research Tool</div>
              <div className={styles.logoSub}>Executive Board Intelligence Platform</div>
            </div>
          </div>
          <button
            id="btn-new-workspace"
            className="btn btn-primary"
            onClick={() => setShowNew(true)}
          >
            + New Workspace
          </button>
        </div>
      </header>

      <div className={styles.content}>
        {/* Hero */}
        <div className={styles.hero}>
          <h1 className={styles.heroTitle}>Your Research Workspaces</h1>
          <p className={styles.heroSub}>
            Each workspace is one committee + agenda + portfolio matrix. Upload a Background Guide to start.
          </p>
        </div>

        {/* New Workspace Modal */}
        {showNew && (
          <div className={styles.modalOverlay} onClick={() => setShowNew(false)}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
              <h2 className={styles.modalTitle}>New Workspace</h2>
              <p className={styles.modalSub}>Give this workspace a descriptive name — e.g. "UNODC — VSEC MUN 26"</p>
              <div className="form-group" style={{ marginTop: 20 }}>
                <label className="label" htmlFor="workspace-name">Workspace Name</label>
                <input
                  id="workspace-name"
                  className="input"
                  type="text"
                  placeholder="Committee — Conference Year"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  autoFocus
                />
              </div>
              <div className={styles.modalActions}>
                <button className="btn btn-secondary" onClick={() => setShowNew(false)}>Cancel</button>
                <button
                  id="btn-create-confirm"
                  className="btn btn-primary"
                  onClick={handleCreate}
                  disabled={creating || !newName.trim()}
                >
                  {creating ? 'Creating…' : 'Create Workspace'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Workspace List */}
        {loading ? (
          <div className={styles.grid}>
            {[1, 2, 3].map((i) => (
              <div key={i} className={`card ${styles.workspaceCardSkeleton}`}>
                <div className="skeleton" style={{ height: 18, width: '60%', marginBottom: 10 }} />
                <div className="skeleton" style={{ height: 13, width: '80%', marginBottom: 8 }} />
                <div className="skeleton" style={{ height: 13, width: '40%' }} />
              </div>
            ))}
          </div>
        ) : workspaces.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>📂</div>
            <h3>No workspaces yet</h3>
            <p>Create your first workspace to get started</p>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowNew(true)}>
              + New Workspace
            </button>
          </div>
        ) : (
          <div className={styles.grid}>
            {workspaces.map((ws, i) => (
              <button
                key={ws.id}
                id={`workspace-${ws.id}`}
                className={`card card--glow ${styles.workspaceCard} animate-fade-in`}
                style={{ animationDelay: `${i * 50}ms` }}
                onClick={() => router.push(`/workspace/${ws.id}`)}
              >
                <div className={styles.cardTop}>
                  <h3 className={styles.cardName}>{ws.name}</h3>
                  <span className={`badge ${STATUS_CLASSES[ws.status] ?? 'badge-gray'}`}>
                    {STATUS_LABELS[ws.status] ?? ws.status}
                  </span>
                </div>
                {ws.committee && (
                  <div className={styles.cardMeta}>{ws.committee}</div>
                )}
                {ws.agenda && (
                  <div className={styles.cardAgenda}>"{ws.agenda}"</div>
                )}
                <div className={styles.cardDate}>
                  {new Date(ws.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
