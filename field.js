// Enebras Mapa — Modo Campo (mobile-first p/ equipe em visita)
// Views: visitas do dia / mapa. Check-in-out com GPS, foto, observação e status.

let fieldView = 'map';
let todayVisits = new Map();
let editingVisitId = null;
let pendingPhotos = [];
let watchId = null;
let meMarker = null;

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fieldTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Lista de hoje: seleção do roteiro > filtrados (máx 12)
function getTodayList() {
  if (selectedIds.size > 0) {
    return clients.filter(c => selectedIds.has(c.id));
  }
  return filteredClients.slice(0, 12);
}

async function loadTodayVisits() {
  todayVisits = new Map();
  try {
    const visits = await clientDB.getVisitsByDate(todayISO());
    visits.forEach(v => todayVisits.set(v.clientId, v));
  } catch (e) {}
}

function visitBadge(clientId) {
  const v = todayVisits.get(clientId);
  if (!v) return '<span class="field-badge b-none">Sem check-in</span>';
  if (v.checkinAt && !v.checkoutAt) return `<span class="field-badge b-open">Em visita desde ${fieldTime(v.checkinAt)}</span>`;
  const st = v.status === 'done' ? 'Concluída' : (v.status === 'return' ? 'Retorno' : 'Pendente');
  return `<span class="field-badge b-done">${st} ${fieldTime(v.checkoutAt || v.checkinAt)}</span>`;
}

function renderFieldList() {
  const q = (document.getElementById('field-search').value || '').trim();
  const nq = q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const list = getTodayList().filter(c => {
    if (!nq) return true;
    const hay = `${c.name || ''} ${c.address || ''} ${c.city || ''}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return hay.includes(nq);
  });
  const html = list.length === 0
    ? '<div class="field-empty">Nenhuma visita hoje.<br>Selecione clientes no mapa ou use a busca.</div>'
    : list.map(c => `
      <div class="field-card" onclick="openVisit(${c.id})">
        <div class="field-main">
          <div class="field-name">${escapeHtml(c.name)}</div>
          <div class="field-addr">${escapeHtml(c.address || '')} — ${escapeHtml(c.city || '')}/${escapeHtml(c.state || '')}</div>
          <div class="field-meta">${visitBadge(c.id)}</div>
        </div>
        <div class="field-go">›</div>
      </div>`).join('');
  const a = document.getElementById('field-list');
  if (a) a.innerHTML = html;
  const b = document.getElementById('sheet-list');
  if (b) b.innerHTML = html;
  const done = list.filter(c => {
    const v = todayVisits.get(c.id);
    return v && v.checkoutAt;
  }).length;
  ['field-today-count', 'sheet-count'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = list.length === 0 ? 'Hoje' : `${done}/${list.length} hoje`;
  });
}

function setFieldView(view) {
  fieldView = view;
  document.getElementById('visits-view').classList.toggle('active', view === 'visits');
  document.getElementById('map-container').classList.toggle('full', view === 'map');
  document.getElementById('view-visits-btn').classList.toggle('active', view === 'visits');
  document.getElementById('view-map-btn').classList.toggle('active', view === 'map');
  if (view === 'map' && map) {
    setTimeout(() => map.invalidateSize(), 60);
  }
  if (view === 'visits') renderFieldList();
}

// === Detalhe da visita ===
function openVisit(clientId) {
  const client = clients.find(c => c.id === clientId);
  if (!client) return;
  editingVisitId = clientId;
  pendingPhotos = [];
  const v = todayVisits.get(clientId);
  document.getElementById('visit-name').textContent = client.name || '';
  document.getElementById('visit-address').textContent =
    `${client.address || ''} — ${client.city || ''}/${client.state || ''}`;
  const call = document.getElementById('visit-call');
  if (client.phone) {
    call.href = 'tel:' + client.phone.replace(/\D/g, '');
    call.style.display = '';
  } else {
    call.style.display = 'none';
  }
  const dest = (client.lat && client.lng)
    ? `${client.lat},${client.lng}`
    : encodeURIComponent(`${client.address || ''}, ${client.city || ''} ${client.state || ''}`);
  document.getElementById('visit-nav').href =
    `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
  document.getElementById('visit-status').value = (v && v.status) || 'done';
  document.getElementById('visit-note').value = (v && v.note) || '';
  renderPendingPhotos();
  updateVisitButtons();
  document.getElementById('visit-modal').classList.add('visible');
}

function closeVisit() {
  document.getElementById('visit-modal').classList.remove('visible');
  editingVisitId = null;
  pendingPhotos = [];
}

function updateVisitButtons() {
  const v = todayVisits.get(editingVisitId);
  const inBtn = document.getElementById('visit-checkin');
  const outBtn = document.getElementById('visit-checkout');
  const times = document.getElementById('visit-times');
  if (!v || !v.checkinAt) {
    inBtn.style.display = '';
    outBtn.style.display = 'none';
    times.textContent = 'Sem check-in ainda';
  } else if (!v.checkoutAt) {
    inBtn.style.display = 'none';
    outBtn.style.display = '';
    times.textContent = `Check-in ${fieldTime(v.checkinAt)} — em visita`;
  } else {
    inBtn.style.display = 'none';
    outBtn.style.display = 'none';
    times.textContent = `Check-in ${fieldTime(v.checkinAt)} • Check-out ${fieldTime(v.checkoutAt)}`;
  }
}

async function currentPos() {
  try {
    return await Routes.getUserLocation();
  } catch (e) {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Sem GPS'));
      navigator.geolocation.getCurrentPosition(
        p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => reject(new Error('GPS indisponível')),
        { enableHighAccuracy: true, timeout: 15000 }
      );
    });
  }
}

