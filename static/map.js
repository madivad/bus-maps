let map;
// Store markers keyed by vehicle_id: { "vehicle_id": { gmapMarker: AdvancedMarkerElement, isAnimating: false, startPos: null, targetPos: null, startTime: 0 }, ... }
let busMarkerObjects = {};
// Object to hold polylines { route_id: [polyline1, polyline2,...] }
let routePolylines = {};

const animationDuration = 1500; // Milliseconds for marker animation (adjust as needed)
let animationFrameId = null; // To control the animation loop

// Function called by Google Maps API once loaded
async function initMap() {
    // Initial map center (e.g., somewhere relevant to your routes)
    // You might need to adjust these coordinates
    const initialCenter = { lat: -33.47, lng: 151.32 };

    map = new google.maps.Map(document.getElementById("map"), {
        zoom: 13, // Adjust zoom level as needed
        center: initialCenter,
        mapId: "BUS_MAP_REALTIME" // Optional: Use Map IDs for advanced styling
    });

    console.log("Map initialized.");
    await fetchAndDrawRouteShapes();
    await fetchAndUpdateMarkers();
    startAnimationLoop();
    setInterval(fetchAndUpdateMarkers, 20000); // 20000ms = 20s
}

window.initMap = initMap;

// Function to fetch and draw route shapes
async function fetchAndDrawRouteShapes() {
    console.log("Fetching route shapes from /api/route_shapes...");
    try {
        const response = await fetch('/api/route_shapes');
         if (!response.ok) {
            // Log specific error status if available
            console.error(`Error fetching route shapes: ${response.status} ${response.statusText}`);
            // Try to get error message from server response if JSON
            try {
                 const errorData = await response.json();
                 console.error("Server error details:", errorData);
            } catch (e) { /* Ignore if response body is not JSON */ }
            return; // Stop execution for this function
        }
        const shapesData = await response.json(); // { "route_id": [[{lat,lng},...], ...], ... }

        if (Object.keys(shapesData).length === 0) {
            console.log("Received empty shape data (or GTFS loading failed server-side). No route paths drawn.");
            return;
        }

        console.log(`Received shape data for ${Object.keys(shapesData).length} routes.`);

        // Clear existing polylines if any
        clearPolylines();

        // Define some colors (add more if needed, or use a better color generation method)
        const routeColors = ['#FF5733', '#3375FF', '#33FF57', '#FFC300', '#C70039', '#900C3F', '#581845'];
        let colorIndex = 0;

        // Iterate through each route and its shapes
        for (const routeId in shapesData) {
            if (!shapesData.hasOwnProperty(routeId)) continue; // Ensure it's not from prototype

            const shapes = shapesData[routeId]; // This is a list of shapes (paths) for the route
            if (!Array.isArray(shapes)) {
                console.warn(`Expected an array of shapes for route ${routeId}, but got:`, shapes);
                continue;
            }

            const color = routeColors[colorIndex % routeColors.length];
            routePolylines[routeId] = []; // Initialize array for this route's polylines

            shapes.forEach((pathPoints, index) => { // pathPoints is a list of {lat, lng}
                // Basic validation of the path data
                if (!Array.isArray(pathPoints) || pathPoints.length < 2) {
                     console.warn(`Skipping invalid or short shape ${index + 1} for route ${routeId}.`);
                     return;
                }
                // Check if points have valid lat/lng
                const validPathPoints = pathPoints.filter(p => typeof p?.lat === 'number' && typeof p?.lng === 'number');
                if (validPathPoints.length < 2) {
                    console.warn(`Skipping shape ${index + 1} for route ${routeId} after filtering invalid points.`);
                    return;
                }

                try {
                    const polyline = new google.maps.Polyline({
                        path: validPathPoints,
                        geodesic: true,
                        strokeColor: color,
                        strokeOpacity: 0.65, // Slightly more opaque
                        strokeWeight: 5,    // Slightly thicker
                        zIndex: 1 // Draw routes below markers (markers default zIndex is usually higher)
                    });

                    polyline.setMap(map);
                    routePolylines[routeId].push(polyline); // Store reference
                } catch (e) {
                     console.error(`Error creating polyline for route ${routeId}, shape ${index + 1}:`, e);
                }
            });
            colorIndex++; // Use next color for next route
        }
         console.log("Finished drawing route polylines.");

    } catch (error) {
        // Catch errors during fetch or JSON parsing
        console.error("Error fetching or drawing route shapes:", error);
    }
}

