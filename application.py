# application.py
import os
import csv
from collections import defaultdict
from flask import Flask # Only Flask itself, other Flask extensions if used by routes go to routes.py
from dotenv import load_dotenv # type: ignore
import traceback # Import traceback for better error printing

# Load environment variables from .env file
load_dotenv()

# --- Flask App Setup ---
app = Flask(__name__)

# --- Configuration ---
TFNSW_API_KEY = os.getenv("API_KEY")
app.config["TFNSW_API_KEY"] = TFNSW_API_KEY # Store in app.config if routes need it
TFNSW_BUS_URL = "https://api.transport.nsw.gov.au/v1/gtfs/vehiclepos/buses"
app.config["TFNSW_BUS_URL"] = TFNSW_BUS_URL # Store in app.config
GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY")
app.config["GOOGLE_MAPS_API_KEY"] = GOOGLE_MAPS_API_KEY # Store in app.config

# --- Constants ---
GTFS_STATIC_DIR = 'gtfs_static'
app.config["GTFS_STATIC_DIR"] = GTFS_STATIC_DIR


# --- Helper to load agency data (can be cached simply) ---
_agency_data_cache = None
def get_agency_name_map():
    global _agency_data_cache
    if _agency_data_cache is None:
        _agency_data_cache = {}
        # Use app.config for GTFS_STATIC_DIR if preferred, or keep direct reference
        agency_file = os.path.join(GTFS_STATIC_DIR, 'agency.txt')
        if os.path.exists(agency_file):
            try:
                with open(agency_file, 'r', encoding='utf-8-sig') as f_agency:
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

# --- Cache for load_gtfs_shapes results ---
_route_shapes_cache = {}

