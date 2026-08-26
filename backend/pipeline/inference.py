"""
inference.py
───────────────────────────────────────────────────────────────
Loads a frozen model artifact and analyses comments against it.

This is the deterministic half of the system. No language model, no
network, no randomness — clauses are embedded, compared against fixed
anchors by cosine similarity, and projected onto per-category sentiment
axes.

The logic here is identical to the notebook. If the two ever diverge,
the determinism guarantee is broken, so any change made here must be
mirrored there.
"""

import json
import hashlib
from pathlib import Path
from datetime import datetime

import numpy as np
import torch
import spacy
from sentence_transformers import SentenceTransformer


# ─── Determinism locks ────────────────────────────────────────
# Refuse any algorithm that is not reproducible, and disable gradient
# tracking since we only ever read the model.
torch.use_deterministic_algorithms(True)
torch.set_grad_enabled(False)

DECIMALS = 6

_NLP = None
_EMBEDDER = None
_ARTIFACT = None


# ══════════════════════════════════════════════════════════════
# Model loading
# ══════════════════════════════════════════════════════════════

def _weights_fingerprint(model) -> str:
    """Hash the embedding model's internal numbers."""
    h = hashlib.sha256()
    state = model.state_dict()
    for key in sorted(state.keys()):
        h.update(state[key].cpu().numpy().tobytes())
    return h.hexdigest()


def load_artifact(path):
    """
    Load a model artifact and the embedding model it was built with.

    Verifies two things: that the artifact has not been altered since it
    was written, and that the local embedding model matches the one used
    to build the anchors. Either mismatch produces silently wrong numbers,
    so both fail loudly instead.
    """
    global _EMBEDDER, _NLP, _ARTIFACT

    path = Path(path)
    with open(path, "r", encoding="utf-8") as f:
        artifact = json.load(f)

    # Verify the artifact's own fingerprint
    stored = artifact.pop("artifact_sha256", None)
    if stored:
        canonical = json.dumps(artifact, sort_keys=True, separators=(",", ":"))
        actual = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
        if actual != stored:
            raise ValueError(
                f"Artifact fingerprint mismatch for {path.name}. "
                f"This file has been modified since it was created."
            )
        artifact["artifact_sha256"] = stored

    # Load the embedding model, on CPU for determinism
    name = artifact["embedding"]["name"]
    if _EMBEDDER is None:
        _EMBEDDER = SentenceTransformer(name, device="cpu")
        _EMBEDDER.eval()

    expected = artifact["embedding"].get("weights_sha256")
    if expected and _weights_fingerprint(_EMBEDDER) != expected:
        raise RuntimeError(
            "Local embedding model does not match the one used to build "
            "this artifact. Vectors would not be comparable."
        )

    if _NLP is None:
        _NLP = spacy.load("en_core_web_sm")

    _ARTIFACT = artifact
    return artifact


def embed(texts):
    """
    Convert texts to vectors, one at a time.

    Batching pads shorter sequences, which changes floating-point
    accumulation order and perturbs the resulting vectors. One at a time
    means no padding, so a text's vector never depends on its neighbours.
    """
    out = []
    for t in texts:
        v = _EMBEDDER.encode(
            [t], batch_size=1, convert_to_numpy=True,
            normalize_embeddings=True, show_progress_bar=False,
        )[0]
        out.append(np.round(v, DECIMALS))
    return np.vstack(out)


# ══════════════════════════════════════════════════════════════
# Clause segmentation
# ══════════════════════════════════════════════════════════════
# Coordination is resolved by the dependency parse rather than by
# matching connective words, so "and" splits "bright and the battery
# lasts" but not "bright and clear".

def _has_modifier(token):
    for child in token.children:
        if child.dep_ in ("amod", "advmod"):
            return True
        if child.dep_ == "compound":
            for gc in child.children:
                if gc.dep_ in ("amod", "advmod"):
                    return True
    return False


def _is_clausal_conjunct(token):
    """Does this coordinated token begin a new clause, or is it just a
    coordinated word?"""
    if token.pos_ in ("VERB", "AUX"):
        return True
    for child in token.children:
        if child.dep_ in ("nsubj", "nsubjpass"):
            return True
    if token.pos_ in ("NOUN", "PROPN"):
        if _has_modifier(token) and _has_modifier(token.head):
            return True
    return False


def _strip_leading_joiner(text, joiners):
    text = text.lstrip(" ,;\u2014\u2013")
    parts = text.split(None, 1)
    if parts and parts[0].lower().strip(",") in joiners:
        text = parts[1] if len(parts) > 1 else ""
    return text.strip(" ,;\u2014\u2013").strip()


