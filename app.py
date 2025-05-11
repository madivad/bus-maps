# app.py
import os
import csv
from collections import defaultdict
from flask import Flask, render_template, jsonify, request # Added request
from dotenv import load_dotenv # type: ignore
import traceback # Import traceback for better error printing


# Import the function from your bus script
from buses import fetch_and_filter_bus_positions

# Load environment variables from .env file
load_dotenv()

# --- Configuration ---
TFNSW_API_KEY = os.getenv("API_KEY")
TFNSW_BUS_URL = "https://api.transport.nsw.gov.au/v1/gtfs/vehiclepos/buses" # BUS_URL = os.getenv("BUS_URL")
GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY")

# --- Constants ---
GTFS_STATIC_DIR = 'gtfs_static'

# --- Helper to load agency data (can be cached simply) ---
_agency_data_cache = None
def get_agency_name_map():
    global _agency_data_cache
    if _agency_data_cache is None:
        _agency_data_cache = {}
        agency_file = os.path.join(GTFS_STATIC_DIR, 'agency.txt')
        if os.path.exists(agency_file):
            try:
                with open(agency_file, 'r', encoding='utf-8-sig') as f_agency: # Renamed to avoid conflict
                    reader = csv.DictReader(f_agency)
                    for row in reader:
                        _agency_data_cache[row['agency_id']] = row['agency_name']
                print(f"Agency name map loaded with {len(_agency_data_cache)} entries.")
            except Exception as e:
                print(f"Error reading agency.txt: {e}")
                traceback.print_exc()
        else:
            print(f"Warning: agency.txt not found at {agency_file}")
    return _agency_data_cache

