const { useState, useEffect, useRef, useMemo, useCallback } = React;

const CIVS = window.CIVS || [];
const TIERS = ["S", "A", "B", "C", "D"];
const TIER_COLOR = {
  S: "var(--tier-S)", A: "var(--tier-A)", B: "var(--tier-B)", C: "var(--tier-C)", D: "var(--tier-D)",
};
const RATING_MIN = Math.min(...CIVS.map((c) => c.rating));
const RATING_MAX = Math.max(...CIVS.map((c) => c.rating));
const RATING_MARGIN = 4; // extra civs in the rating pool beyond what's needed

const NUM_TEAMS = 2; // 3v3 format → two sides

// ---------- utilities ----------
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const totalPlayers = (perTeam) => NUM_TEAMS * perTeam;
const neededCivs = (perTeam, picks) => totalPlayers(perTeam) * picks;

function randomRating() {
  // pick a real civ's rating so the default sits on a meaningful value
  return CIVS[Math.floor(Math.random() * CIVS.length)].rating;
}

// how many UNIQUE civs a draft requires.
// mirrored: only one team's worth is drawn, then copied to the other side.
function uniqueNeeded(perTeam, picks, mirrored) {
  return (mirrored ? perTeam : totalPlayers(perTeam)) * picks;
}

// deal `count` ids into player slots of `picks` each
function dealSlots(ids, slots, picks) {
  const out = [];
  let k = 0;
  for (let p = 0; p < slots; p++) {
    out.push(ids.slice(k, k + picks));
    k += picks;
  }
  return out;
}

// turn drawn ids into per-player arrays for both teams
function buildPlayers(ids, perTeam, picks, mirrored) {
  if (mirrored) {
    const team = dealSlots(ids, perTeam, picks); // one team's lanes
    return team.concat(team.map((s) => s.slice())); // team II mirrors by position
  }
  return dealSlots(ids, totalPlayers(perTeam), picks);
}

// ---------- draft engines (return a flat list of `count` unique civ-ids) ----------
function drawByTier(tier, count) {
  const pool = CIVS.filter((c) => c.tier === tier);
  if (pool.length < count) {
    return { error: `Tier ${tier} has only ${pool.length} civilizations — this draft needs ${count} unique picks. Enable mirrored teams, lower the picks/players, or choose a fuller tier.` };
  }
  return { ids: shuffle(pool).slice(0, count).map((c) => c.id) };
}

function drawByRating(target, count) {
  const sorted = [...CIVS].sort(
    (a, b) => Math.abs(a.rating - target) - Math.abs(b.rating - target) || b.norm - a.norm
  );
  const poolSize = Math.min(CIVS.length, count + RATING_MARGIN);
  const pool = sorted.slice(0, poolSize);
  return { ids: shuffle(pool).slice(0, count).map((c) => c.id) };
}

// ---------- share encoding (URL hash, fully serverless) ----------
function encodeDraft(state) {
  const payload = {
    v: 1,
    m: state.mode === "tier" ? "t" : "r",
    pt: state.perTeam,
    k: state.picks,
    tier: state.tier,
    avg: Math.round(state.avg * 100),
    mir: state.mirrored ? 1 : 0,
    d: state.players, // array of arrays of civ-ids
  };
  const json = JSON.stringify(payload);
  return "d=" + b64urlEncode(json);
}
function decodeDraft(hash) {
  try {
    const m = hash.replace(/^#/, "").match(/(?:^|&)d=([^&]+)/);
    if (!m) return null;
    const obj = JSON.parse(b64urlDecode(m[1]));
    if (!obj || obj.v !== 1 || !Array.isArray(obj.d)) return null;
    return {
      mode: obj.m === "t" ? "tier" : "rating",
      perTeam: obj.pt,
      picks: obj.k,
      tier: obj.tier,
      avg: (obj.avg || 0) / 100,
      mirrored: obj.mir !== 0,
      players: obj.d,
    };
  } catch (e) {
    return null;
  }
}
function b64urlEncode(str) {
  const b = btoa(unescape(encodeURIComponent(str)));
  return b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return decodeURIComponent(escape(atob(s)));
}

// ---------- persistence ----------
const LS_KEY = "nq_drafter_settings_v1";
function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    return s && typeof s === "object" ? s : {};
  } catch (e) {
    return {};
  }
}
function saveSettings(s) {
  try {
    // tier is intentionally NOT persisted
    localStorage.setItem(LS_KEY, JSON.stringify({ mode: s.mode, perTeam: s.perTeam, picks: s.picks, avg: s.avg, mirrored: s.mirrored }));
  } catch (e) {}
}

