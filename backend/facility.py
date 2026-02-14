"""
Facility layout definition for FleetBridge simulation.
40x30 grid representing a warehouse floor with zones, stations, aisles, and charging areas.
"""

from models import Position

# Grid dimensions
GRID_WIDTH = 40
GRID_HEIGHT = 30

# --- Zones ---
# Each zone is a named rectangular area
ZONES = {
    "Zone A": {"x_min": 0, "x_max": 13, "y_min": 0, "y_max": 14},
    "Zone B": {"x_min": 14, "x_max": 26, "y_min": 0, "y_max": 14},
    "Zone C": {"x_min": 27, "x_max": 39, "y_min": 0, "y_max": 14},
    "Zone D": {"x_min": 0, "x_max": 13, "y_min": 15, "y_max": 29},
    "Zone E": {"x_min": 14, "x_max": 26, "y_min": 15, "y_max": 29},
    "Zone F": {"x_min": 27, "x_max": 39, "y_min": 15, "y_max": 29},
}

# --- Stations (pickup/delivery points) ---
STATIONS = {
    "Station 1": Position(x=3, y=3),
    "Station 2": Position(x=10, y=3),
    "Station 3": Position(x=17, y=3),
    "Station 4": Position(x=24, y=3),
    "Station 5": Position(x=31, y=3),
    "Station 6": Position(x=37, y=3),
    "Station 7": Position(x=3, y=12),
    "Station 8": Position(x=10, y=12),
    "Station 9": Position(x=17, y=12),
    "Station 10": Position(x=24, y=12),
    "Station 11": Position(x=31, y=12),
    "Station 12": Position(x=37, y=12),
    "Station 13": Position(x=3, y=20),
    "Station 14": Position(x=10, y=20),
    "Station 15": Position(x=17, y=20),
    "Station 16": Position(x=24, y=20),
    "Station 17": Position(x=31, y=20),
    "Station 18": Position(x=37, y=20),
    "Station 19": Position(x=3, y=27),
    "Station 20": Position(x=10, y=27),
}

# --- Charging Stations ---
CHARGING_STATIONS = {
    "Charger C1": Position(x=1, y=1),
    "Charger C2": Position(x=20, y=1),
    "Charger C3": Position(x=38, y=1),
    "Charger C4": Position(x=1, y=28),
    "Charger C5": Position(x=20, y=28),
    "Charger C6": Position(x=38, y=28),
}

# --- Aisles (main corridors for navigation) ---
# Horizontal aisles (y coordinates)
HORIZONTAL_AISLES = [7, 15, 22]
# Vertical aisles (x coordinates)
VERTICAL_AISLES = [6, 13, 20, 27, 34]

# --- Parking Zones ---
PARKING_ZONES = {
    "P1": Position(x=6, y=7),
    "P2": Position(x=20, y=7),
    "P3": Position(x=34, y=7),
    "P4": Position(x=6, y=22),
    "P5": Position(x=20, y=22),
    "P6": Position(x=34, y=22),
}


def get_zone_for_position(x: float, y: float) -> str:
    """Determine which zone a position falls in."""
    for zone_name, bounds in ZONES.items():
        if bounds["x_min"] <= x <= bounds["x_max"] and bounds["y_min"] <= y <= bounds["y_max"]:
            return zone_name
    return "Unknown"


def get_nearest_charging_station(x: float, y: float) -> tuple[str, Position, float]:
    """Find the nearest charging station to a position. Returns (name, position, distance)."""
    best_name = ""
    best_pos = Position(x=0, y=0)
    best_dist = float("inf")
    for name, pos in CHARGING_STATIONS.items():
        dist = ((pos.x - x) ** 2 + (pos.y - y) ** 2) ** 0.5
        if dist < best_dist:
            best_dist = dist
            best_pos = pos
            best_name = name
    return best_name, best_pos, best_dist


def get_station_list() -> list[str]:
    """Get all station names."""
    return list(STATIONS.keys())


def get_random_station_pair() -> tuple[str, str]:
    """Get two different random stations for task generation."""
    import random
    names = list(STATIONS.keys())
    from_st = random.choice(names)
    to_st = random.choice([n for n in names if n != from_st])
    return from_st, to_st


def distance(p1: Position, p2: Position) -> float:
    """Euclidean distance between two positions."""
    return ((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2) ** 0.5
