import os
import csv
from collections import defaultdict
from flask import Flask, render_template, jsonify, request # type: ignore # Import request
from dotenv import load_dotenv # type: ignore
import traceback

# Import the function from your bus script
from bus2 import fetch_and_filter_bus_positions

# Load environment variables from .env file
load_dotenv()

# --- Configuration ---
# Get API keys and URL from environment
TFNSW_API_KEY = os.getenv("API_KEY")
TFNSW_BUS_URL = os.getenv("BUS_URL")
GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY")

# Target routes (initial selection for checkboxes, but sidebar lists all)
# Format: REALTIME_ID (e.g., "2606_55")
TARGET_ROUTES_INITIAL_SELECTION = {"2606_50", "2606_54", "2606_55", "2606_60", "2606_70", "2606_53","2606_53/3", "2606_57", "2606_64", "2606_5364"}

# --- Constants ---
GTFS_STATIC_DIR = 'gtfs_static' # Folder where you extracted GTFS zip
DEFAULT_AGENCY_PREFIX = "2606_" # Used to infer realtime ID from static short name

# --- Global variables to store processed data ---
# Structure: { "realtime_route_id": [[{lat: y, lng: x}, ...], ...], ... }
ROUTE_SHAPES_DATA = defaultdict(list)

# Structure: [{short_name: "55", long_name: "...", color: "#...", realtime_id: "2606_55"}, ...]
ALL_ROUTE_METADATA_LIST = [] # List for the API endpoint

# Mapping static_route_id to its metadata
STATIC_ID_METADATA = {} # {static_id: {short_name, long_name, color, realtime_id}}


