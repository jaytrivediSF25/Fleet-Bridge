"""
Task catalog for FleetBridge.
Defines all warehouse task types, which vendors/robots can execute them,
and auto-generates from/to station context.
"""

from __future__ import annotations

from dataclasses import dataclass
from facility import get_random_station_pair


# --- Task Definition ---

@dataclass
class TaskDef:
    """A warehouse task type that can be assigned to robots."""
    id: str                             # unique slug
    name: str                           # short display name
    category: str                       # grouping
    icon: str                           # emoji
    description: str                    # one-liner for UI
    vendors: list[str]                  # which vendors can do this
    auto_from: bool = True              # auto-pick a 'from' station
    auto_to: bool = True                # auto-pick a 'to' station
    speed_range: tuple[float, float] = (1.2, 2.8)   # m/s
    duration_mult: float = 1.0          # how long relative to distance


# --- The Catalog ---

TASK_CATALOG: list[TaskDef] = [
    # 1. Move & position inventory pods
    TaskDef(
        id="move_pod",
        name="Move Inventory Pod",
        category="Inventory Movement",
        icon="📦",
        description="Drive under a shelving pod, lift it, and transport it to a workstation",
        vendors=["Amazon"],
        speed_range=(1.0, 2.0),
    ),
    # 2. Transport bins/totes (Sequoia-style)
    TaskDef(
        id="transport_bin",
        name="Transport Bin/Tote",
        category="Inventory Movement",
        icon="🗃️",
        description="Move a standardized bin or tote between storage frame and work cell",
        vendors=["Amazon", "Balyo"],
        speed_range=(1.2, 2.5),
    ),
    # 3. Stow new inventory
    TaskDef(
        id="stow_inventory",
        name="Stow Inventory",
        category="Inbound",
        icon="📥",
        description="Bring empty/partial pod to stower, then return to optimized storage spot",
        vendors=["Amazon", "Gemini"],
        speed_range=(1.0, 1.8),
        duration_mult=1.3,
    ),
    # 4. Pick individual items (robotic arm assist)
    TaskDef(
        id="pick_item",
        name="Pick Item",
        category="Picking",
        icon="🤖",
        description="Present bin to robotic arm (Sparrow) for individual item pick via vision + suction",
        vendors=["Amazon"],
        speed_range=(0.8, 1.5),
        duration_mult=1.5,
    ),
    # 5. Present inventory to human pickers (goods-to-person)
    TaskDef(
        id="present_to_picker",
        name="Present to Picker",
        category="Picking",
        icon="👤",
        description="Bring pod to human picker station, rotate to correct shelf face, queue and wait",
        vendors=["Amazon", "Balyo"],
        speed_range=(1.0, 2.2),
    ),
    # 6. Move items between pick/pack/sort
    TaskDef(
        id="inter_area_transport",
        name="Inter-Area Transport",
        category="Transport",
        icon="🔄",
        description="Move totes between picking, packing, and sorting areas, rerouting around bottlenecks",
        vendors=["Amazon", "Balyo", "Gemini"],
        speed_range=(1.5, 3.0),
    ),
    # 7. Assist with packing
    TaskDef(
        id="packing_assist",
        name="Packing Assist",
        category="Packing",
        icon="📦",
        description="Feed items to automated packing station, match packing pace to picking throughput",
        vendors=["Balyo", "Gemini"],
        speed_range=(1.0, 2.0),
        duration_mult=1.2,
    ),
    # 8. Sort packages by destination (Pegasus-style)
    TaskDef(
        id="sort_package",
        name="Sort Package",
        category="Sorting",
        icon="📮",
        description="Carry labeled package to correct destination chute using floor markers, tilt to release",
        vendors=["Amazon", "Balyo"],
        speed_range=(1.5, 3.5),
        duration_mult=0.7,
    ),
    # 9. Outbound sorting (Robin/Cardinal arm assist)
    TaskDef(
        id="outbound_sort",
        name="Outbound Sort",
        category="Sorting",
        icon="🏷️",
        description="Present packages to robotic arms for barcode read, routing, and placement onto outbound lanes",
        vendors=["Amazon"],
        speed_range=(1.0, 2.0),
    ),
    # 10. Consolidate orders / build outbound loads (Blue Jay)
    TaskDef(
        id="consolidate_order",
        name="Consolidate Order",
        category="Outbound",
        icon="📋",
        description="Gather items from multiple picks into shared containers for same truck/route",
        vendors=["Amazon", "Balyo"],
        speed_range=(1.0, 2.5),
        duration_mult=1.4,
    ),
    # 11. Receive & unload inbound material
    TaskDef(
        id="receive_inbound",
        name="Receive Inbound",
        category="Inbound",
        icon="🚛",
        description="Move inbound pallets/containers from dock to staging or de-palletizing area",
        vendors=["Balyo", "Gemini"],
        speed_range=(0.8, 1.8),
        duration_mult=1.3,
    ),
    # 12. Navigate safely / traffic management patrol
    TaskDef(
        id="safety_patrol",
        name="Safety Patrol",
        category="Operations",
        icon="🛡️",
        description="Patrol zone scanning for obstacles, humans in robot areas, and congestion — report anomalies",
        vendors=["Amazon", "Balyo", "Gemini"],
        speed_range=(0.5, 1.2),
        duration_mult=2.0,
    ),
    # 13. Reduce repetitive work / high-bay access
    TaskDef(
        id="high_bay_access",
        name="High-Bay Retrieval",
        category="Operations",
        icon="🏗️",
        description="Access top-level pod/rack positions for storage or retrieval, keeping humans at ground level",
        vendors=["Amazon", "Gemini"],
        speed_range=(0.6, 1.5),
        duration_mult=1.6,
    ),
]

# --- Index ---
CATALOG_BY_ID: dict[str, TaskDef] = {t.id: t for t in TASK_CATALOG}

# Categories in display order
TASK_CATEGORIES: list[str] = list(dict.fromkeys(t.category for t in TASK_CATALOG))

def get_tasks_for_vendor(vendor: str) -> list[TaskDef]:
    """Return all tasks a given vendor's robots can perform."""
    return [t for t in TASK_CATALOG if vendor in t.vendors]

def get_task_stations(task_id: str) -> tuple[str, str]:
    """Auto-generate appropriate from/to stations for a task."""
    return get_random_station_pair()

def catalog_to_dict() -> list[dict]:
    """Serialize the full catalog for the API."""
    return [
        {
            "id": t.id,
            "name": t.name,
            "category": t.category,
            "icon": t.icon,
            "description": t.description,
            "vendors": t.vendors,
        }
        for t in TASK_CATALOG
    ]
