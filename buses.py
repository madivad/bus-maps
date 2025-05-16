import os
import requests
from google.transit import gtfs_realtime_pb2 # type: ignore
from datetime import datetime

def fetch_and_filter_bus_positions(api_url, api_key, target_routes):
    """
    Fetches real-time vehicle positions and filters for specific routes.

    Args:
        api_url (str): The GTFS-realtime vehicle positions API endpoint URL.
        api_key (str): Your TfNSW API key.
        target_routes (set): A set of route_id strings to filter for.2606_

    Returns:
        list: A list of dictionaries, each containing info for a matching vehicle.
              Returns None if fetching or parsing fails.
    """
    # Check if variables loaded correctly
    if not api_key:
        print("Error: TFNSW_API_KEY not found in environment variables (check .env file).")
        return None
    if not api_url: # Check the parameter passed to the function
         print("Error: API URL is missing (check ACTUAL_API_ENDPOINT_URL in .env file).")
         return None

    headers = {
        "Authorization": f"apikey {api_key}"
    }

    response = None # Initialize response to None
    try:
        response = requests.get(api_url, headers=headers, timeout=30) # 30 second timeout
        response.raise_for_status()  # Raise an exception for bad status codes (4xx or 5xx)
        print("Data fetched successfully.")

    except requests.exceptions.Timeout:
        print("Error: Request timed out.")
        return None
    except requests.exceptions.RequestException as e:
        print(f"Error fetching data: {e}")
        # Check specifically for 401/403 which might indicate API key issues
        if response is not None: # Check if response object exists
             if response.status_code == 401 or response.status_code == 403:
                  print("Authentication failed (401/403). Check your API key (TFNSW_API_KEY in .env) and ensure it has access.")
             elif response.status_code == 404:
                  print("API endpoint not found (404). Check the URL (ACTUAL_API_ENDPOINT_URL in .env).")
        return None

    # Initialize the GTFS-realtime feed message object
    feed = gtfs_realtime_pb2.FeedMessage()

    try:
        # Parse the binary data from the response content
        feed.ParseFromString(response.content)
        print("Data parsed successfully.")
    except Exception as e:
        print(f"Error parsing GTFS-realtime data: {e}")
        return None

    matching_vehicles = []
    current_timestamp = datetime.now() # For comparing data freshness if needed

    # Iterate through each entity in the feed
    for entity in feed.entity:
        # Check if the entity has vehicle position data and trip data
        if entity.HasField('vehicle') and entity.vehicle.HasField('trip'):
            vehicle = entity.vehicle
            trip = entity.vehicle.trip

            # Check if the trip has a route_id and if it's in our target set
            # Ensure comparison with strings
            if trip.HasField('route_id') and str(trip.route_id) in target_routes:

                # --- MODIFICATION START ---
                # Calculate speed safely, ensuring it's always a string
                speed_value = 'N/A' # Default to 'N/A' string
                if vehicle.HasField('position') and vehicle.position.HasField('speed'):
                    try:
                        speed_kmh = vehicle.position.speed * 3.6
                        speed_value = f"{speed_kmh:.1f} km/h"
                    except TypeError:
                        speed_value = 'Data Error'
                    except Exception as e:
                        print(f"Warning: Error calculating speed for vehicle {vehicle.vehicle.id if vehicle.HasField('vehicle') else 'Unknown'}: {e}")
                        speed_value = 'Calc Error'
                # --- MODIFICATION END ---
            
                # Extract relevant information
                position_info = {
                    "route_id": str(trip.route_id), # Store as string
                    "trip_id": trip.trip_id if trip.HasField('trip_id') else 'N/A',
                    "vehicle_id": vehicle.vehicle.id if vehicle.HasField('vehicle') and vehicle.vehicle.HasField('id') else 'N/A',
                    "latitude": vehicle.position.latitude if vehicle.HasField('position') and vehicle.position.HasField('latitude') else None,
                    "longitude": vehicle.position.longitude if vehicle.HasField('position') and vehicle.position.HasField('longitude') else None,
                    "bearing": vehicle.position.bearing if vehicle.HasField('position') and vehicle.position.HasField('bearing') else None,
                    "speed": speed_value,
                    "timestamp": datetime.fromtimestamp(vehicle.timestamp) if vehicle.HasField('timestamp') else None,
                    "raw_timestamp": vehicle.timestamp if vehicle.HasField('timestamp') else None # Keep raw timestamp if needed
                }
                matching_vehicles.append(position_info)

    print(f"Found {len(matching_vehicles)} vehicles matching the target routes ({', '.join(target_routes)}).")
    return matching_vehicles
