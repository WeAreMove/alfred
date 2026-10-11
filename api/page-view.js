const { list } = require('@vercel/blob');
const path = require('path');
const fs   = require('fs');

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

function blobKey(client, page) { return `pages/${client}/${page}.html`; }
function localPath(client, page) {
  return path.join(__dirname, '..', 'pages', client, `${page}.html`);
}

const LANG_NAMES = { bg:'Bulgarian', de:'German', en:'English', he:'Hebrew', ro:'Romanian', tr:'Turkish' };

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { client, page, lang = 'tr' } = req.query;
  if (!client || !/^[a-z0-9_-]+$/i.test(client)) return res.status(400).send('Invalid client');
  if (!page   || !/^[a-z0-9_-]+$/i.test(page))   return res.status(400).send('Invalid page');

  // ── Load stored HTML ──────────────────────────────────────────────────────
  let html = '';

  if (!TOKEN) {
    const p = localPath(client, page);
    if (!fs.existsSync(p)) return res.status(404).send(notUploadedHtml(client, page, lang));
    html = fs.readFileSync(p, 'utf8');
  } else {
    try {
      const { blobs } = await list({ prefix: blobKey(client, page), token: TOKEN });
      const blob = blobs.find(b => b.pathname === blobKey(client, page));
      if (!blob) return res.status(404).send(notUploadedHtml(client, page, lang));
      const r = await fetch(blob.url, { headers: { Authorization: `Bearer ${TOKEN}` } });
      if (!r.ok) return res.status(502).send('Failed to fetch page from storage');
      html = await r.text();
    } catch (err) {
      return res.status(500).send(`<pre>${err.message}</pre>`);
    }
  }

  // ── Inject overlay ────────────────────────────────────────────────────────
  const langName = LANG_NAMES[lang] || lang.toUpperCase();
  const overlay  = buildOverlay(client, page, lang, langName);

  // Remove existing </body> and </html> so we can append cleanly
  html = html.replace(/<\/body>\s*<\/html>\s*$/i, '') + overlay + '\n</body></html>';

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(html);
};

