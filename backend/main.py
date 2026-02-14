"""
FleetBridge API Server.
FastAPI app with REST endpoints, WebSocket for real-time updates,
and background simulation loop.
"""

from __future__ import annotations

import asyncio
import json
import os
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from models import (
    ChatRequest,
    ChatResponse,
    Alert,
    UnifiedRobotState,
    DailySummary,
    VendorMetrics,
    RobotPerformance,
    ZoneMetrics,
    FleetUpdate,
    RobotStatus,
)
from simulator import FleetSimulator
from conflict_engine import ConflictEngine
from analytics_engine import AnalyticsEngine
from rca_engine import RCAEngine
from nl_engine import process_query, parse_nl_task
from error_kb import (
    lookup_error,
    search_errors,
    get_errors_by_vendor,
    get_equivalent_errors,
    ALL_ERRORS,
    ErrorCodeEntry,
)
from facility import ZONES, STATIONS, CHARGING_STATIONS
from task_catalog import TASK_CATALOG, CATALOG_BY_ID, get_tasks_for_vendor, catalog_to_dict

# --- Global State ---
simulator: FleetSimulator | None = None
conflict_engine: ConflictEngine | None = None
analytics_engine: AnalyticsEngine | None = None
rca_engine: RCAEngine | None = None

# WebSocket connections
ws_connections: list[WebSocket] = []

# Previous error states for RCA triggering
_prev_error_robots: set[str] = set()


async def simulation_loop():
    """Background loop: ticks simulator every 500ms, checks conflicts every 2s, broadcasts state."""
    global _prev_error_robots
    tick_counter = 0

    while True:
        try:
            if simulator is None:
                await asyncio.sleep(0.5)
                continue

            # Tick simulation
            simulator.tick()
            tick_counter += 1

            # Check for new errors -> trigger RCA
            current_error_robots = {
                rid for rid, r in simulator.robots.items()
                if r.status == RobotStatus.ERROR
            }
            new_errors = current_error_robots - _prev_error_robots
            _prev_error_robots = current_error_robots

            # Run RCA for newly errored robots
            if rca_engine and new_errors:
                for robot_id in new_errors:
                    try:
                        analysis = await rca_engine.analyze_error(robot_id)
                        if analysis and conflict_engine:
                            # Attach RCA to relevant alerts
                            for alert in conflict_engine.active_alerts.values():
                                if robot_id in alert.affected_robots and not alert.rca_analysis:
                                    alert.rca_analysis = analysis
                    except Exception:
                        pass

            # Check conflicts every 4 ticks (2 seconds)
            if conflict_engine and tick_counter % 4 == 0:
                conflict_engine.check_all()

            # Broadcast to WebSocket clients every tick
            if ws_connections:
                robots = simulator.get_all_unified()
                alerts = conflict_engine.get_active_alerts() if conflict_engine else []

                update = FleetUpdate(
                    robots=robots,
                    alerts=alerts,
                    timestamp=datetime.now(),
                )
                data = update.model_dump_json()

                disconnected = []
                for ws in ws_connections:
                    try:
                        await ws.send_text(data)
                    except Exception:
                        disconnected.append(ws)

                for ws in disconnected:
                    ws_connections.remove(ws)

        except Exception as e:
            print(f"Simulation loop error: {e}")

        await asyncio.sleep(0.5)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown lifecycle."""
    global simulator, conflict_engine, analytics_engine, rca_engine

    # Initialize
    simulator = FleetSimulator()
    conflict_engine = ConflictEngine(simulator)
    analytics_engine = AnalyticsEngine(simulator)
    rca_engine = RCAEngine(simulator)

    # Start background simulation
    task = asyncio.create_task(simulation_loop())

    print("🤖 FleetBridge server started")
    print(f"   Fleet: {len(simulator.robots)} robots across 3 vendors")
    print(f"   Gemini API: {'configured' if os.getenv('GEMINI_API_KEY') else 'not configured (using fallback)'}")

    yield

    # Shutdown
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


# --- FastAPI App ---
app = FastAPI(
    title="FleetBridge API",
    description="AI-Powered Unified Robot Fleet Dashboard",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- REST Endpoints ---

@app.get("/api/robots", response_model=list[UnifiedRobotState])
async def get_robots(
    vendor: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    zone: Optional[str] = Query(None),
):
    """List all robots with optional filters."""
    robots = simulator.get_all_unified()

    if vendor:
        robots = [r for r in robots if r.vendor == vendor]
    if status:
        robots = [r for r in robots if r.status.value == status]
    if zone:
        robots = [r for r in robots if r.zone == zone]

    return robots


@app.get("/api/robots/{robot_id}", response_model=UnifiedRobotState)
async def get_robot(robot_id: str):
    """Get a single robot's details."""
    robot = simulator.get_robot_unified(robot_id)
    if not robot:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Robot {robot_id} not found")
    return robot