// ---------- small presentational pieces ----------
function Crest() {
  return (
    <svg className="crest-mark" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round">
      <path d="M24 3 L41 9 V23 C41 34 33 41 24 45 C15 41 7 34 7 23 V9 Z" fill="rgba(122,44,37,0.08)" />
      <path d="M24 13 L27 21 L35 21 L29 26 L31 34 L24 29 L17 34 L19 26 L13 21 L21 21 Z" fill="rgba(169,128,47,0.85)" stroke="none" />
    </svg>
  );
}

function CivChip({ civ, showTier }) {
  const [err, setErr] = useState(false);
  const color = TIER_COLOR[civ.tier];
  return (
    <span className="chip" title={`${civ.name} · Tier ${civ.tier} · ${civ.rating.toFixed(2)}`}>
      {civ.img && !err ? (
        <img className="chip-img" src={civ.img} alt={civ.name} loading="lazy" onError={() => setErr(true)} />
      ) : (
        <span className="chip-ph" style={{ background: color }}>{civ.name.slice(0, 2).toUpperCase()}</span>
      )}
      <span className="chip-name">{civ.name}</span>
      {showTier && <span className="chip-tier" style={{ background: color }}>{civ.tier}</span>}
    </span>
  );
}

function ResultView({ result, perTeam }) {
  if (!result || !result.players) {
    return <div className="empty">No draft yet — set your options and press <b>Draft</b>.</div>;
  }
  const byId = useMemo(() => {
    const m = {};
    CIVS.forEach((c) => (m[c.id] = c));
    return m;
  }, []);
  const teams = [];
  for (let t = 0; t < NUM_TEAMS; t++) {
    teams.push(result.players.slice(t * perTeam, (t + 1) * perTeam));
  }
  const roman = ["I", "II", "III", "IV"];
  return (
    <div>
      <div className="result-meta">
        {result.mode === "tier" ? (
          <span className="meta-pill" style={{ borderColor: TIER_COLOR[result.tier] }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: TIER_COLOR[result.tier] }} />
            Tier {result.tier} draft
          </span>
        ) : (
          <span className="meta-pill">~ {result.avg.toFixed(2)} avg rating</span>
        )}
        <span className="meta-pill">{NUM_TEAMS} × {perTeam} players</span>
        <span className="meta-pill">{result.picks} picks each</span>
        {result.mirrored && (
          <span className="meta-pill" style={{ borderColor: "var(--gold)", color: "var(--burgundy)" }}>
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v18" /><path d="M7 8 4 12l3 4" /><path d="M17 8l3 4-3 4" /></svg>
            Mirrored
          </span>
        )}
      </div>
      <div className="teams">
        {teams.map((tm, ti) => (
          <div className="team" key={ti}>
            <div className="team-head">
              <h3>Team {roman[ti]}</h3>
              <span className="rule" />
            </div>
            {tm.map((ids, pi) => (
              <div className="player" key={pi}>
                <p className="player-name">Player {ti * perTeam + pi + 1}</p>
                <div className="chips">
                  {ids.map((id, ci) => (
                    <CivChip key={ci} civ={byId[id]} showTier={result.mode === "rating"} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- main app ----------
function App() {
  // viewer mode if a shared draft is present in the URL
  const shared = useMemo(() => decodeDraft(window.location.hash), []);
  const viewer = !!shared;

  const stored = useMemo(() => (viewer ? {} : loadSettings()), [viewer]);
  const [mode, setMode] = useState(stored.mode === "tier" ? "tier" : "rating");
  const [perTeam, setPerTeam] = useState(clamp(stored.perTeam || 3, 1, 4));
  const [picks, setPicks] = useState(clamp(stored.picks || 2, 1, 10));
  const [avg, setAvg] = useState(
    typeof stored.avg === "number" ? clamp(stored.avg, RATING_MIN, RATING_MAX) : Math.round(randomRating() * 100) / 100
  );
  // tier: random each session, never persisted
  const [tier, setTier] = useState(() => TIERS[Math.floor(Math.random() * TIERS.length)]);
  const [mirrored, setMirrored] = useState(stored.mirrored !== false); // default ON

  const [result, setResult] = useState(null);
  const [warning, setWarning] = useState(null);
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);

  // run a draft with current settings
  const runDraft = useCallback(() => {
    const count = uniqueNeeded(perTeam, picks, mirrored);
    const r = mode === "tier" ? drawByTier(tier, count) : drawByRating(avg, count);
    if (r.error) {
      setWarning(r.error);
      setResult(null);
    } else {
      setWarning(null);
      const players = buildPlayers(r.ids, perTeam, picks, mirrored);
      setResult({ players, mode, perTeam, picks, tier, avg, mirrored });
    }
    setShareUrl("");
    setCopied(false);
  }, [mode, tier, perTeam, picks, avg, mirrored]);

  // persist (not in viewer mode)
  useEffect(() => {
    if (!viewer) saveSettings({ mode, perTeam, picks, avg, mirrored });
  }, [mode, perTeam, picks, avg, mirrored, viewer]);

  // auto-draft whenever settings change (editor only); debounced so the slider stays smooth
  useEffect(() => {
    if (viewer) return;
    const t = setTimeout(runDraft, 160);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [mode, perTeam, picks, tier, avg, mirrored]);

  const makeShare = () => {
    if (!result) return;
    const base = window.location.href.split("#")[0];
    const url = base + "#" + encodeDraft(result);
    setShareUrl(url);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(
        () => { setCopied(true); setTimeout(() => setCopied(false), 2200); },
        () => {}
      );
    }
  };

  // ----- viewer mode -----
  if (viewer) {
    return (
      <div className="wrap">
        <Masthead />
        <div className="banner">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3a9 9 0 1 0 9 9" /><path d="M21 3v6h-6" /><circle cx="12" cy="12" r="3.5" />
          </svg>
          <span><b>Shared draft</b> — view only. This link reproduces the exact draft that was generated.</span>
        </div>
        <div className="card">
          <div className="card-head"><h2>Draft Result</h2><span className="rule" /></div>
          <div className="card-body">
            <ResultView result={shared} perTeam={shared.perTeam} />
          </div>
        </div>
        <div className="actions" style={{ border: 0, paddingTop: 0, justifyContent: "center" }}>
          <a className="btn btn-ghost" href={window.location.href.split("#")[0]}>Create your own draft</a>
        </div>
        <Footer />
      </div>
    );
  }

  // ----- editor mode -----
  const canShare = !!result;
  return (
    <div className="wrap">
      <Masthead />

      {/* options */}
      <div className="card">
        <div className="card-head"><h2>Options</h2><span className="rule" /></div>
        <div className="card-body">
          <div className="grid2">
            <div className="field">
              <span className="label">Draft method</span>
              <div className="seg" role="group" aria-label="Draft method">
                <button className="seg-btn" aria-pressed={mode === "rating"} onClick={() => setMode("rating")}>By Rating</button>
                <button className="seg-btn" aria-pressed={mode === "tier"} onClick={() => setMode("tier")}>By Tier</button>
              </div>
              <span className="hint">{mode === "rating"
                ? "Everyone draws civs clustered around a target power rating."
                : "Everyone draws civs from a single tier."}</span>
            </div>

            <div className="field">
              <span className="label">Players per team</span>
              <div className="seg" role="group" aria-label="Players per team">
                {[1, 2, 3, 4].map((n) => (
                  <button key={n} className="seg-btn" aria-pressed={perTeam === n} onClick={() => setPerTeam(n)}>{n}</button>
                ))}
              </div>
              <span className="hint">{NUM_TEAMS} teams → {totalPlayers(perTeam)} players total.</span>
            </div>

            <div className="field">
              <span className="label">Teams</span>
              <div className="seg" role="group" aria-label="Team mirroring">
                <button className="seg-btn" aria-pressed={mirrored} onClick={() => setMirrored(true)}>Mirrored</button>
                <button className="seg-btn" aria-pressed={!mirrored} onClick={() => setMirrored(false)}>Independent</button>
              </div>
              <span className="hint">{mirrored
                ? "Both teams draw the same civs lane-for-lane — a fair mirror."
                : "Every player gets their own unique civs."}</span>
            </div>

            <div className="field">
              <span className="label">Picks per player</span>
              <div className="stepper">
                <button onClick={() => setPicks((p) => clamp(p - 1, 1, 10))} disabled={picks <= 1} aria-label="Fewer picks">−</button>
                <span className="val">{picks}</span>
                <button onClick={() => setPicks((p) => clamp(p + 1, 1, 10))} disabled={picks >= 10} aria-label="More picks">+</button>
              </div>
              <span className="hint">{uniqueNeeded(perTeam, picks, mirrored)} unique civs needed.</span>
            </div>

            {mode === "rating" ? (
              <div className="field">
                <span className="label">Target average rating</span>
                <div className="rating-row">
                  <span className="rating-val">{avg.toFixed(2)}</span>
                  <div style={{ flex: 1 }}>
                    <input type="range" min={RATING_MIN} max={RATING_MAX} step="0.01" value={avg}
                      onChange={(e) => setAvg(parseFloat(e.target.value))} />
                    <div className="scale-ticks"><span>{RATING_MIN.toFixed(2)}</span><span>{RATING_MAX.toFixed(2)}</span></div>
                  </div>
                </div>
                <span className="hint">Picks are drawn from the {Math.min(CIVS.length, uniqueNeeded(perTeam, picks, mirrored) + RATING_MARGIN)} civs closest to this rating.</span>
              </div>
            ) : (
              <div className="field">
                <span className="label">Tier</span>
                <div className="select">
                  <select value={tier} onChange={(e) => setTier(e.target.value)}>
                    {TIERS.map((t) => {
                      const count = CIVS.filter((c) => c.tier === t).length;
                      return <option key={t} value={t}>Tier {t} — {count} civilizations</option>;
                    })}
                  </select>
                </div>
                <span className="hint">Randomised each session — not remembered.</span>
              </div>
            )}
          </div>

          {warning && <div className="warn">{warning}</div>}

          <div className="actions">
            <button className="btn btn-primary" onClick={runDraft}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16M4 12h16M4 19h10" /></svg>
              Draft
            </button>
            <button className="btn btn-ghost" onClick={runDraft} disabled={!result && !warning}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></svg>
              Reroll
            </button>
            <button className="btn btn-gold" onClick={makeShare} disabled={!canShare}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></svg>
              Share link
            </button>
          </div>

          {shareUrl && (
            <div className="share-box">
              <span className="share-field">{shareUrl}</span>
              <button className="btn btn-ghost" onClick={makeShare}>Copy</button>
              <span className={"copied-note" + (copied ? " show" : "")}>✓ Copied</span>
            </div>
          )}
        </div>
      </div>

      {/* result */}
      <div className="card">
        <div className="card-head"><h2>Draft Result</h2><span className="rule" /></div>
        <div className="card-body">
          <ResultView result={result} perTeam={perTeam} />
        </div>
      </div>

      <Footer />
    </div>
  );
}

function Masthead() {
  return (
    <div className="topbar">
      <div className="brand">
        <div className="crest"><Crest /><h1 className="title">Snowve Drafter</h1></div>
        <p className="sub">Balanced civilization draws for team play</p>
      </div>
    </div>
  );
}
function Footer() {
  return <div className="foot">{CIVS.length} civilizations · ratings from the NQ tier list</div>;
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
