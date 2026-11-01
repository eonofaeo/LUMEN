import { uid, loadState, mutateState, normalizeUrl } from './store.js';

const $ = (selector) => document.querySelector(selector);
const pageSelect = $('#page-select');
const boardSelect = $('#board-select');
const newBoardName = $('#new-board-name');
const message = $('#message');
let tab = null;
let state = null;

function setMessage(text, success = false) {
  message.textContent = text;
  message.classList.toggle('success', success);
}

function fillSelect(select, items, selected) {
  select.replaceChildren();
  for (const item of items) {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.name;
    select.append(option);
  }
  if (selected && items.some((item) => item.id === selected)) select.value = selected;
}

function drawBoards(preferredId) {
  const page = state?.pages?.find((item) => item.id === pageSelect.value);
  const boards = page?.boards || [];
  fillSelect(boardSelect, boards, preferredId || boards[0]?.id);
  const createOption = document.createElement('option');
  createOption.value = '__create__';
  createOption.textContent = '＋ Create a new board…';
  boardSelect.append(createOption);
}

function drawPages() {
  const pages = state?.pages || [];
  fillSelect(pageSelect, pages, state?.activePageId || pages[0]?.id);
  drawBoards();
}

async function refreshState() {
  state = await loadState();
  document.body.dataset.theme = state.settings.theme === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : state.settings.theme;
  document.body.style.setProperty('--popup-accent',state.settings.accent);
  $('#libraryCount').textContent = state.pages.reduce((n,p)=>n+p.boards.reduce((n,b)=>n+b.links.length,0),0) + ' bookmarks saved';
  drawPages();
}

function cleanUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? normalizeUrl(value) : null;
  } catch {
    return null;
  }
}

function tagList(value) {
  return value.split(',').map((tag) => tag.trim()).filter(Boolean);
}

async function saveRecord(record) {
  const pageId = pageSelect.value;
  const selectedBoard = boardSelect.value;
  const createBoardName = selectedBoard === '__create__' ? newBoardName.value.trim() : '';
  if (selectedBoard === '__create__' && !createBoardName) {
    throw new Error('Enter a name for the new board.');
  }
  await mutateState((draft) => {
    let page = draft.pages.find((item) => item.id === pageId) || draft.pages[0];
    if (!page) {
      page = { id: uid(), name: 'Inbox', boards: [] };
      draft.pages.push(page);
    }
    if (!Array.isArray(page.boards)) page.boards = [];
    let board = selectedBoard === '__create__' ? null : page.boards.find((item) => item.id === selectedBoard);
    if (!board && createBoardName) {
      board = { id: uid(), name: createBoardName, color: '#34d399', links: [] };
      page.boards.push(board);
    }
    if (!board) board = page.boards[0];
    if (!board) {
      board = { id: uid(), name: 'Saved links', color: '#34d399', links: [] };
      page.boards.push(board);
    }
    if (!Array.isArray(board.links)) board.links = [];
    board.links.unshift({
      id: uid(),
      title: (record.title || record.url).trim(),
      url: record.url,
      description: record.description.trim(),
      tags: record.tags,
      createdAt: new Date().toISOString()
    });
  });
  await refreshState();
}

async function getCurrentTab() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tab = activeTab || null;
  $('#tab-title').textContent = tab?.title || 'Current page';
  $('#tab-url').textContent = tab?.url || '';
  const favicon = $('#tab-favicon');
  const normalizedUrl = cleanUrl(tab?.url || '');
  if (normalizedUrl) {
    favicon.src = chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(normalizedUrl)}&size=32`);
    favicon.hidden = false;
    favicon.onerror = () => { favicon.hidden = true; };
  } else {
    favicon.removeAttribute('src');
    favicon.hidden = true;
  }
  $('#save-button').disabled = !cleanUrl(tab?.url || '');
  if (!tab?.url || !cleanUrl(tab.url)) {
    setMessage('This page type cannot be saved.');
  }
}

$('#save-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const url = cleanUrl(tab?.url || '');
  if (!url) return setMessage('This page type cannot be saved.');
  const button = $('#save-button');
  button.disabled = true;
  setMessage('');
  try {
    await saveRecord({
      title: tab.title || url,
      url,
      description: $('#description').value,
      tags: tagList($('#tags').value)
    });
    $('#description').value = '';
    $('#tags').value = '';
    newBoardName.value = '';
    setMessage('Saved to your library.', true);
  } catch (error) {
    setMessage(error.message || 'Could not save this page.');
  } finally {
    button.disabled = !cleanUrl(tab?.url || '');
  }
});

$('#new-board-toggle').addEventListener('click', () => {
  boardSelect.value = '__create__';
  newBoardName.hidden = false;
  newBoardName.focus();
});

boardSelect.addEventListener('change', () => {
  newBoardName.hidden = boardSelect.value !== '__create__';
  if (!newBoardName.hidden) newBoardName.focus();
});

pageSelect.addEventListener('change', () => drawBoards());

$('#open-dashboard-button').addEventListener('click', async () => {
  try {
    await chrome.tabs.create({ url: chrome.runtime.getURL('newtab.html') });
    window.close();
  } catch (error) {
    setMessage(error.message || 'Could not open the workspace.');
  }
});

$('#save-tabs-button').addEventListener('click', async () => {
  const button = $('#save-tabs-button');
  button.disabled = true;
  try {
    const creatingBoard = boardSelect.value === '__create__';
    const createBoardName = creatingBoard ? newBoardName.value.trim() : '';
    if (creatingBoard && !createBoardName) {
      setMessage('Enter a name for the new board.');
      return;
    }
    // This prompt is tied directly to the user's button click. The broader tabs
    // permission is optional and is only requested for the Save all action.
    const granted = await chrome.permissions.request({ permissions: ['tabs'] });
    if (!granted) {
      setMessage('Allow tab access to save all open tabs.');
      return;
    }
    const tabs = await chrome.tabs.query({});
    const links = tabs.filter((item) => cleanUrl(item.url || '')).map((item) => ({
      title: item.title || item.url,
      url: cleanUrl(item.url),
      description: '',
      tags: []
    }));
    if (!links.length) {
      setMessage('No HTTP or HTTPS tabs are open.');
      return;
    }
    const response = await chrome.runtime.sendMessage({
      type: 'save-links',
      links,
      destination: { pageId: pageSelect.value, boardId: creatingBoard ? undefined : boardSelect.value, createBoardName }
    });
    if (!response?.ok) throw new Error(response?.error || 'Could not save the open tabs.');
    setMessage(`Saved ${response.count} tabs to your library.`, true);
    await refreshState();
  } catch (error) {
    setMessage(error.message || 'Could not save the open tabs.');
  } finally {
    button.disabled = false;
  }
});

Promise.all([refreshState(), getCurrentTab()]).catch((error) => {
  setMessage(error.message || 'Lumen could not load. Try reopening the popup.');
});
