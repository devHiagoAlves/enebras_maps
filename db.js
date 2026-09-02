const DB_NAME = 'EnebrasMapDB';
const DB_VERSION = 1;
const STORE_NAME = 'clients';

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

  async add(client) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.add(client);
      request.onsuccess = () => resolve(request.result);
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
        const getRequest = store.index('uniqueKey').get(client.uniqueKey);

        getRequest.onsuccess = () => {
          if (getRequest.result) {
            skipped++;
            processNext(index + 1);
          } else {
            const addRequest = store.add(client);
            addRequest.onsuccess = () => { added++; processNext(index + 1); };
            addRequest.onerror = () => { skipped++; processNext(index + 1); };
          }
        };
        getRequest.onerror = () => { skipped++; processNext(index + 1); };
      };

      tx.oncomplete = () => resolve({ added, skipped });
      tx.onerror = () => reject(tx.error);

      processNext(0);
    });
  }
}

const clientDB = new ClientDB();