def load_gtfs_shapes(target_realtime_routes: set):
    """
    Processes static GTFS data to extract shapes for the given target_realtime_routes.
    Returns a dictionary: { "realtime_route_id": [[{lat: y, lng: x}, ...]], ... }
    or an empty dictionary if no shapes are found or errors occur.
    """
    if not target_realtime_routes:
        print("load_gtfs_shapes: No target routes provided, returning empty shapes.")
        return {}

    print(f"Loading GTFS shapes for {len(target_realtime_routes)} target routes: {target_realtime_routes}")
    # This function will read GTFS files. Consider performance implications for large datasets
    # if called frequently without further caching of intermediate file reads.

    # Initialize a local dictionary for this request's results
    route_shapes_for_this_request = defaultdict(list)

    gtfs_files_exist = True
    shapes_file = os.path.join(GTFS_STATIC_DIR, 'shapes2606.txt')
    trips_file = os.path.join(GTFS_STATIC_DIR, 'trips2606.txt')
    routes_file_path = os.path.join(GTFS_STATIC_DIR, 'routes2606.txt') # Renamed variable

    # --- Pre-computation: Map target short names to target realtime IDs ---
    target_short_names = set()
    short_name_to_realtime_id = {}
    agency_id_from_realtime_route = {} # Store agency_id part: "2606_50" -> "2606"

    for rt_id in target_realtime_routes:
        try:
            parts = rt_id.split('_', 1) # Split only on the first underscore
            if len(parts) == 2:
                agency_id, short_name = parts
                target_short_names.add(short_name)
                agency_id_from_realtime_route[rt_id] = agency_id
                # Store the first realtime ID encountered for this (agency_id, short_name) pair
                # This assumes short_name is unique *within an agency_id* from the perspective of target_realtime_routes
                if (agency_id, short_name) not in short_name_to_realtime_id:
                     short_name_to_realtime_id[(agency_id, short_name)] = rt_id
            else: # Handle cases like "55" if they are ever passed directly
                short_name = rt_id
                target_short_names.add(short_name)
                # For short_name only, we can't determine agency_id here.
                # This might need adjustment if such rt_id formats are common.
                # For now, assume "AGENCY_SHORTNAME" format.
                if short_name not in short_name_to_realtime_id:
                     short_name_to_realtime_id[short_name] = rt_id # Legacy key, might need refinement
        except Exception as e:
            print(f"Warning: Could not parse agency/short name from target route '{rt_id}': {e}")
            continue

    if not target_short_names:
        print("load_gtfs_shapes: No valid target short names could be extracted.")
        return {}

    # print(f"Targeting short names: {target_short_names}")
    # print(f"Mapping (agency, short_name) back to realtime IDs: {short_name_to_realtime_id}")


    # --- Check required files exist ---
    if not os.path.exists(shapes_file): print(f"ERROR (load_gtfs_shapes): shapes2606.txt not found"); return {}
    if not os.path.exists(trips_file): print(f"ERROR (load_gtfs_shapes): trips2606.txt not found"); return {}
    if not os.path.exists(routes_file_path): print(f"ERROR (load_gtfs_shapes): routes2606.txt not found"); return {}

    # --- Step 1: Read routes.txt -> Map (agency_id, short_name) to STATIC route IDs ---
    # This map helps associate a specific agency's short_name with its static route_ids
    agency_short_name_to_static_ids = defaultdict(set)
    static_id_to_agency_short_name = {} # Reverse mapping

    try:
        with open(routes_file_path, 'r', encoding='utf-8-sig') as f_routes: # Renamed
            reader = csv.DictReader(f_routes)
            for row in reader:
                 try:
                      current_short_name = row.get('route_short_name')
                      static_route_id = row.get('route_id')
                      current_agency_id = row.get('agency_id')

                      # Only consider routes whose agency_id and short_name pair is targeted
                      if current_agency_id and current_short_name and static_route_id and \
                         current_short_name in target_short_names and \
                         short_name_to_realtime_id.get((current_agency_id, current_short_name)): # Check if this combo is in our targets
                           agency_short_name_to_static_ids[(current_agency_id, current_short_name)].add(static_route_id)
                           static_id_to_agency_short_name[static_route_id] = (current_agency_id, current_short_name)
                 except KeyError as e:
                      print(f"Warning (load_gtfs_shapes): Missing column '{e}' in routes.txt row. Skipping.")
                      continue
            # print(f"Found static IDs for {len(agency_short_name_to_static_ids)} target (agency, short_name) pairs.")
            if not agency_short_name_to_static_ids:
                 print("ERROR (load_gtfs_shapes): No routes found in routes.txt matching target (agency, short_name)s.")
                 return {}
    except Exception as e:
        print(f"ERROR (load_gtfs_shapes): Failed to read routes.txt: {e}")
        traceback.print_exc()
        return {}

    all_relevant_static_ids = set(static_id_to_agency_short_name.keys())
    if not all_relevant_static_ids:
         print("ERROR (load_gtfs_shapes): Processing routes.txt yielded no relevant static route IDs.")
         return {}

    # --- Step 2: Read trips.txt -> Map relevant STATIC route IDs to shape IDs ---
    static_id_to_shape_ids = defaultdict(set)
    try:
        with open(trips_file, 'r', encoding='utf-8-sig') as f_trips: # Renamed
            reader = csv.DictReader(f_trips)
            for row in reader:
                 try:
                      static_route_id = row.get('route_id')
                      shape_id = row.get('shape_id')
                      if static_route_id and shape_id and static_route_id in all_relevant_static_ids:
                           static_id_to_shape_ids[static_route_id].add(shape_id)
                 except KeyError as e:
                      print(f"Warning (load_gtfs_shapes): Missing column '{e}' in trips.txt row. Skipping.")
                      continue
            # print(f"Found trips linking {len(static_id_to_shape_ids)} relevant static routes to shape IDs.")
    except Exception as e:
        print(f"ERROR (load_gtfs_shapes): Failed to read trips.txt: {e}")
        traceback.print_exc()
        return {}

    all_relevant_shape_ids = set(s_id for shapes in static_id_to_shape_ids.values() for s_id in shapes)
    if not all_relevant_shape_ids:
         print("WARNING (load_gtfs_shapes): No relevant shape IDs found after processing trips.")
         return {}

    # --- Step 3: Read shapes.txt -> Build dictionary of shape points ---
    shape_id_to_points = defaultdict(list)
    try:
        with open(shapes_file, 'r', encoding='utf-8-sig') as f_shapes: # Renamed
            reader = csv.DictReader(f_shapes)
            for row in reader:
                try:
                    shape_id = row.get('shape_id')
                    if shape_id and shape_id in all_relevant_shape_ids:
                        shape_id_to_points[shape_id].append({
                            'lat': float(row['shape_pt_lat']),
                            'lng': float(row['shape_pt_lon']),
                            'seq': int(row['shape_pt_sequence'])
                        })
                except (ValueError, KeyError, TypeError):
                     continue
            # print(f"Loaded points for {len(shape_id_to_points)} relevant shape IDs.")
    except Exception as e:
        print(f"ERROR (load_gtfs_shapes): Failed to read shapes.txt: {e}")
        traceback.print_exc()
        return {}

    processed_shape_points = {}
    for shape_id in list(shape_id_to_points.keys()):
        try:
             points = shape_id_to_points[shape_id]
             points.sort(key=lambda p: p['seq'])
             final_points = [{'lat': p['lat'], 'lng': p['lng']} for p in points]
             if final_points and len(final_points) >= 2:
                processed_shape_points[shape_id] = final_points
        except Exception as e:
            print(f"Warning (load_gtfs_shapes): Error processing points for shape_id {shape_id}: {e}.")
            continue

    if not processed_shape_points:
         print("WARNING (load_gtfs_shapes): No valid shape coordinate lists generated.")
         return {}

    # --- Step 4: Assemble final route_shapes_for_this_request keyed by REALTIME route ID ---
    # Iterate through the original target_realtime_routes passed to the function
    for realtime_id in target_realtime_routes:
        agency_id_part = agency_id_from_realtime_route.get(realtime_id)
        # Extract short_name again, or use a pre-parsed map if available
        short_name_part = None
        if agency_id_part:
            short_name_part = realtime_id[len(agency_id_part)+1:] # "2606_50" -> "50"

        if not agency_id_part or not short_name_part:
            # print(f"Debug: Could not determine agency/short_name for {realtime_id}, skipping.")
            continue

        # Find the (agency_id, short_name) key used in our maps
        lookup_key = (agency_id_part, short_name_part)

        static_ids_for_key = agency_short_name_to_static_ids.get(lookup_key, set())
        if not static_ids_for_key:
            # print(f"Debug: No static IDs found for key {lookup_key} (realtime_id: {realtime_id})")
            continue

        shapes_for_this_realtime_id = set() # Using set of tuples to ensure unique shape paths

        for static_id in static_ids_for_key:
            shape_ids_for_static_route = static_id_to_shape_ids.get(static_id, set())
            for shape_id in shape_ids_for_static_route:
                if shape_id in processed_shape_points:
                    point_list = processed_shape_points[shape_id]
                    point_tuple = tuple(tuple(p.items()) for p in point_list) # Make hashable
                    shapes_for_this_realtime_id.add(point_tuple)

        if shapes_for_this_realtime_id:
             route_shapes_for_this_request[realtime_id] = [
                 [dict(p) for p in point_tuple] for point_tuple in shapes_for_this_realtime_id
             ]

    if not route_shapes_for_this_request:
        print(f"WARNING (load_gtfs_shapes): route_shapes_for_this_request is empty for targets: {target_realtime_routes}")
    else:
        print(f"Successfully generated shapes for {len(route_shapes_for_this_request)} of the {len(target_realtime_routes)} requested routes.")

    return dict(route_shapes_for_this_request) # Convert back to dict from defaultdict for cleaner JSON

