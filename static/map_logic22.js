// --- START OF FILE map_logic.js ---

console.log("map_logic.js script started parsing.");

// Global variables
let map;
let busMarkerObjects = {}; // { vehicleId: { gmapMarker, infowindow, startPos, targetPos, startTime, isAnimating } }
let routePolylines = {}; // { realtime_route_id: [google.maps.Polyline, ...] }
let routeMetadata = {}; // { realtime_id: { short_name, long_name, color } } fetched from API
let selectedRouteIds = new Set(); // Set of realtime_route_id strings currently checked

const animationDuration = 1500; // Milliseconds for marker animation
let animationFrameId = null; // To control the animation loop
let updateIntervalId = null; // To control the periodic data fetching

// Get initial selected routes from the Flask template
// This variable is set in a script tag in index2.html before this script loads
const initialSelectedRoutes = window.initialSelectedRoutes || [];
initialSelectedRoutes.forEach(routeId => selectedRouteIds.add(routeId));


// IMPORTANT: This function is called by the Google Maps script's callback parameter
async function initMap() {
    console.log(">>> initMap function STARTED!");

    const initialCenter = { lat: -33.48, lng: 151.33 }; // Example center near Gosford
    try {
        map = new google.maps.Map(document.getElementById("map"), {
            zoom: 11, // Adjusted zoom for wider area
            center: initialCenter,
            mapId: "BUS_MAP_REALTIME" // Optional Map ID
        });
        console.log(">>> google.maps.Map object CREATED successfully.");
    } catch (mapError) {
        console.error(">>> ERROR Creating google.maps.Map object:", mapError);
        // Display an error message to the user if possible
        const mapDiv = document.getElementById("map");
        if (mapDiv) {
            mapDiv.innerHTML = "<p style='text-align:center; color: red;'>Error loading map. Please check your Google Maps API key.</p>";
            mapDiv.style.cssText = 'height: 95vh; width: 100%; display: flex; justify-content: center; align-items: center;';
        }
        return; // Stop if map creation failed
    }

    console.log("Map initialized.");

    // Load route metadata and build sidebar
    await fetchAndBuildSidebar();

    // Fetch and draw shapes for all routes that were loaded by the backend
    // Visibility will be controlled by checkbox state later
    await fetchAndDrawRouteShapes();

    // Initial fetch and update
    await fetchAndUpdateMarkers();

    // Set up event listener for live update checkbox
    document.getElementById('live-update-checkbox').addEventListener('change', toggleLiveUpdates);

    // Start animation loop
    startAnimationLoop();

    // Start periodic updates if the checkbox is checked
    const liveUpdateCheckbox = document.getElementById('live-update-checkbox');
    if (liveUpdateCheckbox && liveUpdateCheckbox.checked) {
         startUpdateInterval();
    }
     console.log("initMap function finished.");
}

// --- Assign to window explicitly ---
console.log("Assigning initMap to window object.");
window.initMap = initMap; // Make initMap globally accessible for the Google Maps API loader

// --- Sidebar and Route Selection Logic ---

async function fetchAndBuildSidebar() {
     console.log("Fetching all route metadata from /api/all_routes_metadata...");
     try {
          const response = await fetch('/api/all_routes_metadata');
          if (!response.ok) {
              console.error(`Error fetching route metadata: ${response.status} ${response.statusText}`);
              document.getElementById('route-list').innerHTML = "<span style='color: red;'>Error loading routes.</span>";
              return;
          }
          routeMetadata = await response.json(); // This is the list

          const routeListDiv = document.getElementById('route-list');
          if (!routeListDiv) {
               console.error("Route list div not found.");
               return;
          }
          routeListDiv.innerHTML = ''; // Clear loading message

          if (routeMetadata.length === 0) {
               routeListDiv.innerHTML = "No routes found.";
               console.warn("Received empty route metadata list.");
               return;
          }

          console.log(`Building sidebar for ${routeMetadata.length} routes.`);

          routeMetadata.forEach(route => {
               const realtimeId = route.realtime_id;
               const shortName = route.short_name;
               const longName = route.long_name || shortName;
               const color = route.color || '#000000'; // Default to black if no color

               const label = document.createElement('label');
               // Use realtime_id as the value for the checkbox
               label.innerHTML = `<input type="checkbox" value="${realtimeId}" ${selectedRouteIds.has(realtimeId) ? 'checked' : ''}>
                                  <span style="color: ${color}; font-weight: bold;">${shortName}</span> - ${longName}`;
                label.title = longName; // Add tooltip
                routeListDiv.appendChild(label);

                // Add event listener to the checkbox
                const checkbox = label.querySelector('input[type="checkbox"]');
                if (checkbox) {
                    checkbox.addEventListener('change', handleRouteCheckboxChange);
                }
          });

     } catch (error) {
          console.error("Error fetching or building sidebar:", error);
          document.getElementById('route-list').innerHTML = "<span style='color: red;'>Error loading routes.</span>";
     }
}

