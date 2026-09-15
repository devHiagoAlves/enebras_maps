// ═══════════════════════════════════════════════════════════════
// Enebras Mapa — Compartilhar rota p/ técnico (link do app)
// Sem backend: a rota viaja dentro do próprio link (#rota=...).
// Fluxo: Hiago calcula o roteiro > clica "Enviar p/ técnico"
// > envia o texto ao técnico > técnico abre o link no celular
// e cai direto nas visitas do dia, mesmo sem ter nada cadastrado.
// ═══════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var SHARED_ID_BASE = 900000;
  var MAX_URL_WARN = 2000;

  // --- base64url seguro p/ UTF-8 (acentos) ---
  function b64encode(str) {
    var b64 = btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function (_, h) {
      return String.fromCharCode(parseInt(h, 16));
    }));
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function b64decode(b64url) {
    var b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var td = new TextDecoder();
    return td.decode(bytes);
  }

  function norm(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }

  function todayBR() {
    try {
      return new Date().toLocaleDateString('pt-BR');
    } catch (e) { return ''; }
  }

  // --- Monta o payload a partir do roteiro calculado ou da seleção ---
  function currentStops() {
    try {
      if (typeof lastDayRoute !== 'undefined' && lastDayRoute && lastDayRoute.ordered && lastDayRoute.ordered.length) {
        return lastDayRoute.ordered;
      }
    } catch (e) {}
    try {
      if (typeof selectedIds !== 'undefined' && selectedIds.size > 0 && typeof clients !== 'undefined') {
        var sel = clients.filter(function (c) { return selectedIds.has(c.id); });
        if (sel.length) return sel;
      }
    } catch (e) {}
    try {
      if (typeof filteredClients !== 'undefined' && filteredClients.length) {
        return filteredClients.slice(0, 12);
      }
    } catch (e) {}
    return [];
  }

  function buildPayload(tech, stops) {
    return {
      v: 1,
      tech: tech || '',
      date: todayBR(),
      stops: stops.slice(0, 12).map(function (c) {
        return {
          n: c.name || '',
          a: c.address || '',
          c: c.city || '',
          u: c.state || '',
          lat: typeof c.lat === 'number' ? Math.round(c.lat * 100000) / 100000 : null,
          lng: typeof c.lng === 'number' ? Math.round(c.lng * 100000) / 100000 : null,
          p: c.phone || ''
        };
      })
    };
  }

  function buildShareUrl(payload) {
    var code = b64encode(JSON.stringify(payload));
    var base = location.origin + location.pathname;
    // file:// não tem origin útil — usa href sem hash como base
    if (!location.origin || location.origin === 'null') {
      base = location.href.split('#')[0];
    }
    return base + '#rota=' + code;
  }

  function navLink(s) {
    if (s.lat != null && s.lng != null) {
      return 'https://www.google.com/maps/dir/?api=1&destination=' + s.lat + ',' + s.lng;
    }
    var q = encodeURIComponent([s.a, s.c, s.u].filter(Boolean).join(', '));
    return 'https://www.google.com/maps/dir/?api=1&destination=' + q;
  }

  function buildShareText(payload, shareUrl) {
    var lines = [];
    lines.push('ROTA DO DIA — ' + (payload.tech || 'Técnico') + ' (' + payload.date + ') — Enebras');
    payload.stops.forEach(function (s, i) {
      var addr = [s.a, s.c && (s.c + '/' + (s.u || ''))].filter(Boolean).join(' — ');
      lines.push((i + 1) + ') ' + s.n + (addr ? ' — ' + addr : ''));
      lines.push('   Navegar: ' + navLink(s));
    });
    lines.push('Mapa da rota (abrir no celular): ' + shareUrl);
    if (shareUrl.length > MAX_URL_WARN) {
      lines.push('⚠️ Link longo: se não abrir, me avisa que mando em 2 partes.');
    }
    return lines.join('\n');
  }

  function copyFallback(text, done) {
    if (typeof copyText === 'function') {
      copyText(text).then(done);
      return;
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
      } else {
        var ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        done(!!ok);
      }
    } catch (e) { done(false); }
  }

  function toast(msg, type) {
    if (typeof showToast === 'function') showToast(msg, type || 'info');
    else alert(msg);
  }

  // --- Ação: compartilhar ---
  function shareRoute() {
    var stops = currentStops();
    if (!stops.length) {
      toast('Selecione clientes ou calcule o roteiro primeiro', 'info');
      return;
    }
    var tech = '';
    try {
      tech = localStorage.getItem('enebras-share-tech') || '';
    } catch (e) {}
    tech = prompt('Nome do técnico para esta rota:', tech || '') || '';
    tech = tech.trim();
    if (!tech) {
      toast('Compartilhamento cancelado', 'info');
      return;
    }
    try { localStorage.setItem('enebras-share-tech', tech); } catch (e) {}

    var payload = buildPayload(tech, stops);
    var url = buildShareUrl(payload);
    var text = buildShareText(payload, url);
    copyFallback(text, function (ok) {
      toast(ok ? 'Texto copiado! Envie ao técnico. 📋' : 'Erro ao copiar — copie manualmente', ok ? 'success' : 'error');
      if (!ok) prompt('Copie o texto da rota:', text);
    });
  }

  // --- Receptor: técnico abre o link ---
  function parseHash() {
    var h = location.hash || '';
    var m = h.match(/^#rota=(.+)$/);
    if (!m) return null;
    try {
      var payload = JSON.parse(b64decode(m[1]));
      if (!payload || !Array.isArray(payload.stops) || !payload.stops.length) return null;
      return payload;
    } catch (e) { return null; }
  }

  function findMatch(stop) {
    if (typeof clients === 'undefined') return null;
    var nn = norm(stop.n), aa = norm(stop.a);
    return clients.find(function (c) {
      return norm(c.name) === nn && (!aa || norm(c.address) === aa);
    }) || null;
  }

  function applySharedRoute(payload, attempt) {
    attempt = attempt || 0;
    // Aguarda o app carregar (clients, DB, seleção)
    if (typeof clients === 'undefined' || typeof selectedIds === 'undefined' || typeof loadSelection === 'undefined') {
      if (attempt < 20) setTimeout(function () { applySharedRoute(payload, attempt + 1); }, 500);
      return;
    }
    try { loadSelection(); } catch (e) {}

    var ids = [];
    var pending = [];
    payload.stops.forEach(function (s, i) {
      var hit = null;
      try { hit = findMatch(s); } catch (e) {}
      if (hit) { ids.push(hit.id); return; }
      var c = {
        id: SHARED_ID_BASE + i,
        name: s.n, address: s.a, city: s.c, state: s.u,
        lat: s.lat, lng: s.lng, phone: s.p || '',
        shared: true
      };
      pending.push(c);
      ids.push(c.id);
    });

    function finish() {
      try {
        pending.forEach(function (c) {
          if (!clients.some(function (x) { return x.id === c.id; })) clients.push(c);
        });
        selectedIds = new Set(ids);
        if (typeof saveSelection === 'function') saveSelection();
        if (typeof updateSelectionBar === 'function') updateSelectionBar();
        if (typeof renderClients === 'function') renderClients();
        if (typeof renderMarkers === 'function') renderMarkers();
        if (typeof setFieldView === 'function') setFieldView('visits');
        try { localStorage.setItem('enebras-shared-tech', payload.tech || ''); } catch (e) {}
        toast('Rota de ' + (payload.tech || 'hoje') + ' carregada ✓ (' + ids.length + ' visitas)', 'success');
        try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
      } catch (e) {
        toast('Erro ao carregar a rota: ' + e.message, 'error');
      }
    }

    // Persiste no IndexedDB p/ sobreviver a reload no celular
    if (pending.length && typeof clientDB !== 'undefined' && clientDB.db) {
      var chain = Promise.resolve();
      pending.forEach(function (c) {
        chain = chain.then(function () {
          return clientDB.add(Object.assign({}, c, { id: undefined })).then(function (newId) {
            var idx = ids.indexOf(c.id);
            if (idx >= 0) ids[idx] = newId;
            c.id = newId;
          }).catch(function () {});
        });
      });
      chain.then(finish);
    } else {
      finish();
    }
  }

  // --- Retorno do técnico (cola de volta como retorno) ---
  function copyReturn() {
    var list = [];
    try {
      if (typeof getTodayList === 'function') list = getTodayList();
      else if (typeof clients !== 'undefined') list = clients.slice(0, 12);
    } catch (e) {}
    if (!list.length) { toast('Sem visitas hoje', 'info'); return; }
    var tech = '';
    try { tech = localStorage.getItem('enebras-shared-tech') || localStorage.getItem('enebras-share-tech') || ''; } catch (e) {}
    var done = 0;
    var lines = ['RETORNO — ' + (tech || 'Técnico') + ' (' + todayBR() + ')'];
    list.forEach(function (c, i) {
      var v = null;
      try { v = (typeof todayVisits !== 'undefined') ? todayVisits.get(c.id) : null; } catch (e) {}
      var st = !v ? '⏳ pendente' : (v.checkoutAt ? ('✅ ' + (v.status === 'return' ? 'retorno' : v.status === 'pending' ? 'pendente' : 'concluída')) : '🔧 em visita');
      if (v && v.checkoutAt) done++;
      var obs = v && v.note ? ' — ' + v.note : '';
      lines.push((i + 1) + ') ' + (c.name || '') + ' — ' + st + obs);
    });
    lines.push('Total: ' + done + '/' + list.length + ' concluídas');
    copyFallback(lines.join('\n'), function (ok) {
      toast(ok ? 'Retorno copiado! Compartilhe com o técnico. 📋' : 'Erro ao copiar', ok ? 'success' : 'error');
    });
  }

  function updateReturnButton() {
    var btn = document.getElementById('field-return-btn');
    if (!btn) return;
    var n = 0;
    try { n = (typeof getTodayList === 'function') ? getTodayList().length : 0; } catch (e) {}
    btn.style.display = n === 0 ? 'none' : '';
  }

  function ensureReturnButton() {
    if (document.getElementById('field-return-btn')) { updateReturnButton(); return; }
    var anchor = document.getElementById('field-today-count');
    if (!anchor) return;
    var btn = document.createElement('button');
    btn.id = 'field-return-btn';
    btn.className = 'modal-btn edit';
    btn.style.cssText = 'margin:8px 0;width:100%';
    btn.textContent = '📋 Copiar retorno';
    btn.addEventListener('click', copyReturn);
    anchor.parentNode.insertBefore(btn, anchor.nextSibling);
    updateReturnButton();
  }

  // --- Boot ---
  document.addEventListener('DOMContentLoaded', function () {
    var shareBtn = document.getElementById('route-share');
    if (shareBtn) shareBtn.addEventListener('click', shareRoute);
    ensureReturnButton();
    var payload = parseHash();
    if (payload) applySharedRoute(payload);
  });

  window.RouteShare = { shareRoute: shareRoute, copyReturn: copyReturn, parseHash: parseHash, updateReturnButton: updateReturnButton };
})();
