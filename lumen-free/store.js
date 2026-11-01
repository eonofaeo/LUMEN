import { normalizeFocus } from './focus-state.js';

const DATABASE_NAME = "lumen-free-workspace";
const DATABASE_VERSION = 1;
const STORE_NAME = "records";
const RECORD_KEY = "workspace";
const FALLBACK_KEY = "lumen-free.workspace.v1";

const DEFAULT_SETTINGS = Object.freeze({
  theme: "dark",
  accent: "#34d399",
  wallpaper: "aurora",
  customWallpaper: "",
  columns: 4,
  density: "comfortable",
  showDescriptions: true,
  openInNewTab: true,
  privacy: false,
  incognito: false,
  layout: 'boards',
  surfaceOpacity: 88,
  showFocusPanel: true,
  showDomains: true,
});

const starterPages = [
  {
    name: "Home",
    boards: [
      { name: "Daily", color: "#34d399", links: [
        ["Gmail", "https://mail.google.com/"], ["Google Calendar", "https://calendar.google.com/"],
        ["Google Drive", "https://drive.google.com/"], ["Weather", "https://weather.com/"],
      ] },
      { name: "News", color: "#60a5fa", links: [
        ["BBC News", "https://www.bbc.com/news"], ["Reuters", "https://www.reuters.com/"],
        ["AP News", "https://apnews.com/"], ["The Guardian", "https://www.theguardian.com/"],
      ] },
      { name: "Food", color: "#fb923c", links: [
        ["NYT Cooking", "https://cooking.nytimes.com/"], ["Serious Eats", "https://www.seriouseats.com/"],
        ["BBC Good Food", "https://www.bbcgoodfood.com/"], ["Budget Bytes", "https://www.budgetbytes.com/"],
      ] },
      { name: "Shopping", color: "#f472b6", links: [
        ["Etsy", "https://www.etsy.com/"], ["eBay", "https://www.ebay.com/"],
        ["Wirecutter", "https://www.nytimes.com/wirecutter/"],
      ] },
      { name: "AI & ideas", color: "#a78bfa", links: [
        ["ChatGPT", "https://chatgpt.com/"], ["Claude", "https://claude.ai/"],
        ["Perplexity", "https://www.perplexity.ai/"], ["Gemini", "https://gemini.google.com/"],
      ] },
      { name: "Create something", color: "#fbbf24", links: [
        ["Figma", "https://www.figma.com/"], ["Canva", "https://www.canva.com/"],
        ["Unsplash", "https://unsplash.com/"], ["Dribbble", "https://dribbble.com/"],
      ] },
      { name: "Stay connected", color: "#2dd4bf", links: [
        ["WhatsApp", "https://web.whatsapp.com/"], ["Discord", "https://discord.com/app"],
        ["Telegram", "https://web.telegram.org/"], ["Reddit", "https://www.reddit.com/"],
      ] },
      { name: "A little downtime", color: "#fb7185", links: [
        ["YouTube", "https://www.youtube.com/"], ["Spotify", "https://open.spotify.com/"],
        ["Internet Archive", "https://archive.org/"], ["Letterboxd", "https://letterboxd.com/"],
      ] },
    ],
  },
  {
    name: "Work",
    boards: [
      { name: "Productivity", color: "#818cf8", links: [
        ["Notion", "https://www.notion.so/"], ["Trello", "https://trello.com/"],
        ["Figma", "https://www.figma.com/"], ["Slack", "https://slack.com/"],
      ] },
      { name: "Development", color: "#34d399", links: [
        ["GitHub", "https://github.com/"], ["MDN Web Docs", "https://developer.mozilla.org/"],
        ["Stack Overflow", "https://stackoverflow.com/"], ["Can I use", "https://caniuse.com/"],
      ] },
    ],
  },
  {
    name: "Reading",
    boards: [
      { name: "Long Reads", color: "#fbbf24", links: [
        ["The Atlantic", "https://www.theatlantic.com/"], ["Aeon", "https://aeon.co/"],
        ["Longreads", "https://longreads.com/"],
      ] },
      { name: "Learn", color: "#38bdf8", links: [
        ["Khan Academy", "https://www.khanacademy.org/"], ["Wikipedia", "https://www.wikipedia.org/"],
        ["Project Gutenberg", "https://www.gutenberg.org/"], ["TED", "https://www.ted.com/"],
      ] },
    ],
  },
];

export function uid() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch { /* use the local fallback */ }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function normalizeUrl(input) {
  if (typeof input !== "string") throw new TypeError("URL must be text.");
  const value = input.trim();
  if (!value || /[\u0000-\u001f\u007f]/.test(value)) throw new Error("Enter a valid URL.");
  let parsed;
  try {
    // Accept common bare domains, but require an explicit scheme for other forms.
    parsed = /^[a-z][a-z\d+.-]*:/i.test(value) ? new URL(value) : new URL(`https://${value}`);
  } catch {
    throw new Error("Enter a valid URL.");
  }
  const allowed = new Set(["http:", "https:", "ftp:", "mailto:", "file:"]);
  if (!allowed.has(parsed.protocol.toLowerCase())) throw new Error("This URL scheme is not allowed.");
  if (["http:", "https:", "ftp:"].includes(parsed.protocol) && !parsed.hostname) throw new Error("Enter a valid URL.");
  return parsed.href;
}

