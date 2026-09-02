let map;
let statesLayer;
let clientMarkers = [];
let clients = [];
let filteredClients = [];
let stateClientCounts = {};
let isOnline = navigator.onLine;

window.addEventListener('online', () => {
  isOnline = true;
  showToast('Conexao restaurada', 'success');
});

window.addEventListener('offline', () => {
  isOnline = false;
  showToast('Sem conexao - dados locais disponiveis', 'info');
});

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

async function init() {
  if (typeof L === 'undefined') {
    showToast('Erro: Leaflet nao carregado. Recarregue a pagina.', 'error');
    hideLoading();
    return;
  }

  initMap();
  setupEventListeners();

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

function initMap() {
  try {
    map = L.map('map', {
      center: [-14.5, -52.0],
      zoom: 4,
      zoomControl: true,
      minZoom: 3,
      maxZoom: 18
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 18
    }).addTo(map);

    map.whenReady(() => {
      loadStatesGeoJSON();
    });
  } catch (err) {
    console.error('Map init error:', err);
    showToast('Erro ao inicializar mapa', 'error');
  }
}

async function loadStatesGeoJSON() {
  try {
    const response = await fetch('https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/brazil-states.geojson');

    if (!response.ok) {
      throw new Error('GeoJSON fetch failed: ' + response.status);
    }

    const geojson = await response.json();

    statesLayer = L.geoJSON(geojson, {
      style: function() {
        return {
          fillColor: '#0066cc',
          fillOpacity: 0.05,
          color: '#0066cc',
          weight: 2,
          opacity: 0.4
        };
      },
      onEachFeature: function(feature, layer) {
        const sigla = getSiglaFromName(feature.properties.name);
        layer.stateSigla = sigla;

        layer.on('mouseover', function(e) {
          e.target.setStyle({
            fillOpacity: 0.2,
            weight: 3,
            opacity: 0.8,
            color: '#0052a3'
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
    showToast('Limites dos estados nao carregados - mapa basico ativo', 'info');
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

function setupEventListeners() {
  document.getElementById('file-input').addEventListener('change', handleFileUpload);
  document.getElementById('load-example-btn').addEventListener('click', loadExample);
  document.getElementById('clear-data-btn').addEventListener('click', clearAllData);
  document.getElementById('search-input').addEventListener('input', filterClients);
  document.getElementById('state-filter').addEventListener('change', filterClients);
  document.getElementById('city-filter').addEventListener('change', filterClients);
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('client-modal').addEventListener('click', (e) => {
    if (e.target.id === 'client-modal') closeModal();
  });
}

function renderMarkers() {
  clientMarkers.forEach(m => map.removeLayer(m));
  clientMarkers = [];

  clients.forEach((client, index) => {
    if (client.lat && client.lng) {
      const marker = L.marker([client.lat, client.lng], {
        icon: L.divIcon({
          className: 'client-marker',
          iconSize: [12, 12],
          iconAnchor: [6, 6]
        })
      });

      const popupContent = `
        <div class="client-marker-popup">
          <strong>${escapeHtml(client.name)}</strong>
          <div class="popup-address">${escapeHtml(client.address || '')}</div>
          <div class="popup-location">${escapeHtml(client.city)} - ${client.state}</div>
          ${client.phone ? `<div class="popup-address">${escapeHtml(client.phone)}</div>` : ''}
          <button class="popup-btn" onclick="openModal(${index})">Ver detalhes</button>
        </div>
      `;

      marker.bindPopup(popupContent);
      marker.addTo(map);
      clientMarkers.push(marker);
    }
  });
}

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
        <div class="client-card-name">${escapeHtml(client.name)}</div>
        <div class="client-card-address">${escapeHtml(client.address || '')}</div>
        <div class="client-card-location">${escapeHtml(client.city)} - ${client.state}</div>
      </div>
    `;
  }).join('');
}

function focusClient(index) {
  const client = clients[index];
  if (!client) return;

  if (client.lat && client.lng) {
    map.setView([client.lat, client.lng], 14);
    if (clientMarkers[index]) {
      clientMarkers[index].openPopup();
    }
  }

  openModal(index);
}

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

function updateFilters() {
  const states = [...new Set(clients.map(c => c.state))].sort();
  const cities = [...new Set(clients.map(c => c.city))].sort();

  const stateFilter = document.getElementById('state-filter');
  const currentState = stateFilter.value;
  stateFilter.innerHTML = '<option value="">Todos os Estados</option>' +
    states.map(s => `<option value="${s}" ${s === currentState ? 'selected' : ''}>${s} - ${stateNames[s] || s}</option>`).join('');

  const cityFilter = document.getElementById('city-filter');
  const currentCity = cityFilter.value;
  cityFilter.innerHTML = '<option value="">Todas as Cidades</option>' +
    cities.map(c => `<option value="${c}" ${c === currentCity ? 'selected' : ''}>${c}</option>`).join('');
}

function filterClients() {
  const search = document.getElementById('search-input').value.toLowerCase();
  const state = document.getElementById('state-filter').value;
  const city = document.getElementById('city-filter').value;

  filteredClients = clients.filter(client => {
    const matchSearch = !search || client.name.toLowerCase().includes(search) ||
      (client.address && client.address.toLowerCase().includes(search)) ||
      client.city.toLowerCase().includes(search);
    const matchState = !state || client.state === state;
    const matchCity = !city || client.city === city;
    return matchSearch && matchState && matchCity;
  });

  renderClients();
}

function openModal(index) {
  const client = clients[index];
  if (!client) return;

  document.getElementById('modal-name').textContent = client.name;
  document.getElementById('modal-address').textContent = client.address || 'Nao informado';
  document.getElementById('modal-city-state').textContent = `${client.city} - ${client.state}`;
  document.getElementById('modal-cep').textContent = client.cep || 'Nao informado';
  document.getElementById('modal-phone').textContent = client.phone || 'Nao informado';
  document.getElementById('modal-email').textContent = client.email || 'Nao informado';

  document.getElementById('client-modal').classList.add('visible');
}

function closeModal() {
  document.getElementById('client-modal').classList.remove('visible');
}

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
    showToast('Coluna "nome" nao encontrada. Colunas: ' + headers.join(', '), 'error');
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

    const client = {
      name: name,
      address: addressIdx >= 0 ? String(row[addressIdx] || '').trim() : '',
      city: city,
      state: state,
      cep: cepIdx >= 0 ? String(row[cepIdx] || '').trim() : '',
      phone: phoneIdx >= 0 ? String(row[phoneIdx] || '').trim() : '',
      email: emailIdx >= 0 ? String(row[emailIdx] || '').trim() : '',
      lat: latIdx >= 0 ? parseFloat(row[latIdx]) : null,
      lng: lngIdx >= 0 ? parseFloat(row[lngIdx]) : null,
      uniqueKey: generateUniqueKey(name, city, state)
    };

    if (isNaN(client.lat)) client.lat = null;
    if (isNaN(client.lng)) client.lng = null;

    newClients.push(client);
  }

  if (newClients.length === 0) {
    showToast('Nenhum cliente valido encontrado', 'error');
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
      if (result.skipped > 0) msg += `, ${result.skipped} ja existente(s)`;
      showToast(msg, 'success');
    } catch (err) {
      showToast('Erro ao salvar: ' + err.message, 'error');
      hideLoading();
    }
  };

  if (needGeocode.length > 0) {
    showLoading(`Geocodificando ${needGeocode.length} enderecos...`);
    geocodeClients(needGeocode).then(finishImport);
  } else {
    finishImport();
  }
}

function generateUniqueKey(name, city, state) {
  const normalize = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  return `${normalize(name)}_${normalize(city)}_${normalize(state)}`;
}

async function geocodeClients(clientList) {
  const toGeocode = clientList.filter(c => (!c.lat || !c.lng) && c.city && c.state);
  let geocoded = 0;

  for (let i = 0; i < toGeocode.length; i++) {
    const client = toGeocode[i];
    try {
      const query = encodeURIComponent(`${client.city}, ${client.state}, Brazil`);
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`);
      const data = await response.json();

      if (data.length > 0) {
        client.lat = parseFloat(data[0].lat);
        client.lng = parseFloat(data[0].lon);
        geocoded++;
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

async function loadExample() {
  showLoading('Carregando exemplo...');

  const examples = [
    { name: 'Hospital Sirio-Libanes', address: 'R. Dona Adma Jafet, 91', city: 'Sao Paulo', state: 'SP', cep: '01308-050', phone: '(11) 3155-0000', email: 'contato@siriolibanes.org.br', lat: -23.5558, lng: -46.6622 },
    { name: 'Data Center Equinix SP3', address: 'Av. Marcos Penteado, 939', city: 'Santana de Parnaiba', state: 'SP', cep: '06543-001', phone: '(11) 2103-6700', email: 'vendas@equinix.com', lat: -23.4567, lng: -46.9123 },
    { name: 'Hospital Albert Einstein', address: 'Av. Albert Einstein, 627', city: 'Sao Paulo', state: 'SP', cep: '05652-900', phone: '(11) 2151-1233', email: 'einstein@einstein.br', lat: -23.5985, lng: -46.7128 },
    { name: 'Refinaria REDUC', address: 'Rod. BR-465, s/n', city: 'Duque de Caxias', state: 'RJ', cep: '25050-100', phone: '(21) 2171-7171', email: 'contato@petrobras.com.br', lat: -22.7694, lng: -43.2544 },
    { name: 'Hospital Moinhos de Vento', address: 'R. Ramiro Barcelos, 910', city: 'Porto Alegre', state: 'RS', cep: '90035-001', phone: '(51) 3314-3434', email: 'contato@hmv.org.br', lat: -30.0277, lng: -51.2233 },
    { name: 'Hospital de Base do DF', address: 'SMHS Quadra 101', city: 'Brasilia', state: 'DF', cep: '70335-901', phone: '(61) 3196-4500', email: 'hb@saude.df.gov.br', lat: -15.8267, lng: -47.9233 },
    { name: 'Polo Industrial de Manaus', address: 'Av. Torquato Tapajos, 7200', city: 'Manaus', state: 'AM', cep: '69093-415', phone: '(92) 3611-7000', email: 'contato@pim.com.br', lat: -3.0789, lng: -60.0289 },
    { name: 'Hospital Beneficencia Portuguesa', address: 'R. Maestro Cardim, 769', city: 'Sao Paulo', state: 'SP', cep: '01323-001', phone: '(11) 3255-4000', email: 'contato@bpsp.org.br', lat: -23.5489, lng: -46.6389 },
    { name: 'Siderurgica Gerdau', address: 'Av. Farrapos, 1811', city: 'Porto Alegre', state: 'RS', cep: '90240-004', phone: '(51) 3323-2000', email: 'contato@gerdau.com.br', lat: -30.0346, lng: -51.2177 },
    { name: 'Hospital das Clinicas UFPE', address: 'Av. Prof. Moraes Rego, s/n', city: 'Recife', state: 'PE', cep: '50670-901', phone: '(81) 2126-3600', email: 'hc@ufpe.br', lat: -8.0522, lng: -34.9533 },
    { name: 'WEG S.A.', address: 'Av. Prefeito Waldemar Grubba, 3300', city: 'Jaragua do Sul', state: 'SC', cep: '89256-900', phone: '(47) 3441-4444', email: 'weg@weg.net', lat: -26.4867, lng: -49.0889 },
    { name: 'Hospital de Clinicas UFPR', address: 'R. General Carneiro, 181', city: 'Curitiba', state: 'PR', cep: '80060-900', phone: '(41) 3360-1800', email: 'hc@ufpr.br', lat: -25.4284, lng: -49.2733 }
  ];

  examples.forEach(c => {
    c.uniqueKey = generateUniqueKey(c.name, c.city, c.state);
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
    if (result.skipped > 0) msg += `, ${result.skipped} ja existentes`;
    showToast(msg, 'success');
  } catch (err) {
    showToast('Erro: ' + err.message, 'error');
    hideLoading();
  }
}

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

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function setupKeyboardNavigation() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
    }

    if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
      const searchInput = document.getElementById('search-input');
      if (document.activeElement !== searchInput) {
        e.preventDefault();
        searchInput.focus();
      }
    }
  });

  const uploadLabel = document.querySelector('.upload-btn');
  uploadLabel.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      document.getElementById('file-input').click();
    }
  });

  document.getElementById('file-input').addEventListener('change', handleFileUpload);
}

function checkOnlineStatus() {
  if (!isOnline) {
    showToast('Modo offline - usando dados locais', 'info');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  init();
  setupKeyboardNavigation();
  checkOnlineStatus();
});