# --- Flask App Setup ---
app = Flask(__name__)

# --- GTFS Data Loading is now on-demand via API calls ---
print("-----------------------------------------------------")
print("GTFS static data will be loaded on-demand per API request.")
print("Ensure GTFS files exist in 'gtfs_static' directory.")
# Initialize agency name map once at startup
get_agency_name_map()
print("-----------------------------------------------------")

# --- Routes ---
@app.route('/')
def index():
    """Renders the main HTML page with the map."""
    if not GOOGLE_MAPS_API_KEY:
        return "Error: Google Maps API Key not configured in .env file.", 500
    # tracked_routes_display is now handled by JavaScript
    return render_template('index.html', google_maps_api_key=GOOGLE_MAPS_API_KEY)

@app.route('/api/agencies')
def api_get_agencies():
    agencies = []
    agency_name_map = get_agency_name_map() # Use cached map
    # Determine unique agency_ids from routes2606.txt
    # (In future, this would be routes.txt for all operators)
    routes_file = os.path.join(GTFS_STATIC_DIR, 'routes2606.txt')
    
    found_agency_ids = set()
    if not os.path.exists(routes_file):
        print(f"ERROR (/api/agencies): {routes_file} not found.")
        return jsonify({"error": f"{routes_file} not found"}), 404
    
    try:
        with open(routes_file, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                if row.get('agency_id'):
                    found_agency_ids.add(row['agency_id'])
    except Exception as e:
        print(f"Error reading {routes_file} for agencies: {e}")
        traceback.print_exc()
        return jsonify({"error": f"Could not read routes data to determine agencies: {e}"}), 500

    if not found_agency_ids:
        print("WARNING (/api/agencies): No agency_ids found in routes file.")
        return jsonify([]) # Return empty list if no agencies derived

    for aid in sorted(list(found_agency_ids)): # Sort for consistent order
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
    # (In future, this would be routes.txt for all operators)
    routes_file = os.path.join(GTFS_STATIC_DIR, 'routes2606.txt')

    if not os.path.exists(routes_file):
        print(f"ERROR (/api/routes_by_agency): {routes_file} not found.")
        return jsonify({"error": f"{routes_file} not found"}), 404

    try:
        with open(routes_file, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            seen_realtime_ids = set() # To avoid duplicates if any static routes map to same realtime_id
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
                        # "static_route_id": row.get('route_id') # Optional: for debugging
                    })
        
        # Sort routes for consistent display, e.g., by short_name (numerically if possible)
        def sort_key_routes(route):
            # Attempt to sort numerically on the main part of short_name
            # Handles "53" and "53/3" by primary number, then by full string for sub-routes
            parts = route['short_name'].split('/')
            try:
                primary_num = int(parts[0])
                return (primary_num, route['short_name'])
            except ValueError:
                return (float('inf'), route['short_name']) # Non-numeric names last

        routes_data.sort(key=sort_key_routes)

    except Exception as e:
        print(f"Error reading {routes_file} for routes: {e}")
        traceback.print_exc()
        return jsonify({"error": f"Could not read routes data: {e}"}), 500
        
    return jsonify(routes_data)

