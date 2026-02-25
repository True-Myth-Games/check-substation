# Bazaraki Substation Lookup

Find which EAC transmission substation a Bazaraki land listing belongs to.

Paste a Bazaraki property ad URL and get the substation name, RES capacity info, and more.

## Setup

```bash
pip install -r requirements.txt
```

## Usage

### Web UI

```bash
python app.py
```

Then open http://localhost:5000 in your browser.

### Command Line

```bash
python substation_lookup.py https://www.bazaraki.com/adv/5012977_residential-land-23592-m2/
```

## How it works

1. Fetches the Bazaraki ad page and extracts GPS coordinates from `data-default-lat` / `data-default-lng` attributes
2. Queries the EAC/AHK ArcGIS polygon service to find which substation coverage area contains the point
3. Returns the substation name (Greek/English) along with RES hosting capacity data

## Data sources

- **Bazaraki** — property listings with embedded GPS coordinates
- **EAC ArcGIS Dashboard** — [Substation RES Hosting Capacity](https://www.arcgis.com/apps/dashboards/134fdd8988d44ade8dd33b5c1c26ca65)
