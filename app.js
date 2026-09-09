// ═══════════════════════════════════════════════════════════════
// Enebras - Mapa de Clientes - App v6
// ═══════════════════════════════════════════════════════════════

let map;
let statesLayer;
let markerCluster = null;
let plainLayer = null;
let heatLayer = null;
let showHeat = false;
let markerById = new Map();
let lastDayRoute = null;
let clients = [];
let filteredClients = [];
let stateClientCounts = {};
let isOnline = navigator.onLine;
let currentClientId = null;
let showClusters = true;

// === Debounce ===
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// === State Names ===
const stateNames = {
  AC: 'Acre', AL: 'Alagoas', AM: 'Amazonas', AP: 'Amapá', BA: 'Bahia',
  CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás',
  MA: 'Maranhão', MG: 'Minas Gerais', MS: 'Mato Grosso do Sul', MT: 'Mato Grosso',
  PA: 'Pará', PB: 'Paraíba', PE: 'Pernambuco', PI: 'Piauí', PR: 'Paraná',
  RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RO: 'Rondônia', RR: 'Roraima',
  RS: 'Rio Grande do Sul', SC: 'Santa Catarina', SE: 'Sergipe', SP: 'São Paulo',
  TO: 'Tocantins'
};

const stateCenters = {
  AC: [-9.0, -70.5], AL: [-9.5, -36.5], AM: [-3.5, -65.0], AP: [1.5, -52.0],
  BA: [-12.5, -41.5], CE: [-5.0, -39.5], DF: [-15.8, -47.9], ES: [-19.5, -40.5],
  GO: [-15.5, -49.5], MA: [-5.0, -45.0], MG: [-18.5, -44.0], MS: [-21.0, -55.0],
  MT: [-13.0, -56.0], PA: [-4.0, -52.0], PB: [-7.0, -36.5], PE: [-8.3, -37.5],
  PI: [-7.5, -42.0], PR: [-24.5, -51.5], RJ: [-22.5, -43.5], RN: [-5.5, -36.5],
  RO: [-11.0, -63.0], RR: [2.0, -61.0], RS: [-29.5, -53.0], SC: [-27.5, -50.5],
  SP: [-22.5, -49.5], SE: [-10.5, -37.5], TO: [-10.0, -48.5]
};

// === Init ===
async function init() {
  if (typeof L === 'undefined') {
    showToast('Erro: Leaflet não carregado. Recarregue a página.', 'error');
    hideLoading();
    return;
  }

  initMap();
  setupEventListeners();
  applyTheme();

  // Em telas menores o painel começa recolhido (modo overlay)
  if (window.innerWidth <= 1100) {
    document.getElementById('sidebar').classList.add('collapsed');
  }

  setTimeout(() => {
    hideLoading();
  }, 5000);

  try {
    await clientDB.init();
    clients = await clientDB.getAll();
    if (clients.length > 0) {
      filteredClients = [...clients];
      updateStats();
      updateFilters();
      renderClients();
      renderMarkers();
      showToast(`${clients.length} clientes carregados`, 'info');
    }
  } catch (err) {
    console.error('DB error:', err);
  }

  hideLoading();
}

// === Map ===
function initMap() {
  try {
    map = L.map('map', {
      center: [-14.5, -52.0],
      zoom: 4,
      zoomControl: false,
      minZoom: 3,
      maxZoom: 18
    });
    // Zoom no canto inferior-direito: nunca colide com sidebar/logo
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 18
    }).addTo(map);

    // Init marker cluster + camada individual (toggle sem esvaziar o mapa)
    markerCluster = L.markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true
    });
    plainLayer = L.layerGroup();
    map.addLayer(markerCluster);

    map.whenReady(() => {
      loadStatesGeoJSON();
    });
  } catch (err) {
    console.error('Map init error:', err);
    showToast('Erro ao inicializar mapa', 'error');
  }
}

// === GeoJSON ===
async function loadStatesGeoJSON() {
  try {
  // GeoJSON local primeiro (offline-friendly), remoto como fallback
  const geojsonUrls = [
    'brasil-estados.geojson',
    'https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/brazil-states.geojson'
  ];

  let geojson = null;
  let lastError = null;
  for (const url of geojsonUrls) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('GeoJSON fetch failed: ' + response.status);
      }
      geojson = await response.json();
      break;
    } catch (err) {
      lastError = err;
    }
  }

  if (!geojson) {
    throw lastError || new Error('GeoJSON indisponível');
  }

    statesLayer = L.geoJSON(geojson, {
      style: function() {
        return {
          fillColor: '#6366f1',
          fillOpacity: 0.04,
          color: '#6366f1',
          weight: 2,
          opacity: 0.35
        };
      },
      onEachFeature: function(feature, layer) {
        const sigla = feature.properties.sigla || getSiglaFromName(feature.properties.name);
        layer.stateSigla = sigla;

        layer.on('mouseover', function(e) {
          e.target.setStyle({
            fillOpacity: 0.15,
            weight: 3,
            opacity: 0.8,
            color: '#818cf8'
          });
          e.target.bringToFront();
          showStateHoverInfo(sigla);
          highlightCardsForState(sigla);
        });

        layer.on('mouseout', function(e) {
          statesLayer.resetStyle(e.target);
          hideStateHoverInfo();
          resetCardHighlights();
        });

        layer.on('click', function(e) {
          map.fitBounds(e.target.getBounds());
          document.getElementById('state-filter').value = sigla;
          filterClients();
        });

        try {
          const center = layer.getBounds().getCenter();
          L.marker([center.lat, center.lng], {
            icon: L.divIcon({
              className: 'state-label',
              html: sigla,
              iconSize: [30, 16],
              iconAnchor: [15, 8]
            })
          }).addTo(map);
        } catch(e) {}
      }
    }).addTo(map);
  } catch (err) {
    console.warn('GeoJSON error:', err);
    showToast('Limites dos estados não carregados - mapa básico ativo', 'info');
  }
}

