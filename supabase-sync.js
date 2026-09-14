// ═══════════════════════════════════════════════════════════════
// Enebras Mapa — Sync ao vivo via Supabase (plano free) v7.3
// Sem credencial em backend-config.js = app segue 100% offline (#rota=).
// Com credencial: compartilhar gera link curto (?r=CODIGO), o check-in
// do técnico grava na nuvem e o Hiago vê o progresso ao vivo.
// Usa só fetch REST (PostgREST) — sem dependência externa.
// ═══════════════════════════════════════════════════════════════
(function () {
  'use strict';

  function cfg() {
    try { return window.ENEBRAS_BACKEND || {}; } catch (e) { return {}; }
  }

  function isConfigured() {
    var c = cfg();
    return !!(c.SUPABASE_URL && c.SUPABASE_ANON_KEY &&
      c.SUPABASE_URL.indexOf('http') === 0 && c.SUPABASE_ANON_KEY.length > 20);
  }

  function base() {
    return cfg().SUPABASE_URL.replace(/\/$/, '');
  }

  function headers(json) {
    var h = {
      'apikey': cfg().SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + cfg().SUPABASE_ANON_KEY
    };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }

  async function rest(method, path, body, extra) {
    var url = base() + '/rest/v1/' + path + (extra || '');
    var opt = { method: method, headers: headers(true) };
    if (body !== undefined) opt.body = JSON.stringify(body);
    if (method === 'POST') opt.headers['Prefer'] = 'return=representation';
    var res = await fetch(url, opt);
    if (!res.ok) {
      var t = '';
      try { t = await res.text(); } catch (e) {}
      throw new Error('Supabase ' + res.status + ' ' + t.slice(0, 120));
    }
    try { return await res.json(); } catch (e) { return null; }
  }

  function makeCode() {
    var chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    var out = '';
    for (var i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  function todayBR() {
    try { return new Date().toLocaleDateString('pt-BR'); } catch (e) { return ''; }
  }

  function toast(msg, type) {
    if (typeof showToast === 'function') showToast(msg, type || 'info');
  }

  // --- Hiago: cria rota na nuvem, retorna {code, url} ---
  async function createRoute(tech, stops, techEmail) {
    var payload = {
      v: 1,
      tech: tech,
      date: todayBR(),
      stops: stops.slice(0, 12).map(function (c) {
        return {
          n: c.name || '', a: c.address || '', c: c.city || '', u: c.state || '',
          lat: (typeof c.lat === 'number') ? Math.round(c.lat * 100000) / 100000 : null,
          lng: (typeof c.lng === 'number') ? Math.round(c.lng * 100000) / 100000 : null,
          p: c.phone || ''
        };
      })
    };
    for (var tries = 0; tries < 3; tries++) {
      var code = makeCode();
      try {
        await rest('POST', 'routes', { code: code, tech: tech, tech_email: techEmail || null, route_date: payload.date, stops: payload.stops });
        var urlBase = location.origin && location.origin !== 'null'
          ? location.origin + location.pathname
          : location.href.split('#')[0].split('?')[0];
        return { code: code, url: urlBase + '?r=' + code, payload: payload };
      } catch (e) {
        if (String(e.message).indexOf('409') < 0 || tries === 2) throw e;
      }
    }
  }

  async function getRoute(code) {
    var rows = await rest('GET', 'routes', undefined, '?code=eq.' + encodeURIComponent(code) + '&select=*');
    if (!rows || !rows.length) throw new Error('Rota não encontrada (código inválido?)');
    return rows[0];
  }

  async function sendCheckin(routeCode, ev) {
    if (!routeCode) return;
    await rest('POST', 'checkins', {
      route_code: routeCode,
      stop_index: ev.stopIndex,
      client_name: ev.clientName,
      kind: ev.kind,
      status: ev.status || null,
      note: ev.note || null,
      lat: (typeof ev.lat === 'number') ? ev.lat : null,
      lng: (typeof ev.lng === 'number') ? ev.lng : null
    });
  }

  async function getCheckins(routeCode) {
    return await rest('GET', 'checkins', undefined,
      '?route_code=eq.' + encodeURIComponent(routeCode) + '&select=*&order=created_at.asc');
  }

  // --- Receptor ?r=CODIGO (técnico) ---
  function parseCode() {
    try {
      var q = new URLSearchParams(location.search);
      return q.get('r');
    } catch (e) { return null; }
  }

  function applyCloudStops(route, code, attempt) {
    attempt = attempt || 0;
    if (typeof clients === 'undefined' || typeof selectedIds === 'undefined' || typeof loadSelection === 'undefined') {
      if (attempt < 20) setTimeout(function () { applyCloudStops(route, code, attempt + 1); }, 500);
      return;
    }
    try { loadSelection(); } catch (e) {}
    var stops = route.stops || [];
    var norm = function (s) {
      return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    };
    var ids = [];
    stops.forEach(function (s, i) {
      var hit = null;
      try {
        hit = clients.find(function (c) { return norm(c.name) === norm(s.n); });
      } catch (e) {}
      if (hit) { ids.push(hit.id); return; }
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
      try { localStorage.setItem('enebras-shared-tech', route.tech || ''); } catch (e) {}
      try { localStorage.setItem('enebras-live-code', code); } catch (e) {}
      toast('Rota de ' + (route.tech || 'hoje') + ' carregada ✓ (' + ids.length + ' visitas, ao vivo)', 'success');
    } catch (e) {
      toast('Erro ao carregar rota: ' + e.message, 'error');
    }
  }

  async function bootReceiver() {
    var code = parseCode();
    if (!code || !isConfigured()) return;
    toast('Buscando rota ' + code + '...', 'info');
    try {
      var route = await getRoute(code);
      applyCloudStops(route, code);
    } catch (e) {
      toast('Erro ao buscar rota: ' + e.message, 'error');
    }
  }

  // --- Espelha check-in/out do técnico na nuvem (sem quebrar o local) ---
  function stopIndexOf(clientId) {
    try {
      if (window.liveStops) {
        var i = window.liveStops.indexOf(clientId);
        if (i >= 0) return i;
      }
      if (typeof getTodayList === 'function') {
        var list = getTodayList();
        for (var k = 0; k < list.length; k++) if (list[k].id === clientId) return k;
      }
    } catch (e) {}
    return 0;
  }

  function clientNameOf(clientId) {
    try {
      var c = clients.find(function (x) { return x.id === clientId; });
      if (c) return c.name || '';
    } catch (e) {}
    return '';
  }

  function wrapVisitFns() {
    try {
      if (typeof doCheckin === 'function' && !doCheckin._liveWrapped) {
        var _in = doCheckin;
        var wIn = async function () {
          var r = await _in.apply(this, arguments);
          try {
            if (window.liveRouteCode && isConfigured() && typeof editingVisitId !== 'undefined') {
              var v = (typeof todayVisits !== 'undefined') ? todayVisits.get(editingVisitId) : null;
              await sendCheckin(window.liveRouteCode, {
                stopIndex: stopIndexOf(editingVisitId),
                clientName: clientNameOf(editingVisitId),
                kind: 'checkin', status: 'done', note: '',
                lat: v && v.lat, lng: v && v.lng
              });
            }
          } catch (e) {}
          return r;
        };
        wIn._liveWrapped = true;
        doCheckin = wIn;
      }
      if (typeof doCheckout === 'function' && !doCheckout._liveWrapped) {
        var _out = doCheckout;
        var wOut = async function () {
          var r = await _out.apply(this, arguments);
          try {
            if (window.liveRouteCode && isConfigured() && typeof editingVisitId !== 'undefined') {
              var st = '', nt = '';
              try {
                st = document.getElementById('visit-status').value;
                nt = document.getElementById('visit-note').value.trim();
              } catch (e) {}
              await sendCheckin(window.liveRouteCode, {
                stopIndex: stopIndexOf(editingVisitId),
                clientName: clientNameOf(editingVisitId),
                kind: 'checkout', status: st, note: nt
              });
            }
          } catch (e) {}
          return r;
        };
        wOut._liveWrapped = true;
        doCheckout = wOut;
      }
    } catch (e) {}
  }

  // --- Hiago: linha "ao vivo" no painel da rota ---
  function ensureLiveLine() {
    if (document.getElementById('route-live')) return;
    var stats = document.querySelector('#route-panel .route-stats');
    if (!stats) return;
    var div = document.createElement('div');
    div.id = 'route-live';
    div.style.cssText = 'margin-top:8px;font-size:13px;display:none;width:100%';
    stats.appendChild(div);
  }

  async function refreshLive() {
    var code = null;
    try { code = localStorage.getItem('enebras-live-code'); } catch (e) {}
    if (!code) { toast('Compartilhe uma rota primeiro', 'info'); return; }
    if (!isConfigured()) { toast('Backend não configurado', 'error'); return; }
    try {
      var rows = await getCheckins(code);
      var outs = rows.filter(function (r) { return r.kind === 'checkout'; }).length;
      var ins = rows.filter(function (r) { return r.kind === 'checkin'; }).length;
      var div = document.getElementById('route-live');
      if (div) {
        div.style.display = '';
        div.innerHTML = '🔴 AO VIVO <b>' + code + '</b>: ' + outs + ' concluídas • ' + ins + ' check-ins ' +
          '<button id="route-live-refresh" style="margin-left:8px">↻ Atualizar</button>';
        var b = document.getElementById('route-live-refresh');
        if (b) b.addEventListener('click', refreshLive);
      }
      toast('Rota ' + code + ': ' + outs + ' concluídas', 'success');
    } catch (e) {
      toast('Erro ao buscar: ' + e.message, 'error');
    }
  }

  // --- Hiago: compartilhar prefere nuvem, cai p/ offline se falhar ---
  function upgradeShare() {
    if (!window.RouteShare || !window.RouteShare.shareRoute) return;
    var offline = window.RouteShare.shareRoute;
    window.RouteShare.shareRoute = async function () {
      var stops = [];
      try {
        if (typeof lastDayRoute !== 'undefined' && lastDayRoute && lastDayRoute.ordered && lastDayRoute.ordered.length) {
          stops = lastDayRoute.ordered;
        } else if (typeof selectedIds !== 'undefined' && selectedIds.size > 0) {
          stops = clients.filter(function (c) { return selectedIds.has(c.id); });
        } else if (typeof filteredClients !== 'undefined') {
          stops = filteredClients.slice(0, 12);
        }
      } catch (e) {}
      if (!stops.length) { offline(); return; }
      if (!isConfigured()) { offline(); return; }
      var tech = '';
      var techEmail = null;
      try { tech = localStorage.getItem('enebras-share-tech') || ''; } catch (e) {}
      if (window.TeamAuth && TeamAuth.isAdmin()) {
        try {
          var pick = await TeamAuth.pickTechnician();
          if (pick) { tech = pick.nome; techEmail = pick.email; }
        } catch (e) {}
      }
      if (!techEmail) {
        tech = (prompt('Nome do técnico para esta rota:', tech || '') || '').trim();
        if (!tech) { toast('Compartilhamento cancelado', 'info'); return; }
      }
      try { localStorage.setItem('enebras-share-tech', tech); } catch (e) {}
      toast('Enviando rota para a nuvem...', 'info');
      try {
        var res = await createRoute(tech, stops, techEmail);
        try { localStorage.setItem('enebras-live-code', res.code); } catch (e) {}
        window.liveRouteCode = res.code;
        try { if (window.OSFlow && OSFlow.onRouteShared) OSFlow.onRouteShared(res.code); } catch (e) {}
        var L = [];
        L.push('ROTA DO DIA — ' + tech + ' (' + res.payload.date + ') — Enebras');
        res.payload.stops.forEach(function (s, i) {
          var addr = [s.a, s.c && (s.c + '/' + (s.u || ''))].filter(Boolean).join(' — ');
          L.push((i + 1) + ') ' + s.n + (addr ? ' — ' + addr : ''));
          var nav = (s.lat != null && s.lng != null)
            ? 'https://www.google.com/maps/dir/?api=1&destination=' + s.lat + ',' + s.lng
            : 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent([s.a, s.c, s.u].filter(Boolean).join(', '));
          L.push('   Navegar: ' + nav);
        });
        L.push('Mapa da rota (abrir no celular): ' + res.url);
        var text = L.join('\n');
        var ok = false;
        try {
          if (typeof copyText === 'function') ok = await copyText(text);
          else if (navigator.clipboard) { await navigator.clipboard.writeText(text); ok = true; }
        } catch (e) {}
        ensureLiveLine();
        refreshLive();
        toast(ok ? 'Rota ' + res.code + ' no ar! Texto copiado. 📋' : 'Rota ' + res.code + ' criada, mas copie manualmente', ok ? 'success' : 'error');
        if (!ok) prompt('Copie o texto da rota:', text);
      } catch (e) {
        toast('Nuvem falhou (' + e.message + ') — usando modo offline', 'error');
        offline();
      }
    };
    // Botão "ao vivo" reaproveita o refresh
    document.addEventListener('click', function (ev) {
      if (ev.target && ev.target.id === 'route-live-refresh') refreshLive();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    upgradeShare();
    wrapVisitFns();
    setTimeout(wrapVisitFns, 1500);
    bootReceiver();
    ensureLiveLine();
    setTimeout(ensureLiveLine, 1500);
    // Se o técnico já tem código salvo, retoma o modo ao vivo
    try {
      var saved = localStorage.getItem('enebras-live-code');
      if (saved && !parseCode() && isConfigured()) window.liveRouteCode = saved;
    } catch (e) {}
  });

  window.LiveSync = {
    isConfigured: isConfigured,
    createRoute: createRoute,
    getRoute: getRoute,
    sendCheckin: sendCheckin,
    getCheckins: getCheckins,
    refreshLive: refreshLive
  };
})();
