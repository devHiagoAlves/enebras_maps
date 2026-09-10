const DB_NAME = 'EnebrasMapDB';
const DB_VERSION = 3;
const STORE_NAME = 'clients';
const VISIT_STORE = 'visits';

class ClientDB {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { this.db = request.result; resolve(); };
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
          store.createIndex('uniqueKey', 'uniqueKey', { unique: true });
          store.createIndex('state', 'state', { unique: false });
          store.createIndex('city', 'city', { unique: false });
          store.createIndex('email', 'email', { unique: false });
        } else if (e.oldVersion < 2) {
          const store = e.target.transaction.objectStore(STORE_NAME);
          if (!store.indexNames.contains('email')) {
            store.createIndex('email', 'email', { unique: false });
          }
        }
        if (!db.objectStoreNames.contains(VISIT_STORE)) {
          const visits = db.createObjectStore(VISIT_STORE, { keyPath: 'id', autoIncrement: true });
          visits.createIndex('clientId', 'clientId', { unique: false });
          visits.createIndex('date', 'date', { unique: false });
        }
      };
    });
  }

  async getAll() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getById(id) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async add(client) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.add(client);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async update(client) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(client);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(id) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getByUniqueKey(key) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('uniqueKey');
      const request = index.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getByState(state) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('state');
      const request = index.getAll(state);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getByCity(city) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('city');
      const request = index.getAll(city);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async clear() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async count() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async bulkAdd(clients) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      let added = 0;
      let skipped = 0;

      const processNext = (index) => {
        if (index >= clients.length) {
          resolve({ added, skipped });
          return;
        }

        const client = clients[index];
        // Checa chave nova e (se existir) a chave legada, migrando o registro
        const keysToCheck = [client.uniqueKey];
        if (client.legacyKey && client.legacyKey !== client.uniqueKey) {
          keysToCheck.push(client.legacyKey);
        }

        const checkNext = (ki) => {
          if (ki >= keysToCheck.length) {
            const addRequest = store.add(client);
            addRequest.onsuccess = () => { added++; processNext(index + 1); };
            addRequest.onerror = () => { skipped++; processNext(index + 1); };
            return;
          }
          const getRequest = store.index('uniqueKey').get(keysToCheck[ki]);
          getRequest.onsuccess = () => {
            if (getRequest.result) {
              // Registro antigo encontrado: migra para a chave nova
              if (ki > 0) {
                const migrated = { ...getRequest.result, uniqueKey: client.uniqueKey };
                const putRequest = store.put(migrated);
                putRequest.onerror = () => {};
              }
              skipped++;
              processNext(index + 1);
            } else {
              checkNext(ki + 1);
            }
          };
          getRequest.onerror = () => { skipped++; processNext(index + 1); };
        };

        checkNext(0);
      };

      tx.oncomplete = () => resolve({ added, skipped });
      tx.onerror = () => reject(tx.error);

      processNext(0);
    });
  }

  // Upsert em lote (restauração de backup): atualiza por id, adiciona novos
  async bulkUpsert(clients) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      let added = 0;
      let updated = 0;
      let skipped = 0;
      let pending = clients.length;

      if (pending === 0) {
        resolve({ added, updated, skipped });
        return;
      }

      const done = () => {
        if (--pending === 0) resolve({ added, updated, skipped });
      };

      tx.onerror = () => reject(tx.error);

      clients.forEach(client => {
        if (!client || !client.name) {
          skipped++;
          done();
          return;
        }
        if (client.id !== undefined && client.id !== null) {
          const getRequest = store.get(client.id);
          getRequest.onsuccess = () => {
            const existed = !!getRequest.result;
            const putRequest = store.put(client);
            putRequest.onsuccess = () => { existed ? updated++ : added++; done(); };
            putRequest.onerror = () => { skipped++; done(); };
          };
          getRequest.onerror = () => { skipped++; done(); };
        } else {
          const addRequest = store.add(client);
          addRequest.onsuccess = () => { added++; done(); };
          addRequest.onerror = () => { skipped++; done(); };
        }
      });
    });
  }

  async bulkDelete(ids) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      let deleted = 0;

      ids.forEach(id => {
        const request = store.delete(id);
        request.onsuccess = () => deleted++;
      });

      tx.oncomplete = () => resolve(deleted);
      tx.onerror = () => reject(tx.error);
    });
  }

  // === Visitas de campo ===
  // { clientId, date, checkinAt, checkoutAt, lat, lng, note, status, photos[] }
  _visitTx(mode) {
    return this.db.transaction(VISIT_STORE, mode).objectStore(VISIT_STORE);
  }

  async addVisit(visit) {
    return new Promise((resolve, reject) => {
      const request = this._visitTx('readwrite').add(visit);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async updateVisit(visit) {
    return new Promise((resolve, reject) => {
      const request = this._visitTx('readwrite').put(visit);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getVisitsByDate(date) {
    return new Promise((resolve, reject) => {
      const request = this._visitTx('readonly').index('date').getAll(date);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async getVisit(clientId, date) {
    const visits = await this.getVisitsByDate(date);
    return visits.find(v => v.clientId === clientId) || null;
  }

  async getVisitsByClient(clientId) {
    return new Promise((resolve, reject) => {
      const request = this._visitTx('readonly').index('clientId').getAll(clientId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async exportCSV() {
    const clients = await this.getAll();
    if (clients.length === 0) return '';

    // Sanitiza contra CSV injection (fórmulas Excel: = + - @)
    const csvSafe = (value) => {
      const text = String(value || '').replace(/"/g, '""');
      return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    };

    const headers = ['Nome', 'Endereço', 'Cidade', 'Estado', 'CEP', 'Telefone', 'Email', 'Status', 'Ultima Visita', 'Latitude', 'Longitude'];
    const rows = clients.map(c => [
      `"${csvSafe(c.name)}"`,
      `"${csvSafe(c.address)}"`,
      `"${csvSafe(c.city)}"`,
      `"${csvSafe(c.state)}"`,
      `"${csvSafe(c.cep)}"`,
      `"${csvSafe(c.phone)}"`,
      `"${csvSafe(c.email)}"`,
      `"${csvSafe(c.visitStatus || '')}"`,
      `"${csvSafe(c.lastVisit || '')}"`,
      c.lat || '',
      c.lng || ''
    ]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }
}

const clientDB = new ClientDB();