function getSiglaFromName(name) {
  const map = {
    'Acre': 'AC', 'Alagoas': 'AL', 'Amazonas': 'AM', 'Amapá': 'AP', 'Amapa': 'AP',
    'Bahia': 'BA', 'Ceará': 'CE', 'Ceara': 'CE', 'Distrito Federal': 'DF',
    'Espírito Santo': 'ES', 'Espirito Santo': 'ES', 'Goiás': 'GO', 'Goias': 'GO',
    'Maranhão': 'MA', 'Maranhao': 'MA', 'Minas Gerais': 'MG',
    'Mato Grosso do Sul': 'MS', 'Mato Grosso': 'MT', 'Pará': 'PA', 'Para': 'PA',
    'Paraíba': 'PB', 'Paraiba': 'PB', 'Pernambuco': 'PE', 'Piauí': 'PI', 'Piaui': 'PI',
    'Paraná': 'PR', 'Parana': 'PR', 'Rio de Janeiro': 'RJ',
    'Rio Grande do Norte': 'RN', 'Rondônia': 'RO', 'Rondonia': 'RO',
    'Roraima': 'RR', 'Rio Grande do Sul': 'RS', 'Santa Catarina': 'SC',
    'Sergipe': 'SE', 'São Paulo': 'SP', 'Sao Paulo': 'SP', 'Tocantins': 'TO'
  };
  return map[name] || name.substring(0, 2).toUpperCase();
}

// === State Hover ===
function showStateHoverInfo(sigla) {
  const count = stateClientCounts[sigla] || 0;
  const name = stateNames[sigla] || sigla;

  let infoEl = document.getElementById('state-hover-info');
  if (!infoEl) {
    infoEl = document.createElement('div');
    infoEl.id = 'state-hover-info';
    infoEl.className = 'state-hover-info';
    document.getElementById('map-container').appendChild(infoEl);
  }

  infoEl.innerHTML = `${name} (${sigla}) — <strong>${count} cliente${count !== 1 ? 's' : ''}</strong>`;
  infoEl.classList.add('visible');
}

function hideStateHoverInfo() {
  const infoEl = document.getElementById('state-hover-info');
  if (infoEl) infoEl.classList.remove('visible');
}

// === Card Highlights ===
function highlightCardsForState(stateId) {
  document.querySelectorAll('.client-card').forEach(card => {
    if (card.dataset.state === stateId) {
      card.classList.add('highlighted');
      card.classList.remove('dimmed');
    } else {
      card.classList.remove('highlighted');
      card.classList.add('dimmed');
    }
  });
}

function resetCardHighlights() {
  document.querySelectorAll('.client-card').forEach(card => {
    card.classList.remove('highlighted', 'dimmed');
  });
}

// === Event Listeners ===
function setupEventListeners() {
  // File upload
  document.getElementById('file-input').addEventListener('change', handleFileUpload);
  
  // Buttons
  document.getElementById('load-example-btn').addEventListener('click', loadExample);
  document.getElementById('clear-data-btn').addEventListener('click', clearAllData);
  document.getElementById('export-btn').addEventListener('click', exportData);
  document.getElementById('backup-btn').addEventListener('click', exportBackup);
  document.getElementById('restore-btn').addEventListener('click', () => {
    document.getElementById('restore-input').click();
  });
  document.getElementById('restore-input').addEventListener('change', handleRestoreFile);
  document.getElementById('route-day-btn').addEventListener('click', buildDayRoute);
  document.getElementById('report-btn').addEventListener('click', showReport);
  
  // Search with debounce
  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('input', debounce(filterClients, 300));
  
  // Clear search
  document.getElementById('clear-search').addEventListener('click', () => {
    searchInput.value = '';
    document.getElementById('clear-search').style.display = 'none';
    filterClients();
  });
  
  searchInput.addEventListener('input', () => {
    document.getElementById('clear-search').style.display = searchInput.value ? 'block' : 'none';
  });
  
  // Filters
  document.getElementById('state-filter').addEventListener('change', filterClients);
  document.getElementById('city-filter').addEventListener('change', filterClients);
  document.getElementById('status-filter').addEventListener('change', filterClients);
  document.getElementById('visit-filter').addEventListener('change', filterClients);
  
  // Sidebar toggle
  document.getElementById('sidebar-toggle').addEventListener('click', toggleSidebar);
  
  // Map controls
  document.getElementById('toggle-clusters').addEventListener('click', toggleClusters);
  document.getElementById('toggle-heatmap').addEventListener('click', toggleHeat);
  document.getElementById('toggle-theme').addEventListener('click', toggleTheme);
  
  // Modal - View
  document.getElementById('modal-close').addEventListener('click', closeViewModal);
  document.getElementById('client-modal').addEventListener('click', (e) => {
    if (e.target.id === 'client-modal') closeViewModal();
  });
  document.getElementById('modal-route').addEventListener('click', () => {
    const client = getClientById(currentClientId);
    if (client) {
      closeViewModal();
      Routes.showRouteToClient(map, client);
    }
  });
  document.getElementById('modal-edit').addEventListener('click', () => {
    const idx = clients.findIndex(c => c.id === currentClientId);
    if (idx >= 0) openEditModal(idx);
  });
  document.getElementById('modal-delete').addEventListener('click', () => deleteClient(currentClientId));
  document.getElementById('modal-copy-os').addEventListener('click', copyServiceOrder);
  
  // Modal - Edit
  document.getElementById('edit-modal-close').addEventListener('click', closeEditModal);
  document.getElementById('edit-modal').addEventListener('click', (e) => {
    if (e.target.id === 'edit-modal') closeEditModal();
  });
  document.getElementById('edit-save').addEventListener('click', saveClient);
  document.getElementById('edit-cancel').addEventListener('click', closeEditModal);
  
  // Route panel
  document.getElementById('route-panel-close').addEventListener('click', () => {
    Routes.hideRoutePanel();
    Routes.clearRoute(map);
    Routes.multiPoints = null;
    lastDayRoute = null;
    const stopsEl = document.getElementById('route-stops');
    if (stopsEl) {
      stopsEl.innerHTML = '';
      stopsEl.classList.remove('visible');
    }
  });
  document.getElementById('route-open-maps').addEventListener('click', () => {
    if (Routes.multiPoints) {
      Routes.openMultiInGoogleMaps(Routes.multiPoints);
    } else if (Routes.userLocation && Routes.currentRoute) {
      Routes.openInGoogleMaps(Routes.userLocation, Routes.currentRoute);
    }
  });
  document.getElementById('route-copy-link').addEventListener('click', async () => {
    let success = false;
    if (Routes.multiPoints) {
      success = await Routes.copyMultiRouteLink(Routes.multiPoints);
    } else if (Routes.userLocation && Routes.currentRoute) {
      success = await Routes.copyRouteLink(Routes.userLocation, Routes.currentRoute);
    }
    if (success) {
      showToast('Link copiado!', 'success');
    }
  });
  document.getElementById('route-print').addEventListener('click', printDayRoute);

  // Report modal
  document.getElementById('report-close').addEventListener('click', closeReport);
  document.getElementById('report-modal').addEventListener('click', (e) => {
    if (e.target.id === 'report-modal') closeReport();
  });
  document.getElementById('report-copy').addEventListener('click', copyReport);
  document.getElementById('report-print').addEventListener('click', printReport);
  
  // Keyboard
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeViewModal();
      closeEditModal();
      closeReport();
      Routes.hideRoutePanel();
      Routes.clearRoute(map);
    }
    if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
      const searchInput = document.getElementById('search-input');
      if (document.activeElement !== searchInput) {
        e.preventDefault();
        searchInput.focus();
      }
    }
  });
  
  // Online/offline
  window.addEventListener('online', () => {
    isOnline = true;
    showToast('Conexão restaurada', 'success');
  });
  
  window.addEventListener('offline', () => {
    isOnline = false;
    showToast('Sem conexão - dados locais disponíveis', 'info');
  });
}

