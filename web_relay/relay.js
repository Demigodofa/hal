(function(){
return h.queryPermission({mode:'readwrite'}).then(function(p){ if(p!=='granted'){ if(userActivation){ return h.requestPermission({mode:'readwrite'}); } else { showPermBanner(); throw new Error('permission not granted yet'); } } return 'granted'; })
.then(function(){ return setSsd(h); })
.then(function(){ log('SSD reconnected'); hidePermBanner(); })
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


window.addEventListener('DOMContentLoaded', function(){
log('Boot OK (GitHub‑only, GENESIS auto‑detect)');
reconnectSsd(false);
if($('schedEnable').checked){ startScheduler($('schedEvery').value); }
var once=false; document.addEventListener('pointerdown', function(){ if(!once){ once=true; reconnectSsd(true); }}, {once:true});
});


// ---------- Local FS ops ----------
function splitPath(p){ return String(p).split('/').filter(function(s){ return s && s!=='.' && s!=='..'; }); }
function ensureDir(root,rel){ var parts=splitPath(rel); var d=Promise.resolve(root); for(var i=0;i<parts.length;i++){ (function(part){ d=d.then(function(dir){ return dir.getDirectoryHandle(part,{create:true}); }); })(parts[i]); } return d; }
function getParent(root,rel,create){ var parts=splitPath(rel); if(!parts.length) return Promise.reject(new Error('empty path')); var d=Promise.resolve(root); for(var i=0;i<parts.length-1;i++){ (function(part){ d=d.then(function(dir){ return dir.getDirectoryHandle(part,{create:create}); }); })(parts[i]); } return d.then(function(dir){ return {dir:dir,name:parts[parts.length-1]}; }); }
function writeFile(root,rel,content){ return getParent(root,rel,true).then(function(x){ return x.dir.getFileHandle(x.name,{create:true}).then(function(fh){ return fh.createWritable().then(function(w){ return w.write(content||''); w.close && w.close(); }).then(function(){ return {path:rel,bytes:(content||'').length}; }); }); }); }
function readFile(root,rel){ return getParent(root,rel,false).then(function(x){ return x.dir.getFileHandle(x.name,{create:false}).then(function(fh){ return fh.getFile().then(function(f){ return f.text(); }).then(function(txt){ return {path:rel,content:txt}; }); }); }); }
function readIfExists(root,rel){ return readFile(root,rel).catch(function(){ return {path:rel,content:''}; }); }
function deleteFile(root,rel){ return getParent(root,rel,false).then(function(x){ return x.dir.removeEntry(x.name,{recursive:false}).then(function(){ return {path:rel,deleted:true}; }); }); }
function appendText(root,rel,text,ensureSep){ return readIfExists(root,rel).then(function(r){ var cur=r.content||''; var sep=(cur && ensureSep && !/\n$/.test(cur)) ? '\n' : ''; return writeFile(root,rel,cur+sep+(text||'')); }); }
function appendJsonArray(root,rel,obj){ return readIfExists(root,rel).then(function(r){ var arr=[]; try{ arr=r.content?JSON.parse(r.content):[]; if(!Array.isArray(arr)) arr=[]; }catch(e){ arr=[]; } arr.push(obj); return writeFile(root,rel,JSON.stringify(arr,null,2)+'\n'); }); }
function appendJsonl(root,rel,obj){ return appendText(root,rel,JSON.stringify(obj)+'\n',false); }


// ---------- GitHub (bypass only) ----------
var ghBase='https://api.github.com';
function ghHdrs(tok){ var h={'Accept':'application/vnd.github+json'}; if(tok) h['Authorization']='Bearer '+tok; return h; }
function b64e(t){ return btoa(unescape(encodeURIComponent(t))); }
function encSeg(p){ return String(p).split('/').map(encodeURIComponent).join('/'); }
function ghPutFile(opt){ var tok=$('ghToken').value.trim(); var url=ghBase+'/repos/'+opt.repo+'/contents/'+encSeg(opt.path); var sha; var qs=$('ghBranch').value.trim(); if(opt.branch) qs=opt.branch; var checkUrl=url+(qs?('?ref='+encodeURIComponent(qs)):''); return fetch(checkUrl,{headers:ghHdrs(tok)}).then(function(r){ if(r.ok) return r.json(); }).then(function(j){ if(j&&j.sha) sha=j.sha; return fetch(url,{method:'PUT',headers:Object.assign({'Content-Type':'application/json'},ghHdrs(tok)), body:JSON.stringify({message:(opt.message||('update '+opt.path)), content:b64e(opt.content||''), branch:(qs||'main'), sha:sha})}); }).then(function(r){ if(!r.ok) throw new Error('github PUT '+r.status); return r.json(); }); }


// ---------- Checkpointing ----------
function nowIso(){ return new Date().toISOString(); }
function slug(){ return nowIso().replace(/[:.]/g,'').replace('Z','Z'); }
function checkpointNow(){ if(!ssdRoot){ log('checkpoint error: no SSD'); return Promise.resolve(false); } var repo=$('ghRepo').value.trim(); var branch=$('ghBranch').value.trim()||'main'; return Promise.all([ readIfExists(ssdRoot,'memory/short_term/tasks.json'), readIfExists(ssdRoot,'memory/short_term/journal.jsonl') ]).then(function(r){ var tasks=r[0].content||'[]'; var journal=r[1].content||''; var tasksParsed=[]; try{ tasksParsed=JSON.parse(tasks); if(!Array.isArray(tasksParsed)) tasksParsed=[]; }catch(e){ tasksParsed=[]; } var payload={ ts: nowIso(), tasks: tasksParsed, journal: journal }; var content=JSON.stringify(payload,null,2)+'\n'; var path='memory/short_term/checkpoints/short_term-'+slug()+'.json'; return ghPutFile({repo:repo,path:path,content:content,message:'chore: checkpoint '+payload.ts,branch:branch}).then(function(out){ var c=(out&&out.commit&&out.commit.sha)?out.commit.sha:''; log('checkpoint ok:', {path:path, commit:c?c.slice(0,7):''}); return true; }); }).catch(function(e){ log('checkpoint error:', (e&&e.message)?e.message:String(e)); return false; }); }


var schedTimer=null; function startScheduler(mins){ stopScheduler(); var ms=Math.max(1,parseInt(mins||30,10))*60*1000; schedTimer=setInterval(checkpointNow,ms); log('scheduler on:', String(ms/60000), 'min'); } function stopScheduler(){ if(schedTimer){ clearInterval(schedTimer); schedTimer=null; log('scheduler off'); } }
$('schedEnable').addEventListener('change', function(e){ if(e.target.checked){ startScheduler($('schedEvery').value); } else { stopScheduler(); } maybeSave(); });
$('schedEvery').addEventListener('change', function(){ if($('schedEnable').checked){ startScheduler($('schedEvery').value); } maybeSave(); });
$('schedNow').addEventListener('click', checkpointNow);


// ---------- Commands ----------
function extractBlock(t){ var s=t.indexOf('[KEV_AI::command]'); var e=t.indexOf('[/KEV_AI::command]'); return (s!==-1&&e!==-1&&e>s) ? t.slice(s+17,e).trim() : t.trim(); }
function normalize(p){ if(!p.op && p.action) p.op=p.action; if(!p.args){ p.args={}; if(p.path) p.args.path=p.path; if(p.mode) p.args.mode=p.mode; if(p.content!==undefined) p.args.content=p.content; if(p.data!==undefined){ if(typeof p.data==='object') p.args.json=p.data; else p.args.content=String(p.data); } } if(!p.target) p.target='local'; return p; }
function processOnce(){ try{ var rawAll=$('cmdInput').value; var raw=extractBlock(rawAll); var parsed=normalize(JSON.parse(raw)); var target=String(parsed.target||'local').toLowerCase(); var op=String(parsed.op||'').toLowerCase(); var a=parsed.args||{}; if(target==='local'){ if(!ssdRoot){ log('local: no SSD selected'); showPermBanner(); } else { if(op==='file_ops.read_file'||op==='read_file'){ readFile(ssdRoot,a.path).then(function(r){ log('local read:', r); }); } else if(op==='file_ops.write_file'||op==='write_file'){ writeFile(ssdRoot,a.path,a.content||'').then(function(r){ log('local write:', r); }); } else if(op==='file_ops.mkdirs'||op==='mkdirs'){ ensureDir(ssdRoot,a.path).then(function(){ log('local mkdirs ok:', a.path); }); } else if(op==='file_ops.delete_file'||op==='delete_file'){ deleteFile(ssdRoot,a.path).then(function(r){ log('local delete:', r); }); } else if(op==='file_ops.append_file'||op==='append_file'){ var mode=String(a.mode||'text').toLowerCase(); if(mode==='json-array'){ var obj=a.json ? a.json : (a.content?JSON.parse(a.content):{}); appendJsonArray(ssdRoot,a.path,obj).then(function(r){ log('local append (json-array):', r); }); } else if(mode==='jsonl'){ var obj2=a.json ? a.json : (a.content?JSON.parse(a.content):{}); appendJsonl(ssdRoot,a.path,obj2).then(function(r){ log('local append (jsonl):', r); }); } else { var ensure=a.ensureNewline!==false; appendText(ssdRoot,a.path,a.content||'',ensure).then(function(r){ log('local append (text):', r); }); } } else if(op==='relay.checkpoint_now'){ checkpointNow(); } else if(op==='relay.scheduler'){ if(a.enabled){ startScheduler(a.interval_mins||30); $('schedEnable').checked=true; $('schedEvery').value=String(a.interval_mins||30); } else { stopScheduler(); $('schedEnable').checked=false; } maybeSave(); } else { log('local unknown op:', op); } } } if(target==='render' || op.indexOf('github.')===0){ if(op.indexOf('github.')!==0){ log('render disabled (bypass ON): op not github.* ->', op); } else { var repo=a.repo||$('ghRepo').value.trim(); if(op==='github.put_file'){ ghPutFile({repo:repo,path:a.path,content:(a.content||''),message:(a.message||''),branch:(a.branch||$('ghBranch').value.trim())}).then(function(out){ var c=(out&&out.commit&&out.commit.sha)?out.commit.sha:''; log('github put_file:', {path:a.path, commit:c?c.slice(0,7):''}); }); } else { log('github op not supported:', op); } } } if($('autoClear').value==='1') $('cmdInput').value=''; }catch(e){ log('error:', (e&&e.message)?e.message:String(e)); } }
$('runOnce').addEventListener('click', processOnce);
$('clearLog').addEventListener('click', function(){ $('log').textContent=''; });


// ---------- Clipboard watcher ----------
var watchTimer=null; $('watchClipboard').addEventListener('click', function(e){ if(watchTimer){ clearInterval(watchTimer); watchTimer=null; e.target.textContent='Watch Clipboard'; return; } e.target.textContent='Watching...'; var last=''; watchTimer=setInterval(function(){ navigator.clipboard.readText().then(function(t){ if(t && t!==last && t.indexOf('[KEV_AI::command]')!==-1){ last=t; $('cmdInput').value=t; log('clipboard captured block'); processOnce(); } }).catch(function(){}); },1200); });


// ---------- PostMessage queue from extension ----------
(function(){ var Q=[]; var busy=false; function run(raw){ $('cmdInput').value='[KEV_AI::command]\n'+raw+'\n[/KEV_AI::command]'; processOnce(); return Promise.resolve(); } function pump(){ if(busy) return; busy=true; (function next(){ if(!Q.length){ busy=false; return; } var r=Q.shift(); run(r).then(next); })(); } window.addEventListener('message', function(ev){ var d=ev.data||{}; if(d.type==='HAL_PAYLOAD' && typeof d.raw==='string'){ Q.push(d.raw); pump(); } if(d.type==='HAL_CONTROL' && d.cmd==='settings' && d.settings){ try{ var s=d.settings; if(typeof s.ghToken!=='undefined'){ $('ghToken').value=s.ghToken; } if(s.ghRepo){ $('ghRepo').value=s.ghRepo; } if(s.ghBranch){ $('ghBranch').value=s.ghBranch; } var rs=$('rememberSettings'); if(rs&&!rs.checked){ rs.checked=true; } maybeSave(); }catch(e){} } if(d.type==='HAL_CONTROL' && d.cmd==='reconnect'){ reconnectSsd(false); } if(d.type==='HAL_CONTROL' && d.cmd==='scheduler'){ if(d.settings && d.settings.enabled){ startScheduler(d.settings.interval_mins||30); $('schedEnable').checked=true; $('schedEvery').value=String(d.settings.interval_mins||30); } else { stopScheduler(); $('schedEnable').checked=false; } maybeSave(); } if(d.type==='HAL_CONTROL' && d.cmd==='checkpoint_now'){ checkpointNow(); } }); })();


// ---------- Drag & drop a GENESIS folder to grant access ----------
document.addEventListener('dragover', function(e){ e.preventDefault(); });
document.addEventListener('drop', function(e){
try{
e.preventDefault();
var items=e.dataTransfer && e.dataTransfer.items ? e.dataTransfer.items : [];
for(var i=0;i<items.length;i++){
var it=items[i];
if(it.kind==='file'){
var getter = it.getAsFileSystemHandle || it.webkitGetAsEntry;
if(getter){
Promise.resolve(getter.call(it)).then(function(h){
if(h && h.kind==='directory'){ setSsd(h).then(function(){ log('selected root set (drop)'); }); }
else if(h && h.isDirectory && h.createReader){ log('drop: legacy entry not handled'); }
}).catch(function(err){ log('drop error:', (err&&err.message)?err.message:String(err)); });
return;
}
}
}
log('drop: no directory item found');
}catch(err){ log('drop error:', (err&&err.message)?err.message:String(err)); }
});
})();
