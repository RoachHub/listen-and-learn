/**
 * dummy_app.jsx
 * ─────────────────────────────────────────────────────────────────
 * Dummy — NLP Comment Categorisation & Sentiment Analysis Tool
 * React frontend prototype (single-file, no router).
 *
 * Navigation is a simple screen-key state string (S.*) owned by
 * the root App component. Categories state is also lifted to App
 * so that CategoriesScreen, RecalibratingScreen, and
 * MulticollinearityScreen can all read and update the same list.
 *
 * Icons are lucide-react placeholders — swap for final assets.
 * ─────────────────────────────────────────────────────────────────
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Atom, FolderOpen, Home, Search, Calendar, Pencil, Wand2,
         Download, Database, MessageSquare, AlertTriangle,
         Target, TrendingUp, Heart, HeartCrack } from "lucide-react";
import * as d3 from "d3";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
         Tooltip, ReferenceLine, ResponsiveContainer, ZAxis, Cell, Customized } from "recharts";

// ═════════════════════════════════════════════
// DESIGN SYSTEM
// ═════════════════════════════════════════════
const C = {
  bgStart:         "#5252B6",  // gradient bottom
  bgMid:           "#8C8CC3",  // gradient 53% mark
  bgEnd:           "#EBEBFF",  // gradient top

  cta:             "#3E3E94",  // active CTA fill + home icon colour
  ctaOff:          "#B8B8DF",  // disabled CTA fill
  ctaOffText:      "#D9D9D9",  // disabled CTA label

  white:           "#FFFFFF",
  textMuted:       "#595959",

  fileChiclet:     "#B4E5A2",  // uploaded-file badge background
  fileGlow:        "#275317",  // glow on file badge hover

  chipColor:       "#6761B7",  // selected-column chip background

  // ── Multicollinearity modal ──────────────────
  multiGlow:       "#002060",  // modal outer glow colour (spec)
  multiOutline:    "#5252B6",  // conflict-item border + three-dot colour
  multiAcceptOn:   "#5252B6",  // Accept button when active
  multiAcceptOff:  "#E2E2F2",  // Accept button when inactive
  multiAcceptOffTx:"#FFFFFF",  // Accept label when inactive (spec)

  // ── Warning triangle colours ─────────────────
  triRed:          "#FF0000",  // unresolved conflict
  triGreen:        "#4EA72E",  // reverted to original
  triYellow:       "#FFCC00",  // changed to a new name (post-multicollinearity)
  triYellowMid:    "#F9B407",  // changed inside the modal (spec slide 44)
};

const BG   = `linear-gradient(to bottom, ${C.bgEnd} 0%, ${C.bgMid} 53%, ${C.bgStart} 100%)`;
const FONT = "'Montserrat', sans-serif";

const TEXT_SHADOW       = "0 2px 12px rgba(0,0,0,0.25)";
const TEXT_SHADOW_LIGHT = "0 1px 6px rgba(0,0,0,0.18)";

/**
 * glow(hex, alpha, blur, spread)
 * Returns a CSS box-shadow string for the spec's outer-glow effect.
 * Default values match spec: #3E3E94, 52% opacity, 17-pt ≈ 20 px blur.
 */
const glow = (hex = C.cta, alpha = 0.52, blur = 20, spread = 4) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `0 0 ${blur}px ${spread}px rgba(${r},${g},${b},${alpha})`;
};

/** Float-Up CSS animation shared by all transition screens. */
const FLOAT_UP_CSS = `
  @keyframes floatUp {
    0%   { opacity: 0; transform: translateY(28px); }
    30%  { opacity: 1; transform: translateY(0);    }
    70%  { opacity: 1; transform: translateY(0);    }
    100% { opacity: 0; transform: translateY(-28px);}
  }
`;

// ═════════════════════════════════════════════
// SCREEN KEYS
// ═════════════════════════════════════════════
const S = {
  HOME:              "HOME",
  CREATE_UPLOAD:     "CREATE_UPLOAD",
  COLUMN_SELECT:     "COLUMN_SELECT",
  LEARNING:          "LEARNING",
  CATEGORIES:        "CATEGORIES",
  RECALIBRATING:     "RECALIBRATING",
  MULTICOLLINEARITY: "MULTICOLLINEARITY",
  USE_EXISTING:      "USE_EXISTING",
  APPLY_UPLOAD:      "APPLY_UPLOAD",    // apply model — upload data file
  APPLY_COLUMNS:     "APPLY_COLUMNS",   // apply model — pick columns + Begin Magic Show
  ANALYSING:         "ANALYSING",       // analysis animation
  RESULTS:           "RESULTS",         // results dashboard (placeholder)
};

// ═════════════════════════════════════════════
// DEMO / PLACEHOLDER DATA
// ═════════════════════════════════════════════

const DEMO_COLUMNS = [
  "sample_id", "email", "mobile_number",
  "rating", "anothercolumn", "comment", "dep_var",
];

const LEARNING_MSGS = [
  "Reading your data...",
  "This won't take long...",
  "Starting to understand context…",
  "Identifying topics…",
  "Verbalising categories…",
  "Almost there…",
];

/**
 * RECALIB_MSGS_FULL — used when renamed/added categories exist.
 * Includes the multicollinearity check message because the backend
 * will actually run that check on this path.
 */
const RECALIB_MSGS_FULL = [
  "Recalibrating...",
  "Updating context...",
  "Checking for multicollinearity...",
];

/**
 * RECALIB_MSGS_CLEAN — used after a delete-only recalibration,
 * or after the user has already accepted from the multicollinearity
 * screen. No conflict detection runs on this path, so the message
 * is not shown.
 */
const RECALIB_MSGS_CLEAN = [
  "Recalibrating...",
  "Updating context...",
];

/** Placeholder model list for the Use Existing Model screen.
 *  In production: fetched from the backend (GET /models). */
const DEMO_MODELS = [
  { id: 1, name: "ACME genre",       date: "May 20, 2026", description: "Customer feedback analysis model for ACME Corp, focusing on product and service quality metrics.",           categoryCount: 6 },
  { id: 2, name: "Airline feedback", date: "May 22, 2026", description: "Sentiment and topic analysis model trained on airline passenger reviews across economy and business class.", categoryCount: 8 },
  { id: 3, name: "Hotel reviews",    date: "Jun 1, 2026",  description: "Hospitality industry feedback categorisation model for a mid-scale hotel chain.",                            categoryCount: 5 },
  { id: 4, name: "Retail NPS",       date: "Jun 5, 2026",  description: "Net promoter score comment analysis model for a retail chain quarterly review cycle.",                       categoryCount: 7 },
];

/** Messages for the Apply Model analysis animation (slides 78–82) */
const ANALYSIS_MSGS = [
  "Initiating Analysis...",
  "Sit back and relax...",
  "Grouping into categories...",
  "Analysing sentiments...",
  "Preparing report...",
];

/**
 * INITIAL_CATEGORIES — loaded when the learning animation completes.
 * Each entry carries:
 *   name         – current display name (mutated by renames)
 *   originalName – the AI's first suggestion (used as "revert" target)
 *   modified     – true when the user has renamed/deleted since last recalib
 */
const INITIAL_CATEGORIES = [
  { name: "Refund Speed",               originalName: "Refund Speed",               modified: false },
  { name: "Customer Support",           originalName: "Customer Support",           modified: false },
  { name: "Product Quality",            originalName: "Product Quality",            modified: false },
  { name: "Delivery Experience",        originalName: "Delivery Experience",        modified: false },
  { name: "Website Navigation_long_name", originalName: "Website Navigation_long_name", modified: false },
  { name: "Value for Money",            originalName: "Value for Money",            modified: false },
];

// ═════════════════════════════════════════════
// SHARED: REMOVE-X BADGE
// The circular ✕ that floats at the top-right
// corner of a chiclet. Colour: white → #E8E8E8
// on hover. Used on both the file chiclet and
// the selected-column chip (spec slides 6 & 15).
// ═════════════════════════════════════════════
function RemoveX({ onRemove }) {
  const [hov, setHov] = useState(false);
  return (
    <span
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={(e) => { e.stopPropagation(); onRemove(); }}
      style={{
        position: "absolute", top: -6, right: -6,
        background: hov ? "#E8E8E8" : C.white,
        borderRadius: "50%", width: 18, height: 18,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 700, cursor: "pointer",
        color: "#444", boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
        transition: "background 0.15s ease", userSelect: "none",
      }}
    >✕</span>
  );
}

// ═════════════════════════════════════════════
// SHARED: HOME BUTTON
// Icon colour: #3E3E94 (spec). Text stays white.
// ═════════════════════════════════════════════
function HomeBtn({ navigate }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={() => navigate(S.HOME)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        position: "absolute", top: 28, left: 36,
        background: "none", border: "none", cursor: "pointer",
        display: "flex", alignItems: "center", gap: 8,
        color: hov ? C.white : "rgba(255,255,255,0.82)",
        fontFamily: FONT, fontSize: 14, fontWeight: 500,
        textDecoration: hov ? "underline" : "none",
        transition: "all 0.15s ease", padding: 0,
      }}
    >
      {/* Icon colour overrides parent colour (spec: #3E3E94) */}
      <Home size={18} strokeWidth={1.5} color={C.cta} />
      Go back home
    </button>
  );
}

