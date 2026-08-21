import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Mic, 
  Square, 
  Activity, 
  AudioWaveform, 
  Sliders, 
  Database, 
  CheckCircle2, 
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
    payload.append('guardrails', config.guardrails);

    try {
      const endpoint = import.meta.env.VITE_API_ENDPOINT || 'https://voice-hhgoa.onrender.com/api/v1/query';
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
    <div className="min-h-screen bg-[#070708] text-zinc-100 font-sans selection:bg-indigo-500/30 flex flex-col items-center justify-between p-3 sm:p-6 md:p-8 relative overflow-x-hidden">
      
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[300px] sm:w-[800px] h-[250px] sm:h-[350px] bg-gradient-to-b from-indigo-500/[0.07] via-purple-500/[0.03] to-transparent blur-[90px] sm:blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[250px] sm:w-[600px] h-[250px] sm:h-[400px] bg-blue-500/[0.04] blur-[120px] sm:blur-[150px] pointer-events-none" />

      <div className="w-full max-w-6xl space-y-4 sm:space-y-6 relative z-10">
        
        <header className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3.5 py-3.5 px-4 sm:px-6 bg-zinc-900/60 backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.37)]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0 shadow-[0_0_20px_rgba(99,102,241,0.4)]">
              <Sparkles size={16} className="text-white sm:w-[18px] sm:h-[18px]" />
            </div>
            <div>
              <h1 className="text-xs sm:text-sm font-semibold tracking-tight text-white flex flex-wrap items-center gap-1.5">
                Hacker House Goa <span className="text-[10px] sm:text-xs font-mono px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">Task 2</span>
              </h1>
              <p className="text-[11px] sm:text-xs text-zinc-400 font-mono">Voice RAG &bull; MSMARCO-XI</p>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2.5 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/[0.06]">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-xs font-medium">
              <span className={`w-2 h-2 rounded-full ${
                sysState === SYSTEM_STATES.LISTENING ? 'bg-indigo-500 animate-ping' :
                sysState === SYSTEM_STATES.COMPUTING ? 'bg-amber-500 animate-pulse' :
                sysState === SYSTEM_STATES.RESOLVED ? 'bg-emerald-500' :
                sysState === SYSTEM_STATES.FAULT ? 'bg-rose-500' : 'bg-zinc-500'
              }`} />
              <span className="capitalize text-zinc-300 font-mono text-[11px]">{sysState}</span>
            </div>

            <div className="relative flex-1 sm:flex-initial">
              <select 
                value={config.provider}
                onChange={(e) => setConfig({ ...config, provider: e.target.value })}
                disabled={sysState === SYSTEM_STATES.LISTENING || sysState === SYSTEM_STATES.COMPUTING}
                className="w-full sm:w-auto appearance-none bg-white/[0.03] border border-white/[0.08] text-xs font-medium text-zinc-300 px-3 py-2 pr-8 rounded-xl outline-none focus:border-indigo-500/50 transition-all disabled:opacity-50 cursor-pointer"
              >
                <option value="sarvam" className="bg-[#121214]">Sarvam AI</option>
                <option value="elevenlabs" className="bg-[#121214]">ElevenLabs</option>
              </select>
              <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
            </div>
          </div>
        </header>

        {errorMsg && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-4 py-3 rounded-2xl text-xs flex items-center gap-3 backdrop-blur-md">
            <AlertTriangle size={16} className="shrink-0" /> 
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
          
          <div className="lg:col-span-5 flex flex-col gap-4 sm:gap-6">
            
            <div className="bg-zinc-900/40 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-6 sm:p-8 flex flex-col justify-between relative overflow-hidden shadow-[0_8px_32px_0_rgba(0,0,0,0.37)]">
              <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />
              
              <div className="flex items-center justify-between relative z-10 mb-6 sm:mb-8">
                <div className="text-[11px] sm:text-xs uppercase tracking-wider text-zinc-400 font-medium flex items-center gap-2">
                  <AudioWaveform size={14} className="text-indigo-400" /> Neural Audio Capture
                </div>
                <div className="text-[10px] font-mono text-zinc-500 bg-white/[0.03] px-2 py-1 rounded-lg border border-white/[0.05]">
                  WebM / Opus
                </div>
              </div>

              <div className="relative flex justify-center items-center py-4 sm:py-6 relative z-10">
                {sysState === SYSTEM_STATES.LISTENING && (
                  <>
                    <div className="absolute inset-0 m-auto w-36 h-36 sm:w-40 sm:h-40 bg-indigo-500/20 rounded-full blur-2xl animate-pulse" />
                    <div className="absolute inset-0 m-auto w-28 h-28 sm:w-32 sm:h-32 bg-indigo-400/15 rounded-full animate-ping" />
                  </>
                )}
                
                <button
                  onClick={sysState === SYSTEM_STATES.LISTENING ? haltCapture : initializeCapture}
                  disabled={sysState === SYSTEM_STATES.COMPUTING}
                  className={`relative z-10 w-24 h-24 sm:w-28 sm:h-28 rounded-3xl flex items-center justify-center transition-all duration-300 backdrop-blur-xl border active:scale-95 ${
                    sysState === SYSTEM_STATES.LISTENING 
                      ? 'bg-rose-500/15 border-rose-500/30 text-rose-400 shadow-[0_0_40px_rgba(244,63,94,0.3)] scale-95'
                      : 'bg-gradient-to-b from-white/[0.08] to-white/[0.02] border-white/[0.12] text-white hover:border-indigo-500/50 hover:shadow-[0_0_30px_rgba(99,102,241,0.2)]'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {sysState === SYSTEM_STATES.LISTENING ? <Square size={26} className="fill-current animate-pulse" /> : <Mic size={26} />}
                </button>
              </div>

              <div className="mt-4 sm:mt-6 text-center relative z-10">
                <div className="text-xs font-mono text-zinc-400 h-5">
                  {sysState === SYSTEM_STATES.IDLE && 'Tap orb to start voice pipeline'}
                  {sysState === SYSTEM_STATES.LISTENING && <span className="text-indigo-400 font-medium">Listening to speech...</span>}
                  {sysState === SYSTEM_STATES.COMPUTING && <span className="text-amber-400 font-medium">Vector retrieval & inference...</span>}
                  {sysState === SYSTEM_STATES.RESOLVED && <span className="text-emerald-400 font-medium">Pipeline completed successfully</span>}
                  {sysState === SYSTEM_STATES.FAULT && <span className="text-rose-400 font-medium">Execution aborted</span>}
                </div>
              </div>
            </div>

            <div className="bg-zinc-900/40 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-5 sm:p-6 space-y-4 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)]">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                <span className="text-xs font-medium text-zinc-300 flex items-center gap-2">
                  <Sliders size={14} className="text-indigo-400" /> Retrieval & Guardrails
                </span>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">Active</span>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium block mb-1">Chunking Strategy</label>
                  <select 
                    value={config.strategy}
                    onChange={(e) => setConfig({ ...config, strategy: e.target.value })}
                    className="w-full bg-white/[0.03] border border-white/[0.08] text-xs font-medium text-zinc-300 px-3 py-2.5 rounded-xl outline-none focus:border-indigo-500/50 transition-all cursor-pointer"
                  >
                    <option value="hybrid-semantic" className="bg-[#121214]">Hybrid Semantic + Overlap</option>
                    <option value="hierarchical" className="bg-[#121214]">Hierarchical Parent-Child</option>
                    <option value="metadata-aware" className="bg-[#121214]">Metadata-Aware MSMARCO</option>
                  </select>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={14} className="text-indigo-400" />
                    <span className="text-xs text-zinc-300">Grounding Guardrails</span>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={config.guardrails}
                    onChange={(e) => setConfig({ ...config, guardrails: e.target.checked })}
                    className="accent-indigo-500 w-4 h-4 rounded cursor-pointer"
                  />
                </div>
              </div>
            </div>

          </div>

          <div className="lg:col-span-7 flex flex-col gap-4 sm:gap-6">
            
            <div className="bg-zinc-900/40 backdrop-blur-xl border border-white/[0.08] rounded-3xl overflow-hidden shadow-[0_8px_32px_0_rgba(0,0,0,0.37)]">
              <div className="px-5 sm:px-6 py-3 border-b border-white/[0.06] flex justify-between items-center bg-white/[0.01]">
                <div className="text-xs font-medium text-zinc-300 flex items-center gap-2">
                  <Activity size={14} className="text-indigo-400" /> STT Transcript
                </div>
                <span className="text-[10px] font-mono text-zinc-500">Sarvam / Whisper</span>
              </div>
              <div className="p-5 sm:p-6 text-xs sm:text-sm text-zinc-200 leading-relaxed min-h-[80px] flex items-center">
                {sysState === SYSTEM_STATES.COMPUTING ? (
                  <div className="space-y-2 w-full animate-pulse">
                    <div className="h-3 bg-white/5 rounded-full w-4/5"></div>
                    <div className="h-3 bg-white/5 rounded-full w-2/3"></div>
                  </div>
                ) : (
                  output.transcript || <span className="text-zinc-600 italic">Spoken query will appear here instantly...</span>
                )}
              </div>
            </div>

            <div className="bg-zinc-900/40 backdrop-blur-xl border border-white/[0.08] rounded-3xl overflow-hidden shadow-[0_8px_32px_0_rgba(0,0,0,0.37)]">
              <div className="px-5 sm:px-6 py-3 border-b border-white/[0.06] flex justify-between items-center bg-white/[0.01]">
                <div className="text-xs font-medium text-zinc-300 flex items-center gap-2">
                  <Database size={14} className="text-indigo-400" /> RAG Synthesized Answer
                </div>
                <span className="text-[10px] font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">MSMARCO-XI</span>
              </div>
              <div className="p-5 sm:p-6 text-xs sm:text-sm text-zinc-100 leading-relaxed min-h-[120px] flex items-center">
                {sysState === SYSTEM_STATES.COMPUTING ? (
                  <div className="space-y-3 w-full animate-pulse">
                    <div className="h-3 bg-white/5 rounded-full w-full"></div>
                    <div className="h-3 bg-white/5 rounded-full w-5/6"></div>
                    <div className="h-3 bg-white/5 rounded-full w-3/4"></div>
                  </div>
                ) : (
                  output.answer || <span className="text-zinc-600 italic font-light">Grounded vector retrieval output awaiting orchestrator...</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
              
              <div className="bg-zinc-900/40 backdrop-blur-xl border border-white/[0.08] rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Net Latency</div>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className={`text-xl sm:text-2xl font-light tracking-tight ${latency > 200 ? 'text-rose-400' : 'text-white'}`}>
                    {latency > 0 ? latency : '--'}
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono">ms</span>
                </div>
              </div>

              <div className="bg-zinc-900/40 backdrop-blur-xl border border-white/[0.08] rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">P50 Latency</div>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-lg sm:text-xl font-light text-zinc-200">{percentiles.p50 ?? '--'}</span>
                  <span className="text-[10px] text-zinc-500 font-mono">ms</span>
                </div>
              </div>

              <div className="bg-zinc-900/40 backdrop-blur-xl border border-white/[0.08] rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">P70 Latency</div>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-lg sm:text-xl font-light text-zinc-200">{percentiles.p70 ?? '--'}</span>
                  <span className="text-[10px] text-zinc-500 font-mono">ms</span>
                </div>
              </div>

              <div className="bg-zinc-900/40 backdrop-blur-xl border border-white/[0.08] rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">P100 Latency</div>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-lg sm:text-xl font-light text-zinc-200">{percentiles.p100 ?? '--'}</span>
                  <span className="text-[10px] text-zinc-500 font-mono">ms</span>
                </div>
              </div>

              <div className="bg-zinc-900/40 backdrop-blur-xl border border-white/[0.08] rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Queries</div>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-lg sm:text-xl font-light text-zinc-200">{queryCount}</span>
                </div>
              </div>

              <div className="bg-zinc-900/40 backdrop-blur-xl border border-white/[0.08] rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">STT Provider</div>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-sm sm:text-base font-light text-zinc-200 capitalize">{config.provider}</span>
                </div>
              </div>

            </div>

          </div>

        </div>

      </div>

      <footer className="w-full max-w-6xl mt-6 pt-4 sm:pt-6 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between text-xs text-zinc-500 gap-3 text-center sm:text-left">
        <div className="flex items-center gap-2 font-mono justify-center">
          <Zap size={14} className="text-indigo-400" /> SLA Target: &lt; 200ms end-to-end execution
        </div>
        <div className="flex items-center gap-4">
          <span className="text-indigo-400 font-medium">#RAGInGoa</span>
        </div>
      </footer>

    </div>
  );
}