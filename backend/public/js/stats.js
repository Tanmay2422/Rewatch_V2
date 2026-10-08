async function init() {
  const user = await requireAuthPage();
  if (!user) return;
  loadStats();
  loadSuggestions();
}

async function loadStats() {
  try {
    const stats = await api.getStats();
    renderStatCards(stats);
    renderGenreBars(stats.topGenres);
    renderStatusBars(stats.byStatus);
  } catch (err) {
    showToast(err.message);
  }
}

function renderStatCards(stats) {
  const grid = document.getElementById('statGrid');
  const cards = [
    { number: stats.total, label: 'Total titles' },
    { number: stats.byStatus.finished, label: 'Finished' },
    { number: stats.finishedThisMonth, label: 'This month' },
    { number: stats.averageRating ?? '—', label: 'Avg rating' },
    { number: stats.currentStreak, label: 'Day streak' }
  ];
  grid.innerHTML = cards.map((c) => `
    <div class="stat-card">
      <div class="stat-number">${c.number}</div>
      <div class="stat-label">${c.label}</div>
    </div>
  `).join('');
}

function renderGenreBars(topGenres) {
  const container = document.getElementById('genreBars');
  if (!topGenres.length) {
    container.innerHTML = '<p style="color:var(--text-faint); font-size:0.85rem;">Add genres to your titles to see a breakdown here.</p>';
    return;
  }
  const max = Math.max(...topGenres.map((g) => g.count));
  container.innerHTML = topGenres.map((g) => `
    <div class="genre-bar-row">
      <div class="genre-bar-label">${escapeHtml(g.genre)}</div>
      <div class="genre-bar-track"><div class="genre-bar-fill" style="width:${(g.count / max) * 100}%"></div></div>
      <div class="genre-bar-count">${g.count}</div>
    </div>
  `).join('');
}

function renderStatusBars(byStatus) {
  const container = document.getElementById('statusBars');
  const rows = [
    { label: 'Want', value: byStatus.want },
    { label: 'Watching', value: byStatus.in_progress },
    { label: 'Finished', value: byStatus.finished }
  ];
  const max = Math.max(1, ...rows.map((r) => r.value));
  container.innerHTML = rows.map((r) => `
    <div class="genre-bar-row">
      <div class="genre-bar-label">${r.label}</div>
      <div class="genre-bar-track"><div class="genre-bar-fill" style="width:${(r.value / max) * 100}%"></div></div>
      <div class="genre-bar-count">${r.value}</div>
    </div>
  `).join('');
}

async function loadSuggestions() {
  const grid = document.getElementById('suggestionGrid');
  try {
    const { suggestions, reasonIfEmpty } = await api.getSuggestion();
    if (!suggestions.length) {
      grid.innerHTML = `<p style="color:var(--text-faint); grid-column:1/-1;">${escapeHtml(reasonIfEmpty)}</p>`;
      return;
    }
    grid.innerHTML = suggestions.map(({ entry, reason }) => `
      <div class="suggestion-card">
        ${posterArtHtml(entry)}
        <div class="suggestion-reason"><b>${escapeHtml(entry.title)}</b><br/>${escapeHtml(reason)}</div>
      </div>
    `).join('');
  } catch (err) {
    grid.innerHTML = `<p style="color:var(--text-faint);">Couldn't load suggestions right now.</p>`;
  }
}

init();
