'use client';

import React, { useState, useEffect } from 'react';
import styles from './CountryTopicView.module.css';

type ConfidenceLevel = 'Well-sourced' | 'Sparse' | 'Insufficient';

interface Source {
  url: string;
  title: string;
  publication_date: string;
  extracted_text: string;
  credibility_tier: 1 | 2 | 3;
  verified?: boolean;
  raw_content?: string;
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
  indicator_values?: {
    indicatorId: string;
    value: string | null;
    status: 'found' | 'insufficient_sourcing' | 'not_applicable';
    verified: boolean;
  }[];
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

interface CardConfig {
  id: string;
  title: string;
  width: number;
}

interface BoardColumn {
  id: string;
  cards: CardConfig[];
}

interface BoardRow {
  id: string;
  columns: BoardColumn[];
}

interface BoardLayout {
  rows: BoardRow[];
}

const DEFAULT_LAYOUT: BoardLayout = {
  rows: [
    {
      id: 'row-stance',
      columns: [
        {
          id: 'col-stance',
          cards: [{ id: 'stance', title: '📌 Stance Summary', width: 12 }]
        }
      ]
    },
    {
      id: 'row-indicators',
      columns: [
        {
          id: 'col-indicators',
          cards: [{ id: 'indicators', title: '📊 Topic Indicators', width: 12 }]
        }
      ]
    },
    {
      id: 'row-split-1',
      columns: [
        {
          id: 'col-left-1',
          cards: [{ id: 'stats', title: '📊 Key Statistics & Data Points', width: 6 }]
        },
        {
          id: 'col-right-1',
          cards: [{ id: 'controversies', title: '⚡ Recent Controversies & Developments', width: 6 }]
        }
      ]
    },
    {
      id: 'row-questions',
      columns: [
        {
          id: 'col-questions',
          cards: [{ id: 'questions', title: '❓ Sharp Committee Questions', width: 12 }]
        }
      ]
    },
    {
      id: 'row-alliances',
      columns: [
        {
          id: 'col-alliances',
          cards: [{ id: 'alliances', title: '🤝 Alliances & Tensions', width: 12 }]
        }
      ]
    },
    {
      id: 'row-sources',
      columns: [
        {
          id: 'col-sources',
          cards: [{ id: 'sources', title: '📚 Sources', width: 12 }]
        }
      ]
    }
  ]
};

function isValidLayout(layout: any): layout is BoardLayout {
  if (!layout || !Array.isArray(layout.rows)) return false;
  for (const row of layout.rows) {
    if (!row || !Array.isArray(row.columns)) return false;
    for (const col of row.columns) {
      if (!col || !Array.isArray(col.cards)) return false;
      for (const card of col.cards) {
        if (!card || typeof card.id !== 'string' || typeof card.width !== 'number') return false;
      }
    }
  }
  return true;
}

function partitionIntoRows(visibleCards: any[]) {
  return [visibleCards];
}

export default function CountryTopicView({ workspaceId, countryId, countryName, topicId, topicLabel }: Props) {
  const [data, setData] = useState<TopicData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSources, setExpandedSources] = useState(false);
  const [expandedRaw, setExpandedRaw] = useState<number | null>(null);

