// ═══════════════════════════════════════════════════════════════
// Enebras Mapa — Fase A: Ordens de Serviço + Agenda v8.1
// OS com ciclo de vida (aberta → agendada → deslocamento → local →
// execução → finalizada). A rota do dia nasce das OSs agendadas; o
// check-in/out do técnico move o status sozinho.
// Exige backend configurado (as OSs moram na nuvem).
// ═══════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var STATUS = {
    aberta: 'Aberta', agendada: 'Agendada', em_deslocamento: 'Em deslocamento',
    no_local: 'No local', em_execucao: 'Em execução',
    finalizada: 'Finalizada', cancelada: 'Cancelada'
  };
  var TYPES = {
    preventiva: 'Preventiva', corretiva: 'Corretiva', instalacao: 'Instalação',
    inspecao: 'Inspeção', pmoc: 'PMOC', emergencial: 'Emergencial', visita: 'Visita técnica'
  };
  var FLOW = ['aberta', 'agendada', 'em_deslocamento', 'no_local', 'em_execucao', 'finalizada'];
  var ACTIVE = ['aberta', 'agendada', 'em_deslocamento', 'no_local', 'em_execucao'];

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
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function meEmail() {
    try {
      var s = JSON.parse(localStorage.getItem('enebras-session') || 'null');
      return s && s.user ? s.user.email : null;
    } catch (e) { return null; }
  }
  function isAdmin() {
    try { return window.TeamAuth && TeamAuth.isAdmin(); } catch (e) { return false; }
  }

  function headers() {
    var h = { 'apikey': cfg().SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
    try {
      var s = JSON.parse(localStorage.getItem('enebras-session') || 'null');
      h['Authorization'] = 'Bearer ' + (s ? s.access_token : cfg().SUPABASE_ANON_KEY);
    } catch (e) {
      h['Authorization'] = 'Bearer ' + cfg().SUPABASE_ANON_KEY;
    }
    return h;
  }

  async function rest(method, path, body, extra) {
    var opt = { method: method, headers: headers() };
    if (body !== undefined) opt.body = JSON.stringify(body);
    if (method === 'POST') opt.headers['Prefer'] = 'return=representation';
    var res = await fetch(base() + '/rest/v1/' + path + (extra || ''), opt);
    if (!res.ok) {
      var t = '';
      try { t = await res.text(); } catch (e) {}
      throw new Error('Supabase ' + res.status + ' ' + t.slice(0, 100));
    }
    try { return await res.json(); } catch (e) { return null; }
  }

  function randomCode() {
    var d = new Date();
    var stamp = String(d.getFullYear()).slice(2) +
      String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    var chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', r = '';
    for (var i = 0; i < 3; i++) r += chars[Math.floor(Math.random() * chars.length)];
    return 'OS-' + stamp + '-' + r;
  }

  // Numeração oficial sequencial por ano: OS-2026-0001...
  async function nextCode() {
    var year = new Date().getFullYear();
    try {
      var rows = await rest('GET', 'tasks', undefined,
        '?code=like.OS-' + year + '-*&select=code&order=code.desc&limit=1');
      var max = 0;
      (rows || []).forEach(function (r) {
        var m = /-(\d+)$/.exec(r.code || '');
        if (m) max = Math.max(max, parseInt(m[1], 10));
      });
      return 'OS-' + year + '-' + String(max + 1).padStart(4, '0');
    } catch (e) {
      return randomCode();
    }
  }

  // --- CRUD ---
  async function listTasks(mode) {
    var q = 'select=*&order=scheduled_date.asc.nullslast,created_at.desc&limit=100';
    if (mode === 'mine') {
      var em = meEmail();
      q = 'tech_email=eq.' + encodeURIComponent(em || '__none__') + '&status=in.(' + ACTIVE.join(',') + ')&' + q;
    } else if (mode === 'today') {
      q = 'scheduled_date=eq.' + todayISO() + '&' + q;
    } else if (mode === 'open') {
      q = 'status=in.(' + ACTIVE.join(',') + ')&' + q;
    } else if (mode === 'done') {
      q = 'status=in.(finalizada,cancelada)&' + q;
    }
    return await rest('GET', 'tasks', undefined, '?' + q);
  }

  async function createTask(t) {
    var rows = await rest('POST', 'tasks', t);
    return rows && rows[0];
  }

  async function updateTask(id, patch) {
    patch.updated_at = new Date().toISOString();
    await rest('PATCH', 'tasks', patch, '?id=eq.' + id);
  }

  // --- Mapa cliente <-> OS ---
  function osClientMap() {
    try { return JSON.parse(localStorage.getItem('enebras-os-clients') || '{}'); }
    catch (e) { return {}; }
  }
  function saveOsClientMap(m) {
    try { localStorage.setItem('enebras-os-clients', JSON.stringify(m)); } catch (e) {}
  }

  async function ensureClientForTask(task) {
    var map = osClientMap();
    if (map[task.id]) {
      var found = clients.find(function (c) { return c.id === map[task.id]; });
      if (found) return found;
    }
    var norm = function (s) {
      return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    };
    var hit = clients.find(function (c) { return norm(c.name) === norm(task.client_name); });
    if (hit) {
      map[task.id] = hit.id;
      saveOsClientMap(map);
      return hit;
    }
    var c = {
      name: task.client_name, address: task.address || '', city: task.city || '',
      state: task.state || '', lat: task.lat, lng: task.lng, phone: task.phone || ''
    };
    if ((!c.lat || !c.lng) && typeof geocodeClients === 'function') {
      try {
        if (typeof showLoading === 'function') showLoading('Localizando endereço da OS...');
        await geocodeClients([c]);
        if (typeof hideLoading === 'function') hideLoading();
      } catch (e) {}
    }
    try {
      var newId = await clientDB.add(Object.assign({}, c));
      c.id = newId;
    } catch (e) {
      c.id = 910000 + task.id;
    }
    clients.push(c);
    map[task.id] = c.id;
    saveOsClientMap(map);
    try {
      if (typeof renderClients === 'function') renderClients();
      if (typeof renderMarkers === 'function') renderMarkers();
    } catch (e) {}
    return c;
  }

  function taskForClient(clientId) {
    var map = osClientMap(), taskId = null;
    Object.keys(map).forEach(function (k) { if (map[k] === clientId) taskId = parseInt(k, 10); });
    if (taskId != null && typeof osCache !== 'undefined' && osCache[taskId]) return osCache[taskId];
    return taskId != null ? { id: taskId } : null;
  }

  var osCache = {};

  // --- Painel de OSs ---
  var currentFilter = 'open';

  function openOsPanel() {
    if (!backendOn()) { toast('OSs precisam do backend configurado', 'error'); return; }
    if (document.getElementById('os-panel')) { renderOsList(); return; }
    var admin = isAdmin();
    currentFilter = admin ? 'open' : 'mine';
    var ov = document.createElement('div');
    ov.id = 'os-panel';
    ov.className = 'os-overlay';
    ov.innerHTML =
      '<div class="os-sheet">' +
      '<div class="os-head"><div><h2>Ordens de serviço</h2><span id="os-count" class="photos-hint"></span></div>' +
      '<button id="os-close" class="modal-close">✕</button></div>' +
      '<div class="os-tools">' +
      '<select id="os-filter" class="filter-select">' +
      (admin ? '<option value="open">Abertas</option><option value="today">Hoje</option><option value="done">Finalizadas</option>' : '') +
      '<option value="mine">Minhas</option>' +
      '</select>' +
      (admin ? '<button id="os-new" class="modal-btn save">➕ Nova OS</button>' : '') +
      (admin ? '<button id="os-route" class="modal-btn edit">🗺️ Roteiro das OSs</button>' : '') +
      '</div>' +
      '<div id="os-list" class="os-list"><span class="photos-hint">Carregando...</span></div>' +
      '</div>';
    document.body.appendChild(ov);
    ov.querySelector('#os-close').addEventListener('click', function () { ov.remove(); });
    ov.querySelector('#os-filter').value = currentFilter;
    ov.querySelector('#os-filter').addEventListener('change', function (ev) {
      currentFilter = ev.target.value;
      renderOsList();
    });
    if (admin) {
      ov.querySelector('#os-new').addEventListener('click', newOsModal);
      ov.querySelector('#os-route').addEventListener('click', routeFromTasks);
    }
    renderOsList();
  }

  async function renderOsList() {
    var box = document.getElementById('os-list');
    if (!box) return;
    box.innerHTML = '<span class="photos-hint">Carregando...</span>';
    try {
      var rows = await listTasks(currentFilter);
      rows.forEach(function (t) { osCache[t.id] = t; });
      var cnt = document.getElementById('os-count');
      if (cnt) cnt.textContent = rows.length + ' OS(s)';
      if (!rows.length) {
        box.innerHTML = '<span class="photos-hint">Nenhuma OS aqui. ' +
          (isAdmin() ? 'Crie com ➕ Nova OS.' : 'Aguarde o adm atribuir.') + '</span>';
        return;
      }
      box.innerHTML = rows.map(osCard).join('');
      box.querySelectorAll('[data-act]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          osAction(parseInt(btn.getAttribute('data-id'), 10), btn.getAttribute('data-act'));
        });
      });
    } catch (e) {
      box.innerHTML = '<span class="photos-hint">Erro: ' + esc(e.message) + '</span>';
    }
  }

  function osCard(t) {
    var st = STATUS[t.status] || t.status;
    var canAdvance = FLOW.indexOf(t.status) >= 0 && t.status !== 'finalizada';
    var next = canAdvance ? FLOW[FLOW.indexOf(t.status) + 1] : null;
    var html = '<div class="os-card st-' + t.status + '">' +
      '<div class="os-top"><b>' + esc(t.code) + '</b>' +
      '<span class="os-pill">' + esc(st) + '</span></div>' +
      '<div class="os-title">' + esc(t.title) + '</div>' +
      '<div class="os-meta">' + esc(t.client_name) +
      (t.city ? ' — ' + esc(t.city) + '/' + esc(t.state || '') : '') + '</div>' +
      '<div class="os-meta">' + esc(TYPES[t.type] || t.type) +
      (t.scheduled_date ? ' • ' + t.scheduled_date.split('-').reverse().join('/') : '') +
      (t.tech_email ? ' • ' + esc(t.tech_email.split('@')[0]) : ' • sem técnico') + '</div>' +
      '<div class="os-actions">' +
      '<button class="modal-btn save" data-act="open" data-id="' + t.id + '">Abrir</button>';
    if (next && next !== 'no_local' && next !== 'em_execucao' && next !== 'finalizada') {
      html += '<button class="modal-btn edit" data-act="go:' + next + '" data-id="' + t.id + '">▶ ' + esc(STATUS[next]) + '</button>';
    }
    if (t.status !== 'finalizada' && t.status !== 'cancelada') {
      html += '<button class="modal-btn cancel" data-act="go:cancelada" data-id="' + t.id + '">✕</button>';
    }
    return html + '</div></div>';
  }

  async function osAction(id, act) {
    var t = osCache[id];
    try {
      if (act === 'open') {
        if (!t) {
          var rows = await rest('GET', 'tasks', undefined, '?id=eq.' + id + '&select=*');
          t = rows[0];
          osCache[id] = t;
        }
        var c = await ensureClientForTask(t);
        window.editingTaskId = id;
        openVisit(c.id);
      } else if (act.indexOf('go:') === 0) {
        var next = act.slice(3);
        await updateTask(id, { status: next });
        if (osCache[id]) osCache[id].status = next;
        toast(t.code + ' → ' + (STATUS[next] || next), 'success');
        renderOsList();
      }
    } catch (e) {
      toast('Erro: ' + e.message, 'error');
    }
  }

  // --- Nova OS (adm) ---
  async function newOsModal(prefill) {
    var tecs = [];
    try {
      if (window.TeamAuth) {
        var res = await fetch(base() + '/rest/v1/profiles?role=eq.tecnico&select=nome,email&order=nome.asc', {
          headers: headers()
        });
        if (res.ok) tecs = await res.json();
      }
    } catch (e) {}
    var ov = document.createElement('div');
    ov.className = 'auth-overlay';
    ov.style.zIndex = 70;
    ov.innerHTML =
      '<div class="auth-card" style="max-width:420px">' +
      '<h2>Nova OS</h2>' +
      '<div class="form-group"><label>Resumo</label><input id="nos-title" class="form-input" placeholder="Ex.: Preventiva chiller — HEVA"></div>' +
      '<div class="form-group"><label>Cliente / local</label><input id="nos-client" class="form-input" placeholder="Ex.: HEVA"></div>' +
      '<div class="form-group"><label>Endereço</label><input id="nos-addr" class="form-input" placeholder="Rua, número"></div>' +
      '<div class="os-2col">' +
      '<div class="form-group"><label>Cidade</label><input id="nos-city" class="form-input"></div>' +
      '<div class="form-group"><label>UF</label><input id="nos-uf" class="form-input" maxlength="2" style="width:60px"></div>' +
      '</div>' +
      '<div class="os-2col">' +
      '<div class="form-group"><label>Tipo</label><select id="nos-type" class="form-input">' +
      Object.keys(TYPES).map(function (k) { return '<option value="' + k + '">' + TYPES[k] + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="form-group"><label>Prioridade</label><select id="nos-prio" class="form-input"><option value="normal">Normal</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select></div>' +
      '</div>' +
      '<div class="os-2col">' +
      '<div class="form-group"><label>Técnico</label><select id="nos-tec" class="form-input"><option value="">— depois —</option>' +
      tecs.map(function (t) { return '<option value="' + esc(t.email) + '">' + esc(t.nome || t.email) + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="form-group"><label>Data</label><input id="nos-date" class="form-input" type="date" value="' + todayISO() + '"></div>' +
      '</div>' +
      '<div class="form-group"><label>Descrição</label><textarea id="nos-notes" class="form-input" rows="3" placeholder="Descreva o serviço..."></textarea></div>' +
      '<div class="auth-row"><button id="nos-ok" class="modal-btn save">Criar OS</button>' +
      '<button id="nos-cancel" class="modal-btn cancel">Cancelar</button></div>' +
      '</div>';
    document.body.appendChild(ov);
    var $ = function (id) { return ov.querySelector('#' + id); };
    if (prefill) {
      if (prefill.client) $('nos-client').value = prefill.client;
      if (prefill.address) $('nos-addr').value = prefill.address;
      if (prefill.city) $('nos-city').value = prefill.city;
      if (prefill.state) $('nos-uf').value = prefill.state;
    }
    $('nos-cancel').addEventListener('click', function () { ov.remove(); });
    $('nos-ok').addEventListener('click', async function () {
      var client = $('nos-client').value.trim();
      var title = $('nos-title').value.trim() || client;
      if (!client) { toast('Informe o cliente', 'error'); return; }
      $('nos-ok').textContent = 'Criando...';
      try {
        if (typeof showLoading === 'function') showLoading('Criando OS...');
        var probe = {
          address: $('nos-addr').value.trim(), city: $('nos-city').value.trim(),
          state: $('nos-uf').value.trim().toUpperCase()
        };
        if (typeof geocodeClients === 'function' && probe.city && probe.state) {
          try { await geocodeClients([probe]); } catch (e) {}
        }
        var code = await nextCode();
        var created = await createTask({
          code: code,
          title: title, type: $('nos-type').value,
          status: $('nos-tec').value ? 'agendada' : 'aberta',
          priority: $('nos-prio').value, client_name: client,
          address: probe.address || null, city: probe.city || null, state: probe.state || null,
          lat: probe.lat || null, lng: probe.lng || null,
          tech_email: $('nos-tec').value || null,
          scheduled_date: $('nos-date').value || null,
          notes: $('nos-notes').value.trim() || null,
          created_by: meEmail()
        });
        ov.remove();
        toast('OS ' + created.code + ' criada ✓', 'success');
        renderOsList();
      } catch (e) {
        $('nos-ok').textContent = 'Criar OS';
        toast('Erro: ' + e.message, 'error');
      } finally {
        try { if (typeof hideLoading === 'function') hideLoading(); } catch (e) {}
      }
    });
  }

  // --- Roteiro nasce das OSs ---
  async function routeFromTasks() {
    try {
      var rows = await listTasks('today');
      var cands = rows.filter(function (t) { return ACTIVE.indexOf(t.status) >= 0; });
      if (!cands.length) {
        var open = await listTasks('open');
        cands = open.slice(0, 12);
      }
      if (!cands.length) { toast('Sem OSs para roteirizar', 'info'); return; }
      cands = cands.slice(0, 12);
      toast('Montando roteiro de ' + cands.length + ' OSs...', 'info');
      var map = {};
      for (var i = 0; i < cands.length; i++) {
        var c = await ensureClientForTask(cands[i]);
        map[c.id] = cands[i].id;
        osCache[cands[i].id] = cands[i];
      }
      selectedIds = new Set(Object.keys(map).map(Number));
      if (typeof saveSelection === 'function') saveSelection();
      if (typeof updateSelectionBar === 'function') updateSelectionBar();
      if (typeof renderClients === 'function') renderClients();
      if (typeof renderMarkers === 'function') renderMarkers();
      window.osTaskMap = map;
      try { localStorage.setItem('enebras-os-routemap', JSON.stringify(map)); } catch (e) {}
      document.getElementById('os-panel').remove();
      buildDayRoute();
    } catch (e) {
      toast('Erro: ' + e.message, 'error');
    }
  }

  // Chamado pelo supabase-sync após criar a rota na nuvem
  async function onRouteShared(code) {
    var map = window.osTaskMap || {};
    try { map = JSON.parse(localStorage.getItem('enebras-os-routemap') || '{}'); } catch (e) {}
    var ids = Object.keys(map).map(Number);
    if (!ids.length) return;
    try {
      await rest('PATCH', 'routes', { task_ids: ids }, '?code=eq.' + encodeURIComponent(code));
    } catch (e) {}
  }

  // --- Check-in/out move o status sozinho ---
  function linkedTaskId() {
    if (window.editingTaskId) return window.editingTaskId;
    try {
      if (typeof editingVisitId !== 'undefined') {
        var t = taskForClient(editingVisitId);
        if (t) return t.id;
      }
    } catch (e) {}
    return null;
  }

  async function setTaskStatus(taskId, status) {
    try {
      await updateTask(taskId, { status: status });
      if (osCache[taskId]) osCache[taskId].status = status;
    } catch (e) {}
  }

  function wrapFlow() {
    try {
      if (typeof doCheckin === 'function' && !doCheckin._osWrapped) {
        var _in = doCheckin;
        var wIn = async function () {
          var r = await _in.apply(this, arguments);
          var tid = linkedTaskId();
          if (tid && backendOn()) setTaskStatus(tid, 'no_local');
          return r;
        };
        wIn._osWrapped = true;
        wIn._liveWrapped = _in._liveWrapped;
        doCheckin = wIn;
      }
      if (typeof saveVisitForm === 'function' && !saveVisitForm._osWrapped) {
        var _sv = saveVisitForm;
        var wSv = async function () {
          var r = await _sv.apply(this, arguments);
          try {
            var tid = linkedTaskId();
            if (tid && backendOn() && osCache[tid] && osCache[tid].status === 'no_local') {
              setTaskStatus(tid, 'em_execucao');
            }
          } catch (e) {}
          return r;
        };
        wSv._osWrapped = true;
        saveVisitForm = wSv;
      }
      if (typeof doCheckout === 'function' && !doCheckout._osWrapped) {
        var _out = doCheckout;
        var wOut = async function () {
          var r = await _out.apply(this, arguments);
          var tid = linkedTaskId();
          if (tid && backendOn()) setTaskStatus(tid, 'finalizada');
          return r;
        };
        wOut._osWrapped = true;
        wOut._liveWrapped = _out._liveWrapped;
        doCheckout = wOut;
      }
      if (typeof closeVisit === 'function' && !closeVisit._osWrapped) {
        var _cv = closeVisit;
        var wCv = function () {
          window.editingTaskId = null;
          return _cv.apply(this, arguments);
        };
        wCv._osWrapped = true;
        closeVisit = wCv;
      }
    } catch (e) {}
  }

  // --- Boot ---
  document.addEventListener('DOMContentLoaded', function () {
    wrapFlow();
    setTimeout(wrapFlow, 2000);
    // Botão da sidebar (se existir)
    var btn = document.getElementById('os-btn');
    if (btn) btn.addEventListener('click', openOsPanel);
  });

  window.OSFlow = {
    openOsPanel: openOsPanel,
    newOsModal: function (prefill) {
      if (!backendOn()) { toast('OSs precisam do backend configurado', 'error'); return; }
      newOsModal(prefill);
    },
    onRouteShared: onRouteShared,
    listTasks: listTasks,
    updateTask: updateTask
  };
})();