// === Sidebar ===
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.toggle('collapsed');
  // Recalcula o tamanho do mapa após a animação (evita tiles deslocados)
  setTimeout(() => {
    if (map) map.invalidateSize();
  }, 380);
}

// === Map Controls ===
function toggleClusters() {
  showClusters = !showClusters;
  document.getElementById('toggle-clusters').classList.toggle('active', showClusters);

  if (showClusters) {
    if (map.hasLayer(plainLayer)) map.removeLayer(plainLayer);
    map.addLayer(markerCluster);
  } else {
    if (map.hasLayer(markerCluster)) map.removeLayer(markerCluster);
    map.addLayer(plainLayer);
  }
  renderMarkers();
}

function toggleHeat() {
  showHeat = !showHeat;
  document.getElementById('toggle-heatmap').classList.toggle('active', showHeat);
  updateHeat();
}

function updateHeat() {
  if (!map) return;

  if (heatLayer) {
    map.removeLayer(heatLayer);
    heatLayer = null;
  }
  if (!showHeat) return;

  if (typeof L.heatLayer !== 'function') {
    showToast('Mapa de calor indisponível (biblioteca não carregada)', 'error');
    showHeat = false;
    document.getElementById('toggle-heatmap').classList.remove('active');
    return;
  }

  const points = filteredClients
    .filter(c => c.lat && c.lng)
    .map(c => [c.lat, c.lng]);

  if (points.length === 0) {
    showToast('Sem coordenadas para o mapa de calor', 'info');
    return;
  }

  heatLayer = L.heatLayer(points, { radius: 28, blur: 18, maxZoom: 11 });
  heatLayer.addTo(map);
}

// === Markers ===
function renderMarkers() {
  if (!map || !markerCluster || !plainLayer) return;

  markerCluster.clearLayers();
  plainLayer.clearLayers();
  markerById.clear();

  // Desenha o que está filtrado (lista e mapa sempre em sync)
  const group = showClusters ? markerCluster : plainLayer;

  filteredClients.forEach((client) => {
    if (client.lat && client.lng) {
      const marker = L.marker([client.lat, client.lng], {
        icon: L.divIcon({
          className: 'client-marker' + (client.visitStatus ? ' status-' + client.visitStatus : ''),
          iconSize: [12, 12],
          iconAnchor: [6, 6]
        })
      });

      const realIndex = clients.indexOf(client);
      const popupContent = `
        <div class="client-marker-popup">
          <strong>${escapeHtml(client.name)}</strong>
          <div class="popup-address">${escapeHtml(client.address || '')}</div>
          <div class="popup-location">${escapeHtml(client.city)} - ${client.state}</div>
          ${client.phone ? `<div class="popup-address">${escapeHtml(client.phone)}</div>` : ''}
          <button class="popup-btn" onclick="openViewModal(${realIndex})">Ver detalhes</button>
        </div>
      `;

      marker.bindPopup(popupContent);
      group.addLayer(marker);
      if (client.id !== undefined && client.id !== null) {
        markerById.set(client.id, marker);
      }
    }
  });

  updateHeat();
}