@app.route('/api/bus_data')
def get_bus_data():
    """API endpoint to fetch and return filtered bus data as JSON."""
    selected_routes_str = request.args.get('routes')
    
    target_routes = set()
    if selected_routes_str: # If routes param exists and is not empty
        target_routes = set(r.strip() for r in selected_routes_str.split(',') if r.strip())

    if not target_routes:
        # print("API: /api/bus_data - No specific routes selected or provided. Returning no buses.")
        return jsonify([]) # Return empty list if no routes are specified

    # print(f"API: Fetching bus data for routes: {target_routes}")
    if not TFNSW_API_KEY or not TFNSW_BUS_URL:
         print("API Error: TfNSW API Key or URL not configured.")
         return jsonify({"error": "Server configuration error (TfNSW API)"}), 500

    try:
        buses = fetch_and_filter_bus_positions(TFNSW_BUS_URL, TFNSW_API_KEY, target_routes)
        if buses is None:
            print("API Error: fetch_and_filter_bus_positions returned None")
            return jsonify({"error": "Failed to fetch or parse bus data from TfNSW"}), 500
        # print(f"API: Returning {len(buses)} buses.")
        return jsonify(buses)

    except Exception as e:
        print(f"API Exception in /api/bus_data: An unexpected error occurred: {e}")
        traceback.print_exc()
        return jsonify({"error": "An unexpected server error occurred processing bus data"}), 500

@app.route('/api/route_shapes')
def api_get_route_shapes(): # Renamed function to avoid conflict
    """API endpoint to return route shape data for specified routes."""
    selected_routes_str = request.args.get('routes')
    
    target_realtime_routes = set()
    if selected_routes_str: # If routes param exists and is not empty
        target_realtime_routes = set(r.strip() for r in selected_routes_str.split(',') if r.strip())

    if not target_realtime_routes:
        # print("API: /api/route_shapes - No specific routes selected. Returning no shapes.")
        return jsonify({}) # Return empty object if no routes are specified

    # Call the modified load_gtfs_shapes function
    # This will read and process GTFS files for the requested routes.
    shapes_data = load_gtfs_shapes(target_realtime_routes)
    
    # shapes_data will be an empty dict if load_gtfs_shapes failed or found nothing
    return jsonify(shapes_data)

# --- Run the App ---
if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)