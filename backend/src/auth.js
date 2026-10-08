const bcrypt = require('bcryptjs');
const db = require('./db');

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicUser(row) {
  return { id: row.id, username: row.username, email: row.email };
}

function signup({ username, email, password }) {
  if (!username || !USERNAME_RE.test(username)) {
    return { error: 'Username must be 3-20 characters: letters, numbers, underscores only.' };
  }
  if (!email || !EMAIL_RE.test(email)) {
    return { error: 'Please enter a valid email address.' };
  }
  if (!password || password.length < 6) {
    return { error: 'Password must be at least 6 characters.' };
  }

  const existing = db.prepare(`SELECT id FROM users WHERE username = ? OR email = ?`).get(username, email);
  if (existing) {
    return { error: 'That username or email is already taken.' };
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const result = db.prepare(`
    INSERT INTO users (username, email, password_hash) VALUES (@username, @email, @passwordHash)
  `).run({ username, email, passwordHash });

  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(result.lastInsertRowid);
  return { user: publicUser(user) };
}

function login({ usernameOrEmail, password }) {
  if (!usernameOrEmail || !password) {
    return { error: 'Username/email and password are required.' };
  }

  const user = db.prepare(`
    SELECT * FROM users WHERE username = @u OR email = @u
  `).get({ u: usernameOrEmail });

  if (!user) {
    return { error: 'Invalid credentials.' };
  }

  const match = bcrypt.compareSync(password, user.password_hash);
  if (!match) {
    return { error: 'Invalid credentials.' };
  }

  return { user: publicUser(user) };
}

// Blocks any route it's attached to unless the request has a logged-in
// session. Every /api/entries* route uses this, which is what makes the
// data actually private per-account instead of shared by everyone.
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Please log in first.' });
  }
  next();
}

module.exports = { signup, login, requireAuth, publicUser };
