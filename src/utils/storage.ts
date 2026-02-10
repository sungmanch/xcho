import { StorageData, SessionStorageData } from '../types';

export const storage = {
  async get<K extends keyof StorageData>(key: K): Promise<StorageData[K] | undefined> {
    const result = await chrome.storage.local.get(key);
    return result[key];
  },

  async set<K extends keyof StorageData>(key: K, value: StorageData[K]): Promise<void> {
    await chrome.storage.local.set({ [key]: value });
  },

  async getAll(): Promise<StorageData> {
    return await chrome.storage.local.get(null) as StorageData;
  },

  async remove(key: keyof StorageData): Promise<void> {
    await chrome.storage.local.remove(key);
  },

  async clear(): Promise<void> {
    await chrome.storage.local.clear();
  }
};

export const sessionStorage = {
  async get<K extends keyof SessionStorageData>(key: K): Promise<SessionStorageData[K] | undefined> {
    const result = await chrome.storage.session.get(key);
    return result[key];
  },

  async set<K extends keyof SessionStorageData>(key: K, value: SessionStorageData[K]): Promise<void> {
    await chrome.storage.session.set({ [key]: value });
  },

  async getAll(): Promise<SessionStorageData> {
    return await chrome.storage.session.get(null) as SessionStorageData;
  },

  async remove(key: keyof SessionStorageData): Promise<void> {
    await chrome.storage.session.remove(key);
  },

  async clear(): Promise<void> {
    await chrome.storage.session.clear();
  }
};