function safeText(value, fallback = "", max = Infinity) {
  return typeof value === "string" ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "") : fallback;
}

function safeId(value) {
  const id = safeText(value).slice(0, 160).trim();
  return id || uid();
}

function safeTimestamp(value, fallback = new Date().toISOString()) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Date.parse(value))) return value;
  return fallback;
}

function safeImageDataUrl(value) {
  return typeof value === "string" && /^data:image\/(?:png|jpeg|gif|webp|avif);base64,[a-z\d+/]*={0,2}$/i.test(value) ? value : "";
}

function normalizeLink(raw) {
  if (!raw || typeof raw !== "object") return null;
  let url;
  try { url = normalizeUrl(raw.url); } catch { return null; }
  const tags = Array.isArray(raw.tags)
    ? [...new Set(raw.tags.filter(tag => typeof tag === "string").map(tag => safeText(tag).trim()).filter(Boolean))]
    : [];
  return {
    id: safeId(raw.id),
    title: safeText(raw.title).trim() || url,
    url,
    description: safeText(raw.description),
    tags,
    createdAt: safeTimestamp(raw.createdAt),
  };
}

function normalizeBoard(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    id: safeId(raw.id),
    name: safeText(raw.name, "Untitled board").trim() || "Untitled board",
    color: /^#[\da-f]{3,8}$/i.test(raw.color || "") ? raw.color : "#34d399",
    ...(typeof raw.collapsed === "boolean" ? { collapsed: raw.collapsed } : {}),
    links: Array.isArray(raw.links) ? raw.links.map(normalizeLink).filter(Boolean) : [],
  };
}

function normalizePage(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    id: safeId(raw.id),
    name: safeText(raw.name, "Untitled page").trim() || "Untitled page",
    boards: Array.isArray(raw.boards) ? raw.boards.map(normalizeBoard).filter(Boolean) : [],
  };
}

function normalizeTrashItem(raw) {
  if (!raw || !["link", "board", "page"].includes(raw.kind)) return null;
  let item;
  if (raw.kind === "link") item = normalizeLink(raw.item);
  else if (raw.kind === "board") item = normalizeBoard(raw.item);
  else item = normalizePage(raw.item);
  if (!item) return null;
  return {
    id: safeId(raw.id), kind: raw.kind, item,
    pageId: safeText(raw.pageId).slice(0, 160), boardId: safeText(raw.boardId).slice(0, 160),
    ...(Number.isInteger(raw.index) && raw.index >= 0 ? { index: raw.index } : {}),
    deletedAt: safeTimestamp(raw.deletedAt),
  };
}

function normalizeState(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const pages = Array.isArray(source.pages) ? source.pages.map(normalizePage).filter(Boolean) : [];
  const usedIds = new Set();
  const unique = object => { if (usedIds.has(object.id)) object.id = uid(); usedIds.add(object.id); };
  for (const page of pages) { unique(page); for (const board of page.boards) { unique(board); for (const link of board.links) unique(link); } }
  const settings = { ...DEFAULT_SETTINGS };
  if (source.settings && typeof source.settings === "object") {
    const input = source.settings;
    if (["dark", "light", "system"].includes(input.theme)) settings.theme = input.theme;
    if (typeof input.accent === "string" && /^#[\da-f]{3,8}$/i.test(input.accent)) settings.accent = input.accent;
    if (typeof input.wallpaper === "string") settings.wallpaper = safeText(input.wallpaper, "aurora", 80);
    if (typeof input.customWallpaper === "string") settings.customWallpaper = safeImageDataUrl(input.customWallpaper);
    if (Number.isInteger(input.columns)) settings.columns = Math.max(1, Math.min(8, input.columns));
    if (["comfortable", "compact"].includes(input.density)) settings.density = input.density;
    if (['boards', 'list'].includes(input.layout)) settings.layout = input.layout;
    if (Number.isFinite(input.surfaceOpacity)) settings.surfaceOpacity = Math.max(35, Math.min(100, input.surfaceOpacity));
    for (const key of ["showDescriptions", "openInNewTab", "privacy", "incognito", "showFocusPanel", "showDomains"]) {
      if (typeof input[key] === "boolean") settings[key] = input[key];
    }
  }
  const trash = Array.isArray(source.trash) ? source.trash.map(normalizeTrashItem).filter(Boolean) : [];
  const seenTrash = new Set(usedIds);
  const uniqueTrashObject = object => { if (seenTrash.has(object.id)) object.id = uid(); seenTrash.add(object.id); };
  for (const entry of trash) {
    uniqueTrashObject(entry);
    if (entry.kind === "link") uniqueTrashObject(entry.item);
    else if (entry.kind === "board") { uniqueTrashObject(entry.item); for (const link of entry.item.links) uniqueTrashObject(link); }
    else { uniqueTrashObject(entry.item); for (const board of entry.item.boards) { uniqueTrashObject(board); for (const link of board.links) uniqueTrashObject(link); } }
  }
  if (!pages.length) pages.push({ id: uid(), name: "Home", boards: [] });
  const activePageId = pages.some(page => page.id === source.activePageId) ? source.activePageId : pages[0]?.id || "";
  return {
    version: 1,
    pages,
    activePageId,
    settings,
    focus: normalizeFocus(source.focus),
    trash,
    updatedAt: safeTimestamp(source.updatedAt),
  };
}

export function createDefaultState() {
  const pages = starterPages.map(page => ({
    id: uid(),
    name: page.name,
    boards: page.boards.map(board => ({
      id: uid(),
      name: board.name,
      color: board.color,
      links: board.links.map(([title, url]) => ({
        id: uid(), title, url, description: "", tags: [], createdAt: new Date().toISOString(),
      })),
    })),
  }));
  return normalizeState({ version: 1, pages, activePageId: pages[0].id, settings: DEFAULT_SETTINGS, trash: [] });
}

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(new Error("IndexedDB is unavailable."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open local database."));
    request.onblocked = () => reject(new Error("Local database upgrade is blocked by another tab."));
  });
}

