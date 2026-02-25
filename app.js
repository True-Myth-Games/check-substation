/* ── Config ── */
const POLYGON_URL = "https://services5.arcgis.com/yaIunh7Pa3QmwPBN/arcgis/rest/services/DistrTrSubstThPoly20240528racp/FeatureServer/317/query";
const SUBSTATION_URL = "https://services5.arcgis.com/yaIunh7Pa3QmwPBN/arcgis/rest/services/Transmission_Substations_RES_Hosting_WFL1/FeatureServer/0/query";

const DLS_BASE = "https://eservices.dls.moi.gov.cy/arcgis/rest/services/National/CadastralMap_EN/MapServer";
const DLS_PARCELS = DLS_BASE + "/0/query";
const DLS_ZONES = DLS_BASE + "/12/query";
const DLS_MUNICIPALITY = DLS_BASE + "/16/query";
const DLS_DISTRICT = DLS_BASE + "/15/query";

const CORS_PROXIES = [
    url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];
const CYPRUS_CENTER = [35.1, 33.4];
const CYPRUS_ZOOM = 9;

/* ── State ── */
let substationPromise = null;
let leafletMap = null;
let mapMarker = null;
let mapPickedCoords = null;
let addrMap = null;
let addrMarker = null;
let addrPickedCoords = null;

/* ── Tabs ── */
function switchTab(id, evt) {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-' + id).classList.add('active');
    evt.currentTarget.classList.add('active');
    document.getElementById('result').style.display = 'none';

    if (id === 'map') initMap();
    if (id === 'address') initAddrMap();
}

/* ── Shared helpers ── */
function toggleClear(inputId, btnId) {
    document.getElementById(btnId).style.display =
        document.getElementById(inputId).value ? 'block' : 'none';
}

function clearField(inputId, btnId) {
    const el = document.getElementById(inputId);
    el.value = '';
    el.focus();
    document.getElementById(btnId).style.display = 'none';
}

function setButtonLoading(btn, loading) {
    btn.disabled = loading;
    btn.innerHTML = loading ? '<span class="spinner"></span>Looking up...' : 'Lookup';
}

