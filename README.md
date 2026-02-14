# FleetBridge

A single dashboard for managing robots from multiple vendors. Built for the AI Meets Robotics Hackathon 2025.

## Why

In 2023, robots collided at an Ocado warehouse in London and started a fire. $110M in damage. The facility went offline for months.

The root cause wasn't the robots — it was that each vendor's fleet runs on its own system. Operators had no way to see across vendors. An Amazon robot can't detect a Balyo robot heading for the same aisle. Error code `E-2002` means one thing on Amazon, something completely different on Balyo. When things go wrong, operators spend minutes just figuring out which dashboard to look at.

FleetBridge fixes that.

## What it does

It normalizes data from 3 robot vendors (Amazon, Balyo, Gemini — 24 robots total) into one live view. You get a real-time map, alerts when robots are about to collide, and you can ask questions in plain English instead of digging through menus.

**Natural language queries** — type "which robots have errors?" or "compare vendor performance" in the search bar. Common questions respond in ~50ms. Anything more complex gets sent to Gemini with full fleet context.

**Conflict detection** — catches collision courses, deadlocks, congestion, and path blockages before they cause problems.

**Error translation** — maps error codes across vendors. `E-2002` (Amazon) = `OBSTACLE_TIMEOUT` (Balyo) = `0x8010` (Gemini). Shows causes and fix steps.

**AI root cause analysis** — when something breaks, Gemini looks at robot positions, error history, zone data, and tells you *why* it happened.

**Analytics** — vendor comparison, per-robot rankings, zone heatmaps. Works across the whole fleet.

## Tech stack

- **Frontend:** React 19, TypeScript, Tailwind v4, Vite 7, HTML5 Canvas
- **Backend:** Python, FastAPI, WebSocket (500ms updates)
- **AI:** Google Gemini 2.5 Flash
- **Data:** MindsDB

## Setup

You need Python 3.9+, Node 18+, and a [Gemini API key](https://aistudio.google.com/apikey).

```bash
git clone https://github.com/jaytrivediSF25/Fleet-Bridge.git
cd Fleet-Bridge
```

Backend:
```bash
cd backend
pip install -r requirements.txt
export GEMINI_API_KEY="your-key"
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Frontend:
```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The simulation starts on its own.

## Project structure

```
backend/
  main.py             # API server + WebSocket
  simulator.py        # Simulates 24 robots across 3 vendors
  nl_engine.py        # NL queries, Gemini integration
  conflict_engine.py  # Collision/deadlock detection
  analytics_engine.py # Fleet-wide metrics
  rca_engine.py       # Root cause analysis
  error_kb.py         # Error code knowledge base
  adapters.py         # Vendor data normalization

frontend/src/
  components/
    LiveMap.tsx        # Canvas-rendered warehouse map
    TopBar.tsx         # Search bar + status pills
    AlertFeed.tsx      # Real-time alerts
    RobotDetail.tsx    # Per-robot info panel
    ChatPanel.tsx      # AI chat interface
    Analytics/         # Charts and comparisons
```

## Team

Jay Trivedi, Nicholas Lin
