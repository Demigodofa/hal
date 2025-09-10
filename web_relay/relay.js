(function () {
  "use strict";

  // ---------- Early Stub ----------
  // Prevents race condition with content_relay.js
  if (typeof window.runCommandBlock !== "function") {
    window.runCommandBlock = (raw) => {
      console.warn("[HAL Relay] runCommandBlock called before full init, queueing:", raw);
      (window._halQueue = window._halQueue || []).push(raw);
    };
  }

  // ---------- Tiny helpers ----------
  function $(id) { return document.getElementById(id); }
  const NL = "\n";
  function toStr(v) {
    try { return typeof v === "string" ? v : JSON.stringify(v, null, 2); }
    catch (e) { return String(v); }
  }
  function appendLog(elId, ...args) {
    const out = Array.from(args).map(toStr).join(" ");
    const el = $(elId);
    if (el) {
      el.textContent += (el.textContent ? NL : "") + out;
      el.scrollTop = el.scrollHeight;
    }
    console.log("[HAL Relay]", ...args);
  }
  function log(...args) { appendLog("log", ...args); }
  function ghLog(...args) { appendLog("ghLog", ...args); }

  // ---------- Settings ----------
  const LS_KEY = "hal-web-relay-settings";
  const DEF = {
    ghToken: "",
    ghRepo: "Demigodofa/hal",
    ghBranch: "main",
    rememberSettings: true,
    rememberSsd: true,
    autoClear: "1",
    schedEnable: false,
    schedEvery: 30
  };

  function loadSettings() {
    try {
      const o = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
      const r = {};
      for (const k in DEF) r[k] = o.hasOwnProperty(k) ? o[k] : DEF[k];
      return r;
    } catch { return { ...DEF }; }
  }
  function saveSettings(s) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { }
  }
  const S = loadSettings();

  // Populate UI
  if ($("ghToken")) $("ghToken").value = S.ghToken;
  if ($("ghRepo")) $("ghRepo").value = S.ghRepo;
  if ($("ghBranch")) $("ghBranch").value = S.ghBranch;
  if ($("rememberSettings")) $("rememberSettings").checked = !!S.rememberSettings;
  if ($("rememberSsd")) $("rememberSsd").checked = !!S.rememberSsd;
  if ($("autoClear")) $("autoClear").value = S.autoClear || "1";
  if ($("schedEnable")) $("schedEnable").checked = !!S.schedEnable;
  if ($("schedEvery")) $("schedEvery").value = String(S.schedEvery || 30);

  function maybeSave() {
    if (!$("rememberSettings")?.checked) return;
    S.ghToken = $("ghToken")?.value || "";
    S.ghRepo = $("ghRepo")?.value.trim() || "";
    S.ghBranch = $("ghBranch")?.value.trim() || "main";
    S.rememberSettings = $("rememberSettings")?.checked || false;
    S.rememberSsd = $("rememberSsd")?.checked || false;
    S.autoClear = $("autoClear")?.value || "1";
    S.schedEnable = $("schedEnable")?.checked || false;
    S.schedEvery = parseInt($("schedEvery")?.value || "30", 10);
    saveSettings(S);
  }
  document.addEventListener("input", e => { if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) maybeSave(); }, true);
  document.addEventListener("change", e => { if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) maybeSave(); }, true);

  // ---------- SSD ----------
  const DB_NAME = "hal-relay", DB_STORE = "handles";
  let ssdRoot = null;

  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(DB_STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  function putHandle(k, h) { return idb().then(db => new Promise((res, rej) => { const tx = db.transaction(DB_STORE, "readwrite"); tx.objectStore(DB_STORE).put(h, k); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); })); }
  function getHandle(k) { return idb().then(db => new Promise((res, rej) => { const tx = db.transaction(DB_STORE, "readonly"); const q = tx.objectStore(DB_STORE).get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); })); }

  function coerceGenesis(h) { return Promise.resolve().then(() => { const name = (h && h.name) ? String(h.name).toUpperCase() : ""; if (name === "GENESIS") return h; return h.getDirectoryHandle("GENESIS", { create: false }).catch(() => h); }); }
  function setSsd(h) { return coerceGenesis(h).then(g => { ssdRoot = g || null; if ($("ssdLabel")) $("ssdLabel").value = (g && g.name) ? g.name : "GENESIS (drive root)"; if (ssdRoot && $("rememberSsd")?.checked) return putHandle("ssdRoot", ssdRoot).catch(() => { }); }); }
  function reconnectSsd(userActivation) { return getHandle("ssdRoot").then(h => { if (!h) { log("no saved SSD handle"); return; } return h.queryPermission({ mode: "readwrite" }).then(p => (p !== "granted" && userActivation ? h.requestPermission({ mode: "readwrite" }) : p)).then(() => setSsd(h)).then(() => log("SSD reconnected")).catch(e => log("reconnect error:", e.message || e)); }); }

  if ($("pickBtn")) $("pickBtn").addEventListener("click", () => { if (!("showDirectoryPicker" in window)) { log("picker error: File System Access API not available."); return; } window.showDirectoryPicker().then(setSsd).then(() => log("selected root set")).catch(err => log("picker error:", err.message || err)); });
  if ($("reconnectBtn")) $("reconnectBtn").addEventListener("click", () => { log("reconnect: requesting permission..."); reconnectSsd(true); });
  window.addEventListener("DOMContentLoaded", () => { log("Boot OK (GitHub + SSD)"); reconnectSsd(false); });

  // ---------- Local FS ops ----------
  function splitPath(p) { return String(p).split("/").filter(s => s && s !== "." && s !== ".."); }
  function ensureDir(root, rel) { return splitPath(rel).reduce((d, part) => d.then(dir => dir.getDirectoryHandle(part, { create: true })), Promise.resolve(root)); }
  function getParent(root, rel, create) { const parts = splitPath(rel); if (!parts.length) throw new Error("empty path"); let d = Promise.resolve(root); for (let i = 0; i < parts.length - 1; i++) d = d.then(dir => dir.getDirectoryHandle(parts[i], { create })); return d.then(dir => ({ dir, name: parts[parts.length - 1] })); }
  function writeFile(root, rel, content) { return getParent(root, rel, true).then(({ dir, name }) => dir.getFileHandle(name, { create: true }).then(fh => fh.createWritable().then(w => w.write(content || "").then(() => w.close())))); }
  function readFile(root, rel) { return getParent(root, rel, false).then(({ dir, name }) => dir.getFileHandle(name, { create: false }).then(fh => fh.getFile().then(f => f.text()))); }
  function deleteFile(root, rel) { return getParent(root, rel, false).then(({ dir, name }) => dir.removeEntry(name, { recursive: false })); }
  function appendText(root, rel, text, ensureSep) { return readFile(root, rel).catch(() => "").then(cur => { const sep = (cur && ensureSep && !/\n$/.test(cur)) ? NL : ""; return writeFile(root, rel, cur + sep + (text || "")); }); }
  function appendJsonArray(root, rel, obj) { return readFile(root, rel).catch(() => "[]").then(txt => { let arr = []; try { arr = JSON.parse(txt); if (!Array.isArray(arr)) arr = []; } catch { arr = []; } arr.push(obj); return writeFile(root, rel, JSON.stringify(arr, null, 2) + NL); }); }
  function appendJsonl(root, rel, obj) { return appendText(root, rel, JSON.stringify(obj) + NL, false); }

  // ---------- GitHub ----------
  const GITHUB_API = "https://api.github.com";
  function ghHeaders(tok) { return { "Authorization": `token ${tok}`, "Accept": "application/vnd.github.v3+json", "Content-Type": "application/json" }; }
  function b64Encode(t) { return btoa(unescape(encodeURIComponent(t))); }
  function encSeg(p) { return String(p).split("/").map(encodeURIComponent).join("/"); }

  async function fetchWithRetry(url, options, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const resp = await fetch(url, options);
        if (!resp.ok) {
          if (resp.status >= 500 && attempt < retries) {
            ghLog(`GitHub ${options.method || "GET"} ${url} failed ${resp.status}, retrying (${attempt})...`);
            await new Promise(r => setTimeout(r, 500 * attempt));
            continue;
          }
          return resp;
        }
        return resp;
      } catch (e) {
        if (attempt < retries) {
          ghLog(`Network error, retrying (${attempt}):`, e.message);
          await new Promise(r => setTimeout(r, 500 * attempt));
          continue;
        }
        throw e;
      }
    }
  }

  async function ghGetFile(opt) {
    const tok = $("ghToken")?.value.trim();
    const url = `${GITHUB_API}/repos/${opt.repo}/contents/${encSeg(opt.path)}?ref=${encodeURIComponent(opt.branch)}`;
    ghLog("github.get_file request:", url);
    try {
      const resp = await fetchWithRetry(url, { headers: ghHeaders(tok) });
      const data = await resp.json();
      if (!resp.ok) { ghLog("github.get_file ERROR:", data); return null; }
      const content = atob(data.content.replace(/\n/g, ""));
      ghLog("github.get_file response:", data);
      return content;
    } catch (e) {
      ghLog("github.get_file exception:", e.message);
      return null;
    }
  }

  async function ghPutFile(opt) {
    const tok = $("ghToken")?.value.trim();
    const url = `${GITHUB_API}/repos/${opt.repo}/contents/${encSeg(opt.path)}`;
    const checkUrl = `${url}?ref=${encodeURIComponent(opt.branch)}`;
    let sha = null;

    try {
      const check = await fetchWithRetry(checkUrl, { headers: ghHeaders(tok) });
      if (check.ok) {
        const j = await check.json();
        sha = j.sha;
        ghLog("github.put_file found existing sha:", sha);
      }
    } catch (e) { ghLog("github.put_file sha check error:", e.message); }

    const body = { message: opt.message || `update ${opt.path}`, branch: opt.branch, content: b64Encode(opt.content || "") };
    if (sha) body.sha = sha;

    ghLog("github.put_file request:", { url, body });
    try {
      const resp = await fetchWithRetry(url, { method: "PUT", headers: ghHeaders(tok), body: JSON.stringify(body) });
      const data = await resp.json();
      if (!resp.ok) { ghLog("github.put_file ERROR:", data); return null; }
      ghLog("github.put_file response:", data);
      return data.commit?.sha?.substring(0, 7) || "unknown";
    } catch (e) {
      ghLog("github.put_file exception:", e.message);
      return null;
    }
  }

  // ---------- Normalize + Commands ----------
  function normalize(p) { if (!p.op && p.action) p.op = p.action; if (!p.args) p.args = {}; if (!p.target) p.target = String(p.op || "").toLowerCase().startsWith("github.") ? "render" : "local"; return p; }

  async function processOnce(raw) {
    try {
      const parsed = normalize(JSON.parse(raw));
      const target = parsed.target.toLowerCase();
      const op = String(parsed.op || "").toLowerCase();
      const a = parsed.args || {};

      if (target === "local") {
        if (!ssdRoot) { log("local: no SSD selected"); return; }
        if (["file_ops.write_file", "write_file"].includes(op)) { await writeFile(ssdRoot, a.path, a.content); log("local write ok:", a.path); return; }
        if (["file_ops.read_file", "read_file"].includes(op)) { const txt = await readFile(ssdRoot, a.path); log("local read:", { path: a.path, content: txt }); return; }
        if (["file_ops.mkdirs", "mkdirs"].includes(op)) { await ensureDir(ssdRoot, a.path); log("local mkdir ok:", a.path); return; }
        if (["file_ops.delete_file", "delete_file"].includes(op)) { await deleteFile(ssdRoot, a.path); log("local delete ok:", a.path); return; }
        if (["file_ops.append_file", "append_file"].includes(op)) {
          const mode = String(a.mode || "text").toLowerCase();
          if (mode === "json-array") { const obj = a.json ? a.json : (a.content ? JSON.parse(a.content) : {}); await appendJsonArray(ssdRoot, a.path, obj); log("local append (json-array):", a.path); return; }
          if (mode === "jsonl") { const obj2 = a.json ? a.json : (a.content ? JSON.parse(a.content) : {}); await appendJsonl(ssdRoot, a.path, obj2); log("local append (jsonl):", a.path); return; }
          const ensureSep = a.ensureNewline !== false; await appendText(ssdRoot, a.path, a.content || "", ensureSep); log("local append (text):", a.path); return; }
        if (op === "relay.checkpoint_now") { log("checkpoint requested (stub)"); return; }
        if (op === "relay.scheduler") { if (a.enabled) log("scheduler enabled:", a.interval_mins || 30); else log("scheduler disabled"); return; }
        log("Unknown local op:", op);
      }

      if (target === "render" || op.startsWith("github.")) {
        if (op === "github.put_file") { await ghPutFile({ repo: a.repo || $("ghRepo")?.value.trim(), path: a.path, content: a.content || "", message: a.message || "", branch: a.branch || $("ghBranch")?.value.trim() }); return; }
        if (op === "github.get_file") { await ghGetFile({ repo: a.repo || $("ghRepo")?.value.trim(), path: a.path, branch: a.branch || $("ghBranch")?.value.trim() }); return; }
        log("Unsupported github op:", op);
      }
    } catch (e) { log("error:", e.message || e); }
  }

  // ---------- Final Exposure ----------
  window.runCommandBlock = function (raw) {
    log("runCommandBlock called", raw);
    return processOnce(raw);
  };
  console.log("[HAL Relay] runCommandBlock exposed");

  // Flush queued commands if stub was used
  if (Array.isArray(window._halQueue) && window._halQueue.length > 0) {
    console.log("[HAL Relay] flushing queued commands:", window._halQueue.length);
    for (const raw of window._halQueue) processOnce(raw);
    window._halQueue = [];
  }

  // ---------- Button wiring ----------
  const runBtn = $("runOnce");
  if (runBtn) {
    runBtn.addEventListener("click", () => {
      const rawAll = $("cmdInput")?.value || "";
      if (!rawAll.trim()) { log("No input in cmdInput"); return; }
      const cmd = rawAll.includes("[KEV_AI::command]") ? rawAll.replace("[KEV_AI::command]", "").replace("[/KEV_AI::command]", "").trim() : rawAll.trim();
      processOnce(cmd);
      if (S.autoClear === "1" && $("cmdInput")) $("cmdInput").value = "";
    });
  }
})();
