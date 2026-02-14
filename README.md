# 🤖 FleetBridge — AI-Powered Multi-Vendor Robot Fleet Management

> **One dashboard to monitor, command, and optimize robots from every vendor — powered by AI.**

FleetBridge is a unified command center that bridges the gap between incompatible robot fleet systems. Instead of juggling separate dashboards for each vendor, operators get a single real-time view with natural language queries, AI-driven root cause analysis, and cross-fleet conflict detection.

---

## 🎯 The Problem

In 2023, a fire broke out at Ocado's automated warehouse in southeast London. Robots from multiple vendors collided, triggering a chain reaction that caused **$110M+ in damage** and took the facility offline for months.

This isn't an isolated incident. Modern warehouses deploy robots from **3–5 different vendors**, each with:

- **Separate dashboards** — operators alt-tab between vendor-specific UIs
- **Incompatible protocols** — no shared language for errors, statuses, or commands
- **Zero cross-fleet visibility** — a Balyo robot can't "see" an Amazon robot heading toward the same aisle
- **Siloed error codes** — `E-2002` on one vendor means something completely different on another

When something goes wrong, operators waste critical minutes translating between systems. **FleetBridge eliminates that gap.**

---

## 💡 Our Solution

FleetBridge provides a **single pane of glass** for multi-vendor robot fleets:

- **Unified data model** — every robot (Amazon, Balyo, Gemini) is normalized into a common schema with real-time position, status, battery, tasks, and error history
- **Natural language interface** — ask "Which robots need attention?" instead of clicking through menus
- **AI root cause analysis** — when errors occur, Gemini AI cross-references fleet state, error history, and zone data to explain *why* it happened
- **Proactive conflict detection** — identifies deadlocks, collision courses, and congestion before they cause damage

---

## ✨ Features

### 🗺️ Unified Live Map
Real-time canvas-based map showing all 24 robots across 3 vendors with smooth interpolated movement, zone overlays, charging stations, and trail visualization. Click any robot for detailed status.

### 💬 Natural Language Queries
Ask questions in plain English via the command bar:
- *"Where is AR-003?"*
- *"Which robots have errors?"*
- *"Compare Amazon vs Balyo performance"*
- *"What's the most populated zone?"*

Common queries are handled instantly (~50ms). Complex analytical questions are routed to Google Gemini with full fleet context for AI-powered responses.

### 🧠 AI Root Cause Analysis
When alerts fire, FleetBridge doesn't just tell you *what* happened — it tells you *why*. Gemini AI analyzes robot positions, error history, zone congestion, and task state to provide actionable root cause analysis with suggested fixes.

### 🚨 Conflict Detection Engine
Real-time detection of:
- **Collision courses** — two robots heading toward the same point
- **Deadlocks** — robots blocking each other in narrow aisles
- **Zone congestion** — too many robots in one area
- **Path blockages** — idle robots obstructing active routes
- **Battery critical** — robots at risk of dying mid-task

### 📊 Cross-Fleet Analytics
Vendor comparison, robot performance rankings, zone activity heatmaps, and daily summaries — all computed across the entire fleet regardless of vendor.

### 🔍 Error Code Translation
Universal error knowledge base that maps vendor-specific codes to plain English. `E-2002` (Amazon) = `OBSTACLE_TIMEOUT` (Balyo) = `0x8010` (Gemini). Includes remediation steps, severity, and auto-recovery status.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, TypeScript, Tailwind CSS v4, Vite 7 |
| **Backend** | Python 3.9+, FastAPI, Uvicorn |
| **AI Engine** | Google Gemini 2.5 Flash (REST API) |
| **Real-Time** | WebSocket (500ms tick) |
| **Data** | MindsDB for predictive analytics |
| **Visualization** | HTML5 Canvas (custom renderer), Recharts |

### Architecture

```
┌─────────────────────────────────────────────────┐
│                  React Frontend                  │
│  LiveMap · TopBar · AlertFeed · Analytics · Chat │
└────────────────────┬────────────────────────────┘
                     │ WebSocket + REST
┌────────────────────┴────────────────────────────┐
│               FastAPI Backend                    │
│  Simulator · ConflictEngine · NLEngine · RCA     │
│  AnalyticsEngine · ErrorKB · TaskCatalog         │
└────────────────────┬────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
   Amazon API   Balyo API   Gemini API
   (Adapter)    (Adapter)   (Adapter)
```

---

## 🚀 Quick Start

### Prerequisites
- Python 3.9+
- Node.js 18+
- Google Gemini API key ([get one free](https://aistudio.google.com/apikey))

### 1. Clone the repo
```bash
git clone https://github.com/jaytrivediSF25/Fleet-Bridge.git
cd Fleet-Bridge
```

### 2. Start the backend
```bash
cd backend
pip install -r requirements.txt
export GEMINI_API_KEY="your-api-key-here"
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 3. Start the frontend
```bash
cd frontend
npm install
npm run dev
```

### 4. Open the dashboard
Navigate to **http://localhost:5173** — the fleet simulation starts automatically with 24 robots.

---

## 📸 Screenshots

### Command Center
The main dashboard with live map, alert feed, and status indicators.

### Natural Language Query
Ask questions in the top bar — responses include robot IDs you can click to locate on the map.

### Analytics Overlay
Vendor comparison, robot rankings, zone analysis, and daily KPIs.

### Robot Detail Panel
Click any robot for real-time status, battery, current task, error history, and activity log.

---

## 🏗️ Project Structure

```
Fleet-Bridge/
├── backend/
│   ├── main.py              # FastAPI app, WebSocket, REST endpoints
│   ├── simulator.py          # Fleet simulation engine (24 robots)
│   ├── adapters.py           # Vendor-specific data adapters
│   ├── nl_engine.py          # Natural language query processing + Gemini AI
│   ├── conflict_engine.py    # Real-time conflict & alert detection
│   ├── analytics_engine.py   # Cross-fleet analytics & metrics
│   ├── rca_engine.py         # AI root cause analysis
│   ├── error_kb.py           # Error code knowledge base
│   ├── task_catalog.py       # Task type definitions
│   ├── facility.py           # Warehouse layout (zones, stations)
│   └── models.py             # Pydantic data models
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── LiveMap.tsx        # Canvas-based real-time map
│       │   ├── TopBar.tsx         # NL query bar + fleet status
│       │   ├── AlertFeed.tsx      # Live alert stream
│       │   ├── RobotDetail.tsx    # Robot info panel
│       │   ├── ChatPanel.tsx      # Conversational AI chat
│       │   ├── ErrorLookup.tsx    # Error code search
│       │   └── Analytics/         # Analytics overlay views
│       ├── context/
│       │   └── FleetContext.tsx   # Global state management
│       └── hooks/
│           ├── useWebSocket.ts   # Real-time fleet data
│           └── useChat.ts        # Chat state management
└── start_backend.sh
```

---

## 🏆 Hackathon

Built for the **AI Meets Robotics Hackathon 2025** — addressing the real-world challenge of multi-vendor robot fleet coordination in warehouse environments.

**Challenge:** How might we use AI to prevent catastrophic failures in mixed-vendor robot fleets?

**Our approach:** Unify the data, let operators speak naturally, and let AI handle the complexity.

---

## 👥 Team

**Jay Trivedi** — Full-stack development, AI integration, system architecture

---

## 📄 License

MIT