def load_gtfs_shapes(target_realtime_routes: set):
    """
    Processes static GTFS data to extract shapes for the given target_realtime_routes.
    Results are cached in-memory.
    Returns a dictionary: { "realtime_route_id": [[{lat: y, lng: x}, ...]], ... }
    or an empty dictionary if no shapes are found or errors occur.
    """
    global _route_shapes_cache
    cache_key = frozenset(target_realtime_routes)

    if cache_key in _route_shapes_cache:
        print(f"Cache HIT for load_gtfs_shapes with key: {cache_key}")
        return _route_shapes_cache[cache_key]
    
    print(f"Cache MISS for load_gtfs_shapes with key: {cache_key}. Processing GTFS...")

    if not target_realtime_routes:
        print("load_gtfs_shapes: No target routes provided, returning empty shapes.")
        return {}

    print(f"Loading GTFS shapes for {len(target_realtime_routes)} target routes: {target_realtime_routes}")

    route_shapes_for_this_request = defaultdict(list)
    # Use app.config for GTFS_STATIC_DIR if preferred
    shapes_file = os.path.join(GTFS_STATIC_DIR, 'shapes2606.txt')
    trips_file = os.path.join(GTFS_STATIC_DIR, 'trips2606.txt')
    routes_file_path = os.path.join(GTFS_STATIC_DIR, 'routes2606.txt')

    target_short_names = set()
    short_name_to_realtime_id = {}
    agency_id_from_realtime_route = {}

    for rt_id in target_realtime_routes:
        try:
            parts = rt_id.split('_', 1)
            if len(parts) == 2:
                agency_id, short_name = parts
                target_short_names.add(short_name)
                agency_id_from_realtime_route[rt_id] = agency_id
                if (agency_id, short_name) not in short_name_to_realtime_id:
                     short_name_to_realtime_id[(agency_id, short_name)] = rt_id
            else:
                short_name = rt_id
                target_short_names.add(short_name)
                if short_name not in short_name_to_realtime_id:
                     short_name_to_realtime_id[short_name] = rt_id
        except Exception as e:
            print(f"Warning: Could not parse agency/short name from target route '{rt_id}': {e}")
            continue

    if not target_short_names:
        print("load_gtfs_shapes: No valid target short names could be extracted.")
        _route_shapes_cache[cache_key] = {}
        return {}

    if not os.path.exists(shapes_file): print(f"ERROR (load_gtfs_shapes): shapes2606.txt not found"); _route_shapes_cache[cache_key] = {}; return {}
    if not os.path.exists(trips_file): print(f"ERROR (load_gtfs_shapes): trips2606.txt not found"); _route_shapes_cache[cache_key] = {}; return {}
    if not os.path.exists(routes_file_path): print(f"ERROR (load_gtfs_shapes): routes2606.txt not found"); _route_shapes_cache[cache_key] = {}; return {}

    agency_short_name_to_static_ids = defaultdict(set)
    static_id_to_agency_short_name = {}
    try:
        with open(routes_file_path, 'r', encoding='utf-8-sig') as f_routes:
            reader = csv.DictReader(f_routes)
            for row in reader:
                 try:
                      current_short_name = row.get('route_short_name')
                      static_route_id = row.get('route_id')
                      current_agency_id = row.get('agency_id')
                      if current_agency_id and current_short_name and static_route_id and \
                         current_short_name in target_short_names and \
                         short_name_to_realtime_id.get((current_agency_id, current_short_name)):
                           agency_short_name_to_static_ids[(current_agency_id, current_short_name)].add(static_route_id)
                           static_id_to_agency_short_name[static_route_id] = (current_agency_id, current_short_name)
                 except KeyError as e:
                      print(f"Warning (load_gtfs_shapes): Missing column '{e}' in routes.txt row. Skipping.")
                      continue
            if not agency_short_name_to_static_ids:
                 print("ERROR (load_gtfs_shapes): No routes found in routes.txt matching target (agency, short_name)s.")
                 _route_shapes_cache[cache_key] = {}
                 return {}
    except Exception as e:
        print(f"ERROR (load_gtfs_shapes): Failed to read routes.txt: {e}")
        traceback.print_exc()
        _route_shapes_cache[cache_key] = {}
        return {}

    all_relevant_static_ids = set(static_id_to_agency_short_name.keys())
    if not all_relevant_static_ids:
         print("ERROR (load_gtfs_shapes): Processing routes.txt yielded no relevant static route IDs.")
         _route_shapes_cache[cache_key] = {}
         return {}

    static_id_to_shape_ids = defaultdict(set)
    try:
        with open(trips_file, 'r', encoding='utf-8-sig') as f_trips:
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
    except Exception as e:
        print(f"ERROR (load_gtfs_shapes): Failed to read trips.txt: {e}")
        traceback.print_exc()
        _route_shapes_cache[cache_key] = {}
        return {}

    all_relevant_shape_ids = set(s_id for shapes in static_id_to_shape_ids.values() for s_id in shapes)
    if not all_relevant_shape_ids:
         print("WARNING (load_gtfs_shapes): No relevant shape IDs found after processing trips.")
         _route_shapes_cache[cache_key] = {}
         return {}

    shape_id_to_points = defaultdict(list)
    try:
        with open(shapes_file, 'r', encoding='utf-8-sig') as f_shapes:
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
    except Exception as e:
        print(f"ERROR (load_gtfs_shapes): Failed to read shapes.txt: {e}")
        traceback.print_exc()
        _route_shapes_cache[cache_key] = {}
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
         _route_shapes_cache[cache_key] = {}
         return {}

    for realtime_id in target_realtime_routes:
        agency_id_part = agency_id_from_realtime_route.get(realtime_id)
        short_name_part = None
        if agency_id_part:
            short_name_part = realtime_id[len(agency_id_part)+1:]

        if not agency_id_part or not short_name_part:
            continue

        lookup_key = (agency_id_part, short_name_part)
        static_ids_for_key = agency_short_name_to_static_ids.get(lookup_key, set())
        if not static_ids_for_key:
            continue

        shapes_for_this_realtime_id = set()
        for static_id in static_ids_for_key:
            shape_ids_for_static_route = static_id_to_shape_ids.get(static_id, set())
            for shape_id in shape_ids_for_static_route:
                if shape_id in processed_shape_points:
                    point_list = processed_shape_points[shape_id]
                    point_tuple = tuple(tuple(sorted(p.items())) for p in point_list)
                    shapes_for_this_realtime_id.add(point_tuple)

        if shapes_for_this_realtime_id:
             route_shapes_for_this_request[realtime_id] = [
                 [dict(p_item for p_item in point_tuple_item) for point_tuple_item in point_tuple]
                 for point_tuple in shapes_for_this_realtime_id
             ]

    final_result = dict(route_shapes_for_this_request)
    _route_shapes_cache[cache_key] = final_result

    if not final_result:
        print(f"WARNING (load_gtfs_shapes): route_shapes_for_this_request is empty for targets: {target_realtime_routes}")
    else:
        print(f"Successfully generated shapes for {len(final_result)} of the {len(target_realtime_routes)} requested routes.")

    return final_result

def initialize_app_data():
    """
    Function to explicitly initialize any app-level data that needs to be ready
    before the first request, like the agency name map.
    """
    print("-----------------------------------------------------")
    print("Initializing application data...")
    print("GTFS static data will be loaded on-demand per API request.")
    print("Ensure GTFS files exist in 'gtfs_static' directory.")
    get_agency_name_map() # Initialize agency name map once at startup
    print("Application data initialization complete.")
    print("-----------------------------------------------------")

# Note: The 'if __name__ == '__main__':' block for app.run()
# will be moved to the new top-level app.py or handled by Gunicorn.