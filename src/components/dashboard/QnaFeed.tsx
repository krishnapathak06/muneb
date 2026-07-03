'use client';

import { useState, useEffect, useRef } from 'react';
import styles from './QnaFeed.module.css';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  citations?: string[];
  timestamp: string;
}

interface Props { workspaceId: string; }

export default function QnaFeed({ workspaceId }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/qna?workspaceId=${workspaceId}`)
      .then((r) => r.json())
      .then((d) => setMessages(d.messages ?? []));
  }, [workspaceId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    const q = input.trim();
    if (!q || loading) return;
    setInput('');
    setError('');

    const userMsg: Message = {
      role: 'user',
      content: q,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await fetch('/api/qna', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, question: q }),
      });
      const data = await res.json();
      
      if (data.error === 'context_exceeded') {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.message,
            timestamp: new Date().toISOString(),
            isContextError: true,
            estimatedTokens: data.estimatedTokens,
            limit: data.limit
          } as any
        ]);
        return;
      }
      
      if (data.error) throw new Error(data.error);

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.answer,
          citations: data.citations,
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.feed}>
      <div className={styles.feedHeader}>
        <div className={styles.feedTitle}>Q&amp;A Feed</div>
        <div className={styles.feedSub}>Local model · workspace-scoped</div>
      </div>

      <div className={styles.messages}>
        {messages.length === 0 && (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </div>
            <p>Ask anything about the research.</p>
            <p className="text-xs text-muted">Answers draw only from pre-generated research, not the open web.</p>
            <div className={styles.suggestions}>
              {[
                "What's China's position on the main agenda?",
                "Which countries are most likely to oppose the resolution?",
                "Compare the G77 stances on this issue.",
              ].map((s) => (
                <button
                  type="button"
                  key={s}
                  className={styles.suggestion}
                  onClick={() => { setInput(s); }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg: any, i) => {
          if (msg.isContextError) {
            return (
              <div key={i} className={`${styles.message} ${styles.errorMsg} animate-fade-in`}>
                <div className={styles.errorBubble}>
                  <div className={styles.errorTitle}>Context Limit Exceeded</div>
                  <p className={styles.msgText}>{msg.content}</p>
                  <div className={styles.errorMeta}>
                    <span>Estimated: {msg.estimatedTokens?.toLocaleString()} tokens</span>
                    <span>Max limit: {msg.limit?.toLocaleString()} tokens</span>
                  </div>
                  <div className={styles.errorResolution}>
                    Try narrowing your question to fewer countries or sub-issues.
                  </div>
                </div>
              </div>
            );
          }
          return (
            <div
              key={i}
              className={`${styles.message} ${msg.role === 'user' ? styles.userMsg : styles.assistantMsg} animate-fade-in`}
            >
              <div className={styles.msgBubble}>
                <p className={styles.msgText}>{msg.content}</p>
                {msg.citations && msg.citations.length > 0 && (
                  <div className={styles.citations}>
                    {msg.citations.map((c: string, j: number) => (
                      <span key={j} className={`badge badge-blue ${styles.citation}`}>{c}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {loading && (
          <div className={`${styles.message} ${styles.assistantMsg}`}>
            <div className={styles.msgBubble}>
              <div className={styles.thinking}>
                <span className="animate-pulse">●</span>
                <span className="animate-pulse" style={{ animationDelay: '0.2s' }}>●</span>
                <span className="animate-pulse" style={{ animationDelay: '0.4s' }}>●</span>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="alert alert-danger" style={{ margin: '8px 12px' }}>
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className={styles.inputRow}>
        <textarea
          id="qna-input"
          className={`input ${styles.inputBox}`}
          placeholder="Ask about any country, topic, or comparison…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          rows={2}
        />
        <button
          id="btn-send-qna"
          type="button"
          className={`btn btn-primary ${styles.sendBtn}`}
          onClick={handleSend}
          disabled={loading || !input.trim()}
        >
          {loading ? (
            <span className="animate-spin" style={{ display: 'inline-block' }}>⟳</span>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
          )}
        </button>
      </div>
    </div>
  );
}
