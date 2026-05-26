import { db } from '../config/firebase.js';

// Timeout wrapper for Firebase operations
const withTimeout = (promise, ms = 10000, operation = 'Firebase operation') => {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${operation} timed out after ${ms}ms`)), ms)
    )
  ]);
};

// Generic CRUD operations for Firebase Realtime Database
export const FirebaseService = {
  // Get all items from a collection
  async getAll(collection) {
    try {
      console.log(`[Firebase] getAll: ${collection}`);
      const snapshot = await withTimeout(
        db.ref(collection).once('value'),
        15000,
        `getAll(${collection})`
      );
      const data = snapshot.val();
      if (!data) return [];
      return Object.entries(data).map(([id, value]) => ({ id, ...value }));
    } catch (error) {
      console.error(`[Firebase] getAll error:`, error.message);
      throw error;
    }
  },

  // Get single item by ID
  async getById(collection, id) {
    const snapshot = await db.ref(`${collection}/${id}`).once('value');
    const data = snapshot.val();
    return data ? { id, ...data } : null;
  },

  // Get items by field value
  async getByField(collection, field, value) {
    try {
      console.log(`[Firebase] getByField: ${collection}.${field} = ${value}`);
      const snapshot = await withTimeout(
        db.ref(collection).orderByChild(field).equalTo(value).once('value'),
        15000,
        `getByField(${collection}, ${field})`
      );
      const data = snapshot.val();
      console.log(`[Firebase] getByField result: ${data ? 'found data' : 'no data'}`);
      if (!data) return [];
      return Object.entries(data).map(([id, val]) => ({ id, ...val }));
    } catch (error) {
      console.error(`[Firebase] getByField error:`, error.message);
      throw error;
    }
  },

  // Create new item (auto-generated ID)
  async create(collection, data) {
    const timestamp = new Date().toISOString();
    const item = { ...data, createdAt: timestamp, updatedAt: timestamp };
    const ref = db.ref(collection).push();
    await ref.set(item);
    return { id: ref.key, ...item };
  },

  // Create with custom ID
  async createWithId(collection, id, data) {
    const timestamp = new Date().toISOString();
    const item = { ...data, createdAt: timestamp, updatedAt: timestamp };
    await db.ref(`${collection}/${id}`).set(item);
    return { id, ...item };
  },

  // Update item
  async update(collection, id, data) {
    try {
      console.log(`[Firebase] update: ${collection}/${id}`);
      const timestamp = new Date().toISOString();
      const updates = { ...data, updatedAt: timestamp };
      await withTimeout(
        db.ref(`${collection}/${id}`).update(updates),
        15000,
        `update(${collection}, ${id})`
      );
      console.log(`[Firebase] update complete`);
      return { id, ...updates };
    } catch (error) {
      console.error(`[Firebase] update error:`, error.message);
      throw error;
    }
  },

  // Delete item
  async delete(collection, id) {
    await db.ref(`${collection}/${id}`).remove();
    return true;
  },

  // Query with multiple conditions
  async query(collection, conditions = {}) {
    const snapshot = await db.ref(collection).once('value');
    const data = snapshot.val();
    if (!data) return [];

    let results = Object.entries(data).map(([id, value]) => ({ id, ...value }));
    Object.entries(conditions).forEach(([field, value]) => {
      results = results.filter(item => item[field] === value);
    });

    return results;
  },

  // Get count
  async count(collection, field = null, value = null) {
    if (field && value) {
      const items = await this.getByField(collection, field, value);
      return items.length;
    }
    const snapshot = await db.ref(collection).once('value');
    return snapshot.numChildren();
  },

  // Increment a value
  async increment(collection, id, field, amount = 1) {
    const ref = db.ref(`${collection}/${id}/${field}`);
    const snapshot = await ref.once('value');
    const currentValue = snapshot.val() || 0;
    await ref.set(currentValue + amount);
    return currentValue + amount;
  },

  // Listen for real-time updates
  subscribe(collection, callback) {
    const ref = db.ref(collection);
    ref.on('value', (snapshot) => {
      const data = snapshot.val();
      const items = data
        ? Object.entries(data).map(([id, value]) => ({ id, ...value }))
        : [];
      callback(items);
    });
    return () => ref.off('value');
  },

  // Check connection status (always true since we require connection)
  isConnected() {
    return true;
  },

  // Get application settings
  async getSettings() {
    try {
      const snapshot = await db.ref('settings').once('value');
      return snapshot.val() || {};
    } catch (error) {
      console.error('[Firebase] getSettings error:', error.message);
      throw error;
    }
  },

  // Update application settings
  async updateSettings(updates) {
    try {
      const ref = db.ref('settings');
      await ref.update(updates);
      const snapshot = await ref.once('value');
      return snapshot.val();
    } catch (error) {
      console.error('[Firebase] updateSettings error:', error.message);
      throw error;
    }
  }
};

export default FirebaseService;
