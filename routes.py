# routes.py
import os
import csv
from collections import defaultdict
import traceback

from flask import render_template, jsonify, request

# Import the app object and data utility functions from application.py
from application import app, load_gtfs_shapes, get_agency_name_map
# Import the function from your bus script
from buses import fetch_and_filter_bus_positions


@app.route('/')
def index():
    """Renders the main HTML page. The Google Maps API key will be fetched by JS."""
    # The Google Maps API key is no longer passed directly to the template.
    return render_template('index.html')

@app.route('/api/maps_config')
def api_maps_config():
    """Provides the Google Maps API key to the frontend."""
    google_maps_key = app.config.get("GOOGLE_MAPS_API_KEY")
    if not google_maps_key:
        # Log this error server-side for monitoring
        print("ERROR: GOOGLE_MAPS_API_KEY not found in server configuration.")
        return jsonify({"error": "Google Maps API Key not configured on server."}), 500
    return jsonify({"google_maps_api_key": google_maps_key})


@app.route('/api/agencies')
def api_get_agencies():
    agencies = []
    agency_name_map = get_agency_name_map() # Uses the cached map from application.py
    
    gtfs_static_dir = app.config.get("GTFS_STATIC_DIR", 'gtfs_static')
    routes_file = os.path.join(gtfs_static_dir, 'routes2606.txt')
    
    found_agency_ids = set()
    if not os.path.exists(routes_file):
        print(f"ERROR (/api/agencies): {routes_file} not found.")
        return jsonify({"error": f"{os.path.basename(routes_file)} not found"}), 404
    
    try:
        with open(routes_file, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                if row.get('agency_id'):
                    found_agency_ids.add(row['agency_id'])
    except Exception as e:
        print(f"Error reading {os.path.basename(routes_file)} for agencies: {e}")
        traceback.print_exc()
        return jsonify({"error": f"Could not read routes data to determine agencies: {e}"}), 500

    if not found_agency_ids:
        print("WARNING (/api/agencies): No agency_ids found in routes file.")
        return jsonify([])

    for aid in sorted(list(found_agency_ids)):
        agencies.append({
            "id": aid,
            "name": agency_name_map.get(aid, f"Unknown Agency (ID: {aid})")
        })
    return jsonify(agencies)

@app.route('/api/routes_by_agency')
def api_get_routes_by_agency():
    agency_ids_str = request.args.get('agency_ids')
    if not agency_ids_str:
        return jsonify({"error": "agency_ids parameter is required"}), 400
    
    target_agency_ids = set(aid_part.strip() for aid_part in agency_ids_str.split(',') if aid_part.strip())
    if not target_agency_ids:
        return jsonify({"error": "agency_ids parameter was empty or invalid"}), 400

    routes_data = []
    gtfs_static_dir = app.config.get("GTFS_STATIC_DIR", 'gtfs_static')
    routes_file = os.path.join(gtfs_static_dir, 'routes2606.txt')

    if not os.path.exists(routes_file):
        print(f"ERROR (/api/routes_by_agency): {os.path.basename(routes_file)} not found.")
        return jsonify({"error": f"{os.path.basename(routes_file)} not found"}), 404

    try:
        with open(routes_file, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            seen_realtime_ids = set()
            for row in reader:
                agency_id = row.get('agency_id')
                route_short_name = row.get('route_short_name')
                if agency_id in target_agency_ids and route_short_name:
                    realtime_route_id = f"{agency_id}_{route_short_name}"
                    if realtime_route_id in seen_realtime_ids:
                        continue
                    seen_realtime_ids.add(realtime_route_id)
                    
                    routes_data.append({
                        "realtime_id": realtime_route_id,
                        "short_name": route_short_name,
                        "long_name": row.get('route_long_name', ''),
                        "agency_id": agency_id,
                    })
        
        def sort_key_routes(route):
            parts = route['short_name'].split('/')
            try:
                primary_num = int(parts[0])
                return (primary_num, route['short_name'])
            except ValueError:
                return (float('inf'), route['short_name'])
        routes_data.sort(key=sort_key_routes)

    except Exception as e:
        print(f"Error reading {os.path.basename(routes_file)} for routes: {e}")
        traceback.print_exc()
        return jsonify({"error": f"Could not read routes data: {e}"}), 500
        
    return jsonify(routes_data)

@app.route('/api/bus_data')
def get_bus_data():
    selected_routes_str = request.args.get('routes')
    target_routes = set()
    if selected_routes_str:
        target_routes = set(r.strip() for r in selected_routes_str.split(',') if r.strip())

    if not target_routes:
        return jsonify([])

    tfnsw_api_key = app.config.get("TFNSW_API_KEY")
    tfnsw_bus_url = app.config.get("TFNSW_BUS_URL")

    if not tfnsw_api_key or not tfnsw_bus_url:
         print("API Error: TfNSW API Key or URL not configured.")
         return jsonify({"error": "Server configuration error (TfNSW API)"}), 500

    try:
        buses = fetch_and_filter_bus_positions(tfnsw_bus_url, tfnsw_api_key, target_routes)
        if buses is None:
            print("API Error: fetch_and_filter_bus_positions returned None")
            return jsonify({"error": "Failed to fetch or parse bus data from TfNSW"}), 500
        return jsonify(buses)
    except Exception as e:
        print(f"API Exception in /api/bus_data: An unexpected error occurred: {e}")
        traceback.print_exc()
        return jsonify({"error": "An unexpected server error occurred processing bus data"}), 500

@app.route('/api/route_shapes')
def api_get_route_shapes():
    selected_routes_str = request.args.get('routes')
    target_realtime_routes = set()
    if selected_routes_str:
        target_realtime_routes = set(r.strip() for r in selected_routes_str.split(',') if r.strip())

    if not target_realtime_routes:
        return jsonify({})
    
    shapes_data = load_gtfs_shapes(target_realtime_routes)
    return jsonify(shapes_data)