import { normalizeUrl, uid } from "./store.js";
import { normalizeFocus } from './focus-state.js';

const safeText = (value, fallback = "", max = 2000) =>
  typeof value === "string" ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "") : fallback;
const safeId = value => safeText(value).slice(0, 160).trim() || uid();
const safeTimestamp = value => (typeof value === "number" && Number.isFinite(value)) || (typeof value === "string" && Number.isFinite(Date.parse(value))) ? value : new Date().toISOString();

function normalizedLink(raw) {
  if (!raw || typeof raw !== "object") return null;
  let url;
  try { url = normalizeUrl(raw.url ?? raw.href ?? raw.link ?? ""); } catch { return null; }
  const rawTags = Array.isArray(raw.tags) ? raw.tags : typeof raw.tags === "string" ? raw.tags.split(/[;,]/) : [];
  const tags = rawTags.length
    ? [...new Set(rawTags.filter(tag => typeof tag === "string").map(tag => safeText(tag).trim()).filter(Boolean))]
    : [];
  return {
    id: safeId(raw.id),
    title: safeText(raw.title ?? raw.name ?? raw.label, "", 300).trim() || url,
    url,
    description: safeText(raw.description ?? raw.note ?? raw.notes, "", 2000),
    tags,
    createdAt: safeTimestamp(raw.createdAt ?? raw.dateAdded),
  };
}

function cleanPages(pages) {
  if (!Array.isArray(pages)) throw new Error("Backup pages must be a list.");
  const result = pages.map(page => {
    if (!page || typeof page !== "object" || !Array.isArray(page.boards)) throw new Error("Backup contains an invalid page.");
    return {
      id: safeId(page.id),
      name: safeText(page.name, "Imported", 120).trim() || "Imported",
      boards: page.boards.map(board => {
        if (!board || typeof board !== "object" || !Array.isArray(board.links)) throw new Error("Backup contains an invalid board.");
        return {
          id: safeId(board.id),
          name: safeText(board.name, "Bookmarks", 120).trim() || "Bookmarks",
          color: /^#[\da-f]{3,8}$/i.test(board.color || "") ? board.color : "#34d399",
          collapsed: typeof board.collapsed === "boolean" ? board.collapsed : undefined,
          links: board.links.map(normalizedLink).filter(Boolean),
        };
      }),
    };
  });
  const ids = new Set();
  const unique = object => { if (ids.has(object.id)) object.id = uid(); ids.add(object.id); };
  for (const page of result) { unique(page); for (const board of page.boards) { unique(board); for (const link of board.links) unique(link); } }
  return result;
}