@app.get("/api/robots/{robot_id}/history")
async def get_robot_history(robot_id: str):
    """Get a robot's activity history and error history."""
    raw = simulator.get_raw_robot(robot_id)
    if not raw:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Robot {robot_id} not found")

    return {
        "robot_id": robot_id,
        "tasks_completed": raw.tasks_completed,
        "total_distance": round(raw.total_distance, 1),
        "activity": [
            {
                "timestamp": a["timestamp"].isoformat(),
                "description": a["description"],
                "type": a["type"],
            }
            for a in list(raw.activity)
        ],
        "error_history": [
            {
                "error_code": e["error_code"],
                "name": e["name"],
                "timestamp": e["timestamp"].isoformat(),
                "position": e.get("position", {}),
                "zone": e.get("zone", ""),
            }
            for e in raw.error_history
        ],
        "task_times": raw.task_times[-20:],  # Last 20 task durations
    }


@app.post("/api/robots/{robot_id}/command")
async def command_robot(robot_id: str, command: dict):
    """Send a command to a robot (pause, resume, send_to_charging, assign_task, clear_error)."""
    cmd = command.get("command", "")
    kwargs = {}
    if cmd == "assign_task":
        kwargs["from_station"] = command.get("from_station")
        kwargs["to_station"] = command.get("to_station")
        kwargs["task_type"] = command.get("task_type", "transport")
        kwargs["catalog_task_id"] = command.get("catalog_task_id")
    result = simulator.command_robot(robot_id, cmd, **kwargs)
    return {"robot_id": robot_id, "command": cmd, **result}


@app.post("/api/robots/{robot_id}/nl-task")
async def nl_task_assign(robot_id: str, body: dict):
    """Parse a natural-language task instruction and optionally execute it."""
    instruction = body.get("instruction", "")
    execute = body.get("execute", False)

    if not instruction:
        return {"success": False, "error": "No instruction provided"}

    # Parse the instruction via LLM
    result = await parse_nl_task(instruction, robot_id, simulator)

    if not result.get("success"):
        return result

    # If execute=True, actually assign the task
    if execute:
        catalog_task_id = result.get("catalog_task_id")
        from_station = result.get("from_station")
        to_station = result.get("to_station")
        task_type = result.get("task_type", "transport")

        # Handle charging command separately
        if not catalog_task_id and "charg" in task_type.lower():
            cmd_result = simulator.command_robot(robot_id, "send_to_charging")
            return {
                **result,
                "executed": True,
                "command_result": cmd_result,
            }

        cmd_result = simulator.command_robot(
            robot_id,
            "assign_task",
            from_station=from_station,
            to_station=to_station,
            task_type=task_type,
            catalog_task_id=catalog_task_id,
        )
        return {
            **result,
            "executed": True,
            "command_result": cmd_result,
        }

    return result


@app.get("/api/stations")
async def get_stations():
    """Get all station names and positions for task assignment."""
    return {
        "stations": {name: {"x": pos.x, "y": pos.y} for name, pos in STATIONS.items()},
        "charging_stations": {name: {"x": pos.x, "y": pos.y} for name, pos in CHARGING_STATIONS.items()},
    }


@app.get("/api/task-catalog")
async def get_task_catalog(vendor: Optional[str] = Query(None)):
    """Get all available task types, optionally filtered by vendor."""
    if vendor:
        tasks = get_tasks_for_vendor(vendor)
        return [
            {
                "id": t.id,
                "name": t.name,
                "category": t.category,
                "icon": t.icon,
                "description": t.description,
                "vendors": t.vendors,
            }
            for t in tasks
        ]
    return catalog_to_dict()


# --- Chat ---