  // Indicators state
  const [indicatorsList, setIndicatorsList] = useState<{ id: string; label: string; description: string }[]>([]);
  const [layoutConfig, setLayoutConfig] = useState<{ indicatorId: string; visible: boolean; order: number }[]>([]);
  const [isEditingLayout, setIsEditingLayout] = useState(false);
  const [showNA, setShowNA] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Research Board Kanban Layout state
  const [boardLayout, setBoardLayout] = useState<BoardLayout>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('mun_research_board_layout_v3');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (isValidLayout(parsed)) {
            return parsed;
          }
        } catch {}
      }
    }
    return DEFAULT_LAYOUT;
  });

  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [dragOverCardId, setDragOverCardId] = useState<string | null>(null);
  const [dragOverSpacerRowId, setDragOverSpacerRowId] = useState<string | null>(null);
  const [dragOverLineIndex, setDragOverLineIndex] = useState<number | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);

  const saveBoardLayout = (newLayout: BoardLayout) => {
    setBoardLayout(newLayout);
    localStorage.setItem('mun_research_board_layout_v3', JSON.stringify(newLayout));
  };

  const findCard = (cardId: string) => {
    for (let rIdx = 0; rIdx < boardLayout.rows.length; rIdx++) {
      const row = boardLayout.rows[rIdx];
      for (let cIdx = 0; cIdx < row.columns.length; cIdx++) {
        const col = row.columns[cIdx];
        const cardIdx = col.cards.findIndex((c) => c.id === cardId);
        if (cardIdx >= 0) {
          return { rowIndex: rIdx, columnIndex: cIdx, cardIndex: cardIdx, card: col.cards[cardIdx] };
        }
      }
    }
    return null;
  };

  const handleCardDragStart = (e: React.DragEvent, id: string) => {
    setDraggedCardId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleCardDrop = (e: React.DragEvent, targetCardId: string) => {
    setDragOverCardId(null);
    if (draggedCardId === null || draggedCardId === targetCardId) return;

    const source = findCard(draggedCardId);
    const target = findCard(targetCardId);
    if (!source || !target) return;

    const newRows = boardLayout.rows.map((row) => ({
      ...row,
      columns: row.columns.map((col) => ({
        ...col,
        cards: [...col.cards],
      })),
    }));

    // Remove source card
    const [movedCard] = newRows[source.rowIndex].columns[source.columnIndex].cards.splice(source.cardIndex, 1);

    // Insert target card into target column before target card
    newRows[target.rowIndex].columns[target.columnIndex].cards.splice(target.cardIndex, 0, movedCard);

    // Clean up empty columns/rows
    const cleanedRows = newRows
      .map((row) => ({
        ...row,
        columns: row.columns.filter((col) => col.cards.length > 0),
      }))
      .filter((row) => row.columns.length > 0);

    saveBoardLayout({ rows: cleanedRows });
    setDraggedCardId(null);
  };

  const handleCardDropOnColumn = (e: React.DragEvent, targetRowIndex: number, targetColumnIndex: number) => {
    if (draggedCardId === null) return;
    const source = findCard(draggedCardId);
    if (!source) return;

    // If dropping onto the same column, do nothing
    if (source.rowIndex === targetRowIndex && source.columnIndex === targetColumnIndex) return;

    const newRows = boardLayout.rows.map((row) => ({
      ...row,
      columns: row.columns.map((col) => ({
        ...col,
        cards: [...col.cards],
      })),
    }));

    // Remove source card
    const [movedCard] = newRows[source.rowIndex].columns[source.columnIndex].cards.splice(source.cardIndex, 1);

    // Append to target column
    newRows[targetRowIndex].columns[targetColumnIndex].cards.push(movedCard);

    // Clean up empty columns/rows
    const cleanedRows = newRows
      .map((row) => ({
        ...row,
        columns: row.columns.filter((col) => col.cards.length > 0),
      }))
      .filter((row) => row.columns.length > 0);

    saveBoardLayout({ rows: cleanedRows });
    setDraggedCardId(null);
  };

  const handleCardDropOnSpacer = (e: React.DragEvent, targetRowId: string, remaining: number) => {
    setDragOverSpacerRowId(null);
    if (draggedCardId === null) return;

    const source = findCard(draggedCardId);
    if (!source) return;

    const newRows = boardLayout.rows.map((row) => ({
      ...row,
      columns: row.columns.map((col) => ({
        ...col,
        cards: [...col.cards],
      })),
    }));

    // Remove source card
    const [movedCard] = newRows[source.rowIndex].columns[source.columnIndex].cards.splice(source.cardIndex, 1);

    // Find target row index
    const targetRowIdx = newRows.findIndex((r) => r.id === targetRowId);
    if (targetRowIdx < 0) return;

    // Create new column at the end of the row
    const newCol = {
      id: `col-new-${Date.now()}`,
      cards: [{ ...movedCard, width: remaining }],
    };
    newRows[targetRowIdx].columns.push(newCol);

    // Clean up empty columns/rows
    const cleanedRows = newRows
      .map((row) => ({
        ...row,
        columns: row.columns.filter((col) => col.cards.length > 0),
      }))
      .filter((row) => row.columns.length > 0);

    saveBoardLayout({ rows: cleanedRows });
    setDraggedCardId(null);
  };

  const handleCardDropOnLine = (e: React.DragEvent, targetLineIndex: number) => {
    setDragOverLineIndex(null);
    if (draggedCardId === null) return;

    const source = findCard(draggedCardId);
    if (!source) return;

    const newRows = boardLayout.rows.map((row) => ({
      ...row,
      columns: row.columns.map((col) => ({
        ...col,
        cards: [...col.cards],
      })),
    }));

    // Remove source card
    const [movedCard] = newRows[source.rowIndex].columns[source.columnIndex].cards.splice(source.cardIndex, 1);

    // Create a new row with a column containing the movedCard
    const newRow = {
      id: `row-user-${Date.now()}`,
      columns: [
        {
          id: `col-user-${Date.now()}`,
          cards: [{ ...movedCard, width: 12 }],
        }
      ]
    };

    newRows.splice(targetLineIndex, 0, newRow);

    // Clean up empty columns/rows
    const cleanedRows = newRows
      .map((row) => ({
        ...row,
        columns: row.columns.filter((col) => col.cards.length > 0),
      }))
      .filter((row) => row.columns.length > 0);

    saveBoardLayout({ rows: cleanedRows });
    setDraggedCardId(null);
  };

  const changeCardWidth = (cardId: string, newWidth: number) => {
    const newRows = boardLayout.rows.map((row) => ({
      ...row,
      columns: row.columns.map((col) => ({
        ...col,
        cards: col.cards.map((c) => (c.id === cardId ? { ...c, width: newWidth } : c)),
      })),
    }));
    saveBoardLayout({ rows: newRows });
  };

  useEffect(() => {
    setLoading(true);
    setData(null);
    setExpandedRaw(null);
    setIsEditingLayout(false);

    const topicKey = topicId === 'main' ? 'main' : `subissue_${topicId}`;
    const fileName = topicId === 'main' ? 'main_agenda' : `subissue_${topicId}`;

    // 1. Fetch research data
    fetch(`/api/workspace-data/${workspaceId}/research/${countryId}/${fileName}`)
      .then((r) => r.json())
      .then((d) => {
        if (d && !d.error) setData(d);
      })
      .catch(console.error)
      .finally(() => setLoading(false));

    // 2. Fetch indicators definitions
    fetch(`/api/workspace-data/${workspaceId}/indicators`)
      .then((r) => r.json())
      .then((d) => {
        const list = d ? d[topicKey] || [] : [];
        setIndicatorsList(list);
      })
      .catch(() => setIndicatorsList([]));

    // 3. Fetch layout config
    fetch(`/api/layout?workspaceId=${workspaceId}&topicKey=${topicKey}`)
      .then((r) => r.json())
      .then((d) => {
        setLayoutConfig(d || []);
      })
      .catch(() => setLayoutConfig([]));
  }, [workspaceId, countryId, topicId]);

  // Derived sorted indicators
  const sortedIndicators = [...indicatorsList]
    .map((ind, i) => {
      const layout = layoutConfig.find((l) => l.indicatorId === ind.id) || { visible: true, order: i };
      return { ...ind, visible: layout.visible, order: layout.order };
    })
    .sort((a, b) => a.order - b.order);

  async function saveLayout(updatedLayout: typeof layoutConfig) {
    const topicKey = topicId === 'main' ? 'main' : `subissue_${topicId}`;
    try {
      await fetch('/api/layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          topicKey,
          layout: updatedLayout,
        }),
      });
    } catch (e) {
      console.error('[Layout] Failed to save layout:', e);
    }
  }

  const toggleVisibility = (id: string) => {
    const updated = sortedIndicators.map((ind) =>
      ind.id === id ? { ...ind, visible: !ind.visible } : ind
    );
    const updatedLayout = updated.map((ind, idx) => ({
      indicatorId: ind.id,
      visible: ind.visible,
      order: idx,
    }));
    setLayoutConfig(updatedLayout);
    saveLayout(updatedLayout);
  };

  const shiftOrder = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= sortedIndicators.length) return;

    const newIndicators = [...sortedIndicators];
    [newIndicators[index], newIndicators[targetIndex]] = [newIndicators[targetIndex], newIndicators[index]];

    const updatedLayout = newIndicators.map((ind, idx) => ({
      indicatorId: ind.id,
      visible: ind.visible,
      order: idx,
    }));
    setLayoutConfig(updatedLayout);
    saveLayout(updatedLayout);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    if (draggedIndex === null || draggedIndex === index) return;
    const newIndicators = [...sortedIndicators];
    const [movedItem] = newIndicators.splice(draggedIndex, 1);
    newIndicators.splice(index, 0, movedItem);

    const updatedLayout = newIndicators.map((ind, idx) => ({
      indicatorId: ind.id,
      visible: ind.visible,
      order: idx,
    }));
    setLayoutConfig(updatedLayout);
    saveLayout(updatedLayout);
    setDraggedIndex(null);
  };

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

  // Filter visible cards based on actual data presence and columns structure
  const visibleRows = boardLayout.rows
    .map((row) => {
      const visibleColumns = row.columns
        .map((col) => {
          const visibleCards = col.cards.filter((card) => {
            if (card.id === 'indicators') return sortedIndicators.length > 0;
            if (card.id === 'stats') return data.stats && data.stats.length > 0;
            if (card.id === 'controversies') return data.controversies && data.controversies.length > 0;
            if (card.id === 'questions') return data.questions && data.questions.length > 0;
            return true;
          });
          return {
            ...col,
            cards: visibleCards,
          };
        })
        .filter((col) => col.cards.length > 0);

      return {
        ...row,
        columns: visibleColumns,
      };
    })
    .filter((row) => row.columns.length > 0);

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

      {/* Grid-based Kanban Board container */}
      <div className={styles.boardGrid}>
        {visibleRows.map((row, rowIndex) => {
          const rowSum = row.columns.reduce((sum, col) => {
            const colWidth = col.cards.reduce((max, c) => Math.max(max, c.width || 12), 0);
            return sum + colWidth;
          }, 0);
          const remaining = 12 - rowSum;

          return (
            <React.Fragment key={row.id}>
              {/* Drop Line ABOVE the row */}
              <div
                className={`${styles.rowGapDropLine} ${dragOverLineIndex === rowIndex ? styles.rowGapDropLineActive : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragOverLineIndex !== rowIndex) setDragOverLineIndex(rowIndex);
                }}
                onDragLeave={() => {
                  if (dragOverLineIndex === rowIndex) setDragOverLineIndex(null);
                }}
                onDrop={(e) => {
                  handleCardDropOnLine(e, rowIndex);
                }}
              />

              {/* Row Cards Container */}
              <div className={styles.boardRowContainer}>
                {row.columns.map((col, colIndex) => {
                  const colWidth = col.cards.reduce((max, c) => Math.max(max, c.width || 12), 0);
                  const gridStyle = {
                    gridColumn: `span ${colWidth}`,
                  };

                  return (
                    <div
                      key={col.id}
                      className={`${styles.boardColumn} ${dragOverColumnId === col.id ? styles.columnDragOver : ''}`}
                      style={gridStyle}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (dragOverColumnId !== col.id) setDragOverColumnId(col.id);
                      }}
                      onDragLeave={() => {
                        if (dragOverColumnId === col.id) setDragOverColumnId(null);
                      }}
                      onDrop={(e) => {
                        handleCardDropOnColumn(e, rowIndex, colIndex);
                        setDragOverColumnId(null);
                      }}
                    >
                      {/* Stacked Cards inside this column */}
                      {col.cards.map((card) => {
                        const cardStyle = {
                          width: `${(card.width / colWidth) * 100}%`,
                        };

                        return (
                          <div
                            key={card.id}
                            className={`${styles.boardCard} ${draggedCardId === card.id ? styles.cardDragging : ''} ${dragOverCardId === card.id ? styles.cardDragOver : ''}`}
                            style={cardStyle}
                            onDragOver={(e) => {
                              e.preventDefault();
                              if (dragOverCardId !== card.id) setDragOverCardId(card.id);
                            }}
                            onDragLeave={() => {
                              if (dragOverCardId === card.id) setDragOverCardId(null);
                            }}
                            onDrop={(e) => {
                              handleCardDrop(e, card.id);
                              setDragOverCardId(null);
                            }}
                          >
                            {/* Card Header (Draggable trigger only) */}
                            <div
                              className={styles.cardHeader}
                              draggable
                              onDragStart={(e) => handleCardDragStart(e, card.id)}
                            >
                              <h3 className={styles.cardTitle}>{card.title}</h3>
                              <div className={styles.cardControls}>
                                <div className={styles.widthBtnGroup}>
                                  {([3, 4, 6, 8, 12] as const).map((w) => {
                                    const label = w === 3 ? '25%' : w === 4 ? '33%' : w === 6 ? '50%' : w === 8 ? '66%' : '100%';
                                    return (
                                      <button
                                        key={w}
                                        type="button"
                                        className={`${styles.widthBtn} ${card.width === w ? styles.widthBtnActive : ''}`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          changeCardWidth(card.id, w);
                                        }}
                                        title={`Set card width to ${label}`}
                                      >
                                        {label}
                                      </button>
                                    );
                                  })}
                                </div>
                                <span className={styles.cardDragHandle} title="Drag header to reorder">☰</span>
                              </div>
                            </div>

                            {/* Card Body */}
                            <div className={styles.cardBody}>
                              {card.id === 'stance' && (
                                <p className={styles.prose}>{data.stance_summary}</p>
                              )}

                              {card.id === 'indicators' && (
                                <div className={styles.indicatorsWrapper}>
                                  <div className={styles.indicatorsHeader} style={{ padding: '0 0 12px 0', borderBottom: '1px solid var(--border-subtle)', marginBottom: 12 }}>
                                    <div className={styles.indicatorControls}>
                                      <button
                                        className={`btn btn-ghost btn-sm ${isEditingLayout ? 'text-primary' : ''}`}
                                        style={{ fontSize: 12, padding: '4px 8px' }}
                                        onClick={() => setIsEditingLayout(!isEditingLayout)}
                                      >
                                        ⚙️ {isEditingLayout ? 'Exit Layout Edit' : 'Edit Layout'}
                                      </button>
                                      <label className={styles.checkboxLabel} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <input
                                          type="checkbox"
                                          checked={showNA}
                                          onChange={(e) => setShowNA(e.target.checked)}
                                        />
                                        Show N/A Indicators
                                      </label>
                                    </div>
                                  </div>

                                  <div className={styles.indicatorsGrid}>
                                    {sortedIndicators.map((ind, idx) => {
                                      const val = (data?.indicator_values || []).find((v: any) => v.indicatorId === ind.id) || {
                                        value: null,
                                        status: 'insufficient_sourcing' as const,
                                        verified: false,
                                      };

                                      if (!ind.visible && !isEditingLayout) return null;

                                      const isNA = val.status === 'not_applicable';
                                      if (isNA && !showNA && !isEditingLayout) return null;

                                      let cardClass = styles.indicatorCard;
                                      let statusLabel = 'Found';
                                      if (val.status === 'insufficient_sourcing') {
                                        cardClass = `${styles.indicatorCard} ${styles.indicatorCardSourcing}`;
                                        statusLabel = 'No verified data';
                                      } else if (isNA) {
                                        cardClass = `${styles.indicatorCard} ${styles.indicatorCardNA}`;
                                        statusLabel = 'Not Applicable';
                                      }

                                      if (isEditingLayout && !ind.visible) {
                                        cardClass = `${cardClass} ${styles.indicatorCardHidden}`;
                                      }

                                      return (
                                        <div
                                          key={ind.id}
                                          className={cardClass}
                                          draggable={isEditingLayout}
                                          onDragStart={(e) => handleDragStart(e, idx)}
                                          onDragOver={(e) => e.preventDefault()}
                                          onDrop={(e) => handleDrop(e, idx)}
                                        >
                                          <div className={styles.indicatorTop}>
                                            <div className={styles.indicatorLabel} title={ind.description}>
                                              {ind.label}
                                              <span className={styles.infoIcon} title={ind.description}>ⓘ</span>
                                            </div>

                                            {isEditingLayout && (
                                              <div className={styles.layoutControls}>
                                                <input
                                                  type="checkbox"
                                                  checked={ind.visible}
                                                  title="Toggle Visibility"
                                                  onChange={() => toggleVisibility(ind.id)}
                                                />
                                                <button
                                                  className={styles.shiftBtn}
                                                  disabled={idx === 0}
                                                  title="Move Up"
                                                  onClick={() => shiftOrder(idx, -1)}
                                                >
                                                  ▲
                                                </button>
                                                <button
                                                  className={styles.shiftBtn}
                                                  disabled={idx === sortedIndicators.length - 1}
                                                  title="Move Down"
                                                  onClick={() => shiftOrder(idx, 1)}
                                                >
                                                  ▼
                                                </button>
                                                <span className={styles.dragHandle} title="Drag to reorder">☰</span>
                                              </div>
                                            )}
                                          </div>

                                          <div className={styles.indicatorValue}>
                                            {val.status === 'found' ? (
                                              <span className={styles.valueText}>{val.value}</span>
                                            ) : (
                                              <span className={styles.mutedText}>{statusLabel}</span>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {card.id === 'stats' && (
                                <ul className={styles.bulletList}>
                                  {data.stats.map((s, i) => <li key={i}>{s}</li>)}
                                </ul>
                              )}

                              {card.id === 'controversies' && (
                                <ul className={styles.bulletList}>
                                  {data.controversies.map((c, i) => <li key={i}>{c}</li>)}
                                </ul>
                              )}

                              {card.id === 'questions' && (
                                <div className={styles.questionList}>
                                  {data.questions.map((q, i) => (
                                    <div key={i} className={styles.question}>
                                      <div className={styles.questionNum}>{i + 1}</div>
                                      <p>{q}</p>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {card.id === 'alliances' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
                                    <div className={styles.shifts} style={{ marginTop: 12 }}>
                                      <div className={styles.allyLabel} style={{ marginBottom: 6 }}>Recent shifts</div>
                                      <p className={styles.prose}>{data.recent_shifts}</p>
                                    </div>
                                  )}
                                </div>
                              )}

                              {card.id === 'sources' && (
                                <div className={styles.sourcesWrapper}>
                                  <button
                                    className={styles.sourcesToggle}
                                    onClick={() => setExpandedSources(!expandedSources)}
                                    style={{ borderBottom: expandedSources ? '1px solid var(--border-subtle)' : 'none', paddingBottom: expandedSources ? 8 : 0 }}
                                  >
                                    <h4 className={styles.allyLabel} style={{ margin: 0 }}>
                                      📚 Grounding Sources ({data.sources.length})
                                    </h4>
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
                                            {src.verified !== undefined && (
                                              <span className={`badge ${src.verified ? 'badge-green' : 'badge-yellow'}`}>
                                                {src.verified ? '✓ Verified' : '⚠ Unverified'}
                                              </span>
                                            )}
                                            <span className={`badge ${TIER_CLASS[src.credibility_tier]}`}>{TIER_LABEL[src.credibility_tier]}</span>
                                          </div>
                                          {src.publication_date && (
                                            <div className={styles.sourceMeta}>{src.publication_date}</div>
                                          )}
                                          {src.extracted_text && (
                                            <blockquote className={styles.sourceQuote}>"{src.extracted_text.slice(0, 240)}"</blockquote>
                                          )}
                                          {src.raw_content && (
                                            <div style={{ marginTop: '6px' }}>
                                              <button
                                                className="btn btn-ghost btn-sm"
                                                style={{ padding: '2px 8px', fontSize: '10px', height: 'auto', minHeight: 'unset' }}
                                                onClick={() => setExpandedRaw(expandedRaw === i ? null : i)}
                                              >
                                                {expandedRaw === i ? 'Hide Full Text' : 'View Full Text'}
                                              </button>
                                              {expandedRaw === i && (
                                                <pre className={styles.rawContentPre}>{src.raw_content}</pre>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}

                {/* Spacer Drop Zone if row is not full */}
                {remaining > 0 && (
                  <div
                    className={`${styles.rowSpacerDropZone} ${dragOverSpacerRowId === row.id ? styles.rowSpacerDropZoneActive : ''}`}
                    style={{ gridColumn: `span ${remaining}` }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (dragOverSpacerRowId !== row.id) setDragOverSpacerRowId(row.id);
                    }}
                    onDragLeave={() => {
                      if (dragOverSpacerRowId === row.id) setDragOverSpacerRowId(null);
                    }}
                    onDrop={(e) => {
                      handleCardDropOnSpacer(e, row.id, remaining);
                    }}
                  />
                )}
              </div>

              {/* Drop Line BELOW the last row */}
              {rowIndex === visibleRows.length - 1 && (
                <div
                  className={`${styles.rowSpacerDropZone} ${dragOverLineIndex === rowIndex + 1 ? styles.rowSpacerDropZoneActive : ''} ${styles.rowGapDropLine}`}
                  style={{ gridColumn: 'span 12', height: 16 }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragOverLineIndex !== rowIndex + 1) setDragOverLineIndex(rowIndex + 1);
                  }}
                  onDragLeave={() => {
                    if (dragOverLineIndex === rowIndex + 1) setDragOverLineIndex(null);
                  }}
                  onDrop={(e) => {
                    handleCardDropOnLine(e, rowIndex + 1);
                  }}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
