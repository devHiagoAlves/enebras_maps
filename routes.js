// ═══════════════════════════════════════════════════════════════
// Routes Module - Enebras Mapa de Clientes
// Uses OSRM (Open Source Routing Machine) - 100% free, no API key
// ═══════════════════════════════════════════════════════════════

const Routes = {
  currentRoute: null,
  multiPoints: null,
  routeLayer: null,
  userLocation: null,

  // Get user location
  async getUserLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocalização não suportada'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          this.userLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          resolve(this.userLocation);
        },
        (error) => {
          reject(error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000
        }
      );
    });
  },

  // Calculate route using OSRM
  async calculateRoute(start, end) {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;
      
      const response = await fetch(url);
      const data = await response.json();

      if (data.code !== 'Ok') {
        throw new Error('Rota não encontrada');
      }

      const route = data.routes[0];
      return {
        distance: route.distance,
        duration: route.duration,
        geometry: route.geometry
      };
    } catch (error) {
      console.error('Route error:', error);
      throw error;
    }
  },

  // Calculate multi-stop route using OSRM (waypoints: start + stops)
  async calculateMultiRoute(points) {
    try {
      const coords = points.map(p => `${p.lng},${p.lat}`).join(';');
      const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.code !== 'Ok') {
        throw new Error('Rota não encontrada');
      }

      const route = data.routes[0];
      return {
        distance: route.distance,
        duration: route.duration,
        geometry: route.geometry,
        legs: route.legs || []
      };
    } catch (error) {
      console.error('Multi-route error:', error);
      throw error;
    }
  },

  // Show route on map
  showRoute(map, geometry, start, end) {
    this.clearRoute(map);

    this.routeLayer = L.geoJSON(geometry, {
      style: {
        color: '#0066cc',
        weight: 6,
        opacity: 0.8
      }
    }).addTo(map);

    // Start marker
    L.marker([start.lat, start.lng], {
      icon: L.divIcon({
        className: 'route-marker-start',
        html: '<div style="background:#10b981;width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      })
    }).addTo(this.routeLayer);

    // End marker
    L.marker([end.lat, end.lng], {
      icon: L.divIcon({
        className: 'route-marker-end',
        html: '<div style="background:#ef4444;width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      })
    }).addTo(this.routeLayer);

    map.fitBounds(this.routeLayer.getBounds(), { padding: [50, 50] });
  },

  // Clear route
  clearRoute(map) {
    if (this.routeLayer) {
      map.removeLayer(this.routeLayer);
      this.routeLayer = null;
    }
  },

  // Format distance
  formatDistance(meters) {
    if (meters < 1000) {
      return `${Math.round(meters)}m`;
    }
    return `${(meters / 1000).toFixed(1)}km`;
  },

  // Format duration
  formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}min`;
    }
    return `${minutes}min`;
  },

  // Open in Google Maps
  openInGoogleMaps(start, end) {
    const url = `https://www.google.com/maps/dir/${start.lat},${start.lng}/${end.lat},${end.lng}`;
    window.open(url, '_blank');
  },

  // Open multi-stop route in Google Maps
  openMultiInGoogleMaps(points) {
    const waypoints = points.map(p => `${p.lat},${p.lng}`).join('/');
    window.open(`https://www.google.com/maps/dir/${waypoints}`, '_blank');
  },

  // Copy multi-stop route link
  async copyMultiRouteLink(points) {
    const waypoints = points.map(p => `${p.lat},${p.lng}`).join('/');
    const url = `https://www.google.com/maps/dir/${waypoints}`;

    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch (error) {
      const textarea = document.createElement('textarea');
      textarea.value = url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return true;
    }
  },

  // Copy route link
  async copyRouteLink(start, end) {
    const url = `https://www.google.com/maps/dir/${start.lat},${start.lng}/${end.lat},${end.lng}`;
    
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch (error) {
      const textarea = document.createElement('textarea');
      textarea.value = url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return true;
    }
  },

  // Show route panel
  showRoutePanel(client, route) {
    const stopsEl = document.getElementById('route-stops');
    if (stopsEl) {
      stopsEl.innerHTML = '';
      stopsEl.classList.remove('visible');
    }
    const distance = this.formatDistance(route.distance);
    const duration = this.formatDuration(route.duration);

    document.getElementById('route-client-name').textContent = client.name;
    document.getElementById('route-distance').textContent = distance;
    document.getElementById('route-duration').textContent = duration;
    document.getElementById('route-address').textContent = `${client.city} - ${client.state}`;

    document.getElementById('route-panel').classList.add('visible');
  },

  // Hide route panel
  hideRoutePanel() {
    document.getElementById('route-panel').classList.remove('visible');
  },

  // Main function: show route to client
  async showRouteToClient(map, client) {
    try {
      // Exclusividade visual: fecha popup/modal para não sobrepor o painel
      map.closePopup();
      if (typeof closeViewModal === 'function') closeViewModal();
      showLoading('Obtendo sua localização...');

      const userLocation = await this.getUserLocation();
      
      if (!client.lat || !client.lng) {
        showToast('Cliente não possui coordenadas', 'error');
        hideLoading();
        return;
      }

      showLoading('Calculando rota...');

      const route = await this.calculateRoute(userLocation, {
        lat: client.lat,
        lng: client.lng
      });

      this.showRoute(map, route.geometry, userLocation, {
        lat: client.lat,
        lng: client.lng
      });

      this.currentRoute = {
        lat: client.lat,
        lng: client.lng
      };

      this.showRoutePanel(client, route);

      hideLoading();
      showToast('Rota calculada!', 'success');

    } catch (error) {
      hideLoading();
      
      if (error.message.includes('Geolocalização') || error.code === 1) {
        showToast('Ative a localização do navegador', 'error');
      } else if (error.code === 2) {
        showToast('Erro ao obter localização', 'error');
      } else if (error.code === 3) {
        showToast('Tempo esgotado ao obter localização', 'error');
      } else {
        showToast('Erro ao calcular rota: ' + error.message, 'error');
      }
    }
  }
};