function handleRouteCheckboxChange(event) {
    const checkbox = event.target;
    const routeId = checkbox.value; // This is the realtime_id

    if (checkbox.checked) {
        selectedRouteIds.add(routeId);
    } else {
        selectedRouteIds.delete(routeId);
        // Immediately hide markers and polylines for this route
        hideRouteElements(routeId);
    }

    console.log(`Route ${routeId} ${checkbox.checked ? 'selected' : 'deselected'}. Selected routes: ${Array.from(selectedRouteIds).join(', ')}`);

    // Update visibility based on the new selection
    updateElementVisibility();

    // If live update is off, we might want to trigger a manual update
    // or just rely on the user to toggle it on. Let's rely on the interval.
}

function updateElementVisibility() {
    // Toggle marker visibility
    for (const vehicleId in busMarkerObjects) {
        if (!busMarkerObjects.hasOwnProperty(vehicleId)) continue;
        const markerData = busMarkerObjects[vehicleId];
        // Need the route_id associated with this marker! Store it when creating/updating markers.
        const markerRouteId = markerData.routeId; // Assuming we add routeId to markerData

        if (markerRouteId && selectedRouteIds.has(markerRouteId)) {
            markerData.gmapMarker.map = map; // Show it
        } else {
             // If route is deselected, or marker has no route_id
            markerData.gmapMarker.map = null; // Hide it
        }
    }

    // Toggle polyline visibility
    for (const routeId in routePolylines) {
         if (!routePolylines.hasOwnProperty(routeId)) continue;
         const isSelected = selectedRouteIds.has(routeId); // Check if the realtime_id is selected
         routePolylines[routeId].forEach(polyline => {
             polyline.setMap(isSelected ? map : null); // Show/hide polyline
         });
    }
}


// --- Map Data Fetching and Drawing ---

async function fetchAndDrawRouteShapes() {
    console.log("Fetching route shapes from /api/route_shapes...");
    try {
        const response = await fetch('/api/route_shapes');
         if (!response.ok) {
            console.error(`Error fetching route shapes: ${response.status} ${response.statusText}`);
            try { const errorData = await response.json(); console.error("Server error details:", errorData); } catch (e) { /* Ignore parse error */ }
            // Don't return, try to continue without shapes
        }
        const shapesData = await response.json().catch(() => ({})); // Handle potential JSON parse error

        if (Object.keys(shapesData).length === 0) {
            console.log("Received empty shape data. No route paths drawn.");
            return; // Stop if no shapes received
        }
        console.log(`Received shape data for ${Object.keys(shapesData).length} potential realtime routes.`);

        // Clear previous polylines if any (though this should run only once after map init)
        clearPolylines();

        // Assign colors - use colors from routeMetadata if available
        // Otherwise fall back to a default color cycle
        const defaultRouteColors = ['#FF5733', '#3375FF', '#33FF57', '#FFC300', '#C70039', '#900C3F', '#581845'];
        let defaultColorIndex = 0;

        for (const routeId in shapesData) { // routeId here is the inferred realtime_id
            if (!shapesData.hasOwnProperty(routeId)) continue;
            const shapes = shapesData[routeId];
            if (!Array.isArray(shapes)) continue;

            // Try to find the color from fetched metadata
            const routeInfo = routeMetadata.find(r => r.realtime_id === routeId);
            const color = routeInfo && routeInfo.color ? routeInfo.color : defaultRouteColors[defaultColorIndex++ % defaultRouteColors.length];

            routePolylines[routeId] = []; // Initialize list of polylines for this route ID

            shapes.forEach((pathPoints, index) => {
                if (!Array.isArray(pathPoints) || pathPoints.length < 2) return;
                const validPathPoints = pathPoints.filter(p => typeof p?.lat === 'number' && typeof p?.lng === 'number');
                if (validPathPoints.length < 2) return;

                try {
                    const polyline = new google.maps.Polyline({
                        path: validPathPoints, geodesic: true, strokeColor: color,
                        strokeOpacity: 0.65, strokeWeight: 5, zIndex: 1,
                        map: null // Initially set map to null, visibility controlled by checkboxes
                    });
                    // polyline.setMap(map); // Don't set map here anymore
                    routePolylines[routeId].push(polyline);
                } catch (e) { console.error(`Error creating polyline for route ${routeId}, shape ${index + 1}:`, e); }
            });
        }
        console.log("Finished creating route polylines. Updating visibility...");
        // Update visibility of polylines based on initial selected routes
        updateElementVisibility();

    } catch (error) { console.error("Error fetching or drawing route shapes:", error); }
}


