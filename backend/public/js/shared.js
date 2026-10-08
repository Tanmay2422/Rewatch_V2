const api = {
  async _handle(res) {
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Request failed');
    }
    return res.json();
  },
  async signup(data) {
    return this._handle(await fetch('/api/auth/signup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'include', body: JSON.stringify(data)
    }));
  },
  async login(data) {
    return this._handle(await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'include', body: JSON.stringify(data)
    }));
  },
  async logout() {
    return this._handle(await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }));
  },
  async me() {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (!res.ok) return null;
    const body = await res.json();
    return body.user;
  },
  async getEntries(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this._handle(await fetch(`/api/entries${qs ? '?' + qs : ''}`, { credentials: 'include' }));
  },
  async createEntry(data) {
    return this._handle(await fetch('/api/entries', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'include', body: JSON.stringify(data)
    }));
  },
  async updateEntry(id, data) {
    return this._handle(await fetch(`/api/entries/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      credentials: 'include', body: JSON.stringify(data)
    }));
  },
  async deleteEntry(id) {
    return this._handle(await fetch(`/api/entries/${id}`, { method: 'DELETE', credentials: 'include' }));
  },
  async getStats() {
    return this._handle(await fetch('/api/stats', { credentials: 'include' }));
  },
  async getSuggestion() {
    return this._handle(await fetch('/api/suggestion', { credentials: 'include' }));
  }
};

function showToast(message) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), 2600);
}

const STATUS_LABEL = { want: 'WANT', in_progress: 'WATCHING', finished: 'DONE' };
const TYPE_LABEL = { movie: 'Movie', show: 'TV Show', anime: 'Anime', book: 'Book' };

function starString(rating) {
  if (!rating) return '';
  return '\u2605'.repeat(rating) + '\u2606'.repeat(5 - rating);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

// Renders the poster area's inner HTML for any entry - handles a real
// image, a generated placeholder, or (defensively) nothing at all the
// same way, so callers never need their own branching for this.
function posterArtHtml(entry) {
  const p = entry.poster;
  if (p && p.kind === 'image') {
    return `<div class="poster-art" style="background-image:url('${escapeHtml(p.url)}')"></div>`;
  }
  const from = p?.from || '#333';
  const to = p?.to || '#111';
  const initials = escapeHtml(p?.initials || entry.title?.slice(0, 2).toUpperCase() || '?');
  return `<div class="poster-art placeholder" style="--grad: linear-gradient(135deg, ${from}, ${to})">
    <span class="poster-initials">${initials}</span>
  </div>`;
}

// Every protected page calls this first. Redirects to login if there's
// no valid session, otherwise fills in the header's user info and wires
// up the logout button. Returns the user object so pages can use it.
async function requireAuthPage() {
  const user = await api.me();
  if (!user) {
    window.location.href = 'login.html';
    return null;
  }
  const nameEl = document.getElementById('userName');
  const avatarEl = document.getElementById('userAvatar');
  if (nameEl) nameEl.textContent = user.username;
  if (avatarEl) avatarEl.textContent = user.username.slice(0, 2).toUpperCase();

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await api.logout();
      window.location.href = 'login.html';
    });
  }
  return user;
}
