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
  Zap
} from 'lucide-react';

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

const SYSTEM_STATES = {
  IDLE: 'idle',
  LISTENING: 'listening',
  COMPUTING: 'computing',
  RESOLVED: 'resolved',
  FAULT: 'fault'
};

export default function App() {
  const [sysState, setSysState] = useState(SYSTEM_STATES.IDLE);
  const [errorMsg, setErrorMsg] = useState(null);
  const [output, setOutput] = useState({ transcript: '', answer: '' });
  const [latency, setLatency] = useState(0);
  const [config, setConfig] = useState({ provider: 'sarvam', strategy: 'hybrid-semantic', guardrails: true });
  const latenciesRef = useRef(loadStoredLatencies());
  const [percentiles, setPercentiles] = useState(() => computePercentiles(latenciesRef.current));
  const [queryCount, setQueryCount] = useState(latenciesRef.current.length);

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
    } catch (err) {
      setErrorMsg(err.message || 'Network orchestration failed.');
      setSysState(SYSTEM_STATES.FAULT);
    }
  };

  return (
    <div className="min-h-screen bg-[#050907] text-slate-200 font-sans selection:bg-lime-500/30 flex flex-col items-center justify-between p-3 sm:p-6 md:p-8 relative overflow-x-hidden">

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
      `}</style>

      <div className="absolute top-[-12%] left-[-10%] w-[55vw] h-[55vw] max-w-[650px] max-h-[650px] bg-lime-400/15 blur-[140px] rounded-full pointer-events-none animate-float-1" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[65vw] h-[65vw] max-w-[750px] max-h-[750px] bg-emerald-500/20 blur-[160px] rounded-full pointer-events-none animate-float-2" />
      <div className="absolute top-[22%] right-[4%] w-[45vw] h-[45vw] max-w-[520px] max-h-[520px] bg-yellow-200/10 blur-[120px] rounded-full pointer-events-none animate-float-3" style={{ animationDelay: '-6s' }} />
      <div className="absolute bottom-[16%] left-[6%] w-[40vw] h-[40vw] max-w-[480px] max-h-[480px] bg-teal-400/15 blur-[130px] rounded-full pointer-events-none animate-float-4" style={{ animationDelay: '-12s' }} />
      <div className="absolute top-[45%] left-[32%] w-[32vw] h-[32vw] max-w-[380px] max-h-[380px] bg-emerald-300/10 blur-[110px] rounded-full pointer-events-none animate-float-1" style={{ animationDelay: '-8s' }} />

      <div className="w-full max-w-6xl space-y-4 sm:space-y-6 relative z-10">

        <header className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3.5 py-3.5 px-4 sm:px-6 bg-white/[0.03] backdrop-blur-2xl border border-white/[0.08] rounded-2xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1),_0_12px_32px_rgba(0,0,0,0.4)]">
          <div className="flex items-center gap-3.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-b from-lime-400 via-emerald-400 to-teal-500 flex items-center justify-center shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.6),_0_0_20px_rgba(163,230,53,0.4)]">
              <Sparkles size={18} className="text-slate-950" />
            </div>
            <div>
              <h1 className="text-xs sm:text-sm font-semibold tracking-tight text-slate-100 flex items-center gap-2">
                Hacker House Goa
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">Task 2</span>
              </h1>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5">Voice RAG Orchestrator &bull; MSMARCO-XI</p>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/[0.06]">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-xs font-medium backdrop-blur-md">
              <span className={`w-2 h-2 rounded-full ${
                sysState === SYSTEM_STATES.LISTENING ? 'bg-lime-400 animate-ping' :
                sysState === SYSTEM_STATES.COMPUTING ? 'bg-amber-400 animate-pulse' :
                sysState === SYSTEM_STATES.RESOLVED ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' :
                sysState === SYSTEM_STATES.FAULT ? 'bg-rose-500' : 'bg-slate-500'
              }`} />
              <span className="capitalize text-slate-300 font-mono text-[11px]">{sysState}</span>
            </div>

            <div className="relative">
              <select
                value={config.provider}
                onChange={(e) => setConfig({ ...config, provider: e.target.value })}
                disabled={sysState === SYSTEM_STATES.LISTENING || sysState === SYSTEM_STATES.COMPUTING}
                className="appearance-none bg-white/[0.03] border border-white/[0.08] text-xs font-medium text-slate-200 px-3 py-1.5 pr-8 rounded-xl outline-none focus:border-emerald-400/50 transition-all cursor-pointer disabled:opacity-50"
              >
                <option value="sarvam" className="bg-[#0b100d]">Sarvam AI</option>
                <option value="elevenlabs" className="bg-[#0b100d]">ElevenLabs</option>
                <option value="groq-whisper" className="bg-[#0b100d]">Groq Whisper v3</option>
              </select>
              <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
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

            <div className="bg-white/[0.02] backdrop-blur-2xl border border-white/[0.08] rounded-3xl p-6 flex flex-col justify-between relative overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),_0_16px_40px_rgba(0,0,0,0.5)]">
              <div className="flex items-center justify-between mb-6">
                <div className="text-xs uppercase tracking-wider text-slate-400 font-medium flex items-center gap-2">
                  <AudioWaveform size={14} className="text-emerald-400" /> Neural Audio Capture
                </div>
                <div className="text-[10px] font-mono text-emerald-300/80 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                  Opus / WebM
                </div>
              </div>

              <div className="flex justify-center items-center py-6 relative">
                {sysState === SYSTEM_STATES.LISTENING && (
                  <div className="absolute m-auto w-36 h-36 border border-emerald-400/40 rounded-full animate-ping" />
                )}

                <button
                  onClick={sysState === SYSTEM_STATES.LISTENING ? haltCapture : initializeCapture}
                  disabled={sysState === SYSTEM_STATES.COMPUTING}
                  className={`relative z-10 w-28 h-28 rounded-full flex items-center justify-center transition-all duration-300 outline-none
                    ${sysState === SYSTEM_STATES.LISTENING
                      ? 'bg-rose-500/15 border border-rose-500/40 text-rose-300 shadow-[inset_0_2px_10px_rgba(244,63,94,0.3),_0_0_30px_rgba(244,63,94,0.3)] scale-95'
                      : 'bg-gradient-to-b from-white/[0.08] via-white/[0.03] to-transparent border border-white/[0.12] text-slate-100 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),_0_12px_36px_rgba(0,0,0,0.5)] hover:border-emerald-400/40 hover:text-emerald-300'
                    } disabled:opacity-50 disabled:cursor-not-allowed group`}
                >
                  {sysState === SYSTEM_STATES.LISTENING ? (
                    <Square size={28} className="fill-current animate-pulse" />
                  ) : (
                    <Mic size={32} className="transition-transform duration-300 group-hover:scale-110 text-emerald-300" />
                  )}
                </button>
              </div>

              <div className="mt-4 text-center">
                <div className="text-xs font-mono text-slate-400 h-5">
                  {sysState === SYSTEM_STATES.IDLE && 'Click microphone orb to stream voice query'}
                  {sysState === SYSTEM_STATES.LISTENING && <span className="text-emerald-300 font-medium">Recording speech... Click again to process</span>}
                  {sysState === SYSTEM_STATES.COMPUTING && <span className="text-amber-300 font-medium">Executing vector retrieval & synthesis...</span>}
                  {sysState === SYSTEM_STATES.RESOLVED && <span className="text-emerald-400 font-medium">Pipeline completed in {latency}ms</span>}
                  {sysState === SYSTEM_STATES.FAULT && <span className="text-rose-400 font-medium">Capture faulted</span>}
                </div>
              </div>
            </div>

            <div className="bg-white/[0.02] backdrop-blur-2xl border border-white/[0.08] rounded-3xl p-5 space-y-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
              <div className="flex items-center justify-between border-b border-white/[0.05] pb-3">
                <span className="text-xs font-medium text-slate-200 flex items-center gap-2">
                  <Sliders size={14} className="text-emerald-400" /> Retrieval Guardrails
                </span>
                <span className="text-[10px] font-mono text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">Active</span>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-slate-400 font-mono block mb-1.5">Chunking Strategy</label>
                  <select
                    value={config.strategy}
                    onChange={(e) => setConfig({ ...config, strategy: e.target.value })}
                    className="w-full bg-white/[0.03] border border-white/[0.08] text-xs font-medium text-slate-200 px-3 py-2 rounded-xl outline-none focus:border-emerald-400/50 transition-all cursor-pointer"
                  >
                    <option value="hybrid-semantic" className="bg-[#0b100d]">Hybrid Semantic + Overlap</option>
                    <option value="hierarchical" className="bg-[#0b100d]">Hierarchical Parent-Child</option>
                    <option value="metadata-aware" className="bg-[#0b100d]">Metadata-Aware MSMARCO</option>
                  </select>
                </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2">
                      <ShieldCheck size={14} className="text-emerald-400" />
                      <span className="text-xs text-slate-300">Grounding Filter</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-400/10 text-emerald-400 border border-emerald-400/20">ALWAYS ON</span>
                    </div>
                    <ShieldCheck size={14} className="text-emerald-400/60" />
                  </div>
              </div>
            </div>

          </div>

          <div className="lg:col-span-7 flex flex-col gap-4 sm:gap-6">

            <div className="bg-white/[0.02] backdrop-blur-2xl border border-white/[0.08] rounded-3xl overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
              <div className="px-5 py-3 border-b border-white/[0.05] flex justify-between items-center bg-white/[0.01]">
                <div className="text-xs font-medium text-slate-200 flex items-center gap-2">
                  <Activity size={14} className="text-emerald-400" /> STT Transcript
                </div>
                <span className="text-[10px] font-mono text-slate-400 capitalize">{config.provider} Engine</span>
              </div>
              <div className="p-5 text-xs sm:text-sm text-slate-200 leading-relaxed min-h-[75px] flex items-center">
                {sysState === SYSTEM_STATES.COMPUTING ? (
                  <div className="space-y-2 w-full animate-pulse">
                    <div className="h-2.5 bg-emerald-500/20 rounded w-3/4"></div>
                    <div className="h-2.5 bg-emerald-500/20 rounded w-1/2"></div>
                  </div>
                ) : (
                  output.transcript || <span className="text-slate-500 italic">Transcribed voice query will appear here...</span>
                )}
              </div>
            </div>

            <div className="bg-gradient-to-b from-emerald-950/20 via-white/[0.02] to-transparent backdrop-blur-2xl border border-white/[0.08] rounded-3xl overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),_0_12px_32px_rgba(0,0,0,0.4)]">
              <div className="px-5 py-3 border-b border-white/[0.05] flex justify-between items-center bg-white/[0.01]">
                <div className="text-xs font-medium text-emerald-200 flex items-center gap-2">
                  <Database size={14} className="text-emerald-400" /> Synthesized RAG Response
                </div>
                <span className="text-[10px] font-mono text-emerald-300/80 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">MSMARCO-XI</span>
              </div>
              <div className="p-5 text-xs sm:text-sm text-slate-100 leading-relaxed min-h-[110px] flex items-center">
                {sysState === SYSTEM_STATES.COMPUTING ? (
                  <div className="space-y-3 w-full animate-pulse">
                    <div className="h-2.5 bg-emerald-500/20 rounded w-full"></div>
                    <div className="h-2.5 bg-emerald-500/20 rounded w-5/6"></div>
                    <div className="h-2.5 bg-emerald-500/20 rounded w-4/6"></div>
                  </div>
                ) : (
                  output.answer || <span className="text-slate-500 italic font-light">Synthesized response will appear here...</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">

              <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.08] rounded-2xl p-3.5 flex flex-col justify-between shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">Net E2E</div>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className={`text-xl font-semibold tracking-tight ${latency > 200 ? 'text-amber-400' : 'text-emerald-300'}`}>
                    {latency > 0 ? latency : '--'}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">ms</span>
                </div>
              </div>

              <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.08] rounded-2xl p-3.5 flex flex-col justify-between shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">P50 Latency</div>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-lg font-medium text-slate-200">{percentiles.p50 || '--'}</span>
                  <span className="text-[10px] text-slate-500 font-mono">ms</span>
                </div>
              </div>

              <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.08] rounded-2xl p-3.5 flex flex-col justify-between shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">P70 Latency</div>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-lg font-medium text-slate-200">{percentiles.p70 || '--'}</span>
                  <span className="text-[10px] text-slate-500 font-mono">ms</span>
                </div>
              </div>

              <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.08] rounded-2xl p-3.5 flex flex-col justify-between shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">P100 Latency</div>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-lg font-medium text-slate-200">{percentiles.p100 || '--'}</span>
                  <span className="text-[10px] text-slate-500 font-mono">ms</span>
                </div>
              </div>

              <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.08] rounded-2xl p-3.5 flex flex-col justify-between shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">Total Runs</div>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-lg font-medium text-slate-200">{queryCount}</span>
                </div>
              </div>

              <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.08] rounded-2xl p-3.5 flex flex-col justify-between shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">Active Provider</div>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-sm font-medium text-slate-200 capitalize">{config.provider}</span>
                </div>
              </div>

            </div>

          </div>

        </div>

      </div>

      <footer className="w-full max-w-6xl pt-4 sm:pt-6 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-3 relative z-10">
        <div className="flex items-center gap-2 font-mono">
          <Zap size={14} className="text-emerald-400" /> Retrieval SLA: &lt; 200ms &bull; E2E reported per query
        </div>
        <div className="flex items-center gap-4">
          <span className="text-emerald-400 font-medium font-mono">#RAGInGoa</span>
        </div>
      </footer>

    </div>
  );
}
