import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Mic,
  Square,
  Activity,
  AudioWaveform,
  Sliders,
  Database,
  AlertTriangle,
  ChevronDown,
  Sparkles,
  ShieldCheck,
  History,
  Zap
} from 'lucide-react';

const THEMES = {
  build: {
    label: 'Dawn',
    sub: 'heads down. ship or ship',
    bg: '#12100E',
    cardBg: 'rgba(255, 240, 225, 0.025)',
    cardBorder: 'rgba(255, 210, 170, 0.09)',
    textMain: '#F5ECE5',
    textMuted: '#A39587',
    accent: '#F97316',
    accentLight: '#FDBA74',
    accentBg: 'rgba(249, 115, 22, 0.12)',
    accentBorder: 'rgba(249, 115, 22, 0.25)',
    glow1: 'rgba(232, 114, 12, 0.20)',
    glow2: 'rgba(217, 119, 6, 0.18)',
    glow3: 'rgba(245, 158, 11, 0.12)',
    glow4: 'rgba(234, 88, 12, 0.14)',
    btnGradient: 'linear-gradient(135deg, #F97316 0%, #EA580C 50%, #D97706 100%)',
    btnGlow: 'rgba(249, 115, 22, 0.4)',
    selectOptionBg: '#1c1713',
  },
  launch: {
    label: 'Dusk',
    sub: 'the world watches',
    bg: '#071317',
    cardBg: 'rgba(240, 253, 250, 0.025)',
    cardBorder: 'rgba(204, 251, 241, 0.09)',
    textMain: '#E6F4F1',
    textMuted: '#8BB0A8',
    accent: '#2DD4BF',
    accentLight: '#99F6E4',
    accentBg: 'rgba(45, 212, 191, 0.12)',
    accentBorder: 'rgba(45, 212, 191, 0.25)',
    glow1: 'rgba(16, 185, 129, 0.20)',
    glow2: 'rgba(20, 184, 166, 0.18)',
    glow3: 'rgba(242, 193, 78, 0.14)',
    glow4: 'rgba(45, 212, 191, 0.14)',
    btnGradient: 'linear-gradient(135deg, #2DD4BF 0%, #10B981 50%, #F2C14E 100%)',
    btnGlow: 'rgba(45, 212, 191, 0.4)',
    selectOptionBg: '#0a1a1f',
  }
};

function percentileOf(sortedValues, p) {
  return sortedValues[Math.max(0, Math.ceil((p / 100) * sortedValues.length) - 1)];
}

function computePercentiles(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return { p50: percentileOf(sorted, 50), p70: percentileOf(sorted, 70), p100: sorted[sorted.length - 1] };
}

