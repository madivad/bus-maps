# --- (Inside the fetch_and_filter_bus_positions function) ---
# ... after parsing the feed ...

    matching_vehicles = []
    received_route_ids = set() # <--- Add this set

    # Iterate through each entity in the feed
    for entity in feed.entity:
        # Check if the entity has vehicle position data and trip data
        if entity.HasField('vehicle') and entity.vehicle.HasField('trip'):
            vehicle = entity.vehicle
            trip = entity.vehicle.trip

            # Store all received route_ids for debugging
            if trip.HasField('route_id'): # <--- Add this block
                received_route_ids.add(str(trip.route_id))

            # Check if the trip has a route_id and if it's in our target set
            # Ensure comparison with strings
            if trip.HasField('route_id') and str(trip.route_id) in target_routes:
                # ... (rest of the code to extract position_info) ...
                matching_vehicles.append(position_info)

    # Print all unique route IDs found in this feed fetch
    print(f"\nDEBUG: Unique route_ids received in this feed: {received_route_ids}\n") # <-- Add this print

    print(f"Found {len(matching_vehicles)} vehicles matching the target routes ({', '.join(target_routes)}).")
    return matching_vehicles

# --- (Rest of the script) ---