// === Clients List ===
function renderClients() {
  const list = document.getElementById('clients-list');
  if (filteredClients.length === 0) {
    list.innerHTML = '<div class="no-clients"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg><p>Nenhum cliente encontrado</p></div>';
    return;
  }

  list.innerHTML = filteredClients.map((client, index) => {
    const realIndex = clients.indexOf(client);
    return `
      <div class="client-card" data-index="${realIndex}" data-state="${client.state}" onclick="focusClient(${realIndex})">
        <div class="client-card-avatar" style="--h: ${avatarHue(client.name)}">${escapeHtml(avatarInitial(client.name))}</div>
        <div class="client-card-body">
          <div class="client-card-name">${escapeHtml(client.name)}</div>
          <div class="client-card-address">${escapeHtml(client.address || '')}</div>
          <div class="client-card-location">${escapeHtml(client.city)} - ${client.state}</div>
          <div class="client-card-visit">${escapeHtml(visitLabel(client))}</div>
          ${client.visitStatus && VISIT_STATUS[client.visitStatus] ? `<span class="status-badge status-${client.visitStatus}">${VISIT_STATUS[client.visitStatus]}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// === Focus Client ===
function focusClient(index) {
  const client = clients[index];
  if (!client) return;

  if (client.lat && client.lng) {
    map.setView([client.lat, client.lng], 14);

    const marker = markerById.get(client.id);
    if (marker) {
      if (showClusters) {
        markerCluster.zoomToShowLayer(marker, () => {
          marker.openPopup();
        });
      } else {
        marker.openPopup();
      }
    }
  }

  openViewModal(index);
}

// === Stats ===
function updateStats() {
  const states = new Set(clients.map(c => c.state));
  const cities = new Set(clients.map(c => c.city));

  document.getElementById('total-clients').textContent = clients.length;
  document.getElementById('total-states').textContent = states.size;
  document.getElementById('total-cities').textContent = cities.size;

  stateClientCounts = {};
  clients.forEach(c => {
    stateClientCounts[c.state] = (stateClientCounts[c.state] || 0) + 1;
  });
}

// === Filters ===
function updateFilters() {
  const states = [...new Set(clients.map(c => c.state))].sort();
  const cities = [...new Set(clients.map(c => c.city))].sort();

  const stateFilter = document.getElementById('state-filter');
  const currentState = stateFilter.value;
  stateFilter.innerHTML = '<option value="">Estados</option>' +
    states.map(s => `<option value="${s}" ${s === currentState ? 'selected' : ''}>${s} - ${stateNames[s] || s}</option>`).join('');

  const cityFilter = document.getElementById('city-filter');
  const currentCity = cityFilter.value;
  cityFilter.innerHTML = '<option value="">Cidades</option>' +
    cities.map(c => `<option value="${c}" ${c === currentCity ? 'selected' : ''}>${c}</option>`).join('');
}

function filterClients() {
  const search = norm(document.getElementById('search-input').value);
  const state = document.getElementById('state-filter').value;
  const city = document.getElementById('city-filter').value;
  const status = document.getElementById('status-filter').value;
  const visit = document.getElementById('visit-filter').value;

  filteredClients = clients.filter(client => {
    const matchSearch = !search ||
      norm(client.name).includes(search) ||
      norm(client.address).includes(search) ||
      norm(client.city).includes(search) ||
      norm(client.email).includes(search);
    const matchState = !state || client.state === state;
    const matchCity = !city || client.city === city;
    const matchStatus = !status || client.visitStatus === status;

    let matchVisit = true;
    if (visit === 'none') {
      matchVisit = !client.lastVisit;
    } else if (visit) {
      const days = daysSince(client.lastVisit);
      matchVisit = days !== null && days > parseInt(visit, 10);
    }

    return matchSearch && matchState && matchCity && matchStatus && matchVisit;
  });

  renderClients();
  renderMarkers();
}

// === View Modal ===
function getClientById(id) {
  return clients.find(c => c.id === id) || null;
}

function openViewModal(index) {
  const client = clients[index];
  if (!client) return;

  currentClientId = client.id;

  document.getElementById('modal-name').textContent = client.name;
  document.getElementById('modal-address').textContent = client.address || 'Não informado';
  document.getElementById('modal-city-state').textContent = `${client.city} - ${client.state}`;
  document.getElementById('modal-cep').textContent = client.cep || 'Não informado';
  document.getElementById('modal-phone').textContent = client.phone || 'Não informado';
  document.getElementById('modal-email').textContent = client.email || 'Não informado';
  document.getElementById('modal-status').textContent =
    (client.visitStatus && VISIT_STATUS[client.visitStatus]) ? VISIT_STATUS[client.visitStatus] : 'Não definido';
  document.getElementById('modal-last-visit').textContent =
    client.lastVisit ? `${fmtDate(client.lastVisit)} (${visitLabel(client).toLowerCase()})` : 'Não registrada';

  document.getElementById('client-modal').classList.add('visible');
}

function closeViewModal() {
  document.getElementById('client-modal').classList.remove('visible');
  currentClientId = null;
}

// === Edit Modal ===
function openEditModal(index) {
  const client = clients[index];
  if (!client) return;

  currentClientId = client.id;

  document.getElementById('edit-name').value = client.name || '';
  document.getElementById('edit-address').value = client.address || '';
  document.getElementById('edit-city').value = client.city || '';
  document.getElementById('edit-state').value = client.state || '';
  document.getElementById('edit-cep').value = client.cep || '';
  document.getElementById('edit-phone').value = client.phone || '';
  document.getElementById('edit-email').value = client.email || '';
  document.getElementById('edit-visit-status').value = client.visitStatus || '';
  document.getElementById('edit-last-visit').value = client.lastVisit || '';

  closeViewModal();
  document.getElementById('edit-modal').classList.add('visible');
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.remove('visible');
  currentClientId = null;
}

async function saveClient() {
  const name = document.getElementById('edit-name').value.trim();
  if (!name) {
    showToast('Nome é obrigatório', 'error');
    return;
  }

  const existing = clients.find(c => c.id === currentClientId);
  if (!existing) {
    showToast('Cliente não encontrado', 'error');
    return;
  }

  const client = {
    ...existing,
    name: name,
    address: document.getElementById('edit-address').value.trim(),
    city: document.getElementById('edit-city').value.trim(),
    state: document.getElementById('edit-state').value.trim().toUpperCase(),
    cep: document.getElementById('edit-cep').value.trim(),
    phone: document.getElementById('edit-phone').value.trim(),
    email: document.getElementById('edit-email').value.trim(),
    visitStatus: document.getElementById('edit-visit-status').value,
    lastVisit: document.getElementById('edit-last-visit').value,
    uniqueKey: generateUniqueKey(
      name,
      document.getElementById('edit-city').value.trim(),
      document.getElementById('edit-state').value.trim().toUpperCase(),
      document.getElementById('edit-address').value.trim()
    ),
    legacyKey: generateUniqueKey(
      name,
      document.getElementById('edit-city').value.trim(),
      document.getElementById('edit-state').value.trim().toUpperCase()
    )
  };

  if (!client.lat && client.city && client.state) {
    await geocodeClients([client]);
  }

  try {
    await clientDB.update(client);
    clients = await clientDB.getAll();
    filteredClients = [...clients];
    updateStats();
    updateFilters();
    renderClients();
    renderMarkers();
    closeEditModal();
    showToast('Cliente atualizado', 'success');
  } catch (err) {
    showToast('Erro ao salvar: ' + err.message, 'error');
  }
}

// === Delete Client ===
async function deleteClient(id) {
  const client = clients.find(c => c.id === id);
  if (!client) return;

  if (!confirm(`Tem certeza que deseja excluir "${client.name}"?`)) return;

  try {
    await clientDB.delete(client.id);
    clients = await clientDB.getAll();
    filteredClients = [...clients];
    updateStats();
    updateFilters();
    renderClients();
    renderMarkers();
    closeViewModal();
    showToast('Cliente excluído', 'info');
  } catch (err) {
    showToast('Erro ao excluir: ' + err.message, 'error');
  }
}

// === Export ===
async function exportData() {
  try {
    const csv = await clientDB.exportCSV();
    // BOM p/ o Excel PT-BR abrir os acentos corretamente
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'clientes.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Dados exportados!', 'success');
  } catch (err) {
    showToast('Erro ao exportar: ' + err.message, 'error');
  }
}

// === File Upload ===
function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  showLoading('Processando arquivo...');

  const reader = new FileReader();
  reader.onload = function(event) {
    try {
      const data = event.target.result;
      let rows;

      if (file.name.endsWith('.csv')) {
        rows = parseCSV(data);
      } else {
        const workbook = XLSX.read(data, { type: 'array', cellDates: true, cellNF: true, cellText: false });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
      }

      processImportedData(rows);
    } catch (err) {
      showToast('Erro ao processar arquivo: ' + err.message, 'error');
      hideLoading();
    }
  };

  reader.onerror = () => {
    showToast('Erro ao ler arquivo', 'error');
    hideLoading();
  };

  if (file.name.endsWith('.csv')) {
    reader.readAsText(file, 'UTF-8');
  } else {
    reader.readAsArrayBuffer(file);
  }

  e.target.value = '';
}

// === CSV Parser ===
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  return lines.map(line => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if ((char === ',' || char === ';') && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  });
}