// Function to fetch data from our Flask API and update markers (with animation logic)
async function fetchAndUpdateMarkers() {
    console.log("Fetching bus data from API...");
    try {
        const response = await fetch('/api/bus_data');
        if (!response.ok) {
            console.error(`Error fetching data: ${response.status} ${response.statusText}`);
            const errorData = await response.json().catch(() => ({}));
            console.error("Server error details:", errorData);
            return;
        }
        const busData = await response.json(); // List of current bus objects
        console.log(`Received ${busData.length} bus updates.`);

        const updatedVehicleIds = new Set(); // Keep track of IDs in this update

        // --- Process updates ---
        busData.forEach(bus => {
            const vehicleId = bus.vehicle_id;
            if (!vehicleId || vehicleId === 'N/A') {
                console.warn("Skipping bus with missing vehicle ID:", bus);
                return; // Need ID to track
            }
            if (typeof bus.latitude !== 'number' || typeof bus.longitude !== 'number') {
                console.warn("Skipping bus with invalid coordinates:", bus);
                return; // Skip if lat/lng are missing/invalid
            }

            updatedVehicleIds.add(vehicleId); // Mark this ID as present
            const newPosition = { lat: bus.latitude, lng: bus.longitude };
            const bearing = bus.bearing ?? 0;
            const routeId = bus.route_id || "N/A";
            const routeShortName = routeId.includes('_') ? routeId.split('_').pop() : routeID;
            const speedDisplay = bus.speed || 'N/A'; // Use the pre-formatted string from server
            const timeDisplay = formatTimestamp(bus.raw_timestamp);

            // Generate the content string based on the LATEST bus data
            // We'll use this for both new and updated InfoWindows
            const currentInfoContent = `
                <div>
                    <strong>Route:</strong> ${bus.route_id}<br>
                    <strong>Vehicle:</strong> ${vehicleId}<br>
                    <strong>Speed:</strong> ${speedDisplay}<br>
                    <strong>Last Update:</strong> ${timeDisplay}<br>
                    <strong>Coords:</strong> ${bus.latitude.toFixed(5)}, ${bus.longitude.toFixed(5)}
                </div>`;

            // --- SVG Icon Creation ---
            const iconSize = 40; // Diameter of the circle + pointer space
            const circleRadius = 18; // Radius of the black circle
            const center = iconSize / 2;
            const pointerHeight = 8;
            const pointerWidth = 12;
            
            const svgContent = `
                <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 ${iconSize} ${iconSize}" xmlns="http://www.w3.org/2000/svg">
                  <g transform="rotate(${bearing}, ${center}, ${center})">
                    <!-- Black Circle -->
                    <circle cx="${center}" cy="${center}" r="${circleRadius}" fill="black" stroke="white" stroke-width="1"/>
                    <!-- Pointer Triangle (pointing upwards initially, rotation handles direction) -->
                    <polygon points="${center},${center - circleRadius + 1} ${center - pointerWidth / 2},${center - circleRadius + pointerHeight + 1} ${center + pointerWidth / 2},${center - circleRadius + pointerHeight + 1}" fill="white"/>
                    <!-- Route Text (NOT rotated with the group) -->
                    <text x="${center}" y="${center}" fill="white" font-size="15" font-weight="bold" font-family="Arial, sans-serif" text-anchor="middle" dominant-baseline="central" transform="rotate(${-bearing}, ${center}, ${center})">${routeShortName}</text>
                  </g>
                </svg>
            `;


            if (busMarkerObjects[vehicleId]) {
                // --- Marker EXISTS - Update position AND ICON ---
                const markerData = busMarkerObjects[vehicleId];
                const currentPosition = markerData.gmapMarker.position; // Get current map position

                // Update marker title (tooltip) immediately
                markerData.gmapMarker.title = `Route: ${bus.route_id}\nVehicle: ${vehicleId}\nSpeed: ${bus.speed || 'N/A'}\nTime: ${formatTimestamp(bus.raw_timestamp)}`;

                // --- Update InfoWindow Content ---
                // Check if infowindow exists before trying to set content
                if (markerData.infowindow) {
                    markerData.infowindow.setContent(currentInfoContent);
                } else {
                    console.warn(`InfoWindow missing for existing marker ${vehicleId}. Recreating listener might be needed if this happens often.`);
                    // Optionally, recreate the listener/infowindow here if needed, though it shouldn't be missing
                }
                // --- End InfoWindow Update ---
                
                // --- Update Marker Icon Content ---
                // Recreate the marker's content div and set its innerHTML
                // Note: For frequent updates, optimizing this might be needed,
                // but for moderate numbers of buses, this is usually fine.
                if (markerData.gmapMarker.content instanceof HTMLElement) {
                    markerData.gmapMarker.content.innerHTML = svgContent;
                } else {
                    // If content somehow isn't an HTMLElement, recreate (less ideal)
                    console.warn(`Marker content for ${vehicleId} not an HTMLElement, recreating.`);
                    const newMarkerElement = document.createElement('div');
                    newMarkerElement.innerHTML = svgContent;
                    markerData.gmapMarker.content = newMarkerElement;
                }
               // --- End Icon Update ---                        

                // Only animate if the position has actually changed significantly
                const latDiff = Math.abs((currentPosition?.lat || 0) - newPosition.lat);
                const lngDiff = Math.abs((currentPosition?.lng || 0) - newPosition.lng);

                if (currentPosition && (latDiff > 0.000001 || lngDiff > 0.000001)) { // Tighter tolerance
                    // Only update animation state if not already animating towards the *same* target
                    if (!markerData.isAnimating ||
                        markerData.targetPos?.lat !== newPosition.lat ||
                        markerData.targetPos?.lng !== newPosition.lng)
                    {
                       // console.log(`Updating animation target for marker: ${vehicleId}`);
                       markerData.startPos = markerData.gmapMarker.position; // Start from current visual position
                       markerData.targetPos = newPosition;
                       markerData.startTime = performance.now();
                       markerData.isAnimating = true;
                    }
               } else if (!markerData.isAnimating) {
                    // Position hasn't changed significantly, and not animating, ensure it's at target
                    markerData.gmapMarker.position = newPosition;
                    markerData.startPos = null; // Ensure startPos is null if not animating
               }
            } else {
                // --- Marker is NEW - Create it ---
                console.log(`Creating new marker: ${vehicleId}`);

                // Create the container div for the Advanced Marker content
                const markerElement = document.createElement('div');
                markerElement.innerHTML = svgContent; // Set the SVG as the content
                markerElement.style.cursor = 'pointer';


                const gmapMarker = new google.maps.marker.AdvancedMarkerElement({
                    map: map,
                    position: newPosition,
                    content: markerElement, // Use the div containing the SVG
                    title: `Route: ${routeId}\nVehicle: ${vehicleId}\nSpeed: ${bus.speed || 'N/A'}\nTime: ${formatTimestamp(bus.raw_timestamp)}`,
                    zIndex: 100 // Ensure markers are drawn above polylines
                });

                const infowindow = new google.maps.InfoWindow({
                     content: currentInfoContent, // Use the content generated above
                     ariaLabel: `Bus ${vehicleId}`
                });

                gmapMarker.addListener("click", () => infowindow.open({ anchor: gmapMarker, map }));

                busMarkerObjects[vehicleId] = {
                    gmapMarker: gmapMarker,
                    infowindow: infowindow,
                    isAnimating: false,
                    startPos: null,
                    targetPos: newPosition,
                    startTime: 0
                };
            }
        });

        // --- Remove markers for buses no longer in the feed ---
        for (const vehicleId in busMarkerObjects) {
            if (!updatedVehicleIds.has(vehicleId)) {
                console.log(`Removing stale marker: ${vehicleId}`);
                // Close infowindow if it's open before removing marker (optional)
                // if (busMarkerObjects[vehicleId].infowindow === currentlyOpenInfoWindow) {
                //    currentlyOpenInfoWindow.close();
                //    currentlyOpenInfoWindow = null;
                // }
                busMarkerObjects[vehicleId].gmapMarker.map = null; // Remove from map
                delete busMarkerObjects[vehicleId]; // Remove from our tracking object
            }
        }
         // Make sure the animation loop is running if needed
        startAnimationLoop();

        console.log(`Tracking ${Object.keys(busMarkerObjects).length} bus markers.`);

    } catch (error) {
        console.error("Error in fetchAndUpdateMarkers:", error);
    }
}


