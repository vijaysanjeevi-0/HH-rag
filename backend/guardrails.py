import re

import config

UNSAFE_PATTERNS = [
    r"\b(kill (myself|him|her|them|you))\b",
    r"\b(how to (make|build).{0,20}(bomb|explosive|weapon))\b",
    r"\b(child (porn|abuse))\b",
    r"\b(hack into|steal) .{0,20}(account|credit card|bank)\b",
]

REFUSALS = {
    "unsafe_input": "This query can't be processed — it violates the safety policy.",
    "no_relevant_context": "No relevant passage was found in the corpus for this question, so I won't guess. Try rephrasing or ask something covered by the indexed passages.",
    "ungrounded": "The retrieved context wasn't strong enough to produce a grounded answer. I'd rather not answer than risk hallucinating.",
}

_TOKEN = re.compile(r"[a-z0-9']+")


def check_input(text):
    lowered = text.lower()
    for pattern in UNSAFE_PATTERNS:
        if re.search(pattern, lowered):
            return False, "unsafe_input"
    if not text.strip() or len(text.strip()) < 2:
        return False, "no_relevant_context"
    return True, None


def check_off_topic(top_score):
    if top_score < config.OFF_TOPIC_THRESHOLD:
        return False, "no_relevant_context"
    return True, None


def _tokens(text):
    return set(_TOKEN.findall(text.lower()))


def grounding_check(answer, contexts):
    answer_tokens = _tokens(answer)
    if not answer_tokens:
        return False
    context_tokens = set()
    for c in contexts:
        context_tokens |= _tokens(c["text"])
    overlap = len(answer_tokens & context_tokens) / len(answer_tokens)
    return overlap >= config.GROUNDING_MIN_OVERLAP


def extractive_fallback(contexts):
    best = max(contexts, key=lambda c: c["score"]) if contexts else None
    if not best:
        return REFUSALS["ungrounded"]
    sents = re.split(r"(?<=[.!?])\s+", best["text"])
    return " ".join(sents[:2]).strip()
