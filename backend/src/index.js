const path = require('path');
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const db = require('./db');
const { signup, login, requireAuth } = require('./auth');
const { resolvePoster } = require('./posters');

const client = require('prom-client');

const app = express();
const PORT = process.env.PORT || 5000;

// ---------- Prometheus metrics (FA2: monitoring) ----------
client.collectDefaultMetrics();
const httpRequests = new client.Counter({
  name: 'rewatch_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status']
});
const httpDuration = new client.Histogram({
  name: 'rewatch_http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['method', 'route'],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2]
});
app.use((req, res, next) => {
  const end = httpDuration.startTimer();
  res.on('finish', () => {
    const route = req.route ? req.baseUrl + req.route.path : req.baseUrl || 'static';
    httpRequests.inc({ method: req.method, route, status: res.statusCode });
    end({ method: req.method, route });
  });
  next();
});
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

app.use(cors({ credentials: true, origin: true }));
app.use(express.json());

// Session cookie identifies who's logged in on every request. Using the
// default in-memory session store here - fine for one server instance
// (which is what this project deploys), but worth knowing that a
// multi-instance production setup would need a shared store like Redis
// instead, since MemoryStore doesn't sync across processes.
app.use(session({
  secret: process.env.SESSION_SECRET || 'rewatch-dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    httpOnly: true
  }
}));

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ========================================================================
// AUTH ROUTES
// ========================================================================

app.post('/api/auth/signup', (req, res) => {
  const result = signup(req.body);
  if (result.error) return res.status(400).json({ error: result.error });

  req.session.userId = result.user.id;
  res.status(201).json({ user: result.user });
});

app.post('/api/auth/login', (req, res) => {
  const result = login(req.body);
  if (result.error) return res.status(401).json({ error: result.error });

  req.session.userId = result.user.id;
  res.json({ user: result.user });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ loggedOut: true });
  });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Not logged in.' });
  }
  const user = db.prepare(`SELECT id, username, email FROM users WHERE id = ?`).get(req.session.userId);
  if (!user) return res.status(401).json({ error: 'Not logged in.' });
  res.json({ user });
});

// ========================================================================
// Everything below this line requires a logged-in session, and every
// query is scoped to req.session.userId - this is what makes one
// person's catalog invisible and untouchable to everyone else.
// ========================================================================
app.use('/api/entries', requireAuth);
app.use('/api/stats', requireAuth);
app.use('/api/suggestion', requireAuth);

function rowToEntry(row) {
  let poster = null;
  if (row.poster_url) {
    try { poster = JSON.parse(row.poster_url); } catch { poster = null; }
  }
  const { poster_url, ...rest } = row;
  return {
    ...rest,
    genres: row.genres ? row.genres.split(',').filter(Boolean) : [],
    poster
  };
}

const ALLOWED_TYPES = ['movie', 'show', 'anime', 'book'];
const ALLOWED_STATUS = ['want', 'in_progress', 'finished'];
const ALLOWED_SORT = { date_added: 'date_added', rating: 'rating', title: 'title' };

// ---------- GET /api/entries ----------
app.get('/api/entries', (req, res) => {
  const { status, type, genre, search, sort, order } = req.query;
  const userId = req.session.userId;

  let query = 'SELECT * FROM entries WHERE user_id = @userId';
  const params = { userId };

  if (status) { query += ' AND status = @status'; params.status = status; }
  if (type) { query += ' AND type = @type'; params.type = type; }
  if (genre) { query += ' AND (\',\' || genres || \',\') LIKE @genre'; params.genre = `%,${genre},%`; }
  if (search) { query += ' AND title LIKE @search'; params.search = `%${search}%`; }

  const sortCol = ALLOWED_SORT[sort] || 'date_added';
  const sortOrder = order === 'asc' ? 'ASC' : 'DESC';
  query += ` ORDER BY ${sortCol} ${sortOrder}`;

  const rows = db.prepare(query).all(params);
  res.json(rows.map(rowToEntry));
});

app.get('/api/entries/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM entries WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.session.userId);
  if (!row) return res.status(404).json({ error: 'Entry not found' });
  res.json(rowToEntry(row));
});

