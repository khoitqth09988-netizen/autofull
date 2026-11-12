// ==UserScript==
// @name         Typing HUD v3 (Admin + Console Suppress)
// @namespace    typing.hud
// @version      3.0
// @description  HUD ẩn cho typing demo: auto-type + admin + suppress console
// @match        https://typing.fpshn.workers.dev/*
// @match        http://localhost:*/*
// @match        http://127.0.0.1:*/*
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
  'use strict';
  if (window.__hud_v3_installed) return;

  const READY_EV  = '__hud_v3_ready';
  const TIMEOUT_EV= '__hud_v3_timeout';
  const TIMEOUT_MS= 30000;
  const POLL_MS   = 200;

  // ========== 1. Console override (inject vào page context) ==========
  const overrideCode = String.raw`(function(){
    if (window.__hud_v3_consoleOverridden) return;
    window.__hud_v3_consoleOverridden = true;
    window.__hud_v3_orig = {
      log: console.log.bind(console), warn: console.warn.bind(console),
      error: console.error.bind(console), info: console.info.bind(console),
      debug: console.debug.bind(console), clear: console.clear.bind(console)
    };
    window.__hud_v3_buffer = [];
    const toHud = function(level, args){
      const msg = Array.from(args).map(function(a){
        if (typeof a === 'string') return a;
        if (a instanceof Error) return a.stack || a.message;
        try { return JSON.stringify(a); } catch(e){ return String(a); }
      }).join(' ');
      const line = '[' + new Date().toLocaleTimeString('vi-VN') + '] [' + level + '] ' + msg;
      window.__hud_v3_buffer.push({ level: level, msg: msg });
      if (window.__hud_v3_buffer.length > 200) window.__hud_v3_buffer.shift();
      const box = document.getElementById('__hud_log');
      if (box) box.textContent = (line + '\n' + box.textContent).split('\n').slice(0,30).join('\n');
    };
    console.log   = function(){ toHud('log',   arguments); };
    console.warn  = function(){ toHud('warn',  arguments); };
    console.error = function(){ toHud('error', arguments); };
    console.info  = function(){ toHud('info',  arguments); };
    console.debug = function(){ toHud('debug', arguments); };
    window.__hud_v3_clearInt = setInterval(function(){ try { window.__hud_v3_orig.clear(); } catch(e){} }, 500);
    window.__hud_v3_restore = function(){
      clearInterval(window.__hud_v3_clearInt);
      const o = window.__hud_v3_orig;
      console.log = o.log; console.warn = o.warn; console.error = o.error;
      console.info = o.info; console.debug = o.debug;
    };
  })();`;
  const ov = document.createElement('script');
  ov.textContent = overrideCode;
  (document.head || document.documentElement).appendChild(ov);
  ov.remove();

  // ========== 2. Probe game code ==========
  const probe = () => new Promise(resolve => {
    const s = document.createElement('script');
    s.textContent = `(function(){
      const start = Date.now();
      const check = () => {
        if (window.__hud_v3_ready) return;
        try {
          if (typeof S !== 'undefined' && typeof tx !== 'undefined'
              && typeof paint !== 'undefined' && typeof TL !== 'undefined') {
            window.__hud_v3_ready = true;
            document.dispatchEvent(new CustomEvent('${READY_EV}'));
            return;
          }
        } catch(e) {}
        if (Date.now() - start > ${TIMEOUT_MS}) {
          document.dispatchEvent(new CustomEvent('${TIMEOUT_EV}'));
          return;
        }
        setTimeout(check, ${POLL_MS});
      };
      check();
    })();`;
    const onReady   = () => { cleanup(); resolve(true); };
    const onTimeout = () => { cleanup(); resolve(false); };
    const cleanup = () => {
      document.removeEventListener(READY_EV, onReady);
      document.removeEventListener(TIMEOUT_EV, onTimeout);
    };
    document.addEventListener(READY_EV, onReady, { once: true });
    document.addEventListener(TIMEOUT_EV, onTimeout, { once: true });
    (document.head || document.documentElement).appendChild(s);
    s.remove();
  });

  // ========== 3. HUD (self-contained function) ==========
  const HUD = function () {
    if (document.getElementById('__hud')) return;

    const g = name => { try { return eval(name); } catch (e) { return undefined; } };

    // ---------- CSS ----------
    const style = document.createElement('style');
    style.id = '__hud_style';
    style.textContent = `
      #__hud{position:fixed;top:20px;right:20px;width:360px;max-height:90vh;overflow-y:auto;
        background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:10px;
        font:13px/1.4 ui-monospace,Menlo,monospace;z-index:2147483647;
        box-shadow:0 10px 40px rgba(0,0,0,.6);display:none}
      #__hud .hud-h{padding:10px 12px;background:#1e293b;cursor:move;display:flex;
        justify-content:space-between;align-items:center;border-bottom:1px solid #334155;
        font-weight:700;border-radius:10px 10px 0 0;user-select:none}
      #__hud .hud-body{padding:10px}
      #__hud .hud-sec{border:1px solid #1e293b;border-radius:6px;margin-bottom:8px;
        padding:8px;background:#0b1220}
      #__hud .hud-sec h4{margin:0 0 6px;font-size:11px;text-transform:uppercase;
        color:#64748b;letter-spacing:.5px;font-weight:600}
      #__hud label{display:flex;justify-content:space-between;align-items:center;
        margin:4px 0;font-size:12px;color:#94a3b8}
      #__hud input{background:#1e293b;border:1px solid #334155;color:#e2e8f0;
        padding:3px 6px;border-radius:4px;font:inherit}
      #__hud input[type=number]{width:64px;text-align:right}
      #__hud input[type=password]{width:100%;text-align:left;margin-top:4px}
      #__hud input:focus{outline:1px solid #38bdf8}
      #__hud input.hud-lim{border-color:#ef4444!important;animation:__hud_shake .3s}
      @keyframes __hud_shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-3px)}75%{transform:translateX(3px)}}
      #__hud button{width:100%;padding:6px 8px;margin:3px 0;background:#334155;
        color:#e2e8f0;border:1px solid #475569;border-radius:4px;cursor:pointer;
        font:inherit;transition:background .15s}
      #__hud button:hover:not(:disabled){background:#475569}
      #__hud button:disabled{opacity:.4;cursor:not-allowed}
      #__hud button.go{background:#15803d;border-color:#166534}
      #__hud button.go:hover:not(:disabled){background:#16a34a}
      #__hud button.stop{background:#7f1d1d;border-color:#991b1b}
      #__hud button.stop:hover:not(:disabled){background:#b91c1c}
      #__hud button.warn{background:#78350f;border-color:#92400e}
      #__hud .st{display:flex;justify-content:space-between;margin:2px 0;
        font-size:11px;color:#94a3b8}
      #__hud .st b{color:#38bdf8;font-weight:600}
      #__hud .st b.ok{color:#22c55e}
      #__hud .st b.bad{color:#ef4444}
      #__hud #__hud_log{background:#020617;border-radius:4px;padding:6px;
        max-height:140px;overflow-y:auto;font-size:10px;color:#64748b;
        white-space:pre-wrap;font-family:inherit}
      #__hud .row2{display:grid;grid-template-columns:1fr 1fr;gap:4px}
      #__hud .row2 button{margin:0}
      #__hud .row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px}
      #__hud .row3 button{margin:0;font-size:11px;padding:5px 4px}
      #__hud .hint{font-size:10px;color:#475569;margin-top:4px;text-align:center}
      #__hud .hud-close{cursor:pointer;color:#64748b;font-size:16px;padding:0 4px;line-height:1}
      #__hud .hud-close:hover{color:#ef4444}
      #__hud .badge{display:inline-block;padding:1px 6px;border-radius:3px;font-size:10px;
        background:#1e293b;color:#94a3b8}
      #__hud .badge.on{background:#166534;color:#22c55e}
      #__hud .badge.off{background:#7f1d1d;color:#ef4444}
      #__hud .rng{font-size:10px;color:#475569}
    `;
    document.head.appendChild(style);

    // ---------- HTML ----------
    const el = document.createElement('div');
    el.id = '__hud';
    el.innerHTML = `
      <div class="hud-h"><span>🛠 HUD v3</span><span class="hud-close" id="__hud_close">✕</span></div>
      <div class="hud-body">
        <div class="hud-sec">
          <h4>Trạng thái <span class="badge" id="__hud_ready">…</span> <span class="badge" id="__hud_console">…</span></h4>
          <div class="st"><span>view / status</span><b id="__hud_view">–</b></div>
          <div class="st"><span>Đã gõ / Target</span><b id="__hud_len">–</b></div>
          <div class="st"><span>kd / len</span><b id="__hud_kd">–</b></div>
          <div class="st"><span>sd (rhythm)</span><b id="__hud_sd">–</b></div>
          <div class="st"><span>CHEAT</span><b id="__hud_cheat">–</b></div>
        </div>

        <div class="hud-sec" id="__hud_admin_sec">
          <h4>🔐 Admin (Giám thị) <span class="badge" id="__hud_admin_badge">…</span></h4>
          <div id="__hud_admin_body">…</div>
        </div>

        <div class="hud-sec">
          <h4>Tham số (clamp 2 lớp)</h4>
          <label>Tốc độ <span><input type="number" id="__hud_cps" value="7" min="4" max="10" step="0.5"> CPS <span class="rng">[4–10]</span></span></label>
          <label>Typo <span><input type="number" id="__hud_typo" value="8" min="0" max="15"> % <span class="rng">[0–15]</span></span></label>
          <label>Đổi dấu <span><input type="number" id="__hud_dia" value="35" min="0" max="60"> % <span class="rng">[0–60]</span></span></label>
          <label>Think pause <span><input type="number" id="__hud_think" value="2" min="0" max="5" step="0.5"> % <span class="rng">[0–5]</span></span></label>
          <label>Burst <span><input type="number" id="__hud_burst" value="12" min="0" max="25"> % <span class="rng">[0–25]</span></span></label>
          <div class="row2">
            <button class="go" id="__hud_start">▶ Bắt đầu</button>
            <button class="stop" id="__hud_stop" disabled>■ Dừng</button>
          </div>
        </div>

        <div class="hud-sec">
          <h4>Quick Actions</h4>
          <div class="row3">
            <button id="__hud_defaults">↺ Defaults</button>
            <button id="__hud_reset_tl">↻ Reset TL</button>
            <button id="__hud_clear_cheat">✕ Xóa CHEAT</button>
          </div>
          <div class="row2">
            <button id="__hud_restore_console">🔓 Restore console</button>
            <button class="warn" id="__hud_destroy">🗑 Gỡ HUD</button>
          </div>
        </div>

        <div class="hud-sec"><h4>Log (console chỉ hiện ở đây)</h4><div id="__hud_log">Alt+X · console đã bị chặn</div></div>
        <div class="hint">Alt+X · console suppressed · 7 CPS · 8% typo · 35% dấu</div>
      </div>`;
    document.body.appendChild(el);

    const $ = id => document.getElementById(id);
    const log = msg => {
      const box = $('__hud_log'); if (!box) return;
      const line = `[${new Date().toLocaleTimeString('vi-VN')}] ${msg}`;
      box.textContent = (line + '\n' + box.textContent).split('\n').slice(0, 30).join('\n');
    };
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const rand  = (a, b) => a + Math.random() * (b - a);
    const randi = (a, b) => Math.floor(rand(a, b + 1));
    const norm  = v => v.replace(/\n/g, ' ').replace(/^\s+/, '').replace(/\s{2,}/g, ' ');
    const clamp = (v, a, b) => Math.max(a, Math.min(b, isNaN(v) ? a : v));

    // Flush buffer từ outer script
    if (window.__hud_v3_buffer && window.__hud_v3_buffer.length) {
      const box = $('__hud_log');
      if (box) {
        const lines = window.__hud_v3_buffer.slice(-15).map(l => `[buf:${l.level}] ${l.msg}`).reverse();
        box.textContent = lines.join('\n') + '\n' + box.textContent;
      }
      window.__hud_v3_buffer.length = 0;
    }

    // ---------- Toggle Alt+X ----------
    let visible = true;
    el.style.display = 'block';
    const toggle = () => { visible = !visible; el.style.display = visible ? 'block' : 'none'; };
    document.addEventListener('keydown', e => {
      if (e.altKey && (e.key === 'x' || e.key === 'X')) { e.preventDefault(); e.stopPropagation(); toggle(); }
    });
    $('__hud_close').onclick = toggle;
    $('__hud_destroy').onclick = () => {
      el.remove(); style.remove();
      window.__hud_v3_installed = false;
      if (window.__hud_v3_restore) window.__hud_v3_restore();
    };
    $('__hud_restore_console').onclick = () => {
      if (window.__hud_v3_restore) { window.__hud_v3_restore(); log('🔓 Console đã khôi phục (đến khi reload)'); }
    };

    // ---------- Draggable + persist ----------
    let drag = null;
    const POS_KEY = '__hud_v3_pos';
    try {
      const p = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
      if (p && typeof p.l === 'number') { el.style.left = p.l + 'px'; el.style.top = p.t + 'px'; el.style.right = 'auto'; }
    } catch (e) {}
    el.querySelector('.hud-h').addEventListener('mousedown', e => {
      if (e.target.id === '__hud_close') return;
      drag = { x: e.clientX - el.offsetLeft, y: e.clientY - el.offsetTop };
    });
    document.addEventListener('mousemove', e => {
      if (!drag) return;
      el.style.left = (e.clientX - drag.x) + 'px';
      el.style.top = (e.clientY - drag.y) + 'px';
      el.style.right = 'auto';
    });
    document.addEventListener('mouseup', () => {
      if (!drag) return;
      try { localStorage.setItem(POS_KEY, JSON.stringify({ l: el.offsetLeft, t: el.offsetTop })); } catch (e) {}
      drag = null;
    });

    // ---------- Param limits + persist ----------
    const LIMITS = {
      __hud_cps: [4, 10], __hud_typo: [0, 15], __hud_dia: [0, 60],
      __hud_think: [0, 5], __hud_burst: [0, 25]
    };
    const PARAM_KEY = '__hud_v3_params';
    try {
      const p = JSON.parse(localStorage.getItem(PARAM_KEY) || '{}');
      Object.keys(LIMITS).forEach(id => {
        const key = id.replace('__hud_', '');
        if (typeof p[key] === 'number') $(id).value = p[key];
      });
    } catch (e) {}
    const persist = () => {
      const p = {}; Object.keys(LIMITS).forEach(id => { p[id.replace('__hud_', '')] = +$(id).value; });
      try { localStorage.setItem(PARAM_KEY, JSON.stringify(p)); } catch (e) {}
    };
    const bindClamp = id => {
      const inp = $(id); if (!inp) return;
      const [lo, hi] = LIMITS[id];
      const doClamp = () => {
        const v = +inp.value;
        if (isNaN(v) || v < lo || v > hi) {
          const c = clamp(v, lo, hi);
          inp.value = c; inp.classList.add('hud-lim');
          log(`⛔ ${id.replace('__hud_', '')} = ${v} → kẹp ${c} [${lo}–${hi}]`);
          setTimeout(() => inp.classList.remove('hud-lim'), 800);
        }
        persist();
      };
      inp.addEventListener('change', doClamp);
      inp.addEventListener('blur', doClamp);
    };
    Object.keys(LIMITS).forEach(bindClamp);
    const readParams = () => ({
      CPS:   clamp(+$('__hud_cps').value   || 7, 4, 10),
      TYPO:  clamp(+$('__hud_typo').value  || 0, 0, 15) / 100,
      DIA:   clamp(+$('__hud_dia').value   || 0, 0, 60) / 100,
      THINK: clamp(+$('__hud_think').value || 0, 0, 5)  / 100,
      BURST: clamp(+$('__hud_burst').value || 0, 0, 25) / 100
    });
    $('__hud_defaults').onclick = () => {
      $('__hud_cps').value = 7; $('__hud_typo').value = 8; $('__hud_dia').value = 35;
      $('__hud_think').value = 2; $('__hud_burst').value = 12;
      try { localStorage.removeItem(PARAM_KEY); } catch (e) {}
      log('↺ Defaults');
    };

    // ---------- Bảng ngẫu nhiên ----------
    const NEAR = { a:'s',b:'v',c:'x',d:'f',e:'r',f:'d',g:'h',h:'g',i:'u',j:'k',k:'j',
                   l:'k',m:'n',n:'m',o:'p',p:'o',q:'w',r:'e',s:'a',t:'y',u:'i',v:'b',
                   w:'q',x:'c',y:'t',z:'x' };
    const nearKey = ch => { const m = NEAR[ch.toLowerCase()] || 'x'; return ch === ch.toUpperCase() ? m.toUpperCase() : m; };
    const randomLetter = () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)];
    const VOWEL_TONES = {
      'a':'aàáảãạ','ă':'ăằắẳẵặ','â':'âầấẩẫậ','e':'eèéẻẽẹ','ê':'êềếểễệ','i':'iìíỉĩị',
      'o':'oòóỏõọ','ô':'ôồốổỗộ','ơ':'ơờớởỡợ','u':'uùúủũụ','ư':'ưừứửữự','y':'yỳýỷỹỵ'
    };
    const findGroup = ch => {
      const lo = ch.toLowerCase();
      for (const [, tones] of Object.entries(VOWEL_TONES))
        if (tones.includes(lo)) return { tones: [...tones], upper: ch !== lo };
      return null;
    };
    const wrongDiacritic = ch => {
      const gr = findGroup(ch); if (!gr) return null;
      const others = gr.tones.filter(t => t !== ch.toLowerCase());
      if (!others.length) return null;
      const pick = others[Math.floor(Math.random() * others.length)];
      return gr.upper ? pick.toUpperCase() : pick;
    };
    const BASE_MAP = {
      'à':'a','á':'a','ả':'a','ã':'a','ạ':'a','ă':'a','ằ':'a','ắ':'a','ẳ':'a','ẵ':'a','ặ':'a',
      'â':'a','ầ':'a','ấ':'a','ẩ':'a','ẫ':'a','ậ':'a','è':'e','é':'e','ẻ':'e','ẽ':'e','ẹ':'e',
      'ê':'e','ề':'e','ế':'e','ể':'e','ễ':'e','ệ':'e','ì':'i','í':'i','ỉ':'i','ĩ':'i','ị':'i',
      'ò':'o','ó':'o','ỏ':'o','õ':'o','ọ':'o','ô':'o','ồ':'o','ố':'o','ổ':'o','ỗ':'o','ộ':'o',
      'ơ':'o','ờ':'o','ớ':'o','ở':'o','ỡ':'o','ợ':'o','ù':'u','ú':'u','ủ':'u','ũ':'u','ụ':'u',
      'ư':'u','ừ':'u','ứ':'u','ử':'u','ữ':'u','ự':'u','ỳ':'y','ý':'y','ỷ':'y','ỹ':'y','ỵ':'y','đ':'d'
    };
    const missingDiacritic = ch => {
      const b = BASE_MAP[ch.toLowerCase()]; if (!b) return null;
      return ch === ch.toUpperCase() ? b.toUpperCase() : b;
    };

    // ---------- send ----------
    const send = (txt, keys = 1) => {
      const ta = g('ta'), OKV = g('OKV'), TL = g('TL'), tx = g('tx'), paint = g('paint'), S = g('S');
      if (!ta || typeof tx !== 'function') return;
      const n = norm(txt);
      if (n === OKV) return;
      ta.value = n;
      try { eval('OKV = n'); } catch (e) {}
      if (S && S.cls) try { eval('cval = n'); } catch (e) {}
      const now = performance.now();
      TL.kd += keys;
      if (TL.last) {
        const d = now - TL.last;
        if (d < 2000) { TL.n++; const dl = d - TL.mean; TL.mean += dl / TL.n; TL.m2 += dl * (d - TL.mean); }
      }
      TL.last = now;
      tx({ t:'typed', text: n, tl: {
        kd: TL.kd,
        sd: TL.n > 5 ? Math.round(Math.sqrt(TL.m2 / (TL.n - 1)) * 10) / 10 : -1,
        sy: TL.sy, bl: TL.bl, wd: navigator.webdriver ? 1 : 0
      }});
      paint();
    };

    // ---------- Admin section ----------
    let _admHad = null;
    const buildAdminSection = () => {
      const A = g('A');
      const badge = $('__hud_admin_badge');
      const body = $('__hud_admin_body');
      if (!body) return;

      if (!A) {
        badge.textContent = 'CHƯA LOGIN'; badge.className = 'badge off';
        body.innerHTML = `
          <label style="display:block">Mật khẩu giám thị
            <input type="password" id="__hud_admin_pw" placeholder="Nhập mật khẩu giám thị…" autocomplete="off">
          </label>
          <button class="go" id="__hud_admin_login" style="margin-top:6px">🔐 Đăng nhập</button>`;
        const pw = $('__hud_admin_pw');
        pw.addEventListener('keydown', e => { if (e.key === 'Enter') $('__hud_admin_login').click(); });
        $('__hud_admin_login').onclick = () => {
          const p = pw.value.trim();
          if (!p) return log('Nhập mật khẩu trước');
          try { g('tx')({ t:'admin', pass: p }); } catch (e) { log('Lỗi: ' + e.message); return; }
          log('Đang gửi đăng nhập admin…');
          $('__hud_admin_login').disabled = true;
          setTimeout(() => {
            if ($('__hud_admin_login') && !g('A')) {
              $('__hud_admin_login').disabled = false;
              log('❌ Sai mật khẩu hoặc chưa kết nối WS');
            }
          }, 3000);
        };
        return;
      }

      // Đã đăng nhập
      badge.textContent = A.role === 2 ? 'PROCTOR' : 'ADMIN';
      badge.className = 'badge on';
      body.innerHTML = `
        <div class="st"><span>Role</span><b>${A.role === 2 ? 'Giám thị lớp' : 'Giám thị 1'}</b></div>
        <div class="st"><span>Học sinh</span><b id="__hud_cnt_stu">${A.students?.length ?? 0}</b></div>
        <div class="st"><span>Phòng live</span><b id="__hud_cnt_live">${A.live?.length ?? 0}</b></div>
        <div class="st"><span>Lớp active</span><b id="__hud_cnt_cls">${A.cls?.length ?? 0}</b></div>
        <div class="st"><span>Cheat log</span><b id="__hud_cnt_cheat">${A.cheatlog?.length ?? 0}</b></div>
        <div class="row2" style="margin-top:6px">
          <button class="go" id="__hud_goto_admin">📊 Admin panel</button>
          <button id="__hud_online">👥 Online</button>
        </div>
        <div class="row2">
          <button id="__hud_export">⬇ Export 400</button>
          <button id="__hud_backup">💾 Backup</button>
        </div>
        <div class="row2">
          <button class="warn" id="__hud_void">💥 Void SV</button>
          <button class="warn" id="__hud_reset_lb">🗑 Reset LB</button>
        </div>
        <div class="row2">
          <button class="stop" id="__hud_admin_logout">🚪 Logout</button>
          <button id="__hud_gohome">🏠 Home</button>
        </div>`;

      $('__hud_goto_admin').onclick = () => {
        try { eval("view = 'admin'"); g('render')(); log('📊 → Admin panel'); } catch (e) { log('Lỗi: ' + e.message); }
      };
      $('__hud_online').onclick = () => {
        try { g('openOnline')(); log('👥 → Online list'); } catch (e) { log('Lỗi: ' + e.message); }
      };
      $('__hud_export').onclick = () => {
        try { g('tx')({ t:'exporttop' }); log('⬇ Đang xuất Excel…'); } catch (e) { log('Lỗi: ' + e.message); }
      };
      $('__hud_backup').onclick = () => {
        try { g('tx')({ t:'backup' }); log('💾 Đang tải backup…'); } catch (e) { log('Lỗi: ' + e.message); }
      };
      $('__hud_void').onclick = () => {
        const k = prompt('Nhập MSSV cần hủy toàn bộ điểm:');
        if (!k) return;
        if (!confirm('Hủy toàn bộ điểm của ' + k + '?')) return;
        try { g('tx')({ t:'voidstudent', mssv: k }); log('💥 Đã gửi void ' + k); } catch (e) { log('Lỗi: ' + e.message); }
      };
      $('__hud_reset_lb').onclick = () => {
        if (!confirm('Xóa TOÀN BỘ bảng xếp hạng (5 mốc)?')) return;
        try { g('tx')({ t:'resetlb' }); log('🗑 Đã gửi reset LB'); } catch (e) { log('Lỗi: ' + e.message); }
      };
      $('__hud_admin_logout').onclick = () => {
        try { g('staffLogout')(); log('🚪 Đã logout'); } catch (e) { log('Lỗi: ' + e.message); }
      };
      $('__hud_gohome').onclick = () => {
        try { g('goHome')(); log('🏠 → Home'); } catch (e) { log('Lỗi: ' + e.message); }
      };
    };

    const refreshAdminCounts = () => {
      const A = g('A'); if (!A) return;
      const s = $('__hud_cnt_stu');   if (s) s.textContent = A.students?.length ?? 0;
      const l = $('__hud_cnt_live');  if (l) l.textContent = A.live?.length ?? 0;
      const c = $('__hud_cnt_cls');   if (c) c.textContent = A.cls?.length ?? 0;
      const ch = $('__hud_cnt_cheat');if (ch) ch.textContent = A.cheatlog?.length ?? 0;
    };

    // ---------- Live status ----------
    const updateHud = () => {
      if (!visible) return;
      const S = g('S'), TL = g('TL'), OKV = g('OKV'), CHEAT = g('CHEAT'), view = g('view');
      const r = $('__hud_ready');
      const ok = typeof S !== 'undefined' && typeof g('tx') === 'function' && TL;
      r.textContent = ok ? 'READY' : 'WAIT'; r.className = 'badge ' + (ok ? 'on' : 'off');
      const c = $('__hud_console');
      c.textContent = window.__hud_v3_consoleOverridden ? 'LOG:HIDDEN' : 'LOG:NORMAL';
      c.className = 'badge ' + (window.__hud_v3_consoleOverridden ? 'on' : 'off');

      const st = S ? S.status : '–';
      $('__hud_view').textContent = (view || '–') + ' / ' + st;
      $('__hud_view').className = st === 'running' ? 'ok' : (st === '–' ? '' : 'bad');

      const len = (S && S.text) ? S.text.length : 0;
      const pos = OKV ? OKV.length : 0;
      $('__hud_len').textContent = len ? `${pos} / ${len}` : '–';

      if (TL && pos > 0) {
        const ratio = TL.kd / Math.max(1, pos);
        const e = $('__hud_kd'); e.textContent = `${TL.kd} / ${pos} = ${ratio.toFixed(2)}`;
        e.className = ratio < 1.05 ? 'bad' : (ratio > 3 ? 'bad' : 'ok');
      } else { $('__hud_kd').textContent = '–'; $('__hud_kd').className = ''; }
      if (TL && TL.n > 5) {
        const sd = Math.sqrt(TL.m2 / (TL.n - 1));
        const e = $('__hud_sd'); e.textContent = sd.toFixed(1) + ' ms';
        e.className = sd < 8 ? 'bad' : 'ok';
      } else { $('__hud_sd').textContent = '–'; $('__hud_sd').className = ''; }
      const ce = $('__hud_cheat');
      ce.textContent = CHEAT || '(trống)';
      ce.className = CHEAT ? 'bad' : 'ok';

      // Admin state
      const has = !!g('A');
      if (has !== _admHad) { _admHad = has; buildAdminSection(); }
      else refreshAdminCounts();
    };
    buildAdminSection();
    setInterval(updateHud, 500);

    // ---------- Quick actions ----------
    $('__hud_reset_tl').onclick = () => {
      const TL = g('TL'); if (!TL) return;
      TL.kd = 0; TL.n = 0; TL.mean = 0; TL.m2 = 0; TL.sy = 0; TL.bl = 0; TL.last = 0; TL.lb = 0;
      log('↻ Reset TL');
    };
    $('__hud_clear_cheat').onclick = () => {
      try { eval("CHEAT = ''"); } catch (e) {}
      const ta = g('ta'); if (ta) ta.disabled = false;
      log('Đã xóa CHEAT');
    };

    // ---------- Start/Stop ----------
    let running = false, stopFlag = false;
    $('__hud_stop').onclick = () => { stopFlag = true; log('Yêu cầu dừng…'); };

    $('__hud_start').onclick = async () => {
      if (running) return log('Đang chạy');
      if (typeof g('S') === 'undefined') return log('Chưa sẵn sàng');
      running = true; stopFlag = false;
      $('__hud_start').disabled = true; $('__hud_stop').disabled = false;

      try {
        let S = g('S'), ta = g('ta'), view = g('view');
        while (!(S && S.status === 'running' && ta && view === 'game')) {
          log('Đợi S.status="running"…'); await sleep(500);
          if (stopFlag) return log('Hủy chờ');
          S = g('S'); ta = g('ta'); view = g('view');
        }

        const P = readParams();
        const BASE_DELAY = 1000 / P.CPS;
        log(`▶ ${P.CPS} CPS · typo ${(P.TYPO*100).toFixed(0)}% · dấu ${(P.DIA*100).toFixed(0)}% · think ${(P.THINK*100).toFixed(0)}% · burst ${(P.BURST*100).toFixed(0)}%`);

        const me = S.me, target = S.text;
        const TL = g('TL');
        TL.kd = 0; TL.n = 0; TL.mean = 0; TL.m2 = 0; TL.sy = 0; TL.bl = 0; TL.last = 0; TL.lb = 0;
        ta.value = ''; try { eval("OKV = ''"); } catch (e) {}

        let buffer = '', i = 0, burstLeft = 0;

        const typeChar = async (correctCh) => {
          if (Math.random() < P.THINK) await sleep(rand(600, 1800));
          const base = BASE_MAP[correctCh.toLowerCase()];
          if (base && Math.random() < P.DIA && correctCh !== base) {
            await sleep(rand(70, 130));
            const first = (correctCh === correctCh.toUpperCase()) ? base.toUpperCase() : base;
            send(buffer + first, 1);
            await sleep(rand(90, 220));
            send(buffer + correctCh, 1);
            return;
          }
          if (Math.random() < P.TYPO) {
            const nTypo = Math.random() < 0.2 ? 2 : 1;
            const errs = [];
            for (let k = 0; k < nTypo; k++) {
              const roll = Math.random();
              let wrong = null;
              if (roll < 0.60)      wrong = nearKey(correctCh);
              else if (roll < 0.75) wrong = randomLetter();
              else if (roll < 0.90) wrong = wrongDiacritic(correctCh);
              else                  wrong = missingDiacritic(correctCh);
              errs.push(wrong || nearKey(correctCh));
            }
            const typoStr = errs.join('');
            await sleep(rand(60, 130));
            for (let k = 0; k < nTypo; k++) { send(buffer + typoStr.slice(0, k + 1), 1); await sleep(rand(60, 130)); }
            await sleep(rand(150, 400));
            for (let k = nTypo; k > 0; k--) { send(buffer + typoStr.slice(0, k - 1), 1); await sleep(rand(60, 130)); }
            await sleep(rand(100, 250));
            send(buffer + correctCh, 1);
            return;
          }
          await sleep(rand(BASE_DELAY * 0.6, BASE_DELAY * 1.6));
          send(buffer + correctCh, 1);
        };

        while (i < target.length && !stopFlag) {
          const cur = g('S');
          if (!cur || cur.status !== 'running' || g('CHEAT') || (cur.players && cur.players[me] && cur.players[me].done)) {
            log(`Dừng: status=${cur && cur.status} cheat=${g('CHEAT')}`); break;
          }
          if (burstLeft > 0) {
            burstLeft--; await sleep(rand(30, 70));
            send(buffer + target[i], 1); buffer += target[i]; i++; continue;
          }
          if (Math.random() < P.BURST) burstLeft = randi(3, 8);
          await typeChar(target[i]); buffer += target[i]; i++;
        }

        log(`■ Xong ${i}/${target.length} · kd/len=${(TL.kd/Math.max(1,target.length)).toFixed(2)}`);
      } finally {
        running = false; stopFlag = false;
        $('__hud_start').disabled = false; $('__hud_stop').disabled = true;
      }
    };

    console.log('[HUD v3] Sẵn sàng. Alt+X để mở/đóng. Console đã suppress.');
  };

  // ========== 4. Inject HUD ==========
  probe().then(ok => {
    if (ok) {
      window.__hud_v3_installed = true;
      const s = document.createElement('script');
      s.textContent = '(' + HUD.toString() + ')();';
      (document.head || document.documentElement).appendChild(s);
      s.remove();
    } else {
      if (window.__hud_v3_restore) window.__hud_v3_restore();
      if (window.__hud_v3_orig) window.__hud_v3_orig.log('[HUD v3] Không tìm thấy game code, đã khôi phục console.');
    }
  });
})();
