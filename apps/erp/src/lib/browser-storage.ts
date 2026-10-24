// Saved data lives in IndexedDB (hundreds of MB) instead of localStorage (~5 MB per site).
// Until Supabase is connected, this is where the shop's data is kept on each device.

import { del, get, keys, set } from "idb-keyval";
import { createJSONStorage, type StateStorage } from "zustand/middleware";

const PREFIX = "moga-demo-";

/** Earlier versions kept full copies in localStorage under old keys; free that space. */
function clearLegacyLocalStorage() {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith(PREFIX)) localStorage.removeItem(key);
  } catch {
    // localStorage unavailable (private mode): nothing to clear
  }
}

/** Each data reset uses a new key; drop the copies left by earlier versions. */
async function clearOldVersions(current: string) {
  try {
    for (const key of await keys()) if (typeof key === "string" && key.startsWith(PREFIX) && key !== current) await del(key);
  } catch {
    // nothing to clean
  }
}

const idb: StateStorage = {
  getItem: async (name) => {
    try {
      void clearOldVersions(name);
      const saved = await get<string>(name);
      if (saved != null) return saved;
      // First run after the move: carry over this version's data from localStorage, then clean up.
      const legacy = localStorage.getItem(name);
      if (legacy != null) await set(name, legacy);
      clearLegacyLocalStorage();
      return legacy;
    } catch {
      return null; // server render or storage blocked: start from the defaults
    }
  },
  setItem: async (name, value) => {
    try {
      await set(name, value);
    } catch {
      // Storage blocked or full: keep working in memory rather than failing the action.
    }
  },
  removeItem: async (name) => {
    try {
      await del(name);
    } catch {
      // nothing to remove
    }
  },
};

export const idbStorage = createJSONStorage(() => idb);