def load_gtfs_data():
    """
    Processes static GTFS data to extract metadata for all routes
    and shapes for routes that have associated trips and shapes.
    Loads data into global dictionaries.
    Returns True on success or partial success, False on critical failure.
    """
    print("Loading GTFS static data...")
    gtfs_files_exist = True
    shapes_file = os.path.join(GTFS_STATIC_DIR, 'shapes2606.txt')
    trips_file = os.path.join(GTFS_STATIC_DIR, 'trips2606.txt')
    routes_file = os.path.join(GTFS_STATIC_DIR, 'routes2606.txt')

    # --- Check required files exist ---
    if not os.path.exists(shapes_file): print(f"ERROR: shapes.txt not found in {GTFS_STATIC_DIR}"); gtfs_files_exist = False
    if not os.path.exists(trips_file): print(f"ERROR: trips.txt not found in {GTFS_STATIC_DIR}"); gtfs_files_exist = False
    if not os.path.exists(routes_file): print(f"ERROR: routes.txt not found in {GTFS_STATIC_DIR}"); gtfs_files_exist = False
    if not gtfs_files_exist: return False

    global ALL_ROUTE_METADATA_LIST
    global STATIC_ID_METADATA
    global ROUTE_SHAPES_DATA

    ALL_ROUTE_METADATA_LIST = []
    STATIC_ID_METADATA = {}
    ROUTE_SHAPES_DATA = defaultdict(list) # Will be populated later

    # --- Step 1: Read routes.txt -> Extract metadata for ALL routes ---
    short_name_to_static_ids = defaultdict(set)
    all_static_route_ids = set()
    try: # <--- This try block starts around line 71
        with open(routes_file, 'r', encoding='utf-8-sig') as f: # <--- This is inside the try block (around line 77)
            reader = csv.DictReader(f)
            count = 0
            for row in reader: # <--- This loop is inside the try block (around line 78)
                 count += 1
                 # No nested try...except KeyError here, as .get() is used below
                 static_route_id = row.get('route_id')
                 short_name = row.get('route_short_name')
                 long_name = row.get('route_long_name')
                 color = row.get('route_color', '00B5EF') # Default color if missing

                 if static_route_id and short_name:
                      all_static_route_ids.add(static_route_id)
                      short_name_to_static_ids[short_name].add(static_route_id)

                      # Infer a potential realtime ID format (e.g., 2606_55 from short name 55)
                      # This might not be perfect for all data sets but matches observed patterns
                      inferred_realtime_id = f"{DEFAULT_AGENCY_PREFIX}{short_name}"
                      # Handle cases where short name already includes prefix part or is complex like '53/3'
                      if short_name and short_name.startswith(DEFAULT_AGENCY_PREFIX.rstrip('_')):
                           inferred_realtime_id = short_name
                      elif '/' in short_name:
                           inferred_realtime_id = f"{DEFAULT_AGENCY_PREFIX}{short_name}"


                      STATIC_ID_METADATA[static_route_id] = {
                          'short_name': short_name,
                          'long_name': long_name if long_name else short_name,
                          'color': f"#{color}" if color and color and not color.startswith('#') else (color if color else '#00B5EF'), # Ensure # prefix
                          'realtime_id': inferred_realtime_id # Store inferred ID
                      }

            # Create the list for the API, ensuring unique realtime_ids
            # Use a dictionary to group by inferred_realtime_id and pick one entry
            routes_by_realtime_id = {}
            for static_meta in STATIC_ID_METADATA.values():
                 rt_id = static_meta['realtime_id']
                 if rt_id not in routes_by_realtime_id:
                      routes_by_realtime_id[rt_id] = {
                           'realtime_id': rt_id,
                           'short_name': static_meta['short_name'],
                           'long_name': static_meta['long_name'],
                           'color': static_meta['color']
                      }
                 # Optional: Merge long names if multiple static IDs map to same inferred realtime ID?
                 # For simplicity, we'll just use the first one encountered for the list.
            ALL_ROUTE_METADATA_LIST = list(routes_by_realtime_id.values())
            # Sort the list by short name (try int first, fallback to string)
            try:
                 ALL_ROUTE_METADATA_LIST.sort(key=lambda x: int(x.get('short_name')))
            except (ValueError, TypeError): # Handle cases where short name isn't purely numeric
                 ALL_ROUTE_METADATA_LIST.sort(key=lambda x: x.get('short_name'))


            print(f"Read {count} routes. Found metadata for {len(STATIC_ID_METADATA)} unique static route IDs.")
            if not ALL_ROUTE_METADATA_LIST:
                 print("ERROR: No valid route metadata found in routes.txt.")
                 return False # Critical failure
    except Exception as e: # <--- This except block closes the try block started around line 71
        print(f"ERROR: Failed to read routes.txt: {e}")
        traceback.print_exc()
        return False

    # --- Step 2: Read trips.txt -> Map ALL relevant STATIC route IDs to shape IDs ---
    # Now we care about trips linked to *any* static route ID we read in step 1
    # No need for all_relevant_static_ids as it's the same as STATIC_ID_METADATA keys
    static_id_to_shape_ids = defaultdict(set)
    relevant_shape_ids = set()
    try: # <--- This try block starts around line 135
        with open(trips_file, 'r', encoding='utf-8-sig') as f: # <--- This is inside this try block (around line 136)
            reader = csv.DictReader(f)
            trip_count = 0
            mapped_trip_count = 0
            for row in reader:
                 trip_count += 1
                 try: # <--- Nested try for row processing (around line 141)
                      static_route_id = row.get('route_id')
                      shape_id = row.get('shape_id')
                      # Check if this trip uses one of the static IDs we care about (all of them now)
                      if static_route_id and shape_id and static_route_id in STATIC_ID_METADATA: # Use STATIC_ID_METADATA keys
                           static_id_to_shape_ids[static_route_id].add(shape_id)
                           relevant_shape_ids.add(shape_id)
                           mapped_trip_count += 1
                 except KeyError as e: # <--- This except closes the nested try (around line 151)
                      # print(f"Warning: Missing expected column '{e}' in trips.txt row: {row}. Skipping.") # Too noisy
                      continue
            print(f"Processed {trip_count} trips. Found {mapped_trip_count} trips linking {len(static_id_to_shape_ids)} static routes to shape IDs.")
            if not static_id_to_shape_ids:
                 print("WARNING: No trips found linking static routes to any shape IDs.")
                 # Don't return False, maybe shapes exist independently (unlikely but possible GTFS variation)
    except Exception as e: # <--- This except block closes the try block started around line 135
        print(f"ERROR: Failed to read trips.txt: {e}")
        traceback.print_exc()
        # Decide if this is critical. If no trips, no shapes via trips.
        # Let's allow it to proceed, but shapes will likely be empty.
        # return False # Or just print warning

    if not relevant_shape_ids:
         print("WARNING: No relevant shape IDs were found after processing trips. No shapes can be loaded from shapes.txt.")


    # --- Step 3: Read shapes.txt -> Build dictionary of shape points for relevant shapes ---
    shape_id_to_points = defaultdict(list)
    try: # <--- This try block starts around line 168
        with open(shapes_file, 'r', encoding='utf-8-sig') as f: # <--- This is inside this try block (around line 169)
            reader = csv.DictReader(f)
            point_count = 0
            loaded_point_count = 0
            for row in reader: # <--- This loop is inside the try block (around line 171)
                point_count += 1
                try: # <--- Nested try for row processing (around line 174)
                    shape_id = row.get('shape_id')
                    # Only process shapes that are actually needed
                    if shape_id and shape_id in relevant_shape_ids:
                        shape_id_to_points[shape_id].append({
                            'lat': float(row['shape_pt_lat']), # Note: Accessing directly potentially raises KeyError if column is missing
                            'lng': float(row['shape_pt_lon']),
                            'seq': int(row['shape_pt_sequence'])
                        })
                        loaded_point_count += 1
                except (ValueError, KeyError, TypeError) as e: # <--- This except closes the nested try (around line 184)
                     # print(f"Warning: Skipping invalid point in shapes.txt: {row} - Error: {e}") # Too noisy
                     continue
            print(f"Processed {point_count} points from shapes.txt. Loaded {loaded_point_count} points for {len(shape_id_to_points)} relevant shape IDs.")
    except Exception as e: # <--- This except block closes the try block started around line 168
        print(f"ERROR: Failed to read shapes.txt: {e}")
        traceback.print_exc()
        return False # Reading shapes failed, can't provide shape data

    # Sort points within each shape and keep only lat/lng
    processed_shape_points = {} # Store final points keyed by shape_id
    for shape_id in list(shape_id_to_points.keys()): # Iterate over keys copy
        try: # <--- Nested try for shape processing (around line 199)
             points = shape_id_to_points[shape_id]
             points.sort(key=lambda p: p['seq'])
             final_points = [{'lat': p['lat'], 'lng': p['lng']} for p in points]
             if final_points and len(final_points) >= 2: # Only keep shapes with at least 2 valid points
                processed_shape_points[shape_id] = final_points
        except Exception as e: # <--- This except closes the nested try (around line 209)
            print(f"Warning: Error processing points for shape_id {shape_id}: {e}. Discarding shape.")
            continue # Skip this shape


    if not processed_shape_points:
         print("WARNING: No valid shape coordinate lists were generated after processing shapes.txt.")
         # Proceed, ROUTE_SHAPES_DATA will remain empty or sparse

    # --- Step 4: Assemble ROUTE_SHAPES_DATA keyed by INFERRED REALTIME route ID ---
    shapes_added_count = 0
    unique_shapes_added = set() # Track unique shape lists added overall

    # Iterate through the mapping of static IDs to shape IDs
    # We need to map static_id -> inferred_realtime_id -> shapes
    realtime_id_to_shapes_temp = defaultdict(set) # Use a set of tuples to ensure uniqueness per realtime ID

    for static_id, shape_ids in static_id_to_shape_ids.items():
         static_meta = STATIC_ID_METADATA.get(static_id)
         if not static_meta: continue # Should not happen

         inferred_realtime_id = static_meta['realtime_id']

         for shape_id in shape_ids:
              if shape_id in processed_shape_points:
                   point_list = processed_shape_points[shape_id]
                   point_tuple = tuple(tuple(p.items()) for p in point_list) # Make hashable
                   realtime_id_to_shapes_temp[inferred_realtime_id].add(point_tuple)
                   unique_shapes_added.add(shape_id) # Track overall unique shapes used from GTFS

    # Convert the temporary set structure to the final list-of-lists structure for ROUTE_SHAPES_DATA
    ROUTE_SHAPES_DATA.clear()
    total_shape_paths_loaded = 0
    routes_with_shapes_count = 0

    for realtime_id, shape_tuples_set in realtime_id_to_shapes_temp.items():
         if shape_tuples_set:
              ROUTE_SHAPES_DATA[realtime_id] = [
                  [dict(p) for p in shape_tuple] for shape_tuple in shape_tuples_set
              ]
              total_shape_paths_loaded += len(shape_tuples_set)
              routes_with_shapes_count += 1


    if not ROUTE_SHAPES_DATA:
        print("WARNING: ROUTE_SHAPES_DATA is empty after final assembly. No route shapes will be displayed.")
    else:
        print(f"Successfully loaded {total_shape_paths_loaded} unique shape paths (derived from {len(unique_shapes_added)} unique shape IDs from GTFS) for {routes_with_shapes_count} potential realtime routes into ROUTE_SHAPES_DATA.")


    return True # Indicate function completed, even if some data subsets were empty