@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Process a natural language query."""
    response = await process_query(
        query=request.query,
        simulator=simulator,
        conversation_id=request.conversation_id,
    )
    return response


# --- Alerts ---

@app.get("/api/alerts")
async def get_alerts():
    """Get all active alerts."""
    if not conflict_engine:
        return []
    alerts = conflict_engine.get_active_alerts()
    return [a.model_dump() for a in alerts]


@app.post("/api/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: str):
    """Mark an alert as acknowledged."""
    success = conflict_engine.acknowledge_alert(alert_id) if conflict_engine else False
    return {"success": success}


@app.post("/api/alerts/{alert_id}/resolve")
async def resolve_alert(alert_id: str):
    """Mark an alert as resolved."""
    success = conflict_engine.resolve_alert(alert_id) if conflict_engine else False
    return {"success": success}


# --- Analytics ---

@app.get("/api/analytics/summary", response_model=DailySummary)
async def get_analytics_summary():
    """Get daily summary KPIs."""
    return analytics_engine.get_daily_summary()


@app.get("/api/analytics/vendors", response_model=list[VendorMetrics])
async def get_vendor_comparison():
    """Get vendor comparison metrics."""
    return analytics_engine.get_vendor_comparison()


@app.get("/api/analytics/robots", response_model=list[RobotPerformance])
async def get_robot_performance():
    """Get per-robot performance table."""
    return analytics_engine.get_robot_performance()


@app.get("/api/analytics/zones", response_model=list[ZoneMetrics])
async def get_zone_analysis():
    """Get per-zone analysis."""
    return analytics_engine.get_zone_analysis()


# --- Error Knowledge Base ---

@app.get("/api/errors/lookup")
async def search_error_codes(q: str = Query(..., description="Search query")):
    """Search error codes by code, keyword, or description."""
    results = search_errors(q)
    return [r.model_dump() for r in results]


@app.get("/api/errors/{code}/remediation")
async def get_error_remediation(code: str):
    """Get remediation steps for a specific error code."""
    entry = lookup_error(code)
    if not entry:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Error code {code} not found")
    return {
        "code": entry.code,
        "name": entry.name,
        "description": entry.description,
        "common_causes": entry.common_causes,
        "remediation_steps": entry.remediation_steps,
        "auto_recoverable": entry.auto_recoverable,
        "severity": entry.severity.value,
    }


@app.get("/api/errors/{code}")
async def get_error_code(code: str):
    """Get details for a specific error code including full remediation steps."""
    entry = lookup_error(code)
    if not entry:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Error code {code} not found")

    result = entry.model_dump()
    # Add equivalent errors from other vendors
    equiv = get_equivalent_errors(code)
    result["equivalent_errors"] = [e.model_dump() for e in equiv]
    return result


@app.get("/api/errors")
async def list_all_errors(vendor: Optional[str] = Query(None)):
    """List all error codes, optionally filtered by vendor."""
    errors = ALL_ERRORS
    if vendor:
        errors = [e for e in errors if e.vendor == vendor]
    return [e.model_dump() for e in errors]


# --- Facility ---

@app.get("/api/facility")
async def get_facility():
    """Get facility layout data for map rendering."""
    return {
        "grid_width": 40,
        "grid_height": 30,
        "zones": {
            name: bounds for name, bounds in ZONES.items()
        },
        "stations": {
            name: {"x": pos.x, "y": pos.y}
            for name, pos in STATIONS.items()
        },
        "charging_stations": {
            name: {"x": pos.x, "y": pos.y}
            for name, pos in CHARGING_STATIONS.items()
        },
    }


# --- WebSocket ---

@app.websocket("/ws/fleet")
async def websocket_fleet(websocket: WebSocket):
    """Real-time fleet state stream."""
    await websocket.accept()
    ws_connections.append(websocket)
    try:
        while True:
            # Keep connection alive, listen for client messages
            data = await websocket.receive_text()
            # Client can send commands via WebSocket too
            try:
                msg = json.loads(data)
                if msg.get("type") == "command":
                    simulator.command_robot(
                        msg.get("robot_id", ""),
                        msg.get("command", ""),
                    )
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        if websocket in ws_connections:
            ws_connections.remove(websocket)


# --- Health Check ---

@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "robots": len(simulator.robots) if simulator else 0,
        "tick_count": simulator.tick_count if simulator else 0,
        "ws_connections": len(ws_connections),
        "gemini_configured": bool(os.getenv("GEMINI_API_KEY")),
    }