// ═════════════════════════════════════════════
// SHARED: ANIMATED MESSAGE SCREEN
// Reused by both LearningScreen and
// RecalibratingScreen. Cycles through `messages`
// with the Float-Up animation (1s in / 1s hold /
// 1s out = 3 s per message), then calls onComplete.
//
// Props:
//   messages    – string[]
//   onComplete  – () => void   called after all messages play once
//   showSkip    – bool         render a dim "skip →" button (dev only)
// ═════════════════════════════════════════════
function AnimatedMessageScreen({ messages, onComplete, showSkip = false }) {
  const [idx,     setIdx]    = useState(0);
  const [animKey, setAnimKey]= useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setIdx((i) => {
        const next = i + 1;
        if (next >= messages.length) {
          // All messages shown — stop cycling and hand off
          clearInterval(timerRef.current);
          setTimeout(onComplete, 800);
          return i; // stay on last message during the 0.8 s pause
        }
        return next;
      });
      setAnimKey((k) => k + 1);
    }, 3000);

    return () => clearInterval(timerRef.current);
  }, [messages, onComplete]);

  return (
    <div style={{
      minHeight: "100vh", background: BG,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: FONT,
    }}>
      <style>{FLOAT_UP_CSS}</style>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 40 }}>
        <p
          key={animKey}
          style={{
            color: C.white, fontSize: 36, fontWeight: 300,
            textAlign: "center", letterSpacing: -0.3,
            animation: "floatUp 3s ease forwards",
            maxWidth: 600, padding: "0 40px", margin: 0,
            textShadow: TEXT_SHADOW,
          }}
        >
          {messages[idx]}
        </p>

        {/* Dev-only skip button — remove before production */}
        {showSkip && (
          <button
            onClick={() => { clearInterval(timerRef.current); onComplete(); }}
            style={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.25)",
              color: "rgba(255,255,255,0.35)", cursor: "pointer",
              fontFamily: FONT, fontSize: 12, fontWeight: 400,
              padding: "6px 18px", borderRadius: 20,
            }}
          >
            skip →
          </button>
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════
// SCREEN: LANDING  (slides 1–2)
// ═════════════════════════════════════════════
function LandingScreen({ navigate }) {
  const [hov, setHov] = useState(null);

  const card = (id, Icon, label, dest) => (
    <div
      key={id}
      onMouseEnter={() => setHov(id)}
      onMouseLeave={() => setHov(null)}
      onClick={() => navigate(dest)}
      style={{
        flex: 1, backgroundColor: C.cta, borderRadius: 14,
        padding: "36px 44px", cursor: "pointer",
        display: "flex", alignItems: "center", gap: 22,
        color: C.white, fontFamily: FONT, fontSize: 20, fontWeight: 600,
        transition: "box-shadow 0.2s ease", userSelect: "none",
        boxShadow: hov === id ? glow() : "none",
      }}
    >
      <Icon size={38} strokeWidth={1.4} />{label}
    </div>
  );

  return (
    <div style={{
      minHeight: "100vh", background: BG,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      fontFamily: FONT, padding: 40,
    }}>
      <h1 style={{
        color: C.white, fontSize: 66, fontWeight: 300,
        margin: "0 0 20px", textAlign: "center", letterSpacing: -1,
        textShadow: TEXT_SHADOW,
      }}>
        Welcome to Dummy
      </h1>
      <p style={{
        color: "rgba(255,255,255,0.8)", fontSize: 18, fontWeight: 400,
        margin: "0 0 64px", textAlign: "center", maxWidth: 560, lineHeight: 1.65,
        textShadow: TEXT_SHADOW_LIGHT,
      }}>
        You can choose to create a new context model, or pick one from the
        existing ones to get started.
      </p>
      <div style={{ display: "flex", gap: 40, width: "100%", maxWidth: 860 }}>
        {card("create",   Atom,       "Create new model",   S.CREATE_UPLOAD)}
        {card("existing", FolderOpen, "Use existing model", S.USE_EXISTING)}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════
// SCREEN: CREATE MODEL — FILE UPLOAD  (slides 3–10)
// ═════════════════════════════════════════════
function CreateUploadScreen({ navigate }) {
  const [file,    setFile]   = useState(null);
  const [context, setContext]= useState("");
  const [hPlus,   setHPlus]  = useState(false);
  const [hFile,   setHFile]  = useState(false);
  const [hBtn,    setHBtn]   = useState(false);
  const fileRef = useRef();

  const accept = (f) => {
    if (f && (f.name.endsWith(".csv") || f.name.endsWith(".xlsx"))) setFile(f);
  };

  return (
    <div style={{
      minHeight: "100vh", background: BG,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      fontFamily: FONT, padding: 40, position: "relative",
    }}>
      <HomeBtn navigate={navigate} />

      <div style={{ width: "100%", maxWidth: 700, display: "flex", flexDirection: "column", gap: 20 }}>

        {/* ── Upload label (separate row, never moves) ── */}
        <span style={{ color: C.white, fontSize: 30, fontWeight: 400, textShadow: TEXT_SHADOW_LIGHT }}>
          Upload data{" "}
          <span style={{ fontSize: 18, fontWeight: 300, opacity: 0.72 }}>(max 10 MB)</span>
        </span>

        {/*
          ── Fixed-height upload zone (92 px) ──────────────────────────
          Root cause of the old layout shift: the + box was 84 px tall
          but once a file was loaded it collapsed to text height while
          a separate chiclet row appeared — combined height changed and
          the textarea + button drifted.

          Fix: one wrapper always 92 px tall (84 px content + 8 px top
          clearance for the RemoveX badge overflow). Both states centre
          inside it; everything below is pinned at the same Y position.
          ────────────────────────────────────────────────────────────
        */}
        <div style={{ height: 92, display: "flex", alignItems: "center" }}>
          {!file ? (
            // + drop zone
            <div
              onMouseEnter={() => setHPlus(true)}
              onMouseLeave={() => setHPlus(false)}
              onClick={() => fileRef.current.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); accept(e.dataTransfer.files[0]); }}
              style={{
                border: `2px dashed ${hPlus ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.45)"}`,
                borderRadius: 10, width: 84, height: 84,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer",
                color: hPlus ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.6)",
                fontSize: 40, fontWeight: 200, transition: "all 0.15s ease",
              }}
            >+</div>
          ) : (
            // File chiclet
            <div style={{ position: "relative" }}>
              <div
                onMouseEnter={() => setHFile(true)}
                onMouseLeave={() => setHFile(false)}
                style={{
                  backgroundColor: C.fileChiclet, borderRadius: 24,
                  padding: "10px 20px", display: "flex", alignItems: "center", gap: 10,
                  color: C.textMuted, fontSize: 14, fontWeight: 600,
                  cursor: "pointer", position: "relative",
                  boxShadow: hFile ? glow(C.fileGlow, 0.56, 14, 3) : "none",
                  transition: "box-shadow 0.2s ease",
                }}
              >
                <span style={{ background: "#217346", color: C.white, borderRadius: 4, padding: "2px 5px", fontWeight: 700, fontSize: 11 }}>X</span>
                {file.name}
                {hFile && <RemoveX onRemove={() => { setFile(null); setHFile(false); }} />}
              </div>
            </div>
          )}
        </div>

        <input ref={fileRef} type="file" accept=".csv,.xlsx" style={{ display: "none" }}
          onChange={(e) => accept(e.target.files[0])} />

        {/* Context textarea — permanent glow (no hover required) */}
        <textarea
          value={context} onChange={(e) => setContext(e.target.value)}
          placeholder="Provide some context (optional)" rows={3}
          style={{
            background: C.white, border: "none", borderRadius: 14,
            padding: "18px 22px", fontFamily: FONT, fontSize: 16,
            color: "#1a1a1a", resize: "none", outline: "none",
            boxShadow: glow(), lineHeight: 1.55,
          }}
        />

        <button
          disabled={!file}
          onMouseEnter={() => file && setHBtn(true)}
          onMouseLeave={() => setHBtn(false)}
          onClick={() => file && navigate(S.COLUMN_SELECT)}
          style={{
            background: file ? C.cta : C.ctaOff, color: file ? C.white : C.ctaOffText,
            border: "none", borderRadius: 14, padding: "20px",
            fontFamily: FONT, fontSize: 18, fontWeight: 600,
            cursor: file ? "pointer" : "not-allowed",
            transition: "box-shadow 0.2s ease",
            boxShadow: hBtn && file ? glow() : "none",
          }}
        >
          Extract Comments
        </button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════
// SCREEN: COLUMN SELECTION  (slides 11–16)
// ═════════════════════════════════════════════
function ColumnSelectScreen({ navigate }) {
  const [open,    setOpen]   = useState(false);
  const [search,  setSearch] = useState("");
  const [selected,setSelect] = useState(null);
  const [hovOpt,  setHovOpt] = useState(null);
  const [hBtn,    setHBtn]   = useState(false);
  const searchRef = useRef();

  const filtered = DEMO_COLUMNS.filter((c) =>
    c.toLowerCase().includes(search.toLowerCase())
  );
  const pick = (col) => { setSelect(col); setOpen(false); setSearch(""); };

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50);
  }, [open]);

  return (
    <div style={{
      minHeight: "100vh", background: BG,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      fontFamily: FONT, padding: 40, position: "relative",
    }}>
      <HomeBtn navigate={navigate} />
      <div style={{ width: "100%", maxWidth: 700, display: "flex", flexDirection: "column", gap: 28 }}>
        <h2 style={{ color: C.white, fontSize: 26, fontWeight: 500, textAlign: "center", lineHeight: 1.45, margin: 0, textShadow: TEXT_SHADOW_LIGHT }}>
          Which of the following columns contains the comments?
        </h2>

        <div style={{ position: "relative" }}>
          {/* Dropdown trigger */}
          <div onClick={() => setOpen((o) => !o)} style={{
            background: C.white, borderRadius: 14, padding: "16px 20px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            cursor: "pointer", boxShadow: glow(), userSelect: "none",
          }}>
            {selected ? (
              <div style={{ position: "relative", display: "inline-block" }}>
                <span style={{
                  background: C.chipColor, color: C.white, borderRadius: 20,
                  padding: "5px 22px 5px 14px", fontSize: 14, fontWeight: 600, display: "inline-block",
                }}>
                  {selected}
                </span>
                <RemoveX onRemove={() => setSelect(null)} />
              </div>
            ) : (
              <span style={{ color: C.textMuted, fontSize: 16 }}>Select column</span>
            )}
            <span style={{ color: C.textMuted, fontSize: 12, display: "inline-block", flexShrink: 0, marginLeft: 8, transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }}>▲</span>
          </div>

          {/* Dropdown panel */}
          {open && (
            <div style={{
              position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 200,
              background: C.white, borderRadius: 12, overflow: "hidden",
              boxShadow: `${glow()}, 0 6px 24px rgba(0,0,0,0.12)`,
            }}>
              <div style={{ display: "flex", alignItems: "center", padding: "12px 16px", gap: 10, borderBottom: "1px solid rgba(89,89,89,0.2)" }}>
                <input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search column"
                  style={{ flex: 1, border: "none", outline: "none", fontFamily: FONT, fontSize: 15, color: C.textMuted, background: "transparent" }}
                />
                <Search size={17} color={C.textMuted} strokeWidth={1.8} />
              </div>
              <div style={{ maxHeight: 216, overflowY: "auto" }}>
                {filtered.map((col) => (
                  <div key={col} onMouseEnter={() => setHovOpt(col)} onMouseLeave={() => setHovOpt(null)} onClick={() => pick(col)}
                    style={{ padding: "12px 18px", cursor: "pointer", fontFamily: FONT, fontSize: 15, color: "#1a1a1a", background: hovOpt === col ? "rgba(184,184,223,0.5)" : "transparent", transition: "background 0.1s ease" }}
                  >{col}</div>
                ))}
              </div>
            </div>
          )}
        </div>

        <button
          disabled={!selected}
          onMouseEnter={() => selected && setHBtn(true)} onMouseLeave={() => setHBtn(false)}
          onClick={() => selected && navigate(S.LEARNING)}
          style={{
            background: selected ? C.cta : C.ctaOff, color: selected ? C.white : C.ctaOffText,
            border: "none", borderRadius: 14, padding: "20px",
            fontFamily: FONT, fontSize: 18, fontWeight: 600,
            cursor: selected ? "pointer" : "not-allowed",
            transition: "box-shadow 0.2s ease",
            boxShadow: hBtn && selected ? glow() : "none",
          }}
        >Initiate Learning</button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════
// SCREEN: CATEGORIES  (slides 23–61)
//
// Props (all from App — state is lifted):
//   categories      – current category array
//   setCategories   – updater for the above
//   deletePending   – true when a delete was done
//   setDeletePending
//   onRecalibrate   – called when Recalibrate is clicked
//
// Fix applied: ⋮ dropdown and rename popup use
// position: fixed (viewport-relative coords from
// getBoundingClientRect) to escape the scroll
// container's overflow clipping — same approach
// as MulticollinearityScreen.
// ═════════════════════════════════════════════
function CategoriesScreen({ navigate, categories, setCategories, deletePending, setDeletePending, onRecalibrate, onBeginCategorization }) {
  // ── UI state ──
  const [openMenu,        setOpenMenu]        = useState(null);
  const [menuPos,         setMenuPos]         = useState(null);  // viewport pos → fixed dropdown
  const [renaming,        setRenaming]        = useState(null);
  const [renamePos,       setRenamePos]       = useState(null);  // viewport pos → fixed rename popup
  const [newName,         setNewName]         = useState("");
  const [hovOpt,          setHovOpt]          = useState(null);
  const [hovOkRename,     setHovOkRename]     = useState(false);
  const [hovCancelRename, setHovCancelRename] = useState(false);
  const [hBtn,            setHBtn]            = useState(null);
  const [viewExamplesCat, setViewExamplesCat] = useState(null);  // category name for examples overlay

  // Refs: one entry per row to measure viewport position on demand
  const menuBtnRefs = useRef({});
  const rowRefs     = useRef({});

  const [addOpen,  setAddOpen]  = useState(false);
  const [addInput, setAddInput] = useState("");
  const [addList,  setAddList]  = useState([]);
  const [hAddBtn,  setHAddBtn]  = useState(false); // hover state for + Add
  const [hAccept,  setHAccept]  = useState(false); // hover state for Accept

  /** Push the current input value into the staged list and clear the field */
  const pushAddInput = () => {
    const val = addInput.trim();
    if (!val) return;
    setAddList((prev) => [...prev, val]);
    setAddInput("");
  };

  /** Apply staged categories (if any) then always close the modal */
  const handleAddConfirm = () => {
    if (addList.length > 0) {
      const newCats = addList.map((name) => ({ name, originalName: name, modified: true }));
      setCategories((prev) => [...prev, ...newCats]);
    }
    setAddList([]);
    setAddInput("");
    setAddOpen(false);
  };

  /** Close the modal and discard any staged additions */
  const closeAddModal = () => { setAddOpen(false); setAddList([]); setAddInput(""); };

  // Derived — drive CTA active states
  const anyModified = categories.some((c) => c.modified) || deletePending;
  const canBegin    = !anyModified;

  const closeAll = () => {
    setOpenMenu(null); setMenuPos(null);
    setRenaming(null); setRenamePos(null);
  };

  /** Open ⋮ dropdown; capture button's viewport rect for fixed positioning */
  const handleMenuOpen = (idx) => {
    if (openMenu === idx) { closeAll(); return; }
    setRenaming(null); setRenamePos(null);
    const el = menuBtnRefs.current[idx];
    if (el) {
      const r = el.getBoundingClientRect();
      setMenuPos({ top: r.bottom + 4, left: Math.max(8, r.right - 164) });
    }
    setOpenMenu(idx);
  };

  /** Open rename popup below the row; capture row's viewport rect */
  const handleRename = (idx) => {
    closeAll();
    const el = rowRefs.current[idx];
    if (el) {
      const r = el.getBoundingClientRect();
      setRenamePos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    setRenaming(idx);
    setNewName(categories[idx].name);
  };

  const confirmRename = (idx) => {
    if (!newName.trim()) return;
    setCategories((prev) => prev.map((c, i) =>
      i === idx ? { ...c, name: newName.trim(), modified: true } : c
    ));
    setRenaming(null); setRenamePos(null);
  };

  /**
   * Delete — removes the category and sets deletePending so Recalibrate
   * activates. Does NOT mark remaining categories as modified (no yellow
   * flags), and does NOT trigger multicollinearity detection (per spec).
   */
  const handleDelete = (idx) => {
    closeAll();
    setCategories((prev) => prev.filter((_, i) => i !== idx));
    setDeletePending(true);
  };

  /**
   * getDemoComments — placeholder comments for the View Examples overlay.
   * In production: replace with GET /categories/{name}/examples from backend.
   */
  const getDemoComments = (catName) => [
    `The ${catName} experience was smooth and efficient throughout.`,
    `I was quite disappointed with how ${catName} was handled on my visit.`,
    `${catName} is what sets this service apart from every competitor.`,
    `Could not fault the ${catName} at all — it exceeded my expectations.`,
    `${catName} needs urgent attention before I would consider returning.`,
    `Staff were knowledgeable and helpful when it came to ${catName}.`,
    `I have mixed feelings about ${catName} honestly — some good, some bad.`,
    `Best in class when it comes to ${catName} — truly impressive.`,
  ];

  return (
    <div style={{
      minHeight: "100vh", background: BG,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      fontFamily: FONT, padding: "60px 40px", position: "relative",
    }}>
      <HomeBtn navigate={navigate} />

      <div style={{ width: "100%", maxWidth: 880, display: "flex", gap: 48, alignItems: "flex-start" }}>

        {/* ══ LEFT: scrollable category list ══ */}
        <div style={{ flex: 1 }}>
          <p style={{ color: C.white, fontSize: 16, fontWeight: 400, marginBottom: 20, lineHeight: 1.5, textShadow: TEXT_SHADOW_LIGHT }}>
            {categories.length} categories of conversation have been identified. These are:
          </p>

          <div style={{ border: `1.5px solid ${C.cta}`, borderRadius: 12, overflow: "hidden", maxHeight: 380 }}>
            <div style={{ overflowY: "auto", maxHeight: 380, padding: "10px 12px" }}>
              {categories.map((cat, idx) => (
                <div
                  key={idx}
                  ref={(el) => { rowRefs.current[idx] = el; }}
                  style={{ position: "relative", marginBottom: 8 }}
                >
                  <div style={{
                    border: `1.5px solid ${C.cta}`, borderRadius: 10,
                    padding: "10px 14px",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    color: C.white, fontSize: 14, fontWeight: 500,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                      {cat.modified && (
                        <span style={{ fontSize: 13, color: C.triYellow, flexShrink: 0 }}>▲</span>
                      )}
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {cat.name}
                      </span>
                    </div>
                    {/* ⋮ button — ref used to read viewport pos for fixed dropdown */}
                    <button
                      ref={(el) => { menuBtnRefs.current[idx] = el; }}
                      onClick={() => handleMenuOpen(idx)}
                      style={{
                        background: "none", border: "none", color: C.white, cursor: "pointer",
                        fontSize: 18, fontWeight: 700, padding: "0 4px", lineHeight: 1,
                        letterSpacing: 1, flexShrink: 0, opacity: 0.8, transition: "opacity 0.15s",
                      }}
                    >⋮</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ══ RIGHT: action CTAs ══ */}
        <div style={{ width: 280, display: "flex", flexDirection: "column", gap: 16, paddingTop: 32 }}>
          <p style={{ color: C.white, fontSize: 16, fontWeight: 400, margin: "0 0 8px", textAlign: "center", textShadow: TEXT_SHADOW_LIGHT }}>
            What would you like to do next?
          </p>
          {[
            { key: "begin",   label: "Begin categorization", active: canBegin    },
            { key: "recalib", label: "Recalibrate",           active: anyModified },
            { key: "add",     label: "Add categories",        active: true        },
          ].map(({ key, label, active }) => (
            <button key={key} disabled={!active}
              onMouseEnter={() => active && setHBtn(key)} onMouseLeave={() => setHBtn(null)}
              onClick={() => {
                if (!active) return;
                if (key === "recalib") onRecalibrate();
                if (key === "begin")   onBeginCategorization?.();
                if (key === "add")     setAddOpen(true);
              }}
              style={{
                background: active ? C.cta : C.ctaOff, color: active ? C.white : C.ctaOffText,
                border: "none", borderRadius: 12, padding: "18px", width: "100%",
                fontFamily: FONT, fontSize: 16, fontWeight: 600,
                cursor: active ? "pointer" : "not-allowed",
                transition: "box-shadow 0.2s ease",
                boxShadow: hBtn === key && active ? glow() : "none",
              }}
            >{label}</button>
          ))}
        </div>
      </div>

      {/* Click-away closes dropdown / rename (z 30 — above page, below fixed panels) */}
      {(openMenu !== null || renaming !== null) && (
        <div onClick={closeAll} style={{ position: "fixed", inset: 0, zIndex: 30 }} />
      )}

      {/*
        ── ⋮ Dropdown (position: fixed) ─────────────────────────────
        Viewport-relative — not clipped by scroll container overflow.
        ────────────────────────────────────────────────────────────
      */}
      {openMenu !== null && menuPos && (
        <div style={{
          position: "fixed", top: menuPos.top, left: menuPos.left,
          zIndex: 9999, background: C.white, borderRadius: 10,
          boxShadow: `${glow()}, 0 4px 16px rgba(0,0,0,0.12)`,
          overflow: "hidden", minWidth: 164,
        }}>
          {[
            { key: "change", icon: "✏️", label: "Change",        color: "#484290" },
            { key: "delete", icon: "🗑️", label: "Delete",        color: "#FF0000" },
            { key: "view",   icon: "📋", label: "View examples",  color: "#3B7D23" },
          ].map(({ key, icon, label, color }) => (
            <div key={key}
              onMouseEnter={() => setHovOpt({ key })} onMouseLeave={() => setHovOpt(null)}
              onClick={() => {
                if (key === "change") handleRename(openMenu);
                if (key === "delete") handleDelete(openMenu);
                if (key === "view")   { setViewExamplesCat(categories[openMenu]?.name); closeAll(); }
              }}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "11px 16px", cursor: "pointer",
                fontFamily: FONT, fontSize: 14, fontWeight: 500, color,
                background: hovOpt?.key === key ? "rgba(184,184,223,0.5)" : "transparent",
                borderRadius: hovOpt?.key === key ? 6 : 0, transition: "background 0.1s",
              }}
            >
              <span style={{ fontSize: 15 }}>{icon}</span>{label}
            </div>
          ))}
        </div>
      )}

      {/*
        ── Rename popup (position: fixed) ───────────────────────────
        Appears directly below the row that triggered it.
        ────────────────────────────────────────────────────────────
      */}
      {renaming !== null && renamePos && (
        <div style={{
          position: "fixed", top: renamePos.top, left: renamePos.left, width: renamePos.width,
          zIndex: 9999, background: C.white, borderRadius: 12, padding: "16px 18px",
          boxShadow: `${glow()}, 0 4px 20px rgba(0,0,0,0.12)`,
        }}>
          <p style={{ fontFamily: FONT, fontSize: 13, color: C.textMuted, marginBottom: 8, lineHeight: 1.4 }}>
            What would you like to change <strong>"{categories[renaming]?.name}"</strong> to?
            <br /><span style={{ fontSize: 11, color: "#aaa" }}>(please enter a name similar to the existing category and distinct from others)</span>
          </p>
          <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confirmRename(renaming)}
            placeholder="Enter new name of category"
            style={{ width: "100%", border: "none", borderRadius: 8, padding: "10px 14px", fontFamily: FONT, fontSize: 14, background: C.ctaOff, color: C.white, outline: "none", marginBottom: 10 }}
          />
          <div style={{ display: "flex", gap: 10 }}>
            <button onMouseEnter={() => setHovOkRename(true)} onMouseLeave={() => setHovOkRename(false)}
              onClick={() => confirmRename(renaming)}
              style={{ flex: 1, border: "2px solid #4EA72E", borderRadius: 8, padding: "8px", fontFamily: FONT, fontSize: 14, fontWeight: 600, cursor: "pointer", background: hovOkRename && newName.trim() ? "#4EA72E" : "transparent", color: hovOkRename && newName.trim() ? C.white : "#4EA72E", transition: "all 0.15s ease" }}
            >OK</button>
            <button onMouseEnter={() => setHovCancelRename(true)} onMouseLeave={() => setHovCancelRename(false)}
              onClick={() => { setRenaming(null); setRenamePos(null); }}
              style={{ flex: 1, border: "2px solid #FF0000", borderRadius: 8, padding: "8px", fontFamily: FONT, fontSize: 14, fontWeight: 600, cursor: "pointer", background: hovCancelRename ? "#FF0000" : "transparent", color: hovCancelRename ? C.white : "#FF0000", transition: "all 0.15s ease" }}
            >Cancel</button>
          </div>
        </div>
      )}

      {/*
        ── View Examples overlay ─────────────────────────────────────
        Spec: darkened backdrop + white modal with scrollable table.
        Backdrop click or × button both dismiss it.
        Production: swap getDemoComments() for a real API call
        (GET /categories/{name}/examples) that returns actual rows
        from the uploaded dataset.
        ────────────────────────────────────────────────────────────
      */}
      {viewExamplesCat && (
        <>
          {/* Backdrop — click to dismiss */}
          <div
            onClick={() => setViewExamplesCat(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.50)", zIndex: 100 }}
          />
          {/* Modal */}
          <div style={{
            position: "fixed", inset: 0, zIndex: 101,
            display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
          }}>
            <div style={{
              background: C.white, borderRadius: 18, padding: 28,
              width: "100%", maxWidth: 680, maxHeight: "78vh",
              display: "flex", flexDirection: "column",
              boxShadow: `${glow()}, 0 8px 40px rgba(0,0,0,0.18)`,
            }}>
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexShrink: 0 }}>
                <div>
                  <h2 style={{ fontFamily: FONT, fontSize: 18, fontWeight: 700, color: "#1a1a1a", margin: "0 0 4px" }}>
                    Example comments
                  </h2>
                  <p style={{ fontFamily: FONT, fontSize: 14, color: C.textMuted, margin: 0 }}>
                    Category: <strong style={{ color: C.cta }}>{viewExamplesCat}</strong>
                  </p>
                </div>
                <button onClick={() => setViewExamplesCat(null)} style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 24, color: C.textMuted, lineHeight: 1, padding: 0, marginLeft: 16,
                }}>×</button>
              </div>

              {/* Scrollable comment table */}
              <div style={{ overflowY: "auto", flex: 1 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: FONT }}>
                  <thead style={{ position: "sticky", top: 0, background: C.white, zIndex: 1 }}>
                    <tr>
                      <th style={{ width: 44, textAlign: "center", padding: "10px 12px", borderBottom: `2px solid ${C.ctaOff}`, color: C.textMuted, fontSize: 13, fontWeight: 600 }}>#</th>
                      <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: `2px solid ${C.ctaOff}`, color: C.textMuted, fontSize: 13, fontWeight: 600 }}>Comment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getDemoComments(viewExamplesCat).map((comment, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? "#F8F8FC" : C.white }}>
                        <td style={{ textAlign: "center", padding: "12px", borderBottom: "1px solid #F0F0F0", color: C.textMuted, fontSize: 13 }}>{i + 1}</td>
                        <td style={{ padding: "12px", borderBottom: "1px solid #F0F0F0", color: "#1a1a1a", fontSize: 14, lineHeight: 1.6 }}>{comment}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
      {/*
        ── Add Categories modal ──────────────────────────────────────
        Same overlay pattern as View Examples and Multicollinearity.
        User types a name → presses Enter or "Add" → chip appears.
        Chips can be removed with ✕. Confirm applies all staged names
        to the global category list (marked modified: true so
        Recalibrate activates) and closes the modal.
        ────────────────────────────────────────────────────────────
      */}
      {addOpen && (
        <>
          {/* Backdrop — click to discard and close */}
          <div
            onClick={closeAddModal}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.50)", zIndex: 100 }}
          />
          <div style={{
            position: "fixed", inset: 0, zIndex: 101,
            display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
          }}>
            <div style={{
              background: C.white, borderRadius: 18, padding: 28,
              width: "100%", maxWidth: 500,
              boxShadow: `${glow()}, 0 8px 40px rgba(0,0,0,0.18)`,
            }}>
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h2 style={{ fontFamily: FONT, fontSize: 22, fontWeight: 400, color: "#1a1a1a", margin: 0 }}>
                  Add new categories
                </h2>
                <button onClick={closeAddModal} style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 24, color: C.textMuted, lineHeight: 1, padding: 0,
                }}>×</button>
              </div>

              {/* PSA subheading — bold emphasis on the uniqueness requirement */}
              <p style={{ fontFamily: FONT, fontSize: 14, color: "#1a1a1a", lineHeight: 1.6, marginBottom: 20 }}>
                You can add more categories if you think some topics have been missed.
                However, <strong>please ensure that the categories are unique and
                distinct from the ones that already exist</strong>.
              </p>

              {/* Input + + Add button row */}
              <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                <input
                  autoFocus
                  value={addInput}
                  onChange={(e) => setAddInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") pushAddInput(); }}
                  placeholder="Add new category"
                  style={{
                    flex: 1, border: `1.5px solid ${C.ctaOff}`, borderRadius: 8,
                    padding: "10px 14px", fontFamily: FONT, fontSize: 14,
                    color: "#1a1a1a", outline: "none", transition: "border-color 0.15s",
                  }}
                  onFocus={(e) => { e.target.style.borderColor = C.cta; }}
                  onBlur={(e)  => { e.target.style.borderColor = C.ctaOff; }}
                />
                <button
                  disabled={!addInput.trim()}
                  onClick={pushAddInput}
                  onMouseEnter={() => addInput.trim() && setHAddBtn(true)}
                  onMouseLeave={() => setHAddBtn(false)}
                  style={{
                    background: addInput.trim() ? "#5252B6" : C.ctaOff,
                    color: C.white,
                    border: "none", borderRadius: 8, padding: "10px 22px",
                    fontFamily: FONT, fontSize: 14, fontWeight: 600,
                    cursor: addInput.trim() ? "pointer" : "not-allowed",
                    whiteSpace: "nowrap", transition: "box-shadow 0.15s",
                    boxShadow: hAddBtn && addInput.trim() ? glow("#5252B6") : "none",
                  }}
                >+ Add</button>
              </div>

              {/*
                Chip area + Accept button — side-by-side, matching the
                multicollinearity layout (list left, action button right).
              */}
              <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>

                {/* Bordered chip box — shows placeholder when empty */}
                <div style={{
                  flex: 1, border: `1.5px solid ${C.multiOutline}`, borderRadius: 8,
                  minHeight: 160, padding: 14,
                  display: "flex", flexWrap: "wrap", gap: 10, alignContent: "flex-start",
                  position: "relative",
                }}>
                  {addList.length === 0 ? (
                    <span style={{
                      position: "absolute", inset: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontFamily: FONT, fontSize: 14, fontStyle: "italic",
                      color: C.ctaOff, pointerEvents: "none",
                    }}>
                      New categories will appear here
                    </span>
                  ) : (
                    addList.map((name, i) => (
                      <div key={i} style={{ position: "relative", display: "inline-block" }}>
                        <span style={{
                          background: C.chipColor, color: C.white, borderRadius: 20,
                          padding: "6px 26px 6px 14px",
                          fontSize: 13, fontWeight: 600, display: "inline-block",
                        }}>
                          {name}
                        </span>
                        <span
                          onClick={() => setAddList((prev) => prev.filter((_, j) => j !== i))}
                          style={{
                            position: "absolute", top: -5, right: -5,
                            background: C.white, borderRadius: "50%", width: 18, height: 18,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 11, fontWeight: 700, cursor: "pointer",
                            color: "#444", boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
                          }}
                        >✕</span>
                      </div>
                    ))
                  )}
                </div>

                {/* Accept — #5252B6, glow on hover only (spec) */}
                <button
                  onClick={handleAddConfirm}
                  onMouseEnter={() => setHAccept(true)}
                  onMouseLeave={() => setHAccept(false)}
                  style={{
                    background: "#5252B6",
                    color: C.white,
                    border: "none", borderRadius: 10, padding: "14px 24px",
                    fontFamily: FONT, fontSize: 16, fontWeight: 600,
                    cursor: "pointer",
                    boxShadow: hAccept ? glow("#5252B6") : "none",
                    transition: "box-shadow 0.2s ease",
                    whiteSpace: "nowrap", alignSelf: "flex-start",
                  }}
                >Accept</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════
//
// Renders as a pure overlay — no background div.
// CategoriesScreen stays mounted behind it (App).
//
// WHY NO createPortal:
// `position: fixed` elements are positioned relative
// to the viewport and are NOT clipped by ancestor
// overflow: auto/hidden — so the ⋮ dropdown and
// rename form escape the scroll container's clip
// boundary in plain CSS, without react-dom portals.
//
// Z-index stack:
//   10  dark overlay
//   20  white modal
//   30  click-away catcher
//   9999 ⋮ dropdown / rename form (fixed, unclipped)
// ═════════════════════════════════════════════
function MulticollinearityScreen({ conflicts: initialConflicts, categories, onAccept }) {
  const [items, setItems] = useState(() =>
    initialConflicts.map((c) => ({ ...c, resolution: null, resolvedName: null }))
  );

  // Viewport-relative coords for the two floating panels
  const [menuPos,   setMenuPos]   = useState(null); // { top, left }
  const [renamePos, setRenamePos] = useState(null); // { top, left, width }

  const [openMenu,        setOpenMenu]        = useState(null);
  const [renaming,        setRenaming]        = useState(null);
  const [newName,         setNewName]         = useState("");
  const [hovOpt,          setHovOpt]          = useState(null);
  const [hovOkRename,     setHovOkRename]     = useState(false);
  const [hovCancelRename, setHovCancelRename] = useState(false);
  const [hAccept,         setHAccept]         = useState(false);

  // Refs for measuring button / row positions
  const menuBtnRefs = useRef({});
  const rowRefs     = useRef({});

  const allResolved = items.every((item) => item.resolution !== null);

  const closeAll = () => {
    setOpenMenu(null); setMenuPos(null);
    setRenaming(null); setRenamePos(null);
  };

  const handleMenuOpen = (idx) => {
    if (openMenu === idx) { closeAll(); return; }
    setRenaming(null); setRenamePos(null);
    const el = menuBtnRefs.current[idx];
    if (el) {
      const r = el.getBoundingClientRect();
      setMenuPos({ top: r.bottom + 4, left: Math.max(8, r.right - 182) });
    }
    setOpenMenu(idx);
  };

  const handleRevert = (idx) => {
    closeAll();
    setItems((prev) => prev.map((item, i) =>
      i === idx ? { ...item, resolution: "reverted", resolvedName: item.originalName } : item
    ));
  };

  /**
   * handleDelete — used when the conflicting entry was an addition
   * (originalName === newName, so there's nothing to revert to).
   * Marks resolution "deleted"; handleAccept then filters it out
   * of the category list entirely. Green triangle — same visual
   * treatment as a revert.
   */
  const handleDelete = (idx) => {
    closeAll();
    setItems((prev) => prev.map((item, i) =>
      i === idx ? { ...item, resolution: "deleted", resolvedName: null } : item
    ));
  };

  const handleChange = (idx) => {
    closeAll();
    const el = rowRefs.current[idx];
    if (el) {
      const r = el.getBoundingClientRect();
      setRenamePos({ top: r.bottom + 4, left: r.left, width: r.width - 28 });
    }
    setRenaming(idx);
    setNewName(items[idx].newName);
  };

  const confirmChange = (idx) => {
    if (!newName.trim()) return;
    setItems((prev) => prev.map((item, i) =>
      i === idx ? { ...item, resolution: "changed", resolvedName: newName.trim() } : item
    ));
    setRenaming(null); setRenamePos(null);
  };

  const handleAccept = () => {
    if (!allResolved) return;
    const updated = categories
      // Remove any category whose conflict was resolved by deletion
      .filter((cat) => {
        const conflict = items.find((item) => item.newName === cat.name);
        return !conflict || conflict.resolution !== "deleted";
      })
      .map((cat) => {
        const conflict = items.find((item) => item.newName === cat.name);
        if (!conflict) return { ...cat, modified: false };
        if (conflict.resolution === "reverted")
          return { ...cat, name: conflict.originalName, originalName: conflict.originalName, modified: false };
        // "changed"
        return { ...cat, name: conflict.resolvedName, originalName: conflict.resolvedName, modified: true };
      });
    onAccept(updated);
  };

  const triColor = (res) =>
    res === null                                   ? C.triRed   :
    res === "reverted" || res === "deleted"        ? C.triGreen :
    C.triYellowMid;

  return (
    <>
      {/* ── Dark overlay ── */}
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.50)", zIndex: 10 }} />

      {/* ── White modal ── */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 20,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      }}>
        <div style={{
          background: C.white, borderRadius: 18, padding: 28,
          width: "100%", maxWidth: 660,
          boxShadow: `${glow(C.multiGlow, 0.52, 20, 4)}, 0 8px 40px rgba(0,0,0,0.18)`,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 20, color: C.triRed, fontWeight: 700 }}>▲</span>
            <h2 style={{ fontFamily: FONT, fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>
              Multicollinearity detected!
            </h2>
          </div>
          <p style={{ fontFamily: FONT, fontSize: 14, color: C.textMuted, marginBottom: 20, lineHeight: 1.5 }}>
            Some of your categories are similar to existing ones. We recommend that you either change these to something else, or keep the original ones.
          </p>

          {/* Conflict list + Accept */}
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>

            {/* Scrollable list — overflow: hidden clips rounded corners only */}
            <div style={{ flex: 1, border: `1.5px solid ${C.cta}`, borderRadius: 10, overflow: "hidden" }}>
              <div className="multi-scroll" style={{ maxHeight: 220, overflowY: "auto", padding: "8px 10px" }}>
                {items.map((item, idx) => {
                  const isAdd   = item.originalName === item.newName; // addition, not rename
                  const isFaded = item.resolution === "reverted" || item.resolution === "deleted";
                  const resolved = item.resolution !== null;
                  return (
                    <div
                      key={idx}
                      ref={(el) => { rowRefs.current[idx] = el; }}
                      style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}
                    >
                      {/* Conflict item box */}
                      <div style={{
                        flex: 1,
                        border: `1.5px solid ${isFaded ? C.ctaOff : C.multiOutline}`,
                        borderRadius: 8, padding: "10px 12px",
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                      }}>
                        <span style={{ fontFamily: FONT, fontSize: 13, flex: 1, color: isFaded ? "#E8E8E8" : "#1a1a1a" }}>
                          {item.resolution === "reverted"
                            ? `"${item.newName}" has been reverted to "${item.originalName}"`
                            : item.resolution === "deleted"
                            ? `"${item.newName}" has been removed`
                            : item.resolution === "changed"
                            ? `"${item.newName}" is now "${item.resolvedName}"`
                            : `"${item.newName}" is very similar to "${item.conflictsWith}"`}
                        </span>
                        {/* ⋮ hidden once resolved */}
                        {!resolved && (
                          <button
                            ref={(el) => { menuBtnRefs.current[idx] = el; }}
                            onClick={() => handleMenuOpen(idx)}
                            style={{
                              background: "none", border: "none", cursor: "pointer",
                              color: C.multiOutline, fontSize: 17, fontWeight: 700,
                              padding: "0 3px", lineHeight: 1, letterSpacing: 1, flexShrink: 0,
                            }}
                          >⋮</button>
                        )}
                      </div>
                      {/* ▲ status triangle outside the box */}
                      <span style={{ fontSize: 14, fontWeight: 700, flexShrink: 0, color: triColor(item.resolution) }}>▲</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Accept button */}
            <button
              disabled={!allResolved}
              onMouseEnter={() => allResolved && setHAccept(true)}
              onMouseLeave={() => setHAccept(false)}
              onClick={handleAccept}
              style={{
                background: allResolved ? C.multiAcceptOn : C.multiAcceptOff,
                color: C.white, border: "none", borderRadius: 10, padding: "14px 20px",
                fontFamily: FONT, fontSize: 14, fontWeight: 600,
                cursor: allResolved ? "pointer" : "not-allowed",
                whiteSpace: "nowrap", alignSelf: "flex-start", marginTop: 2,
                transition: "box-shadow 0.2s ease",
                boxShadow: hAccept && allResolved ? glow(C.multiAcceptOn, 0.52, 20, 4) : "none",
              }}
            >Accept</button>
          </div>
        </div>
      </div>

      {/*
        ── Click-away catcher (z 30) ─────────────────────────────────
        Above the modal (z 20), below the floating panels (z 9999).
        Clicking anywhere outside an open dropdown closes it.
        ────────────────────────────────────────────────────────────
      */}
      {(openMenu !== null || renaming !== null) && (
        <div onClick={closeAll} style={{ position: "fixed", inset: 0, zIndex: 30 }} />
      )}

      {/*
        ── ⋮ Dropdown (position: fixed, z 9999) ─────────────────────
        position: fixed is NOT clipped by ancestor overflow: auto/hidden.
        The element is removed from the scroll container's stacking
        context entirely and painted at the viewport-relative coords
        stored in menuPos. No react-dom portal required.
        ────────────────────────────────────────────────────────────
      */}
      {openMenu !== null && menuPos && (
        <div style={{
          position: "fixed", top: menuPos.top, left: menuPos.left,
          zIndex: 9999, background: C.white, borderRadius: 8,
          boxShadow: `${glow()}, 0 4px 16px rgba(0,0,0,0.12)`,
          overflow: "hidden", minWidth: 182,
        }}>
          {(() => {
            const item = items[openMenu];
            // isAdd: original === new → no prior name to revert to → show Delete instead
            const isAdd = item && item.originalName === item.newName;
            const first = isAdd
              ? { key: "delete", icon: "🗑️", label: "Delete" }
              : { key: "revert", icon: "↺",  label: "Revert to original name" };
            return [first, { key: "change", icon: "✏️", label: "Change" }].map(({ key, icon, label }) => (
              <div key={key}
                onMouseEnter={() => setHovOpt({ key })}
                onMouseLeave={() => setHovOpt(null)}
                onClick={() => {
                  if (key === "revert") handleRevert(openMenu);
                  if (key === "delete") handleDelete(openMenu);
                  if (key === "change") handleChange(openMenu);
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "11px 14px", cursor: "pointer",
                  fontFamily: FONT, fontSize: 13, fontWeight: 500, color: "#484290",
                  background: hovOpt?.key === key ? "rgba(184,184,223,0.5)" : "transparent",
                  transition: "background 0.1s",
                }}
              >
                <span style={{ fontSize: 15 }}>{icon}</span>{label}
              </div>
            ));
          })()}
        </div>
      )}

      {/*
        ── Rename form (position: fixed, z 9999) ────────────────────
        Same fixed-positioning strategy as the dropdown above.
        Appears directly below the row that triggered "Change".
        ────────────────────────────────────────────────────────────
      */}
      {renaming !== null && renamePos && (
        <div style={{
          position: "fixed", top: renamePos.top, left: renamePos.left, width: renamePos.width,
          zIndex: 9999, background: C.white, borderRadius: 10, padding: "14px 16px",
          boxShadow: `${glow()}, 0 4px 20px rgba(0,0,0,0.12)`,
        }}>
          <p style={{ fontFamily: FONT, fontSize: 12, color: C.textMuted, marginBottom: 8, lineHeight: 1.4 }}>
            What would you like to change <strong>"{items[renaming]?.newName}"</strong> to?
            <br /><span style={{ fontSize: 11, color: "#aaa" }}>(please enter a name similar to existing categories and distinct from others)</span>
          </p>
          <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confirmChange(renaming)}
            placeholder="Enter new name of category"
            style={{ width: "100%", border: "none", borderRadius: 6, padding: "9px 12px", fontFamily: FONT, fontSize: 13, background: C.ctaOff, color: C.white, outline: "none", marginBottom: 8 }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button onMouseEnter={() => setHovOkRename(true)} onMouseLeave={() => setHovOkRename(false)}
              onClick={() => confirmChange(renaming)}
              style={{ flex: 1, border: "2px solid #4EA72E", borderRadius: 6, padding: "7px", fontFamily: FONT, fontSize: 13, fontWeight: 600, cursor: "pointer", background: hovOkRename && newName.trim() ? "#4EA72E" : "transparent", color: hovOkRename && newName.trim() ? C.white : "#4EA72E", transition: "all 0.15s ease" }}
            >OK</button>
            <button onMouseEnter={() => setHovCancelRename(true)} onMouseLeave={() => setHovCancelRename(false)}
              onClick={() => { setRenaming(null); setRenamePos(null); }}
              style={{ flex: 1, border: "2px solid #FF0000", borderRadius: 6, padding: "7px", fontFamily: FONT, fontSize: 13, fontWeight: 600, cursor: "pointer", background: hovCancelRename ? "#FF0000" : "transparent", color: hovCancelRename ? C.white : "#FF0000", transition: "all 0.15s ease" }}
            >Cancel</button>
          </div>
        </div>
      )}
    </>
  );
}


// ═════════════════════════════════════════════
// SCREEN: USE EXISTING MODEL — SELECT  (slides 62–64)
// ═════════════════════════════════════════════
function UseExistingScreen({ navigate, onProceed, models }) {
  const [search,  setSearch]  = useState("");
  const [hovProc, setHovProc] = useState(null);

  const filtered = models.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: FONT, padding: "90px 60px 60px", position: "relative" }}>
      <HomeBtn navigate={navigate} />

      <h1 style={{ color: C.white, fontSize: 52, fontWeight: 300, marginBottom: 40, textShadow: TEXT_SHADOW }}>
        Select existing model
      </h1>

      {/* Outer container — outline #3E3E94, no fill */}
      <div style={{ border: `1.5px solid ${C.cta}`, borderRadius: 14, overflow: "hidden", maxWidth: 900, maxHeight: 480, display: "flex", flexDirection: "column" }}>

        {/* Search bar — fill #B8B8DF, placeholder #FFFFFF (.model-search CSS), icon #3E3E94 */}
        <div style={{ background: C.ctaOff, padding: "14px 18px", flexShrink: 0, display: "flex", alignItems: "center", gap: 10, borderBottom: `0.75px solid ${C.cta}` }}>
          <input
            className="model-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by model name"
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontFamily: FONT, fontSize: 16, color: C.white }}
          />
          <Search size={20} color={C.cta} strokeWidth={1.8} />
        </div>

        {/* Scrollable model list — custom scrollbar #3E3E94 track / #B8B8DF thumb */}
        <div className="model-scroll" style={{ overflowY: "auto", flex: 1, padding: "10px 12px" }}>
          {filtered.length === 0 ? (
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, padding: 20, textAlign: "center", fontFamily: FONT }}>No models found</p>
          ) : filtered.map((model) => (
            <div key={model.id} style={{ border: `1.5px solid ${C.cta}`, borderRadius: 10, padding: "16px 20px", marginBottom: 10, display: "flex", alignItems: "center", background: "transparent" }}>
              {/* Name + date */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: C.white, fontSize: 20, fontWeight: 500, margin: "0 0 8px", letterSpacing: -0.2 }}>{model.name}</p>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Calendar size={14} color={C.cta} strokeWidth={1.8} />
                  <span style={{ color: C.white, fontSize: 13 }}>{model.date}</span>
                </div>
              </div>
              {/* Category count badge — #5252B6 fill */}
              <div style={{ background: "#5252B6", borderRadius: 20, padding: "6px 14px", marginRight: 20, flexShrink: 0, color: C.white, fontSize: 12, fontWeight: 500 }}>
                Contains {model.categoryCount} categories
              </div>
              {/* Proceed → */}
              <button
                onMouseEnter={() => setHovProc(model.id)}
                onMouseLeave={() => setHovProc(null)}
                onClick={() => onProceed(model)}
                style={{ background: C.cta, color: C.white, border: "none", borderRadius: 10, padding: "12px 26px", fontFamily: FONT, fontSize: 15, fontWeight: 600, cursor: "pointer", flexShrink: 0, transition: "box-shadow 0.2s ease", boxShadow: hovProc === model.id ? glow() : "none" }}
              >Proceed →</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════
// SCREEN: APPLY MODEL — DATA UPLOAD  (slides 65–71)
//
// Model name + description are inline-editable
// (pencil icon #484290, caret-color #595959).
// Upload box: dashed #6060BC border, large centred
// label. After upload: same green chiclet as Create New.
// Max 20 MB (vs 10 MB on Create New).
// ═════════════════════════════════════════════
function ApplyUploadScreen({ navigate, model, onUpdateModel }) {
  const [file,     setFile]     = useState(null);
  const [name,     setName]     = useState(model?.name        || "Model Name");
  const [desc,     setDesc]     = useState(model?.description || "Description about this model, generated by AI");
  const [editName, setEditName] = useState(false);
  const [editDesc, setEditDesc] = useState(false);
  const [hFile,    setHFile]    = useState(false);
  const [hBtn,     setHBtn]     = useState(false);
  const fileRef = useRef();
  const nameRef = useRef();
  const descRef = useRef();

  const accept = (f) => {
    if (f && (f.name.endsWith(".csv") || f.name.endsWith(".xlsx"))) setFile(f);
  };

  /** Persist a name save upward so the model list reflects the change */
  const saveName = (val) => {
    setEditName(false);
    if (val.trim()) onUpdateModel?.({ ...model, name: val.trim(), description: desc });
  };

  /** Persist a description save upward */
  const saveDesc = (val) => {
    setEditDesc(false);
    onUpdateModel?.({ ...model, name, description: val });
  };

  useEffect(() => { if (editName) nameRef.current?.focus(); }, [editName]);
  useEffect(() => { if (editDesc) descRef.current?.focus(); }, [editDesc]);

  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: FONT, padding: "90px 110px 60px", position: "relative" }}>
      <HomeBtn navigate={navigate} />

      {/* Model name + pencil icon */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10 }}>
        {editName ? (
          <input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)}
            onBlur={() => saveName(name)}
            onKeyDown={(e) => e.key === "Enter" && saveName(name)}
            style={{ background: "transparent", border: "none", outline: "none", fontFamily: FONT, fontSize: 46, fontWeight: 300, color: C.white, caretColor: C.textMuted, letterSpacing: -1, flex: 1 }}
          />
        ) : (
          <h1 style={{ color: C.white, fontSize: 46, fontWeight: 300, margin: 0, letterSpacing: -1, textShadow: TEXT_SHADOW }}>{name}</h1>
        )}
        <Pencil size={20} color="#484290" strokeWidth={1.8} onClick={() => setEditName(true)} style={{ cursor: "pointer", flexShrink: 0, marginTop: 4 }} />
      </div>

      {/* Date */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
        <Calendar size={15} color={C.cta} strokeWidth={1.8} />
        <span style={{ color: C.white, fontSize: 14 }}>{model?.date || "Jun 12, 2026"}</span>
      </div>

      {/* Description + pencil icon */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 44 }}>
        {editDesc ? (
          <textarea ref={descRef} value={desc} onChange={(e) => setDesc(e.target.value)}
            onBlur={() => saveDesc(desc)} rows={2}
            style={{ background: "transparent", border: "none", outline: "none", resize: "none", fontFamily: FONT, fontSize: 16, color: C.white, caretColor: C.textMuted, flex: 1, lineHeight: 1.55 }}
          />
        ) : (
          <p style={{ color: C.white, fontSize: 16, margin: 0, lineHeight: 1.55, textShadow: TEXT_SHADOW_LIGHT }}>{desc}</p>
        )}
        <Pencil size={18} color="#484290" strokeWidth={1.8} onClick={() => setEditDesc(true)} style={{ cursor: "pointer", flexShrink: 0, marginTop: 2 }} />
      </div>

      {/* Fixed-height upload zone (prevents button shift on chiclet appearance) */}
      <div style={{ height: 140, marginBottom: 32 }}>
        {!file ? (
          <div onClick={() => fileRef.current.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); accept(e.dataTransfer.files[0]); }}
            style={{ border: "2px dashed #6060BC", borderRadius: 12, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 14, cursor: "pointer", color: C.white, fontSize: 22, fontWeight: 300 }}
          >
            <span style={{ fontSize: 32, fontWeight: 200 }}>+</span>
            Click to upload{" "}
            <span style={{ fontSize: 15, opacity: 0.72 }}>(max 20 MB)</span>
          </div>
        ) : (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ position: "relative" }}>
              <div onMouseEnter={() => setHFile(true)} onMouseLeave={() => setHFile(false)}
                style={{ backgroundColor: C.fileChiclet, borderRadius: 24, padding: "10px 20px", display: "flex", alignItems: "center", gap: 10, color: C.textMuted, fontSize: 14, fontWeight: 600, cursor: "pointer", position: "relative", boxShadow: hFile ? glow(C.fileGlow, 0.56, 14, 3) : "none", transition: "box-shadow 0.2s ease" }}
              >
                <span style={{ background: "#217346", color: C.white, borderRadius: 4, padding: "2px 5px", fontWeight: 700, fontSize: 11 }}>X</span>
                {file.name}
                {hFile && <RemoveX onRemove={() => { setFile(null); setHFile(false); }} />}
              </div>
            </div>
          </div>
        )}
      </div>

      <input ref={fileRef} type="file" accept=".csv,.xlsx" style={{ display: "none" }} onChange={(e) => accept(e.target.files[0])} />

      {/* Extract comments */}
      <button disabled={!file}
        onMouseEnter={() => file && setHBtn(true)} onMouseLeave={() => setHBtn(false)}
        onClick={() => file && navigate(S.APPLY_COLUMNS)}
        style={{ display: "block", margin: "0 auto", background: file ? C.cta : C.ctaOff, color: file ? C.white : C.ctaOffText, border: "none", borderRadius: 14, padding: "18px 64px", fontFamily: FONT, fontSize: 18, fontWeight: 600, cursor: file ? "pointer" : "not-allowed", transition: "box-shadow 0.2s ease", boxShadow: hBtn && file ? glow() : "none" }}
      >Extract comments</button>
    </div>
  );
}