def segment(comment, artifact=None):
    """Split one comment into clauses."""
    art = artifact or _ARTIFACT
    cfg = art.get("segmentation", {})
    hard = set(cfg.get("hard_breaks", [";", "\u2014", "\u2013"]))
    joiners = set(cfg.get("leading_joiners",
                          ["and", "but", "or", "yet", "so", "however",
                           "although", "though", "whereas", "nor"]))
    min_words = cfg.get("min_words", 3)

    doc = _NLP(str(comment).strip())
    clauses = []

    for sentence in doc.sents:
        breaks = set()
        for token in sentence:
            if token.dep_ == "conj" and _is_clausal_conjunct(token):
                # A clause starts at the leftmost word of the conjunct's
                # whole branch, not at the conjunct itself.
                start = min(t.i for t in token.subtree)
                if start > sentence.start:
                    prev = doc[start - 1]
                    if prev.dep_ == "cc" or prev.text in {",", ";"}:
                        start -= 1
                breaks.add(start)
            elif token.text in hard:
                breaks.add(token.i + 1)

        cuts = sorted(breaks | {sentence.start, sentence.end})
        for a, b in zip(cuts, cuts[1:]):
            t = _strip_leading_joiner(doc[a:b].text, joiners)
            if t:
                clauses.append(t)

    out = [c for c in clauses if len(c.split()) >= min_words]
    # Every comment must be categorised, so never return nothing
    return out if out else [str(comment).strip()]


# ══════════════════════════════════════════════════════════════
# Inference
# ══════════════════════════════════════════════════════════════

def _rescale(raw, scale):
    """Map a raw projection onto [-1, +1] using calibrated percentiles."""
    p5, p95 = scale["p5"], scale["p95"]
    if p95 == p5:
        return 0.0
    return round(float(np.clip((raw - p5) / (p95 - p5) * 2 - 1, -1, 1)), 4)


def analyse_comment(comment, artifact=None):
    """
    Analyse ONE comment in complete isolation.

    Takes one comment and one artifact and nothing else. It cannot be
    influenced by other comments, dataset statistics, or processing
    order, because it never sees any of them. That is the determinism
    guarantee expressed as a function signature.
    """
    art = artifact or _ARTIFACT
    centre = np.array(art["centering_vector"])
    cats = art["categories"]

    collected = {c["id"]: [] for c in cats}

    for clause in segment(comment, art):
        v = embed([clause])[0] - centre
        n = np.linalg.norm(v)
        if n == 0:
            continue
        v = v / n

        sims = {c["id"]: round(float(v @ np.array(c["anchor"])), 6)
                for c in cats}
        hits = [c["id"] for c in cats if sims[c["id"]] >= c["threshold"]]
        if not hits:
            hits = [max(sims, key=sims.get)]

        for cid in hits:
            cat = next(c for c in cats if c["id"] == cid)
            raw = float(v @ np.array(cat["sentiment_axis"]))
            collected[cid].append(_rescale(raw, cat["sentiment_scale"]))

    return {cid: (round(float(np.mean(s)), 4) if s else 0.0)
            for cid, s in collected.items()}


def analyse_many(comments, artifact=None, progress=None):
    """
    Analyse a list of comments.

    Deliberately a plain loop — no batching, no shared state, no
    cross-comment computation. Each row is produced in isolation.
    """
    art = artifact or _ARTIFACT
    names = {c["id"]: c["name"] for c in art["categories"]}
    rows = []

    for i, comment in enumerate(comments):
        scores = analyse_comment(comment, art)
        row = {"id": i + 1, "comment": comment}
        for cid, score in scores.items():
            row[names[cid]] = score
        rows.append(row)

        if progress and (i + 1) % 25 == 0:
            progress(i + 1, len(comments))

    return rows


# ══════════════════════════════════════════════════════════════
# Report
# ══════════════════════════════════════════════════════════════

def build_report(rows, artifact=None, dep_var=None):
    """Turn the results table into the figures the dashboard displays."""
    art = artifact or _ARTIFACT
    names = [c["name"] for c in art["categories"]]

    per_category = []
    for name in names:
        vals = [r[name] for r in rows if r.get(name, 0) != 0]
        mean = float(np.mean(vals)) if vals else 0.0
        per_category.append({
            "name": name,
            "count": len(vals),
            "sentiment": round(mean, 4),
            # Impact: how common multiplied by how strongly felt
            "impact": round(len(vals) / max(len(rows), 1) * abs(mean), 4),
        })

    all_scores = [r[n] for r in rows for n in names if r.get(n, 0) != 0]
    most_frequent = (max(per_category, key=lambda c: c["count"])["name"]
                     if per_category else "\u2014")

    return {
        "name": art["name"],
        "date": datetime.now().strftime("%b %d, %Y"),
        "rowsProcessed": len(rows),
        "mostFreqCategory": most_frequent,
        "avgSentiment": round(float(np.mean(all_scores)), 4) if all_scores else 0.0,
        "immediateActionables": sum(1 for s in all_scores if s < -0.5),
        "categories": per_category,
        "hasDependentVariable": bool(dep_var),
    }