function fetchWithTimeout(url, ms = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

/* ── Bazaraki fetch ── */
async function tryProxy(makeProxy, url) {
    const resp = await fetchWithTimeout(makeProxy(url), 10000);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();
    const match = html.match(/data-default-lat="([0-9.]+)"\s+data-default-lng="([0-9.]+)"/);
    if (!match) throw new Error("No coordinates in response");
    return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
}

async function fetchBazaraki(url) {
    try {
        return await Promise.any(CORS_PROXIES.map(p => tryProxy(p, url)));
    } catch {
        throw new Error("Could not fetch coordinates from Bazaraki. Try the 'Pin on Map' or 'Search Address' tab instead.");
    }
}

/* ── ArcGIS queries ── */
async function findSubstation(lat, lng) {
    const delta = 0.001;
    const geometry = JSON.stringify({
        xmin: lng - delta, ymin: lat - delta,
        xmax: lng + delta, ymax: lat + delta,
        spatialReference: { wkid: 4326 },
    });
    const params = new URLSearchParams({
        geometry, geometryType: "esriGeometryEnvelope",
        inSR: "4326", spatialRel: "esriSpatialRelIntersects",
        outFields: "SCADASUBSTSHORTID", returnGeometry: "false", f: "json",
    });
    const resp = await fetch(`${POLYGON_URL}?${params}`);
    const data = await resp.json();
    const features = data.features || [];
    return features.length > 0 ? features[0].attributes.SCADASUBSTSHORTID : null;
}

async function _fetchSubstationNames() {
    const params = new URLSearchParams({
        where: "1=1",
        outFields: "SUBSTATIONNAMEEL,SUBSTATIONNAMEEN,SCADASUBSTSHORTID,HostingCapacityNet_MW,REStotal_MW,AvailableCapacity_MW",
        returnGeometry: "false", f: "json", resultRecordCount: "100",
    });
    const resp = await fetch(`${SUBSTATION_URL}?${params}`);
    const data = await resp.json();
    const map = {};
    for (const feat of data.features || []) {
        const a = feat.attributes;
        if (a.SCADASUBSTSHORTID) map[a.SCADASUBSTSHORTID.trim()] = a;
    }
    return map;
}

function getSubstationNames() {
    if (!substationPromise) substationPromise = _fetchSubstationNames();
    return substationPromise;
}

getSubstationNames();

/* ── DLS Ktimatologio queries ── */
function dlsQuery(endpoint, outFields, lat, lng) {
    const params = new URLSearchParams({
        geometry: `${lng},${lat}`,
        geometryType: "esriGeometryPoint",
        inSR: "4326",
        spatialRel: "esriSpatialRelIntersects",
        outFields,
        returnGeometry: "false",
        f: "json",
    });
    return fetch(`${endpoint}?${params}`)
        .then(r => r.json())
        .then(d => (d.features && d.features.length > 0) ? d.features[0].attributes : null)
        .catch(() => null);
}

async function findPlotInfo(lat, lng) {
    const [parcel, zone, municipality, district] = await Promise.all([
        dlsQuery(DLS_PARCELS, "PARCEL_NBR,SHEET,PLAN_NBR,DIST_CODE,VIL_CODE,BLCK_CODE,SHAPE.STArea()", lat, lng),
        dlsQuery(DLS_ZONES, "PLNZNT_NAME,PLNZNT_DESC", lat, lng),
        dlsQuery(DLS_MUNICIPALITY, "VIL_NM_E", lat, lng),
        dlsQuery(DLS_DISTRICT, "DIST_NM_E", lat, lng),
    ]);
    return { parcel, zone, municipality, district };
}

/* ── Core lookup by coordinates ── */
async function lookupByCoords(lat, lng, btn) {
    setButtonLoading(btn, true);
    document.getElementById('result').style.display = 'none';
    try {
        const [shortId, plotInfo, substNames] = await Promise.all([
            findSubstation(lat, lng),
            findPlotInfo(lat, lng),
            getSubstationNames(),
        ]);

        const substInfo = shortId ? (substNames[shortId] || {}) : null;
        showResult(lat, lng, plotInfo, shortId, substInfo);
    } catch (err) {
        showError(err.message);
    } finally {
        setButtonLoading(btn, false);
    }
}

/* ── Tab 1: Bazaraki URL ── */
async function doBazarakiLookup(e) {
    e.preventDefault();
    const url = document.getElementById('url').value.trim();
    if (!url) return;
    if (!url.includes('bazaraki.com')) {
        showError('Please enter a valid bazaraki.com URL.');
        return;
    }
    const btn = document.getElementById('bazBtn');
    setButtonLoading(btn, true);
    document.getElementById('result').style.display = 'none';
    try {
        const { lat, lng } = await fetchBazaraki(url);
        await lookupByCoords(lat, lng, btn);
    } catch (err) {
        showError(err.message);
        setButtonLoading(btn, false);
    }
}

/* ── Tab 2: Map Pin ── */
function initMap() {
    if (leafletMap) { leafletMap.invalidateSize(); return; }
    leafletMap = L.map('map').setView(CYPRUS_CENTER, CYPRUS_ZOOM);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
    }).addTo(leafletMap);

    leafletMap.on('click', function(e) {
        const { lat, lng } = e.latlng;
        mapPickedCoords = { lat, lng };
        if (mapMarker) {
            mapMarker.setLatLng(e.latlng);
        } else {
            mapMarker = L.marker(e.latlng, { draggable: true }).addTo(leafletMap);
            mapMarker.on('dragend', function() {
                const pos = mapMarker.getLatLng();
                mapPickedCoords = { lat: pos.lat, lng: pos.lng };
                updateMapHint();
            });
        }
        updateMapHint();
        document.getElementById('mapLookupBtn').disabled = false;
    });

    setTimeout(() => leafletMap.invalidateSize(), 100);
}

function updateMapHint() {
    if (mapPickedCoords) {
        document.getElementById('mapHint').innerHTML =
            'Pin: <span class="coords">' + mapPickedCoords.lat.toFixed(6) + ', ' + mapPickedCoords.lng.toFixed(6) + '</span> (drag to adjust)';
    }
}

function doMapLookup() {
    if (!mapPickedCoords) return;
    lookupByCoords(mapPickedCoords.lat, mapPickedCoords.lng, document.getElementById('mapLookupBtn'));
}