// ═════════════════════════════════════════════
// SCREEN: APPLY MODEL — COLUMN SELECTION  (slides 72–77)
//
// Two dropdowns: comments column (required, red *)
// and dependent variable (optional, --N/A default).
// Begin Magic Show activates when comments column selected.
// Gradient: 130deg #5252B6→#FF66FF→#FBE3D6.
// Wand icon colour: inactive #D9D9D9, active #CAEEFB.
// ═════════════════════════════════════════════
const DEP_VAR_OPTIONS = ["--N/A (Skip)--", ...DEMO_COLUMNS];
const MAGIC_GRADIENT  = "linear-gradient(130deg, #FFB3D9 0%, #FF66FF 50%, #5252B6 100%)";

function ApplyColumnsScreen({ navigate, onBeginMagicShow }) {
  const [comOpen, setComOpen] = useState(false);
  const [comSrch, setComSrch] = useState("");
  const [comCol,  setComCol]  = useState(null);
  const [depOpen, setDepOpen] = useState(false);
  const [depSrch, setDepSrch] = useState("");
  const [depVar,  setDepVar]  = useState("--N/A (Skip)--");
  const [hovOpt,  setHovOpt]  = useState(null); // { d: "com"|"dep", col }
  const [hMagic,  setHMagic]  = useState(false);
  const comRef = useRef();
  const depRef = useRef();

  useEffect(() => { if (comOpen) setTimeout(() => comRef.current?.focus(), 50); }, [comOpen]);
  useEffect(() => { if (depOpen) setTimeout(() => depRef.current?.focus(), 50); }, [depOpen]);

  const filteredCom = DEMO_COLUMNS.filter((c) => c.toLowerCase().includes(comSrch.toLowerCase()));
  const filteredDep = DEP_VAR_OPTIONS.filter((c) => c.toLowerCase().includes(depSrch.toLowerCase()));
  const canBegin    = !!comCol;

  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: FONT, padding: 40, position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <HomeBtn navigate={navigate} />

      <div style={{ width: "100%", maxWidth: 700, display: "flex", flexDirection: "column", gap: 24 }}>

        {/* Comments column — required, red asterisk */}
        <h2 style={{ color: C.white, fontSize: 26, fontWeight: 500, margin: 0, lineHeight: 1.45, textShadow: TEXT_SHADOW_LIGHT }}>
          <span style={{ color: "#FF0000", fontWeight: 700 }}>*</span>
          Which of the following columns contains the comments?
        </h2>

        {/* Comments dropdown */}
        <div style={{ position: "relative" }}>
          <div onClick={() => setComOpen((o) => !o)} style={{ background: C.white, borderRadius: 14, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", boxShadow: glow(), userSelect: "none" }}>
            {comCol ? (
              <div style={{ position: "relative", display: "inline-block" }}>
                <span style={{ background: C.chipColor, color: C.white, borderRadius: 20, padding: "5px 22px 5px 14px", fontSize: 14, fontWeight: 600, display: "inline-block" }}>{comCol}</span>
                <RemoveX onRemove={() => setComCol(null)} />
              </div>
            ) : (
              <span style={{ color: C.textMuted, fontSize: 16 }}>Select column</span>
            )}
            <span style={{ color: C.textMuted, fontSize: 12, flexShrink: 0, marginLeft: 8, transform: comOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▲</span>
          </div>
          {comOpen && (
            <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 200, background: C.white, borderRadius: 12, overflow: "hidden", boxShadow: `${glow()}, 0 6px 24px rgba(0,0,0,0.12)` }}>
              <div style={{ display: "flex", alignItems: "center", padding: "12px 16px", gap: 10, borderBottom: "1px solid rgba(89,89,89,0.2)" }}>
                <input ref={comRef} value={comSrch} onChange={(e) => setComSrch(e.target.value)} placeholder="Search column" style={{ flex: 1, border: "none", outline: "none", fontFamily: FONT, fontSize: 15, color: C.textMuted, background: "transparent" }} />
                <Search size={17} color={C.textMuted} strokeWidth={1.8} />
              </div>
              <div style={{ maxHeight: 200, overflowY: "auto" }}>
                {filteredCom.map((col) => (
                  <div key={col} onMouseEnter={() => setHovOpt({ d: "com", col })} onMouseLeave={() => setHovOpt(null)} onClick={() => { setComCol(col); setComOpen(false); setComSrch(""); }} style={{ padding: "12px 18px", cursor: "pointer", fontFamily: FONT, fontSize: 15, color: "#1a1a1a", background: hovOpt?.d === "com" && hovOpt?.col === col ? "rgba(184,184,223,0.5)" : "transparent", transition: "background 0.1s" }}>{col}</div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Dependent variable */}
        <h2 style={{ color: C.white, fontSize: 22, fontWeight: 400, margin: 0, lineHeight: 1.45, textShadow: TEXT_SHADOW_LIGHT }}>
          Is there a dependent variable?
        </h2>

        {/* Dependent variable dropdown — plain text display, no chip */}
        <div style={{ position: "relative" }}>
          <div onClick={() => setDepOpen((o) => !o)} style={{ background: C.white, borderRadius: 14, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", boxShadow: glow(), userSelect: "none" }}>
            {depVar !== "--N/A (Skip)--" ? (
              /* Selected column — purple chip with ✕, same pattern as comment column */
              <div style={{ position: "relative", display: "inline-block" }}>
                <span style={{ background: C.chipColor, color: C.white, borderRadius: 20, padding: "5px 22px 5px 14px", fontSize: 14, fontWeight: 600, display: "inline-block" }}>
                  {depVar}
                </span>
                <RemoveX onRemove={() => { setDepVar("--N/A (Skip)--"); }} />
              </div>
            ) : (
              <span style={{ color: C.textMuted, fontSize: 16 }}>--N/A (Skip)--</span>
            )}
            <span style={{ color: C.textMuted, fontSize: 12, flexShrink: 0, marginLeft: 8, transform: depOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▲</span>
          </div>
          {depOpen && (
            <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 200, background: C.white, borderRadius: 12, overflow: "hidden", boxShadow: `${glow()}, 0 6px 24px rgba(0,0,0,0.12)` }}>
              <div style={{ display: "flex", alignItems: "center", padding: "12px 16px", gap: 10, borderBottom: "1px solid rgba(89,89,89,0.2)" }}>
                <input ref={depRef} value={depSrch} onChange={(e) => setDepSrch(e.target.value)} placeholder="Search column" style={{ flex: 1, border: "none", outline: "none", fontFamily: FONT, fontSize: 15, color: C.textMuted, background: "transparent" }} />
                <Search size={17} color={C.textMuted} strokeWidth={1.8} />
              </div>
              <div style={{ maxHeight: 200, overflowY: "auto" }}>
                {filteredDep.map((col) => (
                  <div key={col} onMouseEnter={() => setHovOpt({ d: "dep", col })} onMouseLeave={() => setHovOpt(null)} onClick={() => { setDepVar(col); setDepOpen(false); setDepSrch(""); }} style={{ padding: "12px 18px", cursor: "pointer", fontFamily: FONT, fontSize: 15, color: "#1a1a1a", background: hovOpt?.d === "dep" && hovOpt?.col === col ? "rgba(184,184,223,0.5)" : "transparent", transition: "background 0.1s" }}>{col}</div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Begin Magic Show */}
        <button
          disabled={!canBegin}
          onMouseEnter={() => canBegin && setHMagic(true)}
          onMouseLeave={() => setHMagic(false)}
          onClick={() => canBegin && onBeginMagicShow(depVar)}
          style={{ background: canBegin ? MAGIC_GRADIENT : C.ctaOff, color: canBegin ? C.white : C.ctaOffText, border: "none", borderRadius: 14, padding: "20px 48px", fontFamily: FONT, fontSize: 18, fontWeight: 600, cursor: canBegin ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, transition: "box-shadow 0.2s ease", boxShadow: hMagic && canBegin ? glow() : "none", alignSelf: "center" }}
        >
          Begin Magic Show
          <Wand2 size={22} color={canBegin ? "#CAEEFB" : C.ctaOffText} strokeWidth={1.5} />
        </button>
      </div>

      {/* Click-away closes dropdowns */}
      {(comOpen || depOpen) && (
        <div onClick={() => { setComOpen(false); setDepOpen(false); }} style={{ position: "fixed", inset: 0, zIndex: 100 }} />
      )}
    </div>
  );
}



// ═════════════════════════════════════════════
// RESULTS — MOCK DATA & HELPERS
// In production all of this comes from
// POST /analyse on the Python backend.
// ═════════════════════════════════════════════

const MOCK_RESULTS = {
  date:                 "May 8, 2026",
  rowsProcessed:        18059,
  mostFreqCategory:     "Customer Support",
  avgSentiment:         -0.24,
  immediateActionables: 195,
  categories: [
    { name: "Shipping Delays",  count: 3200, sentiment: -0.72, impact: 1.85 },
    { name: "Wrong Item",       count: 2100, sentiment: -0.58, impact: 1.45 },
    { name: "Missing Items",    count: 1800, sentiment: -0.45, impact: 1.20 },
    { name: "Cust. Support",    count: 2800, sentiment: -0.32, impact: 1.40 },
    { name: "Product Quality",  count: 2500, sentiment:  0.65, impact: 1.65 },
    { name: "Value for Money",  count: 1600, sentiment:  0.42, impact: 0.95 },
    { name: "Rude Staff",       count: 900,  sentiment: -0.68, impact: 1.75 },
    { name: "Refund Req.",      count: 1100, sentiment: -0.28, impact: 1.35 },
    { name: "Easy Returns",     count: 700,  sentiment:  0.55, impact: 0.70 },
    { name: "Fast Delivery",    count: 800,  sentiment:  0.72, impact: 0.80 },
    { name: "Friendly Staff",   count: 650,  sentiment:  0.68, impact: 0.55 },
  ],
};

/** Pre-computed bubble centres for the pack chart (SVG viewBox 0 0 660 390) */
const BUBBLE_POS = [
  { bx: 350, by: 185 }, // Shipping Delays
  { bx: 215, by: 175 }, // Wrong Item
  { bx: 210, by: 295 }, // Missing Items
  { bx: 325, by: 318 }, // Cust. Support
  { bx: 490, by: 165 }, // Product Quality
  { bx: 475, by: 312 }, // Value for Money
  { bx: 115, by: 170 }, // Rude Staff
  { bx: 420, by: 278 }, // Refund Req.
  { bx: 546, by: 332 }, // Easy Returns
  { bx: 185, by: 362 }, // Fast Delivery
  { bx: 312, by: 375 }, // Friendly Staff
];

/**
 * sentColor(s) — interpolates between the three spec colours:
 *   -1 → #FF033F (red)  ·  0 → #FFC303 (yellow)  ·  +1 → #00B050 (green)
 */
const sentColor = (s) => {
  const t   = Math.max(-1, Math.min(1, s));
  const mix = (a, b, u) => Math.round(a + (b - a) * u);
  const L = [255, 3,   63];   // #FF033F
  const M = [255, 195, 3];    // #FFC303
  const H = [0,   176, 80];   // #00B050
  const [r, g, b] = t <= 0
    ? L.map((v, i) => mix(v, M[i], t + 1))
    : M.map((v, i) => mix(v, H[i], t));
  return `rgb(${r},${g},${b})`;
};

// ─────────────────────────────────────────────
// IMPACT CHART — split into two Recharts components
// so labels are drawn after ALL circles, enabling
// proper collision avoidance.
//
// _impactPos: module-level store that SimpleDot
//   fills during its render pass, then ImpactLabels
//   reads in the same synchronous render cycle.
// ─────────────────────────────────────────────
const IMP_COUNTS = MOCK_RESULTS.categories.map(c => c.count);
const IMP_Z_MIN  = Math.min(...IMP_COUNTS);
const IMP_Z_MAX  = Math.max(...IMP_COUNTS);

const impactR = (z) => {
  const area = 300 + ((z - IMP_Z_MIN) / (IMP_Z_MAX - IMP_Z_MIN)) * (5000 - 300);
  return Math.sqrt(area / Math.PI);
};

/**
 * _impactPosFill  : filled by SimpleDot each full render pass.
 * _impactPosCache : persistent — survives tooltip/hover partial re-renders
 *   where Customized re-renders but Scatter/SimpleDot does not.
 */
let _impactPosFill  = [];
let _impactPosCache = [];

/** Draws only the circle and pushes its screen position to the fill buffer */
const SimpleDot = ({ cx, cy, payload }) => {
  if (cx == null || cy == null) return null;
  const r = impactR(payload.z);
  _impactPosFill.push({ name: payload.name, z: payload.z, fill: payload.fill, cx, cy, r });
  return <circle cx={cx} cy={cy} r={r} fill={payload.fill} opacity={0.65} />;
};

/**
 * Angular greedy label placement:
 * 1. Process bubbles largest-first so prominent labels get prime spots.
 * 2. For each bubble, score N candidate angles and pick the best one:
 *      - Penalise positions inside any circle.
 *      - Penalise overlap with already-placed label bounding boxes.
 *      - Prefer downward angles.
 * 3. Draw angled leader lines from bubble edge to label anchor.
 * 4. textAnchor adapts to the chosen direction.
 */
const ImpactLabels = () => {
  if (_impactPosFill.length > 0) {
    _impactPosCache = _impactPosFill.slice();
    _impactPosFill  = [];
  }
  const positions = _impactPosCache;
  if (!positions.length) return null;

  const FONT_H = 13;   // approx label height (px)
  const CHAR_W = 5.0;  // approx px / char at 8.5 px font
  const LEAD   = 18;   // distance from bubble edge to label anchor

  // Candidate (angle_rad, textAnchor) pairs
  // 0 = right, π/2 = down (screen Y increases downward)
  const CANDS = [
    [Math.PI / 2,        "middle"],  // ↓ down
    [Math.PI * 2 / 3,    "end"],     // ↙ lower-left
    [Math.PI / 3,        "start"],   // ↘ lower-right
    [Math.PI * 3 / 4,    "end"],     // ← left + down
    [Math.PI / 4,        "start"],   // → right + down
    [Math.PI * 5 / 6,    "end"],     // ← mostly left
    [Math.PI / 6,        "start"],   // → mostly right
    [Math.PI,            "end"],     // ← straight left
    [0,                  "start"],   // → straight right
    [Math.PI * 7 / 8,    "end"],     // far left, slight down
    [Math.PI / 8,        "start"],   // far right, slight down
  ];

  // Label bounding box helper (actual pixel extent of text)
  const bounds = (lx, tw, anchor) =>
    anchor === "start"  ? { l: lx,        r: lx + tw  } :
    anchor === "end"    ? { l: lx - tw,   r: lx       } :
                          { l: lx - tw/2, r: lx + tw/2 };

  // Greedy: largest bubble first
  const order = [...positions].sort((a, b) => b.r - a.r);
  const placed = [];

  for (const pos of order) {
    const text = `${pos.name} (${pos.z?.toLocaleString()})`;
    const tw   = text.length * CHAR_W;

    let bestScore = -Infinity;
    let best      = null;

    for (const [angle, anchor] of CANDS) {
      const lx = pos.cx + (pos.r + LEAD) * Math.cos(angle);
      const ly = pos.cy + (pos.r + LEAD) * Math.sin(angle);
      let score  = 0;

      // Penalise label centre inside any circle
      for (const circ of positions) {
        const d = Math.sqrt((lx - circ.cx) ** 2 + (ly + FONT_H / 2 - circ.cy) ** 2);
        if (d < circ.r + FONT_H / 2 + 4) score -= 1200;
      }

      // Penalise overlap with placed label bounding boxes
      const ba = bounds(lx, tw, anchor);
      for (const p of placed) {
        const bp = bounds(p.lx, p.tw, p.anchor);
        const xOvlp = ba.r > bp.l - 4 && ba.l < bp.r + 4;
        const yOvlp = Math.abs(ly - p.ly) < FONT_H + 2;
        if (xOvlp && yOvlp) score -= 800;
      }

      // Prefer downward placement
      score += Math.sin(angle) * 40;
      // Slight bonus for straight down
      if (Math.abs(angle - Math.PI / 2) < 0.15) score += 25;

      if (score > bestScore) {
        bestScore = score;
        best = { lx, ly, anchor, angle };
      }
    }

    if (best) placed.push({ ...pos, ...best, tw, text });
  }

  return (
    <g>
      {placed.map((lab) => {
        // Leader line: bubble edge → label anchor
        const x1 = lab.cx + (lab.r + 2) * Math.cos(lab.angle);
        const y1 = lab.cy + (lab.r + 2) * Math.sin(lab.angle);
        // Adjust line tip to near edge of text box
        const tip = lab.anchor === "start" ? lab.lx - 2
                  : lab.anchor === "end"   ? lab.lx + 2
                  :                          lab.lx;
        const showLine = Math.sqrt((x1 - lab.cx) ** 2 + (y1 - lab.cy) ** 2) > lab.r + 6;
        return (
          <g key={lab.name}>
            {showLine && (
              <line x1={x1} y1={y1} x2={tip} y2={lab.ly + FONT_H / 2}
                stroke="#bbb" strokeWidth={0.8} />
            )}
            <text x={lab.lx} y={lab.ly}
              textAnchor={lab.anchor} dominantBaseline="hanging"
              fontSize={8.5} fontFamily={FONT} fill="#595959">
              {lab.text}
            </text>
          </g>
        );
      })}
    </g>
  );
};

// ═════════════════════════════════════════════
// SCREEN: RESULTS DASHBOARD  (slides 83–89)
//
// Single scrollable white card on the gradient BG.
// Sticky header: title, date (#5252B6), Export btn.
// Body sections (scroll under the header):
//   • 2×2 KPI tile grid
//   • Topic & Sentiment bubble pack (custom SVG)
//   • Impact Analysis quadrant (Recharts Scatter)
//   • AI Diagnostic Summary (placeholder text)
//
// Home button: icon only, no text (spec slide 83).
// Export dropdown: Download pdf / Download csv.
// ═════════════════════════════════════════════
function ResultsScreen({ navigate, model, depVar }) {
  const [exportOpen, setExportOpen] = useState(false);
  const [hovExport,  setHovExport]  = useState(false);
  const [hovExpOpt,  setHovExpOpt]  = useState(null);
  const [bubbleTip,  setBubbleTip]  = useState(null);

  const title = `${model?.name || "ACME genre"} Text Analysis Dashboard`;
  const date  = model?.date || MOCK_RESULTS.date;

  /** True only when the user actually selected a dependent variable column */
  const showImpact = !!depVar && depVar !== "--N/A (Skip)--";

  const counts = MOCK_RESULTS.categories.map(c => c.count);
  const maxCnt = Math.max(...counts);
  const minCnt = Math.min(...counts);
  const bRad   = (n) => 22 + ((n - minCnt) / (maxCnt - minCnt)) * 48;

  /**
   * D3 force simulation — packs bubbles tightly together like the spec.
   * Computed once on mount; MOCK_RESULTS and bRad are both stable.
   * Starts all nodes at the SVG centre then lets collide + centre forces
   * settle them into a natural compact cluster.
   */
  const bubbleNodes = useMemo(() => {
    const W = 660, H = 390;
    const data = MOCK_RESULTS.categories.map(cat => ({
      ...cat,
      r: bRad(cat.count),
      x: W / 2,
      y: H / 2,
    }));

    const sim = d3.forceSimulation(data)
      .force("center",    d3.forceCenter(W / 2, H / 2))
      .force("collision", d3.forceCollide(d => d.r + 2.5).strength(1))
      .force("x",         d3.forceX(W / 2).strength(0.06))
      .force("y",         d3.forceY(H / 2).strength(0.06))
      .stop();

    for (let i = 0; i < 400; i++) sim.tick();

    return data.map(d => ({
      ...d,
      x: Math.max(d.r + 4, Math.min(W - d.r - 4, d.x)),
      y: Math.max(d.r + 4, Math.min(H - d.r - 4, d.y)),
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{
      minHeight: "100vh", background: BG, fontFamily: FONT,
      display: "flex", justifyContent: "center",
      padding: "20px 30px 30px", position: "relative",
    }}>
      {/* Home — icon only per spec */}
      <button onClick={() => navigate(S.HOME)} style={{
        position: "fixed", top: 22, left: 26, zIndex: 60,
        background: "none", border: "none", cursor: "pointer", padding: 4,
      }}>
        <Home size={24} color={C.cta} strokeWidth={1.5} />
      </button>

      {/* ── White report card ── */}
      <div style={{
        background: C.white, borderRadius: 16, width: "100%", maxWidth: 880,
        marginTop: 8, boxShadow: glow(),
        height: "calc(100vh - 50px)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>

        {/* ── Sticky header ── */}
        <div style={{ flexShrink: 0, padding: "20px 28px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>

            {/* Title + date */}
            <div>
              <h1 style={{ fontFamily: FONT, fontSize: 20, fontWeight: 400, color: "#1a1a1a", margin: "0 0 6px" }}>
                {title}
              </h1>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Calendar size={13} color="#5252B6" strokeWidth={1.8} />
                <span style={{ fontFamily: FONT, fontSize: 13, color: "#5252B6", fontWeight: 600 }}>{date}</span>
              </div>
            </div>

            {/* Export button + dropdown */}
            <div style={{ position: "relative" }}>
              <button
                onMouseEnter={() => setHovExport(true)}
                onMouseLeave={() => setHovExport(false)}
                onClick={() => setExportOpen(o => !o)}
                style={{
                  background: "#E2E2F2", border: "none", borderRadius: 10, padding: "9px 16px",
                  display: "flex", alignItems: "center", gap: 7,
                  fontFamily: FONT, fontSize: 14, fontWeight: 500, color: "#5252B6",
                  cursor: "pointer",
                  boxShadow: hovExport ? glow() : "none",
                  transition: "box-shadow 0.2s ease",
                }}
              >
                <Download size={15} color="#5252B6" strokeWidth={2} /> Export
              </button>
              {exportOpen && (
                <div style={{
                  position: "absolute", right: 0, top: "calc(100% + 6px)",
                  background: C.white, borderRadius: 8, zIndex: 100,
                  boxShadow: `${glow()}, 0 4px 16px rgba(0,0,0,0.10)`,
                  overflow: "hidden", minWidth: 150,
                }}>
                  {["Download pdf", "Download csv"].map(opt => (
                    <div key={opt}
                      onMouseEnter={() => setHovExpOpt(opt)}
                      onMouseLeave={() => setHovExpOpt(null)}
                      onClick={() => setExportOpen(false)}
                      style={{
                        padding: "11px 16px", cursor: "pointer",
                        fontFamily: FONT, fontSize: 14, color: "#1a1a1a",
                        background: hovExpOpt === opt ? "rgba(184,184,223,0.5)" : "transparent",
                        transition: "background 0.1s",
                      }}
                    >{opt}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {/* Separator line — black as per spec */}
          <div style={{ height: "1.5px", background: "#000", margin: "0 -28px" }} />
        </div>

        {/* ── Scrollable body ── */}
        <div style={{ overflowY: "auto", flex: 1, padding: "24px 28px 36px" }}>

          {/* KPI tiles — 2 × 2 grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }}>

            {/* Rows Processed — database icon #5252B6 */}
            <div style={{ border: "1.5px solid #B8B8DF", borderRadius: 12, padding: "20px 22px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <Database size={34} color="#5252B6" strokeWidth={1.4} />
                <div>
                  <p style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, color: "#595959", letterSpacing: 1.2, margin: "0 0 4px", textTransform: "uppercase" }}>Rows Processed</p>
                  <p style={{ fontFamily: FONT, fontSize: 28, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>{MOCK_RESULTS.rowsProcessed.toLocaleString()}</p>
                </div>
              </div>
            </div>

            {/* Most Frequent Category — chat icon #F9B407 */}
            <div style={{ border: "1.5px solid #B8B8DF", borderRadius: 12, padding: "20px 22px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <MessageSquare size={34} color="#F9B407" strokeWidth={1.4} />
                <div>
                  <p style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, color: "#595959", letterSpacing: 1.2, margin: "0 0 4px", textTransform: "uppercase" }}>Most Frequent Category</p>
                  <p style={{ fontFamily: FONT, fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>{MOCK_RESULTS.mostFreqCategory}</p>
                </div>
              </div>
            </div>

            {/* Avg. Sentiment — split brain icon (left #84E291, right #FFC5C5) */}
            <div style={{ border: "1.5px solid #B8B8DF", borderRadius: 12, padding: "20px 22px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ display: "flex", flexShrink: 0 }}>
                  <div style={{ width: 20, height: 34, borderRadius: "50% 0 0 50%", background: "#84E291", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Heart size={12} color="white" fill="white" strokeWidth={0} />
                  </div>
                  <div style={{ width: 20, height: 34, borderRadius: "0 50% 50% 0", background: "#FFC5C5", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <HeartCrack size={12} color="white" strokeWidth={2} />
                  </div>
                </div>
                <div>
                  <p style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, color: "#595959", letterSpacing: 1.2, margin: "0 0 4px", textTransform: "uppercase" }}>Avg. Sentiment</p>
                  <p style={{ fontFamily: FONT, fontSize: 28, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>{MOCK_RESULTS.avgSentiment}</p>
                </div>
              </div>
            </div>

            {/* Immediate Actionables — red triangle */}
            <div style={{ border: "1.5px solid #B8B8DF", borderRadius: 12, padding: "20px 22px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{ fontSize: 32, color: "#FF0000", fontWeight: 700, lineHeight: 1, flexShrink: 0 }}>▲</span>
                <div>
                  <p style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, color: "#595959", letterSpacing: 1.2, margin: "0 0 4px", textTransform: "uppercase" }}>Immediate Actionables</p>
                  <p style={{ fontFamily: FONT, fontSize: 28, fontWeight: 700, color: "#FF0000", margin: 0 }}>{MOCK_RESULTS.immediateActionables}</p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Topic & Sentiment Distribution — custom SVG bubble pack ── */}
          <div style={{ border: "1.5px solid #B8B8DF", borderRadius: 12, padding: "18px 20px 12px", marginBottom: 24, position: "relative" }}>
            <p style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, color: "#7F7F7F", letterSpacing: 1.4, margin: "0 0 12px", textTransform: "uppercase" }}>
              Topic and Sentiment Distribution
            </p>
            <svg viewBox="0 0 660 390" style={{ width: "100%", height: "auto", display: "block" }}>
              {bubbleNodes.map((node, i) => {
                const col  = sentColor(node.sentiment);
                const fits = node.r >= 30;
                return (
                  <g key={i} style={{ cursor: "pointer" }}
                    onMouseEnter={() => setBubbleTip(node)}
                    onMouseLeave={() => setBubbleTip(null)}
                  >
                    <circle cx={node.x} cy={node.y} r={node.r} fill={col} opacity={0.88} />
                    {fits ? (
                      <text x={node.x} y={node.y} textAnchor="middle" dominantBaseline="middle"
                        fill="white" fontSize={node.r > 45 ? 11 : 9} fontFamily={FONT} fontWeight={600}
                        style={{ pointerEvents: "none" }}
                      >
                        {node.name.length > 14 ? node.name.slice(0, 12) + "…" : node.name}
                      </text>
                    ) : (
                      <>
                        <line x1={node.x} y1={node.y - node.r - 2} x2={node.x} y2={node.y - node.r - 14} stroke="#999" strokeWidth={0.8} />
                        <text x={node.x} y={node.y - node.r - 17} textAnchor="middle"
                          fill="#555" fontSize={8.5} fontFamily={FONT}
                          style={{ pointerEvents: "none" }}
                        >{node.name}</text>
                      </>
                    )}
                  </g>
                );
              })}
              {bubbleTip && (() => {
                const tx = bubbleTip.x > 480 ? bubbleTip.x - bubbleTip.r - 135 : bubbleTip.x + bubbleTip.r + 8;
                const ty = Math.max(10, bubbleTip.y - 28);
                return (
                  <g style={{ pointerEvents: "none" }}>
                    <rect x={tx} y={ty} width={128} height={52} rx={7} fill="white" stroke="#B8B8DF" strokeWidth={1} />
                    <text x={tx + 9} y={ty + 16} fontFamily={FONT} fontSize={10} fontWeight={700} fill="#1a1a1a">{bubbleTip.name}</text>
                    <text x={tx + 9} y={ty + 30} fontFamily={FONT} fontSize={9} fill="#595959">Volume: {bubbleTip.count.toLocaleString()}</text>
                    <text x={tx + 9} y={ty + 44} fontFamily={FONT} fontSize={9} fill="#595959">Sentiment: {bubbleTip.sentiment.toFixed(2)}</text>
                  </g>
                );
              })()}
            </svg>
          </div>

          {/* Impact Analysis — only when user selected a real dependent variable */}
          {showImpact && (() => {
            const impactData = MOCK_RESULTS.categories.map(cat => ({
              x: cat.sentiment, y: cat.impact, z: cat.count,
              name: cat.name, fill: sentColor(cat.sentiment),
            }));
            return (
              <div style={{ border: "1.5px solid #B8B8DF", borderRadius: 12, padding: "14px 14px 6px", marginBottom: 24 }}>
                <p style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, color: "#7F7F7F", letterSpacing: 1.4, margin: "0 0 4px", textTransform: "uppercase" }}>
                  Impact Analysis
                </p>
                <div style={{ height: 420, position: "relative" }}>
                  <div style={{ position: "absolute", top: 12,  left: 56,  fontFamily: FONT, fontSize: 10, fontWeight: 800, color: "#FF0000",  zIndex: 5, letterSpacing: 0.8 }}>PRIORITIZE</div>
                  <div style={{ position: "absolute", top: 12,  right: 8,  fontFamily: FONT, fontSize: 10, fontWeight: 800, color: "#00B050",  zIndex: 5, letterSpacing: 0.8 }}>LEVERAGE</div>
                  <div style={{ position: "absolute", bottom: 38, left: 56, fontFamily: FONT, fontSize: 10, fontWeight: 800, color: "#F9B407",  zIndex: 5, letterSpacing: 0.8 }}>IMPROVE</div>
                  <div style={{ position: "absolute", bottom: 38, right: 8, fontFamily: FONT, fontSize: 10, fontWeight: 800, color: "#1a1a1a", zIndex: 5, letterSpacing: 0.8 }}>MAINTAIN</div>
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 20, right: 16, bottom: 60, left: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#EBEBEB" />
                      <XAxis type="number" dataKey="x" domain={[-1, 1]} tickCount={5}
                        tick={{ fontFamily: FONT, fontSize: 9, fill: "#595959" }}
                        label={{ value: "Sentiment ◆", position: "insideBottom", offset: -18, fontFamily: FONT, fontSize: 10, fill: "#595959" }}
                      />
                      <YAxis type="number" dataKey="y" domain={[0, 2.2]} tickCount={5}
                        tick={{ fontFamily: FONT, fontSize: 9, fill: "#595959" }}
                        label={{ value: "Impact", angle: -90, position: "insideLeft", offset: 16, fontFamily: FONT, fontSize: 10, fill: "#595959" }}
                      />
                      <ZAxis type="number" dataKey="z" range={[300, 5000]} />
                      <Tooltip
                        cursor={{ strokeDasharray: "3 3" }}
                        content={({ payload }) => {
                          if (!payload?.length) return null;
                          const d = payload[0]?.payload;
                          return (
                            <div style={{ background: "white", border: "1px solid #B8B8DF", borderRadius: 8, padding: "8px 12px", fontFamily: FONT, fontSize: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
                              <p style={{ margin: "0 0 4px", fontWeight: 700 }}>{d.name}</p>
                              <p style={{ margin: "0 0 2px", color: "#595959" }}>Volume: {d.z?.toLocaleString()}</p>
                              <p style={{ margin: "0 0 2px", color: "#595959" }}>Sentiment: {d.x?.toFixed(2)}</p>
                              <p style={{ margin: 0, color: "#595959" }}>Impact: {d.y?.toFixed(2)}</p>
                            </div>
                          );
                        }}
                      />
                      {/* SimpleDot draws circles and records positions; ImpactLabels reads them */}
                      <Scatter data={impactData} shape={<SimpleDot />} isAnimationActive={false} />
                      <Customized component={ImpactLabels} />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })()}

          {/* ── AI Diagnostic Summary (placeholder) ── */}
          <div style={{ border: "1.5px solid #B8B8DF", borderRadius: 12, padding: "24px" }}>
            <h3 style={{ fontFamily: FONT, fontSize: 13, fontWeight: 800, color: "#1a1a1a", letterSpacing: 1.2, margin: "0 0 6px", textTransform: "uppercase" }}>
              AI Diagnostic Summary
            </h3>
            {/* Purple underline accent */}
            <div style={{ width: 44, height: 3, background: C.cta, borderRadius: 2, marginBottom: 18 }} />

            <p style={{ fontFamily: FONT, fontSize: 14, color: "#1a1a1a", lineHeight: 1.75, margin: "0 0 14px" }}>
              This analysis covers {MOCK_RESULTS.rowsProcessed.toLocaleString()} customer comments processed through the{" "}
              <strong>{model?.name || "ACME genre"}</strong> model. The overall average sentiment of{" "}
              <strong>{MOCK_RESULTS.avgSentiment}</strong> indicates a mildly negative customer experience.
              The most discussed topic is <strong>{MOCK_RESULTS.mostFreqCategory}</strong>, accounting for
              the highest comment volume across the dataset.
            </p>
            <p style={{ fontFamily: FONT, fontSize: 14, color: "#1a1a1a", lineHeight: 1.75, margin: "0 0 24px" }}>
              Shipping Delays and Rude Staff emerge as the most critical pain points, combining high comment
              volumes with strongly negative sentiment scores. Product Quality and Fast Delivery represent the
              strongest positive drivers. Immediate attention is recommended for{" "}
              <strong>{MOCK_RESULTS.immediateActionables} high-priority comments</strong> that signal urgent
              operational issues requiring management escalation.
            </p>

            {/* Recommendation + Drivers side-by-side */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ border: "1.5px solid #B8B8DF", borderRadius: 10, padding: "18px 20px", background: "#FAFAFE" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <Target size={17} color={C.cta} strokeWidth={2} />
                  <p style={{ fontFamily: FONT, fontSize: 10, fontWeight: 800, color: C.cta, letterSpacing: 1.1, margin: 0, textTransform: "uppercase" }}>
                    Primary Recommendation
                  </p>
                </div>
                <p style={{ fontFamily: FONT, fontSize: 13, color: "#1a1a1a", lineHeight: 1.65, margin: 0 }}>
                  Focus immediate resources on Shipping Delays and Rude Staff. Targeted improvements in
                  logistics and staff training could meaningfully shift the overall sentiment baseline within
                  one quarter.
                </p>
              </div>

              <div style={{ border: "1.5px solid #B8B8DF", borderRadius: 10, padding: "18px 20px", background: "#FAFAFE" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <TrendingUp size={17} color="#00B050" strokeWidth={2} />
                  <p style={{ fontFamily: FONT, fontSize: 10, fontWeight: 800, color: "#00B050", letterSpacing: 1.1, margin: 0, textTransform: "uppercase" }}>
                    Positive Drivers
                  </p>
                </div>
                <p style={{ fontFamily: FONT, fontSize: 13, color: "#1a1a1a", lineHeight: 1.65, margin: 0 }}>
                  Product Quality and Fast Delivery are performing well and driving positive perception.
                  Highlight these in customer communications and protect them as competitive advantages.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Click-away for export dropdown */}
      {exportOpen && (
        <div onClick={() => setExportOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 50 }} />
      )}
    </div>
  );
}

// ═════════════════════════════════════════════
// ROOT APP
// Owns screen key, category list, and
// delete-pending flag. Orchestrates the
// recalibration → multicollinearity → recalibration
// loop.
// ═════════════════════════════════════════════
export default function App() {
  const [screen,        setScreen]        = useState(S.HOME);
  const [categories,    setCategories]    = useState(INITIAL_CATEGORIES);
  const [deletePending, setDeletePending] = useState(false);
  const [recalibMsgs,   setRecalibMsgs]   = useState(RECALIB_MSGS_FULL);
  /** Model chosen from the Use Existing Model screen; passed to ApplyUploadScreen */
  const [selectedModel,  setSelectedModel]  = useState(null);
  /** Dependent variable chosen in ApplyColumnsScreen — drives Impact Analysis visibility */
  const [selectedDepVar, setSelectedDepVar] = useState(null);
  /**
   * Live model list — starts with the demo seeds but grows when the user
   * creates a new model and updates when they rename one inline.
   * In production: fetched from GET /models and persisted via the backend.
   */
  const [models, setModels] = useState(DEMO_MODELS);

  /**
   * recalibTarget — a ref (not state) so that AnimatedMessageScreen's
   * onComplete closure always reads the latest value without needing
   * to re-register the effect.
   *
   * Values:
   *   S.MULTICOLLINEARITY  – when modified categories exist (first recalib)
   *   S.CATEGORIES         – when no conflicts (second / clean recalib)
   */
  const recalibTarget = useRef(S.CATEGORIES);

  /**
   * postMulticollinearity — set to true after the user accepts from the
   * multicollinearity screen. Tells handleRecalibrate to route directly
   * to a clean CATEGORIES rather than triggering the modal again, even
   * though some categories still carry modified: true (yellow flags).
   * Reset to false on the next recalibrate call so subsequent edits
   * still go through the normal conflict-detection path.
   */
  const postMulticollinearity = useRef(false);

  const navigate = useCallback((s) => setScreen(s), []);

  /**
   * Build the conflicts array from categories that the user has renamed.
   * Conflicts are generated on every render; useMemo keeps them stable.
   * Each conflict pairs the renamed category with a non-modified one
   * as its "similar to" counterpart (demo only — backend supplies real pairs).
   */
  const conflicts = useMemo(() => {
    const modified = categories.filter((c) => c.modified);
    const stable   = categories.filter((c) => !c.modified);
    return modified.map((cat, i) => ({
      id:            i,
      newName:       cat.name,
      originalName:  cat.originalName,
      conflictsWith: stable[i % Math.max(stable.length, 1)]?.name || "an existing category",
    }));
  }, [categories]);

  /**
   * handleRecalibrate — decides destination and message set.
   *
   * post-multicollinearity  → CLEAN messages, straight to CATEGORIES
   * renames or adds present → FULL messages (incl. multicollinearity),
   *                           route to MULTICOLLINEARITY after animation
   * delete-only             → CLEAN messages, straight to CATEGORIES
   */
  const handleRecalibrate = useCallback(() => {
    if (postMulticollinearity.current) {
      postMulticollinearity.current = false;
      recalibTarget.current = S.CATEGORIES;
      setRecalibMsgs(RECALIB_MSGS_CLEAN);
    } else {
      const hasRenames = categories.some((c) => c.modified);
      if (hasRenames) {
        recalibTarget.current = S.MULTICOLLINEARITY;
        setRecalibMsgs(RECALIB_MSGS_FULL);
      } else {
        // Delete-only — no conflict detection
        recalibTarget.current = S.CATEGORIES;
        setRecalibMsgs(RECALIB_MSGS_CLEAN);
      }
    }
    setScreen(S.RECALIBRATING);
  }, [categories]);

  /**
   * handleRecalibComplete — fired when the recalibration animation ends.
   * Navigates to MULTICOLLINEARITY or clears flags and goes to CATEGORIES.
   */
  const handleRecalibComplete = useCallback(() => {
    if (recalibTarget.current === S.MULTICOLLINEARITY) {
      setScreen(S.MULTICOLLINEARITY);
    } else {
      // Clean recalibration — clear all flags and show the tidy list
      setCategories((prev) => prev.map((c) => ({ ...c, modified: false })));
      setDeletePending(false);
      setScreen(S.CATEGORIES);
    }
  }, []);

  /**
   * handleMulticollinearityAccept — applies resolved categories and
   * sets the postMulticollinearity flag so the very next Recalibrate
   * goes to a clean pass (no modal), breaking the potential loop.
   */
  const handleMulticollinearityAccept = useCallback((updatedCategories) => {
    postMulticollinearity.current = true; // next recalibration is clean
    recalibTarget.current = S.CATEGORIES;
    setCategories(updatedCategories);
    setDeletePending(false);
    setScreen(S.CATEGORIES);
  }, []);

  // ── Stable onComplete callbacks (memoised to avoid re-registering useEffect) ──
  const onLearningComplete    = useCallback(() => setScreen(S.CATEGORIES), []);
  const onRecalibComplete     = useCallback(handleRecalibComplete, [handleRecalibComplete]);

  /** Called when user clicks Proceed on a model card */
  const handleProceed = useCallback((model) => {
    setSelectedModel(model);
    setScreen(S.APPLY_UPLOAD);
  }, []);

  /**
   * Called when "Begin Magic Show" is clicked.
   * Stores the chosen dependent variable so ResultsScreen can decide
   * whether to show the Impact Analysis scatter plot.
   */
  const handleBeginMagicShow = useCallback((depVar) => {
    setSelectedDepVar(depVar);
    setScreen(S.ANALYSING);
  }, []);

  /**
   * Called when the user inline-edits the model name or description in
   * ApplyUploadScreen. Updates both the live model list (so the change
   * is visible on the Select Existing Model screen) and selectedModel.
   */
  const handleUpdateModel = useCallback((updated) => {
    setModels((prev) => prev.map((m) => m.id === updated.id ? updated : m));
    setSelectedModel(updated);
  }, []);

  /**
   * Called when "Begin categorization" is clicked after creating a new model.
   * Adds the model to the live list so it appears on the Use Existing screen.
   * The user can rename/re-describe it immediately via the pencil icons.
   */
  const handleBeginCategorization = useCallback(() => {
    const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const newModel = {
      id:            Date.now(),
      name:          "New Model",
      date:          today,
      description:   "Description about this model, generated by AI",
      categoryCount: categories.length,
    };
    setModels((prev) => [...prev, newModel]);
    setSelectedModel(newModel);
    setScreen(S.APPLY_UPLOAD);
  }, [categories]);

  /** Called when the analysis animation finishes */
  const onAnalysisComplete = useCallback(() => setScreen(S.RESULTS), []);

  return (
    <>
      {/*
        Global styles:
        – Montserrat font (swap for self-hosted in production)
        – Box-sizing reset
        – Placeholder colour override (#595959 per spec)
        – Default scrollbar (categories list, column dropdown)
        – .multi-scroll: custom scrollbar for the multicollinearity
          conflict list (spec: track #3E3E94, thumb #B8B8DF)
      */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Montserrat', sans-serif; }
        textarea::placeholder, input::placeholder { color: #595959; opacity: 1; }
        textarea:focus, input:focus { outline: none; }

        ::-webkit-scrollbar        { width: 8px; }
        ::-webkit-scrollbar-track  { background: #F2F2F2; border-radius: 4px; }
        ::-webkit-scrollbar-thumb  { background: #595959; border-radius: 4px; }
        ::-webkit-scrollbar-button { display: none; }

        /* Multicollinearity conflict list — spec: track #3E3E94, thumb #B8B8DF */
        .multi-scroll::-webkit-scrollbar-track  { background: #3E3E94; border-radius: 4px; }
        .multi-scroll::-webkit-scrollbar-thumb  { background: #B8B8DF; border-radius: 4px; }
        .multi-scroll::-webkit-scrollbar-button { background: #B8B8DF; display: block; height: 8px; }

        /* Model list — same custom scrollbar as multi-scroll per spec */
        .model-scroll::-webkit-scrollbar-track  { background: #3E3E94; border-radius: 4px; }
        .model-scroll::-webkit-scrollbar-thumb  { background: #B8B8DF; border-radius: 4px; }
        .model-scroll::-webkit-scrollbar-button { background: #B8B8DF; display: block; height: 8px; }

        /* Model search bar — placeholder must be white (#FFFFFF) per spec */
        .model-search::placeholder { color: #FFFFFF; opacity: 1; }
      `}</style>

      {screen === S.HOME          && <LandingScreen   navigate={navigate} />}
      {screen === S.CREATE_UPLOAD && <CreateUploadScreen navigate={navigate} />}
      {screen === S.COLUMN_SELECT && <ColumnSelectScreen navigate={navigate} />}

      {/* Initial learning — uses AnimatedMessageScreen with skip button (dev) */}
      {screen === S.LEARNING && (
        <AnimatedMessageScreen
          messages={LEARNING_MSGS}
          onComplete={onLearningComplete}
          showSkip
        />
      )}

      {/*
        Categories — kept mounted while MULTICOLLINEARITY is showing so the
        real list is visible and dimmed behind the overlay (spec: the original
        menu does not disappear). pointer-events: none freezes interaction
        while the modal is in front.
      */}
      {(screen === S.CATEGORIES || screen === S.MULTICOLLINEARITY) && (
        <div style={{ pointerEvents: screen === S.MULTICOLLINEARITY ? "none" : "auto" }}>
          <CategoriesScreen
            navigate={navigate}
            categories={categories}
            setCategories={setCategories}
            deletePending={deletePending}
            setDeletePending={setDeletePending}
            onRecalibrate={handleRecalibrate}
            onBeginCategorization={handleBeginCategorization}
          />
        </div>
      )}

      {/* Recalibration animation — message set chosen by handleRecalibrate */}
      {screen === S.RECALIBRATING && (
        <AnimatedMessageScreen
          messages={recalibMsgs}
          onComplete={onRecalibComplete}
        />
      )}

      {/*
        Multicollinearity overlay — renders ON TOP of the frozen categories
        screen above. The CategoriesScreen provides the dimmed background;
        this component adds only the black overlay + white modal.
      */}
      {screen === S.MULTICOLLINEARITY && (
        <MulticollinearityScreen
          conflicts={conflicts}
          categories={categories}
          onAccept={handleMulticollinearityAccept}
        />
      )}

      {screen === S.USE_EXISTING  && <UseExistingScreen  navigate={navigate} onProceed={handleProceed} models={models} />}
      {screen === S.APPLY_UPLOAD  && <ApplyUploadScreen  navigate={navigate} model={selectedModel} onUpdateModel={handleUpdateModel} />}
      {screen === S.APPLY_COLUMNS && <ApplyColumnsScreen navigate={navigate} onBeginMagicShow={handleBeginMagicShow} />}
      {screen === S.ANALYSING     && (
        <AnimatedMessageScreen messages={ANALYSIS_MSGS} onComplete={onAnalysisComplete} />
      )}
      {screen === S.RESULTS && <ResultsScreen navigate={navigate} model={selectedModel} depVar={selectedDepVar} />}
    </>
  );
}
