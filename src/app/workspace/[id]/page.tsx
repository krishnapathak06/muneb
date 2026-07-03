'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import IntakeStep from '@/components/IntakeStep';
import SubIssueStep from '@/components/SubIssueStep';
import IndicatorStep from '@/components/IndicatorStep';
import ResearchProgress from '@/components/ResearchProgress';
import Dashboard from '@/components/Dashboard';
import Sidebar from '@/components/Sidebar';
import styles from './workspace.module.css';

interface WorkspaceMeta {
  id: string;
  name: string;
  committee: string;
  agenda: string;
  createdAt: string;
  status: string;
  countries?: string[];
  subIssues?: { id: string; title: string; description: string }[];
}

const STEPS = ['Intake', 'Sub-issues', 'Indicators', 'Research', 'Dashboard'];
const STEP_FOR_STATUS: Record<string, number> = {
  intake: 0,
  'sub-issues': 1,
  indicators: 2,
  researching: 3,
  done: 4,
};

const STATUS_FOR_STEP = ['intake', 'sub-issues', 'indicators', 'researching', 'done'];

export default function WorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [ws, setWs] = useState<WorkspaceMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [bgText, setBgText] = useState('');
  const [intakeData, setIntakeData] = useState<{
    committee: string; agenda: string; countries: string[];
  } | null>(null);

  async function refreshWorkspace() {
    const res = await fetch('/api/workspaces');
    const data = await res.json();
    const found = (data.workspaces ?? []).find((w: WorkspaceMeta) => w.id === id);
    if (found) setWs(found);
    return found;
  }

  useEffect(() => {
    refreshWorkspace().finally(() => setLoading(false));
  }, [id]);

  async function handleJumpToStep(targetIndex: number, stepName: string) {
    if (confirm(`Are you sure you want to go back to the "${stepName}" stage?`)) {
      setLoading(true);
      try {
        const res = await fetch(`/api/workspaces/${id}/advance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: STATUS_FOR_STEP[targetIndex] }),
        });
        if (!res.ok) throw new Error('Failed to update stage');
        await refreshWorkspace();
      } catch (err) {
        alert((err as Error).message);
      } finally {
        setLoading(false);
      }
    }
  }

  if (loading) {
    return (
      <main className={styles.loading}>
        <div className={`animate-spin ${styles.loadingSpinner}`}>⟳</div>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Loading workspace analytics…</span>
      </main>
    );
  }

  if (!ws) {
    return (
      <main className={styles.notFound}>
        <h1>Workspace not found</h1>
        <button type="button" className="btn btn-primary" onClick={() => router.push('/')}>← Back</button>
      </main>
    );
  }

  const currentStep = STEP_FOR_STATUS[ws.status] ?? 0;

  return (
    <div className={styles.workspaceLayout}>
      {/* Collapsible SaaS Sidebar */}
      <Sidebar />

      {/* Main Page Area */}
      <div className={styles.mainWrapper}>
        {/* Header */}
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <div className={styles.headerLeft}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => router.push('/')}
                style={{ padding: '4px 8px' }}
              >
                Workspaces
              </button>
              <span className={styles.breadcrumbDivider}>/</span>
              <div className={styles.wsName}>{ws.name}</div>
            </div>

            {/* Steps Progress Strip */}
            <div className={styles.steps}>
              {STEPS.map((step, i) => {
                const isPrevious = i < currentStep;
                const isActive = i === currentStep;
                return (
                  <div
                    key={step}
                    className={`${styles.step} ${isActive ? styles.stepActive : ''} ${isPrevious ? styles.stepDone : ''}`}
                    style={{ cursor: isPrevious ? 'pointer' : 'default' }}
                    onClick={() => isPrevious && handleJumpToStep(i, step)}
                    title={isPrevious ? `Click to jump back to ${step}` : undefined}
                  >
                    <div className={styles.stepDot}>
                      {isPrevious ? '✓' : i + 1}
                    </div>
                    <span className={styles.stepLabel}>{step}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </header>

        {/* Step Content wrapper */}
        <div className={styles.content}>
          {currentStep === 0 && (
            <IntakeStep
              workspaceId={id}
              onComplete={(data, rawBg) => {
                setIntakeData(data);
                setBgText(rawBg);
                fetch('/api/workspaces/' + id + '/advance', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ status: 'sub-issues', ...data }),
                }).then(() => refreshWorkspace());
              }}
            />
          )}
          {currentStep === 1 && (
            <SubIssueStep
              workspaceId={id}
              committee={ws.committee || intakeData?.committee || ''}
              mainAgenda={ws.agenda || intakeData?.agenda || ''}
              countries={ws.countries || intakeData?.countries || []}
              bgText={bgText}
              onComplete={() => refreshWorkspace()}
            />
          )}
          {currentStep === 2 && (
            <IndicatorStep
              workspaceId={id}
              committee={ws.committee || intakeData?.committee || ''}
              mainAgenda={ws.agenda || intakeData?.agenda || ''}
              countries={ws.countries || intakeData?.countries || []}
              subIssues={ws.subIssues || []}
              onComplete={() => refreshWorkspace()}
            />
          )}
          {currentStep === 3 && (
            <ResearchProgress
              workspaceId={id}
              onComplete={() => refreshWorkspace()}
            />
          )}
          {currentStep === 4 && (
            <Dashboard workspaceId={id} />
          )}
        </div>
      </div>
    </div>
  );
}
