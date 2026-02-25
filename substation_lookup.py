import re
import sys
import json
from curl_cffi import requests as cffi_requests
import requests

POLYGON_SERVICE_URL = (
    "https://services5.arcgis.com/yaIunh7Pa3QmwPBN/arcgis/rest/services/"
    "DistrTrSubstThPoly20240528racp/FeatureServer/317/query"
)
SUBSTATION_SERVICE_URL = (
    "https://services5.arcgis.com/yaIunh7Pa3QmwPBN/arcgis/rest/services/"
    "Transmission_Substations_RES_Hosting_WFL1/FeatureServer/0/query"
)

_substation_cache = None


def fetch_substation_names():
    """Fetch the mapping of SCADASUBSTSHORTID -> Greek/English names."""
    global _substation_cache
    if _substation_cache is not None:
        return _substation_cache

    resp = requests.get(SUBSTATION_SERVICE_URL, params={
        "where": "1=1",
        "outFields": "SUBSTATIONNAMEEL,SUBSTATIONNAMEEN,SCADASUBSTSHORTID,"
                     "HostingCapacityNet_MW,REStotal_MW,AvailableCapacity_MW",
        "returnGeometry": "false",
        "f": "json",
        "resultRecordCount": 100,
    }, timeout=15)
    resp.raise_for_status()
    data = resp.json()

    mapping = {}
    for feat in data.get("features", []):
        attrs = feat["attributes"]
        short_id = attrs.get("SCADASUBSTSHORTID", "").strip()
        if short_id:
            mapping[short_id] = attrs
    _substation_cache = mapping
    return mapping


def extract_coordinates_from_bazaraki(url: str) -> tuple[float, float]:
    """Fetch a Bazaraki ad page and extract lat/lng from data attributes."""
    if "bazaraki.com" not in url:
        raise ValueError("URL must be from bazaraki.com")

    resp = cffi_requests.get(url, impersonate="chrome", timeout=20)
    resp.raise_for_status()
    html = resp.text

    match = re.search(
        r'data-default-lat="([0-9.]+)"\s+data-default-lng="([0-9.]+)"',
        html,
    )
    if not match:
        raise ValueError(
            "Could not find coordinates on this Bazaraki page. "
            "Make sure the ad has a map/location."
        )

    lat = float(match.group(1))
    lng = float(match.group(2))
    return lat, lng


def find_substation_by_coords(lat: float, lng: float) -> str | None:
    """Query the ArcGIS polygon service to find which substation area contains the point."""
    delta = 0.001
    geometry = json.dumps({
        "xmin": lng - delta,
        "ymin": lat - delta,
        "xmax": lng + delta,
        "ymax": lat + delta,
        "spatialReference": {"wkid": 4326},
    })

    resp = requests.get(POLYGON_SERVICE_URL, params={
        "geometry": geometry,
        "geometryType": "esriGeometryEnvelope",
        "inSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": "SCADASUBSTSHORTID",
        "returnGeometry": "false",
        "f": "json",
    }, timeout=15)
    resp.raise_for_status()
    data = resp.json()

    features = data.get("features", [])
    if not features:
        return None
    return features[0]["attributes"]["SCADASUBSTSHORTID"]


def lookup_bazaraki_substation(url: str) -> dict:
    """Main function: given a Bazaraki URL, return the substation info."""
    lat, lng = extract_coordinates_from_bazaraki(url)

    short_id = find_substation_by_coords(lat, lng)
    if not short_id:
        return {
            "url": url,
            "lat": lat,
            "lng": lng,
            "error": "No substation polygon found for these coordinates.",
        }

    substations = fetch_substation_names()
    info = substations.get(short_id, {})

    return {
        "url": url,
        "lat": lat,
        "lng": lng,
        "substation_id": short_id,
        "substation_name_el": info.get("SUBSTATIONNAMEEL", short_id),
        "substation_name_en": info.get("SUBSTATIONNAMEEN", short_id),
        "hosting_capacity_mw": info.get("HostingCapacityNet_MW"),
        "res_total_mw": info.get("REStotal_MW"),
        "available_capacity_mw": info.get("AvailableCapacity_MW"),
    }


def main():
    if len(sys.argv) < 2:
        print("Usage: python substation_lookup.py <bazaraki_url>")
        print("Example: python substation_lookup.py https://www.bazaraki.com/adv/5012977_residential-land-23592-m2/")
        sys.exit(1)

    url = sys.argv[1]
    print(f"\nLooking up substation for: {url}\n")

    try:
        result = lookup_bazaraki_substation(url)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

    if "error" in result:
        print(f"Coordinates: {result['lat']}, {result['lng']}")
        print(f"Error: {result['error']}")
        sys.exit(1)

    print(f"  Coordinates:         {result['lat']}, {result['lng']}")
    print(f"  Substation (EL):     {result['substation_name_el']}")
    print(f"  Substation (EN):     {result['substation_name_en']}")
    print(f"  Substation ID:       {result['substation_id']}")
    if result.get("hosting_capacity_mw") is not None:
        print(f"  Hosting Capacity:    {result['hosting_capacity_mw']:.1f} MW")
    if result.get("res_total_mw") is not None:
        print(f"  RES Total:           {result['res_total_mw']:.1f} MW")
    if result.get("available_capacity_mw") is not None:
        print(f"  Available Capacity:  {result['available_capacity_mw']:.1f} MW")


if __name__ == "__main__":
    main()
