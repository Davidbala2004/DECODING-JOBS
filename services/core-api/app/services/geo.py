"""City-center coordinates for placing a founder-submitted company's pin.

There's no geocoding API wired up, so a self-registered company is placed at
its city's center (mirrors apps/web/components/MapWorkspace.tsx's
CITY_CENTERS) with a small deterministic offset so multiple companies in the
same city don't stack on exactly one point.
"""

import hashlib

CITY_CENTERS: dict[str, tuple[float, float]] = {
    "Bengaluru": (12.935, 77.665),
    "Chennai": (12.98, 80.255),
    "Hyderabad": (17.385, 78.4867),
    "Kochi": (9.9312, 76.267),
    "Coimbatore": (11.01, 76.97),
    "Thiruvananthapuram": (8.5241, 76.9366),
    "Madurai": (9.9252, 78.1198),
    "Kozhikode": (11.2588, 75.7873),
    "Mumbai": (19.076, 72.8777),
    "Pune": (18.5204, 73.8567),
    "Delhi NCR": (28.4595, 77.0266),
    "Kolkata": (22.5726, 88.3639),
    "Ahmedabad": (23.0225, 72.5714),
    "Visakhapatnam": (17.6868, 83.2185),
    "Mysuru": (12.2958, 76.6394),
}

DEFAULT_CITY = "Bengaluru"


def city_center_with_jitter(city: str | None, seed: str) -> tuple[float, float]:
    """A city's center, offset deterministically (by `seed`, e.g. company name)
    by up to ~2.5km so pins for different companies don't sit on one point."""
    lat, lng = CITY_CENTERS.get(city or DEFAULT_CITY, CITY_CENTERS[DEFAULT_CITY])
    digest = hashlib.md5(seed.encode()).hexdigest()
    lat_offset = (int(digest[:8], 16) / 0xFFFFFFFF - 0.5) * 0.045
    lng_offset = (int(digest[8:16], 16) / 0xFFFFFFFF - 0.5) * 0.045
    return lat + lat_offset, lng + lng_offset
