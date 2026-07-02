'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import IntakeStep from '@/components/IntakeStep';
import SubIssueStep from '@/components/SubIssueStep';
import ResearchProgress from '@/components/ResearchProgress';
import Dashboard from '@/components/Dashboard';
import styles from './workspace.module.css';

interface WorkspaceMeta {
  id: string;
  name: string;
  committee: string;
  agenda: string;
  createdAt: string;
  status: string;
}

const STEPS = ['Intake', 'Sub-issues', 'Research', 'Dashboard'];
const STEP_FOR_STATUS: Record<string, number> = {
  intake: 0,
  'sub-issues': 1,
  researching: 2,
  done: 3,
};

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

  if (loading) {
    return (
      <main className={styles.loading}>
        <div className="animate-spin" style={{ fontSize: 24 }}>⟳</div>
      </main>
    );
  }

  if (!ws) {
    return (
      <main className={styles.notFound}>
        <h1>Workspace not found</h1>
        <button className="btn btn-primary" onClick={() => router.push('/')}>← Back</button>
      </main>
    );
  }

  const currentStep = STEP_FOR_STATUS[ws.status] ?? 0;

  return (
    <main className={styles.main}>
      {/* Top bar */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.headerLeft}>
            <button className="btn btn-ghost btn-sm" onClick={() => router.push('/')}>← Workspaces</button>
            <div className={styles.wsName}>{ws.name}</div>
          </div>
          {/* Step progress */}
          <div className={styles.steps}>
            {STEPS.map((step, i) => (
              <div
                key={step}
                className={`${styles.step} ${i === currentStep ? styles.stepActive : ''} ${i < currentStep ? styles.stepDone : ''}`}
              >
                <div className={styles.stepDot}>
                  {i < currentStep ? '✓' : i + 1}
                </div>
                <span className={styles.stepLabel}>{step}</span>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* Step content */}
      <div className={styles.content}>
        {currentStep === 0 && (
          <IntakeStep
            workspaceId={id}
            onComplete={(data, rawBg) => {
              setIntakeData(data);
              setBgText(rawBg);
              // Move to sub-issues step by updating workspace status
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
            countries={intakeData?.countries ?? []}
            bgText={bgText}
            onComplete={() => refreshWorkspace()}
          />
        )}
        {currentStep === 2 && (
          <ResearchProgress
            workspaceId={id}
            onComplete={() => refreshWorkspace()}
          />
        )}
        {currentStep === 3 && (
          <Dashboard workspaceId={id} />
        )}
      </div>
    </main>
  );
}