// Animation Loop Function
function animateMarkers(timestamp) {
    let stillAnimating = false; // Flag to see if we need another frame

    for (const vehicleId in busMarkerObjects) {
        if (!busMarkerObjects.hasOwnProperty(vehicleId)) continue;

        const markerData = busMarkerObjects[vehicleId];

        if (markerData.isAnimating) {
            const elapsedTime = timestamp - markerData.startTime;
            const fraction = animationDuration > 0 ? Math.min(1, elapsedTime / animationDuration) : 1;

            if (markerData.startPos && markerData.targetPos) {
                const lat = markerData.startPos.lat + (markerData.targetPos.lat - markerData.startPos.lat) * fraction;
                const lng = markerData.startPos.lng + (markerData.targetPos.lng - markerData.startPos.lng) * fraction;
                markerData.gmapMarker.position = { lat, lng };
            } else {
                markerData.isAnimating = false;
            }

            if (fraction < 1) {
                stillAnimating = true; // This marker needs more frames
            } else {
                markerData.isAnimating = false;
                markerData.startPos = null; // Clear start position
                if (markerData.targetPos) {
                    markerData.gmapMarker.position = markerData.targetPos;
                }
                console.log(`Animation finished for ${vehicleId}`);
            }
        }
    }

    // Request the next frame only if there are still markers animating
    if (stillAnimating) {
        animationFrameId = requestAnimationFrame(animateMarkers);
    } else {
        animationFrameId = null; // Stop the loop if nothing is animating
         console.log("Animation loop paused.");
    }
}

