// ═══════════════════════════════════════════════════════════════
// Enebras Mapa — Turno + Semana v10.0
// Dashboard do turno (OSs, visitas e PMOC de hoje) + relatório
// semanal dos últimos 7 dias. 100% local-first: as OSs aparecem
// quando o backend está configurado; sem backend, mostra visitas
// locais + PMOC (que são offline).
// ═══════════════════════════════════════════════════════════════
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }
  function toast(msg, type) {
    if (typeof showToast === 'function') showToast(msg, type || 'info');
  }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function fmtBR(iso) {
    var p = String(iso || '').split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(iso || '');
  }
  function backendOn() {
    try { return window.LiveSync && LiveSync.isConfigured(); } catch (e) { return false; }
  }
  function isAdmin() {
    try {
      if (window.TeamAuth && typeof TeamAuth.isAdmin === 'function') return TeamAuth.isAdmin();
    } catch (e) {}
    return true; // sem login (modo offline legado): libera tudo local
  }
  function allClients() {
    try { return (typeof clients !== 'undefined' && clients) || []; } catch (e) { return []; }
  }
  function clientById(id) {
    var list = allClients();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function cname(id) {
    var c = clientById(id);
    return c ? (c.name || ('#' + id)) : ('#' + id);
  }
  // Sanitiza texto copiado contra CSV-injection no Excel (= + - @)
  function txtSafe(v) {
    var t = String(v == null ? '' : v);
    return /^[=+\-@\t\r]/.test(t) ? "'" + t : t;
  }
  async function copyTxt(text) {
    try {
      if (typeof copyText === 'function') return await copyText(text);
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) { return false; }
  }

  // --- Overlay (mesmo padrão visual do painel de OSs) ---
  var ov = null;
  function onEsc(e) { if (e && e.key === 'Escape') closeDash(); }
  function closeDash() {
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    ov = null;
    try { document.removeEventListener('keydown', onEsc); } catch (e) {}
  }
  function shell(title, sub) {
    closeDash();
    ov = document.createElement('div');
    ov.className = 'os-overlay';
    ov.innerHTML =
      '<div class="os-sheet">' +
      '<div class="os-head"><div><h2>' + esc(title) + '</h2><span class="photos-hint">' + esc(sub || '') + '</span></div>' +
      '<button class="modal-close" data-x>✕</button></div>' +
      '<div class="os-list" data-box><span class="photos-hint">Carregando...</span></div>' +
      '<div class="os-tools" data-foot></div>' +
      '</div>';
    document.body.appendChild(ov);
    ov.querySelector('[data-x]').addEventListener('click', closeDash);
    ov.addEventListener('click', function (e) { if (e.target === ov) closeDash(); });
    document.addEventListener('keydown', onEsc);
    return { box: ov.querySelector('[data-box]'), foot: ov.querySelector('[data-foot]') };
  }
  function kpis(items) {
    return '<div class="report-kpis">' + items.map(function (k) {
      return '<div class="report-kpi"><div class="report-kpi-value">' + esc(k[0]) + '</div><div class="report-kpi-label">' + esc(k[1]) + '</div></div>';
    }).join('') + '</div>';
  }
  function section(title, inner) {
    return '<div class="report-section"><h3>' + esc(title) + '</h3>' + inner + '</div>';
  }

  // ═══════════ DASHBOARD DO TURNO ═══════════
  async function openDash() {
    var today = todayISO();
    var ui = shell('📊 Turno de hoje', fmtBR(today));
    try {
      var visits = [];
      try { visits = await clientDB.getVisitsByDate(today); } catch (e) { visits = []; }
      var done = visits.filter(function (v) { return v.checkoutAt; });
      var open = visits.filter(function (v) { return v.checkinAt && !v.checkoutAt; });

      var pmocBad = [], pmocWarn = [];
      allClients().forEach(function (c) {
        try {
          var p = pmocInfo(c);
          if (p.state === 'bad') pmocBad.push(c);
          else if (p.state === 'warn') pmocWarn.push(c);
        } catch (e) {}
      });

      var osToday = null, osOpenN = null;
      if (backendOn() && window.OSFlow) {
        try { osToday = await window.OSFlow.listTasks(isAdmin() ? 'today' : 'mine'); } catch (e) { osToday = null; }
        try { if (isAdmin()) osOpenN = (await window.OSFlow.listTasks('open') || []).length; } catch (e) { osOpenN = null; }
      }

      var html = kpis([
        [osToday != null ? String(osToday.length) : '—', 'OSs hoje'],
        [osOpenN != null ? String(osOpenN) : '—', 'OSs abertas'],
        [done.length + '/' + visits.length, 'Visitas hoje'],
        [String(pmocBad.length), 'PMOC vencidos']
      ]);

      // OSs de hoje
      if (osToday != null) {
        var rows = osToday.slice(0, 8).map(function (t) {
          var meta = (t.client_name || '') + (t.tech_email ? ' • ' + String(t.tech_email).split('@')[0] : ' • sem técnico');
          return '<tr><td><b>' + esc(t.code || '') + '</b><br><span class="photos-hint">' + esc(meta) + '</span></td><td class="num">' + esc(t.status || '') + '</td></tr>';
        }).join('');
        html += section('OSs de hoje', '<table class="report-table"><tbody>' + (rows || '<tr><td>Nenhuma OS hoje</td></tr>') + '</tbody></table>');
      } else {
        html += section('OSs de hoje', '<span class="photos-hint">Sem backend — OSs aparecem aqui quando o Supabase está configurado.</span>');
      }

      // Em campo agora (check-in sem check-out)
      var field = open.slice(0, 8).map(function (v) {
        return '<tr><td>' + esc(cname(v.clientId)) + '</td><td class="num">🔧 em visita</td></tr>';
      }).join('');
      html += section('Técnicos em campo agora', '<table class="report-table"><tbody>' + (field || '<tr><td>Ninguém em visita no momento</td></tr>') + '</tbody></table>');

      // PMOC atenção
      var att = pmocBad.concat(pmocWarn).slice(0, 8).map(function (c) {
        return '<tr><td>' + esc(c.name || '') + '<br><span class="photos-hint">' + esc((c.city || '') + '/' + (c.state || '')) + '</span></td><td class="num">' + esc(pmocText(c)) + '</td></tr>';
      }).join('');
      html += section('PMOC atenção', '<table class="report-table"><tbody>' + (att || '<tr><td>Nenhum PMOC vencido ou vencendo 👍</td></tr>') + '</tbody></table>');

      ui.box.innerHTML = html;

      var btnCopy = document.createElement('button');
      btnCopy.className = 'modal-btn edit';
      btnCopy.textContent = '📋 Copiar resumo';
      btnCopy.addEventListener('click', async function () {
        var lines = [
          'TURNO ' + fmtBR(today) + ' — Enebras',
          'OSs hoje: ' + (osToday != null ? osToday.length : '—') + ' | OSs abertas: ' + (osOpenN != null ? osOpenN : '—'),
          'Visitas: ' + done.length + '/' + visits.length + ' concluídas' + (open.length ? ' (' + open.length + ' em campo)' : ''),
          'PMOC vencidos: ' + pmocBad.length + ' | vencendo 30d: ' + pmocWarn.length,
          pmocBad.slice(0, 5).map(function (c) { return '⚠️ ' + txtSafe(c.name) + ' — ' + txtSafe(pmocText(c)); }).join('\n')
        ].filter(Boolean).join('\n');
        var ok = await copyTxt(lines);
        toast(ok ? 'Resumo do turno copiado!' : 'Erro ao copiar', ok ? 'success' : 'error');
      });
      ui.foot.appendChild(btnCopy);

      if (backendOn() && window.OSFlow) {
        var btnOs = document.createElement('button');
        btnOs.className = 'modal-btn save';
        btnOs.textContent = '📋 Abrir OSs';
        btnOs.addEventListener('click', function () { closeDash(); window.OSFlow.openOsPanel(); });
        ui.foot.appendChild(btnOs);
      }
    } catch (e) {
      ui.box.innerHTML = '<span class="photos-hint">Erro: ' + esc(e.message || e) + '</span>';
    }
  }

  // ═══════════ RELATÓRIO SEMANAL ═══════════
  function isoDaysAgo(n) {
    var d = new Date();
    d.setDate(d.getDate() - n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  async function openWeek() {
    var ui = shell('🗓️ Últimos 7 dias', 'resumo p/ enviar ao cliente');
    try {
      var days = [];
      for (var i = 6; i >= 0; i--) days.push(isoDaysAgo(i));
      var perClient = {}, total = 0, tDone = 0, tPend = 0, tRet = 0;
      for (var d = 0; d < days.length; d++) {
        var vs = [];
        try { vs = await clientDB.getVisitsByDate(days[d]); } catch (e) { vs = []; }
        vs.forEach(function (v) {
          total++;
          var bucket = !v.checkoutAt ? 'pend' : (v.status === 'return' ? 'ret' : 'done');
          if (bucket === 'done') tDone++;
          else if (bucket === 'ret') tRet++;
          else tPend++;
          var c = clientById(v.clientId);
          var key = v.clientId;
          if (!perClient[key]) perClient[key] = { name: c ? c.name : ('#' + v.clientId), city: c ? (c.city || '') : '', done: 0, pend: 0, ret: 0, notes: [] };
          perClient[key][bucket]++;
          var nt = String(v.note || '').trim();
          if (nt && perClient[key].notes.length < 2) perClient[key].notes.push(nt);
        });
      }
      var list = Object.keys(perClient).map(function (k) { return perClient[k]; });
      list.sort(function (a, b) { return (b.done + b.pend + b.ret) - (a.done + a.pend + a.ret); });

      var html = kpis([
        [String(total), 'Visitas'],
        [String(tDone), 'Concluídas'],
        [String(tPend), 'Pendentes'],
        [String(tRet), 'Retornos']
      ]);
      var rows = list.slice(0, 30).map(function (r) {
        var det = '✓' + r.done + (r.pend ? ' • ⏳' + r.pend : '') + (r.ret ? ' • ↩' + r.ret : '');
        var obs = r.notes.length ? '<br><span class="photos-hint">' + esc(r.notes.join(' · ').slice(0, 90)) + '</span>' : '';
        return '<tr><td><b>' + esc(r.name) + '</b><br><span class="photos-hint">' + esc(r.city) + '</span>' + obs + '</td><td class="num">' + esc(det) + '</td></tr>';
      }).join('');
      html += section('Por cliente', '<table class="report-table"><tbody>' + (rows || '<tr><td>Sem visitas nos últimos 7 dias</td></tr>') + '</tbody></table>');
      ui.box.innerHTML = html;

      var toText = function () {
        var L = [
          'RESUMO SEMANAL — Enebras (' + fmtBR(days[0]) + ' a ' + fmtBR(days[6]) + ')',
          'Visitas: ' + total + ' | Concluídas: ' + tDone + ' | Pendentes: ' + tPend + ' | Retornos: ' + tRet,
          ''
        ];
        list.slice(0, 30).forEach(function (r, i) {
          L.push((i + 1) + ') ' + txtSafe(r.name) + (r.city ? ' — ' + txtSafe(r.city) : '') + ' — ✓' + r.done + (r.pend ? ' ⏳' + r.pend : '') + (r.ret ? ' ↩' + r.ret : ''));
          r.notes.forEach(function (n) { L.push('   obs: ' + txtSafe(n).slice(0, 100)); });
        });
        return L.join('\n');
      };

      var btnCopy = document.createElement('button');
      btnCopy.className = 'modal-btn edit';
      btnCopy.textContent = '📋 Copiar resumo';
      btnCopy.addEventListener('click', async function () {
        var ok = await copyTxt(toText());
        toast(ok ? 'Resumo semanal copiado!' : 'Erro ao copiar', ok ? 'success' : 'error');
      });
      ui.foot.appendChild(btnCopy);

      var btnPrint = document.createElement('button');
      btnPrint.className = 'modal-btn save';
      btnPrint.textContent = '🖨️ Imprimir';
      btnPrint.addEventListener('click', function () {
        var pr = list.slice(0, 30).map(function (r) {
          return '<tr><td>' + esc(r.name) + '</td><td>' + esc(r.city) + '</td><td>' + r.done + '</td><td>' + r.pend + '</td><td>' + r.ret + '</td></tr>';
        }).join('');
        if (typeof printHtml === 'function') {
          printHtml('Resumo semanal', fmtBR(days[0]) + ' a ' + fmtBR(days[6]) + ' • ' + total + ' visitas • ' + tDone + ' concluídas',
            ['Cliente', 'Cidade', 'Conc.', 'Pend.', 'Ret.'], pr || '<tr><td colspan="5">Sem visitas</td></tr>');
        }
      });
      ui.foot.appendChild(btnPrint);
    } catch (e) {
      ui.box.innerHTML = '<span class="photos-hint">Erro: ' + esc(e.message || e) + '</span>';
    }
  }

  // --- Boot ---
  document.addEventListener('DOMContentLoaded', function () {
    var b1 = document.getElementById('dash-btn');
    if (b1) b1.addEventListener('click', openDash);
    var b2 = document.getElementById('week-btn');
    if (b2) b2.addEventListener('click', openWeek);
  });

  window.TurnDash = { openDash: openDash, openWeek: openWeek, closeDash: closeDash };
})();