function readLocalFallback() {
  try {
    const value = globalThis.localStorage?.getItem(FALLBACK_KEY);
    return value ? normalizeState(JSON.parse(value)) : null;
  } catch { return null; }
}

function writeLocalFallback(state) {
  try {
    if (!globalThis.localStorage) throw new Error("Local storage is unavailable.");
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(state));
  } catch (error) {
    throw new Error(`Could not save workspace locally: ${error?.message || "storage unavailable"}`);
  }
}

function notifyWorkspaceChanged(state) {
  try {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel("lumen-workspace");
    channel.postMessage({ type: "updated", updatedAt: state.updatedAt });
    channel.close();
  } catch { /* notifications are best effort */ }
}

export async function loadState() {
  if (!globalThis.indexedDB) {
    const fallback = readLocalFallback();
    if (fallback) return fallback;
    const state = createDefaultState();
    writeLocalFallback(state);
    return state;
  }
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(RECORD_KEY);
      let state;
      request.onsuccess = () => {
        try {
          state = normalizeState(request.result || readLocalFallback() || createDefaultState());
          if (!request.result) store.put(state, RECORD_KEY);
        } catch (error) { try { tx.abort(); } catch {} reject(error); }
      };
      request.onerror = () => { try { tx.abort(); } catch {} reject(request.error || new Error("Could not read workspace.")); };
      tx.oncomplete = () => resolve(state);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error("Could not initialize workspace."));
    });
  } finally { db.close(); }
}

export async function saveState(state) {
  const normalized = normalizeState(state);
  normalized.updatedAt = Date.now();
  if (!globalThis.indexedDB) writeLocalFallback(normalized);
  else {
    const db = await openDatabase();
    try { await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(normalized, RECORD_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error || new Error("Could not save workspace."));
    }); } finally { db.close(); }
  }
  notifyWorkspaceChanged(normalized);
  return normalized;
}

/** Read and update the workspace inside one IndexedDB read/write transaction.
 * Mutators should be synchronous and modify the supplied draft in place.
 */
export async function mutateState(mutator) {
  if (typeof mutator !== "function") throw new TypeError("mutateState expects a function.");
  const withLock = async fn => {
    if (globalThis.navigator?.locks?.request) return navigator.locks.request("lumen-free-workspace", fn);
    return fn();
  };
  return withLock(async () => {
    if (!globalThis.indexedDB) {
      const state = readLocalFallback() || createDefaultState();
      const result = mutator(state);
      if (result && typeof result.then === "function") throw new TypeError("mutateState mutator must be synchronous.");
      state.updatedAt = Date.now();
      const normalized = normalizeState(state);
      writeLocalFallback(normalized);
      notifyWorkspaceChanged(normalized);
      return normalized;
    }
    const db = await openDatabase();
    try {
      const result = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(RECORD_KEY);
        let next;
        let mutationResult;
        request.onsuccess = () => {
          try {
            next = normalizeState(request.result || readLocalFallback() || createDefaultState());
            mutationResult = mutator(next);
            if (mutationResult && typeof mutationResult.then === "function") throw new TypeError("mutateState mutator must be synchronous.");
            next.updatedAt = Date.now();
            store.put(next, RECORD_KEY);
          } catch (error) { try { tx.abort(); } catch {} reject({ mutationFailure: error }); }
        };
        request.onerror = () => { try { tx.abort(); } catch {} reject(request.error || new Error("Could not read workspace.")); };
        tx.oncomplete = () => { db.close(); resolve({ state: next, result: mutationResult }); };
        tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || new Error("Could not update workspace.")); };
      });
      notifyWorkspaceChanged(result.state);
      return result.state;
    } catch (error) {
      if (error?.mutationFailure) throw error.mutationFailure;
      throw error;
    } finally { db.close(); }
  });
}