// === Process Import ===
function processImportedData(rows) {
  if (!rows || rows.length < 2) {
    showToast('Arquivo vazio ou sem dados', 'error');
    hideLoading();
    return;
  }

  const headers = rows[0].map(h => String(h).toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));

  const findCol = (...patterns) => {
    for (const pattern of patterns) {
      const idx = headers.findIndex(h => h.includes(pattern));
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const nameIdx = findCol('nome', 'name', 'cliente', 'razao', 'razao_social', 'empresa');
  const addressIdx = findCol('endereco', 'endereço', 'address', 'rua', 'logradouro', 'addr');
  const cityIdx = findCol('cidade', 'city', 'municipio');
  const stateIdx = findCol('estado', 'state', 'uf');
  const cepIdx = findCol('cep', 'postal', 'zip');
  const phoneIdx = findCol('telefone', 'phone', 'tel', 'celular', 'fone');
  const emailIdx = findCol('email', 'e-mail', 'e_mail');
  const latIdx = findCol('lat', 'latitude');
  const lngIdx = findCol('lng', 'lon', 'longitude');

  if (nameIdx === -1) {
    showToast('Coluna "nome" não encontrada. Colunas: ' + headers.join(', '), 'error');
    hideLoading();
    return;
  }

  const newClients = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[nameIdx] || String(row[nameIdx]).trim() === '') continue;

    const name = String(row[nameIdx]).trim();
    const city = cityIdx >= 0 ? String(row[cityIdx] || '').trim() : '';
    const state = stateIdx >= 0 ? String(row[stateIdx] || '').trim().toUpperCase() : '';
    const address = addressIdx >= 0 ? String(row[addressIdx] || '').trim() : '';

    const client = {
      name: name,
      address: address,
      city: city,
      state: state,
      cep: cepIdx >= 0 ? String(row[cepIdx] || '').trim() : '',
      phone: phoneIdx >= 0 ? String(row[phoneIdx] || '').trim() : '',
      email: emailIdx >= 0 ? String(row[emailIdx] || '').trim() : '',
      lat: latIdx >= 0 ? parseFloat(row[latIdx]) : null,
      lng: lngIdx >= 0 ? parseFloat(row[lngIdx]) : null,
      uniqueKey: generateUniqueKey(name, city, state, address),
      legacyKey: generateUniqueKey(name, city, state)
    };

    if (isNaN(client.lat)) client.lat = null;
    if (isNaN(client.lng)) client.lng = null;

    newClients.push(client);
  }

  if (newClients.length === 0) {
    showToast('Nenhum cliente válido encontrado', 'error');
    hideLoading();
    return;
  }

  showLoading(`Importando ${newClients.length} clientes...`);

  const needGeocode = newClients.filter(c => (!c.lat || !c.lng) && c.city && c.state);

  const finishImport = async () => {
    try {
      const result = await clientDB.bulkAdd(newClients);
      clients = await clientDB.getAll();
      filteredClients = [...clients];
      updateStats();
      updateFilters();
      renderClients();
      renderMarkers();
      hideLoading();

      let msg = `${result.added} cliente(s) importado(s)`;
      if (result.skipped > 0) msg += `, ${result.skipped} já existente(s)`;
      showToast(msg, 'success');
    } catch (err) {
      showToast('Erro ao salvar: ' + err.message, 'error');
      hideLoading();
    }
  };

  if (needGeocode.length > 0) {
    showLoading(`Geocodificando ${needGeocode.length} endereços...`);
    geocodeClients(needGeocode).then(finishImport);
  } else {
    finishImport();
  }
}

// === Generate Unique Key ===
function generateUniqueKey(name, city, state, address = '') {
  const normalize = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  const base = `${normalize(name)}_${normalize(city)}_${normalize(state)}`;
  const addr = normalize(address);
  return addr ? `${base}_${addr}` : base;
}

