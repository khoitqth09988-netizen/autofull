(() => {
  // ============================================================
  // PART 1: SHIELD (idempotent, cài trước để bảo vệ #ta)
  // ============================================================
  if (!window.__shieldState) window.__shieldState = { on: true };
  if (!window.__shieldToggle) {
    window.__shieldToggle = (v) => {
      window.__shieldState.on = !!v;
      try {
        if (window.__shieldState.on && typeof ta !== 'undefined' && ta && typeof OKV !== 'undefined') ta.value = OKV;
      } catch (e) {}
      return window.__shieldState.on;
    };
  }

  if (!window.__shieldV2Installed) {
    window.__shieldV2Installed = true;

    const norm = v => v.replace(/\n/g, ' ').replace(/^\s+/, '').replace(/\s{2,}/g, ' ');
    const isTa = (e) => e.target && e.target.id === 'ta';
    const isModifierKey = (e) => ['Alt','Control','Meta','Shift'].includes(e.key);
    const hasModifier = (e) => e.altKey || e.ctrlKey || e.metaKey;

    // FIX: cho modifier keydown + mọi keydown có modifier đi qua (Alt+X hoạt động)
    document.addEventListener('keydown', (e) => {
      if (!window.__shieldState.on || !isTa(e)) return;
      if (isModifierKey(e) || hasModifier(e)) return;
      e.preventDefault();
      e.stopPropagation();
    }, true);

    ['beforeinput','keypress','paste','drop','compositionstart','compositionupdate','compositionend']
      .forEach(ev => {
        document.addEventListener(ev, (e) => {
          if (!window.__shieldState.on || !isTa(e)) return;
          e.preventDefault();
          e.stopPropagation();
        }, true);
      });

    // Fallback 1: input event - restore ngay nếu user lọt chữ vào
    document.addEventListener('input', (e) => {
      if (!window.__shieldState.on || !isTa(e)) return;
      e.stopPropagation();
      try {
        if (typeof ta !== 'undefined' && ta && typeof OKV !== 'undefined') {
          if (norm(ta.value) !== OKV) ta.value = OKV;
        }
      } catch (err) {}
    }, true);

    // Fallback 2: compositionend rAF - restore sau 1 frame cho IME lạ
    document.addEventListener('compositionend', (e) => {
      if (!window.__shieldState.on || !isTa(e)) return;
      setTimeout(() => {
        try {
          if (typeof ta !== 'undefined' && ta && typeof OKV !== 'undefined') {
            if (norm(ta.value) !== OKV) ta.value = OKV;
          }
        } catch (err) {}
      }, 0);
    }, true);

    console.log('%c[shield v2] ✅ Cài đặt. Alt+X không bị chặn.', 'color:#22c55e;font-weight:bold');
  }

  // ============================================================
  // PART 2: EXTRA SHORTCUTS (idempotent, dự phòng nếu Alt+X fail)
  // ============================================================
  if (!window.__hudShortcutExtra) {
    window.__hudShortcutExtra = true;
    const toggleHud = (why) => {
      const hud = document.getElementById('__hud');
      if (!hud) return;
      hud.style.display = hud.style.display === 'none' ? 'block' : 'none';
      console.log('[shortcut]', why, '→', hud.style.display);
    };
    document.addEventListener('keydown', (e) => {
      const t = e.target;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && t.id !== 'ta') return;
      if (e.key === 'F8') { e.preventDefault(); e.stopPropagation(); toggleHud('F8'); return; }
      if (e.ctrlKey && e.shiftKey && (e.key === 'X' || e.key === 'x')) {
        e.preventDefault(); e.stopPropagation(); toggleHud('Ctrl+Shift+X'); return;
      }
      if (e.ctrlKey && e.shiftKey && (e.key === 'H' || e.key === 'h')) {
        e.preventDefault(); e.stopPropagation(); toggleHud('Ctrl+Shift+H'); return;
      }
    }, true);
    console.log('%c[shortcut] Dự phòng: F8 · Ctrl+Shift+X · Ctrl+Shift+H', 'color:#38bdf8;font-weight:bold');
  }

  // ============================================================
  // PART 3: HUD (toggle nếu đã cài)
  // ============================================================
  const HUD_ID = '__hud';
  if (document.getElementById(HUD_ID)) {
    const e = document.getElementById(HUD_ID);
    e.style.display = e.style.display === 'none' ? 'block' : 'none';
    return;
  }

  // ===== Tab identity & role =====
  let tabId = sessionStorage.getItem('hud_tabId');
  if (!tabId) { tabId = Math.random().toString(36).slice(2, 10); sessionStorage.setItem('hud_tabId', tabId); }
  let role = sessionStorage.getItem('hud_role') || 'main';

  let bc = null;
  try { bc = new BroadcastChannel('typing_hud_v9'); } catch (e) {}
  const post = (m) => { if (bc) try { bc.postMessage(Object.assign({ from: tabId }, m)); } catch (e) {} };

  const MODES = {
    safe:     { typo: 0.005, dia: 0.15, wrongDia: 0.02,  targetWpm: 115 },
    balanced: { typo: 0.003, dia: 0.10, wrongDia: 0.01,  targetWpm: 125 },
    max:      { typo: 0.002, dia: 0.08, wrongDia: 0.005, targetWpm: 135 }
  };

  const workers = {};
  let farmRunning = false;
  let farmConfig = null;
  let autoOn = false;
  let autoBusy = false;
  let localConfig = null;
  let lastJoinAt = 0;
  let failCount = 0;

  // ===== CSS =====
  const style = document.createElement('style');
  style.id = '__hud_style';
  style.textContent = `
    #__hud{position:fixed;top:20px;right:20px;width:380px;max-height:92vh;overflow-y:auto;
      background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:10px;
      font:13px/1.4 ui-monospace,Menlo,monospace;z-index:999999;
      box-shadow:0 10px 40px rgba(0,0,0,.6);display:none}
    #__hud .hud-h{padding:8px 10px;background:#1e293b;cursor:move;display:flex;
      justify-content:space-between;align-items:center;border-bottom:1px solid #334155;
      font-weight:700;border-radius:10px 10px 0 0;user-select:none;font-size:12px}
    #__hud .hud-body{padding:8px}
    #__hud .hud-tabs{display:flex;gap:4px;margin-bottom:8px}
    #__hud .hud-tabs button{flex:1;padding:6px;font-size:11px;background:#1e293b;
      border:1px solid #334155;border-radius:4px;color:#94a3b8;cursor:pointer;font:inherit}
    #__hud .hud-tabs button.active{background:#334155;color:#38bdf8;border-color:#38bdf8}
    #__hud .hud-page{display:none}
    #__hud .hud-page.active{display:block}
    #__hud .hud-sec{border:1px solid #1e293b;border-radius:6px;margin-bottom:8px;padding:8px;background:#0b1220}
    #__hud .hud-sec h4{margin:0 0 6px;font-size:11px;text-transform:uppercase;color:#64748b;
      letter-spacing:.5px;font-weight:600}
    #__hud button{width:100%;padding:6px 8px;margin:3px 0;background:#334155;color:#e2e8f0;
      border:1px solid #475569;border-radius:4px;cursor:pointer;font:inherit;transition:background .15s}
    #__hud button:hover:not(:disabled){background:#475569}
    #__hud button:disabled{opacity:.4;cursor:not-allowed}
    #__hud button.go{background:#15803d;border-color:#166534}
    #__hud button.go:hover:not(:disabled){background:#16a34a}
    #__hud button.stop{background:#7f1d1d;border-color:#991b1b}
    #__hud button.stop:hover:not(:disabled){background:#b91c1c}
    #__hud button.warn{background:#78350f;border-color:#92400e}
    #__hud button.mini{width:auto;padding:2px 8px;margin:0;font-size:11px}
    #__hud select,#__hud input,#__hud textarea{width:100%;background:#1e293b;border:1px solid #334155;
      color:#e2e8f0;padding:6px 8px;border-radius:4px;font:inherit;margin-bottom:6px}
    #__hud textarea{resize:vertical;min-height:50px;font-family:inherit}
    #__hud .st{display:flex;justify-content:space-between;margin:2px 0;font-size:11px;color:#94a3b8}
    #__hud .st b{color:#38bdf8;font-weight:600}
    #__hud .st b.ok{color:#22c55e}
    #__hud .st b.bad{color:#ef4444}
    #__hud .st b.warn{color:#fbbf24}
    #__hud #__hud_log{background:#020617;border-radius:4px;padding:6px;max-height:140px;
      overflow-y:auto;font-size:10px;color:#64748b;white-space:pre-wrap;font-family:inherit}
    #__hud .row2{display:grid;grid-template-columns:1fr 1fr;gap:4px}
    #__hud .row2 button{margin:0}
    #__hud .hint{font-size:10px;color:#475569;margin-top:4px;text-align:center}
    #__hud .hud-close{cursor:pointer;color:#64748b;font-size:16px;padding:0 4px;line-height:1}
    #__hud .hud-close:hover{color:#ef4444}
    #__hud .role-badge{display:inline-block;padding:1px 6px;border-radius:3px;font-size:10px;
      background:#1e293b;color:#94a3b8;margin-left:4px}
    #__hud .role-badge.main{background:#1e40af;color:#93c5fd}
    #__hud .role-badge.worker{background:#78350f;color:#fbbf24}
    #__hud .wk{padding:6px;background:#0b1220;border:1px solid #1e293b;border-radius:4px;
      margin-bottom:4px;font-size:11px}
    #__hud .wk .nm{color:#38bdf8;font-weight:600}
    #__hud .wk.online{border-color:#166534}
    #__hud .wk.offline{opacity:.5}
    #__hud .barc{background:#1e293b;border-radius:3px;height:5px;overflow:hidden;margin-top:3px}
    #__hud .barc i{display:block;height:100%;background:#38bdf8;transition:width .2s}
    #__hud .note{color:#475569;font-size:10px;line-height:1.35;margin-top:4px}
    #__hud .shield-row{display:flex;justify-content:space-between;align-items:center;
      font-size:12px;color:#94a3b8;padding:4px 0}
    #__hud .shield-row input[type=checkbox]{width:auto;margin:0;transform:scale(1.3);cursor:pointer}
    #__hud .shield-badge{display:inline-block;padding:1px 6px;border-radius:3px;
      font-size:10px;margin-left:6px}
    #__hud .shield-badge.on{background:#166534;color:#22c55e}
    #__hud .shield-badge.off{background:#7f1d1d;color:#ef4444}
  `;
  document.head.appendChild(style);

  // ===== HTML =====
  const el = document.createElement('div');
  el.id = HUD_ID;
  el.innerHTML = `
    <div class="hud-h">
      <span>🛠 FARM v9 <span class="role-badge" id="__hud_rolebadge">MAIN</span>
        <span class="shield-badge on" id="__hud_shieldbadge">SHIELD</span>
      </span>
      <span>
        <button class="mini" id="__hud_switch">Worker</button>
        <span class="hud-close" id="__hud_close">✕</span>
      </span>
    </div>
    <div class="hud-body">
      <div class="hud-tabs">
        <button data-tab="this" class="active">This Tab</button>
        <button data-tab="farm">Farm</button>
        <button data-tab="workers">Workers <span id="__hud_wcount">0</span></button>
      </div>

      <div class="hud-page active" data-page="this">
        <div class="hud-sec">
          <h4>Trạng thái tab này</h4>
          <div class="st"><span>view</span><b id="__hud_view">–</b></div>
          <div class="st"><span>status</span><b id="__hud_status">–</b></div>
          <div class="st"><span>Tiến độ</span><b id="__hud_len">–</b></div>
          <div class="barc"><i id="__hud_pbar" style="width:0%"></i></div>
          <div class="st" style="margin-top:4px"><span>WPM / Acc</span><b id="__hud_wpm">–</b></div>
          <div class="st"><span>CV nhịp</span><b id="__hud_cv">–</b></div>
          <div class="st"><span>CHEAT</span><b id="__hud_cheat">–</b></div>
        </div>
        <div class="hud-sec">
          <h4>🛡 Bảo vệ ô thi</h4>
          <div class="shield-row">
            <span>Chặn gõ thật vào ô thi</span>
            <input type="checkbox" id="__hud_shield" checked>
          </div>
          <p class="note">Bật: user gõ vào ô thi KHÔNG vào được — chỉ bot điền. Modifier keys (Alt/Ctrl) vẫn hoạt động để dùng shortcut. Test: focus ô thi → bấm phím bất kỳ → chữ không hiện = OK.</p>
        </div>
        <div class="hud-sec">
          <h4>Farm local (tab này)</h4>
          <select id="__hud_ltype">
            <option value="solo">Thi một mình</option>
            <option value="duel">Đối kháng</option>
            <option value="class">Theo lớp</option>
          </select>
          <select id="__hud_ltime">
            <option value="1">1 phút</option><option value="2">2 phút</option>
            <option value="3">3 phút</option><option value="4">4 phút</option>
            <option value="5">5 phút</option>
          </select>
          <select id="__hud_lmode">
            <option value="safe">An toàn · 115 WPM</option>
            <option value="balanced" selected>Cân bằng · 125 WPM ⭐</option>
            <option value="max">Tối đa · 135 WPM</option>
          </select>
          <input id="__hud_lcode" placeholder="Mã lớp (nếu class)" style="display:none">
          <input id="__hud_lpass" placeholder="Mật khẩu lớp" style="display:none" type="password">
          <div class="row2" style="margin-top:6px">
            <button class="go" id="__hud_lstart">▶ Bật</button>
            <button class="stop" id="__hud_lstop" disabled>■ Tắt</button>
          </div>
          <p class="note">Dùng account LS của tab này (tp_name/tp_mssv).</p>
        </div>
        <div class="hud-sec">
          <h4>Log <span style="color:#475569;font-size:10px">(console clear 7s)</span></h4>
          <div id="__hud_log">Sẵn sàng. Alt+X / F8 để ẩn-hiện.</div>
        </div>
      </div>

      <div class="hud-page" data-page="farm">
        <div class="hud-sec">
          <h4>Điều khiển Workers</h4>
          <select id="__hud_ftype">
            <option value="solo">Solo</option>
            <option value="duel">Duel (chia cặp)</option>
            <option value="class">Class</option>
          </select>
          <select id="__hud_ftime">
            <option value="1">1 phút</option><option value="2">2 phút</option>
            <option value="3">3 phút</option><option value="4">4 phút</option>
            <option value="5">5 phút</option>
          </select>
          <select id="__hud_fmode">
            <option value="safe">An toàn · 115 WPM</option>
            <option value="balanced" selected>Cân bằng · 125 WPM ⭐</option>
            <option value="max">Tối đa · 135 WPM</option>
          </select>
          <input id="__hud_fcode" placeholder="Mã lớp (class)" style="display:none">
          <input id="__hud_fpass" placeholder="Mật khẩu lớp" style="display:none" type="password">
          <input id="__hud_fprefix" placeholder="Room prefix" value="pair" style="display:none">
          <h4 style="margin-top:6px">Accounts (Name|MSSV mỗi dòng)</h4>
          <textarea id="__hud_faccounts" placeholder="Nguyễn Văn A|TH001&#10;Trần Thị B|TH002"></textarea>
          <p class="note">Để trống = mỗi worker dùng LS của tab đó (cần profile riêng). Điền đủ để tránh trùng MSSV.</p>
          <div class="row2" style="margin-top:6px">
            <button class="go" id="__hud_fstart">▶ Start Farm</button>
            <button class="stop" id="__hud_fstop" disabled>■ Stop</button>
          </div>
        </div>
        <div class="hud-sec">
          <h4>Status Farm</h4>
          <div class="st"><span>Running</span><b id="__hud_fstatus">OFF</b></div>
          <div class="st"><span>Info</span><b id="__hud_finfo">–</b></div>
          <div class="st"><span>Workers</span><b id="__hud_fworkers">0</b></div>
        </div>
      </div>

      <div class="hud-page" data-page="workers">
        <div class="hud-sec">
          <h4>Tab online</h4>
          <div id="__hud_wlist" style="max-height:320px;overflow-y:auto">Chưa có worker.</div>
        </div>
        <div class="hud-sec">
          <h4>Hướng dẫn</h4>
          <p class="note">
            1. Mở N tab cùng domain<br>
            2. Mỗi tab: paste script<br>
            3. Tab chính: giữ MAIN. Tab phụ: bấm nút <b>Worker</b><br>
            4. Tab chính → tab <b>Farm</b> → điền accounts → <b>Start Farm</b><br>
            5. Worker tự join → gõ → xong → rejoin
          </p>
        </div>
      </div>

      <div class="hint">Alt+X / F8 / Ctrl+Shift+X · kéo header để di chuyển</div>
    </div>
  `;
  document.body.appendChild(el);

  const clearInt = setInterval(() => { try { console.clear(); } catch (_) {} }, 7000);
  const $ = id => document.getElementById(id);
  const log = (msg) => {
    const box = $('__hud_log'); if (!box) return;
    box.textContent = `[${new Date().toLocaleTimeString('vi-VN')}] ${msg}\n` + box.textContent;
    const ls = box.textContent.split('\n');
    if (ls.length > 26) box.textContent = ls.slice(0, 26).join('\n');
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm = v => v.replace(/\n/g, ' ').replace(/^\s+/, '').replace(/\s{2,}/g, ' ');
  const ready = () => typeof S !== 'undefined' && typeof tx === 'function'
                   && typeof paint === 'function' && typeof TL !== 'undefined'
                   && typeof OKV !== 'undefined';

  const getStatusStr = () => {
    if (!ready()) return 'idle';
    if (typeof S !== 'undefined' && S) {
      if (S.status === 'running') return `running ${Math.round((OKV.length / Math.max(1, S.text?.length)) * 100)}%`;
      return S.status || (typeof view !== 'undefined' ? view : '?');
    }
    return (typeof view !== 'undefined' ? view : 'home');
  };
  const getAccount = () => ({
    name: sessionStorage.getItem('hud_name') || LS.get('tp_name') || '',
    mssv: sessionStorage.getItem('hud_mssv') || LS.get('tp_mssv') || ''
  });

  const send = (txt, keys = 1) => {
    if (typeof ta === 'undefined' || !ta) return;
    const n = norm(txt);
    if (n === OKV) return;
    ta.value = n; OKV = n;
    if (typeof S !== 'undefined' && S && S.cls) cval = n;
    const now = performance.now();
    TL.kd += keys;
    if (TL.last) {
      const d = now - TL.last;
      if (d < 2000) { TL.n++; const dl = d - TL.mean; TL.mean += dl / TL.n; TL.m2 += dl * (d - TL.mean); }
    }
    TL.last = now;
    tx({ t: 'typed', text: n, tl: {
      kd: TL.kd,
      sd: TL.n > 5 ? Math.round(Math.sqrt(TL.m2 / (TL.n - 1)) * 10) / 10 : -1,
      sy: TL.sy, bl: TL.bl, wd: navigator.webdriver ? 1 : 0
    }});
    paint();
  };

  // ===== Char tables =====
  const NEAR = { a:'s',b:'v',c:'x',d:'f',e:'r',f:'d',g:'h',h:'g',i:'u',j:'k',k:'j',
    l:'k',m:'n',n:'m',o:'p',p:'o',q:'w',r:'e',s:'a',t:'y',u:'i',v:'b',w:'q',x:'c',y:'t',z:'x' };
  const nearKey = ch => { const m = NEAR[ch.toLowerCase()] || 'x'; return ch === ch.toUpperCase() ? m.toUpperCase() : m; };
  const FAMILIES = ['aàáảãạ','ăằắẳẵặ','âầấẩẫậ','eèéẻẽẹ','êềếểễệ','iìíỉĩị',
                    'oòóỏõọ','ôồốổỗộ','ơờớởỡợ','uùúủũụ','ưừứửữự','yỳýỷỹỵ'];
  const familyOf = ch => { const lo = ch.toLowerCase(); for (const f of FAMILIES) if (f.includes(lo)) return f; return null; };
  const wrongDia = ch => {
    const fam = familyOf(ch); if (!fam) return null;
    const lo = ch.toLowerCase(); const o = [...fam].filter(c => c !== lo);
    if (!o.length) return null;
    const pick = o[Math.floor(Math.random() * o.length)];
    return ch === ch.toUpperCase() ? pick.toUpperCase() : pick;
  };
  const BASE = { 'à':'a','á':'a','ả':'a','ã':'a','ạ':'a','ă':'a','ằ':'a','ắ':'a','ẳ':'a','ẵ':'a','ặ':'a',
    'â':'a','ầ':'a','ấ':'a','ẩ':'a','ẫ':'a','ậ':'a','è':'e','é':'e','ẻ':'e','ẽ':'e','ẹ':'e',
    'ê':'e','ề':'e','ế':'e','ể':'e','ễ':'e','ệ':'e','ì':'i','í':'i','ỉ':'i','ĩ':'i','ị':'i',
    'ò':'o','ó':'o','ỏ':'o','õ':'o','ọ':'o','ô':'o','ồ':'o','ố':'o','ổ':'o','ỗ':'o','ộ':'o',
    'ơ':'o','ờ':'o','ớ':'o','ở':'o','ỡ':'o','ợ':'o','ù':'u','ú':'u','ủ':'u','ũ':'u','ụ':'u',
    'ư':'u','ừ':'u','ứ':'u','ử':'u','ữ':'u','ự':'u','ỳ':'y','ý':'y','ỷ':'y','ỹ':'y','ỵ':'y','đ':'d' };
  const getBase = ch => { const b = BASE[ch.toLowerCase()]; if (!b) return null; return ch === ch.toUpperCase() ? b.toUpperCase() : b; };

  // ===== Shield UI binding =====
  const shieldCheckbox = $('__hud_shield');
  const shieldBadge = $('__hud_shieldbadge');
  const syncShieldUI = () => {
    const on = window.__shieldState.on;
    if (shieldCheckbox) shieldCheckbox.checked = on;
    if (shieldBadge) { shieldBadge.textContent = on ? 'SHIELD' : 'NO-SHIELD'; shieldBadge.className = 'shield-badge ' + (on ? 'on' : 'off'); }
  };
  if (shieldCheckbox) {
    shieldCheckbox.checked = window.__shieldState.on;
    shieldCheckbox.onchange = () => {
      window.__shieldToggle(shieldCheckbox.checked);
      syncShieldUI();
      log('Shield: ' + (window.__shieldState.on ? 'ON' : 'OFF'));
    };
  }
  syncShieldUI();

  // ===== Core typing =====
  async function runTypingSession(cfg) {
    const modeCfg = MODES[cfg.mode] || MODES.balanced;
    const target = S.text;
    const targetLen = target.length;
    const durSec = (S.dur || 2) * 60;
    const overhead = 1 + 2.4 * modeCfg.typo + 1.02 * modeCfg.dia + 2 * modeCfg.dia * modeCfg.wrongDia;
    const meanDelayMs = 12000 / (overhead * modeCfg.targetWpm);
    const expectedFinishSec = (targetLen * overhead * meanDelayMs) / 1000;
    const expectedRatio = expectedFinishSec / durSec;

    log(`▶ ${cfg.mode} ${modeCfg.targetWpm}WPM · ${targetLen}c/${durSec}s · mean ${meanDelayMs.toFixed(0)}ms · finish ${(expectedRatio*100).toFixed(0)}%`);
    if (expectedRatio < 0.85) log(`⚠ Finish sớm → cần cpm ≥ ${modeCfg.targetWpm * 5} trong admin`);

    const me = S.me;
    TL.kd = 0; TL.n = 0; TL.mean = 0; TL.m2 = 0;
    TL.sy = 0; TL.bl = 0; TL.last = 0; TL.lb = 0;
    ta.value = ''; OKV = '';

    let i = 0, buffer = '';
    while (i < targetLen) {
      const isActive = autoOn || (role === 'worker' && farmRunning);
      if (!isActive) break;
      if (!S || S.status !== 'running' || CHEAT || S.players?.[me]?.done) break;

      const r = Math.random();
      let d;
      if (r < 0.20)        d = meanDelayMs * (0.25 + Math.random() * 0.15);
      else if (r < 0.40)   d = meanDelayMs * (0.50 + Math.random() * 0.20);
      else if (r < 0.60)   d = meanDelayMs * (0.80 + Math.random() * 0.20);
      else if (r < 0.80)   d = meanDelayMs * (1.10 + Math.random() * 0.30);
      else                 d = meanDelayMs * (1.60 + Math.random() * 0.50);
      d = Math.max(20, Math.min(2000, d));

      const ch = target[i];
      const base = getBase(ch);

      if (Math.random() < modeCfg.typo && /[a-zA-Z]/.test(ch)) {
        await sleep(d);
        send(buffer + nearKey(ch), 1);
        await sleep(60 + Math.random() * 100);
        send(buffer, 1);
        await sleep(60 + Math.random() * 100 + d * 0.7);
        send(buffer + ch, 1);
      } else if (base && Math.random() < modeCfg.dia) {
        await sleep(d);
        send(buffer + base, 1);
        await sleep(70 + Math.random() * 110);
        if (Math.random() < modeCfg.wrongDia) {
          const w = wrongDia(ch);
          if (w) {
            send(buffer + w, 1);
            await sleep(150 + Math.random() * 250);
            send(buffer + base, 1);
            await sleep(70 + Math.random() * 110);
          }
        }
        send(buffer + ch, 1);
      } else {
        await sleep(d);
        send(buffer + ch, 1);
      }
      buffer += ch; i++;
    }
    const dur = (performance.now() - S.t0) / 1000;
    log(`✔ ${i}/${targetLen} · ${(dur/durSec*100).toFixed(0)}% dur · kd/len=${(TL.kd/Math.max(1,i)).toFixed(2)}`);
  }

  // ===== Auto loop =====
  setInterval(async () => {
    if (autoBusy) return;
    const isActive = autoOn || (role === 'worker' && farmRunning);
    if (!isActive) return;
    const cfg = autoOn ? localConfig : farmConfig;
    if (!cfg) return;

    const me = (typeof S !== 'undefined' && S) ? S.me : null;
    const cheated = (typeof CHEAT !== 'undefined' && CHEAT)
                 || (S && S.players && me != null && S.players[me]?.cheat);
    if (cheated) {
      log('🚩 CHEAT: ' + ((typeof CHEAT !== 'undefined' && CHEAT) || S?.players?.[me]?.cheat));
      if (autoOn) setLocalOn(false);
      if (role === 'worker' && farmRunning) farmRunning = false;
      return;
    }

    if (S && S.status === 'running' && view === 'game' && ta) {
      autoBusy = true;
      try { await runTypingSession(cfg); } finally { autoBusy = false; }
      return;
    }
    if (S && S.status === 'finished') {
      autoBusy = true;
      try {
        log('Xong — 3s rejoin');
        await sleep(3000);
        if (!(autoOn || (role === 'worker' && farmRunning))) return;
        leave();
        await sleep(1200);
      } finally { autoBusy = false; }
      return;
    }
    if (S && (S.status === 'waiting' || S.status === 'countdown')) return;

    if (!S && (view === 'home' || view === 'wait') && Date.now() - lastJoinAt > 3500) {
      const acc = getAccount();
      if (!acc.name || acc.name.length < 2 || !/^[A-Z0-9]{5,15}$/.test(acc.mssv)) {
        log('⚠ Thiếu account'); 
        if (autoOn) setLocalOn(false);
        if (role === 'worker') farmRunning = false;
        return;
      }
      lastJoinAt = Date.now();
      log(`Join ${cfg.type} · ${acc.name}(${acc.mssv})`);
      if (cfg.type === 'solo') tx({ t: 'join', name: acc.name, mssv: acc.mssv, code: '', solo: true, dur: cfg.dur });
      else if (cfg.type === 'duel') tx({ t: 'join', name: acc.name, mssv: acc.mssv, code: cfg.roomCode || '', solo: false, dur: cfg.dur });
      else if (cfg.type === 'class') {
        if (!cfg.classCode || !cfg.classPass) { log('⚠ Class thiếu mã/pass'); farmRunning = false; return; }
        tx({ t: 'joinclass', name: acc.name, mssv: acc.mssv, code: cfg.classCode, password: cfg.classPass });
      }
      setTimeout(() => {
        if (!(autoOn || (role === 'worker' && farmRunning))) return;
        if (typeof S !== 'undefined' && S) failCount = 0;
        else { failCount++; log(`Join fail (${failCount}/3)`);
          if (failCount >= 3) { if (autoOn) setLocalOn(false); if (role === 'worker') farmRunning = false; }
        }
      }, 4000);
    }
  }, 700);

  // ===== Local controls =====
  const setLocalOn = (on) => {
    autoOn = on;
    $('__hud_lstart').disabled = on;
    $('__hud_lstop').disabled = !on;
    log(on ? 'Local ON · ' + $('__hud_lmode').value : 'Local OFF');
  };
  $('__hud_lstart').onclick = () => {
    if (!ready()) { log('Chưa sẵn sàng'); return; }
    const acc = getAccount();
    if (!acc.name || acc.name.length < 2) { log('Thiếu họ tên'); return; }
    if (!/^[A-Z0-9]{5,15}$/.test(acc.mssv)) { log('MSSV không hợp lệ'); return; }
    localConfig = {
      type: $('__hud_ltype').value,
      dur: +$('__hud_ltime').value,
      mode: $('__hud_lmode').value,
      classCode: $('__hud_lcode').value,
      classPass: $('__hud_lpass').value
    };
    failCount = 0;
    setLocalOn(true);
  };
  $('__hud_lstop').onclick = () => setLocalOn(false);
  $('__hud_ltype').onchange = () => {
    const isCls = $('__hud_ltype').value === 'class';
    $('__hud_lcode').style.display = isCls ? '' : 'none';
    $('__hud_lpass').style.display = isCls ? '' : 'none';
  };

  // ===== Farm controls =====
  const setFarmOn = (on) => {
    farmRunning = on;
    $('__hud_fstart').disabled = on;
    $('__hud_fstop').disabled = !on;
    $('__hud_fstatus').textContent = on ? 'ON' : 'OFF';
    $('__hud_fstatus').className = on ? 'ok' : 'bad';
  };
  $('__hud_fstart').onclick = () => {
    if (!bc) { log('BroadcastChannel không hỗ trợ'); return; }
    const online = Object.keys(workers).filter(id => workers[id].lastBeat && Date.now() - workers[id].lastBeat < 8000 && workers[id].role === 'worker');
    if (!online.length) { log('Không có worker — mở tab khác, bấm Worker'); return; }
    const type = $('__hud_ftype').value;
    const dur = +$('__hud_ftime').value;
    const mode = $('__hud_fmode').value;
    const classCode = $('__hud_fcode').value;
    const classPass = $('__hud_fpass').value;
    const roomPrefix = $('__hud_fprefix').value || 'pair';
    const accountsRaw = $('__hud_faccounts').value.trim();
    const accounts = accountsRaw
      ? accountsRaw.split('\n').map(s => s.trim()).filter(Boolean).map(s => {
          const [n, m] = s.split('|').map(x => (x || '').trim());
          return { name: n, mssv: (m || '').toUpperCase() };
        })
      : [];
    if (type === 'duel' && online.length % 2 !== 0) log(`⚠ Duel cần chẵn (hiện ${online.length}) — bỏ cuối`);
    if (type === 'class' && (!classCode || !classPass)) { log('⚠ Class cần mã + pass'); return; }

    const sorted = online.sort();
    const limit = type === 'duel' ? sorted.length - (sorted.length % 2) : sorted.length;
    sorted.slice(0, limit).forEach((wid, i) => {
      const acc = accounts[i] || null;
      const roomCode = type === 'duel' ? `${roomPrefix}-${Math.floor(i / 2)}` : '';
      post({ type: 'cmd', to: wid, cmd: 'start', payload: { account: acc, config: { type, dur, mode, classCode, classPass, roomCode } } });
    });
    farmConfig = { type, dur, mode };
    $('__hud_finfo').textContent = `${type} · ${dur}p · ${mode}`;
    setFarmOn(true);
    log(`▶ Farm ${type} → ${limit} worker`);
  };
  $('__hud_fstop').onclick = () => {
    post({ type: 'cmd', to: '*', cmd: 'stop' });
    setFarmOn(false);
    log('■ Stop Farm');
  };
  $('__hud_ftype').onchange = () => {
    const t = $('__hud_ftype').value;
    $('__hud_fcode').style.display = t === 'class' ? '' : 'none';
    $('__hud_fpass').style.display = t === 'class' ? '' : 'none';
    $('__hud_fprefix').style.display = t === 'duel' ? '' : 'none';
  };

  // ===== Broadcast =====
  if (bc) bc.onmessage = (e) => {
    const m = e.data;
    if (!m || m.from === tabId) return;
    if (m.type === 'hello') {
      log(`📥 Tab ${m.from.slice(0,6)} (${m.role})`);
      post({ type: 'beat', role, status: getStatusStr(), name: getAccount().name });
    }
    if (m.type === 'beat') {
      workers[m.from] = { lastBeat: Date.now(), role: m.role, status: m.status, name: m.name || '' };
      renderWorkers();
    }
    if (m.type === 'cmd' && (m.to === tabId || m.to === '*')) {
      if (m.cmd === 'start' && role === 'worker') {
        const p = m.payload || {};
        if (p.account && p.account.name && p.account.mssv) {
          sessionStorage.setItem('hud_name', p.account.name);
          sessionStorage.setItem('hud_mssv', p.account.mssv);
        }
        farmConfig = p.config;
        failCount = 0;
        farmRunning = true;
        log(`📥 Farm: ${p.config?.type} ${p.config?.dur}p · acc=${p.account?.name || 'LS'}`);
      }
      if (m.cmd === 'stop' && role === 'worker') { farmRunning = false; log('📥 Stop'); }
    }
  };

  setInterval(() => {
    post({ type: 'beat', role, status: getStatusStr(), name: getAccount().name });
    const now = Date.now(); let dirty = false;
    for (const id in workers) { if (now - workers[id].lastBeat > 8000) { delete workers[id]; dirty = true; } }
    if (dirty) renderWorkers();
  }, 2000);

  // ===== UI =====
  const updateHud = () => {
    if (el.style.display === 'none') return;
    $('__hud_view').textContent = typeof view !== 'undefined' ? view : '–';
    const st = (typeof S !== 'undefined' && S) ? S.status : '–';
    $('__hud_status').textContent = st;
    $('__hud_status').className = st === 'running' ? 'ok' : (st === '–' ? '' : 'bad');
    const len = (typeof S !== 'undefined' && S && S.text) ? S.text.length : 0;
    const pos = (typeof OKV !== 'undefined' && OKV) ? OKV.length : 0;
    $('__hud_len').textContent = len ? `${pos}/${len}` : '–';
    $('__hud_pbar').style.width = ((len ? pos / len : 0) * 100).toFixed(1) + '%';
    const me = (typeof S !== 'undefined' && S) ? S.me : null;
    const p = (me != null && S && S.players) ? S.players[me] : null;
    if (p && p.wpm != null) {
      const w = Math.round(p.wpm);
      $('__hud_wpm').textContent = `${w} WPM · ${p.acc ?? '?'}%`;
      $('__hud_wpm').className = w > 145 ? 'bad' : (w > 130 ? 'warn' : 'ok');
    } else $('__hud_wpm').textContent = '–';
    const ce = $('__hud_cv');
    if (typeof TL !== 'undefined' && TL.n > 10) {
      const sd = Math.sqrt(TL.m2 / (TL.n - 1));
      const cv = TL.mean > 0 ? sd / TL.mean * 100 : 0;
      ce.textContent = `${cv.toFixed(0)}% (${TL.mean.toFixed(0)}ms)`;
      ce.className = cv > 30 ? 'ok' : (cv > 18 ? 'warn' : 'bad');
    } else ce.textContent = '–';
    const cheat = (typeof CHEAT !== 'undefined' && CHEAT) || (p && p.cheat) || '';
    $('__hud_cheat').textContent = cheat || '(trống)';
    $('__hud_cheat').className = cheat ? 'bad' : 'ok';
  };
  setInterval(updateHud, 300);

  const renderWorkers = () => {
    const list = $('__hud_wlist'); if (!list) return;
    const ids = Object.keys(workers).filter(id => id !== tabId);
    $('__hud_wcount').textContent = String(ids.length);
    $('__hud_fworkers').textContent = String(ids.filter(id => workers[id].role === 'worker' && Date.now() - workers[id].lastBeat < 8000).length);
    if (!ids.length) { list.innerHTML = '<div class="note">Chưa có tab khác.</div>'; return; }
    list.innerHTML = ids.sort().map(id => {
      const w = workers[id];
      const online = Date.now() - w.lastBeat < 8000;
      return `<div class="wk ${online ? 'online' : 'offline'}">
        <div><span class="nm">${(w.name || 'Tab ' + id.slice(0, 6)).replace(/[<>&]/g, '')}</span>
        <span style="color:#475569"> · ${id.slice(0, 6)} · ${w.role}</span></div>
        <div style="color:#94a3b8">${w.status || 'idle'}${online ? '' : ' · offline'}</div>
      </div>`;
    }).join('');
  };

  const renderRoleUI = () => {
    const badge = $('__hud_rolebadge');
    badge.textContent = role.toUpperCase();
    badge.className = 'role-badge ' + role;
    $('__hud_switch').textContent = role === 'main' ? 'Worker' : 'Main';
    document.querySelectorAll('#__hud .hud-tabs button').forEach(b => {
      if (b.dataset.tab === 'farm') b.style.display = role === 'main' ? '' : 'none';
    });
  };

  $('__hud_switch').onclick = () => {
    role = role === 'main' ? 'worker' : 'main';
    sessionStorage.setItem('hud_role', role);
    log('Role → ' + role.toUpperCase());
    renderRoleUI();
    post({ type: 'hello', role });
  };

  document.querySelectorAll('#__hud .hud-tabs button').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('#__hud .hud-tabs button').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('#__hud .hud-page').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.querySelector(`#__hud .hud-page[data-page="${btn.dataset.tab}"]`)?.classList.add('active');
    };
  });

  // ===== Toggle / drag / destroy =====
  let visible = true; el.style.display = 'block';
  const toggle = () => { visible = !visible; el.style.display = visible ? 'block' : 'none'; };
  // Alt+X (shield đã cho modifier qua)
  document.addEventListener('keydown', e => {
    if (e.altKey && (e.key === 'x' || e.key === 'X')) { e.preventDefault(); e.stopPropagation(); toggle(); }
  }, true);
  $('__hud_close').onclick = toggle;
  let drag = null;
  el.querySelector('.hud-h').addEventListener('mousedown', e => {
    if (e.target.id === '__hud_close' || e.target.id === '__hud_switch') return;
    drag = { x: e.clientX - el.offsetLeft, y: e.clientY - el.offsetTop };
  });
  document.addEventListener('mousemove', e => {
    if (!drag) return;
    el.style.left = (e.clientX - drag.x) + 'px';
    el.style.top = (e.clientY - drag.y) + 'px';
    el.style.right = 'auto';
  });
  document.addEventListener('mouseup', () => { drag = null; });

  renderRoleUI();
  post({ type: 'hello', role });
  renderWorkers();
  log(`Role: ${role.toUpperCase()} · Tab: ${tabId} · Shield: ${window.__shieldState.on ? 'ON' : 'OFF'}`);
  console.log('%c[HUD v9] Full integrated. Alt+X / F8 / Ctrl+Shift+X để toggle.', 'color:#38bdf8;font-weight:bold;font-size:13px');
})();
