// ═══════════════════════════════════════════════════════════════
// Enebras Mapa — Auth + perfis (logins de teste) v8.0
// Adm (você): app completo + atribui rota escolhendo o técnico na lista.
// Técnico: loga e vê SÓ as rotas dele ("Minhas rotas") + visitas.
// Sem backend configurado: tudo como antes (modo offline, sem login).
// Usa só fetch na API do Supabase — sem dependência externa.
// ═══════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var SESSION_KEY = 'enebras-session';
  var session = null;
  var profile = null;

  function cfg() {
    try { return window.ENEBRAS_BACKEND || {}; } catch (e) { return {}; }
  }

  function backendOn() {
    try { return window.LiveSync && LiveSync.isConfigured(); } catch (e) { return false; }
  }

  function base() { return cfg().SUPABASE_URL.replace(/\/$/, ''); }

  function toast(msg, type) {
    if (typeof showToast === 'function') showToast(msg, type || 'info');
  }

  // --- sessão local ---
  function loadSession() {
    try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
    catch (e) { session = null; }
  }

  function saveSession() {
    try {
      if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      else localStorage.removeItem(SESSION_KEY);
    } catch (e) {}
  }

  function authH() {
    return {
      'apikey': cfg().SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + session.access_token,
      'Content-Type': 'application/json'
    };
  }

  // --- API de auth (GoTrue REST) ---
  async function login(email, senha) {
    var res = await fetch(base() + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'apikey': cfg().SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: senha })
    });
    if (!res.ok) {
      var t = '';
      try { t = await res.text(); } catch (e) {}
      throw new Error(t.indexOf('Invalid login') >= 0 ? 'E-mail ou senha inválidos' : 'Falha no login (' + res.status + ')');
    }
    var data = await res.json();
    session = { access_token: data.access_token, refresh_token: data.refresh_token, user: data.user };
    saveSession();
    await loadProfile();
  }

  async function logout() {
    try {
      await fetch(base() + '/auth/v1/logout', { method: 'POST', headers: authH() });
    } catch (e) {}
    session = null;
    profile = null;
    saveSession();
    location.reload();
  }

  async function loadProfile() {
    if (!session) return null;
    var res = await fetch(base() + '/rest/v1/profiles?id=eq.' + session.user.id + '&select=*', {
      headers: authH()
    });
    if (res.status === 401) { // token expirou
      session = null; profile = null; saveSession();
      return null;
    }
    if (!res.ok) throw new Error('Erro ao ler perfil (' + res.status + ')');
    var rows = await res.json();
    profile = rows && rows[0] ? rows[0] : null;
    return profile;
  }

  function isAdmin() { return !!(profile && profile.role === 'admin'); }
  function isTec() { return !!(profile && profile.role === 'tecnico'); }

  // --- lista de técnicos (p/ o adm escolher na hora de enviar) ---
  async function listTechnicians() {
    var res = await fetch(base() + "/rest/v1/profiles?role=eq.tecnico&select=nome,email&order=nome.asc", {
      headers: authH()
    });
    if (!res.ok) throw new Error('Erro ao listar técnicos');
    return await res.json();
  }

  function pickTechnician() {
    return listTechnicians().then(function (tecs) {
      if (!tecs.length) {
        toast('Nenhum técnico cadastrado — usando nome digitado', 'info');
        return null;
      }
      return new Promise(function (resolve) {
        var ov = document.createElement('div');
        ov.className = 'auth-overlay';
        ov.style.zIndex = 60;
        ov.innerHTML =
          '<div class="auth-card">' +
          '<h2>Enviar rota para</h2>' +
          '<div class="form-group"><label for="auth-tec">Técnico</label>' +
          '<select id="auth-tec" class="form-input">' +
          tecs.map(function (t) {
            return '<option value="' + t.email + '">' + escapeHtml(t.nome || t.email) + '</option>';
          }).join('') +
          '</select></div>' +
          '<div class="auth-row">' +
          '<button id="auth-tec-ok" class="modal-btn save">Enviar</button>' +
          '<button id="auth-tec-cancel" class="modal-btn cancel">Cancelar</button>' +
          '</div></div>';
        document.body.appendChild(ov);
        ov.querySelector('#auth-tec-ok').addEventListener('click', function () {
          var email = ov.querySelector('#auth-tec').value;
          var tec = tecs.find(function (t) { return t.email === email; });
          ov.remove();
          resolve(tec ? { nome: tec.nome || tec.email, email: tec.email } : null);
        });
        ov.querySelector('#auth-tec-cancel').addEventListener('click', function () {
          ov.remove();
          resolve(null);
        });
      });
    }).catch(function () { return null; });
  }

  // --- Minhas rotas (home do técnico) ---
  function ensureMyRoutes() {
    if (document.getElementById('my-routes')) return;
    var anchor = document.querySelector('#visits-view .field-search-wrap');
    if (!anchor) return;
    var div = document.createElement('div');
    div.id = 'my-routes';
    div.innerHTML = '<div class="my-routes-title">📋 Minhas rotas</div><div id="my-routes-list" class="my-routes-list"><span class="photos-hint">Carregando...</span></div>';
    anchor.parentNode.insertBefore(div, anchor.nextSibling);
  }

  async function loadMyRoutes() {
    var box = document.getElementById('my-routes-list');
    if (!box || !session) return;
    try {
      var email = session.user.email;
      var res = await fetch(base() + '/rest/v1/routes?tech_email=eq.' + encodeURIComponent(email) + '&select=code,tech,route_date,stops,created_at&order=created_at.desc&limit=10', {
        headers: authH()
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var rows = await res.json();
      if (!rows.length) {
        box.innerHTML = '<span class="photos-hint">Nenhuma rota atribuída a você ainda.</span>';
        return;
      }
      box.innerHTML = rows.map(function (r) {
        var n = (r.stops || []).length;
        return '<div class="my-route-card" data-code="' + r.code + '">' +
          '<div><b>' + r.route_date + '</b> • ' + n + ' paradas • código ' + r.code + '</div>' +
          '<button class="modal-btn save my-route-open">Abrir</button></div>';
      }).join('');
      box.querySelectorAll('.my-route-open').forEach(function (btn) {
        btn.addEventListener('click', function () {
          openRoute(btn.parentNode.getAttribute('data-code'));
        });
      });
    } catch (e) {
      box.innerHTML = '<span class="photos-hint">Erro ao carregar rotas.</span>';
    }
  }

  async function openRoute(code) {
    try {
      var route = await window.LiveSync.getRoute(code);
      applyStops(route.stops || [], route.tech || '', code);
    } catch (e) {
      toast('Erro ao abrir rota: ' + e.message, 'error');
    }
  }

  function applyStops(stops, tech, code, attempt) {
    attempt = attempt || 0;
    if (typeof clients === 'undefined' || typeof selectedIds === 'undefined' || typeof loadSelection === 'undefined') {
      if (attempt < 20) setTimeout(function () { applyStops(stops, tech, code, attempt + 1); }, 500);
      return;
    }
    try { loadSelection(); } catch (e) {}
    var ids = [];
    stops.forEach(function (s, i) {
      var tmp = 900000 + i;
      if (!clients.some(function (x) { return x.id === tmp; })) {
        clients.push({ id: tmp, name: s.n, address: s.a, city: s.c, state: s.u, lat: s.lat, lng: s.lng, phone: s.p || '', shared: true });
      }
      ids.push(tmp);
    });
    try {
      selectedIds = new Set(ids);
      if (typeof saveSelection === 'function') saveSelection();
      if (typeof updateSelectionBar === 'function') updateSelectionBar();
      if (typeof renderClients === 'function') renderClients();
      if (typeof renderMarkers === 'function') renderMarkers();
      if (typeof setFieldView === 'function') setFieldView('visits');
      window.liveRouteCode = code;
      window.liveStops = ids.slice();
      try { localStorage.setItem('enebras-live-code', code); } catch (e) {}
      toast('Rota carregada ✓ (' + ids.length + ' visitas)', 'success');
    } catch (e) {
      toast('Erro ao carregar rota: ' + e.message, 'error');
    }
  }

  // --- Papel na tela ---
  function applyRole() {
    var tag = document.getElementById('auth-user-tag');
    if (profile) {
      document.body.classList.toggle('is-tec', profile.role === 'tecnico');
      document.body.classList.toggle('is-admin', profile.role === 'admin');
      if (tag) tag.textContent = (profile.nome || profile.email) + ' • ' + (profile.role === 'admin' ? 'Adm' : 'Técnico');
      if (profile.role === 'tecnico') {
        ensureMyRoutes();
        loadMyRoutes();
        var tries = 0;
        var iv = setInterval(function () {
          tries++;
          try { if (typeof setFieldView === 'function') { setFieldView('visits'); clearInterval(iv); } } catch (e) {}
          if (tries > 20) clearInterval(iv);
        }, 500);
      }
    } else {
      if (tag) tag.textContent = '';
    }
  }

  function ensureUserTag() {
    if (document.getElementById('auth-user-tag')) return;
    var bar = document.querySelector('#mobile-topbar .view-switch');
    var span = document.createElement('span');
    span.id = 'auth-user-tag';
    span.className = 'auth-user-tag';
    var btn = document.createElement('button');
    btn.id = 'auth-logout';
    btn.className = 'auth-logout';
    btn.textContent = 'Sair';
    btn.addEventListener('click', logout);
    if (bar && bar.parentNode) {
      bar.parentNode.appendChild(span);
      bar.parentNode.appendChild(btn);
    }
  }

  // --- Tela de login ---
  function showLogin() {
    if (document.getElementById('auth-view')) return;
    var ov = document.createElement('div');
    ov.id = 'auth-view';
    ov.className = 'auth-overlay';
    ov.innerHTML =
      '<div class="auth-card">' +
      '<div class="auth-logo">ENEBRAS</div>' +
      '<h2>Entrar</h2>' +
      '<div class="form-group"><label for="auth-email">E-mail</label>' +
      '<input id="auth-email" class="form-input" type="email" placeholder="voce@enebras.com.br" autocomplete="username"></div>' +
      '<div class="form-group"><label for="auth-senha">Senha</label>' +
      '<input id="auth-senha" class="form-input" type="password" placeholder="••••••••" autocomplete="current-password"></div>' +
      '<div id="auth-err" class="auth-err"></div>' +
      '<button id="auth-go" class="modal-btn save auth-go">Entrar</button>' +
      '<div class="photos-hint">Teste: admin@enebras.teste · tec1@enebras.teste</div>' +
      '<div class="photos-hint">v8.2</div>' +
      '</div>';
    document.body.appendChild(ov);
    var go = function () {
      var email = ov.querySelector('#auth-email').value.trim();
      var senha = ov.querySelector('#auth-senha').value;
      var err = ov.querySelector('#auth-err');
      err.textContent = '';
      if (!email || !senha) { err.textContent = 'Preencha e-mail e senha.'; return; }
      ov.querySelector('#auth-go').textContent = 'Entrando...';
      login(email, senha).then(function () {
        if (!profile) { err.textContent = 'Login sem perfil — avise o Hiago.'; return; }
        ov.remove();
        ensureUserTag();
        applyRole();
        toast('Bem-vindo, ' + (profile.nome || profile.email) + '!', 'success');
      }).catch(function (e) {
        err.textContent = e.message;
        ov.querySelector('#auth-go').textContent = 'Entrar';
      });
    };
    ov.querySelector('#auth-go').addEventListener('click', go);
    ov.querySelector('#auth-senha').addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') go();
    });
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  function bootDebug(msg) {
    try {
      var el = document.getElementById('boot-debug');
      if (!el) {
        el = document.createElement('div');
        el.id = 'boot-debug';
        el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99;background:#000;color:#0f0;font:11px monospace;padding:4px 8px;border-radius:6px;opacity:.9';
        document.body.appendChild(el);
      }
      el.textContent = msg;
    } catch (e) {}
  }

  // --- Boot ---
  document.addEventListener('DOMContentLoaded', function () {
    if (!backendOn()) return; // sem backend: segue offline, sem login
    loadSession();
    bootDebug('boot cfg=' + (backendOn() ? 1 : 0) + ' sess=' + (session ? 1 : 0) + ' v8.3');
    setInterval(function () {
      try {
        if (!session && !document.getElementById('auth-view')) showLogin();
      } catch (e) {}
    }, 2000);
    ensureUserTag();
    if (!session) { bootDebug('sem sessao -> login v8.3'); showLogin(); return; }
    bootDebug('com sessao -> perfil...');
    loadProfile().then(function (p) {
      if (!p) { bootDebug('perfil invalido -> login'); showLogin(); return; }
      bootDebug('logado: ' + p.role);
      applyRole();
    }).catch(function () { bootDebug('erro perfil -> login'); showLogin(); });
  });

  window.TeamAuth = {
    login: login,
    logout: logout,
    isAdmin: isAdmin,
    isTec: isTec,
    myProfile: function () { return profile; },
    pickTechnician: pickTechnician,
    loadMyRoutes: loadMyRoutes
  };
})();
