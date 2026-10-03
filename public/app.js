// Minimalist ShopList Client JS

const API = {
  getLists: () => fetch('/api/lists').then(r => r.json()),
  createList: (data) => fetch('/api/lists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),

  getItems: (listId, query = {}) => {
    const params = new URLSearchParams(query);
    return fetch(`/api/lists/${listId}/items?${params}`).then(r => r.json());
  },
  addItem: (listId, data) => fetch(`/api/lists/${listId}/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
  updateItem: (id, data) => fetch(`/api/items/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
  deleteItem: (id) => fetch(`/api/items/${id}`, { method: 'DELETE' }).then(r => r.json()),
  clearCompleted: (listId) => fetch(`/api/lists/${listId}/clear-completed`, { method: 'POST' }).then(r => r.json()),
  resetList: (listId) => fetch(`/api/lists/${listId}/reset`, { method: 'POST' }).then(r => r.json()),
  importItems: (listId, items) => fetch(`/api/lists/${listId}/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) }).then(r => r.json()),
  exportAll: () => fetch('/api/export').then(r => r.json()),
  importAll: (data) => fetch('/api/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json())
};

const state = {
  lists: [],
  activeListId: null,
  items: [],
  searchQuery: '',
  theme: localStorage.getItem('shoplist_theme') || 'dark'
};

document.documentElement.setAttribute('data-theme', state.theme);

document.addEventListener('DOMContentLoaded', async () => {
  initEventListeners();
  setupSSE();
  await loadLists();
});

function setupSSE() {
  const evtSource = new EventSource('/api/events');
  evtSource.addEventListener('ITEM_ADDED', (e) => handleSSEUpdate(e));
  evtSource.addEventListener('ITEM_UPDATED', (e) => handleSSEUpdate(e));
  evtSource.addEventListener('ITEM_DELETED', (e) => handleSSEUpdate(e));
  evtSource.addEventListener('LIST_CLEARED', (e) => handleSSEUpdate(e));
  evtSource.addEventListener('LIST_RESET', (e) => handleSSEUpdate(e));
  evtSource.addEventListener('LIST_CREATED', () => loadLists());
}

function handleSSEUpdate(e) {
  const data = JSON.parse(e.data);
  if (data.listId === state.activeListId) {
    loadItems(state.activeListId, false);
    loadLists(false);
  }
}

async function loadLists(switchActive = true) {
  const res = await API.getLists();
  if (res.success) {
    state.lists = res.data;
    renderListSelector();

    if (switchActive && state.lists.length > 0) {
      const savedListId = parseInt(localStorage.getItem('shoplist_active_list'));
      const targetList = state.lists.find(l => l.id === savedListId) || state.lists[0];
      setActiveList(targetList.id);
    }
  }
}

async function loadItems(listId, showLoading = true) {
  if (!listId) return;

  const res = await API.getItems(listId, { search: state.searchQuery });
  if (res.success) {
    state.items = res.data;
    renderItems();
    updateProgress();
  }
}

function setActiveList(listId) {
  state.activeListId = listId;
  localStorage.setItem('shoplist_active_list', listId);

  const select = document.getElementById('activeListSelect');
  if (select) select.value = listId;

  loadItems(listId);
}

function renderListSelector() {
  const select = document.getElementById('activeListSelect');
  if (!select) return;

  select.innerHTML = state.lists.map(l => `
    <option value="${l.id}">${escapeHtml(l.name)} (${l.checked_items || 0}/${l.total_items || 0})</option>
  `).join('');

  if (state.activeListId) select.value = state.activeListId;
}

function renderItems() {
  const container = document.getElementById('itemsContainer');
  const emptyState = document.getElementById('emptyState');
  if (!container) return;

  if (state.items.length === 0) {
    container.innerHTML = '';
    if (emptyState) {
      container.appendChild(emptyState);
      emptyState.style.display = 'block';
    }
    return;
  }

  container.innerHTML = state.items.map(item => {
    const isChecked = item.is_checked === 1;
    const priceText = item.estimated_price > 0 ? `$${(item.estimated_price * item.quantity).toFixed(2)}` : '';
    const metaParts = [];
    if (item.quantity > 1 || item.unit) metaParts.push(`Qty: ${item.quantity} ${escapeHtml(item.unit || '')}`);
    if (priceText) metaParts.push(`Est: ${priceText}`);

    return `
      <div class="item-card ${isChecked ? 'checked' : ''}">
        <div class="item-left">
          <div class="custom-checkbox ${isChecked ? 'checked' : ''}" onclick="toggleCheck(${item.id}, ${!isChecked})">
            ${isChecked ? '✓' : ''}
          </div>
          <div>
            <div class="item-title" onclick="toggleCheck(${item.id}, ${!isChecked})">${escapeHtml(item.name)}</div>
            ${metaParts.length > 0 ? `<div class="item-meta">${metaParts.join(' • ')}</div>` : ''}
          </div>
        </div>
        <div class="item-actions">
          <button class="btn-edit" onclick="openEditModal(${item.id})" title="Edit">✎</button>
          <button class="btn-delete" onclick="deleteItem(${item.id})" title="Delete">✕</button>
        </div>
      </div>
    `;
  }).join('');
}

function updateProgress() {
  const total = state.items.length;
  const checked = state.items.filter(i => i.is_checked === 1).length;
  const percent = total > 0 ? Math.round((checked / total) * 100) : 0;

  const progressSummary = document.getElementById('progressSummary');
  const progressPercent = document.getElementById('progressPercent');
  const progressBarFill = document.getElementById('progressBarFill');

  if (progressSummary) progressSummary.textContent = `${checked} OF ${total} ITEMS CHECKED`;
  if (progressPercent) progressPercent.textContent = `${percent}%`;
  if (progressBarFill) progressBarFill.style.width = `${percent}%`;
}

async function toggleCheck(itemId, isChecked) {
  const item = state.items.find(i => i.id === itemId);
  if (item) item.is_checked = isChecked ? 1 : 0;
  renderItems();
  updateProgress();

  await API.updateItem(itemId, { is_checked: isChecked });
  loadLists(false);
}

async function deleteItem(itemId) {
  state.items = state.items.filter(i => i.id !== itemId);
  renderItems();
  updateProgress();

  await API.deleteItem(itemId);
  loadLists(false);
}

function openEditModal(itemId) {
  const item = state.items.find(i => i.id === itemId);
  if (!item) return;

  document.getElementById('editItemId').value = item.id;
  document.getElementById('editItemName').value = item.name;
  document.getElementById('editItemQty').value = item.quantity || 1;
  document.getElementById('editItemUnit').value = item.unit || '';
  document.getElementById('editItemPrice').value = item.estimated_price || '';

  openModal('editItemModal');
  document.getElementById('editItemName').focus();
}

function initEventListeners() {
  // Theme Toggle
  document.getElementById('btnThemeToggle')?.addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    localStorage.setItem('shoplist_theme', state.theme);
  });

  document.getElementById('activeListSelect')?.addEventListener('change', (e) => {
    setActiveList(parseInt(e.target.value));
  });

  // Toggle Advanced Add Options
  document.getElementById('btnToggleAdvanced')?.addEventListener('click', () => {
    const adv = document.getElementById('advancedOptions');
    if (!adv) return;
    const isHidden = adv.style.display === 'none';
    adv.style.display = isHidden ? 'flex' : 'none';
    document.getElementById('btnToggleAdvanced').textContent = isHidden ? '- Advanced' : '+ Advanced';
  });

  // Single & Advanced Add Form
  document.getElementById('addForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('itemNameInput');
    const name = input.value.trim();
    if (!name || !state.activeListId) return;

    const qty = parseInt(document.getElementById('itemQtyInput')?.value) || 1;
    const unit = document.getElementById('itemUnitInput')?.value?.trim() || '';
    const price = parseFloat(document.getElementById('itemPriceInput')?.value) || 0;

    input.value = '';
    if (document.getElementById('itemPriceInput')) document.getElementById('itemPriceInput').value = '';

    await API.addItem(state.activeListId, { name, quantity: qty, unit, estimated_price: price });
    loadItems(state.activeListId, false);
    loadLists(false);
  });

  // Search
  document.getElementById('searchInput')?.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.trim();
    loadItems(state.activeListId, false);
  });

  // Actions
  document.getElementById('btnClearCompleted')?.addEventListener('click', async () => {
    if (!state.activeListId) return;
    await API.clearCompleted(state.activeListId);
    loadItems(state.activeListId, false);
    loadLists(false);
  });

  document.getElementById('btnResetChecked')?.addEventListener('click', async () => {
    if (!state.activeListId) return;
    await API.resetList(state.activeListId);
    loadItems(state.activeListId, false);
    loadLists(false);
  });

  // Edit Item Modal
  document.getElementById('btnCloseEditModal')?.addEventListener('click', () => closeModal('editItemModal'));
  document.getElementById('btnCancelEditModal')?.addEventListener('click', () => closeModal('editItemModal'));
  document.getElementById('editItemModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'editItemModal') closeModal('editItemModal');
  });

  document.getElementById('editItemForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = parseInt(document.getElementById('editItemId').value);
    const name = document.getElementById('editItemName').value.trim();
    const quantity = parseInt(document.getElementById('editItemQty').value) || 1;
    const unit = document.getElementById('editItemUnit').value.trim();
    const estimated_price = parseFloat(document.getElementById('editItemPrice').value) || 0;

    if (!name) return;

    closeModal('editItemModal');
    await API.updateItem(id, { name, quantity, unit, estimated_price });
    loadItems(state.activeListId, false);
    loadLists(false);
  });

  // Modals
  document.getElementById('btnNewList')?.addEventListener('click', () => openModal('listModal'));
  document.getElementById('btnOpenMenu')?.addEventListener('click', () => openModal('menuModal'));

  document.getElementById('listForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('listNameInput').value.trim();
    if (!name) return;

    closeModal('listModal');
    const res = await API.createList({ name });
    if (res.success) {
      await loadLists(false);
      setActiveList(res.data.id);
    }
  });

  document.querySelectorAll('.modal-close, .modal-backdrop').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.classList.contains('modal-close')) {
        const backdrop = el.closest('.modal-backdrop');
        if (backdrop) backdrop.style.display = 'none';
      }
    });
  });

  const updateExportContent = async () => {
    const scope = document.querySelector('input[name="exportScope"]:checked')?.value || 'current';
    if (scope === 'all') {
      const res = await API.exportAll();
      if (res.success) {
        document.getElementById('exportPreview').value = JSON.stringify(res.data, null, 2);
      }
    } else {
      let text = `SHOPLIST\n---------------------\n`;
      state.items.forEach(i => {
        text += `${i.is_checked ? '[x]' : '[ ]'} ${i.name}${i.quantity > 1 ? ` (${i.quantity})` : ''}\n`;
      });
      document.getElementById('exportPreview').value = text;
    }
  };

  document.querySelectorAll('input[name="exportScope"]').forEach(r => {
    r.addEventListener('change', updateExportContent);
  });

  document.getElementById('btnExportList')?.addEventListener('click', () => {
    updateExportContent();

    // Reset to Export tab by default
    document.getElementById('tabExportBtn')?.classList.add('active');
    document.getElementById('tabImportBtn')?.classList.remove('active');
    document.getElementById('exportTabContent').style.display = 'block';
    document.getElementById('importTabContent').style.display = 'none';

    openModal('exportModal');
  });

  // Tab Switching
  const tabExportBtn = document.getElementById('tabExportBtn');
  const tabImportBtn = document.getElementById('tabImportBtn');
  const exportTabContent = document.getElementById('exportTabContent');
  const importTabContent = document.getElementById('importTabContent');

  tabExportBtn?.addEventListener('click', () => {
    tabExportBtn.classList.add('active');
    tabImportBtn.classList.remove('active');
    exportTabContent.style.display = 'block';
    importTabContent.style.display = 'none';
  });

  tabImportBtn?.addEventListener('click', () => {
    tabImportBtn.classList.add('active');
    tabExportBtn.classList.remove('active');
    importTabContent.style.display = 'block';
    exportTabContent.style.display = 'none';
  });

  document.getElementById('btnCopyFormatted')?.addEventListener('click', () => {
    const text = document.getElementById('exportPreview').value;
    navigator.clipboard.writeText(text);
    alert('List copied');
  });

  document.getElementById('btnDownloadJSON')?.addEventListener('click', async () => {
    const scope = document.querySelector('input[name="exportScope"]:checked')?.value || 'current';
    let dataToDownload;
    let filename;

    if (scope === 'all') {
      const res = await API.exportAll();
      dataToDownload = res.success ? res.data : { lists: [] };
      filename = `shoplist-full-backup.json`;
    } else {
      dataToDownload = state.items;
      filename = `shoplist-backup-${state.activeListId}.json`;
    }

    const json = JSON.stringify(dataToDownload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  });

  // Submit Import
  document.getElementById('btnSubmitImport')?.addEventListener('click', async () => {
    const rawInput = document.getElementById('importInput')?.value?.trim();
    if (!rawInput || !state.activeListId) return;

    // 1. Try parsing JSON
    try {
      const parsed = JSON.parse(rawInput);

      // Case A: Full multi-list backup ({ lists: [ ... ] })
      if (parsed && Array.isArray(parsed.lists)) {
        const res = await API.importAll(parsed);
        if (res.success) {
          alert(`Full backup restored! Created ${res.listsCreated} lists with ${res.itemsImported} items.`);
          document.getElementById('importInput').value = '';
          closeModal('exportModal');
          await loadLists(true);
          return;
        }
      }

      // Case B: Array of items for current list
      if (Array.isArray(parsed)) {
        const res = await API.importItems(state.activeListId, parsed);
        if (res.success) {
          alert(`Successfully imported ${res.count || res.itemsImported} items!`);
          document.getElementById('importInput').value = '';
          closeModal('exportModal');
          loadItems(state.activeListId, false);
          loadLists(false);
          return;
        }
      }
    } catch (e) {
      // 2. Parse plain text line by line into current list
      const lines = rawInput.split('\n');
      const itemsToImport = [];
      lines.forEach(line => {
        let clean = line.trim();
        if (!clean) return;

        let isChecked = false;
        if (clean.startsWith('[x]') || clean.startsWith('[X]') || clean.startsWith('✓')) {
          isChecked = true;
          clean = clean.replace(/^(\[x\]|\[X\]|✓)\s*/, '');
        } else if (clean.startsWith('[ ]') || clean.startsWith('- ')) {
          clean = clean.replace(/^(\[ \]|-\s*)\s*/, '');
        }

        if (clean) {
          itemsToImport.push({ name: clean, quantity: 1, is_checked: isChecked });
        }
      });

      if (itemsToImport.length > 0) {
        const res = await API.importItems(state.activeListId, itemsToImport);
        if (res.success) {
          alert(`Successfully imported ${res.count || res.itemsImported} items!`);
          document.getElementById('importInput').value = '';
          closeModal('exportModal');
          loadItems(state.activeListId, false);
          loadLists(false);
          return;
        }
      }
    }

    alert('Import failed. Please check the backup data format.');
  });
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'flex';
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