// ---------- POST /api/entries ----------
app.post('/api/entries', async (req, res) => {
  const { title, type, status, progress, rating, notes, genres } = req.body;

  if (!title || !title.trim()) return res.status(400).json({ error: 'title is required' });
  if (!type || !ALLOWED_TYPES.includes(type)) {
    return res.status(400).json({ error: `type must be one of: ${ALLOWED_TYPES.join(', ')}` });
  }

  const finalStatus = status && ALLOWED_STATUS.includes(status) ? status : 'want';
  const genresStr = Array.isArray(genres) ? genres.join(',') : (genres || '');
  const dateFinished = finalStatus === 'finished' ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null;

  // Fetching a poster can take a moment (external API call), but it's
  // fast enough to just await before responding - keeps the frontend
  // logic simple (one request, entry comes back poster-ready).
  const poster = await resolvePoster(title.trim(), type);

  const result = db.prepare(`
    INSERT INTO entries (user_id, title, type, status, progress, rating, notes, genres, poster_url, date_finished)
    VALUES (@user_id, @title, @type, @status, @progress, @rating, @notes, @genres, @poster_url, @date_finished)
  `).run({
    user_id: req.session.userId,
    title: title.trim(),
    type,
    status: finalStatus,
    progress: progress || '',
    rating: rating || null,
    notes: notes || '',
    genres: genresStr,
    poster_url: JSON.stringify(poster),
    date_finished: dateFinished
  });

  const created = db.prepare('SELECT * FROM entries WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(rowToEntry(created));
});

// ---------- PATCH /api/entries/:id ----------
app.patch('/api/entries/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM entries WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.session.userId);
  if (!existing) return res.status(404).json({ error: 'Entry not found' });

  const { title, type, status, progress, rating, notes, genres } = req.body;

  if (type && !ALLOWED_TYPES.includes(type)) {
    return res.status(400).json({ error: `type must be one of: ${ALLOWED_TYPES.join(', ')}` });
  }
  if (status && !ALLOWED_STATUS.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${ALLOWED_STATUS.join(', ')}` });
  }

  const genresStr = genres === undefined ? existing.genres : (Array.isArray(genres) ? genres.join(',') : genres);

  let dateFinished = existing.date_finished;
  if (status === 'finished' && !existing.date_finished) {
    dateFinished = new Date().toISOString().slice(0, 19).replace('T', ' ');
  }
  if (status && status !== 'finished') dateFinished = null;

  db.prepare(`
    UPDATE entries SET
      title = @title, type = @type, status = @status, progress = @progress,
      rating = @rating, notes = @notes, genres = @genres, date_finished = @date_finished
    WHERE id = @id AND user_id = @userId
  `).run({
    id: req.params.id,
    userId: req.session.userId,
    title: title !== undefined ? title : existing.title,
    type: type !== undefined ? type : existing.type,
    status: status !== undefined ? status : existing.status,
    progress: progress !== undefined ? progress : existing.progress,
    rating: rating !== undefined ? rating : existing.rating,
    notes: notes !== undefined ? notes : existing.notes,
    genres: genresStr,
    date_finished: dateFinished
  });

  const updated = db.prepare('SELECT * FROM entries WHERE id = ?').get(req.params.id);
  res.json(rowToEntry(updated));
});

app.delete('/api/entries/:id', (req, res) => {
  const result = db.prepare('DELETE FROM entries WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.session.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Entry not found' });
  res.json({ deleted: true });
});

// ---------- GET /api/stats ----------
app.get('/api/stats', (req, res) => {
  const all = db.prepare('SELECT * FROM entries WHERE user_id = ?').all(req.session.userId);

  const byStatus = { want: 0, in_progress: 0, finished: 0 };
  const byType = { movie: 0, show: 0, anime: 0, book: 0 };
  const genreCounts = {};
  let ratingSum = 0;
  let ratingCount = 0;

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  let finishedThisMonth = 0;
  const finishedDates = new Set();

  for (const row of all) {
    byStatus[row.status] = (byStatus[row.status] || 0) + 1;
    byType[row.type] = (byType[row.type] || 0) + 1;

    if (row.genres) {
      for (const g of row.genres.split(',').filter(Boolean)) {
        genreCounts[g] = (genreCounts[g] || 0) + 1;
      }
    }
    if (row.rating) { ratingSum += row.rating; ratingCount += 1; }

    if (row.date_finished) {
      const d = new Date(row.date_finished);
      if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) finishedThisMonth += 1;
      finishedDates.add(row.date_finished.slice(0, 10));
    }
  }

  let streak = 0;
  const todayStr = now.toISOString().slice(0, 10);
  const cursor = new Date(now);
  const sortedDates = [...finishedDates].sort().reverse();
  if (sortedDates.length > 0) {
    const mostRecent = new Date(sortedDates[0]);
    const diffDays = Math.round((new Date(todayStr) - mostRecent) / 86400000);
    if (diffDays <= 1) {
      while (finishedDates.has(cursor.toISOString().slice(0, 10))) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
      }
    }
  }

  const topGenres = Object.entries(genreCounts)
    .sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([genre, count]) => ({ genre, count }));

  res.json({
    total: all.length,
    byStatus,
    byType,
    topGenres,
    averageRating: ratingCount ? Math.round((ratingSum / ratingCount) * 10) / 10 : null,
    finishedThisMonth,
    currentStreak: streak
  });
});

// ---------- GET /api/suggestion (v2 - weighted, multiple results) ----------
// Rule-based and fully explainable (deliberately not a black-box model):
//
// 1. For every finished+rated title, score each of its genres by
//    rating x recency-weight. Recent 5-star finishes count more than an
//    old one - "what you've been enjoying LATELY" rather than all-time.
// 2. Rank genres by total score.
// 3. For each top genre (best first), pick the want-list title that best
//    matches it and hasn't already been suggested.
// 4. Attach the specific finished title that earned that genre its score,
//    so the reason is concrete ("because you loved X") not just a label.
// 5. If nothing scores (no ratings yet), fall back to the oldest want
//    entries so the section is never empty.
app.get('/api/suggestion', (req, res) => {
  const userId = req.session.userId;

  const finished = db.prepare(`
    SELECT * FROM entries WHERE user_id = ? AND status = 'finished' AND rating IS NOT NULL
  `).all(userId);

  const wantList = db.prepare(`
    SELECT * FROM entries WHERE user_id = ? AND status = 'want' ORDER BY date_added ASC
  `).all(userId);

  if (wantList.length === 0) {
    return res.json({ suggestions: [], reasonIfEmpty: 'Your want-to list is empty - add something first.' });
  }

  const now = new Date();
  const genreScore = {};       // genre -> total score
  const genreBestTitle = {};   // genre -> { title, rating, score } of its top contributor

  for (const row of finished) {
    if (!row.genres || !row.date_finished) continue;
    const daysAgo = Math.max(0, (now - new Date(row.date_finished)) / 86400000);
    const recencyWeight = 1 / (1 + daysAgo / 30); // ~halves every ~30 days
    const contribution = row.rating * recencyWeight;

    for (const g of row.genres.split(',').filter(Boolean)) {
      genreScore[g] = (genreScore[g] || 0) + contribution;
      if (!genreBestTitle[g] || contribution > genreBestTitle[g].score) {
        genreBestTitle[g] = { title: row.title, rating: row.rating, score: contribution };
      }
    }
  }

  const rankedGenres = Object.entries(genreScore).sort((a, b) => b[1] - a[1]).map(([g]) => g);

  const suggestions = [];
  const usedEntryIds = new Set();

  for (const genre of rankedGenres) {
    if (suggestions.length >= 4) break;
    const match = wantList.find((e) =>
      !usedEntryIds.has(e.id) && (e.genres || '').split(',').includes(genre)
    );
    if (match) {
      usedEntryIds.add(match.id);
      suggestions.push({
        entry: rowToEntry(match),
        reason: `Because you loved "${genreBestTitle[genre].title}" (${genreBestTitle[genre].rating}\u2605, ${genre})`
      });
    }
  }

  // Fallback fill: if fewer than 2 genre-based matches were found (e.g.
  // a new account with little rated history), pad with the
  // longest-waiting want-list items so the section still feels useful.
  if (suggestions.length < 2) {
    for (const entry of wantList) {
      if (suggestions.length >= 4) break;
      if (usedEntryIds.has(entry.id)) continue;
      usedEntryIds.add(entry.id);
      suggestions.push({
        entry: rowToEntry(entry),
        reason: 'This has been on your want-to list the longest.'
      });
    }
  }

  res.json({ suggestions, reasonIfEmpty: null });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`ReWatch API listening on port ${PORT}`);
  });
}

module.exports = app;
