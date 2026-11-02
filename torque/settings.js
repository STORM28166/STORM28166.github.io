// Graphics settings: presets, resolution slider (360p … 4K), persistence and panel binding.
export const RES = [360, 480, 540, 720, 900, 1080, 1440, 1800, 2160];
export const DEN = [0, 0.25, 0.55, 1, 1.5], DEN_LBL = ["Off", "Sparse", "Medium", "Dense", "Very dense"];
export const PRESETS = {
  low:    { res: 2, vd: 1, sh: 0,    seg: 24, den: 1, af: 1,  refl: 0, fog: 0.5, bloom: 0 },
  medium: { res: 3, vd: 2, sh: 1024, seg: 40, den: 2, af: 4,  refl: 0, fog: 1,   bloom: 0 },
  high:   { res: 5, vd: 3, sh: 2048, seg: 64, den: 3, af: 8,  refl: 1, fog: 1,   bloom: 1 },
  ultra:  { res: 6, vd: 5, sh: 4096, seg: 96, den: 4, af: 16, refl: 1, fog: 1,   bloom: 1 },
};
const KEY = "or_settings_v1";
export const S = { preset: "high", ...PRESETS.high, tc: "auto", fps: false,
  bloom: 1, blur: 0, aa: 1, frameCap: 60, autoQ: 1, rtRefl: 1, rtSh: 1, rtGI: 1,
  volS: 80, volM: 0, volE: 80, tod: 9.5, headlights: 0, sens: 100, invert: 0,
  btnSize: 88, mirror: 0, traffic: 1, paint: 0 };

export function resLabel(i, w, h) { return (RES[i] === 2160 ? "4K · " : "") + RES[i] + "p" + (w ? ` (${w}×${h})` : ""); }

export function loadSettings(isPhone) {
  try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { /* ignore */ }
  if (!localStorage.getItem(KEY) && isPhone) Object.assign(S, { preset: "medium" }, PRESETS.medium);
}
const $ = id => document.getElementById(id);
const FIELDS = { res: "res", vd: "vd", sh: "sh", seg: "seg", den: "den", af: "af", refl: "refl", fog: "fog" };

const CHK = { bloom: "bloom", blur: "blur", aa: "aa", autoQ: "autoQ", rtRefl: "rtRefl", rtSh: "rtSh", rtGI: "rtGI", headlights: "headlights", invert: "invert", mirror: "mirror", traffic: "traffic" };
const RNG = { frameCap: "frameCap", volS: "volS", volM: "volM", volE: "volE", tod: "tod", sens: "sens", btnSize: "btnSize" };
const RNG_LBL = { frameCap: "capLbl", tod: "todLbl", sens: "sensLbl", btnSize: "btnSizeLbl" };
const RNG_FMT = { frameCap: v => (v >= 120 ? "Uncapped" : v + " FPS"), tod: v => v.toFixed(1) + ":00", sens: v => v + "%", btnSize: v => v + "px" };

export function bindPanel(onChange, info) {
  const sync = () => {
    for (const [k, id] of Object.entries(FIELDS)) { const el = $(id); if (el) el.value = String(S[k]); }
    const tc = $("tc"); if (tc) tc.value = S.tc;
    const sf = $("showFps"); if (sf) sf.checked = S.fps;
    for (const [k, id] of Object.entries(CHK)) { const el = $(id); if (el) el.checked = !!S[k]; }
    for (const [k, id] of Object.entries(RNG)) { const el = $(id); if (el) el.value = String(S[k]); }
    for (const [k, lbl] of Object.entries(RNG_LBL)) { const el = $(lbl); if (el) el.textContent = RNG_FMT[k](S[k]); }
    const rl = $("resLbl"); if (rl) rl.textContent = info.resText();
    const vl = $("vdLbl"); if (vl) vl.textContent = (S.vd * 0.5).toFixed(1) + " km";
    const dl = $("denLbl"); if (dl) dl.textContent = DEN_LBL[S.den];
    document.querySelectorAll("#presets button").forEach(b => b.classList.toggle("on", b.dataset.p === S.preset));
    $("custom").textContent = S.preset === "custom" ? "Custom (changed from preset)" : "";
    localStorage.setItem(KEY, JSON.stringify(S));
  };
  document.querySelectorAll("#presets button").forEach(b => b.addEventListener("click", () => {
    S.preset = b.dataset.p; Object.assign(S, PRESETS[S.preset]); sync(); onChange();
  }));
  for (const [k, id] of Object.entries(FIELDS)) $(id).addEventListener("input", () => {
    S[k] = Number($(id).value); S.preset = "custom"; sync(); onChange();
  });
  const tcEl = $("tc"); if (tcEl) tcEl.addEventListener("change", () => { S.tc = tcEl.value; sync(); onChange(); });
  const sfEl = $("showFps"); if (sfEl) sfEl.addEventListener("change", () => { S.fps = sfEl.checked; sync(); onChange(); });
  for (const [k, id] of Object.entries(CHK)) { const el = $(id); if (el) el.addEventListener("change", () => { S[k] = el.checked ? 1 : 0; sync(); onChange(); }); }
  for (const [k, id] of Object.entries(RNG)) { const el = $(id); if (el) el.addEventListener("input", () => { S[k] = Number(el.value); sync(); onChange(); }); }
  return sync;
}
