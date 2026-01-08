import { StorageData } from '../types';

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