function loadStoredLatencies() {
  try {
    const stored = JSON.parse(localStorage.getItem('rag-latency-history'));
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

const MAX_HISTORY = 20;

function loadStoredHistory() {
  try {
    const stored = JSON.parse(localStorage.getItem('rag-query-history'));
    if (!Array.isArray(stored)) return [];
    return stored.filter(
      (h) => h && typeof h === 'object' && typeof h.transcript === 'string' && typeof h.latency === 'number'
    );
  } catch {
    return [];
  }
}

const SYSTEM_STATES = {
  IDLE: 'idle',
  LISTENING: 'listening',
  COMPUTING: 'computing',
  RESOLVED: 'resolved',
  FAULT: 'fault'
};

const PIPELINE_STAGES = [
  { key: 'stt_ms', label: 'STT' },
  { key: 'embed_ms', label: 'Embed' },
  { key: 'retrieve_ms', label: 'Retrieve' },
  { key: 'generate_ms', label: 'Generate' }
];

export default function App() {
  const [theme, setTheme] = useState('build');
  const [sysState, setSysState] = useState(SYSTEM_STATES.IDLE);
  const [errorMsg, setErrorMsg] = useState(null);
  const [output, setOutput] = useState({ transcript: '', answer: '' });
  const [latency, setLatency] = useState(0);
  const [config, setConfig] = useState({ provider: 'elevenlabs', strategy: 'hybrid-semantic', guardrails: true });
  const latenciesRef = useRef(loadStoredLatencies());
  const [percentiles, setPercentiles] = useState(() => computePercentiles(latenciesRef.current));
  const [queryCount, setQueryCount] = useState(latenciesRef.current.length);
  const historyRef = useRef(loadStoredHistory());
  const [history, setHistory] = useState(historyRef.current);
  const [trace, setTrace] = useState(null);
  const [selectedTs, setSelectedTs] = useState(null);

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);

  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    return cleanupStream;
  }, [cleanupStream]);

  const initializeCapture = async () => {
    try {
      setErrorMsg(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      recorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm' });

      recorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        chunksRef.current = [];
        executePipeline(blob);
      };

      recorderRef.current.start(100);
      setSysState(SYSTEM_STATES.LISTENING);
      setOutput({ transcript: '', answer: '' });
      setLatency(0);
      setTrace(null);
      setSelectedTs(null);
    } catch (err) {
      setErrorMsg('Microphone hardware access denied or unavailable.');
      setSysState(SYSTEM_STATES.FAULT);
    }
  };

  const haltCapture = () => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
      cleanupStream();
      setSysState(SYSTEM_STATES.COMPUTING);
    }
  };

  const executePipeline = async (audioBlob) => {
    const t0 = performance.now();
    const payload = new FormData();
    payload.append('file', audioBlob, 'query.webm');
    payload.append('stt_provider', config.provider);
    payload.append('chunking_strategy', config.strategy);
    payload.append('guardrails', 'true');

    try {
      const endpoint = import.meta.env.VITE_API_ENDPOINT || 'https://ragi-3f8o.onrender.com/api/v1/query';
      const res = await fetch(endpoint, { method: 'POST', body: payload });

      if (!res.ok) throw new Error(`Pipeline execution fault: HTTP ${res.status}`);

      const data = await res.json();
      const t1 = performance.now();

      setOutput({ transcript: data.transcript || '', answer: data.answer || '' });
      const elapsed = Math.round(t1 - t0);
      setLatency(elapsed);
      setSysState(SYSTEM_STATES.RESOLVED);

      latenciesRef.current.push(elapsed);
      localStorage.setItem('rag-latency-history', JSON.stringify(latenciesRef.current));
      setPercentiles(computePercentiles(latenciesRef.current));
      setQueryCount(latenciesRef.current.length);

      const record = {
        transcript: data.transcript || '',
        answer: data.answer || '',
        latency: elapsed,
        refused: !!data.refused,
        refusalReason: data.refusal_reason || null,
        fallback: data.fallback || null,
        timings: data.timings && typeof data.timings === 'object' ? data.timings : {},
        ts: Date.now()
      };
      historyRef.current = [record, ...historyRef.current].slice(0, MAX_HISTORY);
      localStorage.setItem('rag-query-history', JSON.stringify(historyRef.current));
      setHistory(historyRef.current);
      setTrace(record.timings);
      setSelectedTs(record.ts);
    } catch (err) {
      setErrorMsg(err.message || 'Network orchestration failed.');
      setSysState(SYSTEM_STATES.FAULT);
    }
  };

  const clearHistory = () => {
    historyRef.current = [];
    localStorage.removeItem('rag-query-history');
    setHistory([]);
    setSelectedTs(null);
  };

  const loadTraceFromHistory = (h) => {
    if (!h.timings || Object.keys(h.timings).length === 0) return;
    setTrace(h.timings);
    setSelectedTs(h.ts);
  };

  const currentTheme = THEMES[theme];

  return (
    <div
      className="min-h-screen font-sans selection:bg-orange-500/30 flex flex-col items-center justify-between p-3 sm:p-6 md:p-8 relative overflow-x-hidden transition-colors duration-500"
      style={{
        backgroundColor: currentTheme.bg,
        color: currentTheme.textMain,
        '--bg': currentTheme.bg,
        '--card-bg': currentTheme.cardBg,
        '--card-border': currentTheme.cardBorder,
        '--text-main': currentTheme.textMain,
        '--text-muted': currentTheme.textMuted,
        '--accent': currentTheme.accent,
        '--accent-light': currentTheme.accentLight,
        '--accent-bg': currentTheme.accentBg,
        '--accent-border': currentTheme.accentBorder,
        '--glow1': currentTheme.glow1,
        '--glow2': currentTheme.glow2,
        '--glow3': currentTheme.glow3,
        '--glow4': currentTheme.glow4,
        '--btn-gradient': currentTheme.btnGradient,
        '--btn-glow': currentTheme.btnGlow,
        '--select-bg': currentTheme.selectOptionBg
      }}
    >

      <style>{`
        @keyframes float-organic-1 {
          0% { transform: translate(0px, 0px) scale(1) rotate(0deg); }
          33% { transform: translate(7vw, -5vh) scale(1.18) rotate(110deg); }
          66% { transform: translate(-4vw, 6vh) scale(0.88) rotate(220deg); }
          100% { transform: translate(0px, 0px) scale(1) rotate(360deg); }
        }
        @keyframes float-organic-2 {
          0% { transform: translate(0px, 0px) scale(1) rotate(0deg); }
          33% { transform: translate(-6vw, 7vh) scale(1.22) rotate(-120deg); }
          66% { transform: translate(5vw, -4vh) scale(0.92) rotate(140deg); }
          100% { transform: translate(0px, 0px) scale(1) rotate(0deg); }
        }
        @keyframes float-organic-3 {
          0% { transform: translate(0px, 0px) scale(0.9); }
          50% { transform: translate(5vw, 5vh) scale(1.25); }
          100% { transform: translate(0px, 0px) scale(0.9); }
        }
        @keyframes float-organic-4 {
          0% { transform: translate(0px, 0px) scale(1); }
          50% { transform: translate(-5vw, -6vh) scale(1.12); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        .animate-float-1 { animation: float-organic-1 24s cubic-bezier(0.4, 0, 0.2, 1) infinite; }
        .animate-float-2 { animation: float-organic-2 30s cubic-bezier(0.4, 0, 0.2, 1) infinite alternate; }
        .animate-float-3 { animation: float-organic-3 21s cubic-bezier(0.4, 0, 0.2, 1) infinite alternate; }
        .animate-float-4 { animation: float-organic-4 27s cubic-bezier(0.4, 0, 0.2, 1) infinite; }
        @keyframes pipeline-slide {
          0% { left: 0%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { left: 100%; opacity: 0; }
        }
        .animate-pipeline-slide { animation: pipeline-slide 1.6s cubic-bezier(0.45, 0, 0.55, 1) infinite; }
      `}</style>

      {/* Dynamic Background Glow Orbs */}
      <div className="absolute top-[-12%] left-[-10%] w-[55vw] h-[55vw] max-w-[650px] max-h-[650px] blur-[140px] rounded-full pointer-events-none animate-float-1 transition-all duration-700" style={{ backgroundColor: currentTheme.glow1 }} />
      <div className="absolute bottom-[-10%] right-[-10%] w-[65vw] h-[65vw] max-w-[750px] max-h-[750px] blur-[160px] rounded-full pointer-events-none animate-float-2 transition-all duration-700" style={{ backgroundColor: currentTheme.glow2 }} />
      <div className="absolute top-[22%] right-[4%] w-[45vw] h-[45vw] max-w-[520px] max-h-[520px] blur-[120px] rounded-full pointer-events-none animate-float-3 transition-all duration-700" style={{ backgroundColor: currentTheme.glow3, animationDelay: '-6s' }} />
      <div className="absolute bottom-[16%] left-[6%] w-[40vw] h-[40vw] max-w-[480px] max-h-[480px] blur-[130px] rounded-full pointer-events-none animate-float-4 transition-all duration-700" style={{ backgroundColor: currentTheme.glow4, animationDelay: '-12s' }} />
      <div className="absolute top-[45%] left-[32%] w-[32vw] h-[32vw] max-w-[380px] max-h-[380px] blur-[110px] rounded-full pointer-events-none animate-float-1 transition-all duration-700" style={{ backgroundColor: currentTheme.glow1, animationDelay: '-8s' }} />

      <div className="w-full max-w-6xl space-y-4 sm:space-y-6 relative z-10">

        <header className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3.5 py-3.5 px-4 sm:px-6 backdrop-blur-2xl rounded-2xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1),_0_12px_32px_rgba(0,0,0,0.4)] transition-colors duration-300" style={{ backgroundColor: currentTheme.cardBg, borderColor: currentTheme.cardBorder, borderWidth: '1px' }}>
          <div className="flex items-center gap-3.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] transition-all duration-500" style={{ background: currentTheme.btnGradient, boxShadow: `0 0 20px ${currentTheme.btnGlow}` }}>
              <Sparkles size={18} className="text-slate-950" />
            </div>
            <div>
              <h1 className="text-xs sm:text-sm font-semibold tracking-tight flex items-center gap-2" style={{ color: currentTheme.textMain }}>
                Hacker House Goa
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md" style={{ backgroundColor: currentTheme.accentBg, color: currentTheme.accent, borderColor: currentTheme.accentBorder, borderWidth: '1px' }}>Task 2</span>
              </h1>
              <p className="text-[11px] font-mono mt-0.5" style={{ color: currentTheme.textMuted }}>Voice RAG Orchestrator &bull; MSMARCO-XI</p>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0" style={{ borderColor: currentTheme.cardBorder }}>

            {/* Theme Selector Toggle */}
            <div className="flex items-center gap-1 p-1 rounded-xl" style={{ backgroundColor: 'rgba(0,0,0,0.2)', borderColor: currentTheme.cardBorder, borderWidth: '1px' }}>
              {Object.entries(THEMES).map(([key, val]) => (
                <button
                  key={key}
                  onClick={() => setTheme(key)}
                  className="px-2.5 py-1 text-[11px] font-mono rounded-lg transition-all"
                  style={{
                    backgroundColor: theme === key ? currentTheme.accent : 'transparent',
                    color: theme === key ? '#0d0d0d' : currentTheme.textMuted,
                    fontWeight: theme === key ? '600' : '400'
                  }}
                  title={val.sub}
                >
                  {val.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium backdrop-blur-md" style={{ backgroundColor: 'rgba(0,0,0,0.15)', borderColor: currentTheme.cardBorder, borderWidth: '1px' }}>
              <span className={`w-2 h-2 rounded-full ${
                sysState === SYSTEM_STATES.LISTENING ? 'animate-ping' :
                sysState === SYSTEM_STATES.COMPUTING ? 'animate-pulse' :
                sysState === SYSTEM_STATES.RESOLVED ? 'shadow-[0_0_8px_rgba(52,211,153,0.8)]' : ''
              }`} style={{
                backgroundColor: sysState === SYSTEM_STATES.FAULT ? '#F43F5E' : sysState === SYSTEM_STATES.IDLE ? currentTheme.textMuted : currentTheme.accent
              }} />
              <span className="capitalize font-mono text-[11px]" style={{ color: currentTheme.textMain }}>{sysState}</span>
            </div>

            <div className="relative">
              <select
                value={config.provider}
                onChange={(e) => setConfig({ ...config, provider: e.target.value })}
                disabled={sysState === SYSTEM_STATES.LISTENING || sysState === SYSTEM_STATES.COMPUTING}
                className="appearance-none text-xs font-medium px-3 py-1.5 pr-8 rounded-xl outline-none transition-all cursor-pointer disabled:opacity-50"
                style={{ backgroundColor: 'rgba(0,0,0,0.2)', borderColor: currentTheme.cardBorder, borderWidth: '1px', color: currentTheme.textMain }}
              >
                <option value="elevenlabs" style={{ backgroundColor: currentTheme.selectOptionBg }}>ElevenLabs (primary)</option>
                <option value="groq-whisper" style={{ backgroundColor: currentTheme.selectOptionBg }}>Groq Whisper v3</option>
                <option value="sarvam" style={{ backgroundColor: currentTheme.selectOptionBg }}>Sarvam AI</option>
              </select>
              <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: currentTheme.textMuted }} />
            </div>
          </div>
        </header>

        {errorMsg && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 px-4 py-3 rounded-2xl text-xs flex items-center gap-3 backdrop-blur-xl">
            <AlertTriangle size={16} className="shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">

          <div className="lg:col-span-5 flex flex-col gap-4 sm:gap-6">

            <div className="backdrop-blur-2xl rounded-3xl p-6 flex flex-col justify-between relative overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),_0_16px_40px_rgba(0,0,0,0.5)] transition-colors duration-300" style={{ backgroundColor: currentTheme.cardBg, borderColor: currentTheme.cardBorder, borderWidth: '1px' }}>
              <div className="flex items-center justify-between mb-6">
                <div className="text-xs uppercase tracking-wider font-medium flex items-center gap-2" style={{ color: currentTheme.textMuted }}>
                  <AudioWaveform size={14} style={{ color: currentTheme.accent }} /> Neural Audio Capture
                </div>
                <div className="text-[10px] font-mono px-2 py-0.5 rounded-md" style={{ backgroundColor: currentTheme.accentBg, color: currentTheme.accent, borderColor: currentTheme.accentBorder, borderWidth: '1px' }}>
                  Opus / WebM
                </div>
              </div>

              <div className="flex justify-center items-center py-6 relative">
                {sysState === SYSTEM_STATES.LISTENING && (
                  <div className="absolute m-auto w-36 h-36 rounded-full animate-ping" style={{ borderColor: currentTheme.accent, borderWidth: '1px', opacity: 0.4 }} />
                )}

                <button
                  onClick={sysState === SYSTEM_STATES.LISTENING ? haltCapture : initializeCapture}
                  disabled={sysState === SYSTEM_STATES.COMPUTING}
                  className={`relative z-10 w-28 h-28 rounded-full flex items-center justify-center transition-all duration-300 outline-none
                    ${sysState === SYSTEM_STATES.LISTENING
                      ? 'bg-rose-500/15 border border-rose-500/40 text-rose-300 shadow-[inset_0_2px_10px_rgba(244,63,94,0.3),_0_0_30px_rgba(244,63,94,0.3)] scale-95'
                      : 'bg-gradient-to-b from-white/[0.08] via-white/[0.03] to-transparent shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),_0_12px_36px_rgba(0,0,0,0.5)] hover:scale-105'
                    } disabled:opacity-50 disabled:cursor-not-allowed group`}
                  style={{ borderColor: currentTheme.cardBorder, borderWidth: '1px', color: currentTheme.accent }}
                >
                  {sysState === SYSTEM_STATES.LISTENING ? (
                    <Square size={28} className="fill-current animate-pulse" />
                  ) : (
                    <Mic size={32} className="transition-transform duration-300 group-hover:scale-110" style={{ color: currentTheme.accent }} />
                  )}
                </button>
              </div>

              <div className="mt-4 text-center">
                <div className="text-xs font-mono h-5" style={{ color: currentTheme.textMuted }}>
                  {sysState === SYSTEM_STATES.IDLE && 'Click microphone orb to stream voice query'}
                  {sysState === SYSTEM_STATES.LISTENING && <span className="font-medium" style={{ color: currentTheme.accent }}>Recording speech... Click again to process</span>}
                  {sysState === SYSTEM_STATES.COMPUTING && <span className="text-amber-300 font-medium">Executing vector retrieval & synthesis...</span>}
                  {sysState === SYSTEM_STATES.RESOLVED && <span className="font-medium" style={{ color: currentTheme.accent }}>Pipeline completed in {latency}ms</span>}
                  {sysState === SYSTEM_STATES.FAULT && <span className="text-rose-400 font-medium">Capture faulted</span>}
                </div>
              </div>
            </div>

            <div className="backdrop-blur-2xl rounded-3xl p-5 space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] transition-colors duration-300" style={{ backgroundColor: currentTheme.cardBg, borderColor: currentTheme.cardBorder, borderWidth: '1px' }}>
              <div className="flex items-center justify-between pb-3" style={{ borderBottomColor: currentTheme.cardBorder, borderBottomWidth: '1px' }}>
                <span className="text-xs font-medium flex items-center gap-2" style={{ color: currentTheme.textMain }}>
                  <Sliders size={14} style={{ color: currentTheme.accent }} /> Retrieval Guardrails
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md" style={{ backgroundColor: currentTheme.accentBg, color: currentTheme.accent, borderColor: currentTheme.accentBorder, borderWidth: '1px' }}>Active</span>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider font-mono block mb-1.5" style={{ color: currentTheme.textMuted }}>Chunking Strategy</label>
                  <select
                    value={config.strategy}
                    onChange={(e) => setConfig({ ...config, strategy: e.target.value })}
                    className="w-full text-xs font-medium px-3 py-2 rounded-xl outline-none transition-all cursor-pointer"
                    style={{ backgroundColor: 'rgba(0,0,0,0.2)', borderColor: currentTheme.cardBorder, borderWidth: '1px', color: currentTheme.textMain }}
                  >
                    <option value="hybrid-semantic" style={{ backgroundColor: currentTheme.selectOptionBg }}>Hybrid Semantic + Overlap</option>
                    <option value="hierarchical" style={{ backgroundColor: currentTheme.selectOptionBg }}>Hierarchical Parent-Child</option>
                    <option value="metadata-aware" style={{ backgroundColor: currentTheme.selectOptionBg }}>Metadata-Aware MSMARCO</option>
                  </select>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={14} style={{ color: currentTheme.accent }} />
                    <span className="text-xs" style={{ color: currentTheme.textMain }}>Grounding Filter</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ backgroundColor: currentTheme.accentBg, color: currentTheme.accent, borderColor: currentTheme.accentBorder, borderWidth: '1px' }}>ALWAYS ON</span>
                  </div>
                  <ShieldCheck size={14} style={{ color: currentTheme.accent, opacity: 0.6 }} />
                </div>
              </div>
            </div>

          </div>

          <div className="lg:col-span-7 flex flex-col gap-4 sm:gap-6">

            <div className="backdrop-blur-2xl rounded-3xl overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] transition-colors duration-300" style={{ backgroundColor: currentTheme.cardBg, borderColor: currentTheme.cardBorder, borderWidth: '1px' }}>
              <div className="px-5 py-3 flex justify-between items-center" style={{ borderBottomColor: currentTheme.cardBorder, borderBottomWidth: '1px', backgroundColor: 'rgba(255,255,255,0.01)' }}>
                <div className="text-xs font-medium flex items-center gap-2" style={{ color: currentTheme.textMain }}>
                  <Activity size={14} style={{ color: currentTheme.accent }} /> STT Transcript
                </div>
                <span className="text-[10px] font-mono capitalize" style={{ color: currentTheme.textMuted }}>{config.provider} Engine</span>
              </div>
              <div className="p-5 text-xs sm:text-sm leading-relaxed min-h-[75px] flex items-center" style={{ color: currentTheme.textMain }}>
                {sysState === SYSTEM_STATES.COMPUTING ? (
                  <div className="space-y-2 w-full animate-pulse">
                    <div className="h-2.5 rounded w-3/4" style={{ backgroundColor: currentTheme.accentBg }}></div>
                    <div className="h-2.5 rounded w-1/2" style={{ backgroundColor: currentTheme.accentBg }}></div>
                  </div>
                ) : (
                  output.transcript || <span className="italic font-light" style={{ color: currentTheme.textMuted }}>Transcribed voice query will appear here...</span>
                )}
              </div>
            </div>

            <div className="backdrop-blur-2xl rounded-3xl overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),_0_12px_32px_rgba(0,0,0,0.4)] transition-colors duration-300" style={{ backgroundColor: currentTheme.cardBg, borderColor: currentTheme.cardBorder, borderWidth: '1px' }}>
              <div className="px-5 py-3 flex justify-between items-center" style={{ borderBottomColor: currentTheme.cardBorder, borderBottomWidth: '1px', backgroundColor: 'rgba(255,255,255,0.01)' }}>
                <div className="text-xs font-medium flex items-center gap-2" style={{ color: currentTheme.textMain }}>
                  <Database size={14} style={{ color: currentTheme.accent }} /> Synthesized RAG Response
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md" style={{ backgroundColor: currentTheme.accentBg, color: currentTheme.accent, borderColor: currentTheme.accentBorder, borderWidth: '1px' }}>MSMARCO-XI</span>
              </div>
              <div className="p-5 text-xs sm:text-sm leading-relaxed min-h-[110px] flex items-center" style={{ color: currentTheme.textMain }}>
                {sysState === SYSTEM_STATES.COMPUTING ? (
                  <div className="space-y-3 w-full animate-pulse">
                    <div className="h-2.5 rounded w-full" style={{ backgroundColor: currentTheme.accentBg }}></div>
                    <div className="h-2.5 rounded w-5/6" style={{ backgroundColor: currentTheme.accentBg }}></div>
                    <div className="h-2.5 rounded w-4/6" style={{ backgroundColor: currentTheme.accentBg }}></div>
                  </div>
                ) : (
                  output.answer || <span className="italic font-light" style={{ color: currentTheme.textMuted }}>Synthesized response will appear here...</span>
                )}
              </div>
            </div>

            <div className="backdrop-blur-2xl rounded-3xl overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] transition-colors duration-300" style={{ backgroundColor: currentTheme.cardBg, borderColor: currentTheme.cardBorder, borderWidth: '1px' }}>
              <div className="px-5 py-3 flex justify-between items-center" style={{ borderBottomColor: currentTheme.cardBorder, borderBottomWidth: '1px', backgroundColor: 'rgba(255,255,255,0.01)' }}>
                <div className="text-xs font-medium flex items-center gap-2" style={{ color: currentTheme.textMain }}>
                  <Activity size={14} style={{ color: currentTheme.accent }} /> Pipeline Trace
                </div>
                {sysState === SYSTEM_STATES.COMPUTING ? (
                  <span className="text-[10px] font-mono animate-pulse" style={{ color: currentTheme.textMuted }}>executing&hellip;</span>
                ) : trace ? (
                  <span className="text-[10px] font-mono" style={{ color: currentTheme.accent }}>{trace.total_ms ?? '--'}ms total</span>
                ) : (
                  <span className="text-[10px] font-mono" style={{ color: currentTheme.textMuted }}>per-leg telemetry</span>
                )}
              </div>
              <div className="px-5 py-4">
                {sysState === SYSTEM_STATES.COMPUTING ? (
                  <div>
                    <div className="relative h-1.5 rounded-full overflow-visible" style={{ backgroundColor: currentTheme.accentBg }}>
                      <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full animate-pipeline-slide" style={{ backgroundColor: currentTheme.accent, boxShadow: `0 0 8px ${currentTheme.btnGlow}` }} />
                    </div>
                    <div className="flex justify-between mt-2">
                      {PIPELINE_STAGES.map((s) => (
                        <span key={s.key} className="text-[9px] font-mono animate-pulse" style={{ color: currentTheme.textMuted }}>{s.label}</span>
                      ))}
                    </div>
                  </div>
                ) : trace && PIPELINE_STAGES.some((s) => typeof trace[s.key] === 'number') ? (
                  (() => {
                    const legs = PIPELINE_STAGES.map((s) => ({ ...s, ms: typeof trace[s.key] === 'number' ? trace[s.key] : 0 }));
                    const sum = legs.reduce((a, l) => a + l.ms, 0) || 1;
                    return (
                      <div>
                        <div className="flex items-center w-full">
                          {legs.map((l, i) => (
                            <React.Fragment key={l.key}>
                              {i === 0 && <span className="shrink-0 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: currentTheme.accentLight }} />}
                              <div
                                className="h-1.5 transition-all duration-700"
                                style={{
                                  width: `${(l.ms / sum) * 100}%`,
                                  minWidth: '6px',
                                  marginLeft: i === 0 ? '0' : '2px',
                                  marginRight: '2px',
                                  background: `linear-gradient(90deg, ${currentTheme.accent}, ${currentTheme.accentLight})`,
                                  opacity: 0.85,
                                  borderRadius: l.ms === 0 ? '9999px' : '4px'
                                }}
                                title={`${l.label}: ${l.ms}ms`}
                              />
                              <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${i === legs.length - 1 ? '' : 'opacity-60'}`} style={{ backgroundColor: i === legs.length - 1 ? currentTheme.accent : currentTheme.accentLight }} />
                            </React.Fragment>
                          ))}
                        </div>
                        <div className="flex justify-between mt-2 gap-1 flex-wrap">
                          {legs.map((l) => (
                            <div key={l.key} className="flex flex-col items-center min-w-[52px]">
                              <span className="text-[11px] font-mono font-semibold" style={{ color: currentTheme.textMain }}>{l.ms}<span className="text-[8px]" style={{ color: currentTheme.textMuted }}>ms</span></span>
                              <span className="text-[9px] font-mono uppercase tracking-wide" style={{ color: currentTheme.textMuted }}>{l.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <span className="italic font-light text-xs" style={{ color: currentTheme.textMuted }}>Run a query to see where the time goes&hellip;</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">

              <div className="backdrop-blur-xl rounded-2xl p-3.5 flex flex-col justify-between shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] transition-colors duration-300" style={{ backgroundColor: currentTheme.cardBg, borderColor: currentTheme.cardBorder, borderWidth: '1px' }}>
                <div className="text-[10px] uppercase tracking-wider font-mono" style={{ color: currentTheme.textMuted }}>Net E2E</div>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-xl font-semibold tracking-tight" style={{ color: latency > 200 ? '#F59E0B' : currentTheme.accent }}>
                    {latency > 0 ? latency : '--'}
                  </span>
                  <span className="text-[10px] font-mono" style={{ color: currentTheme.textMuted }}>ms</span>
                </div>
              </div>

              <div className="backdrop-blur-xl rounded-2xl p-3.5 flex flex-col justify-between shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] transition-colors duration-300" style={{ backgroundColor: currentTheme.cardBg, borderColor: currentTheme.cardBorder, borderWidth: '1px' }}>
                <div className="text-[10px] uppercase tracking-wider font-mono" style={{ color: currentTheme.textMuted }}>P50 Latency</div>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-lg font-medium" style={{ color: currentTheme.textMain }}>{percentiles.p50 || '--'}</span>
                  <span className="text-[10px] font-mono" style={{ color: currentTheme.textMuted }}>ms</span>
                </div>
              </div>

              <div className="backdrop-blur-xl rounded-2xl p-3.5 flex flex-col justify-between shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] transition-colors duration-300" style={{ backgroundColor: currentTheme.cardBg, borderColor: currentTheme.cardBorder, borderWidth: '1px' }}>
                <div className="text-[10px] uppercase tracking-wider font-mono" style={{ color: currentTheme.textMuted }}>P70 Latency</div>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-lg font-medium" style={{ color: currentTheme.textMain }}>{percentiles.p70 || '--'}</span>
                  <span className="text-[10px] font-mono" style={{ color: currentTheme.textMuted }}>ms</span>
                </div>
              </div>

              <div className="backdrop-blur-xl rounded-2xl p-3.5 flex flex-col justify-between shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] transition-colors duration-300" style={{ backgroundColor: currentTheme.cardBg, borderColor: currentTheme.cardBorder, borderWidth: '1px' }}>
                <div className="text-[10px] uppercase tracking-wider font-mono" style={{ color: currentTheme.textMuted }}>P100 Latency</div>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-lg font-medium" style={{ color: currentTheme.textMain }}>{percentiles.p100 || '--'}</span>
                  <span className="text-[10px] font-mono" style={{ color: currentTheme.textMuted }}>ms</span>
                </div>
              </div>

              <div className="backdrop-blur-xl rounded-2xl p-3.5 flex flex-col justify-between shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] transition-colors duration-300" style={{ backgroundColor: currentTheme.cardBg, borderColor: currentTheme.cardBorder, borderWidth: '1px' }}>
                <div className="text-[10px] uppercase tracking-wider font-mono" style={{ color: currentTheme.textMuted }}>Total Runs</div>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-lg font-medium" style={{ color: currentTheme.textMain }}>{queryCount}</span>
                </div>
              </div>

              <div className="backdrop-blur-xl rounded-2xl p-3.5 flex flex-col justify-between shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] transition-colors duration-300" style={{ backgroundColor: currentTheme.cardBg, borderColor: currentTheme.cardBorder, borderWidth: '1px' }}>
                <div className="text-[10px] uppercase tracking-wider font-mono" style={{ color: currentTheme.textMuted }}>Active Provider</div>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-sm font-medium capitalize" style={{ color: currentTheme.textMain }}>{config.provider}</span>
                </div>
              </div>

            </div>

            <div className="backdrop-blur-2xl rounded-3xl overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] transition-colors duration-300" style={{ backgroundColor: currentTheme.cardBg, borderColor: currentTheme.cardBorder, borderWidth: '1px' }}>
              <div className="px-5 py-3 flex justify-between items-center" style={{ borderBottomColor: currentTheme.cardBorder, borderBottomWidth: '1px', backgroundColor: 'rgba(255,255,255,0.01)' }}>
                <div className="text-xs font-medium flex items-center gap-2" style={{ color: currentTheme.textMain }}>
                  <History size={14} style={{ color: currentTheme.accent }} /> Query History
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: currentTheme.accentBg, color: currentTheme.accent }}>{history.length}/{MAX_HISTORY}</span>
                </div>
                {history.length > 0 && (
                  <button
                    onClick={clearHistory}
                    className="text-[10px] font-mono px-2 py-0.5 rounded-md transition-opacity hover:opacity-70"
                    style={{ backgroundColor: currentTheme.accentBg, color: currentTheme.accent, borderColor: currentTheme.accentBorder, borderWidth: '1px' }}
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="p-4 space-y-2 max-h-[280px] overflow-y-auto">
                {history.length === 0 ? (
                  <span className="italic font-light text-xs" style={{ color: currentTheme.textMuted }}>Queries asked on this device will be saved here...</span>
                ) : (
                  history.map((h, i) => (
                    <div
                      key={`${h.ts}-${i}`}
                      onClick={() => loadTraceFromHistory(h)}
                      className={`rounded-xl px-3 py-2 flex items-start justify-between gap-3 transition-colors ${h.timings && Object.keys(h.timings).length > 0 ? 'cursor-pointer hover:opacity-80' : ''}`}
                      style={{
                        backgroundColor: selectedTs === h.ts ? currentTheme.accentBg : 'rgba(0,0,0,0.15)',
                        borderLeft: selectedTs === h.ts ? `2px solid ${currentTheme.accent}` : '2px solid transparent'
                      }}
                      title={h.timings ? `stt ${h.timings.stt_ms ?? '-'} / embed ${h.timings.embed_ms ?? '-'} / retrieve ${h.timings.retrieve_ms ?? '-'} / generate ${h.timings.generate_ms ?? '-'} ms` : undefined}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-medium truncate" style={{ color: currentTheme.textMain }}>{h.transcript || '(unrecognized audio)'}</div>
                        <div className="text-[11px] leading-snug line-clamp-2 mt-0.5" style={{ color: currentTheme.textMuted }}>{h.answer}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <span
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: h.refused ? 'rgba(244, 63, 94, 0.12)' : currentTheme.accentBg,
                            color: h.refused ? '#FB7185' : h.latency > 200 ? '#F59E0B' : currentTheme.accent
                          }}
                        >
                          {h.latency}ms
                        </span>
                        <div className="text-[9px] font-mono mt-1" style={{ color: currentTheme.textMuted }}>{new Date(h.ts).toLocaleTimeString()}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

        </div>

      </div>

      <footer className="w-full max-w-6xl pt-4 sm:pt-6 flex flex-col sm:flex-row items-center justify-between text-xs gap-3 relative z-10" style={{ borderTopColor: currentTheme.cardBorder, borderTopWidth: '1px', color: currentTheme.textMuted }}>
        <div className="flex items-center gap-2 font-mono">
          <Zap size={14} style={{ color: currentTheme.accent }} /> Retrieval SLA: &lt; 200ms &bull; E2E reported per query
        </div>
        <div className="flex items-center gap-4">
          <span className="font-medium font-mono" style={{ color: currentTheme.accent }}>#RAGInGoa</span>
        </div>
      </footer>

    </div>
  );
}