function importSettings(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const result = {};
  if (["dark", "light", "system"].includes(raw.theme)) result.theme = raw.theme;
  if (typeof raw.accent === "string" && /^#[\da-f]{3,8}$/i.test(raw.accent)) result.accent = raw.accent;
  if (typeof raw.wallpaper === "string") result.wallpaper = safeText(raw.wallpaper, "aurora", 80);
  if (typeof raw.customWallpaper === "string" && /^data:image\/(?:png|jpeg|gif|webp|avif);base64,[a-z\d+/]*={0,2}$/i.test(raw.customWallpaper)) result.customWallpaper = raw.customWallpaper;
  if (Number.isInteger(raw.columns)) result.columns = Math.max(1, Math.min(8, raw.columns));
  if (["comfortable", "compact"].includes(raw.density)) result.density = raw.density;
  if (['boards', 'list'].includes(raw.layout)) result.layout = raw.layout;
  if (Number.isFinite(raw.surfaceOpacity)) result.surfaceOpacity = Math.max(35, Math.min(100, raw.surfaceOpacity));
  for (const key of ["showDescriptions", "openInNewTab", "privacy", "incognito", "showFocusPanel", "showDomains"]) {
    if (typeof raw[key] === "boolean") result[key] = raw[key];
  }
  return Object.keys(result).length ? result : undefined;
}

function parseLegacyDatabase(data) {
  if (!Array.isArray(data?.pages) || !Array.isArray(data?.boards) || !Array.isArray(data?.bookmarks)) return null;
  const pages = data.pages.filter(page => page && !page.deletedAt).map(page => ({
    id: safeId(page.id),
    name: safeText(page.name, "Imported", 120) || "Imported",
    boards: [],
  }));
  const pageById = new Map(pages.map(page => [String(page.id), page]));
  const boardById = new Map();
  for (const raw of data.boards) {
    if (!raw || raw.deletedAt) continue;
    const page = pageById.get(String(raw.pageId)) || pages[0];
    if (!page) continue;
    const board = {
      id: safeId(raw.id),
      name: safeText(raw.name, "Bookmarks", 120) || "Bookmarks",
      color: /^#[\da-f]{3,8}$/i.test(raw.color || "") ? raw.color : "#34d399",
      links: [],
    };
    page.boards.push(board);
    boardById.set(String(raw.id), board);
  }
  for (const raw of data.bookmarks) {
    if (!raw || raw.deletedAt) continue;
    const board = boardById.get(String(raw.boardId));
    const link = normalizedLink(raw);
    if (board && link) board.links.push(link);
  }
  const activePages = pages.filter(page => page.boards.length);
  const activePageId = activePages.some(page => page.id === data.activePageId) ? data.activePageId : activePages[0]?.id;
  const trash = ensureUniqueTrashIds(activePages, cleanTrash(data.trash) || []);
  return { pages: activePages, links: [], ...(importSettings(data.settings) ? { settings: importSettings(data.settings) } : {}), ...(trash.length ? { trash } : {}), ...(activePageId ? { activePageId } : {}) };
}

function cleanTrash(items) {
  if (!Array.isArray(items)) return undefined;
  return items.flatMap(raw => {
    if (!raw || !["link", "board", "page"].includes(raw.kind) || !raw.item || typeof raw.item !== "object") return [];
    let item;
    try {
      if (raw.kind === "link") item = normalizedLink(raw.item);
      else if (raw.kind === "board") item = cleanPages([{ id: "holder", name: "holder", boards: [raw.item] }])[0]?.boards[0];
      else item = cleanPages([raw.item])[0];
    } catch { return []; }
    if (!item) return [];
    return [{ id: safeId(raw.id), kind: raw.kind, item, pageId: safeText(raw.pageId).slice(0, 160), boardId: safeText(raw.boardId).slice(0, 160), ...(Number.isInteger(raw.index) && raw.index >= 0 ? { index: raw.index } : {}), deletedAt: (typeof raw.deletedAt === "number" && Number.isFinite(raw.deletedAt)) || (typeof raw.deletedAt === "string" && Number.isFinite(Date.parse(raw.deletedAt))) ? raw.deletedAt : new Date().toISOString() }];
  });
}

function ensureUniqueTrashIds(pages, trash = []) {
  const seen = new Set();
  const add = object => { if (seen.has(object.id)) object.id = uid(); seen.add(object.id); };
  for (const page of pages) { add(page); for (const board of page.boards) { add(board); for (const link of board.links) add(link); } }
  for (const entry of trash) {
    add(entry);
    if (entry.kind === "link") add(entry.item);
    else if (entry.kind === "board") { add(entry.item); for (const link of entry.item.links) add(link); }
    else { add(entry.item); for (const board of entry.item.boards) { add(board); for (const link of board.links) add(link); } }
  }
  return trash;
}

function parseBackup(data) {
  const value = data?.state && typeof data.state === "object" ? data.state : data;
  if (value?.exportType === "lumilist-bookmark-portability") return parseLumiListPortability(value);
  const legacy = parseLegacyDatabase(value);
  if (legacy) return legacy;
  if (!value || !Array.isArray(value.pages)) throw new Error("This JSON file is not a supported Lumen backup or bookmark list.");
  const pages = cleanPages(value.pages);
  if (!pages.length) throw new Error("The backup contains no pages.");
  const trash = ensureUniqueTrashIds(pages, cleanTrash(value.trash) || []);
  const activePageId = pages.some(page => page.id === value.activePageId) ? value.activePageId : pages[0].id;
  return { pages, links: [], ...(importSettings(value.settings) ? { settings: importSettings(value.settings) } : {}), ...(trash.length ? { trash } : {}), activePageId, ...(value.focus ? { focus: normalizeFocus(value.focus) } : {}) };
}

function parseLumiListPortability(data) {
  if (!Array.isArray(data.bookmarks)) throw new Error("The LumiList export has no bookmark list.");
  const pages = new Map(), boards = new Map(), trash = [];
  const order = value => Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
  const rows = data.bookmarks.filter(row => row && typeof row === 'object').slice().sort((a,b) => {
    for (const key of ['pageOrder','boardColumnIndex','boardOrder','bookmarkOrder']) {const delta=order(a[key])-order(b[key]);if(delta)return delta;}return 0;
  });
  for (const row of rows) {
    const link=normalizedLink(row);if(!link)continue;
    const pageName=safeText(row.pageName).trim()||'Imported LumiList',boardName=safeText(row.boardName).trim()||'Bookmarks';
    if(!pages.has(pageName))pages.set(pageName,{id:uid(),name:pageName,boards:[]});
    const page=pages.get(pageName),key=pageName+'\u0000'+boardName;
    if(!boards.has(key)){const board={id:uid(),name:boardName,color:'#34d399',links:[]};boards.set(key,board);page.boards.push(board);}
    const board=boards.get(key);
    if(String(row.status).toLowerCase()==='trashed'||row.deletedAt)trash.push({id:uid(),kind:'link',item:link,pageId:page.id,boardId:board.id,index:board.links.length,deletedAt:safeTimestamp(row.deletedAt)});
    else board.links.push(link);
  }
  const result=[...pages.values()];
  if(!result.length)throw new Error('No safe bookmarks were found in this LumiList export.');
  return {pages:result,links:[],trash,activePageId:result[0].id};
}

function collectBookmarkTree(nodes, path = [], output = []) {
  if (!Array.isArray(nodes)) return output;
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    if (typeof node.url === "string") {
      const link = normalizedLink({ title: node.title || node.name, url: node.url, createdAt: node.dateAdded });
      if (link) output.push({ ...link, _folderPath: path });
    } else {
      const title = safeText(node.title || node.name, "", 120);
      collectBookmarkTree(node.children, title ? [...path, title] : path, output);
    }
  }
  return output;
}