async function doCheckin() {
  const client = clients.find(c => c.id === editingVisitId);
  if (!client) return;
  showToast('Registrando check-in...', 'info');
  let pos = {};
  try {
    pos = await currentPos();
  } catch (e) {
    showToast('GPS indisponível — check-in sem coordenadas', 'info');
  }
  const now = new Date().toISOString();
  let v = todayVisits.get(client.id);
  if (v) {
    v.checkinAt = now;
    v.lat = pos.lat;
    v.lng = pos.lng;
    await clientDB.updateVisit(v);
  } else {
    v = {
      clientId: client.id,
      date: todayISO(),
      checkinAt: now,
      checkoutAt: null,
      lat: pos.lat,
      lng: pos.lng,
      note: '',
      status: 'done',
      photos: []
    };
    v.id = await clientDB.addVisit(v);
  }
  todayVisits.set(client.id, v);
  client.lastVisit = todayISO();
  try { await clientDB.update(client); } catch (e) {}
  if (typeof renderClients === 'function') renderClients();
  renderFieldList();
  updateVisitButtons();
  showToast(`Check-in ${fieldTime(now)} ✓`, 'success');
}

async function doCheckout() {
  const v = todayVisits.get(editingVisitId);
  if (!v) return;
  v.checkoutAt = new Date().toISOString();
  await saveVisitForm(v);
  showToast('Check-out registrado ✓', 'success');
}

async function saveVisitForm(v) {
  v = v || todayVisits.get(editingVisitId);
  if (!v) {
    showToast('Faça o check-in primeiro', 'info');
    return;
  }
  v.status = document.getElementById('visit-status').value;
  v.note = document.getElementById('visit-note').value.trim();
  if (pendingPhotos.length > 0) {
    v.photos = (v.photos || []).concat(pendingPhotos);
    pendingPhotos = [];
  }
  await clientDB.updateVisit(v);
  todayVisits.set(v.clientId, v);
  renderPendingPhotos();
  renderFieldList();
  updateVisitButtons();
}

function renderPendingPhotos() {
  const box = document.getElementById('visit-photos');
  const v = todayVisits.get(editingVisitId);
  const saved = (v && v.photos) || [];
  const all = saved.concat(pendingPhotos);
  box.innerHTML = all.length === 0
    ? '<span class="photos-hint">Sem fotos</span>'
    : all.map(p => `<img src="${p}" class="photo-thumb" loading="lazy">`).join('');
}

function compressPhoto(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1280;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(cv.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = reject;
    img.src = url;
  });
}

async function handlePhotoInput(e) {
  const files = [...(e.target.files || [])].slice(0, 5);
  e.target.value = '';
  for (const f of files) {
    try {
      pendingPhotos.push(await compressPhoto(f));
    } catch (err) {
      showToast('Erro numa foto', 'error');
    }
  }
  renderPendingPhotos();
  if (pendingPhotos.length > 0) showToast('Foto(s) pronta(s) — salve a visita', 'info');
}

// === GPS (seguir posição) ===
function toggleGps() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
    if (meMarker && map) { map.removeLayer(meMarker); meMarker = null; }
    document.getElementById('gps-btn').classList.remove('active');
    return;
  }
  if (!navigator.geolocation) {
    showToast('GPS indisponível', 'error');
    return;
  }
  watchId = navigator.geolocation.watchPosition((p) => {
    const ll = [p.coords.latitude, p.coords.longitude];
    if (!meMarker && map) {
      meMarker = L.circleMarker(ll, {
        radius: 9, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1
      }).addTo(map);
    } else if (meMarker) {
      meMarker.setLatLng(ll);
    }
    if (map) map.setView(ll, Math.max(map.getZoom(), 15));
    document.getElementById('gps-btn').classList.add('active');
  }, () => {
    showToast('GPS indisponível', 'error');
  }, { enableHighAccuracy: true });
}

// === Bottom sheet (mapa mobile) ===
function toggleSheet(force) {
  const sheet = document.getElementById('sheet');
  const open = force !== undefined ? force : !sheet.classList.contains('open');
  sheet.classList.toggle('open', open);
  renderFieldList();
}

function initField() {
  const isMobile = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
  setFieldView(isMobile ? 'visits' : 'map');
  loadTodayVisits().then(renderFieldList);

  document.getElementById('view-visits-btn').addEventListener('click', () => setFieldView('visits'));
  document.getElementById('view-map-btn').addEventListener('click', () => setFieldView('map'));
  document.getElementById('gps-btn').addEventListener('click', toggleGps);
  document.getElementById('sheet-handle').addEventListener('click', () => toggleSheet());
  document.getElementById('field-search').addEventListener('input', renderFieldList);

  document.getElementById('visit-close').addEventListener('click', closeVisit);
  document.getElementById('visit-modal').querySelector('.modal-backdrop').addEventListener('click', closeVisit);
  document.getElementById('visit-checkin').addEventListener('click', doCheckin);
  document.getElementById('visit-checkout').addEventListener('click', doCheckout);
  document.getElementById('visit-save').addEventListener('click', () => saveVisitForm().then(() => showToast('Visita salva ✓', 'success')));
  document.getElementById('visit-photo').addEventListener('change', handlePhotoInput);

  // Teclado mobile: reajusta o mapa
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      if (map && fieldView === 'map') map.invalidateSize();
    });
  }
}
