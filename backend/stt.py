import asyncio

import httpx

import config


async def _post_with_retry(url, headers=None, files=None, data=None, timeout=None):
    last_err = None
    for attempt in range(config.RETRIES + 1):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(url, headers=headers or {}, files=files, data=data)
                resp.raise_for_status()
                return resp.json()
        except Exception as err:
            last_err = err
            if attempt < config.RETRIES:
                await asyncio.sleep(0.5 * (attempt + 1))
    raise RuntimeError(f"STT failed after retries: {last_err}")


async def transcribe_sarvam(audio_bytes):
    if not config.SARVAM_API_KEY:
        raise RuntimeError("SARVAM_API_KEY not set")
    data = await _post_with_retry(
        "https://api.sarvam.ai/speech-to-text",
        headers={"api-subscription-key": config.SARVAM_API_KEY},
        files={"file": ("query.webm", audio_bytes, "audio/webm")},
        data={"model": "saarika:v2"},
        timeout=config.STT_TIMEOUT,
    )
    for key in ("transcript", "text", "transcription"):
        if data.get(key):
            return data[key]
    raise RuntimeError(f"Unexpected Sarvam response: {str(data)[:200]}")


async def transcribe_elevenlabs(audio_bytes):
    if not config.ELEVENLABS_API_KEY:
        raise RuntimeError("ELEVENLABS_API_KEY not set")
    data = await _post_with_retry(
        "https://api.elevenlabs.io/v1/speech-to-text",
        headers={"xi-api-key": config.ELEVENLABS_API_KEY},
        files={"file": ("query.webm", audio_bytes, "audio/webm")},
        data={"model_id": "scribe_v1"},
        timeout=config.STT_TIMEOUT,
    )
    if data.get("text"):
        return data["text"]
    raise RuntimeError(f"Unexpected ElevenLabs response: {str(data)[:200]}")


async def transcribe_groq_whisper(audio_bytes):
    if not config.GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY not set")
    data = await _post_with_retry(
        "https://api.groq.com/openai/v1/audio/transcriptions",
        headers={"Authorization": f"Bearer {config.GROQ_API_KEY}"},
        files={"file": ("query.webm", audio_bytes, "audio/webm")},
        data={"model": "whisper-large-v3", "response_format": "json"},
        timeout=config.STT_TIMEOUT,
    )
    if data.get("text"):
        return data["text"]
    raise RuntimeError(f"Unexpected Groq Whisper response: {str(data)[:200]}")


PROVIDER_FNS = {
    "sarvam": transcribe_sarvam,
    "elevenlabs": transcribe_elevenlabs,
    "groq-whisper": transcribe_groq_whisper,
}


FALLBACK_CHAIN = ("elevenlabs", "groq-whisper", "sarvam")


async def transcribe(audio_bytes, provider):
    order = [provider] if provider in PROVIDER_FNS else []
    order += [p for p in FALLBACK_CHAIN if p != provider]
    last_err = None
    for p in order:
        try:
            return await PROVIDER_FNS[p](audio_bytes)
        except Exception as e:
            last_err = e
    raise RuntimeError(f"All STT providers failed ({provider} first): {last_err}")
