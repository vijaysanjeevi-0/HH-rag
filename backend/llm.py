import httpx

import config

SYSTEM_PROMPT = """You are a retrieval-grounded answer engine. Rules:
1. Answer ONLY using the provided context passages.
2. If the context does not contain the answer, set "grounded" to false and leave "answer" empty.
3. Be concise: 1-3 sentences maximum.
4. Never use outside knowledge. Never invent facts.

Respond with strict JSON: {"answer": "<your answer>", "grounded": <true|false>}"""

MODEL = "openai/gpt-oss-20b"


async def generate(question, contexts):
    if not config.GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY not set")
    context_block = "\n\n".join(f"[{i+1}] {c['text']}" for i, c in enumerate(contexts))
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Context:\n{context_block}\n\nQuestion: {question}"},
        ],
        "temperature": 0.0,
        "max_tokens": 200,
        "response_format": {"type": "json_object"},
    }
    headers = {"Authorization": f"Bearer {config.GROQ_API_KEY}"}
    last_err = None
    for attempt in range(config.RETRIES + 1):
        try:
            async with httpx.AsyncClient(timeout=config.LLM_TIMEOUT) as client:
                resp = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    json=payload, headers=headers,
                )
                resp.raise_for_status()
                content = resp.json()["choices"][0]["message"]["content"]
                return _parse(content)
        except Exception as err:
            last_err = err
    raise RuntimeError(f"LLM failed after retries: {last_err}")


def _parse(content):
    import json
    try:
        obj = json.loads(content)
        return str(obj.get("answer", "")), bool(obj.get("grounded", False))
    except json.JSONDecodeError:
        return content.strip(), True