// === Geocode ===
async function geocodeClients(clientList) {
  const toGeocode = clientList.filter(c => (!c.lat || !c.lng) && c.city && c.state);
  let geocoded = 0;

  for (let i = 0; i < toGeocode.length; i++) {
    const client = toGeocode[i];
    try {
      // Tenta endereço completo primeiro, cai para cidade/UF se não achar
      const queries = [];
      if (client.address) {
        queries.push(`${client.address}, ${client.city}, ${client.state}, Brazil`);
      }
      queries.push(`${client.city}, ${client.state}, Brazil`);

      for (const q of queries) {
        const query = encodeURIComponent(q);
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`);
        const data = await response.json();

        if (data.length > 0) {
          client.lat = parseFloat(data[0].lat);
          client.lng = parseFloat(data[0].lon);
          geocoded++;
          break;
        }
        // Respeita o rate limit do Nominatim entre tentativas
        await new Promise(resolve => setTimeout(resolve, 1100));
      }

      showLoading(`Geocodificando ${geocoded}/${toGeocode.length}...`);

      if (i < toGeocode.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1100));
      }
    } catch (err) {
      console.error('Geocode error:', err);
    }
  }
}

// === Load Example ===
async function loadExample() {
  showLoading('Carregando exemplo...');

  const examples = [
    { name: 'Hospital Sírio-Libanês', address: 'R. Dona Adma Jafet, 91', city: 'São Paulo', state: 'SP', cep: '01308-050', phone: '(11) 3155-0000', email: 'contato@siriolibanes.org.br', lat: -23.5558, lng: -46.6622 },
    { name: 'Data Center Equinix SP3', address: 'Av. Marcos Penteado, 939', city: 'Santana de Parnaíba', state: 'SP', cep: '06543-001', phone: '(11) 2103-6700', email: 'vendas@equinix.com', lat: -23.4567, lng: -46.9123 },
    { name: 'Hospital Albert Einstein', address: 'Av. Albert Einstein, 627', city: 'São Paulo', state: 'SP', cep: '05652-900', phone: '(11) 2151-1233', email: 'einstein@einstein.br', lat: -23.5985, lng: -46.7128 },
    { name: 'Refinaria REDUC', address: 'Rod. BR-465, s/n', city: 'Duque de Caxias', state: 'RJ', cep: '25050-100', phone: '(21) 2171-7171', email: 'contato@petrobras.com.br', lat: -22.7694, lng: -43.2544 },
    { name: 'Hospital Moinhos de Vento', address: 'R. Ramiro Barcelos, 910', city: 'Porto Alegre', state: 'RS', cep: '90035-001', phone: '(51) 3314-3434', email: 'contato@hmv.org.br', lat: -30.0277, lng: -51.2233 },
    { name: 'Hospital de Base do DF', address: 'SMHS Quadra 101', city: 'Brasília', state: 'DF', cep: '70335-901', phone: '(61) 3196-4500', email: 'hb@saude.df.gov.br', lat: -15.8267, lng: -47.9233 },
    { name: 'Polo Industrial de Manaus', address: 'Av. Torquato Tapajós, 7200', city: 'Manaus', state: 'AM', cep: '69093-415', phone: '(92) 3611-7000', email: 'contato@pim.com.br', lat: -3.0789, lng: -60.0289 },
    { name: 'Hospital Beneficência Portuguesa', address: 'R. Maestro Cardim, 769', city: 'São Paulo', state: 'SP', cep: '01323-001', phone: '(11) 3255-4000', email: 'contato@bpsp.org.br', lat: -23.5489, lng: -46.6389 },
    { name: 'Siderúrgica Gerdau', address: 'Av. Farrapos, 1811', city: 'Porto Alegre', state: 'RS', cep: '90240-004', phone: '(51) 3323-2000', email: 'contato@gerdau.com.br', lat: -30.0346, lng: -51.2177 },
    { name: 'Hospital das Clínicas UFPE', address: 'Av. Prof. Moraes Rego, s/n', city: 'Recife', state: 'PE', cep: '50670-901', phone: '(81) 2126-3600', email: 'hc@ufpe.br', lat: -8.0522, lng: -34.9533 },
    { name: 'WEG S.A.', address: 'Av. Prefeito Waldemar Grubba, 3300', city: 'Jaraguá do Sul', state: 'SC', cep: '89256-900', phone: '(47) 3441-4444', email: 'weg@weg.net', lat: -26.4867, lng: -49.0889 },
    { name: 'Hospital de Clínicas UFPR', address: 'R. General Carneiro, 181', city: 'Curitiba', state: 'PR', cep: '80060-900', phone: '(41) 3360-1800', email: 'hc@ufpr.br', lat: -25.4284, lng: -49.2733 }
  ];

  examples.forEach(c => {
    c.uniqueKey = generateUniqueKey(c.name, c.city, c.state, c.address);
    c.legacyKey = generateUniqueKey(c.name, c.city, c.state);
  });

  try {
    const result = await clientDB.bulkAdd(examples);
    clients = await clientDB.getAll();
    filteredClients = [...clients];
    updateStats();
    updateFilters();
    renderClients();
    renderMarkers();
    hideLoading();

    let msg = `${result.added} clientes de exemplo adicionados`;
    if (result.skipped > 0) msg += `, ${result.skipped} já existentes`;
    showToast(msg, 'success');
  } catch (err) {
    showToast('Erro: ' + err.message, 'error');
    hideLoading();
  }
}

// === Clear Data ===
async function clearAllData() {
  if (!confirm('Tem certeza que deseja limpar todos os dados?')) return;

  try {
    await clientDB.clear();
    clients = [];
    filteredClients = [];
    updateStats();
    updateFilters();
    renderClients();
    renderMarkers();
    showToast('Dados removidos', 'info');
  } catch (err) {
    showToast('Erro: ' + err.message, 'error');
  }
}

// === Toast ===
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// === Loading ===
function showLoading(text) {
  document.getElementById('loading-text').textContent = text || 'Carregando...';
  document.getElementById('loading-overlay').classList.remove('hidden');
}

function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.classList.add('hidden');
  }
}

// === Utils ===
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function avatarInitial(name) {
  const clean = String(name || '').trim();
  return clean ? clean.charAt(0).toUpperCase() : '?';
}

function avatarHue(name) {
  const s = String(name || '');
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) % 360;
  }
  return hash;
}

// === Status de visita ===
const VISIT_STATUS = {
  active: 'Ativo',
  pmoc: 'PMOC vigente',
  pending: 'Pendente'
};

// Normaliza p/ busca tolerante (acentos + caixa)
function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function fmtDate(iso) {
  if (!iso) return '';
  const parts = String(iso).split('-');
  if (parts.length !== 3) return String(iso);
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function daysSince(iso) {
  if (!iso) return null;
  const d = new Date(iso + 'T12:00:00');
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.floor((today - d) / 86400000);
}

function visitLabel(client) {
  if (!client.lastVisit) return 'Sem visita registrada';
  const days = daysSince(client.lastVisit);
  if (days === null) return fmtDate(client.lastVisit);
  if (days <= 0) return 'Visitado hoje';
  if (days === 1) return 'Visitado há 1 dia';
  return `Visitado há ${days} dias`;
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const h = s1 * s1 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * s2 * s2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return true;
    } catch (e) {
      return false;
    }
  }
}

function printHtml(title, subtitle, tableHead, tableRows) {
  const area = document.getElementById('print-area');
  const today = new Date().toLocaleDateString('pt-BR');
  area.innerHTML = `
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(subtitle)} — gerado em ${today} • Enebras Mapa de Clientes</p>
    <table>
      <thead><tr>${tableHead.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
  `;
  window.print();
}

// === Tema claro/escuro ===
function applyTheme() {
  const theme = localStorage.getItem('enebras-theme') || 'dark';
  document.body.classList.toggle('light', theme === 'light');
  const btn = document.getElementById('toggle-theme');
  if (btn) btn.classList.toggle('active', theme === 'light');
}

function toggleTheme() {
  const isLight = !document.body.classList.contains('light');
  localStorage.setItem('enebras-theme', isLight ? 'light' : 'dark');
  applyTheme();
}

// === Backup / Restore ===
async function exportBackup() {
  try {
    const all = await clientDB.getAll();
    const payload = {
      app: 'enebras-mapa-clientes',
      version: 6,
      exportedAt: new Date().toISOString(),
      count: all.length,
      clients: all
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    a.href = url;
    a.download = `enebras-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Backup baixado!', 'success');
  } catch (err) {
    showToast('Erro no backup: ' + err.message, 'error');
  }
}

async function handleRestoreFile(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;

  try {
    const payload = JSON.parse(await file.text());
    const list = Array.isArray(payload) ? payload : payload.clients;
    if (!Array.isArray(list) || list.length === 0) {
      showToast('Backup inválido ou vazio', 'error');
      return;
    }
    if (!confirm(`Restaurar ${list.length} cliente(s)? Registros com mesmo ID serão atualizados.`)) return;

    showLoading('Restaurando backup...');
    const result = await clientDB.bulkUpsert(list);
    clients = await clientDB.getAll();
    filterClients();
    updateStats();
    updateFilters();
    hideLoading();
    showToast(`${result.added} novo(s), ${result.updated} atualizado(s)`, 'success');
  } catch (err) {
    hideLoading();
    showToast('Erro ao restaurar: ' + err.message, 'error');
  }
}

// === Relatório ===
function closeReport() {
  document.getElementById('report-modal').classList.remove('visible');
}

function reportData() {
  const byState = {};
  const byCity = {};
  let withCoords = 0;
  let withVisit = 0;
  const byStatus = { active: 0, pmoc: 0, pending: 0, none: 0 };
  clients.forEach(c => {
    const st = c.state || '?';
    byState[st] = (byState[st] || 0) + 1;
    const ck = `${c.city || '?'} - ${st}`;
    byCity[ck] = (byCity[ck] || 0) + 1;
    if (c.lat && c.lng) withCoords++;
    if (c.lastVisit) withVisit++;
    if (c.visitStatus && byStatus[c.visitStatus] !== undefined) byStatus[c.visitStatus]++;
    else byStatus.none++;
  });
  return { byState, byCity, withCoords, withVisit, byStatus };
}

function showReport() {
  const d = reportData();
  const total = clients.length || 1;
  const pct = (n) => Math.round(n / total * 100) + '%';
  const tableRows = (entries) => entries
    .map(([label, n]) => `<tr><td>${escapeHtml(label)}</td><td class="num">${n}</td></tr>`)
    .join('');
  const stateRows = tableRows(Object.entries(d.byState).sort((a, b) => b[1] - a[1]));
  const cityRows = tableRows(Object.entries(d.byCity).sort((a, b) => b[1] - a[1]).slice(0, 10));

  document.getElementById('report-body').innerHTML = `
    <div class="report-kpis">
      <div class="report-kpi"><div class="report-kpi-value">${clients.length}</div><div class="report-kpi-label">Clientes</div></div>
      <div class="report-kpi"><div class="report-kpi-value">${pct(d.withCoords)}</div><div class="report-kpi-label">Com coords</div></div>
      <div class="report-kpi"><div class="report-kpi-value">${pct(d.withVisit)}</div><div class="report-kpi-label">Com visita</div></div>
    </div>
    <div class="report-section"><h3>Status</h3>
      <table class="report-table"><tbody>
        <tr><td>Ativo</td><td class="num">${d.byStatus.active}</td></tr>
        <tr><td>PMOC vigente</td><td class="num">${d.byStatus.pmoc}</td></tr>
        <tr><td>Pendente</td><td class="num">${d.byStatus.pending}</td></tr>
        <tr><td>Sem status</td><td class="num">${d.byStatus.none}</td></tr>
      </tbody></table>
    </div>
    <div class="report-section"><h3>Por estado</h3>
      <table class="report-table"><tbody>${stateRows || '<tr><td>Nenhum dado</td></tr>'}</tbody></table>
    </div>
    <div class="report-section"><h3>Top cidades</h3>
      <table class="report-table"><tbody>${cityRows || '<tr><td>Nenhum dado</td></tr>'}</tbody></table>
    </div>`;
  document.getElementById('report-modal').classList.add('visible');
}

async function copyReport() {
  const d = reportData();
  const lines = [
    `Relatório Enebras — ${clients.length} clientes`,
    `Com coordenadas: ${d.withCoords} | Com visita: ${d.withVisit}`,
    `Status: Ativo ${d.byStatus.active}, PMOC ${d.byStatus.pmoc}, Pendente ${d.byStatus.pending}, Sem status ${d.byStatus.none}`,
    'Por estado: ' + Object.entries(d.byState).sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s} ${n}`).join(', ')
  ];
  const ok = await copyText(lines.join('\n'));
  showToast(ok ? 'Resumo copiado!' : 'Erro ao copiar', ok ? 'success' : 'error');
}

function printReport() {
  const d = reportData();
  const rows = Object.entries(d.byState).sort((a, b) => b[1] - a[1])
    .map(([s, n]) => `<tr><td>${escapeHtml(s)}</td><td>${n}</td></tr>`)
    .join('');
  printHtml('Relatório da carteira',
    `${clients.length} clientes • ${d.withCoords} com coordenadas • ${d.withVisit} com visita`,
    ['Estado', 'Clientes'], rows || '<tr><td colspan="2">Nenhum dado</td></tr>');
}

// === Roteiro do dia (multi-paradas) ===
function orderNearestNeighbor(start, stops) {
  const remaining = [...stops];
  const ordered = [];
  let current = start;
  while (remaining.length > 0) {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const dist = haversineKm(current, remaining[i]);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    current = remaining.splice(best, 1)[0];
    ordered.push(current);
  }
  return ordered;
}

async function buildDayRoute() {
  const candidates = filteredClients.filter(c => c.lat && c.lng);
  if (candidates.length === 0) {
    showToast('Nenhum cliente filtrado com coordenadas', 'error');
    return;
  }

  const MAX_STOPS = 12;
  const stops = candidates.slice(0, MAX_STOPS);
  if (candidates.length > MAX_STOPS) {
    showToast(`Roteiro limitado a ${MAX_STOPS} paradas (use filtros)`, 'info');
  }

  try {
    showLoading('Obtendo sua localização...');
    const start = await Routes.getUserLocation();

    showLoading('Calculando roteiro...');
    const ordered = orderNearestNeighbor(start, stops);
    const route = await Routes.calculateMultiRoute([start, ...ordered]);

    Routes.clearRoute(map);
    Routes.routeLayer = L.geoJSON(route.geometry, {
      style: { color: '#10b981', weight: 6, opacity: 0.85 }
    }).addTo(map);
    L.marker([start.lat, start.lng], {
      icon: L.divIcon({
        className: 'route-marker-start',
        html: '<div style="background:#10b981;width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      })
    }).addTo(Routes.routeLayer);
    const last = ordered[ordered.length - 1];
    L.marker([last.lat, last.lng], {
      icon: L.divIcon({
        className: 'route-marker-end',
        html: '<div style="background:#ef4444;width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      })
    }).addTo(Routes.routeLayer);
    map.fitBounds(Routes.routeLayer.getBounds(), { padding: [50, 50] });

    Routes.multiPoints = [start, ...ordered];
    Routes.currentRoute = null;
    lastDayRoute = { start, ordered, route };
    showDayRoutePanel(ordered, route);
    hideLoading();
    showToast('Roteiro calculado!', 'success');
  } catch (error) {
    hideLoading();
    showToast('Erro no roteiro: ' + error.message, 'error');
  }
}

function showDayRoutePanel(ordered, route) {
  document.getElementById('route-client-name').textContent = `Roteiro do dia — ${ordered.length} paradas`;
  document.getElementById('route-distance').textContent = Routes.formatDistance(route.distance);
  document.getElementById('route-duration').textContent = Routes.formatDuration(route.duration);
  document.getElementById('route-address').textContent = new Date().toLocaleDateString('pt-BR');

  const legs = route.legs || [];
  const stopsEl = document.getElementById('route-stops');
  stopsEl.innerHTML = ordered.map((c, i) => {
    const leg = legs[i];
    const legInfo = leg
      ? `${Routes.formatDistance(leg.distance)} • ${Routes.formatDuration(leg.duration)}`
      : '';
    return `<div class="route-stop">
      <div class="route-stop-num">${i + 1}</div>
      <div class="route-stop-info">
        <div class="route-stop-name">${escapeHtml(c.name)}</div>
        <div class="route-stop-leg">${escapeHtml(c.city)} - ${c.state}${legInfo ? ' • ' + legInfo : ''}</div>
      </div>
    </div>`;
  }).join('');
  stopsEl.classList.add('visible');
  document.getElementById('route-panel').classList.add('visible');
}

function printDayRoute() {
  if (!lastDayRoute) {
    showToast('Calcule o roteiro primeiro', 'info');
    return;
  }
  const { ordered, route } = lastDayRoute;
  const legs = route.legs || [];
  const rows = ordered.map((c, i) => {
    const leg = legs[i];
    return `<tr><td>${i + 1}</td><td>${escapeHtml(c.name)}</td>` +
      `<td>${escapeHtml((c.address ? c.address + ' — ' : '') + (c.city || '') + '/' + (c.state || ''))}</td>` +
      `<td>${leg ? Routes.formatDistance(leg.distance) : '-'}</td>` +
      `<td>${leg ? Routes.formatDuration(leg.duration) : '-'}</td></tr>`;
  }).join('');
  printHtml('Roteiro do dia',
    `${ordered.length} paradas • Total ${Routes.formatDistance(route.distance)} • ${Routes.formatDuration(route.duration)}`,
    ['#', 'Cliente', 'Endereço', 'Dist.', 'Tempo'], rows);
}

// === Copiar OS (ponte p/ o Auvo) ===
async function copyServiceOrder() {
  const client = getClientById(currentClientId);
  if (!client) return;

  const mapsLink = (client.lat && client.lng)
    ? `https://www.google.com/maps/dir/?api=1&destination=${client.lat},${client.lng}`
    : '';
  const lines = [
    'ORDEM DE SERVIÇO — Enebras',
    `Cliente: ${client.name || ''}`,
    `Endereço: ${client.address || ''} — ${client.city || ''}/${client.state || ''} — CEP ${client.cep || ''}`,
    `Contato: ${client.phone || ''}${client.email ? ' / ' + client.email : ''}`,
    `Status: ${(client.visitStatus && VISIT_STATUS[client.visitStatus]) || 'Não definido'}`,
    `Última visita: ${client.lastVisit ? fmtDate(client.lastVisit) : 'Não registrada'}`
  ];
  if (mapsLink) lines.push(`Mapa: ${mapsLink}`);

  const ok = await copyText(lines.join('\n'));
  showToast(ok ? 'OS copiada! Cole no Auvo.' : 'Erro ao copiar', ok ? 'success' : 'error');
}

// === Init ===
document.addEventListener('DOMContentLoaded', () => {
  init();
  checkOnlineStatus();
});

function checkOnlineStatus() {
  if (!isOnline) {
    showToast('Modo offline - usando dados locais', 'info');
  }
}

// === Sidebar Open Button ===
document.getElementById('sidebar-open').addEventListener('click', () => {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.remove('collapsed');
});
