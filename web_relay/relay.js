/* HAL Web Relay JS (v20.3). ASCII-only, no template literals, no Unicode punctuation. */
(function(){
  'use strict';

  // ---------- Tiny helpers ----------
  function $(id){ return document.getElementById(id); }
  function toStr(v){ try{ return typeof v==='string'? v : JSON.stringify(v,null,2); }catch(e){ return String(v); } }
  function log(){
    var out=[]; for(var i=0;i<arguments.length;i++){ out.push(toStr(arguments[i])); }
    var el=$('log'); el.textContent += (el.textContent?"
":"") + out.join(' ');
    el.scrollTop = el.scrollHeight;
  }

  // ---------- Settings ----------
  var LS_KEY='hal-web-relay-settings';
  var DEF={ ghToken:'', ghRepo:'Demigodofa/hal', ghBranch:'main', rememberSettings:true, rememberSsd:true, autoClear:'1', schedEnable:false, schedEvery:30 };
  function load(){ try{ var o=JSON.parse(localStorage.getItem(LS_KEY)||'{}'); var r={}; for(var k in DEF){ r[k]= (o.hasOwnProperty(k)? o[k] : DEF[k]); } return r; }catch(e){ return JSON.parse(JSON.stringify(DEF)); } }
  function save(s){ try{ localStorage.setItem(LS_KEY, JSON.stringify(s)); }catch(e){} }
  var S = load();

  $('ghToken').value=S.ghToken; $('ghRepo').value=S.ghRepo; $('ghBranch').value=S.ghBranch;
  $('rememberSettings').checked=!!S.rememberSettings; $('rememberSsd').checked=!!S.rememberSsd;
  $('autoClear').value=S.autoClear||'1'; $('schedEnable').checked=!!S.schedEnable;
  $('schedEvery').value=String(S.schedEvery||30);
  function maybeSave(){ if(!$('rememberSettings').checked) return; S.ghToken=$('ghToken').value; S.ghRepo=$('ghRepo').value.trim(); S.ghBranch=$('ghBranch').value.trim(); S.rememberSettings=$('rememberSettings').checked; S.rememberSsd=$('rememberSsd').checked; S.autoClear=$('autoClear').value; S.schedEnable=$('schedEnable').checked; S.schedEvery=parseInt($('schedEvery').value||'30',10); save(S); }
  document.addEventListener('input', function(e){ var t=e.target; if(t && (t.tagName==='INPUT'||t.tagName==='SELECT'||t.tagName==='TEXTAREA')) maybeSave(); }, true);
  document.addEventListener('change', function(e){ var t=e.target; if(t && (t.tagName==='INPUT'||t.tagName==='SELECT'||t.tagName==='TEXTAREA')) maybeSave(); }, true);

  // ---------- IndexedDB (persist handles) ----------
  var DB_NAME='hal-relay', DB_STORE='handles';
  function idb(){ return new Promise(function(res,rej){ var r=indexedDB.open(DB_NAME,1); r.onupgradeneeded=function(){ r.result.createObjectStore(DB_STORE); }; r.onsuccess=function(){ res(r.result); }; r.onerror=function(){ rej(r.error); }; }); }
  function putHandle(k,h){ return idb().then(function(db){ return new Promise(function(res,rej){ var tx=db.transaction(DB_STORE,'readwrite'); tx.objectStore(DB_STORE).put(h,k); tx.oncomplete=function(){ res(); }; tx.onerror=function(){ rej(tx.error); }; }); }); }
  function getHandle(k){ return idb().then(function(db){ return new Promise(function(res,rej){ var tx=db.transaction(DB_STORE,'readonly'); var q=tx.objectStore(DB_STORE).get(k); q.onsuccess=function(){ res(q.result); }; q.onerror=function(){ rej(q.error); }; }); }); }

  // ---------- SSD select / auto-lock to GENESIS ----------
  var ssdRoot=null;
  function coerceGenesis(h){
    // Try: exact GENESIS folder -> GENESIS child -> .genesis_root marker -> create marker
    return Promise.resolve().then(function(){
      var name = (h && h.name) ? h.name.toUpperCase() : '';
      if(name==='GENESIS') return h;
      return h.getDirectoryHandle('GENESIS',{create:false}).then(function(d){ return d; }).catch(function(){
        return h.getFileHandle('.genesis_root',{create:false}).then(function(){ return h; }).catch(function(){
          return h.getFileHandle('.genesis_root',{create:true}).then(function(f){ return f.createWritable().then(function(w){ return w.write('ok'); }).then(function(){ return h; }); }).catch(function(){ return h; });
        });
      });
    });
  }
  function setSsd(h){ return coerceGenesis(h).then(function(g){ ssdRoot=g||null; var nm=(g&&g.name)?g.name:'GENESIS (drive root)'; $('ssdLabel').value=nm; if (ssdRoot && $('rememberSsd').checked){ return putHandle('ssdRoot', ssdRoot).catch(function(){}); } }); }

  function showPermBanner(){ if(document.getElementById('permBanner')) return; var b=document.createElement('div'); b.id='permBanner'; b.innerHTML='<span>Grant SSD access to <b>GENESIS</b> to continue.</span> <button id="grantSsd">Grant SSD Access</button>'; document.body.appendChild(b); document.getElementById('grantSsd').onclick=function(){ reconnectSsd(true); }; }
  function hidePermBanner(){ var b=document.getElementById('permBanner'); if(b) b.parentNode.removeChild(b); }

  function reconnectSsd(userActivation){
    return getHandle('ssdRoot').then(function(h){ if(!h){ log('no saved SSD handle - click Choose Folder and pick drive root or GENESIS folder'); showPermBanner(); return; }
      return h.queryPermission({mode:'readwrite'}).then(function(p){ if(p!=='granted'){ if(userActivation){ return h.requestPermission({mode:'readwrite'}); } else { showPermBanner(); throw new Error('permission not granted yet'); } } return 'granted'; })
      .then(function(){ return setSsd(h); }).then(function(){ log('SSD reconnected'); hidePermBanner(); })
      .catch(function(e){ log('reconnect error:', (e&&e.message)?e.message:String(e)); });
    });
  }

  $('pickBtn').addEventListener('click', function(){
    try{
      log('picker: opening...');
      if(!('showDirectoryPicker' in window)){ log('picker error: File System Access API not available (use Chrome/Edge).'); alert('Your browser does not support folder access. Use Chrome or Edge.'); return; }
      window.showDirectoryPicker().then(function(h){ return setSsd(h); }).then(function(){ log('selected root set'); }).catch(function(err){ log('picker error:', (err&&err.message)?err.message:'canceled'); });
    }catch(err){ log('picker error:', (err&&err.message)?err.message:String(err)); }
  });
  $('reconnectBtn').addEventListener('click', function(){ log('reconnect: requesting permission...'); reconnectSsd(true); });

  window.addEventListener('DOMContentLoaded', function(){ log('Boot OK (GitHub-only, GENESIS auto-detect)'); reconnectSsd(false); if($('schedEnable').checked){ startScheduler($('schedEvery').value); } });

  // ---------- Local FS ops ----------
  function splitPath(p){ return String(p).split('/').filter(function(s){ return s && s!=='.' && s!=='..'; }); }
  function ensureDir(root,rel){ var parts=splitPath(rel); var d=Promise.resolve(root); for(var i=0;i<parts.length;i++){ (function(part){ d=d.then(function(dir){ return dir.getDirectoryHandle(part,{create:true}); }); })(parts[i]); } return d; }
  function getParent(root,rel,create){ var parts=splitPath(rel); if(!parts.length) return Promise.reject(new Error('empty path')); var d=Promise.resolve(root); for(var i=0;i<parts.length-1;i++){ (function(part){ d=d.then(function(dir){ return dir.getDirectoryHandle(part,{create:create}); }); })(parts[i]); } return d.then(function(dir){ return {dir:dir,name:parts[parts.length-1]}; }); }
  function writeFile(root,rel,content){ return getParent(root,rel,true).then(function(x){ return x.dir.getFileHandle(x.name,{create:true}).then(function(fh){ return fh.createWritable().then(function(w){ return w.write(content||''); }).then(function(){ return {path:rel,bytes:(content||'').length}; }); }); }); }
  function readFile(root,rel){ return getParent(root,rel,false).then(function(x){ return x.dir.getFileHandle(x.name,{create:false}).then(function(fh){ return fh.getFile().then(function(f){ return f.text(); }).then(function(txt){ return {path:rel,content:txt}; }); }); }); }
  function readIfExists(root,rel){ return readFile(root,rel).catch(function(){ return {path:rel,content:''}; }); }
  function deleteFile(root,rel){ return getParent(root,rel,false).then(function(x){ return x.dir.removeEntry(x.name,{recursive:false}).then(function(){ return {path:rel,deleted:true}; }); }); }
  function appendText(root,rel,text,ensureSep){ return readIfExists(root,rel).then(function(r){ var cur=r.content||''; var sep=(cur && ensureSep && !/
$/.test(cur))?'
':''; return writeFile(root,rel,cur+sep+(text||'')); }); }
  function appendJsonArray(root,rel,obj){ return readIfExists(root,rel).then(function(r){ var arr=[]; try{ arr=r.content?JSON.parse(r.content):[]; if(!Array.isArray(arr)) arr=[]; }catch(e){ arr=[]; } arr.push(obj); return writeFile(root,rel,JSON.stringify(arr,null,2)+'
'); }); }
  function appendJsonl(root,rel,obj){ return appendText(root,rel,JSON.stringify(obj)+'
',false); }

  // ---------- GitHub (bypass only) ----------
  var ghBase='https://api.github.com';
  function ghHdrs(tok){ var h={'Accept':'application/vnd.github+json'}; if(tok) h['Authorization']='Bearer '+tok; return h; }
  function b64e(t){ return btoa(unescape(encodeURIComponent(t))); }
  function encSeg(p){ return String(p).split('/').map(encodeURIComponent).join('/'); }
  function ghPutFile(opt){ var tok=$('ghToken').value.trim(); var url=ghBase+'/repos/'+opt.repo+'/contents/'+encSeg(opt.path); var sha; var qs=$('ghBranch').value.trim(); if(opt.branch) qs=opt.branch; var checkUrl=url+(qs?('?ref='+encodeURIComponent(qs)):''); return fetch(checkUrl,{headers:ghHdrs(tok)}).then(function(r){ if(r.ok) return r.json(); }).then(function(j){ if(j&&j.sha) sha=j.sha; return fetch(url,{method:'PUT',headers:Object.assign({'Content-Type':'application/json'},ghHdrs(tok)), body:JSON.stringify({message:(opt.message||('update '+opt.path)), content:b64e(opt.content||''), branch:(qs||'main'), sha:sha})}); }).then(function(r){ if(!r.ok) throw new Error('github PUT '+r.status); return r.json(); }); }

  // ---------- Checkpointing ----------
  function nowIso(){ return new Date().toISOString(); }
  function slug(){ return nowIso().replace(/[:.]/g,'').replace('Z','Z'); }
  function checkpointNow(){ if(!ssdRoot){ log('checkpoint error: no SSD'); return Promise.resolve(false);} var repo=$('ghRepo').value.trim(); var branch=$('ghBranch').value.trim()||'main'; return Promise.all([ readIfExists(ssdRoot,'memory/short_term/tasks.json'), readIfExists(ssdRoot,'memory/short_term/journal.jsonl') ]).then(function(r){ var tasks=r[0].content||'[]'; var journal=r[1].content||''; var tasksParsed=[]; try{ tasksParsed=JSON.parse(tasks); if(!Array.isArray(tasksParsed)) tasksParsed=[]; }catch(e){ tasksParsed=[]; } var payload={ ts: nowIso(), tasks: tasksParsed, journal: journal }; var content=JSON.stringify(payload,null,2)+'
'; var path='memory/short_term/checkpoints/short_term-'+slug()+'.json'; return ghPutFile({repo:repo, path:path, content:content, message:'chore: checkpoint '+payload.ts, branch:branch}).then(function(out){ log('checkpoint ok:', {path:path, commit:(out&&out.commit&&out.commit.sha?out.commit.sha.slice(0,7):'')}); return true; }); }).catch(function(e){ log('checkpoint error:', (e&&e.message)?e.message:String(e)); return false; }); }

  var schedTimer=null; function startScheduler(mins){ stopScheduler(); var ms=Math.max(1,parseInt(mins||30,10))*60*1000; schedTimer=setInterval(checkpointNow, ms); log('scheduler on:', String(ms/60000), 'min'); } function stopScheduler(){ if(schedTimer){ clearInterval(schedTimer); schedTimer=null; log('scheduler off'); } }
  $('schedEnable').addEventListener('change', function(e){ if(e.target.checked){ startScheduler($('schedEvery').value); } else { stopScheduler(); } maybeSave(); });
  $('schedEvery').addEventListener('change', function(){ if($('schedEnable').checked){ startScheduler($('schedEvery').value); } maybeSave(); });
  $('schedNow').addEventListener('click', checkpointNow);

  // ---------- Commands ----------
  function extractBlock(t){ var s=t.indexOf('[KEV_AI::command]'); var e=t.indexOf('[/KEV_AI::command]'); return (s!==-1&&e!==-1&&e>s)? t.slice(s+17,e).trim() : t.trim(); }
  function normalize(p){ if(!p.op && p.action) p.op=p.action; if(!p.args){ p.args={}; if(p.path) p.args.path=p.path; if(p.mode) p.args.mode=p.mode; if(p.content!==undefined) p.args.content=p.content; if(p.data!==undefined){ if(typeof p.data==='object') p.args.json=p.data; else p.args.content=String(p.data);} } if(!p.target) p.target='local'; return p; }
  function processOnce(){ try{ var rawAll=$('cmdInput').value; var raw=extractBlock(rawAll); var parsed=normalize(JSON.parse(raw)); var target=String(parsed.target||'local').toLowerCase(); var op=String(parsed.op||'').toLowerCase(); var a=parsed.args||{}; if(target==='local'){ if(!ssdRoot){ log('local: no SSD selected'); showPermBanner(); } else { if(op==='file_ops.read_file'||op==='read_file'){ readFile(ssdRoot,a.path).then(function(r){ log('local read:', r); }); } else if(op==='file_ops.write_file'||op==='write_file'){ writeFile(ssdRoot,a.path,a.content||'').then(function(r){ log('local write:', r); }); } else if(op==='file_ops.mkdirs'||op==='mkdirs'){ ensureDir(ssdRoot,a.path).then(function(){ log('local mkdirs ok:', a.path); }); } else if(op==='file_ops.delete_file'||op==='delete_file'){ deleteFile(ssdRoot,a.path).then(function(r){ log('local delete:', r); }); } else if(op==='file_ops.append_file'||op==='append_file'){ var mode=String(a.mode||'text').toLowerCase(); if(mode==='json-array'){ var obj=a.json ? a.json : (a.content?JSON.parse(a.content):{}); appendJsonArray(ssdRoot,a.path,obj).then(function(r){ log('local append (json-array):', r); }); } else if(mode==='jsonl'){ var obj2=a.json ? a.json : (a.content?JSON.parse(a.content):{}); appendJsonl(ssdRoot,a.path,obj2).then(function(r){ log('local append (jsonl):', r); }); } else { var ensure = a.ensureNewline!==false; appendText(ssdRoot,a.path,a.content||'',ensure).then(function(r){ log('local append (text):', r); }); } } else if(op==='relay.checkpoint_now'){ checkpointNow(); } else if(op==='relay.scheduler'){ if(a.enabled){ startScheduler(a.interval_mins||30); $('schedEnable').checked=true; $('schedEvery').value=String(a.interval_mins||30); } else { stopScheduler(); $('schedEnable').checked=false; } maybeSave(); } else { log('local unknown op:', op); } } } if(target==='render' || op.indexOf('github.')===0){ if(op.indexOf('github.')!==0){ log('render disabled (bypass ON): op not github.* ->', op); } else { var repo=a.repo||$('ghRepo').value.trim(); if(op==='github.put_file'){ ghPutFile({repo:repo,path:a.path,content:(a.content||''),message:(a.message||''),branch:(a.branch||$('ghBranch').value.trim())}).then(function(out){ log('github put_file:', {path:a.path, commit:(out&&out.commit&&out.commit.sha?out.commit.sha.slice(0,7):'')}); }); } else { log('github op not supported:', op); } } } if($('autoClear').value==='1') $('cmdInput').value=''; }catch(e){ log('error:', (e&&e.message)?e.message:String(e)); } }
  $('runOnce').addEventListener('click', processOnce);
  $('clearLog').addEventListener('click', function(){ $('log').textContent=''; });

  // ---------- Clipboard watcher ----------
  var watchTimer=null; $('watchClipboard').addEventListener('click', function(e){ if(watchTimer){ clearInterval(watchTimer); watchTimer=null; e.target.textContent='Watch Clipboard'; return; } e.target.textContent='Watching...'; var last=''; watchTimer=setInterval(function(){ navigator.clipboard.readText().then(function(t){ if(t && t!==last && t.indexOf('[KEV_AI::command]')!==-1){ last=t; $('cmdInput').value=t; log('clipboard captured block'); processOnce(); } }).catch(function(){}); },1200); });

  // ---------- PostMessage queue from extension ----------
  (function(){ var Q=[]; var busy=false; function run(raw){ $('cmdInput').value='[KEV_AI::command]
'+raw+'
[/KEV_AI::command]'; processOnce(); return Promise.resolve(); } function pump(){ if(busy) return; busy=true; (function next(){ if(!Q.length){ busy=false; return; } var r=Q.shift(); run(r).then(next); })(); } window.addEventListener('message', function(ev){ var d=ev.data||{}; if(d.type==='HAL_PAYLOAD' && typeof d.raw==='string'){ Q.push(d.raw); pump(); } if(d.type==='HAL_CONTROL' && d.cmd==='settings' && d.settings){ try{ var s=d.settings; if(typeof s.ghToken!=='undefined'){ $('ghToken').value=s.ghToken; } if(s.ghRepo){ $('ghRepo').value=s.ghRepo; } if(s.ghBranch){ $('ghBranch').value=s.ghBranch; } var rs=$('rememberSettings'); if(rs&&!rs.checked){ rs.checked=true; } maybeSave(); }catch(e){} } if(d.type==='HAL_CONTROL' && d.cmd==='reconnect'){ reconnectSsd(false); } if(d.type==='HAL_CONTROL' && d.cmd==='scheduler'){ if(d.settings && d.settings.enabled){ startScheduler(d.settings.interval_mins||30); $('schedEnable').checked=true; $('schedEvery').value=String(d.settings.interval_mins||30); } else { stopScheduler(); $('schedEnable').checked=false; } maybeSave(); } if(d.type==='HAL_CONTROL' && d.cmd==='checkpoint_now'){ checkpointNow(); } }); })();
})();
