import time

import config
import guardrails
import llm
import stt


async def run_query(indexes, embedder, audio_bytes=None, text=None, stt_provider="sarvam", chunking_strategy="hybrid-semantic", use_guardrails=True):
    timings = {}
    t0 = time.perf_counter()

    if text is None:
        t = time.perf_counter()
        text = await stt.transcribe(audio_bytes, stt_provider)
        timings["stt_ms"] = round((time.perf_counter() - t) * 1000)
    else:
        timings["stt_ms"] = 0

    ok, reason = guardrails.check_input(text)
    if not ok:
        return _refusal(text, reason, timings, t0)

    t = time.perf_counter()
    qvec = embedder.embed_query(text)
    timings["embed_ms"] = round((time.perf_counter() - t) * 1000)

    index = indexes.get(chunking_strategy)
    if index is None:
        raise RuntimeError(f"Index not loaded for strategy: {chunking_strategy}")

    t = time.perf_counter()
    hits = index.search(qvec, config.TOP_K)
    contexts = index.texts_for(hits)
    timings["retrieve_ms"] = round((time.perf_counter() - t) * 1000)

    if use_guardrails:
        ok, reason = guardrails.check_off_topic(hits[0][1])
        if not ok:
            return _refusal(text, reason, timings, t0, contexts=contexts)

    t = time.perf_counter()
    try:
        answer, grounded = await llm.generate(text, contexts)
    except RuntimeError:
        answer, grounded = guardrails.extractive_fallback(contexts), True
        fallback = "extractive"
    else:
        fallback = None
    timings["generate_ms"] = round((time.perf_counter() - t) * 1000)

    if use_guardrails and not grounded:
        answer = guardrails.extractive_fallback(contexts)
    if use_guardrails and not guardrails.grounding_check(answer, contexts):
        return _refusal(text, "ungrounded", timings, t0, contexts=contexts)

    timings["total_ms"] = round((time.perf_counter() - t0) * 1000)
    return {
        "transcript": text,
        "answer": answer,
        "sources": [{"score": c["score"], "passage_id": c["passage_id"], "excerpt": c["text"][:160]} for c in contexts],
        "timings": timings,
        "fallback": fallback,
        "refused": False,
        "refusal_reason": None,
    }


def _refusal(transcript, reason, timings, t0, contexts=None):
    timings["total_ms"] = round((time.perf_counter() - t0) * 1000)
    return {
        "transcript": transcript,
        "answer": guardrails.REFUSALS[reason],
        "sources": [{"score": c["score"], "passage_id": c["passage_id"], "excerpt": c["text"][:160]} for c in (contexts or [])],
        "timings": timings,
        "fallback": None,
        "refused": True,
        "refusal_reason": reason,
    }
