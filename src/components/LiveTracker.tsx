'use client';

import { useState, useEffect, useRef } from 'react';
import styles from './LiveTracker.module.css';

interface Country {
  id: string;
  name: string;
}

interface SegmentMeta {
  id: string;
  file: string;
  startOffset: number; // cumulative start time in seconds
  duration: number;    // segment duration in seconds
}

interface Manifest {
  segments: SegmentMeta[];
  sessionStart?: string;
}

interface SpeechEvent {
  id: string;
  speakerId: string;
  speakerName: string;
  segmentId: string;
  offsetInSegment: number;
  cumulativeOffset: number;
  transcript: string;
  timestamp: string;
}

interface Props {
  workspaceId: string;
  countries: Country[];
}

const CHUNK_OPTIONS = [
  { label: '30 seconds (for testing)', value: 30 },
  { label: '1 minute (for testing)', value: 60 },
  { label: '10 minutes (default)', value: 600 },
];

export default function LiveTracker({ workspaceId, countries }: Props) {
  // Session recording states
  const [isMeetingActive, setIsMeetingActive] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [chunkSize, setChunkSize] = useState(600); // 10m default

  const [manifest, setManifest] = useState<Manifest>({ segments: [] });
  const [events, setEvents] = useState<SpeechEvent[]>([]);
  const [selectedCountryId, setSelectedCountryId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Playback states
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0); // cumulative timeline playhead
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // Focus tracking for dictation
  const [focusedSpeechId, setFocusedSpeechId] = useState<string | null>(null);

  // References
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const currentSegmentIdRef = useRef<string | null>(null);
  const currentSegmentStartOffsetRef = useRef<number>(0);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const chunkTimerRef = useRef<NodeJS.Timeout | null>(null);
  const chunkStartTimeRef = useRef<number>(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load session data
  useEffect(() => {
    loadSession();
    // Instantiate audio element
    audioRef.current = new Audio();
    
    // Playback events
    audioRef.current.addEventListener('ended', handleAudioEnded);
    
    return () => {
      // Clean up recording on unmount
      cleanupRecording();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeEventListener('ended', handleAudioEnded);
      }
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [workspaceId]);

  async function loadSession() {
    try {
      const res = await fetch(`/api/workspace-data/${workspaceId}/session`);
      const data = await res.json();
      if (data.manifest) setManifest(data.manifest);
      if (data.events) setEvents(data.events);
    } catch (err) {
      console.error('Failed to load session', err);
    }
  }

  // Auto-save events helper
  async function saveEvents(updatedEvents: SpeechEvent[]) {
    try {
      await fetch(`/api/workspace-data/${workspaceId}/session/save-events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: updatedEvents }),
      });
    } catch (err) {
      console.error('Failed to save events', err);
    }
  }

  // --- RECORDING LOGIC ---

  async function startMeeting() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      setIsMeetingActive(true);
      setRecordingSeconds(0);
      currentSegmentStartOffsetRef.current = 0;

      // Start segment audio recorder
      startNextSegment(0);

      // Start display timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);

    } catch (err) {
      alert(`Microphone access denied: ${(err as Error).message}`);
    }
  }

  function startNextSegment(cumulativeOffset: number) {
    if (!mediaStreamRef.current) return;

    // Generate unique segment ID (timestamp)
    const segmentId = Date.now().toString();
    currentSegmentIdRef.current = segmentId;
    currentSegmentStartOffsetRef.current = cumulativeOffset;
    chunkStartTimeRef.current = Date.now();

    // Determine standard fallback MIME type
    let mimeType = 'audio/webm';
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
      mimeType = 'audio/webm;codecs=opus';
    } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
      mimeType = 'audio/mp4';
    }

    const recorder = new MediaRecorder(mediaStreamRef.current, { mimeType });
    mediaRecorderRef.current = recorder;

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = async () => {
      const duration = (Date.now() - chunkStartTimeRef.current) / 1000;
      if (chunks.length === 0 || duration < 0.5) return; // ignore tiny/empty chunks

      const blob = new Blob(chunks, { type: mimeType });
      const file = new File([blob], `segment_${segmentId}.bin`, { type: mimeType });

      // Upload to server asynchronously
      const fd = new FormData();
      fd.append('segmentId', segmentId);
      fd.append('startOffset', cumulativeOffset.toString());
      fd.append('duration', duration.toString());
      fd.append('audio', file);

      try {
        const res = await fetch(`/api/workspace-data/${workspaceId}/session/upload-segment`, {
          method: 'POST',
          body: fd,
        });
        const data = await res.json();
        if (data.success) {
          // Reload manifest
          loadSession();
        }
      } catch (err) {
        console.error('Failed to upload segment', err);
      }
    };

    recorder.start();

    // Setup chunk timer to restart recording when chunk size reached
    chunkTimerRef.current = setTimeout(() => {
      const elapsed = (Date.now() - chunkStartTimeRef.current) / 1000;
      // Stop current and start next segment concurrently
      stopCurrentSegmentOnly();
      startNextSegment(cumulativeOffset + elapsed);
    }, chunkSize * 1000);
  }

  function stopCurrentSegmentOnly() {
    if (chunkTimerRef.current) clearTimeout(chunkTimerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }

  async function stopMeeting() {
    cleanupRecording();
    setIsMeetingActive(false);
    // Reload manifest and sync files
    setTimeout(loadSession, 1000);
  }

  function cleanupRecording() {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (chunkTimerRef.current) clearTimeout(chunkTimerRef.current);
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  }

  // --- TRANSCRIPT & EVENTS LOGIC ---

  function addSpeechEvent() {
    if (!selectedCountryId) return;
    const country = countries.find((c) => c.id === selectedCountryId);
    if (!country) return;

    // Determine timing offsets relative to recording
    const cumulativeOffset = isMeetingActive ? recordingSeconds : 0;
    const segmentId = currentSegmentIdRef.current || 'no-session';
    const offsetInSegment = isMeetingActive 
      ? (Date.now() - chunkStartTimeRef.current) / 1000 
      : 0;

    const newEvent: SpeechEvent = {
      id: Math.random().toString(36).slice(2),
      speakerId: country.id,
      speakerName: country.name,
      segmentId,
      offsetInSegment,
      cumulativeOffset,
      transcript: '',
      timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
    };

    const nextEvents = [newEvent, ...events];
    setEvents(nextEvents);
    saveEvents(nextEvents);
    
    // Automatically focus the text field of the newly created speech card
    setTimeout(() => {
      setFocusedSpeechId(newEvent.id);
      const el = document.getElementById(`textarea-${newEvent.id}`);
      if (el) el.focus();
    }, 100);

    setSelectedCountryId('');
    setSearchQuery('');
  }

  function handleTranscriptChange(id: string, text: string) {
    const nextEvents = events.map((ev) => (ev.id === id ? { ...ev, transcript: text } : ev));
    setEvents(nextEvents);
    saveEvents(nextEvents);
  }

  function removeSpeechEvent(id: string) {
    if (!confirm('Are you sure you want to delete this speech event?')) return;
    const nextEvents = events.filter((ev) => ev.id !== id);
    setEvents(nextEvents);
    saveEvents(nextEvents);
    if (focusedSpeechId === id) setFocusedSpeechId(null);
  }

  // --- PLAYBACK / SEAMLESS AUDIO SELECTION ENGINE ---

  // Calculates total duration of the recorded timeline
  const totalPlaybackDuration = manifest.segments.reduce((acc, s) => acc + s.duration, 0);

  // Finds segment corresponding to cumulative offset T
  function findSegmentForTime(time: number): { segment: SegmentMeta; timeInSegment: number } | null {
    if (manifest.segments.length === 0) return null;
    // Find segment where startOffset <= time < startOffset + duration
    const seg = manifest.segments.find(
      (s) => time >= s.startOffset && time < s.startOffset + s.duration
    );
    if (seg) {
      return { segment: seg, timeInSegment: time - seg.startOffset };
    }
    // Fallback to last segment if slightly out of boundary
    const last = manifest.segments[manifest.segments.length - 1];
    if (time >= last.startOffset) {
      return { segment: last, timeInSegment: Math.min(time - last.startOffset, last.duration) };
    }
    return { segment: manifest.segments[0], timeInSegment: 0 };
  }

  function syncAudioPlayback(targetTime: number, startPlaying: boolean) {
    if (!audioRef.current) return;
    const lookup = findSegmentForTime(targetTime);
    if (!lookup) return;

    const { segment, timeInSegment } = lookup;
    const currentSrc = audioRef.current.src;
    
    // API route path of segment binary file
    const targetSrcUrl = `${window.location.origin}/api/workspace-data/${workspaceId}/${segment.file}`;

    // Update src only if segment file changes
    if (currentSrc !== targetSrcUrl) {
      audioRef.current.src = targetSrcUrl;
      audioRef.current.load();
    }

    audioRef.current.currentTime = timeInSegment;
    audioRef.current.playbackRate = playbackSpeed;
    setCurrentTime(targetTime);

    if (startPlaying) {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
        startProgressInterval();
      }).catch((err) => {
        console.error('Audio playback failed', err);
      });
    } else {
      audioRef.current.pause();
      setIsPlaying(false);
      stopProgressInterval();
    }
  }

  function handleAudioEnded() {
    if (!audioRef.current) return;
    const lookup = findSegmentForTime(currentTime);
    if (!lookup) {
      setIsPlaying(false);
      return;
    }

    // Check if there is a next segment immediately following
    const currentSegIdx = manifest.segments.findIndex((s) => s.id === lookup.segment.id);
    if (currentSegIdx !== -1 && currentSegIdx < manifest.segments.length - 1) {
      const nextSeg = manifest.segments[currentSegIdx + 1];
      syncAudioPlayback(nextSeg.startOffset, true);
    } else {
      setIsPlaying(false);
      stopProgressInterval();
    }
  }

  function startProgressInterval() {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    progressIntervalRef.current = setInterval(() => {
      if (!audioRef.current || !isPlaying) return;

      const lookup = findSegmentForTime(currentTime);
      if (lookup) {
        // Calculate cumulative timeline current position
        const cumulativeTime = lookup.segment.startOffset + audioRef.current.currentTime;
        setCurrentTime(cumulativeTime);

        // Check if we hit segment boundary and need to cross
        if (audioRef.current.currentTime >= lookup.segment.duration) {
          handleAudioEnded();
        }
      }
    }, 150);
  }

  function stopProgressInterval() {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
  }

  function togglePlayPause() {
    if (totalPlaybackDuration === 0) return;
    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
      stopProgressInterval();
    } else {
      syncAudioPlayback(currentTime, true);
    }
  }

  function handleScrub(time: number) {
    const clamped = Math.max(0, Math.min(time, totalPlaybackDuration));
    syncAudioPlayback(clamped, isPlaying);
  }

  function handleSpeedChange(speed: number) {
    setPlaybackSpeed(speed);
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  }

  function seekToSpeech(speech: SpeechEvent) {
    syncAudioPlayback(speech.cumulativeOffset, true);
  }

  // Format seconds to MM:SS
  function formatTime(secs: number) {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  const filteredCountries = countries.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className={styles.trackerContainer}>
      <div className={styles.topControlRow}>
        {/* Recording controller */}
        <div className={`card ${styles.recorderCard}`}>
          <div className={styles.recorderInfo}>
            <div className={styles.recordIndicator}>
              <span className={`${styles.statusDot} ${isMeetingActive ? styles.statusRecording : ''}`} />
              <span className={styles.recordingLabel}>
                {isMeetingActive ? 'Live Capturing Session' : 'Meeting Stopped'}
              </span>
            </div>
            {isMeetingActive && (
              <div className={styles.timer}>{formatTime(recordingSeconds)}</div>
            )}
          </div>
          <div className={styles.recordingActions}>
            {!isMeetingActive ? (
              <>
                <div className={styles.chunkSelector}>
                  <label className="label" style={{ margin: 0 }}>Segments</label>
                  <select
                    className="select"
                    value={chunkSize}
                    onChange={(e) => setChunkSize(parseInt(e.target.value))}
                    style={{ minWidth: 160 }}
                  >
                    {CHUNK_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  id="btn-begin-meeting"
                  className="btn btn-primary"
                  onClick={startMeeting}
                >
                  🔴 Begin Meeting
                </button>
              </>
            ) : (
              <button
                id="btn-end-meeting"
                className="btn btn-danger"
                onClick={stopMeeting}
              >
                ⏹ End Meeting
              </button>
            )}
          </div>
        </div>

        {/* Master continuous player controller */}
        {totalPlaybackDuration > 0 && (
          <div className={`card ${styles.playbackCard}`}>
            <div className={styles.playerTop}>
              <button className="btn btn-secondary btn-sm" onClick={togglePlayPause} style={{ width: 80 }}>
                {isPlaying ? '⏸ Pause' : '▶ Play'}
              </button>
              <div className={styles.playerTimeline}>
                <span className={styles.timeLabel}>{formatTime(currentTime)}</span>
                <input
                  className={styles.seekBar}
                  type="range"
                  min={0}
                  max={totalPlaybackDuration}
                  step={0.1}
                  value={currentTime}
                  onChange={(e) => handleScrub(parseFloat(e.target.value))}
                />
                <span className={styles.timeLabel}>{formatTime(totalPlaybackDuration)}</span>
              </div>
            </div>
            <div className={styles.playerSpeedControl}>
              <span className="label" style={{ margin: 0, marginRight: 8 }}>Playback speed</span>
              <div className="tabs">
                {[1, 1.25, 1.5, 2].map((sp) => (
                  <button
                    key={sp}
                    className={`tab ${playbackSpeed === sp ? 'active' : ''}`}
                    onClick={() => handleSpeedChange(sp)}
                    style={{ padding: '2px 8px', fontSize: 11 }}
                  >
                    {sp}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className={styles.trackerMain}>
        {/* Left column: logger & active focus list */}
        <div className={styles.loggerCol}>
          <div className={`card ${styles.loggerBox}`}>
            <h3 className={styles.sectionHeading}>🎤 Speaker Logging</h3>
            <p className={styles.helperText}>Select a country to initiate a speech transcript entry</p>
            <div className={styles.speakerSelectorWrapper}>
              <input
                className="input"
                placeholder="Search countries..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <div className={styles.countrySearchDropdown}>
                  {filteredCountries.slice(0, 8).map((c) => (
                    <button
                      key={c.id}
                      className={styles.dropdownOption}
                      onClick={() => {
                        setSelectedCountryId(c.id);
                        setSearchQuery('');
                      }}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {selectedCountryId && (
              <div className={styles.activeSpeakerRow}>
                <div className={styles.speakerSelectedText}>
                  Active speaker: <strong>{countries.find((c) => c.id === selectedCountryId)?.name}</strong>
                </div>
                <button
                  id="btn-log-speech"
                  className="btn btn-primary"
                  onClick={addSpeechEvent}
                >
                  Log Speech Event
                </button>
              </div>
            )}
          </div>

          <div className={styles.speechLogScrollContainer}>
            <h3 className={styles.sectionHeading} style={{ margin: 'var(--space-4) 0 var(--space-2)' }}>
              Speech Event Feed
            </h3>
            {events.length === 0 ? (
              <div className={styles.emptyEvents}>
                <p>No speeches logged in this session yet.</p>
                <p className="text-xs text-muted">Use speaker logging above to start.</p>
              </div>
            ) : (
              <div className={styles.eventList}>
                {events.map((ev) => (
                  <div
                    key={ev.id}
                    className={`${styles.speechCard} card ${focusedSpeechId === ev.id ? styles.speechCardFocused : ''}`}
                  >
                    <div className={styles.speechCardHeader}>
                      <div className={styles.speechSpeakerInfo}>
                        <span className={styles.speakerDot} />
                        <strong className={styles.speakerCardName}>{ev.speakerName}</strong>
                        <span className={styles.speechTime}>{ev.timestamp}</span>
                      </div>
                      <div className={styles.cardActions}>
                        {totalPlaybackDuration > 0 && ev.segmentId !== 'no-session' && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => seekToSpeech(ev)}
                            title="Play audio from this speech offset"
                          >
                            🎧 Seek Playback ({formatTime(ev.cumulativeOffset)})
                          </button>
                        )}
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => removeSpeechEvent(ev.id)}
                          style={{ color: 'var(--accent-danger)' }}
                          title="Delete event"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    <div className={styles.textareaWrapper}>
                      <textarea
                        id={`textarea-${ev.id}`}
                        className={`input ${styles.speechTextArea}`}
                        placeholder="Hold your system dictation hotkey (e.g. Wispr) to dictate speech..."
                        value={ev.transcript}
                        onChange={(e) => handleTranscriptChange(ev.id, e.target.value)}
                        onFocus={() => setFocusedSpeechId(ev.id)}
                        onBlur={() => setFocusedSpeechId(null)}
                        rows={3}
                      />
                      {focusedSpeechId === ev.id && (
                        <div className={styles.dictationIndicator}>
                          🎙️ Dictation active — start speaking
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
