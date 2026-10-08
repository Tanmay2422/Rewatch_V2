# ReWatch — a personal media tracker

Track movies, TV shows, anime, and books you want to watch/read, are currently
watching/reading, or have finished — with ratings, notes, genre tags, a stats
dashboard, and a simple rule-based "what to watch next" suggestion.

Built for a DevOps FA1 activity: the app itself is intentionally simple (one
backend, one database file, no external services) so the actual graded work —
Docker, Terraform, Ansible — stays the focus.

## Project structure

```
rewatch/
├── backend/
│   ├── src/
│   │   ├── index.js      # Express app + all API routes
│   │   └── db.js         # SQLite setup, schema, seed data
│   ├── public/            # Frontend (served as static files by Express)
│   │   ├── index.html      # Catalog / browse page
│   │   ├── stats.html      # Stats dashboard page
│   │   ├── css/style.css
│   │   └── js/
│   ├── data/               # SQLite database file lives here (git-ignored)
│   └── package.json
├── terraform/              # Phase 5 - AWS infrastructure as code
├── ansible/                # Phase 6 - server configuration + deploy
└── README.md
```

## Running it locally (no Docker yet)

```bash
cd backend
npm install
npm start
```

Then open **http://localhost:5000** in a browser. You should see a few
sample entries already in the catalog (seeded automatically on first run).

Try:
- Add a title with the **+ Add title** button
- Click **Start** on a "want" item to move it to "in progress"
- Click **Mark finished** to rate it
- Visit the **Desk & Stats** tab to see the dashboard update

## API reference

| Method | Route | What it does |
|---|---|---|
| GET | `/health` | Simple alive check |
| GET | `/api/entries` | List entries (supports `?status=`, `?type=`, `?genre=`, `?search=`, `?sort=`, `?order=`) |
| GET | `/api/entries/:id` | Get one entry |
| POST | `/api/entries` | Create an entry |
| PATCH | `/api/entries/:id` | Update an entry |
| DELETE | `/api/entries/:id` | Delete an entry |
| GET | `/api/stats` | Dashboard numbers (counts, genre breakdown, streak, etc.) |
| GET | `/api/suggestion` | "What to watch next" pick |

## Status

- ✅ Phase 0 — Project structure decided
- ✅ Phase 1 — Backend + frontend built and verified working locally
- ⬜ Phase 2 — Dockerize
- ⬜ Phase 3 — Push to GitHub
- ⬜ Phase 4 — AWS account + access setup
- ⬜ Phase 5 — Terraform (create the EC2 server)
- ⬜ Phase 6 — Ansible (configure server + deploy)
- ⬜ Phase 7 — Verify live on AWS
- ⬜ Phase 8 — Prepare faculty demo materials
