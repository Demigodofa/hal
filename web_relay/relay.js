<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>HAL Web Relay — GENESIS v20.4</title>
  <style>
    body{font-family:system-ui,Segoe UI,Roboto,Arial;margin:0;background:#f8fafc;color:#0f172a}
    .wrap{max-width:980px;margin:24px auto;padding:0 16px}
    .card{background:#fff;border-radius:12px;box-shadow:0 6px 18px rgba(0,0,0,.06);padding:16px}
    label{display:block;margin:8px 0 4px;font-size:12px;color:#475569}
    input,textarea,select,button{font:inherit}
    input,textarea,select{width:100%;box-sizing:border-box;border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;background:#fff}
    textarea{min-height:160px;resize:vertical}
    .row{display:flex;gap:12px;align-items:flex-end}
    .row>.col{flex:1}
    .btn{padding:10px 14px;border:none;border-radius:10px;background:#111827;color:#fff;cursor:pointer}
    .btn.alt{background:#334155}
    .btn.ok{background:#16a34a}
    .log{font-family:ui-monospace,Consolas,Menlo,monospace;background:#0b1020;color:#e5e7eb;border-radius:10px;padding:12px;height:300px;overflow:auto;white-space:pre-wrap}
    .muted{color:#64748b;font-size:12px}
    #permBanner{position:fixed;left:16px;right:16px;bottom:16px;background:#111827;color:#fff;padding:12px;border-radius:10px;box-shadow:0 6px 18px rgba(0,0,0,.2);z-index:9999;display:flex;gap:12px;align-items:center}
    #grantSsd{padding:8px 12px;border:0;border-radius:10px;background:#16a34a;color:#fff;cursor:pointer}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>HAL Web Relay — GENESIS</h1>
      <p class="muted">Remote ops use GitHub API only. SSD selection is drive-agnostic and auto-locks onto a GENESIS root/folder/marker.</p>

      <div class="row">
        <div class="col">
          <label>SSD root (auto-detects GENESIS)</label>
          <input id="ssdLabel" placeholder="Not selected" disabled />
        </div>
        <div><button class="btn" id="pickBtn">Choose Folder</button></div>
        <div><button class="btn alt" id="reconnectBtn" title="Try saved handle">Reconnect</button></div>
      </div>
      <label><input id="rememberSsd" type="checkbox" checked> Remember SSD selection (IndexedDB)</label>

      <hr>
      <h3>GitHub Direct (Render bypass locked ON)</h3>
      <div class="row">
        <div class="col"><label>GitHub Token (repo read/write)</label><input id="ghToken" type="password" placeholder="fine-grained token"/></div>
        <div class="col"><label>Repo</label><input id="ghRepo" value="Demigodofa/hal"/></div>
      </div>
      <div class="row">
        <div class="col"><label>Branch</label><input id="ghBranch" value="main"/></div>
        <div class="col"><label>Auto-clear command after success</label><select id="autoClear"><option value="1" selected>Yes</option><option value="0">No</option></select></div>
      </div>

      <hr>
      <h3>Checkpoint Scheduler</h3>
      <div class="row">
        <div class="col"><label><input id="schedEnable" type="checkbox"> Enable periodic checkpoint</label></div>
        <div class="col"><label>Every (minutes)</label><input id="schedEvery" type="number" min="1" value="30"/></div>
        <div><button class="btn" id="schedNow">Checkpoint Now</button></div>
      </div>
      <label><input id="rememberSettings" type="checkbox" checked> Remember settings (localStorage)</label>

      <label style="margin-top:10px">Command block or JSON</label>
      <textarea id="cmdInput" spellcheck="false" placeholder="Paste [KEV_AI::command]... or raw JSON here"></textarea>
      <div class="row" style="margin-top:8px">
        <div class="col">
          <button class="btn ok" id="runOnce">Process Once</button>
          <button class="btn alt" id="clearLog">Clear Log</button>
          <button class="btn" id="watchClipboard">Watch Clipboard</button>
        </div>
      </div>

      <label style="margin-top:12px">Log</label>
      <div class="log" id="log"></div>
      <p class="muted">This page reads/writes GENESIS and pushes to GitHub.</p>
    </div>
  </div>

  <script src="relay.js" defer></script>
</body>
</html>