// Function to start the animation loop
function startAnimationLoop() {
    if (animationFrameId === null) { // Only start if not already running
         // Check if there are actually any markers needing animation before starting
         let needsAnimation = false;
         for (const vehicleId in busMarkerObjects) {
             if (busMarkerObjects[vehicleId].isAnimating) {
                 needsAnimation = true;
                 break;
             }
         }
         if(needsAnimation) {
            console.log("Starting animation loop...");
            animationFrameId = requestAnimationFrame(animateMarkers);
         } else {
             console.log("No markers currently animating, loop not started.");
         }

    }
}


// Helper function to clear polylines
 function clearPolylines() {
     console.log("Clearing existing polylines...");
     for (const routeId in routePolylines) {
         routePolylines[routeId].forEach(polyline => {
             polyline.setMap(null); // Remove polyline from map
         });
     }
     routePolylines = {}; // Reset the object
 }

 
// Helper function to format timestamp from raw Unix timestamp
function formatTimestamp(unixTimestamp) {
    if (unixTimestamp === null || typeof unixTimestamp === 'undefined') return 'No Timestamp';
    try {
        // Ensure it's treated as a number; multiply by 1000 for JS Date (milliseconds)
        const timestampMs = Number(unixTimestamp) * 1000;
        if (isNaN(timestampMs)) return 'Invalid Time Data'; // Handle non-numeric cases
        const date = new Date(timestampMs);
        // Check if Date object is valid
        if (isNaN(date.getTime())) return 'Invalid Date';
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); // Consistent HH:MM:SS format
    } catch (e) {
        console.error("Error formatting timestamp:", unixTimestamp, e);
        return 'Time Format Error';
    }
}