# --- Flask App Setup ---
app = Flask(__name__)

# --- Load GTFS Data ONCE on startup ---
print("-----------------------------------------------------")
if not load_gtfs_data(): # Call the new loading function
     print("*****************************************************")
     print("WARNING: Failed to load all GTFS data properly.")
     print("Check GTFS files exist and are valid.")
     print("Route paths and the full route list may not be available.")
     print("*****************************************************")
else:
     print("GTFS data loaded successfully.")
print("-----------------------------------------------------")
# --- End Load GTFS Data ---

# --- Routes ---
@app.route('/')
def index():
    """Renders the main HTML page with the map and sidebar."""
    if not GOOGLE_MAPS_API_KEY:
        return "Error: Google Maps API Key not configured in .env file.", 500

    # Pass the Google Maps API key and initial selected routes to the template
    # The full list of routes for the sidebar will be fetched by JS via API
    return render_template(
        'index22.html',
        google_maps_api_key=GOOGLE_MAPS_API_KEY,
        initial_selected_routes=list(TARGET_ROUTES_INITIAL_SELECTION) # Pass as list
    )

# --- API ENDPOINT FOR ALL ROUTE METADATA ---
@app.route('/api/all_routes_metadata')
def get_all_routes_metadata():
    """API endpoint to return the pre-loaded list of all route metadata."""
    # print("API Request: /api/all_routes_metadata") # Less noisy
    if not ALL_ROUTE_METADATA_LIST:
        print("API Warning: Route metadata requested, but ALL_ROUTE_METADATA_LIST is empty.")
        return jsonify([]) # Return empty list
    return jsonify(ALL_ROUTE_METADATA_LIST)
