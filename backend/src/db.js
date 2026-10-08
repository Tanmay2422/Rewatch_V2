const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

// The database is still a single file on disk - no separate DB server,
// no connection strings. What's new: it now stores MULTIPLE users' data
// in the same file, kept apart by a user_id column on every entry.
const dbPath = path.join(__dirname, '..', 'data', 'rewatch.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS entries (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title         TEXT NOT NULL,
    type          TEXT NOT NULL CHECK (type IN ('movie', 'show', 'anime', 'book')),
    status        TEXT NOT NULL CHECK (status IN ('want', 'in_progress', 'finished')) DEFAULT 'want',
    progress      TEXT DEFAULT '',
    rating        INTEGER CHECK (rating BETWEEN 1 AND 5),
    notes         TEXT DEFAULT '',
    genres        TEXT DEFAULT '',
    poster_url    TEXT,
    date_added    TEXT NOT NULL DEFAULT (datetime('now')),
    date_finished TEXT
  );
`);

// ---------- Migration for installs that predate accounts ----------
// If this app was already deployed before login existed, "entries" may
// already exist WITHOUT a user_id/poster_url column. SQLite can't add a
// NOT NULL column with no default to a table that already has rows, so
// this checks column-by-column and patches the table in place instead
// of assuming a fresh install.
const entryColumns = db.prepare(`PRAGMA table_info(entries)`).all().map((c) => c.name);

if (!entryColumns.includes('poster_url')) {
  db.exec(`ALTER TABLE entries ADD COLUMN poster_url TEXT`);
}

if (!entryColumns.includes('user_id')) {
  // Old rows exist with no owner. Rather than silently deleting someone's
  // existing catalog, create a one-time "legacy" account and hand all
  // pre-existing entries to it, printing the login once so nothing is lost.
  db.exec(`ALTER TABLE entries ADD COLUMN user_id INTEGER REFERENCES users(id)`);

  const orphanCount = db.prepare(`SELECT COUNT(*) AS c FROM entries WHERE user_id IS NULL`).get().c;

  if (orphanCount > 0) {
    const legacyPassword = crypto.randomBytes(6).toString('hex');
    const passwordHash = bcrypt.hashSync(legacyPassword, 10);

    const legacyUser = db.prepare(`
      INSERT INTO users (username, email, password_hash)
      VALUES ('legacy', 'legacy@rewatch.local', @passwordHash)
    `).run({ passwordHash });

    db.prepare(`UPDATE entries SET user_id = @userId WHERE user_id IS NULL`)
      .run({ userId: legacyUser.lastInsertRowid });

    console.log('=========================================================');
    console.log(`Found ${orphanCount} existing entries from before user accounts.`);
    console.log('They have been moved to a recovery account so nothing was lost:');
    console.log('  username: legacy');
    console.log(`  password: ${legacyPassword}`);
    console.log('Log in with this once to see/reclaim that old data.');
    console.log('=========================================================');
  }
}

// ---------- Seed demo data (fresh installs only) ----------
// Only runs if there are truly zero users yet - i.e. a brand new install,
// not an upgrade (which would have created the 'legacy' user above).
const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;

if (userCount === 0) {
  const demoPasswordHash = bcrypt.hashSync('demo1234', 10);
  const demoUser = db.prepare(`
    INSERT INTO users (username, email, password_hash)
    VALUES ('demo', 'demo@rewatch.local', @passwordHash)
  `).run({ passwordHash: demoPasswordHash });

  const seed = db.prepare(`
    INSERT INTO entries (user_id, title, type, status, progress, rating, notes, genres, poster_url, date_added, date_finished)
    VALUES (@user_id, @title, @type, @status, @progress, @rating, @notes, @genres, @poster_url, @date_added, @date_finished)
  `);

  const now = new Date();
  const daysAgo = (n) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 19).replace('T', ' ');
  };

  const rows = [
    {
      title: 'Spirited Away', type: 'anime', status: 'finished', progress: '', rating: 5,
      notes: 'Rewatched for the third time, still incredible.', genres: 'Fantasy,Coming-of-age',
      poster_url: null, date_added: daysAgo(20), date_finished: daysAgo(18)
    },
    {
      title: 'Project Hail Mary', type: 'book', status: 'finished', progress: '', rating: 5,
      notes: 'Best sci-fi problem-solving book in years.', genres: 'Sci-Fi,Adventure',
      poster_url: null, date_added: daysAgo(15), date_finished: daysAgo(1)
    },
    {
      title: 'Attack on Titan', type: 'anime', status: 'in_progress', progress: 'Ep 60/87', rating: null,
      notes: '', genres: 'Action,Drama', poster_url: null, date_added: daysAgo(10), date_finished: null
    },
    {
      title: 'Dune: Part Two', type: 'movie', status: 'finished', progress: '', rating: 4,
      notes: 'Visually stunning, second half dragged slightly.', genres: 'Sci-Fi,Adventure',
      poster_url: null, date_added: daysAgo(9), date_finished: daysAgo(0)
    },
    {
      title: 'The Bear', type: 'show', status: 'want', progress: '', rating: null,
      notes: '', genres: 'Drama,Comedy', poster_url: null, date_added: daysAgo(3), date_finished: null
    },
    {
      title: 'Piranesi', type: 'book', status: 'want', progress: '', rating: null,
      notes: '', genres: 'Fantasy,Mystery', poster_url: null, date_added: daysAgo(2), date_finished: null
    }
  ];

  const insertMany = db.transaction((items) => {
    for (const item of items) seed.run({ ...item, user_id: demoUser.lastInsertRowid });
  });
  insertMany(rows);

  console.log('=========================================================');
  console.log('Fresh install - a demo account was created so the app is');
  console.log('never empty on first look:');
  console.log('  username: demo');
  console.log('  password: demo1234');
  console.log('=========================================================');
}

module.exports = db;
