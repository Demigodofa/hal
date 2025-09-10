(function () {
  "use strict";

  // ---------- Tiny helpers ----------
  function $(id) { return document.getElementById(id); }
  var NL = String.fromCharCode(10);
  function toStr(v) {
    try { return typeof v === "string" ? v : JSON.stringify(v, null, 2); }
    catch (e) { return String(v); }
  }
  function log() {
    var out = [], i;
    for (i = 0; i < arguments.length; i++) out.push(toStr(arguments[i]));
    var el = $("log");
    if (!el) return;
    el.textContent += (el.textContent ? NL : "") + out.join(" ");
    el.scrollTop = el.scrollHeight;
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
    } catch (e) { return JSON.parse(JSON.stringify(DEF)); }
  }
  function save(s) { try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch (e) { } }
  var S = load();

  $("ghToken").value = S.ghToken;
  $("ghRepo").value = S.ghRepo;
  $("ghBranch").value = S.ghBranch;
  $("rememberSettings").checked = !!S.rememberSettings;
  $("rememberSsd").checked = !!S.rememberSsd;
  $("autoClear").value = S.autoClear || "1";
  $("schedEnable").checked = !!S.schedEnable;
  $("schedEvery").value = String(S.schedEvery || 30);

  function maybeSave() {
    if (!$("rememberSettings").checked) return;
    S.ghToken = $("ghToken").value;
    S.ghRepo = $("ghRepo").value.trim();
    S.ghBranch = $("ghBranch").value.trim();
    S.rememberSettings = $("rememberSettings").checked;
    S.rememberSsd = $("rememberSsd").checked;
    S.autoClear = $("autoClear").value;
    S.schedEnable = $("schedEnable").checked;
    S.schedEvery = parseInt($("schedEvery").value || "30", 10);
    save(S);
  }

  document.addEventListener("input", function (e) {
    var t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) maybeSave();
  }, true);
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) maybeSave();
  }, true);

  // ---------- IndexedDB ----------
  var DB_NAME = "hal-relay", DB_STORE = "handles";
  function idb() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(DB_STORE); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function putHandle(k, h) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction(DB_STORE, "readwrite");
        tx.objectStore(DB_STORE).put(h, k);
        tx.oncomplete = function () { res(); };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  }
  function getHandle(k) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction(DB_STORE, "readonly");
        var q = tx.objectStore(DB_STORE).get(k);
        q.onsuccess = function () { res(q.result); };
        q.onerror = function () { rej(q.error); };
      });
    });
  }

  // ---------- SSD select / auto-lock ----------
  var ssdRoot = null;
  function coerceGenesis(h) {
    return Promise.resolve().then(function () {
      var name = (h && h.name) ? String(h.name).toUpperCase() : "";
      if (name === "GENESIS") return h;
      return h.getDirectoryHandle("GENESIS", { create: false }).catch(() => h);
    });
  }
  function setSsd(h) {
    return coerceGenesis(h).then(function (g) {
      ssdRoot = g || null;
      var nm = (g && g.name) ? g.name : "GENESIS (drive root)";
      $("ssdLabel").value = nm;
      if (ssdRoot && $("rememberSsd").checked) return putHandle("ssdRoot", ssdRoot).catch(() => { });
    });
  }

  $("pickBtn").addEventListener("click", function () {
    if (!("showDirectoryPicker" in window)) {
      log("picker error: File System Access API not available.");
      return;
    }
    window.showDirectoryPicker().then(setSsd).then(() => log("selected root set"))
      .catch((err) => log("picker error:", err.message || err));
  });
  $("reconnectBtn").addEventListener("click", function () {
    log("reconnect: requesting permission...");
    reconnectSsd(true);
  });

  function reconnectSsd(userActivation) {
    return getHandle("ssdRoot").then(function (h) {
      if (!h) { log("no saved SSD handle"); return; }
      return h.queryPermission({ mode: "readwrite" })
        .then((p) => (p !== "granted" && userActivation ? h.requestPermission({ mode: "readwrite" }) : p))
        .then(() => setSsd(h)).then(() => log("SSD reconnected"))
        .catch((e) => log("reconnect error:", e.message || e));
    });
  }

  window.addEventListener("DOMContentLoaded", function () {
    log("Boot OK (GitHub-only, GENESIS auto-detect)");
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

  // ---------- Commands ----------
  function normalize(p) {
    if (!p.op && p.action) p.op = p.action;
    if (!p.args) {
      p.args = {};
      if (p.path) p.args.path = p.path;
      if (p.mode) p.args.mode = p.mode;
      if (p.content !== undefined) p.args.content = p.content;
      if (p.data !== undefined) {
        if (typeof p.data === "object") p.args.json = p.data;
        else p.args.content = String(p.data);
      }
    }
    if (!p.target) p.target = "local";
    return p;
  }

  function processOnce(raw) {
    return new Promise(async (resolve, reject) => {
      try {
        var parsed = normalize(JSON.parse(raw));
        var target = String(parsed.target || "local").toLowerCase();
        var op = String(parsed.op || "").toLowerCase();
        var a = parsed.args || {};

        // ---- Local ops ----
        if (target === "local") {
          if (!ssdRoot) {
            log("local: no SSD selected");
            return reject(new Error("No SSD selected"));
          }

          if (op === "file_ops.mkdirs" || op === "mkdirs") {
            await ensureDir(ssdRoot, a.path);
            log("local mkdir ok:", a.path);
            return resolve({ path: a.path });
          }
          if (op === "file_ops.write_file" || op === "write_file") {
            await writeFile(ssdRoot, a.path, a.content);
            log("local write ok:", a.path);
            return resolve({ path: a.path });
          }

          // add more SSD ops here (read_file, delete_file, append_file) if needed

          return reject(new Error("Unknown local op: " + op));
        }

        // ---- GitHub ops ----
        if (target === "render" || op.indexOf("github.") === 0) {
          if (op !== "github.put_file") {
            log("github op not supported:", op);
            return reject(new Error("Unsupported GitHub op: " + op));
          }

          var repo = a.repo || $("ghRepo").value.trim();
          const out = await ghPutFile({
            repo: repo,
            path: a.path,
            content: (a.content || ""),
            message: (a.message || ""),
            branch: (a.branch || $("ghBranch").value.trim())
          });
          var c = (out && out.commit && out.commit.sha) ? out.commit.sha : "";
          log("github put_file:", { path: a.path, commit: c ? c.slice(0, 7) : "" });
          return resolve({ path: a.path, commit: c });
        }

        return reject(new Error("Unknown target/op: " + target + "/" + op));
      } catch (e) {
        log("error:", e.message || e);
        return reject(e);
      }
    });
  }

  // ---------- Expose to extension ----------
  window.runCommandBlock = function (raw) {
    log("[HAL Relay] runCommandBlock called", raw);
    return processOnce(raw);
  };
  console.log("[HAL Relay] runCommandBlock exposed");
})();