async function fetchAndUpdateMarkers() {
    // console.log("Fetching bus data from API..."); // Less noise

    // Get the currently selected routes to send to the backend
    const currentSelectedRouteIds = Array.from(selectedRouteIds);

    if (currentSelectedRouteIds.length === 0) {
         console.log("No routes selected. Clearing buses.");
         removeAllMarkers(); // Hide/remove all markers
         return; // Don't fetch if no routes are selected
    }

    // Build the query parameter string
    const routesQueryParam = currentSelectedRouteIds.join(',');
    const apiUrl = `/api/bus_data?routes=${encodeURIComponent(routesQueryParam)}`;

    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            console.error(`Error fetching bus data: ${response.status} ${response.statusText}`);
            const errorData = await response.json().catch(() => ({}));
            console.error("Server error details for bus data:", errorData);
            // Don't remove markers on transient API error, just skip update
            return;
        }
        const busData = await response.json();
        // console.log(`Received ${busData.length} bus updates for selected routes.`); // Less noise

        const updatedVehicleIds = new Set();

        busData.forEach(bus => {
            const vehicleId = bus.vehicle_id;
            const routeId = bus.route_id; // This is the realtime_id from the feed

            // Only process if we have a valid vehicleId, routeId, and coordinates
            if (!vehicleId || vehicleId === 'N/A' || !routeId || typeof bus.latitude !== 'number' || typeof bus.longitude !== 'number') {
                // console.warn("Skipping bus update due to missing essential data:", bus); // Too noisy
                return;
            }

            updatedVehicleIds.add(vehicleId);
            const newPosition = { lat: bus.latitude, lng: bus.longitude };
            const bearing = Number(bus.bearing) ?? 0;
            const routeShortName = routeId.includes('_') ? routeId.split('_').pop() : routeId;
            const speedDisplay = bus.speed || 'N/A';
            const timeDisplay = formatTimestamp(bus.raw_timestamp);

             const currentInfoContent = `
                <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4;">
                    <strong>Route:</strong> ${routeId}<br>
                    <strong>Vehicle:</strong> ${vehicleId}<br>
                    <strong>Speed:</strong> ${speedDisplay}<br>
                    <strong>Last Update:</strong> ${timeDisplay}<br>
                    <strong>Coords:</strong> ${bus.latitude.toFixed(5)}, ${bus.longitude.toFixed(5)}
                </div>`;


            // Find the color for this route from the metadata
            const routeInfo = routeMetadata.find(r => r.realtime_id === routeId);
            const routeColor = routeInfo ? routeInfo.color : '#000000'; // Default black if not found

            // SVG Icon with color
            const iconSize = 40; const circleRadius = 12; const center = iconSize / 2;
            const pointerHeight = 12; const pointerWidth = 15;
            const fontSize = routeShortName.length > 2 ? 11 : 15;
            const arrowOffset = 10; // This is the new offset.

            const svgContent = `
                <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 ${iconSize} ${iconSize}" xmlns="http://www.w3.org/2000/svg">
                  <g transform="rotate(${bearing}, ${center}, ${center})">
                    <circle cx="${center}" cy="${center}" r="${circleRadius}" fill="${routeColor}" stroke="white" stroke-width="1.5"/>
                    <polygon points=
                        "${center}, ${center - circleRadius + 1 - arrowOffset}
                        ${center - pointerWidth / 2}, ${center - circleRadius + pointerHeight - arrowOffset}
                        ${center + pointerWidth / 2}, ${center - circleRadius + pointerHeight + 1 - arrowOffset}"
                         fill="${routeColor}" stroke="white" stroke-width="1.5" />
                    <text x="${center}" y="${center + 1}" fill="white" font-size="${fontSize}" font-weight="bold" font-family="Arial, sans-serif" text-anchor="middle" dominant-baseline="middle" transform="rotate(${-bearing}, ${center}, ${center})">${routeShortName}</text>
                  </g>
                </svg>`;

            if (busMarkerObjects[vehicleId]) {
                // --- Marker EXISTS ---
                const markerData = busMarkerObjects[vehicleId];
                // Update associated routeId
                markerData.routeId = routeId;
                markerData.gmapMarker.title = `Route: ${routeId}\nVehicle: ${vehicleId}\nSpeed: ${speedDisplay}\nTime: ${timeDisplay}`;
                if (markerData.infowindow) markerData.infowindow.setContent(currentInfoContent);
                // Update icon content
                if (markerData.gmapMarker.content instanceof HTMLElement) markerData.gmapMarker.content.innerHTML = svgContent;

                const currentPosition = markerData.gmapMarker.position;
                const latDiff = Math.abs((currentPosition?.lat || 0) - newPosition.lat);
                const lngDiff = Math.abs((currentPosition?.lng || 0) - newPosition.lng);

                // Only start animation if position changed and not already animating to this target
                if (currentPosition && (latDiff > 0.000001 || lngDiff > 0.000001)) {
                     if (!markerData.isAnimating || markerData.targetPos?.lat !== newPosition.lat || markerData.targetPos?.lng !== newPosition.lng) {
                          markerData.startPos = markerData.gmapMarker.position;
                          markerData.targetPos = newPosition;
                          markerData.startTime = performance.now();
                          markerData.isAnimating = true;
                     }
                } else if (!markerData.isAnimating) {
                     // If position hasn't changed or animation finished, ensure position is set directly
                     markerData.gmapMarker.position = newPosition;
                     markerData.startPos = null;
                }
                // Ensure marker is visible if its route is selected
                if (selectedRouteIds.has(routeId)) {
                    markerData.gmapMarker.map = map;
                } else {
                    // Should not happen if backend filters, but safety check
                    markerData.gmapMarker.map = null;
                }


            } else {
                // --- Marker is NEW ---
                const markerElement = document.createElement('div');
                markerElement.innerHTML = svgContent;
                markerElement.style.cursor = 'pointer';

                const gmapMarker = new google.maps.marker.AdvancedMarkerElement({
                    map: selectedRouteIds.has(routeId) ? map : null, // Set map based on initial selection state
                    position: newPosition,
                    content: markerElement,
                    title: `Route: ${routeId}\nVehicle: ${vehicleId}\nSpeed: ${speedDisplay}\nTime: ${timeDisplay}`,
                    zIndex: 100 + (selectedRouteIds.has(routeId) ? 10 : 0) // Slightly higher zIndex if selected? Optional.
                });
                const infowindow = new google.maps.InfoWindow({ content: currentInfoContent, ariaLabel: `Bus ${vehicleId}` });
                gmapMarker.addListener("gmp-click", () => infowindow.open({ anchor: gmapMarker, map }));

                busMarkerObjects[vehicleId] = {
                    gmapMarker: gmapMarker,
                    infowindow: infowindow,
                    routeId: routeId, // Store the route ID here!
                    isAnimating: false,
                    startPos: null,
                    targetPos: newPosition,
                    startTime: 0
                };
            }
        }); // End busData.forEach

        // --- Remove stale markers ---
        const vehiclesToRemove = Object.keys(busMarkerObjects).filter(vehicleId => !updatedVehicleIds.has(vehicleId));
        vehiclesToRemove.forEach(vehicleId => {
            busMarkerObjects[vehicleId].gmapMarker.map = null; // Hide marker
            busMarkerObjects[vehicleId].infowindow.close(); // Close infowindow
            // The AdvancedMarkerElement might need explicit removal/cleanup if not just setting map=null
            // For now, setting map=null is often sufficient to hide and stop rendering.
            delete busMarkerObjects[vehicleId]; // Remove from tracking object
        });

        // console.log(`Currently displaying ${Object.keys(busMarkerObjects).length} bus markers.`); // Less noise

        // Start animation loop if needed
        startAnimationLoop();

    } catch (error) { console.error("Error in fetchAndUpdateMarkers:", error); }
}

