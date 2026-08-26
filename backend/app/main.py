"""
main.py
───────────────────────────────────────────────────────────────
Minimal API for the demonstration.

Four endpoints, deliberately. This serves the "Use existing model"
path only: list models, read a CSV's columns, run analysis, fetch
the report.

Model creation is not exposed here. It runs as a batch process in a
notebook because it requires a language model, takes tens of minutes,
and is a one-off human-supervised operation — not something to trigger
from a web request.

Run with:
    uvicorn backend.app.main:app --reload --port 8000

Then open http://localhost:8000/docs to test each endpoint by hand.
"""

import io
import json
import uuid
from pathlib import Path
from datetime import datetime

import pandas as pd
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from backend.pipeline import inference

app = FastAPI(title="Listen and Learn API")

# CORS — the browser blocks requests from one port to another unless
# the server explicitly permits it. React runs on 5173, this on 8000.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

MODELS_DIR = Path("backend/store/models")

# Results held in memory. A real deployment would use a database;
# for a single-user demonstration a dictionary is sufficient.
RESULTS = {}


# ══════════════════════════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════════════════════════

def _read_csv(content: bytes) -> pd.DataFrame:
    """Read an uploaded CSV, tolerating the usual encoding problems."""
    for encoding in ("utf-8", "latin-1", "cp1252"):
        try:
            return pd.read_csv(io.BytesIO(content), encoding=encoding)
        except UnicodeDecodeError:
            continue
    raise HTTPException(400, "Could not read the CSV — unrecognised encoding.")


def _model_path(model_id: str) -> Path:
    path = MODELS_DIR / f"{model_id}.json"
    if not path.exists():
        raise HTTPException(404, f"No model with id {model_id}")
    return path


# ══════════════════════════════════════════════════════════════
# Endpoints
# ══════════════════════════════════════════════════════════════

@app.get("/health")
def health():
    """Confirm the server is running."""
    return {"status": "ok", "models_dir": str(MODELS_DIR.resolve())}


@app.get("/models")
def list_models():
    """
    Every saved model, for the "Select existing model" screen.
    """
    if not MODELS_DIR.exists():
        return {"models": []}

    out = []
    for file in sorted(MODELS_DIR.glob("*.json")):
        try:
            with open(file, "r", encoding="utf-8") as f:
                a = json.load(f)
            out.append({
                "model_id": a["model_id"],
                "name": a.get("name", file.stem),
                "description": a.get("description", ""),
                "date": datetime.fromisoformat(
                    a["created_utc"]).strftime("%b %d, %Y"),
                "categoryCount": len(a.get("categories", [])),
            })
        except Exception as e:
            print(f"Skipping unreadable model {file.name}: {e}")

    # Newest first
    out.sort(key=lambda m: m["model_id"], reverse=True)
    return {"models": out}


@app.get("/models/{model_id}")
def get_model(model_id: str):
    """One model's categories, for the category review screen."""
    with open(_model_path(model_id), "r", encoding="utf-8") as f:
        a = json.load(f)
    return {
        "model_id": a["model_id"],
        "name": a["name"],
        "description": a.get("description", ""),
        "categories": [
            {"id": c["id"], "name": c["name"], "description": c["description"]}
            for c in a["categories"]
        ],
    }


@app.post("/inspect")
async def inspect_csv(file: UploadFile = File(...)):
    """
    Read an uploaded CSV and return its column names.

    Feeds the "which column contains the comments?" dropdown. The
    notebook hardcodes this because a human can see the columns; the
    application must ask.
    """
    df = _read_csv(await file.read())

    # Suggest the column most likely to hold free text: the one with the
    # longest average string length among text columns.
    suggestion = None
    best_len = 0
    for col in df.columns:
        if df[col].dtype == object:
            avg = df[col].dropna().astype(str).str.len().mean()
            if avg and avg > best_len:
                best_len, suggestion = avg, col

    return {
        "columns": list(df.columns),
        "rowCount": int(len(df)),
        "suggested": suggestion,
    }


@app.post("/models/{model_id}/analyse")
async def analyse(
    model_id: str,
    file: UploadFile = File(...),
    column: str = Form(...),
    dep_var: str = Form(""),
    limit: int = Form(200),
):
    """
    Run a dataset through a finished model.

    Synchronous by design. Embedding runs one clause at a time on CPU,
    so 200 comments takes roughly twenty seconds — which the frontend
    covers with its animation. A background job queue would be correct
    for production but adds failure modes not worth carrying here.

    `limit` caps the row count so a large upload cannot stall the demo.
    """
    artifact = inference.load_artifact(_model_path(model_id))

    df = _read_csv(await file.read())
    if column not in df.columns:
        raise HTTPException(400, f"Column '{column}' not found in the file.")

    comments = (df[column].dropna().astype(str)
                .drop_duplicates().tolist()[:limit])

    if not comments:
        raise HTTPException(400, f"Column '{column}' contains no text.")

    print(f"Analysing {len(comments)} comments with {artifact['name']}…")
    rows = inference.analyse_many(
        comments, artifact,
        progress=lambda i, n: print(f"   {i}/{n}")
    )

    dv = dep_var if dep_var and dep_var != "--N/A (Skip)--" else None
    report = inference.build_report(rows, artifact, dv)

    result_id = str(uuid.uuid4())[:8]
    RESULTS[result_id] = {"report": report, "rows": rows}

    print(f"Done. Result id {result_id}")
    return {"result_id": result_id, "report": report}


@app.get("/results/{result_id}")
def get_results(result_id: str):
    """The finished report, for the dashboard."""
    if result_id not in RESULTS:
        raise HTTPException(404, "No such result. It may have expired.")
    return RESULTS[result_id]["report"]


@app.get("/results/{result_id}/rows")
def get_rows(result_id: str, limit: int = 50):
    """The per-comment table, for the results detail view."""
    if result_id not in RESULTS:
        raise HTTPException(404, "No such result.")
    return {"rows": RESULTS[result_id]["rows"][:limit]}


@app.get("/results/{result_id}/export")
def export_csv(result_id: str):
    """Download the full results table as CSV."""
    if result_id not in RESULTS:
        raise HTTPException(404, "No such result.")

    df = pd.DataFrame(RESULTS[result_id]["rows"])
    stream = io.StringIO()
    df.to_csv(stream, index=False)
    stream.seek(0)

    return StreamingResponse(
        iter([stream.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition":
                 f"attachment; filename=results_{result_id}.csv"},
    )
