import { uid, loadState, mutateState, normalizeUrl } from './store.js';

const MENU_SAVE_PAGE = 'lumen-save-page';
const MENU_SAVE_LINK = 'lumen-save-link';
let badgeTimer;

function showBadge(text, color) {
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeText({ text });
  clearTimeout(badgeTimer);
  badgeTimer = setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2500);
}

function isWebUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function createInboxPage() {
  return {
    id: uid(),
    name: 'Inbox',
    boards: [{ id: uid(), name: 'Saved links', color: '#34d399', links: [] }]
  };
}

function ensureDestination(state, pageId, boardId, createBoardName) {
  if (!Array.isArray(state.pages)) state.pages = [];
  if (!state.pages.length) state.pages.push(createInboxPage());

  let page = pageId ? state.pages.find((item) => item.id === pageId) : null;
  if (!page) {
    page = state.pages.find((item) => item.id === state.activePageId) || state.pages[0];
  }
  if (!Array.isArray(page.boards)) page.boards = [];

  let board = boardId ? page.boards.find((item) => item.id === boardId) : null;
  if (!board && createBoardName) {
    board = {
      id: uid(),
      name: createBoardName,
      color: '#34d399',
      links: []
    };
    page.boards.push(board);
  }
  if (!board) board = page.boards[0];
  if (!board) {
    board = { id: uid(), name: 'Saved links', color: '#34d399', links: [] };
    page.boards.push(board);
  }
  if (!Array.isArray(board.links)) board.links = [];
  return { page, board };
}

async function saveLinks(records, destination = {}) {
  const valid = records
    .filter((item) => item && isWebUrl(item.url))
    .map((item) => ({ ...item, url: normalizeUrl(item.url) }));
  if (!valid.length) throw new Error('There are no valid web links to save.');

  await mutateState((state) => {
    const { board } = ensureDestination(
      state,
      destination.pageId,
      destination.boardId,
      destination.createBoardName
    );
    for (const item of valid) {
      board.links.unshift({
        id: uid(),
        title: (item.title || item.url).trim() || item.url,
        url: item.url,
        description: (item.description || '').trim(),
        tags: Array.isArray(item.tags) ? item.tags : [],
        createdAt: new Date().toISOString()
      });
    }
  });
  return valid.length;
}

async function saveCurrentTab(tab, destination) {
  if (!tab?.url || !isWebUrl(tab.url)) {
    throw new Error('This page cannot be saved. Lumen saves regular HTTP and HTTPS pages.');
  }
  return saveLinks([{ title: tab.title || tab.url, url: tab.url }], destination);
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_SAVE_PAGE,
      title: 'Save page to Lumen',
      contexts: ['page']
    });
    chrome.contextMenus.create({
      id: MENU_SAVE_LINK,
      title: 'Save link to Lumen',
      contexts: ['link']
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    if (info.menuItemId === MENU_SAVE_LINK && info.linkUrl) {
      const count = await saveLinks([{ title: info.linkUrl, url: info.linkUrl }]);
      showBadge(String(count), '#16845b');
    } else if (info.menuItemId === MENU_SAVE_PAGE) {
      const count = await saveCurrentTab(tab);
      showBadge(String(count), '#16845b');
    }
  } catch (error) {
    console.error('Lumen could not save this item:', error);
    showBadge('!', '#b42318');
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'quick-save') return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    await saveCurrentTab(tab);
  } catch (error) {
    console.error('Lumen quick save failed:', error);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) {
    sendResponse({ ok: false, error: 'This request did not come from a Lumen page.' });
    return undefined;
  }
  if (!message || typeof message !== 'object') return undefined;

  if (message.type === 'open-dashboard') {
    chrome.tabs.create({ url: chrome.runtime.getURL('newtab.html') })
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'open-links') {
    const urls = Array.isArray(message.urls) ? message.urls.filter(isWebUrl) : [];
    if (!urls.length) {
      sendResponse({ ok: false, error: 'No valid HTTP or HTTPS links were provided.' });
      return undefined;
    }
    const normalized = urls.map(normalizeUrl);
    const options = { url: normalized, incognito: message.incognito === true };
    chrome.windows.create(options)
      .then((window) => sendResponse({ ok: true, windowId: window.id }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'save-links') {
    saveLinks(Array.isArray(message.links) ? message.links : [], message.destination || {})
      .then((count) => sendResponse({ ok: true, count }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  // Kept available for a future explicit import flow. It only reports the
  // current optional permission and never prompts without a user gesture.
  if (message.type === 'bookmark-permission') {
    chrome.permissions.contains({ permissions: ['bookmarks'] })
      .then((granted) => sendResponse({ ok: true, granted }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return undefined;
});

// Touch the shared database on install so storage initialization errors appear
// in the extension service worker console rather than during the first save.
chrome.runtime.onInstalled.addListener(() => {
  loadState().catch((error) => console.error('Lumen storage initialization failed:', error));
});
