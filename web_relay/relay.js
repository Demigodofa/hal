(function () {
  "use strict";

  // ---------- Tiny helpers ----------
  function $(id) { return document.getElementById(id); }
  var NL = "\n";
  function toStr(v) {
    try { return typeof v === "string" ? v : JSON.stringify(v, null, 2); }
    catch (e) { return String(v); }
  }
  function log() {
    var out = [], i;
    for (i = 0; i < arguments.length; i++) out.push(toStr(arguments[i]));
    var el = $("log");
    if (el) {
      el.textContent += (el.textContent ? NL : "") + out.join(" ");
      el.scrollTop = el.scrollHeight;
    }
    console.log("[HAL Relay]", ...arguments);
  }

  // ---------- Settings ----------
  var LS_KEY = "hal-web-relay-settings";
  var DEF = {
    ghToken: "",
    ghRepo: "Demigodofa/hal",
    ghBranch: "main",
    rememberSettings: true,
    rememberSsd: true,
    autoClear: "1",
    schedEnable: false,
    schedEvery: 30
  };
  function load() {
    try {
      var o = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
      var r = {}, k;
      for (k in DEF) r[k] = o.hasOwnProperty(k) ? o[k] : DEF[k];
      return r;
    } catch (e) { return { ...DEF }; }
  }
  function save(s) { try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch (e) { } }
  var S = load();

  // UI sync
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
    save(S);
  }
  document.addEventListener("input", (e) => {
    var t = e.target;
    if (t && ["INPUT", "SELECT", "TEXTAREA"].includes(t.tagName)) maybeSave();
  }, true);
  document.addEventListener("change", (e) => {
    var t = e.target;
    if (t && ["INPUT", "SELECT", "TEXTAREA"].includes(t.tagName)) maybeSave();
  }, true);

  // ---------- IndexedDB ----------
  var DB_NAME = "hal-relay", DB_STORE = "handles";
  function idb() {
    return new Promise((res, rej) => {
      var r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(DB_STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  function putHandle(k, h) {
    return idb().then(db => new Promise((res, rej) => {
      var tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put(h, k);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    }));
  }
  function getHandle(k) {
    return idb().then(db => new Promise((res, rej) => {
      var tx = db.transaction(DB_STORE, "readonly");
      var q = tx.objectStore(DB_STORE).get(k);
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error);
    }));
  }

  // ---------- SSD ----------
  var ssdRoot = null;
  function coerceGenesis(h) {
    return Promise.resolve().then(() => {
      var name = (h && h.name) ? String(h.name).toUpperCase() : "";
      if (name === "GENESIS") return h;
      return h.getDirectoryHandle("GENESIS", { create: false }).catch(() => h);
    });
  }
  function setSsd(h) {
    return coerceGenesis(h).then((g) => {
      ssdRoot = g || null;
      if ($("ssdLabel")) $("ssdLabel").value = (g && g.name) ? g.name : "GENESIS (drive root)";
      if (ssdRoot && $("rememberSsd")?.checked) return putHandle("ssdRoot", ssdRoot).catch(() => { });
    });
  }
  function reconnectSsd(userActivation) {
    return getHandle("ssdRoot").then((h) => {
      if (!h) { log("no saved SSD handle"); return; }
      return h.queryPermission({ mode: "readwrite" })
        .then((p) => (p !== "granted" && userActivation ? h.requestPermission({ mode: "readwrite" }) : p))
        .then(() => setSsd(h)).then(() => log("SSD reconnected"))
        .catch((e) => log("reconnect error:", e.message || e));
    });
  }
  if ($("pickBtn")) $("pickBtn").addEventListener("click", () => {
    if (!("showDirectoryPicker" in window)) {
      log("picker error: File System Access API not available.");
      return;
    }
    window.showDirectoryPicker().then(setSsd).then(() => log("selected root set"))
      .catch((err) => log("picker error:", err.message || err));
  });
  if ($("reconnectBtn")) $("reconnectBtn").addEventListener("click", () => {
    log("reconnect: requesting permission...");
    reconnectSsd(true);
  });

  window.addEventListener("DOMContentLoaded", () => {
    log("Boot OK (GitHub + SSD)");
    reconnectSsd(false);
  });

  // ---------- Local FS ops ----------
  function splitPath(p) { return String(p).split("/").filter((s) => s && s !== "." && s !== ".."); }
  function ensureDir(root, rel) {
    return splitPath(rel).reduce((d, part) => d.then((dir) => dir.getDirectoryHandle(part, { create: true })), Promise.resolve(root));
  }
  function writeFile(root, rel, content) {
    return ensureDir(root, rel.split("/").slice(0, -1).join("/")).then((dir) =>
      dir.getFileHandle(rel.split("/").pop(), { create: true })
        .then((fh) => fh.createWritable().then((w) => w.write(content || "").then(() => w.close())))
    );
  }

  // ---------- GitHub ----------
  const ghBase = "https://api.github.com";
  function ghHdrs(tok) {
    var h = { "Accept": "application/vnd.github+json" };
    if (tok) h["Authorization"] = "Bearer " + tok;
    return h;
  }
  function b64e(t) { return btoa(unescape(encodeURIComponent(t))); }
  function encSeg(p) { return String(p).split("/").map(encodeURIComponent).join("/"); }
  function ghPutFile(opt) {
    var tok = $("ghToken")?.value.trim();
    var url = ghBase + "/repos/" + opt.repo + "/contents/" + encSeg(opt.path);
    var sha;
    var branch = opt.branch || $("ghBranch")?.value.trim() || "main";
    var checkUrl = url + (branch ? ("?ref=" + encodeURIComponent(branch)) : "");
    return fetch(checkUrl, { headers: ghHdrs(tok) }).then(r => r.ok ? r.json() : null).then(j => {
      if (j && j.sha) sha = j.sha;
      return fetch(url, {
        method: "PUT",
        headers: Object.assign({ "Content-Type": "application/json" }, ghHdrs(tok)),
        body: JSON.stringify({
          message: opt.message || ("update " + opt.path),
          content: b64e(opt.content || ""),
          branch: branch,
          sha: sha
        })
      });
    }).then(r => {
      if (!r.ok) throw new Error("github PUT " + r.status);
      return r.json();
    });
  }

  // ---------- Normalize + Commands ----------
  function normalize(p) {
    if (!p.op && p.action) p.op = p.action;
    if (!p.args) p.args = {};
    if (!p.target) {
      if (String(p.op || "").toLowerCase().startsWith("github.")) {
        p.target = "render";
      } else {
        p.target = "local";
      }
    }
    return p;
  }

  function processOnce(raw) {
    try {
      var parsed = normalize(JSON.parse(raw));
      var target = parsed.target.toLowerCase();
      var op = String(parsed.op || "").toLowerCase();
      var a = parsed.args || {};

      // --- Local
      if (target === "local") {
        if (!ssdRoot) { log("local: no SSD selected"); return; }
        if (op === "file_ops.write_file") return writeFile(ssdRoot, a.path, a.content).then(() => log("local write ok:", a.path));
        if (op === "file_ops.mkdirs") return ensureDir(ssdRoot, a.path).then(() => log("local mkdir ok:", a.path));
        log("Unknown local op:", op);
      }

      // --- GitHub
      if (target === "render" || op.startsWith("github.")) {
        if (op === "github.put_file") {
          return ghPutFile({
            repo: a.repo || $("ghRepo")?.value.trim(),
            path: a.path,
            content: a.content || "",
            message: a.message || "",
            branch: a.branch || $("ghBranch")?.value.trim()
          }).then((out) => {
            var c = (out && out.commit && out.commit.sha) ? out.commit.sha : "";
            log("github put_file:", { path: a.path, commit: c ? c.slice(0, 7) : "" });
          });
        }
        log("Unsupported github op:", op);
      }

    } catch (e) {
      log("error:", e.message || e);
    }
  }

  // ---------- Expose ----------
window.runCommandBlock = function (raw) {
  log("runCommandBlock called", raw);
  return processOnce(raw);
};
console.log("[HAL Relay] runCommandBlock exposed");

// ---------- Button wiring ----------
const runBtn = $("runOnce");
if (runBtn) {
  runBtn.addEventListener("click", () => {
    const rawAll = $("cmdInput")?.value || "";
    if (!rawAll.trim()) {
      log("No input in cmdInput");
      return;
    }
    const cmd = rawAll.includes("[KEV_AI::command]") ? 
      rawAll.replace("[KEV_AI::command]", "").replace("[/KEV_AI::command]", "").trim() :
      rawAll.trim();
    processOnce(cmd);
  });
}
