import os
import csv
from collections import defaultdict
from flask import Flask, render_template, jsonify # type: ignore
from dotenv import load_dotenv # type: ignore
import traceback # Import traceback for better error printing


# Import the function from your bus script
from buses import fetch_and_filter_bus_positions

# Load environment variables from .env file
load_dotenv()

# --- Configuration ---
# Get API keys and URL from environment
TFNSW_API_KEY = os.getenv("API_KEY")
TFNSW_BUS_URL = os.getenv("BUS_URL")
GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY")

# Target routes (ensure these are the correct route_ids from TfNSW GTFS static data)
TARGET_ROUTES = {"2606_50", "2606_54", "2606_55", "2606_60", "2606_70", "2606_53","2606_53/3", "2606_57", "2606_64", "2606_5364"}
# TARGET_ROUTES = {"2606_55"}

# --- Constants ---
GTFS_STATIC_DIR = 'gtfs_static' # Folder where you extracted GTFS zip
DATA_REFRESH_INTERVAL_SECONDS = '10'

# --- Global variable to store processed shapes ---
# Structure: { "route_id": [[{lat: y, lng: x}, ...], [{lat: y, lng: x}, ...]], ... }
ROUTE_SHAPES_DATA = defaultdict(list)

def load_gtfs_shapes(target_realtime_routes):
    """
    Processes static GTFS data to extract shapes for target routes,
    mapping via route_short_name.
    Loads data into the global ROUTE_SHAPES_DATA dictionary keyed by REALTIME route ID.
    Returns True on success or partial success, False on critical failure.
    """
    print("Loading GTFS static data (using route_short_name mapping)...")
    gtfs_files_exist = True
    shapes_file = os.path.join(GTFS_STATIC_DIR, 'shapes2606.txt')
    trips_file = os.path.join(GTFS_STATIC_DIR, 'trips2606.txt')
    routes_file = os.path.join(GTFS_STATIC_DIR, 'routes2606.txt')

    # --- Pre-computation: Map target short names to target realtime IDs ---
    target_short_names = set()
    short_name_to_realtime_id = {} # Assumes one realtime ID per short name for simplicity
    for rt_id in target_realtime_routes:
        try:
            # Assuming format like PREFIX_SHORTNAME or just SHORTNAME
            short_name = rt_id.split('_')[-1] if '_' in rt_id else rt_id
            target_short_names.add(short_name)
            # Store the first realtime ID encountered for this short name
            if short_name not in short_name_to_realtime_id:
                short_name_to_realtime_id[short_name] = rt_id
        except Exception as e:
            print(f"Warning: Could not parse short name from target route '{rt_id}': {e}")
            continue # Skip this target route if parsing fails

    if not target_short_names:
        print("ERROR: No valid target short names could be extracted from TARGET_ROUTES.")
        return False

    print(f"Targeting short names: {target_short_names}")
    print(f"Mapping short names back to realtime IDs: {short_name_to_realtime_id}")

    # --- Check required files exist ---
    if not os.path.exists(shapes_file): print(f"ERROR: shapes.txt not found in {GTFS_STATIC_DIR}"); gtfs_files_exist = False
    if not os.path.exists(trips_file): print(f"ERROR: trips.txt not found in {GTFS_STATIC_DIR}"); gtfs_files_exist = False
    if not os.path.exists(routes_file): print(f"ERROR: routes.txt not found in {GTFS_STATIC_DIR}"); gtfs_files_exist = False
    if not gtfs_files_exist: return False

    # --- Step 1: Read routes.txt -> Map short names to STATIC route IDs ---
    short_name_to_static_ids = defaultdict(set)
    static_id_to_short_name = {} # Reverse mapping helpful later
    try:
        with open(routes_file, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            count = 0
            for row in reader:
                 count += 1
                 try:
                      current_short_name = row.get('route_short_name')
                      static_route_id = row.get('route_id')
                      # Check if this route's short name is one we are targeting
                      if current_short_name and static_route_id and current_short_name in target_short_names:
                           short_name_to_static_ids[current_short_name].add(static_route_id)
                           static_id_to_short_name[static_route_id] = current_short_name
                 except KeyError as e:
                      print(f"Warning: Missing expected column '{e}' in routes.txt row: {row}. Skipping.")
                      continue
            print(f"Read {count} routes. Found static IDs for {len(short_name_to_static_ids)} target short names: {short_name_to_static_ids}")
            if not short_name_to_static_ids:
                 print("ERROR: No routes found in routes.txt matching the target short names.")
                 return False # Critical failure if no static routes match
    except Exception as e:
        print(f"ERROR: Failed to read routes.txt: {e}")
        traceback.print_exc()
        return False

    all_relevant_static_ids = set(static_id_to_short_name.keys())
    if not all_relevant_static_ids:
         print("ERROR: Processing routes.txt yielded no relevant static route IDs.")
         return False

    # --- Step 2: Read trips.txt -> Map relevant STATIC route IDs to shape IDs ---
    static_id_to_shape_ids = defaultdict(set)
    try:
        with open(trips_file, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            trip_count = 0
            mapped_trip_count = 0
            for row in reader:
                 trip_count += 1
                 try:
                      static_route_id = row.get('route_id')
                      shape_id = row.get('shape_id')
                      # Check if this trip uses one of the static IDs we care about
                      if static_route_id and shape_id and static_route_id in all_relevant_static_ids:
                           static_id_to_shape_ids[static_route_id].add(shape_id)
                           mapped_trip_count += 1
                 except KeyError as e:
                      print(f"Warning: Missing expected column '{e}' in trips.txt row: {row}. Skipping.")
                      continue
            print(f"Processed {trip_count} trips. Found {mapped_trip_count} trips linking {len(static_id_to_shape_ids)} relevant static routes to shape IDs.")
            if not static_id_to_shape_ids:
                 print("ERROR: No trips found linking relevant static routes to any shape IDs.")
                 # Don't return False here, maybe shapes will be found directly? Proceed but expect empty data.
    except Exception as e:
        print(f"ERROR: Failed to read trips.txt: {e}")
        traceback.print_exc()
        return False # Reading trips failed, can't proceed reliably

    all_relevant_shape_ids = set(s_id for shapes in static_id_to_shape_ids.values() for s_id in shapes)
    if not all_relevant_shape_ids:
         print("WARNING: No relevant shape IDs were found after processing trips. No shapes can be loaded.")
         # Proceed, ROUTE_SHAPES_DATA will remain empty

    # --- Step 3: Read shapes.txt -> Build dictionary of shape points ---
    shape_id_to_points = defaultdict(list)
    try:
        with open(shapes_file, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            point_count = 0
            loaded_point_count = 0
            for row in reader:
                point_count += 1
                try:
                    shape_id = row.get('shape_id')
                    # Only process shapes that are actually needed
                    if shape_id and shape_id in all_relevant_shape_ids:
                        shape_id_to_points[shape_id].append({
                            'lat': float(row['shape_pt_lat']),
                            'lng': float(row['shape_pt_lon']),
                            'seq': int(row['shape_pt_sequence'])
                        })
                        loaded_point_count += 1
                except (ValueError, KeyError, TypeError) as e:
                     # Don't warn for every point, could be millions. Log once?
                     # print(f"Warning: Skipping invalid point in shapes.txt: {row} - Error: {e}")
                     continue
            print(f"Processed {point_count} points from shapes.txt. Loaded {loaded_point_count} points for {len(shape_id_to_points)} relevant shape IDs.")
    except Exception as e:
        print(f"ERROR: Failed to read shapes.txt: {e}")
        traceback.print_exc()
        return False

    # Sort points within each shape and keep only lat/lng
    processed_shape_points = {} # Store final points keyed by shape_id
    for shape_id in list(shape_id_to_points.keys()): # Iterate over keys copy
        try:
             points = shape_id_to_points[shape_id]
             points.sort(key=lambda p: p['seq'])
             final_points = [{'lat': p['lat'], 'lng': p['lng']} for p in points]
             if final_points and len(final_points) >= 2: # Only keep shapes with at least 2 valid points
                processed_shape_points[shape_id] = final_points
             # else:
             #    print(f"Debug: Shape {shape_id} removed as it had less than 2 valid points after sorting.")
        except Exception as e:
            print(f"Warning: Error processing points for shape_id {shape_id}: {e}. Discarding shape.")
            continue # Skip this shape

    if not processed_shape_points:
         print("WARNING: No valid shape coordinate lists were generated after processing shapes.txt.")
         # Proceed, ROUTE_SHAPES_DATA will remain empty

    # --- Step 4: Assemble final ROUTE_SHAPES_DATA keyed by REALTIME route ID ---
    global ROUTE_SHAPES_DATA
    ROUTE_SHAPES_DATA.clear()
    final_routes_with_shapes = set()
    shapes_added_count = 0
    unique_shapes_added = set() # Track unique shape lists added per realtime_id

    # Iterate through the original target short names
    for short_name in target_short_names:
        realtime_id = short_name_to_realtime_id.get(short_name)
        if not realtime_id: continue # Should not happen if parsed correctly

        static_ids = short_name_to_static_ids.get(short_name, set())
        if not static_ids: continue # No static routes matched this short name

        # Use a temporary set for this realtime_id to store tuples of points (hashable) to ensure uniqueness
        shapes_for_this_realtime_id = set()

        for static_id in static_ids:
            shape_ids = static_id_to_shape_ids.get(static_id, set())
            for shape_id in shape_ids:
                if shape_id in processed_shape_points:
                    point_list = processed_shape_points[shape_id]
                    # Convert list of dicts to tuple of tuples to make it hashable for the set
                    point_tuple = tuple(tuple(p.items()) for p in point_list)
                    shapes_for_this_realtime_id.add(point_tuple)
                    unique_shapes_added.add(shape_id) # Track overall unique shapes used
                # else:
                    # Shape wasn't processed correctly or wasn't relevant
                    # print(f"Debug: Shape {shape_id} for static route {static_id} not found in processed shapes.")

        if shapes_for_this_realtime_id:
             final_routes_with_shapes.add(realtime_id)
             # Convert back from tuple of tuples to list of dicts for JSON
             ROUTE_SHAPES_DATA[realtime_id] = [
                 [dict(p) for p in point_tuple] for point_tuple in shapes_for_this_realtime_id
             ]
             shapes_added_count += len(shapes_for_this_realtime_id)


    if not ROUTE_SHAPES_DATA:
        print("WARNING: ROUTE_SHAPES_DATA is empty after final assembly. No route shapes will be displayed.")
    else:
        print(f"Successfully loaded {shapes_added_count} unique shape paths (from {len(unique_shapes_added)} unique shape IDs) for {len(final_routes_with_shapes)} target routes into ROUTE_SHAPES_DATA.")
        # Example: print(f"Data for {list(ROUTE_SHAPES_DATA.keys())[0]}: {len(ROUTE_SHAPES_DATA[list(ROUTE_SHAPES_DATA.keys())[0]])} shapes")

    return True # Indicate function completed, even if some routes have no shapes


# --- Flask App Setup ---
app = Flask(__name__)

# --- Load GTFS Data ONCE on startup ---
print("-----------------------------------------------------")
if not load_gtfs_shapes(TARGET_ROUTES):
     print("*****************************************************")
     print("WARNING: Failed to load GTFS shapes properly.")
     print("Check GTFS files exist in 'gtfs_static' directory and are valid.")
     print("Route paths may not be available on the map.")
     print("*****************************************************")
else:
     print("GTFS shapes loaded successfully.")
print("-----------------------------------------------------")
# --- End Load GTFS Data ---

# --- Routes ---
@app.route('/')
def index():
    """Renders the main HTML page with the map."""
    if not GOOGLE_MAPS_API_KEY:
        return "Error: Google Maps API Key not configured in .env file.", 500
    # Pass the Google Maps API key to the template
    # return render_template('index.html', google_maps_api_key=GOOGLE_MAPS_API_KEY)
    # Prepare the route list for display
    # Extracts the part after '_' if present, otherwise uses the whole ID
    # Sorts them numerically if possible, otherwise alphabetically
    route_short_names = []
    for r in TARGET_ROUTES:
        parts = r.split('_')
        short_name = parts[-1] if len(parts) > 1 else r # Get last part or whole string
        route_short_names.append(short_name)

    # Try sorting numerically, fallback to string sort if conversion fails
    try:
        sorted_routes = sorted(route_short_names, key=int)
    except ValueError:
        sorted_routes = sorted(route_short_names)

    routes_display_string = ", ".join(sorted_routes)
    
    

    # Pass the Google Maps API key AND the routes string to the template
    return render_template(
        'index.html',
        google_maps_api_key=GOOGLE_MAPS_API_KEY,
        tracked_routes_display=routes_display_string,    # Pass the processed string
        remaining_time=DATA_REFRESH_INTERVAL_SECONDS     # time to refresh 
    )
    
@app.route('/api/bus_data')
def get_bus_data():
    """API endpoint to fetch and return filtered bus data as JSON."""
    print("API: Fetching bus data...") # Log when this endpoint is hit
    if not TFNSW_API_KEY or not TFNSW_BUS_URL:
         print("API Error: TfNSW API Key or URL not configured.")
         return jsonify({"error": "Server configuration error (TfNSW API)"}), 500

    try:
        # Call the imported function
        buses = fetch_and_filter_bus_positions(TFNSW_BUS_URL, TFNSW_API_KEY, TARGET_ROUTES)

        if buses is None:
            # Function indicated an error during fetch/parse
            print("API Error: fetch_and_filter_bus_positions returned None")
            return jsonify({"error": "Failed to fetch or parse bus data from TfNSW"}), 500
        else:
            pass
            # print(f"API: Found {len(buses)} buses.... (later)")
            #  # Make sure latitude/longitude are numbers, filter out buses without valid coords
            # valid_buses = [
            #     bus for bus in buses
            #     if bus.get('latitude') is not None and bus.get('longitude') is not None
            # ]
            # print(f"API: Returning {len(valid_buses)} buses with valid coordinates.")

            # for bus in buses:
            #     # --- MODIFIED LINE ---
            #     # Use .get('timestamp') which returns None if key is missing
            #     timestamp_obj = bus.get('timestamp')
            #     time_str = timestamp_obj.strftime('%H:%M:%S') if timestamp_obj else 'No Timestamp'
            #     # --- END MODIFIED LINE ---

            #     # Use .get() for lat/lon as well for extra safety
            #     lat = bus.get('latitude')
            #     lon = bus.get('longitude')
            #     lat_str = f"{lat:.5f}" if lat is not None else 'N/A'
            #     lon_str = f"{lon:.5f}" if lon is not None else 'N/A'

            #     # Use .get() for speed and vehicle_id
            #     speed_str = bus.get('speed', 'N/A') # Provide default directly
            #     vehicle_id_str = bus.get('vehicle_id', 'N/A')
            #     route_id_str = bus.get('route_id', 'N/A')


            #     print(f"Route: {route_id_str:<10} | Vehicle: {vehicle_id_str:<8} | " # Adjusted padding
            #           f"Lat: {lat_str:<10} | Lon: {lon_str:<11} | "
            #           f"Speed: {speed_str:<10} | Time: {time_str}")

            # return jsonify(valid_buses) # Return the list of bus dicts as JSON
            return jsonify(buses) # Return the list of bus dicts as JSON

    except Exception as e:
        print(f"API Exception: An unexpected error occurred: {e}")
        # Log the full exception for debugging if needed
        print(f"API Exception in /api/bus_data: An unexpected error occurred: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": "An unexpected server error occurred processing bus data"}), 500

@app.route('/api/route_shapes')
def get_route_shapes():
    """API endpoint to return the pre-loaded route shape data."""
    # print("API Request: /api/route_shapes") # Keep console less noisy
    # ROUTE_SHAPES_DATA is the global dict populated on startup
    if not ROUTE_SHAPES_DATA:
        # This can happen if GTFS loading failed or found no shapes for target routes
        print("API Warning: Route shapes requested, but ROUTE_SHAPES_DATA is empty or loading failed.")
        return jsonify({}) # Return empty object, let frontend handle it gracefully
    return jsonify(ROUTE_SHAPES_DATA)

# --- Run the App ---
if __name__ == '__main__':
    # Debug=True automatically reloads on code changes
    # Use host='0.0.0.0' to make it accessible on your network (optional)
    app.run(debug=True, host='0.0.0.0', port=5000)