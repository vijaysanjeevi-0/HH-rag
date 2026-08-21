import re
import hashlib

_SENT_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9\"'])")
_WORD = re.compile(r"[a-z0-9']+")

MAX_CHARS = {"hybrid-semantic": 220, "hierarchical": 120, "metadata-aware": 200}


def _sentences(text):
    text = re.sub(r"\s+", " ", text).strip()
    parts = _SENT_SPLIT.split(text)
    return [p.strip() for p in parts if p.strip()]


def passage_id_of(text):
    return hashlib.md5(text.encode("utf-8")).hexdigest()[:12]


def hybrid_semantic(passage):
    chunks, sents, cur = [], _sentences(passage["text"]), []
    limit = MAX_CHARS["hybrid-semantic"]
    for s in sents:
        if cur and sum(len(x) for x in cur) + len(s) > limit:
            chunks.append(" ".join(cur))
            cur = [cur[-1], s]
        else:
            cur.append(s)
    if cur:
        chunks.append(" ".join(cur))
    return [
        {"text": c, "meta": {"position": "body", "n_sentences": len(_sentences(c))}}
        for i, c in enumerate(chunks)
    ]


def hierarchical(passage):
    sents, groups, cur = _sentences(passage["text"]), [], []
    for s in sents:
        cur.append(s)
        if sum(len(x) for x in cur) >= MAX_CHARS["hierarchical"]:
            groups.append(" ".join(cur))
            cur = []
    if cur:
        if groups and len(cur) == 1:
            groups[-1] += " " + cur[0]
        else:
            groups.append(" ".join(cur))
    return [{"text": g, "meta": {"position": f"child-{i}", "parent": passage["passage_id"]}} for i, g in enumerate(groups)]


def metadata_aware(passage):
    sents = _sentences(passage["text"])
    if not sents:
        return []
    out = [{"text": sents[0], "meta": {"position": "lead"}}]
    body, cur, limit = sents[1:], [], MAX_CHARS["metadata-aware"]
    for s in body:
        if cur and sum(len(x) for x in cur) + len(s) > limit:
            out.append({"text": " ".join(cur), "meta": {"position": "body"}})
            cur = []
        cur.append(s)
    if cur:
        out.append({"text": " ".join(cur), "meta": {"position": "body"}})
    return out


STRATEGY_FNS = {
    "hybrid-semantic": hybrid_semantic,
    "hierarchical": hierarchical,
    "metadata-aware": metadata_aware,
}


def chunk_passages(passages, strategy):
    fn = STRATEGY_FNS[strategy]
    chunks, idx = [], 0
    for p in passages:
        for piece in fn(p):
            meta = dict(piece["meta"])
            meta.update({"strategy": strategy, "passage_id": p["passage_id"]})
            chunks.append({"chunk_id": idx, "text": piece["text"], "meta": meta})
            idx += 1
    return chunks