// ── Not-uploaded placeholder ───────────────────────────────────────────────────
function notUploadedHtml(client, page, lang) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>No page uploaded</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f8fafc;margin:0;}
.box{text-align:center;max-width:480px;padding:40px;}h1{color:#152656;font-size:22px;margin-bottom:8px;}
p{color:#64748b;font-size:14px;line-height:1.6;}a{color:#3689FB;}</style></head>
<body><div class="box">
<svg width="48" height="48" fill="none" stroke="#3689FB" stroke-width="1.5" viewBox="0 0 24 24" style="margin:0 auto 16px"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/></svg>
<h1>No page uploaded yet</h1>
<p>Go back to the hub and upload the HTML file for <strong>${page}</strong>.</p>
<a href="/editor/translation-hub.html?client=${client}&lang=${lang}">← Back to hub</a>
</div></body></html>`;
}

// ── Build the overlay script + styles (injected before </body>) ───────────────
function buildOverlay(client, page, lang, langName) {
  return `
<style id="__t_styles">
.__t_hs{position:relative;display:inline;cursor:pointer;background:rgba(54,137,251,0.10);border-bottom:2px solid #3689FB;}
.__t_hs:hover{background:rgba(54,137,251,0.22);}
.__t_done{background:rgba(16,185,129,0.10)!important;border-bottom-color:#10b981!important;}
.__t_done sup{background:#10b981!important;}
#__t_panel,#__t_modal_wrap{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;box-sizing:border-box;}
#__t_panel *,#__t_modal_wrap *{box-sizing:border-box;}
#__t_list_inner{scrollbar-width:thin;scrollbar-color:#cbd5e1 transparent;}
#__t_list_inner::-webkit-scrollbar{width:4px;}
#__t_list_inner::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:9999px;}
</style>

<div id="__t_panel" style="position:fixed;top:0;right:0;bottom:0;width:360px;background:#fff;border-left:1px solid #e2e8f0;display:flex;flex-direction:column;z-index:999998;box-shadow:-6px 0 32px rgba(0,0,0,0.10);">
  <div style="background:#152656;padding:12px 14px;flex-shrink:0;">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
      <a href="/editor/translation-hub.html?client=${client}&lang=${lang}" style="color:#93c5fd;font-size:12px;text-decoration:none;display:flex;align-items:center;gap:3px;white-space:nowrap;">← Back</a>
      <div style="flex:1;"></div>
      <span id="__t_toast" style="display:none;color:#fff;font-size:11px;padding:2px 10px;border-radius:999px;"></span>
    </div>
    <div style="color:#fff;font-size:13px;font-weight:600;">Translation Editor</div>
    <div id="__t_meta" style="color:#93c5fd;font-size:11px;margin-top:2px;"></div>
    <div style="display:flex;gap:3px;margin-top:8px;">
      <button class="__t_ftab" onclick="__tFilter(this,'all')" style="flex:1;padding:4px 0;background:rgba(255,255,255,0.18);color:#fff;border:none;border-radius:6px;font-size:11px;cursor:pointer;font-weight:500;">All</button>
      <button class="__t_ftab" onclick="__tFilter(this,'pending')" style="flex:1;padding:4px 0;background:none;color:rgba(255,255,255,0.55);border:none;border-radius:6px;font-size:11px;cursor:pointer;">Pending</button>
      <button class="__t_ftab" onclick="__tFilter(this,'edited')" style="flex:1;padding:4px 0;background:none;color:rgba(255,255,255,0.55);border:none;border-radius:6px;font-size:11px;cursor:pointer;">Edited</button>
    </div>
  </div>
  <div style="padding:7px 10px;border-bottom:1px solid #f1f5f9;flex-shrink:0;">
    <input id="__t_srch" type="search" placeholder="Search keys or text…" oninput="__tSearch(this.value)"
      style="width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:6px 10px;font-size:12px;outline:none;color:#334155;" />
  </div>
  <div id="__t_list_inner" style="flex:1;overflow-y:auto;"></div>
  <div style="border-top:1px solid #f1f5f9;padding:8px 10px;display:flex;align-items:center;gap:6px;flex-shrink:0;">
    <span id="__t_count" style="font-size:11px;color:#94a3b8;flex:1;"></span>
    <button onclick="__tExport()" style="background:#f8fafc;border:1px solid #e2e8f0;color:#475569;border-radius:8px;padding:5px 10px;font-size:11px;cursor:pointer;">Export CSV</button>
    <button onclick="__tDone()" style="background:#10b981;color:#fff;border:none;border-radius:8px;padding:5px 12px;font-size:11px;font-weight:600;cursor:pointer;">✓ Done</button>
  </div>
</div>

<div id="__t_modal_wrap" style="display:none;position:fixed;inset:0;z-index:999999;align-items:center;justify-content:center;padding:16px;">
  <div onclick="__tCloseModal()" style="position:absolute;inset:0;background:rgba(0,0,0,0.5);backdrop-filter:blur(2px);"></div>
  <div style="position:relative;background:#fff;border-radius:16px;width:100%;max-width:480px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.25);">
    <div style="background:#152656;padding:14px 16px;display:flex;align-items:start;justify-content:space-between;">
      <div>
        <div id="__t_mkey" style="color:#fff;font-size:13px;font-weight:600;word-break:break-all;"></div>
        <div id="__t_mbundle" style="color:#93c5fd;font-size:11px;margin-top:2px;"></div>
      </div>
      <button onclick="__tCloseModal()" style="color:rgba(255,255,255,0.4);background:none;border:none;cursor:pointer;font-size:22px;line-height:1;padding:0;margin-left:12px;">×</button>
    </div>
    <div style="padding:14px 16px 8px;">
      <div style="font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:.05em;margin-bottom:5px;">EN — ENGLISH</div>
      <textarea id="__t_men" readonly rows="3" style="width:100%;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px;font-size:13px;color:#64748b;resize:none;outline:none;"></textarea>
    </div>
    <div style="padding:4px 16px 14px;">
      <div id="__t_mlang_label" style="font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:.05em;margin-bottom:5px;"></div>
      <textarea id="__t_mval" rows="3" placeholder="Enter translation…" style="width:100%;border:2px solid #3689FB;border-radius:10px;padding:8px 10px;font-size:13px;resize:none;outline:none;"></textarea>
      <div style="font-size:10px;color:#cbd5e1;margin-top:3px;">Ctrl+Enter / Cmd+Enter to save</div>
    </div>
    <div style="border-top:1px solid #f1f5f9;padding:10px 16px;display:flex;justify-content:flex-end;gap:8px;">
      <button onclick="__tCloseModal()" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:13px;padding:5px 12px;">Cancel</button>
      <button id="__t_msave" onclick="__tSave()" style="background:#3689FB;color:#fff;border:none;border-radius:8px;padding:5px 18px;font-size:13px;font-weight:600;cursor:pointer;">Save</button>
    </div>
  </div>
</div>

<script>
(function(){
  var C={client:'${client}',page:'${page}',lang:'${lang}',langName:'${langName}'};
  var _keys=[],_saved={},_spots=[],_counter=0,_filter='all',_search='',_cur=null;

  /* push sidebar width */
  document.body.style.marginRight='360px';

  /* ── load data ────────────────────────────────────────────── */
  Promise.all([
    fetch('/api/sheet-data').then(function(r){return r.json();}),
    fetch('/api/translations?client='+C.client+'&page='+C.page).then(function(r){return r.ok?r.json():{};})
  ]).then(function(res){
    var sheet=res[0];_saved=res[1]||{};
    Object.keys(sheet.bundles||{}).forEach(function(bun){
      (sheet.bundles[bun]||[]).forEach(function(row){
        _keys.push({key:row.key,bundle:bun,en:row.en||'',base:row[C.lang]||''});
      });
    });
    _scanPage();
    _render();
    _meta();
  }).catch(function(e){console.error('[t]',e);});

  /* ── scan page ────────────────────────────────────────────── */
  function _scanPage(){
    /* Build sheet lookup: key → keyObj  AND  enText → keyObj */
    var byKey=Object.create(null), byEn=Object.create(null);
    _keys.forEach(function(k){
      byKey[k.key]=k;
      if(k.en && k.en.trim().length>=2) byEn[k.en.trim().toLowerCase()]=k;
    });

    var seen=Object.create(null); // keys already added

    /* ── 1. PRIMARY: data-i18n / data-key attributes ─────────── */
    var ATTRS=['data-i18n','data-key','data-translation-key','data-t'];
    ATTRS.forEach(function(attr){
      document.querySelectorAll('['+attr+']').forEach(function(el){
        if(el.closest('#__t_panel')||el.closest('#__t_modal_wrap')) return;
        var key=(el.getAttribute(attr)||'').trim();
        if(!key) return;
        if(seen[key]) return; // first occurrence per key
        seen[key]=true;
        var sheet=byKey[key];
        _wrapEl(el,{
          key:key,
          bundle: sheet?sheet.bundle:'page',
          en: el.textContent.trim() || (sheet?sheet.en:''),
          base: sheet?sheet.base:''
        });
      });
    });

    /* ── 2. FALLBACK: text-node matching from sheet ───────────── */
    var SKIP={SCRIPT:1,STYLE:1,NOSCRIPT:1,IFRAME:1,SVG:1,CANVAS:1,INPUT:1,TEXTAREA:1,SELECT:1};
    var toWrap=[];
    function walk(n){
      if(!n)return;
      if(n.id==='__t_panel'||n.id==='__t_modal_wrap'||n.id==='__t_styles')return;
      if(n.nodeType===3){
        var t=n.textContent.trim();
        if(t.length>=2){
          var m=byEn[t.toLowerCase()];
          if(m && !seen[m.key]) toWrap.push([n,m]);
        }
      }else if(n.nodeType===1){
        if(SKIP[n.tagName]||n.classList.contains('__t_hs')) return;
        for(var i=0;i<n.childNodes.length;i++) walk(n.childNodes[i]);
      }
    }
    walk(document.body);
    toWrap.forEach(function(p){ seen[p[1].key]=true; _wrapTextNode(p[0],p[1]); });
  }

  /* Wrap a data-i18n ELEMENT */
  function _wrapEl(el,keyObj){
    var num=++_counter,edited=_saved[keyObj.key]!==undefined;
    var color=edited?'#10b981':'#3689FB';
    el.style.setProperty('outline','2px solid '+color,'important');
    el.style.setProperty('outline-offset','2px','important');
    el.style.cursor='pointer';
    el.dataset.tKey=keyObj.key;
    el.addEventListener('click',function(e){e.stopPropagation();e.preventDefault();_openModal(keyObj);});
    var sup=document.createElement('sup');
    sup.className='__t_badge';
    sup.style.cssText='background:'+color+';color:#fff;font-size:8px;font-weight:700;border-radius:99px;padding:1px 4px;margin-left:2px;font-family:monospace;vertical-align:super;line-height:1;';
    sup.textContent=num;
    el.appendChild(sup);
    _spots.push({num:num,key:keyObj.key,bundle:keyObj.bundle,en:keyObj.en,base:keyObj.base,el:el,ko:keyObj});
  }

  /* Wrap a plain TEXT NODE */
  function _wrapTextNode(textNode,keyObj){
    var num=++_counter,edited=_saved[keyObj.key]!==undefined;
    var mark=document.createElement('mark');
    mark.className='__t_hs'+(edited?' __t_done':'');
    mark.dataset.tKey=keyObj.key;
    mark.addEventListener('click',function(e){e.stopPropagation();_openModal(keyObj);});
    var sup=document.createElement('sup');
    sup.style.cssText='background:'+(edited?'#10b981':'#3689FB')+';color:#fff;font-size:8px;font-weight:700;border-radius:99px;padding:1px 4px;margin-left:2px;font-family:monospace;';
    sup.textContent=num;
    textNode.parentNode.replaceChild(mark,textNode);
    mark.appendChild(document.createTextNode(textNode.textContent));
    mark.appendChild(sup);
    _spots.push({num:num,key:keyObj.key,bundle:keyObj.bundle,en:keyObj.en,base:keyObj.base,el:mark,ko:keyObj});
  }

  /* ── sidebar render ───────────────────────────────────────── */
  function _render(){
    var el=document.getElementById('__t_list_inner');
    if(!el)return;
    var q=_search.toLowerCase();
    var items=_spots.filter(function(h){
      if(_filter==='edited'&&_saved[h.key]===undefined)return false;
      if(_filter==='pending'&&_saved[h.key]!==undefined)return false;
      if(q&&!h.key.toLowerCase().includes(q)&&!h.en.toLowerCase().includes(q)&&
         !((_saved[h.key]||'').toLowerCase().includes(q)))return false;
      return true;
    });
    document.getElementById('__t_count').textContent=items.length+' / '+_spots.length+' on page';
    el.innerHTML=items.map(function(h){
      var ed=_saved[h.key]!==undefined;
      var dv=ed?_saved[h.key]:(h.base||'');
      return '<div onclick="__tFocus('+h.num+')" style="padding:9px 12px;border-bottom:1px solid #f8fafc;cursor:pointer;border-left:3px solid '+(ed?'#10b981':'#fbbf24')+';" onmouseenter="this.style.background=\'#f8fafc\'" onmouseleave="this.style.background=\'transparent\'">'+
        '<div style="display:flex;align-items:center;gap:5px;margin-bottom:3px;">'+
        '<span style="background:'+(ed?'#10b981':'#3689FB')+';color:#fff;font-size:8px;font-weight:700;border-radius:99px;padding:1px 5px;font-family:monospace;min-width:18px;text-align:center;">'+h.num+'</span>'+
        '<span style="font-size:11px;color:#64748b;font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:250px;">'+h.key+'</span>'+
        (ed?'<span style="margin-left:auto;font-size:10px;color:#10b981;font-weight:500;white-space:nowrap;">Edited</span>':'')+
        '</div>'+
        '<div style="font-size:12px;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+_esc(h.en||'')+'</div>'+
        '<div style="font-size:12px;color:'+(ed?'#1e293b':'#cbd5e1')+';font-style:'+(ed?'normal':'italic')+';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+_esc(dv||'—')+'</div>'+
        '</div>';
    }).join('');
  }

  function _meta(){
    var el=document.getElementById('__t_meta');
    if(el)el.textContent=C.client+' · '+C.lang.toUpperCase()+' · '+_spots.length+' keys · '+Object.keys(_saved).length+' edited';
  }

  /* ── modal ────────────────────────────────────────────────── */
  function _openModal(ko){
    _cur=ko;
    var w=document.getElementById('__t_modal_wrap');
    var sv=_saved[ko.key]!==undefined?_saved[ko.key]:ko.base;
    document.getElementById('__t_mkey').textContent=ko.key;
    document.getElementById('__t_mbundle').textContent=ko.bundle;
    document.getElementById('__t_men').value=ko.en;
    document.getElementById('__t_mval').value=sv;
    document.getElementById('__t_mlang_label').textContent=C.lang.toUpperCase()+' — '+C.langName.toUpperCase();
    w.style.display='flex';
    setTimeout(function(){var ta=document.getElementById('__t_mval');if(ta){ta.focus();ta.select();}},60);
  }

  window.__tCloseModal=function(){document.getElementById('__t_modal_wrap').style.display='none';_cur=null;};

  window.__tSave=function(){
    if(!_cur)return;
    var val=document.getElementById('__t_mval').value;
    var btn=document.getElementById('__t_msave');
    btn.textContent='…';btn.disabled=true;
    fetch('/api/translations?client='+C.client+'&page='+C.page,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({key:_cur.key,value:val})
    }).then(function(r){
      if(!r.ok)return r.json().then(function(e){throw new Error(e.error||'HTTP '+r.status);});
      _saved[_cur.key]=val;
      _spots.forEach(function(h){
        if(h.key===_cur.key){
          h.el.classList.add('__t_done');
          var s=h.el.querySelector('sup');if(s)s.style.background='#10b981';
        }
      });
      _render();_meta();__tCloseModal();_toast('Saved!');
    }).catch(function(e){_toast('Error: '+e.message,true);})
    .finally(function(){btn.textContent='Save';btn.disabled=false;});
  };

  window.__tFocus=function(num){
    var h=_spots.find(function(x){return x.num===num;});
    if(!h)return;
    h.el.scrollIntoView({behavior:'smooth',block:'center'});
    h.el.style.outline='3px solid #3689FB';h.el.style.outlineOffset='3px';
    setTimeout(function(){h.el.style.outline='';h.el.style.outlineOffset='';},1800);
    _openModal(h.ko);
  };

  window.__tFilter=function(btn,f){
    _filter=f;
    document.querySelectorAll('.__t_ftab').forEach(function(b){
      b.style.background='none';b.style.color='rgba(255,255,255,0.55)';b.style.fontWeight='normal';
    });
    btn.style.background='rgba(255,255,255,0.18)';btn.style.color='#fff';btn.style.fontWeight='500';
    _render();
  };

  window.__tSearch=function(q){_search=q;_render();};

  window.__tExport=function(){
    var lines=['"key","en","'+C.lang+'"'];
    _spots.forEach(function(h){
      var v=_saved[h.key]!==undefined?_saved[h.key]:'';
      lines.push([h.key,h.en,v].map(function(s){return'"'+String(s||'').replace(/"/g,'""')+'"';}).join(','));
    });
    var a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/csv'}));
    a.download=C.client+'-'+C.page+'-'+C.lang+'.csv';
    document.body.appendChild(a);a.click();document.body.removeChild(a);
  };

  window.__tDone=function(){
    var changes=Object.entries(_saved).map(function(e){return{key:e[0],value:e[1]};});
    fetch('/api/translations?client='+C.client+'&page='+C.page+'&action=done',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({changes:changes})
    }).then(function(){_toast('Session summary sent!');}).catch(function(){});
  };

  function _toast(msg,err){
    var t=document.getElementById('__t_toast');if(!t)return;
    t.textContent=msg;t.style.background=err?'#ef4444':'#10b981';t.style.display='inline-block';
    setTimeout(function(){t.style.display='none';},3000);
  }

  function _esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

  document.addEventListener('keydown',function(e){
    if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){if(document.getElementById('__t_modal_wrap').style.display!=='none')__tSave();}
    if(e.key==='Escape'){if(document.getElementById('__t_modal_wrap').style.display!=='none')__tCloseModal();}
  });
})();
</script>`;
}
