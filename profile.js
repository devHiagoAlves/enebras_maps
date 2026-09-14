// ═══════════════════════════════════════════════════════════════
// Enebras Mapa — Perfil + gestão de usuários (adm) v8.8
// Meu perfil: foto (upload p/ Storage), nome, trocar senha.
// Adm: lista usuários, edita (nome/papel/equipe/ativo) e cria novos
// sem entrar no banco (usa signup público + perfil).
// ═══════════════════════════════════════════════════════════════
(function () {
  'use strict';

  function cfg() {
    try { return window.ENEBRAS_BACKEND || {}; } catch (e) { return {}; }
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
  function sess() {
    try { return JSON.parse(localStorage.getItem('enebras-session') || 'null'); }
    catch (e) { return null; }
  }
  function authH() {
    var s = sess();
    return {
      'apikey': cfg().SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + (s ? s.access_token : cfg().SUPABASE_ANON_KEY),
      'Content-Type': 'application/json'
    };
  }
  function myProfile() {
    try { return window.TeamAuth ? TeamAuth.myProfile() : null; } catch (e) { return null; }
  }
  function isAdmin() {
    try { return window.TeamAuth && TeamAuth.isAdmin(); } catch (e) { return false; }
  }

  // --- Foto: comprime no celular antes de subir ---
  function compressAvatar(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        try {
          var S = 256;
          var c = document.createElement('canvas');
          c.width = S; c.height = S;
          var ctx = c.getContext('2d');
          var side = Math.min(img.width, img.height);
          ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, S, S);
          c.toBlob(function (b) { b ? resolve(b) : reject(new Error('Falha ao comprimir')); }, 'image/jpeg', 0.8);
        } catch (e) { reject(e); }
        URL.revokeObjectURL(img.src);
      };
      img.onerror = function () { reject(new Error('Foto inválida')); };
      img.src = URL.createObjectURL(file);
    });
  }

  async function uploadAvatar(uid, blob) {
    var res = await fetch(base() + '/storage/v1/object/avatars/' + uid + '/avatar.jpg', {
      method: 'POST',
      headers: {
        'apikey': cfg().SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + sess().access_token,
        'Content-Type': 'image/jpeg',
        'x-upsert': 'true'
      },
      body: blob
    });
    if (!res.ok) {
      var t = '';
      try { t = await res.text(); } catch (e) {}
      throw new Error('Upload falhou (' + res.status + ') ' + t.slice(0, 80));
    }
    return base() + '/storage/v1/object/public/avatars/' + uid + '/avatar.jpg?t=' + Date.now();
  }

  // --- Página de perfil ---
  function openProfile() {
    var me = myProfile();
    if (!me) { toast('Faça login primeiro', 'info'); return; }
    if (document.getElementById('profile-page')) return;
    var admin = isAdmin();
    var ov = document.createElement('div');
    ov.id = 'profile-page';
    ov.className = 'os-overlay';
    ov.innerHTML =
      '<div class="os-sheet">' +
      '<div class="os-head"><div><h2>Perfil</h2><span class="photos-hint">' + esc(me.email) + '</span></div>' +
      '<button id="profile-close" class="modal-close">✕</button></div>' +
      '<div class="os-tools">' +
      '<button id="ptab-me" class="modal-btn save">Meu perfil</button>' +
      (admin ? '<button id="ptab-users" class="modal-btn edit">Usuários</button>' : '') +
      '</div>' +
      '<div id="profile-body" class="os-list"></div>' +
      '</div>';
    document.body.appendChild(ov);
    ov.querySelector('#profile-close').addEventListener('click', function () { ov.remove(); });
    ov.querySelector('#ptab-me').addEventListener('click', renderMe);
    if (admin) ov.querySelector('#ptab-users').addEventListener('click', renderUsers);
    renderMe();
  }

  function renderMe() {
    var me = myProfile();
    var box = document.getElementById('profile-body');
    if (!box || !me) return;
    box.innerHTML =
      '<div class="pf-center"><img id="pf-photo" class="pf-photo" src="' + esc(me.photo_url || '') + '" style="' + (me.photo_url ? '' : 'display:none') + '">' +
      '<div id="pf-noavatar" class="pf-noavatar" style="' + (me.photo_url ? 'display:none' : '') + '">' + esc((me.nome || me.email || '?').trim().charAt(0).toUpperCase()) + '</div></div>' +
      '<label for="pf-file" class="modal-btn edit photo-btn">📷 Trocar foto</label>' +
      '<input type="file" id="pf-file" accept="image/*" style="display:none">' +
      '<div class="form-group"><label>Nome</label><input id="pf-nome" class="form-input" value="' + esc(me.nome || '') + '"></div>' +
      '<button id="pf-save" class="modal-btn save">Salvar perfil</button>' +
      '<div class="form-group" style="margin-top:14px"><label>Nova senha</label><input id="pf-pass" class="form-input" type="password" placeholder="Mínimo 6 caracteres"></div>' +
      '<button id="pf-pass-save" class="modal-btn edit">Trocar senha</button>';
    box.querySelector('#pf-file').addEventListener('change', async function (ev) {
      var f = ev.target.files[0];
      if (!f) return;
      toast('Enviando foto...', 'info');
      try {
        var blob = await compressAvatar(f);
        var url = await uploadAvatar(me.id, blob);
        await updateProfile(me.id, { photo_url: url.split('?')[0] });
        me.photo_url = url;
        refreshChip();
        toast('Foto atualizada ✓', 'success');
        renderMe();
      } catch (e) {
        toast('Erro: ' + e.message, 'error');
      }
    });
    box.querySelector('#pf-save').addEventListener('click', async function () {
      try {
        await updateProfile(me.id, { nome: box.querySelector('#pf-nome').value.trim() });
        me.nome = box.querySelector('#pf-nome').value.trim();
        refreshChip();
        toast('Perfil salvo ✓', 'success');
      } catch (e) { toast('Erro: ' + e.message, 'error'); }
    });
    box.querySelector('#pf-pass-save').addEventListener('click', async function () {
      var np = box.querySelector('#pf-pass').value;
      if (!np || np.length < 6) { toast('Senha curta demais', 'error'); return; }
      try {
        var res = await fetch(base() + '/auth/v1/user', {
          method: 'PUT', headers: authH(), body: JSON.stringify({ password: np })
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        box.querySelector('#pf-pass').value = '';
        toast('Senha trocada ✓', 'success');
      } catch (e) { toast('Erro: ' + e.message, 'error'); }
    });
  }

  async function updateProfile(id, patch) {
    var res = await fetch(base() + '/rest/v1/profiles?id=eq.' + id, {
      method: 'PATCH', headers: authH(), body: JSON.stringify(patch)
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
  }

  function refreshChip() {
    try {
      var me = myProfile();
      if (!me) return;
      var nm = document.getElementById('auth-side-name');
      var av = document.getElementById('auth-avatar');
      if (nm) nm.textContent = me.nome || me.email;
      if (av) {
        av.innerHTML = me.photo_url
          ? '<img src="' + esc(me.photo_url) + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover">'
          : esc((me.nome || me.email || '?').trim().charAt(0).toUpperCase());
      }
    } catch (e) {}
  }

  // --- Adm: lista, edita e cria usuários ---
  async function renderUsers() {
    var box = document.getElementById('profile-body');
    if (!box) return;
    box.innerHTML = '<span class="photos-hint">Carregando usuários...</span>';
    try {
      var res = await fetch(base() + '/rest/v1/profiles?select=id,email,nome,role,equipe,active,photo_url&order=nome.asc', {
        headers: authH()
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var rows = await res.json();
      box.innerHTML =
        '<button id="usr-new" class="modal-btn save">➕ Novo usuário</button>' +
        '<div id="usr-list">' + rows.map(usrCard).join('') + '</div>';
      box.querySelector('#usr-new').addEventListener('click', newUserForm);
      box.querySelectorAll('[data-save]').forEach(function (btn) {
        btn.addEventListener('click', function () { saveUser(btn.getAttribute('data-save')); });
      });
    } catch (e) {
      box.innerHTML = '<span class="photos-hint">Erro: ' + esc(e.message) + '</span>';
    }
  }

  function usrCard(u) {
    return '<div class="os-card" style="border-left-color:' + (u.active === false ? '#64748b' : '#38bdf8') + '">' +
      '<div class="os-title">' + esc(u.nome || u.email) + '</div>' +
      '<div class="os-meta">' + esc(u.email) + '</div>' +
      '<div class="os-2col" style="margin-top:6px">' +
      '<div class="form-group"><label>Papel</label><select id="role-' + u.id + '" class="form-input">' +
      '<option value="tecnico"' + (u.role === 'tecnico' ? ' selected' : '') + '>Técnico</option>' +
      '<option value="admin"' + (u.role === 'admin' ? ' selected' : '') + '>Adm</option></select></div>' +
      '<div class="form-group"><label>Equipe</label><input id="eq-' + u.id + '" class="form-input" value="' + esc(u.equipe || '') + '" placeholder="Ex.: SP-01"></div>' +
      '</div>' +
      '<div class="os-actions"><button class="modal-btn save" data-save="' + u.id + '">Salvar</button>' +
      '<button class="modal-btn ' + (u.active === false ? 'edit' : 'cancel') + '" data-save="' + u.id + '|toggle">' +
      (u.active === false ? 'Reativar' : 'Desativar') + '</button></div></div>';
  }

  async function saveUser(attr) {
    try {
      var parts = attr.split('|');
      var id = parts[0];
      if (parts[1] === 'toggle') {
        var card = document.querySelector('[data-save="' + attr + '"]');
        var reactivating = card && card.textContent === 'Reativar';
        await updateProfile(id, { active: reactivating });
        toast(reactivating ? 'Usuário reativado ✓' : 'Usuário desativado ✓', 'success');
      } else {
        await updateProfile(id, {
          role: document.getElementById('role-' + id).value,
          equipe: document.getElementById('eq-' + id).value.trim() || null
        });
        toast('Usuário atualizado ✓', 'success');
      }
      renderUsers();
    } catch (e) { toast('Erro: ' + e.message, 'error'); }
  }

  function newUserForm() {
    var box = document.getElementById('profile-body');
    box.innerHTML =
      '<div class="form-group"><label>Nome</label><input id="nu-nome" class="form-input" placeholder="Ex.: João Silva"></div>' +
      '<div class="form-group"><label>E-mail (login)</label><input id="nu-email" class="form-input" type="email" placeholder="joao@enebras.com.br"></div>' +
      '<div class="os-2col"><div class="form-group"><label>Senha inicial</label><input id="nu-pass" class="form-input" value="Enebras123!"></div>' +
      '<div class="form-group"><label>Papel</label><select id="nu-role" class="form-input"><option value="tecnico">Técnico</option><option value="admin">Adm</option></select></div></div>' +
      '<div class="auth-row"><button id="nu-ok" class="modal-btn save">Criar</button>' +
      '<button id="nu-back" class="modal-btn cancel">Voltar</button></div>' +
      '<span class="photos-hint">Se der erro de confirmação, desative "Confirm email" em Authentication → Sign In/Up no dashboard.</span>';
    box.querySelector('#nu-back').addEventListener('click', renderUsers);
    box.querySelector('#nu-ok').addEventListener('click', async function () {
      var nome = box.querySelector('#nu-nome').value.trim();
      var email = box.querySelector('#nu-email').value.trim();
      var pass = box.querySelector('#nu-pass').value;
      var role = box.querySelector('#nu-role').value;
      if (!nome || !email || !pass) { toast('Preencha tudo', 'error'); return; }
      box.querySelector('#nu-ok').textContent = 'Criando...';
      try {
        var r = await fetch(base() + '/auth/v1/signup', {
          method: 'POST',
          headers: { apikey: cfg().SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, password: pass, options: { data: { nome: nome } } })
        });
        var data = await r.json();
        if (!r.ok) throw new Error(data.msg || data.error || ('HTTP ' + r.status));
        if (!data.user) throw new Error('Sem retorno — confira "Confirm email" no dashboard');
        await updateProfile(data.user.id, { nome: nome, role: role });
        toast('Usuário ' + email + ' criado ✓', 'success');
        renderUsers();
      } catch (e) {
        box.querySelector('#nu-ok').textContent = 'Criar';
        toast('Erro: ' + e.message, 'error');
      }
    });
  }

  // Abre pelo clique no chip da sidebar
  document.addEventListener('DOMContentLoaded', function () {
    document.addEventListener('click', function (ev) {
      var chip = ev.target && ev.target.closest ? ev.target.closest('#auth-side') : null;
      if (chip && !(ev.target.closest && ev.target.closest('#auth-side-logout'))) openProfile();
    });
  });

  window.ProfilePage = { openProfile: openProfile, refreshChip: refreshChip };
})();
