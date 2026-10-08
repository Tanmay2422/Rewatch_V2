const state = { status: '', type: '', search: '' };
let cardGrid, emptyState, modalBackdrop, entryForm, modalTitle;

async function init() {
  const user = await requireAuthPage();
  if (!user) return; // redirected to login already

  cardGrid = document.getElementById('cardGrid');
  emptyState = document.getElementById('emptyState');
  modalBackdrop = document.getElementById('modalBackdrop');
  entryForm = document.getElementById('entryForm');
  modalTitle = document.getElementById('modalTitle');

  wireEvents();
  loadEntries();
}

async function loadEntries() {
  const params = {};
  if (state.status) params.status = state.status;
  if (state.type) params.type = state.type;
  if (state.search) params.search = state.search;

  try {
    const entries = await api.getEntries(params);
    renderEntries(entries);
  } catch (err) {
    showToast(err.message);
  }
}

function renderEntries(entries) {
  cardGrid.innerHTML = '';
  emptyState.style.display = entries.length === 0 ? 'block' : 'none';
  for (const entry of entries) cardGrid.appendChild(buildCard(entry));
}

function buildCard(entry) {
  const card = document.createElement('div');
  card.className = 'poster-card';

  const genreTags = entry.genres.map((g) => `<span class="tag">${escapeHtml(g)}</span>`).join('');
  const ratingHtml = entry.rating ? `<div class="poster-rating">${starString(entry.rating)}</div>` : '';
  const progressHtml = entry.progress ? `<div class="poster-progress">${escapeHtml(entry.progress)}</div>` : '';
  const notesHtml = entry.notes ? `<div class="poster-notes">${escapeHtml(entry.notes)}</div>` : '';

  let actions = '';
  if (entry.status === 'want') actions += `<button class="ghost" data-action="start" data-id="${entry.id}">Start</button>`;
  if (entry.status === 'in_progress') actions += `<button class="ghost" data-action="finish" data-id="${entry.id}">Finish</button>`;
  actions += `<button class="ghost" data-action="edit" data-id="${entry.id}">Edit</button>`;
  actions += `<button class="danger-ghost" data-action="delete" data-id="${entry.id}">Remove</button>`;

  card.innerHTML = `
    <div style="position:relative">
      ${posterArtHtml(entry)}
      <span class="poster-status ${entry.status}">${STATUS_LABEL[entry.status]}</span>
      ${ratingHtml}
    </div>
    <div class="poster-body">
      <div class="poster-title">${escapeHtml(entry.title)}</div>
      <div class="poster-meta">${TYPE_LABEL[entry.type]}</div>
      ${entry.genres.length ? `<div class="poster-genres">${genreTags}</div>` : ''}
      ${progressHtml}
      ${notesHtml}
      <div class="poster-actions">${actions}</div>
    </div>
  `;
  return card;
}

function wireEvents() {
  document.getElementById('statusChips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('#statusChips .chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    state.status = chip.dataset.status || '';
    loadEntries();
  });

  document.getElementById('typeChips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('#typeChips .chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    state.type = chip.dataset.type || '';
    loadEntries();
  });

  let searchDebounce;
  document.getElementById('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => { state.search = e.target.value.trim(); loadEntries(); }, 300);
  });

  document.getElementById('openAddBtn').addEventListener('click', () => openModal());
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  modalBackdrop.addEventListener('click', (e) => { if (e.target === modalBackdrop) closeModal(); });

  entryForm.addEventListener('submit', onFormSubmit);
  cardGrid.addEventListener('click', onCardClick);
}

function openModal(entry = null) {
  entryForm.reset();
  document.getElementById('entryId').value = entry ? entry.id : '';
  modalTitle.textContent = entry ? 'Edit title' : 'Add a title';

  if (entry) {
    document.getElementById('fTitle').value = entry.title;
    document.getElementById('fType').value = entry.type;
    document.getElementById('fStatus').value = entry.status;
    document.getElementById('fProgress').value = entry.progress || '';
    document.getElementById('fRating').value = entry.rating || '';
    document.getElementById('fGenres').value = entry.genres.join(', ');
    document.getElementById('fNotes').value = entry.notes || '';
  }
  modalBackdrop.classList.add('open');
  document.getElementById('fTitle').focus();
}

function closeModal() { modalBackdrop.classList.remove('open'); }

async function onFormSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('entryId').value;
  const saveBtn = document.getElementById('saveBtn');

  const payload = {
    title: document.getElementById('fTitle').value.trim(),
    type: document.getElementById('fType').value,
    status: document.getElementById('fStatus').value,
    progress: document.getElementById('fProgress').value.trim(),
    rating: document.getElementById('fRating').value ? Number(document.getElementById('fRating').value) : null,
    genres: document.getElementById('fGenres').value.split(',').map((g) => g.trim()).filter(Boolean),
    notes: document.getElementById('fNotes').value.trim()
  };

  saveBtn.disabled = true;
  saveBtn.textContent = id ? 'Saving...' : 'Adding...';
  try {
    if (id) {
      await api.updateEntry(id, payload);
      showToast('Updated.');
    } else {
      // Creating triggers a poster lookup server-side, so this can take
      // a beat longer than other actions - the button label reflects that.
      await api.createEntry(payload);
      showToast('Added to your catalog.');
    }
    closeModal();
    loadEntries();
  } catch (err) {
    showToast(err.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save';
  }
}

async function onCardClick(e) {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const { action, id } = btn.dataset;

  if (action === 'start') {
    try { await api.updateEntry(id, { status: 'in_progress' }); showToast('Marked as watching.'); loadEntries(); }
    catch (err) { showToast(err.message); }
  }

  if (action === 'finish' || action === 'edit') {
    const entries = await api.getEntries();
    const entry = entries.find((x) => String(x.id) === String(id));
    if (entry) {
      if (action === 'finish') entry.status = 'finished';
      openModal(entry);
    }
  }

  if (action === 'delete') {
    if (!confirm('Remove this title from your catalog?')) return;
    try { await api.deleteEntry(id); showToast('Removed.'); loadEntries(); }
    catch (err) { showToast(err.message); }
  }
}

init();