/* ── Tab 3: Address Search ── */
function initAddrMap() {
    if (addrMap) { addrMap.invalidateSize(); return; }
    const el = document.getElementById('addrMap');
    el.style.display = 'none';
    addrMap = L.map('addrMap').setView(CYPRUS_CENTER, CYPRUS_ZOOM);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
    }).addTo(addrMap);
}

async function doAddressSearch(e) {
    e.preventDefault();
    const q = document.getElementById('addrInput').value.trim();
    if (!q) return;
    const btn = document.getElementById('addrSearchBtn');
    btn.disabled = true;
    btn.textContent = 'Searching...';
    document.getElementById('addrResults').innerHTML = '';
    document.getElementById('addrLookupBtn').style.display = 'none';
    document.getElementById('addrMap').style.display = 'none';

    try {
        const params = new URLSearchParams({
            q, format: 'json', countrycodes: 'cy', limit: '5', addressdetails: '1',
        });
        const resp = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
            headers: { 'Accept': 'application/json' },
        });
        const results = await resp.json();
        const list = document.getElementById('addrResults');

        if (results.length === 0) {
            list.innerHTML = '<li style="cursor:default;color:#64748b">No results found. Try a different search.</li>';
            return;
        }

        results.forEach((r) => {
            const li = document.createElement('li');
            li.textContent = r.display_name;
            li.onclick = () => selectAddress(r, li);
            list.appendChild(li);
        });
    } catch (err) {
        showError('Address search failed: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Search';
    }
}

function selectAddress(result, li) {
    document.querySelectorAll('#addrResults li').forEach(el => el.classList.remove('selected'));
    li.classList.add('selected');

    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    addrPickedCoords = { lat, lng };

    const mapEl = document.getElementById('addrMap');
    mapEl.style.display = 'block';
    setTimeout(() => {
        addrMap.invalidateSize();
        addrMap.setView([lat, lng], 14);
        if (addrMarker) {
            addrMarker.setLatLng([lat, lng]);
        } else {
            addrMarker = L.marker([lat, lng]).addTo(addrMap);
        }
    }, 50);

    document.getElementById('addrLookupBtn').style.display = 'block';
}

function clearAddressResults() {
    document.getElementById('addrResults').innerHTML = '';
    document.getElementById('addrMap').style.display = 'none';
    document.getElementById('addrLookupBtn').style.display = 'none';
    addrPickedCoords = null;
}

function doAddrLookup() {
    if (!addrPickedCoords) return;
    lookupByCoords(addrPickedCoords.lat, addrPickedCoords.lng, document.getElementById('addrLookupBtn'));
}

