from flask import Flask, render_template_string, request, jsonify
from substation_lookup import lookup_bazaraki_substation

app = Flask(__name__)

HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bazaraki Substation Lookup</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            color: #e2e8f0;
        }
        .container {
            background: #1e293b;
            border: 1px solid #334155;
            border-radius: 16px;
            padding: 40px;
            max-width: 600px;
            width: 100%;
            box-shadow: 0 25px 50px rgba(0,0,0,0.3);
        }
        h1 {
            font-size: 1.5rem;
            font-weight: 700;
            margin-bottom: 8px;
            color: #f1f5f9;
        }
        .subtitle {
            color: #94a3b8;
            font-size: 0.9rem;
            margin-bottom: 28px;
        }
        .input-group {
            display: flex;
            gap: 10px;
            margin-bottom: 24px;
        }
        .input-wrapper {
            flex: 1;
            position: relative;
        }
        input[type="text"] {
            width: 100%;
            padding: 12px 36px 12px 16px;
            border: 1px solid #475569;
            border-radius: 10px;
            font-size: 0.95rem;
            background: #0f172a;
            color: #e2e8f0;
            outline: none;
            transition: border-color 0.2s;
        }
        input[type="text"]:focus {
            border-color: #3b82f6;
        }
        input[type="text"]::placeholder { color: #64748b; }
        .clear-btn {
            display: none;
            position: absolute;
            right: 10px;
            top: 50%;
            transform: translateY(-50%);
            background: #475569;
            border: none;
            color: #e2e8f0;
            width: 22px;
            height: 22px;
            border-radius: 50%;
            font-size: 0.75rem;
            cursor: pointer;
            line-height: 1;
            padding: 0;
            transition: background 0.15s;
        }
        .clear-btn:hover { background: #64748b; }
        button {
            padding: 12px 24px;
            background: #3b82f6;
            color: white;
            border: none;
            border-radius: 10px;
            font-size: 0.95rem;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.2s;
            white-space: nowrap;
        }
        button:hover { background: #2563eb; }
        button:disabled {
            background: #475569;
            cursor: not-allowed;
        }
        .spinner {
            display: inline-block;
            width: 18px;
            height: 18px;
            border: 2px solid rgba(255,255,255,0.3);
            border-top-color: white;
            border-radius: 50%;
            animation: spin 0.7s linear infinite;
            vertical-align: middle;
            margin-right: 6px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        #result {
            display: none;
            background: #0f172a;
            border: 1px solid #334155;
            border-radius: 12px;
            padding: 24px;
            animation: fadeIn 0.3s ease;
        }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .result-header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 16px;
        }
        .result-icon {
            width: 40px;
            height: 40px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.3rem;
        }
        .result-icon.success { background: #065f46; }
        .result-icon.error { background: #7f1d1d; }
        .result-name {
            font-size: 1.3rem;
            font-weight: 700;
            color: #34d399;
        }
        .result-name.error-text { color: #f87171; }
        .result-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
        }
        .result-item {
            background: #1e293b;
            padding: 12px;
            border-radius: 8px;
        }
        .result-item.full { grid-column: 1 / -1; }
        .result-label {
            font-size: 0.75rem;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 4px;
        }
        .result-value {
            font-size: 1rem;
            color: #e2e8f0;
            font-weight: 500;
        }
        .map-links {
            display: flex;
            gap: 10px;
            margin-top: 16px;
        }
        .map-link {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 10px 12px;
            background: #1e293b;
            border: 1px solid #334155;
            border-radius: 8px;
            color: #94a3b8;
            text-decoration: none;
            font-size: 0.85rem;
            font-weight: 500;
            transition: background 0.15s, color 0.15s, border-color 0.15s;
        }
        .map-link:hover {
            background: #334155;
            color: #e2e8f0;
            border-color: #475569;
        }
        .capacity-bar {
            margin-top: 16px;
            background: #1e293b;
            padding: 12px;
            border-radius: 8px;
        }
        .bar-track {
            height: 8px;
            background: #334155;
            border-radius: 4px;
            overflow: hidden;
            margin-top: 8px;
        }
        .bar-fill {
            height: 100%;
            border-radius: 4px;
            transition: width 0.5s ease;
        }
        .bar-labels {
            display: flex;
            justify-content: space-between;
            font-size: 0.8rem;
            margin-top: 4px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Bazaraki Substation Lookup</h1>
        <p class="subtitle">Paste a Bazaraki land ad URL to find which EAC transmission substation it belongs to.</p>
        <form id="form" onsubmit="doLookup(event)">
            <div class="input-group">
                <div class="input-wrapper">
                    <input type="text" id="url" placeholder="https://www.bazaraki.com/adv/..." autofocus oninput="toggleClear()">
                    <button type="button" class="clear-btn" id="clearBtn" onclick="clearInput()">✕</button>
                </div>
                <button type="submit" id="btn">Lookup</button>
            </div>
        </form>
        <div id="result"></div>
    </div>
    <script>
    function toggleClear() {
        document.getElementById('clearBtn').style.display =
            document.getElementById('url').value ? 'block' : 'none';
    }
    function clearInput() {
        const input = document.getElementById('url');
        input.value = '';
        input.focus();
        toggleClear();
    }
    async function doLookup(e) {
        e.preventDefault();
        const url = document.getElementById('url').value.trim();
        if (!url) return;
        const btn = document.getElementById('btn');
        const resultDiv = document.getElementById('result');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span>Looking up...';
        resultDiv.style.display = 'none';

        try {
            const resp = await fetch('/api/lookup', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({url}),
            });
            const data = await resp.json();
            if (data.error) {
                resultDiv.innerHTML = `
                    <div class="result-header">
                        <div class="result-icon error">✗</div>
                        <div class="result-name error-text">Error</div>
                    </div>
                    <div class="result-item full">
                        <div class="result-value">${data.error}</div>
                    </div>`;
            } else {
                const usedPct = data.hosting_capacity_mw > 0
                    ? ((data.res_total_mw / data.hosting_capacity_mw) * 100).toFixed(1)
                    : 0;
                const barColor = usedPct < 75 ? '#34d399' : usedPct < 85 ? '#fbbf24' : usedPct < 95 ? '#fb923c' : '#f87171';
                resultDiv.innerHTML = `
                    <div class="result-header">
                        <div class="result-icon success">⚡</div>
                        <div class="result-name">${data.substation_name_el}</div>
                    </div>
                    <div class="result-grid">
                        <div class="result-item">
                            <div class="result-label">Name (EN)</div>
                            <div class="result-value">${data.substation_name_en}</div>
                        </div>
                        <div class="result-item">
                            <div class="result-label">Substation ID</div>
                            <div class="result-value">${data.substation_id}</div>
                        </div>
                        <div class="result-item">
                            <div class="result-label">Latitude</div>
                            <div class="result-value">${data.lat.toFixed(6)}</div>
                        </div>
                        <div class="result-item">
                            <div class="result-label">Longitude</div>
                            <div class="result-value">${data.lng.toFixed(6)}</div>
                        </div>
                    </div>
                    ${data.hosting_capacity_mw != null ? `
                    <div class="capacity-bar">
                        <div class="result-label">RES Capacity Usage</div>
                        <div class="bar-track">
                            <div class="bar-fill" style="width:${Math.min(usedPct,100)}%;background:${barColor}"></div>
                        </div>
                        <div class="bar-labels">
                            <span style="color:#94a3b8">Used: ${data.res_total_mw?.toFixed(1) ?? '?'} MW</span>
                            <span style="color:#94a3b8">Total: ${data.hosting_capacity_mw?.toFixed(1) ?? '?'} MW</span>
                        </div>
                        <div style="text-align:center;margin-top:6px;font-size:0.85rem;color:${barColor}">
                            ${usedPct}% used — Available: ${data.available_capacity_mw?.toFixed(1) ?? '?'} MW
                        </div>
                    </div>` : ''}
                    <div class="map-links">
                        <a class="map-link" href="https://www.arcgis.com/apps/mapviewer/index.html?webmap=3c33a4647de3416e8f21574ab8a4a0a1&center=${data.lng},${data.lat}&level=13" target="_blank">
                            🗺️ View on EAC Map
                        </a>
                        <a class="map-link" href="https://www.google.com/maps?q=${data.lat},${data.lng}&z=15" target="_blank">
                            📍 Google Maps Pin
                        </a>
                    </div>`;
            }
            resultDiv.style.display = 'block';
        } catch (err) {
            resultDiv.innerHTML = `
                <div class="result-header">
                    <div class="result-icon error">✗</div>
                    <div class="result-name error-text">Connection Error</div>
                </div>
                <div class="result-item full">
                    <div class="result-value">${err.message}</div>
                </div>`;
            resultDiv.style.display = 'block';
        } finally {
            btn.disabled = false;
            btn.textContent = 'Lookup';
        }
    }
    </script>
</body>
</html>
"""


@app.route("/")
def index():
    return render_template_string(HTML_TEMPLATE)


@app.route("/api/lookup", methods=["POST"])
def api_lookup():
    data = request.get_json(force=True)
    url = data.get("url", "").strip()
    if not url:
        return jsonify({"error": "Please provide a URL."}), 400

    try:
        result = lookup_bazaraki_substation(url)
        return jsonify(result)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"Lookup failed: {e}"}), 500


if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 8080))
    debug = os.environ.get("FLASK_ENV") != "production"
    print(f"\n  Bazaraki Substation Lookup")
    print(f"  Open http://localhost:{port} in your browser\n")
    app.run(debug=debug, host="0.0.0.0", port=port)