function parseBookmarkJson(data) {
  const roots = Array.isArray(data) ? data : data?.roots ? Object.values(data.roots) : null;
  if (!roots) return null;
  const links = collectBookmarkTree(roots);
  const groups = new Map();
  for (const entry of links) {
    const page = entry._folderPath[0] || "Imported bookmarks";
    const board = entry._folderPath.length > 1 ? entry._folderPath.slice(1).join(" / ") : "Bookmarks";
    const key = `${page}\u0000${board}`;
    if (!groups.has(key)) groups.set(key, { page, board, links: [] });
    const { _folderPath, ...link } = entry;
    groups.get(key).links.push(link);
  }
  const pages = new Map();
  for (const group of groups.values()) {
    if (!pages.has(group.page)) pages.set(group.page, { id: uid(), name: group.page, boards: [] });
    pages.get(group.page).boards.push({ id: uid(), name: group.board, color: "#34d399", links: group.links });
  }
  return { pages: [...pages.values()], links: [] };
}

function decodeHtml(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (_, entity) => {
    const key = entity.toLowerCase();
    if (key === "amp") return "&";
    if (key === "quot") return '"';
    if (key === "apos") return "'";
    if (key === "lt") return "<";
    if (key === "gt") return ">";
    if (key === "nbsp") return " ";
    const number = key.startsWith("#x") ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10);
    try { return Number.isFinite(number) && number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : ""; } catch { return ""; }
  });
}

