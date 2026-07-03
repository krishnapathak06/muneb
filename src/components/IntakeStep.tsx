'use client';

import { useState, useRef } from 'react';
import styles from './IntakeStep.module.css';

interface IntakeResult {
  committee: string;
  agenda: string;
  countries: string[];
  confidence: 'high' | 'medium' | 'low';
  confidenceNotes: string[];
  rawText: string;
}

interface Props {
  workspaceId: string;
  onComplete: (data: { committee: string; agenda: string; countries: string[] }, rawBg: string) => void;
}

export default function IntakeStep({ workspaceId, onComplete }: Props) {
  const [bgFile, setBgFile] = useState<File | null>(null);
  const [portfolioFile, setPortfolioFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<IntakeResult | null>(null);
  const [error, setError] = useState('');

  // Editable fields post-parse
  const [committee, setCommittee] = useState('');
  const [agenda, setAgenda] = useState('');
  const [countries, setCountries] = useState<string[]>([]);
  const [newCountry, setNewCountry] = useState('');

  const bgRef = useRef<HTMLInputElement>(null);
  const portfolioRef = useRef<HTMLInputElement>(null);

  async function handleParse() {
    if (!bgFile || !portfolioFile) return;
    setParsing(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('workspaceId', workspaceId);
      fd.append('backgroundGuide', bgFile);
      fd.append('portfolioMatrix', portfolioFile);

      const res = await fetch('/api/intake', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setResult(data);
      setCommittee(data.committee);
      setAgenda(data.agenda);
      setCountries(data.countries);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setParsing(false);
    }
  }

  function addCountry() {
    const trimmed = newCountry.trim();
    if (trimmed && !countries.includes(trimmed)) {
      setCountries([...countries, trimmed]);
    }
    setNewCountry('');
  }

  function removeCountry(name: string) {
    setCountries(countries.filter((c) => c !== name));
  }

  function handleConfirm() {
    onComplete({ committee, agenda, countries }, result?.rawText ?? '');
  }

  return (
    <div className={styles.container}>
      <div className={styles.stepHeader}>
        <h2 className={styles.title}>Step 1 — Upload Background Guide & Portfolio Matrix</h2>
        <p className={styles.sub}>
          The tool will extract committee name, agenda, and country list. You'll review and correct before proceeding.
        </p>
      </div>

      {!result ? (
        <div className={`card ${styles.uploadCard}`}>
          <div className={styles.uploads}>
            {/* BG Upload */}
            <div
              className={`${styles.dropzone} ${bgFile ? styles.dropzoneReady : ''}`}
              onClick={() => bgRef.current?.click()}
            >
              <input
                ref={bgRef}
                type="file"
                accept=".pdf"
                style={{ display: 'none' }}
                onChange={(e) => setBgFile(e.target.files?.[0] ?? null)}
              />
              <div className={styles.dropIcon}>
                {bgFile ? (
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                ) : (
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                )}
              </div>
              <div className={styles.dropTitle}>Background Guide</div>
              <div className={styles.dropSub}>{bgFile ? bgFile.name : 'Click to upload PDF'}</div>
            </div>

            {/* Portfolio Upload */}
            <div
              className={`${styles.dropzone} ${portfolioFile ? styles.dropzoneReady : ''}`}
              onClick={() => portfolioRef.current?.click()}
            >
              <input
                ref={portfolioRef}
                type="file"
                accept=".pdf,.xlsx,.xls"
                style={{ display: 'none' }}
                onChange={(e) => setPortfolioFile(e.target.files?.[0] ?? null)}
              />
              <div className={styles.dropIcon}>
                {portfolioFile ? (
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                ) : (
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></svg>
                )}
              </div>
              <div className={styles.dropTitle}>Portfolio Matrix</div>
              <div className={styles.dropSub}>{portfolioFile ? portfolioFile.name : 'PDF or Excel (.xlsx)'}</div>
            </div>
          </div>

          {error && <div className="alert alert-danger" style={{ marginTop: 16 }}>{error}</div>}

          <button
            id="btn-parse-files"
            type="button"
            className="btn btn-primary btn-lg"
            style={{ marginTop: 24, width: '100%' }}
            onClick={handleParse}
            disabled={!bgFile || !portfolioFile || parsing}
          >
            {parsing ? (
              <><span className="animate-spin" style={{ display: 'inline-block', marginRight: 8 }}>⟳</span> Parsing documents…</>
            ) : 'Parse Documents'}
          </button>
        </div>
      ) : (
        <div className={styles.reviewContainer}>
          {/* Confidence Banner */}
          {result.confidence !== 'high' && (
            <div className={`alert ${result.confidence === 'low' ? 'alert-danger' : 'alert-warn'}`}>
              <span>⚠</span>
              <div>
                <strong>
                  {result.confidence === 'low' ? 'Low confidence extraction' : 'Medium confidence — please verify'}
                </strong>
                <ul style={{ margin: '8px 0 0', paddingLeft: 16 }}>
                  {result.confidenceNotes.map((note, i) => <li key={i}>{note}</li>)}
                </ul>
              </div>
            </div>
          )}

          <div className={styles.reviewGrid}>
            {/* Committee */}
            <div className="card">
              <label className="label">Committee Name</label>
              <input
                id="review-committee"
                className="input"
                value={committee}
                onChange={(e) => setCommittee(e.target.value)}
                placeholder="e.g. United Nations Office on Drugs and Crime"
              />
            </div>

            {/* Agenda */}
            <div className="card">
              <label className="label">Main Agenda</label>
              <input
                id="review-agenda"
                className="input"
                value={agenda}
                onChange={(e) => setAgenda(e.target.value)}
                placeholder="e.g. Addressing the role of synthetic drugs…"
              />
            </div>
          </div>

          {/* Country List */}
          <div className="card" style={{ marginTop: 16 }}>
            <div className={styles.countryHeader}>
              <label className="label" style={{ margin: 0 }}>
                Country List <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({countries.length} countries)</span>
              </label>
            </div>
            <div className={styles.countryList}>
              {countries.map((c) => (
                <div key={c} className={styles.countryTag}>
                  <span>{c}</span>
                  <button
                    className={styles.countryRemove}
                    onClick={() => removeCountry(c)}
                    aria-label={`Remove ${c}`}
                  >×</button>
                </div>
              ))}
            </div>
            <div className={styles.addCountry}>
              <input
                className="input"
                placeholder="Add country…"
                value={newCountry}
                onChange={(e) => setNewCountry(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addCountry()}
                style={{ flex: 1 }}
              />
              <button type="button" className="btn btn-secondary" onClick={addCountry}>Add</button>
            </div>
          </div>

          <div className={styles.confirmRow}>
            <button type="button" className="btn btn-secondary" onClick={() => setResult(null)}>Re-upload</button>
            <button
              id="btn-confirm-intake"
              type="button"
              className="btn btn-primary"
              onClick={handleConfirm}
              disabled={!committee.trim() || !agenda.trim() || countries.length === 0}
            >
              Confirm & Continue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