function hideRouteElements(routeId) {
     // Hide markers for this specific route ID
     for (const vehicleId in busMarkerObjects) {
          if (busMarkerObjects.hasOwnProperty(vehicleId) && busMarkerObjects[vehicleId].routeId === routeId) {
               busMarkerObjects[vehicleId].gmapMarker.map = null;
               busMarkerObjects[vehicleId].infowindow.close();
          }
     }
     // Hide polylines for this specific route ID
     if (routePolylines[routeId]) {
          routePolylines[routeId].forEach(polyline => polyline.setMap(null));
     }
}

function removeAllMarkers() {
    for (const vehicleId in busMarkerObjects) {
        if (busMarkerObjects.hasOwnProperty(vehicleId)) {
            busMarkerObjects[vehicleId].gmapMarker.map = null;
            busMarkerObjects[vehicleId].infowindow.close();
        }
    }
    busMarkerObjects = {}; // Clear the object
}


// --- Animation Logic ---
function animateMarkers(timestamp) {
    let stillAnimating = false;
    for (const vehicleId in busMarkerObjects) {
        if (!busMarkerObjects.hasOwnProperty(vehicleId)) continue;
        const markerData = busMarkerObjects[vehicleId];

        // Only animate if the marker is currently visible on the map
        if (markerData.isAnimating && markerData.gmapMarker.map !== null) {
            const elapsedTime = timestamp - markerData.startTime;
            const fraction = animationDuration > 0 ? Math.min(1, elapsedTime / animationDuration) : 1;

            if (markerData.startPos && markerData.targetPos) {
                const lat = markerData.startPos.lat + (markerData.targetPos.lat - markerData.startPos.lat) * fraction;
                const lng = markerData.startPos.lng + (markerData.targetPos.lng - markerData.startPos.lng) * fraction;
                markerData.gmapMarker.position = { lat, lng };
            } else { markerData.isAnimating = false; } // Stop animating if start/target are invalid

            if (fraction < 1) {
                stillAnimating = true; // Continue the loop if any marker is still animating
            } else {
                markerData.isAnimating = false; // Animation finished for this marker
                if (markerData.targetPos) markerData.gmapMarker.position = markerData.targetPos;
                markerData.startPos = null; // Clear start position once animation finishes
            }
        } else if (markerData.isAnimating && markerData.gmapMarker.map === null) {
             // If marker was animating but got hidden, stop its animation
             markerData.isAnimating = false;
             markerData.startPos = null;
        }
    } // End for loop

    if (stillAnimating) { animationFrameId = requestAnimationFrame(animateMarkers); }
    else { animationFrameId = null; } // Stop the loop when no markers are animating
}