# --- END API ENDPOINT FOR ALL ROUTE METADATA ---


@app.route('/api/bus_data')
def get_bus_data():
    """
    API endpoint to fetch and return filtered bus data as JSON.
    Accepts a comma-separated list of 'routes' in query parameter.
    """
    # print("API: Fetching bus data...") # Log when this endpoint is hit

    requested_routes_str = request.args.get('routes', '')
    requested_routes_list = requested_routes_str.split(',') if requested_routes_str else []
    requested_routes_set = set(requested_routes_list)

    # If no routes are requested, return empty data immediately
    if not requested_routes_set:
         # print("API: No target routes specified in request. Returning empty data.")
         return jsonify([])


    if not TFNSW_API_KEY or not TFNSW_BUS_URL:
         print("API Error: TfNSW API Key or URL not configured.")
         return jsonify({"error": "Server configuration error (TfNSW API)"}), 500

    try:
        # Call the imported function with the requested routes
        buses = fetch_and_filter_bus_positions(TFNSW_BUS_URL, TFNSW_API_KEY, requested_routes_set)

        if buses is None:
            # Function indicated an error during fetch/parse
            print("API Error: fetch_and_filter_bus_positions returned None")
            return jsonify({"error": "Failed to fetch or parse bus data from TfNSW"}), 500
        else:
            # The bus2 script already filtered by the requested routes,
            # so we just return the result.
            # print(f"API: Returning {len(buses)} buses.") # Less noisy
            return jsonify(buses)

    except Exception as e:
        print(f"API Exception in /api/bus_data: An unexpected error occurred: {e}")
        traceback.print_exc()
        return jsonify({"error": "An unexpected server error occurred processing bus data"}), 500

# --- API ENDPOINT FOR SHAPES ---
@app.route('/api/route_shapes')
def get_route_shapes():
    """API endpoint to return the pre-loaded route shape data."""
    # print("API Request: /api/route_shapes") # Keep console less noisy
    # ROUTE_SHAPES_DATA is the global dict populated on startup, keyed by realtime_id
    if not ROUTE_SHAPES_DATA:
        # This can happen if GTFS loading failed or found no shapes for any routes
        print("API Warning: Route shapes requested, but ROUTE_SHAPES_DATA is empty.")
        return jsonify({}) # Return empty object, let frontend handle it gracefully
    return jsonify(ROUTE_SHAPES_DATA)
# --- END API ENDPOINT FOR SHAPES ---

# --- Run the App ---
if __name__ == '__main__':
    # Debug=True automatically reloads on code changes
    # Use host='0.0.0.0' to make it accessible on your network (optional)
    app.run(debug=True, host='0.0.0.0', port=5000)