function parseNetscapeHtml(text) {
  const entries = [];
  const stack = [];
  let pendingFolder = "";
  const tokens = text.match(/<H3\b[^>]*>[\s\S]*?<\/H3\s*>|<A\b[^>]*>[\s\S]*?<\/A\s*>|<DL\b[^>]*>|<\/DL\s*>/gi) || [];
  for (const token of tokens) {
    if (/^<DL\b/i.test(token)) { stack.push(pendingFolder || ""); pendingFolder = ""; }
    else if (/^<\/DL/i.test(token)) stack.pop();
    else if (/^<H3\b/i.test(token)) {
      pendingFolder = safeText(decodeHtml(token.replace(/^<H3\b[^>]*>/i, "").replace(/<\/H3\s*>$/i, "").replace(/<[^>]*>/g, "")), "Folder");
    } else if (/^<A\b/i.test(token)) {
      const attr = token.match(/\bHREF\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      if (!attr) continue;
      const title = safeText(decodeHtml(token.replace(/^<A\b[^>]*>/i, "").replace(/<\/A\s*>$/i, "").replace(/<[^>]*>/g, "")), "", 300);
      const link = normalizedLink({ title, url: decodeHtml(attr[1] ?? attr[2] ?? attr[3] ?? "") });
      if (link) entries.push({ ...link, _folderPath: stack.filter(Boolean) });
    }
  }
  if (!entries.length) throw new Error("No safe bookmarks were found in this HTML file.");
  const groups = new Map();
  for (const entry of entries) {
    const folderPath = entry._folderPath;
    const pageName = folderPath[0] || "Imported bookmarks";
    const boardName = folderPath.length > 1 ? folderPath.slice(1).join(" / ") : "Bookmarks";
    const key = `${pageName}\u0000${boardName}`;
    if (!groups.has(key)) groups.set(key, { page: pageName, board: boardName, links: [] });
    const { _folderPath, ...link } = entry;
    groups.get(key).links.push(link);
  }
  const byPage = new Map();
  for (const group of groups.values()) {
    if (!byPage.has(group.page)) byPage.set(group.page, { id: uid(), name: group.page, boards: [] });
    byPage.get(group.page).boards.push({ id: uid(), name: group.board, color: "#34d399", links: group.links });
  }
  return { pages: [...byPage.values()], links: [] };
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell === "") quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  if (quoted) throw new Error("CSV has an unclosed quoted field.");
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  if (!rows.length) throw new Error("CSV file is empty.");
  const first = rows[0].map(value => value.trim().toLowerCase());
  const hasHeader = first.some(value => ["url", "href", "link", "title", "name", "description", "note", "notes", "tags", "tag", "page", "pagename", "board", "boardname", "folder"].includes(value));
  const header = hasHeader ? first : null;
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const index = names => header ? header.findIndex(value => names.includes(value)) : -1;
  const urlIndex = index(["url", "href", "link"]);
  const titleIndex = index(["title", "name", "label"]);
  const descIndex = index(["description", "note", "notes"]);
  const tagsIndex = index(["tags", "tag"]);
  const pageIndex = index(["page", "pagename"]);
  const boardIndex = index(["board", "folder", "boardname"]);
  const links = [];
  for (const data of dataRows) {
    const candidate = urlIndex >= 0 ? data[urlIndex] : data[1] || data[0];
    const link = normalizedLink({ url: candidate, title: titleIndex >= 0 ? data[titleIndex] : data[0], description: descIndex >= 0 ? data[descIndex] : "", tags: tagsIndex >= 0 ? data[tagsIndex] : [] });
    if (link) links.push({ ...link, ...(pageIndex >= 0 ? { page: safeText(data[pageIndex] || "") } : {}), ...(boardIndex >= 0 ? { board: safeText(data[boardIndex] || "") } : {}) });
  }
  if (!links.length) throw new Error("No valid bookmarks were found in this CSV file.");
  return { pages: [], links };
}

function parseText(text) {
  const links = [];
  for (const line of text.split(/\r?\n/)) {
    const value = line.trim();
    if (!value || value.startsWith("#")) continue;
    const match = value.match(/^(.*?)\s*<((?:https?|ftp|mailto):[^>]+)>\s*$/i);
    const url = match ? match[2] : value.match(/^(?:https?|ftp|mailto):\S+$/i) ? value : "";
    const title = match ? match[1].trim() : "";
    const link = normalizedLink({ url, title });
    if (link) links.push(link);
  }
  if (!links.length) throw new Error("No valid URLs were found in this file.");
  return { pages: [], links };
}