function startAnimationLoop() {
    // Only start the animation loop if it's not already running AND there are markers needing animation
    if (animationFrameId === null) {
         let needsAnimation = false;
         for (const vehicleId in busMarkerObjects) { if (busMarkerObjects[vehicleId].isAnimating) { needsAnimation = true; break; } }
         if (needsAnimation) {
             animationFrameId = requestAnimationFrame(animateMarkers);
             // console.log("Animation loop started."); // Less noisy
         }
    }
}

// --- Live Update Toggle Logic ---
function toggleLiveUpdates(event) {
     const isChecked = event.target.checked;
     if (isChecked) {
          console.log("Live updates enabled.");
          // Trigger an immediate update when enabling
          fetchAndUpdateMarkers();
          startUpdateInterval();
     } else {
          console.log("Live updates disabled.");
          stopUpdateInterval();
          // Optionally, hide all markers when turning off live updates?
          // removeAllMarkers(); // Decided against removing, just stop updating
     }
}

function startUpdateInterval() {
     // Clear any existing interval first
     stopUpdateInterval();
     // Set new interval (20 seconds = 20000 milliseconds)
     updateIntervalId = setInterval(fetchAndUpdateMarkers, 20000);
     console.log("Update interval started (20s).");
}

function stopUpdateInterval() {
     if (updateIntervalId !== null) {
          clearInterval(updateIntervalId);
          updateIntervalId = null;
          console.log("Update interval stopped.");
     }
}


// --- Helper Functions ---
function clearPolylines() {
     for (const routeId in routePolylines) {
         if (routePolylines.hasOwnProperty(routeId)) {
             routePolylines[routeId].forEach(polyline => polyline.setMap(null));
         }
     }
     routePolylines = {}; // Clear the object
 }

function formatTimestamp(unixTimestamp) {
    if (unixTimestamp === null || typeof unixTimestamp === 'undefined') return 'No Timestamp';
    try {
        const timestampMs = Number(unixTimestamp) * 1000;
        if (isNaN(timestampMs)) return 'Invalid Time Data';
        const date = new Date(timestampMs);
        if (isNaN(date.getTime())) return 'Invalid Date';
        // Add timezone option if needed, but local time is usually fine for a map
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) {
        console.error("Error formatting timestamp:", unixTimestamp, e);
        return 'Time Format Error';
    }
}