/* ── Result display ── */
function showResult(lat, lng, plot, shortId, substInfo) {
    const resultDiv = document.getElementById('result');
    let html = '';

    /* ── Plot Info Section ── */
    const p = plot.parcel;
    const z = plot.zone;
    const muni = plot.municipality;
    const dist = plot.district;
    const hasPlot = p || z || muni || dist;

    if (hasPlot) {
        html += `<div class="section-header">📋 Plot Info <span class="section-source">Ktimatologio / DLS</span></div>`;
        html += `<div class="result-grid">`;
        if (p) {
            html += `
                <div class="result-item">
                    <div class="result-label">Parcel Number</div>
                    <div class="result-value">${p.PARCEL_NBR}</div>
                </div>
                <div class="result-item">
                    <div class="result-label">Sheet / Plan</div>
                    <div class="result-value">${p.SHEET || '—'} / ${p.PLAN_NBR || '—'}</div>
                </div>
                <div class="result-item">
                    <div class="result-label">Block</div>
                    <div class="result-value">${p.BLCK_CODE ?? '—'}</div>
                </div>
                <div class="result-item">
                    <div class="result-label">Area</div>
                    <div class="result-value">${p['SHAPE.STArea()'] ? Math.round(p['SHAPE.STArea()']).toLocaleString() + ' m²' : '—'}</div>
                </div>`;
        }
        if (dist || muni) {
            html += `
                <div class="result-item">
                    <div class="result-label">District</div>
                    <div class="result-value">${dist?.DIST_NM_E || '—'}</div>
                </div>
                <div class="result-item">
                    <div class="result-label">Municipality</div>
                    <div class="result-value">${muni?.VIL_NM_E || '—'}</div>
                </div>`;
        }
        if (z) {
            html += `
                <div class="result-item full">
                    <div class="result-label">Planning Zone</div>
                    <div class="result-value">${z.PLNZNT_NAME} — ${z.PLNZNT_DESC}</div>
                </div>`;
        }
        html += `</div>`;
    }

    /* ── Substation Section ── */
    if (shortId && substInfo) {
        const hostMW = substInfo.HostingCapacityNet_MW;
        const resMW = substInfo.REStotal_MW;
        const availMW = substInfo.AvailableCapacity_MW;
        const usedPct = hostMW > 0 ? ((resMW / hostMW) * 100).toFixed(1) : 0;
        const barColor = usedPct < 75 ? '#34d399' : usedPct < 85 ? '#fbbf24' : usedPct < 95 ? '#fb923c' : '#f87171';
        const nameEl = substInfo.SUBSTATIONNAMEEL || shortId;
        const nameEn = substInfo.SUBSTATIONNAMEEN || shortId;

        html += `<div class="section-header">⚡ Substation <span class="section-source">EAC</span></div>`;
        html += `<div class="result-grid">
            <div class="result-item">
                <div class="result-label">Substation (EL)</div>
                <div class="result-value">${nameEl}</div>
            </div>
            <div class="result-item">
                <div class="result-label">Substation (EN)</div>
                <div class="result-value">${nameEn}</div>
            </div>
        </div>`;

        if (hostMW != null) {
            html += `
            <div class="capacity-bar">
                <div class="result-label">RES Capacity Usage</div>
                <div class="bar-track">
                    <div class="bar-fill" style="width:${Math.min(usedPct,100)}%;background:${barColor}"></div>
                </div>
                <div class="bar-labels">
                    <span style="color:#94a3b8">Used: ${resMW?.toFixed(1) ?? '?'} MW</span>
                    <span style="color:#94a3b8">Total: ${hostMW?.toFixed(1) ?? '?'} MW</span>
                </div>
                <div style="text-align:center;margin-top:6px;font-size:0.85rem;color:${barColor}">
                    ${usedPct}% used — Available: ${availMW?.toFixed(1) ?? '?'} MW
                </div>
            </div>`;
        }
    } else if (!hasPlot) {
        html += `
            <div class="result-header">
                <div class="result-icon error">✗</div>
                <div class="result-name error-text">No data found</div>
            </div>
            <div class="result-item full">
                <div class="result-value">No plot or substation data found for ${lat.toFixed(6)}, ${lng.toFixed(6)}.</div>
            </div>`;
    }

    /* ── Coordinates + Links ── */
    html += `
        <div class="section-header">📍 Location</div>
        <div class="result-grid">
            <div class="result-item">
                <div class="result-label">Latitude</div>
                <div class="result-value">${lat.toFixed(6)}</div>
            </div>
            <div class="result-item">
                <div class="result-label">Longitude</div>
                <div class="result-value">${lng.toFixed(6)}</div>
            </div>
        </div>
        <div class="map-links">
            <a class="map-link" href="https://eservices.dls.moi.gov.cy/#/national/geoportalmapviewer" target="_blank">
                🏛️ DLS Portal
            </a>
            <a class="map-link" href="https://www.arcgis.com/apps/mapviewer/index.html?webmap=3c33a4647de3416e8f21574ab8a4a0a1&center=${lng},${lat}&level=13" target="_blank">
                🗺️ EAC Map
            </a>
            <a class="map-link" href="https://www.google.com/maps?q=${lat},${lng}&z=15" target="_blank">
                📍 Google Maps
            </a>
        </div>`;

    resultDiv.innerHTML = html;
    resultDiv.style.display = 'block';
}

function showError(msg) {
    const resultDiv = document.getElementById('result');
    resultDiv.innerHTML = `
        <div class="result-header">
            <div class="result-icon error">✗</div>
            <div class="result-name error-text">Error</div>
        </div>
        <div class="result-item full">
            <div class="result-value">${msg}</div>
        </div>`;
    resultDiv.style.display = 'block';
}