export function parseImport(text, filename = "") {
  if (typeof text !== "string" || !text.trim()) throw new Error("Choose a non-empty file to import.");
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  const lowerName = String(filename).toLowerCase();
  if (lowerName.endsWith(".json") || /^[{[]/.test(trimmed)) {
    let data;
    try { data = JSON.parse(trimmed); } catch { if (lowerName.endsWith(".json")) throw new Error("This JSON file is not valid."); }
    if (data !== undefined) {
      try { return parseBackup(data); } catch (error) {
        const tree = parseBookmarkJson(data);
        if (tree?.links.length) return tree;
        if (Array.isArray(data)) {
          const links = data.map(normalizedLink).filter(Boolean);
          if (links.length) return { pages: [], links };
        }
        throw error;
      }
    }
  }
  if (/<(?:!DOCTYPE\s+NETSCAPE-Bookmark-file|DL\b|A\b|H3\b)/i.test(trimmed)) return parseNetscapeHtml(trimmed);
  if (lowerName.endsWith(".csv") || (/,/.test(trimmed.split(/\r?\n/, 1)[0]) && !/^(?:https?|ftp|mailto|file):/i.test(trimmed))) return parseCsv(trimmed);
  return parseText(trimmed);
}

export function exportJson(state) {
  return JSON.stringify({ app: "Lumen Free", version: 1, exportedAt: new Date().toISOString(), state }, null, 2);
}

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

export function exportHtml(state) {
  const rows = ["<!DOCTYPE NETSCAPE-Bookmark-file-1>", "<META HTTP-EQUIV=\"Content-Type\" CONTENT=\"text/html; charset=UTF-8\">", "<TITLE>Lumen Bookmarks</TITLE>", "<H1>Lumen Bookmarks</H1>"];
  const emitBoard = board => {
    rows.push("<DT><H3>" + escapeHtml(board.name) + "</H3>", "<DL><p>");
    for (const link of board.links || []) {
      let href;
      try { href = normalizeUrl(link.url); } catch { continue; }
      rows.push(`<DT><A HREF="${escapeHtml(href)}">${escapeHtml(link.title || href)}</A>`);
    }
    rows.push("</DL><p>");
  };
  for (const page of state?.pages || []) {
    rows.push("<DT><H3>" + escapeHtml(page.name) + "</H3>", "<DL><p>");
    for (const board of page.boards || []) emitBoard(board);
    rows.push("</DL><p>");
  }
  return rows.join("\n");
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function exportCsv(state) {
  const rows = [["title", "url", "description", "tags", "page", "board"]];
  for (const page of state?.pages || []) for (const board of page.boards || []) for (const link of board.links || []) {
    let url;
    try { url = normalizeUrl(link.url); } catch { continue; }
    rows.push([link.title || url, url, link.description || "", (link.tags || []).join("; "), page.name, board.name]);
  }
  return rows.map(row => row.map(escapeCsv).join(",")).join("\r\n");
}

function flattenLinks(parsed) {
  const result = [];
  for (const page of parsed.pages || []) for (const board of page.boards || []) {
    for (const raw of board.links || []) {
      const link = normalizedLink(raw);
      if (link) result.push({ ...link, _page: page.name, _board: board.name });
    }
  }
  for (const raw of parsed.links || []) {
    const link = normalizedLink(raw);
    if (link) result.push({ ...link, _page: raw.page || "", _board: raw.board || "" });
  }
  return result;
}

export function mergeImport(state, parsed, { pageId, boardId, dedupe = true } = {}) {
  if (!state || !Array.isArray(state.pages)) throw new Error("A valid workspace state is required.");
  if (!parsed || typeof parsed !== "object") throw new Error("Import data is invalid.");
  let added = 0, skipped = 0;
  const pageIds = new Map(), boardIds = new Map();
  const hash = value => {
    try { const url = new URL(normalizeUrl(value)); url.hash = ""; return url.href.replace(/\/$/, ""); }
    catch { return String(value || "").toLowerCase(); }
  };
  const existing = new Set();
  const usedIds = new Set();
  for (const page of state.pages) { usedIds.add(page.id); for (const board of page.boards || []) { usedIds.add(board.id); for (const link of board.links || []) usedIds.add(link.id); } }
  for (const item of state.trash || []) usedIds.add(item.id);
  const uniqueId = id => { if (!id || usedIds.has(id)) id = uid(); usedIds.add(id); return id; };
  if (dedupe) for (const page of state.pages) for (const board of page.boards || []) for (const link of board.links || []) existing.add(hash(link.url));

  if (Array.isArray(parsed.pages) && parsed.pages.length) {
    for (const rawPage of parsed.pages) {
      const page = { id: uid(), name: safeText(rawPage.name, "Imported", 120) || "Imported", boards: [] };
      pageIds.set(rawPage.id,page.id);
      for (const rawBoard of rawPage.boards || []) {
        const board = { id: uid(), name: safeText(rawBoard.name, "Bookmarks") || "Bookmarks", color: /^#[\da-f]{3,8}$/i.test(rawBoard.color || "") ? rawBoard.color : "#34d399", ...(typeof rawBoard.collapsed === "boolean" ? { collapsed: rawBoard.collapsed } : {}), links: [] };
        boardIds.set(rawBoard.id,board.id);
        for (const rawLink of rawBoard.links || []) {
          const link = normalizedLink(rawLink);
          if (!link) { skipped++; continue; }
          const key = hash(link.url);
          if (dedupe && existing.has(key)) { skipped++; continue; }
          existing.add(key);
          link.id = uniqueId(link.id);
          board.links.push(link); added++;
        }
        if (board.links.length || !rawBoard.links?.length) page.boards.push(board);
      }
      if (page.boards.length || !rawPage.boards?.length) state.pages.push(page);
    }
  }
  const incoming = (parsed.links || []).map(raw => {
    const link = normalizedLink(raw);
    return link ? { ...link, _page: safeText(raw.page || raw._page || ""), _board: safeText(raw.board || raw._board || "") } : null;
  });
  let page = state.pages.find(item => item.id === pageId) || state.pages.find(item => item.id === state.activePageId) || state.pages[0];
  let board = page?.boards.find(item => item.id === boardId);
  for (const link of incoming) {
    if (!link) { skipped++; continue; }
    const key = hash(link.url);
    if (dedupe && existing.has(key)) { skipped++; continue; }
    existing.add(key);
    let targetPage = page, targetBoard = board;
    if (link._page) targetPage = state.pages.find(item => item.name === link._page) || null;
    if (!targetPage) {
      targetPage = { id: uid(), name: link._page || "Imported", boards: [] };
      state.pages.push(targetPage); state.activePageId ||= targetPage.id;
      if (!page) page = targetPage;
    }
    if (link._board) targetBoard = targetPage.boards.find(item => item.name === link._board) || null;
    else if (targetPage !== page) targetBoard = null;
    if (!targetBoard) {
      targetBoard = { id: uid(), name: link._board || "Imported", color: "#34d399", links: [] };
      targetPage.boards.push(targetBoard);
      if (targetPage === page && !board) board = targetBoard;
    }
    delete link._page; delete link._board;
    link.id = uniqueId(link.id);
    targetBoard.links.push(link); added++;
  }
  if (Array.isArray(parsed.trash)) for (const raw of parsed.trash) {
    const entry = cleanTrash([raw])[0];
    if (entry) {
      entry.id = uniqueId(entry.id);
      entry.pageId = pageIds.get(entry.pageId) || entry.pageId;
      entry.boardId = boardIds.get(entry.boardId) || entry.boardId;
      const uniqueTree = object => { object.id = uniqueId(object.id); };
      if (entry.kind === "link") uniqueTree(entry.item);
      else if (entry.kind === "board") { uniqueTree(entry.item); for (const link of entry.item.links) uniqueTree(link); }
      else { uniqueTree(entry.item); for (const board of entry.item.boards) { uniqueTree(board); for (const link of board.links) uniqueTree(link); } }
      state.trash ||= []; state.trash.push(entry);
    }
  }
  return { added, skipped };
}
