# ◆ Nexus

### Intelligent Commerce Platform

**Nexus** is an AI-driven commerce operations platform that coordinates a fleet of specialized agents — research, pricing, inventory, marketing, support, and more — under a single Manager Agent, and surfaces everything through a real-time, analytics-rich dashboard. It combines a Node.js/Express API, a local-first AI layer powered by Ollama, and a polished React frontend finished in a signature gold (`#D4AF37`), black, and white design language.

## Key Features

- 🤖 **Agent Management** — 12 agents (1 Manager + 11 Workers) with show/hide controls, pause/resume, and a per-agent settings modal
- 📊 **Real-Time Analytics** — bar, line, and pie charts covering performance trends, task distribution, and agent status
- 🖥️ **Live Dashboard** — auto-refreshing stats, activity feed, system alerts, and CSV export
- 🌓 **Dark / Light Mode** — theme preference persisted across sessions
- 🔐 **Professional Login** — animated, gold-branded authentication screen
- ✨ **Polished Loading UX** — shimmer skeleton loaders and designed empty states, no blank screens
- 📱 **Responsive Design** — adapts cleanly from desktop down to mobile

---

## Tech Stack

| Layer        | Technology                                   |
|--------------|-----------------------------------------------|
| **Frontend** | React 19, Recharts, custom CSS3 design system |
| **Backend**  | Node.js, Express, SQLite (`better-sqlite3`)   |
| **AI**       | Ollama (local LLM inference)                  |
| **Database** | SQLite                                        |

> **Note:** the frontend uses a hand-built CSS design system (`Dashboard.css` / `Login.css`) rather than a utility framework, to keep the gold/black/white theme fully custom.

---

## Features in Detail

### Agent Management
Twelve agents — a coordinating Manager Agent plus eleven workers (Research, Pricing, Inventory, Marketing, Social, Payment, Supplier, Analytics, Support, Email, Shipping) — are shown in a searchable grid. Visibility per agent is toggled from the sidebar, each card supports pause/resume, and a settings modal exposes per-agent configuration.

### Real-Time Analytics
The Analytics page renders five charts (weekly performance, agent performance trends, task distribution, agent status distribution, and agent-type breakdown) plus four premium summary cards with circular progress rings, trend indicators, and gradient theming.

### Live Dashboard
Stat cards track total/active agents and total/completed tasks, refreshing automatically on an interval or on demand. A connection indicator reports backend health, and agent data can be exported to CSV.

### Dark / Light Mode
A single toggle switches the entire app between a near-black dark theme and a bright white light theme, with the preference saved to `localStorage` and shared between the login screen and dashboard.

### Loading & Empty States
Every list and chart has a matching shimmer skeleton (gold sweep animation) for its loading state, and a designed empty state — icon, headline, subtitle, and where useful, an action button — instead of a blank or broken-looking screen.

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or later, with npm
- [Ollama](https://ollama.com/) installed locally, for AI-powered agent responses
- Git

## Installation & Setup

```powershell
# 1. Clone the repository
git clone <your-repo-url> Agents
cd Agents

# 2. Install backend dependencies
cd backend
npm install

# 3. Install frontend dependencies
cd ../frontend/dashboard
npm install
```

### Environment Setup

Create a `.env` file inside `backend/` with at least:

```env
PORT=5000
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3
```

Then pull a model in Ollama (any model you configure above):

```powershell
ollama pull llama3
```

---

## Running the Project

Nexus runs as three services, each in its own PowerShell window.

**Window 1 — Ollama**
```powershell
ollama serve
```

**Window 2 — Backend API**
```powershell
cd backend
npm start
```

**Window 3 — Frontend**
```powershell
cd frontend/dashboard
npm start
```

Once all three are running, open the dashboard at:

```
http://localhost:3000
```

The backend API is available at `http://localhost:5000/api`, and Ollama listens on `http://localhost:11434`.

---

## Project Structure

```
Agents/
├── frontend/dashboard/       # React frontend (the Nexus UI)
│   ├── src/
│   │   ├── Dashboard.js      # Main app: agents, tasks, analytics, logs
│   │   ├── Dashboard.css     # Dashboard design system (gold/black/white)
│   │   ├── Login.js          # Authentication screen
│   │   ├── Login.css         # Login design system
│   │   └── App.js            # Auth-gated routing between Login and Dashboard
│   └── public/                # Static assets, manifest, index.html
│
├── backend/                   # Express API server
│   ├── src/
│   │   ├── index.js          # Server entry point & REST routes
│   │   ├── database.js       # SQLite schema & connection (better-sqlite3)
│   │   ├── agentsEngine.js   # Ollama integration for AI agent responses
│   │   ├── routes/           # Route definitions
│   │   ├── controllers/      # Request handlers
│   │   ├── models/           # Data models
│   │   └── middleware/       # Express middleware
│   └── dropship_ai.db        # SQLite database file
│
├── database/
│   └── schema.sql             # Reference database schema
│
└── README.md
```

---

## Contributing

Contributions are welcome:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes with clear, descriptive messages
4. Push to your branch and open a Pull Request
5. Describe what changed and why in the PR description

Please keep the existing gold (`#D4AF37`) / black / white design language consistent when touching UI code.

---

## License

This project is licensed under the **MIT License** — see the `LICENSE` file for details, or add one if it isn't present yet.

---

<p align="center">Built with 🤖 and <span style="color:#D4AF37">◆</span> gold-standard design.</p>
