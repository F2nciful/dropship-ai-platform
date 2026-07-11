# Starting & Stopping Nexus

Two double-click scripts in this folder (`C:\Users\x8hr2\Desktop\Agents\`) handle the whole platform — no manual terminal juggling needed.

## Start everything

**Double-click `start-nexus.bat`.**

It opens four windows, one per service, each with a clear title so you can tell them apart:

| Window     | What it runs                              | URL                          |
|------------|--------------------------------------------|-------------------------------|
| Ollama     | `ollama serve` on `127.0.0.1:11435`        | http://127.0.0.1:11435       |
| Backend    | Express API (`backend`, port 5000)         | http://localhost:5000        |
| FastAPI    | Product Research Agent (port 8000)         | http://127.0.0.1:8000/docs   |
| Frontend   | React dashboard (port 3000)                | http://localhost:3000        |

There's a 3-second pause between each launch so services come up in order (Ollama → Backend → FastAPI → Frontend), since the frontend and FastAPI both expect the others to already be reachable.

**Wait about 30 seconds** after the four windows open (React in particular takes a while to compile on first start), then open:

```
http://localhost:3000
```

Leave all four windows open while you work — closing one stops that service. Each window shows that service's live logs, which is the first place to look if something isn't working.

## Stop everything

**Double-click `stop-nexus.bat`.**

It force-kills all Node.js and Python processes (plus Ollama) to shut down the backend, frontend, and FastAPI agent in one go, then shows a confirmation message.

> ⚠️ **This stops every Node.js and Python process on your PC**, not just Nexus's — it's not scoped to this project specifically. If you have other Node or Python apps running (another dev server, a Jupyter notebook, etc.), close this in mind or save your work in them first. The script pauses once before doing anything, so you have a chance to back out (Ctrl+C) if that's not what you want right now.

## Desktop shortcut (optional)

To launch Nexus from your desktop instead of digging into the folder:

1. Right-click `start-nexus.bat` → **Show more options** → **Send to** → **Desktop (create shortcut)**.
2. Optionally rename the shortcut to "Start Nexus" and repeat for `stop-nexus.bat` as "Stop Nexus".
3. (Optional) Right-click the shortcut → **Properties** → **Change Icon...** to pick something more recognizable than the default `.bat` icon.

## Troubleshooting

- **A window closes immediately / shows an error**: that service failed to start — read the error in that window (they stay open via `cmd /k` so you can see it) before closing it.
- **"Ollama" window errors about the port already being in use**: Ollama may already be running as a background service from a previous session — that's fine, it's already available at `127.0.0.1:11435`; you can close that one window.
- **Frontend loads but shows "Backend Offline"**: give it a few more seconds — Express and FastAPI both need a moment after their windows open before they're actually accepting connections.
