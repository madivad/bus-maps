// static/map_data_layer.js
console.log("map_data_layer.js: PARSING.");

import * as G from './map_globals.js';
import { startAnimationLoop, formatTimestamp } from './map_init.js'; // Keep formatTimestamp import
// No need to import updateTimerDisplay, resetCountdown from map_init anymore as countdown is managed there

export async function updateMapData() {
    console.log("updateMapData: STARTED. Current selected routes (G.selectedRealtimeRouteIds):", Array.from(G.selectedRealtimeRouteIds));
    console.log("updateMapData: Current visible routes (G.visibleRealtimeRouteIds):", Array.from(G.visibleRealtimeRouteIds));


    // Clear any existing highlight on the map
    if (G.currentlyHighlightedRouteId) {
        clearRouteHighlight();
    }

    // Clear all map objects (markers and polylines) and the sidebar content
    clearAllMapLayers();
    populateSidebar(); // Re-populate sidebar based on the current selected/visible state

    updateMapTitle();

    // Hide the sidebar if no routes are selected
    if (G.sidebarDiv) { // Check if element exists
        G.sidebarDiv.style.display = G.selectedRealtimeRouteIds.size > 0 ? 'block' : 'none';
    } else {
         console.error("updateMapData: G.sidebarDiv is null!");
    }


    if (G.selectedRealtimeRouteIds.size === 0) {
        console.log("updateMapData: No routes selected. Map will be empty except base layer.");
        // Stop any ongoing data fetch interval if no routes are selected
        if (G.dataFetchIntervalId) {
            clearInterval(G.dataFetchIntervalId);
            G.setDataFetchIntervalId(null);
            console.log("updateMapData: Cleared data fetch interval (no routes selected).");
        }
        return; // Stop processing if no routes are selected
    }

    // Proceed with fetching data only if routes are selected
    const routesParam = Array.from(G.selectedRealtimeRouteIds).join(',');
    console.log("updateMapData: routesParam for API (selected routes):", routesParam);

    // Fetch and draw/update shapes if enabled. Shapes are fetched for *all* selected routes,
    // but their visibility on the map is controlled by G.visibleRealtimeRouteIds inside the drawing function.
    if (G.currentMapOptions.showRoutePathsEnabled) {
        console.log("updateMapData: Route paths ARE enabled. Fetching shapes.");
        // Pass *all selected routes* to fetch shapes, visibility handled internally
        await fetchAndDrawRouteShapes(routesParam);
    } else {
        console.log("updateMapData: Route paths ARE NOT enabled. Skipping shapes.");
        // Ensure existing polylines are cleared if paths were just disabled or already off
        // This is already handled by clearAllMapLayers at the start of updateMapData.
        // Just ensure the G.routePolylines object is empty after clearAllMapLayers, which it is.
    }

    // Clear existing interval before starting a new one or fetching once
    if (G.dataFetchIntervalId) {
        clearInterval(G.dataFetchIntervalId);
        G.setDataFetchIntervalId(null);
        console.log("updateMapData: Cleared existing data fetch interval.");
    }

    // Fetch and update markers. Markers are always fetched for *all* selected routes
    // but their visibility on the map is controlled by G.visibleRealtimeRouteIds inside the updating function.
    console.log("updateMapData: Fetching markers.");
    await fetchAndUpdateMarkers(routesParam); // Initial fetch (for all selected routes)


    if (G.currentMapOptions.liveTrackingEnabled) {
        console.log("updateMapData: Live tracking IS enabled. Starting interval.");
        // The interval fetches data for *all selected routes*. Visibility is handled inside fetchAndUpdateMarkers.
        G.setDataFetchIntervalId(setInterval(async () => {
             // Double-check conditions inside the interval handler as state might change
            if (G.currentMapOptions.liveTrackingEnabled && G.selectedRealtimeRouteIds.size > 0) {
                const currentRoutesParamForInterval = Array.from(G.selectedRealtimeRouteIds).join(',');
                await fetchAndUpdateMarkers(currentRoutesParamForInterval); // Fetch all selected
            } else {
                // If tracking disabled or no routes during an interval cycle, clear interval
                if (G.dataFetchIntervalId) {
                    clearInterval(G.dataFetchIntervalId);
                    G.setDataFetchIntervalId(null);
                    console.log("Interval Tick: Tracking disabled or no routes. Interval STOPPED from within.");
                }
            }
        }, G.currentMapOptions.updateIntervalMs));
        console.log(`updateMapData: Live tracking interval (re)started for ${G.currentMapOptions.updateIntervalMs / 1000}s.`);
    } else {
        console.log("updateMapData: Live tracking IS NOT enabled. Markers fetched once.");
        // Markers were already fetched once above
    }

    console.log("updateMapData: FINISHED.");
}

// NEW: Populate the sidebar with selected routes
export function populateSidebar() {
    console.log("populateSidebar: STARTED.");
    if (!G.sidebarRoutesListDiv) {
         console.error("populateSidebar: G.sidebarRoutesListDiv is null!");
         return;
    }
    G.sidebarRoutesListDiv.innerHTML = ''; // Clear existing list

    if (G.selectedRealtimeRouteIds.size === 0) {
        G.sidebarRoutesListDiv.textContent = 'No routes selected.';
         // Hide sidebar if no routes are selected
         if (G.sidebarDiv) G.sidebarDiv.style.display = 'none';
        console.log("populateSidebar: No selected routes to populate.");
        return;
    }

    // Ensure sidebar is visible if there are selected routes
    if (G.sidebarDiv) G.sidebarDiv.style.display = 'block';

    // Get route details for selected routes from the cache
    const selectedRouteDetails = G.allFetchedRoutesForCurrentOperators.filter(route =>
        G.selectedRealtimeRouteIds.has(route.realtime_id)
    );

    // Sort the list alphabetically/numerically by short name, similar to modal
     const sortedSelectedRoutes = selectedRouteDetails.sort((a, b) => {
         const aParts = a.short_name.split(/[/\s]/); // Split by / or space
         const bParts = b.short_name.split(/[/\s]/);
         const aNum = parseInt(aParts[0], 10);
         const bNum = parseInt(bParts[0], 10);

         if (!isNaN(aNum) && !isNaN(bNum) && aNum !== bNum) return aNum - bNum;
         return a.short_name.localeCompare(b.short_name);
     });


    sortedSelectedRoutes.forEach(route => {
        const routeItemDiv = document.createElement('div');
        routeItemDiv.className = 'sidebar-route-item'; // Use the defined class

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = route.realtime_id;
        checkbox.checked = G.visibleRealtimeRouteIds.has(route.realtime_id); // Check based on VISIBLE status

        const colorDot = document.createElement('span');
        colorDot.className = 'route-color-dot';
        colorDot.style.backgroundColor = G.assignedRouteColors[route.realtime_id] || G.ROUTE_COLORS[0]; // Fallback color

        const labelText = document.createTextNode(`${route.short_name}`); // Display short name in sidebar

        // Append elements to the div
        routeItemDiv.appendChild(colorDot);
        routeItemDiv.appendChild(checkbox);
        routeItemDiv.appendChild(labelText);

        // Add event listener to the checkbox
        checkbox.addEventListener('change', (event) => {
            const routeId = event.target.value;
            const isVisible = event.target.checked;
            toggleRouteVisibility(routeId, isVisible); // Call the toggle function
        });

        G.sidebarRoutesListDiv.appendChild(routeItemDiv);
    });
     console.log(`populateSidebar: Populated sidebar with ${sortedSelectedRoutes.length} routes.`);
}

// NEW: Toggle visibility of a specific route's elements
export function toggleRouteVisibility(routeId, isVisible) {
    console.log(`toggleRouteVisibility: Route ${routeId}, Visible: ${isVisible}`);

    // Update the global visible state
    const currentVisible = new Set(G.visibleRealtimeRouteIds);
    if (isVisible) {
        currentVisible.add(routeId);
    } else {
        currentVisible.delete(routeId);
    }
    G.setVisibleRealtimeRouteIds(currentVisible);

    // Save the updated state
    // Need to import saveStateToLocalStorage from map_state_modals
    // For now, adding a placeholder save call, but proper import/call is needed.
    // Assuming map_state_modals is imported as G.
    // We need a separate export or include it directly here.
    // Let's add it here for now to keep dependencies simpler.
    try {
        // Ideally import saveStateToLocalStorage from map_state_modals
        // But for minimal diff, let's manually save the relevant part
        localStorage.setItem('visibleRealtimeRouteIds', JSON.stringify(Array.from(G.visibleRealtimeRouteIds)));
        console.log(`toggleRouteVisibility: Saved new visible state for ${routeId}.`);
    } catch (e) {
         console.error("toggleRouteVisibility: Error saving visible state:", e);
    }


    // Toggle visibility of polylines for this route
    if (G.routePolylines[routeId]) {
        console.log(`toggleRouteVisibility: Toggling ${G.routePolylines[routeId].length} polylines for ${routeId}.`);
        G.routePolylines[routeId].forEach(polyline => {
            polyline.setMap(isVisible ? G.map : null);
        });
    } else {
         console.log(`toggleRouteVisibility: No polylines found for route ${routeId}.`);
    }


    // Toggle visibility of markers for this route
    let hiddenCount = 0;
    let shownCount = 0;
    for (const vehicleId in G.busMarkerObjects) {
        if (G.busMarkerObjects.hasOwnProperty(vehicleId)) {
            const markerData = G.busMarkerObjects[vehicleId];
            if (markerData.route_id === routeId && markerData.gmapMarker) {
                markerData.gmapMarker.map = isVisible ? G.map : null;
                if (isVisible) {
                    shownCount++;
                } else {
                    hiddenCount++;
                    // If hiding a marker, close its infowindow if it's the currently open one
                     if (G.currentlyOpenInfoWindow === markerData.infowindow) {
                         console.log(`toggleRouteVisibility: Closing infowindow for hidden vehicle ${vehicleId}.`);
                         markerData.infowindow.close();
                         G.setCurrentlyOpenInfoWindow(null); // Clear the global tracker
                     }
                }
            }
        }
    }
    console.log(`toggleRouteVisibility: Toggled ${shownCount + hiddenCount} markers for ${routeId} (Shown: ${shownCount}, Hidden: ${hiddenCount}).`);

    // Update highlight styles after toggling visibility
     if (G.currentlyHighlightedRouteId) {
        // If a route is highlighted, re-apply styles to ensure correct emphasis
        // If the route being toggled is the highlighted one and it's hidden, clear highlight
        if (!isVisible && G.currentlyHighlightedRouteId === routeId) {
             clearRouteHighlight();
        } else {
             // Re-apply styles to ensure correct de-emphasis/emphasis based on current visibility
             // Calling applyPolylineStyles with the currently highlighted ID will update based on visibility
             applyPolylineStyles(G.currentlyHighlightedRouteId, true);
        }
    }

}


export function updateMapTitle() {
    if (!G.mapTitleH3) { console.error("updateMapTitle: G.mapTitleH3 is null!"); return; }
    if (G.selectedOperatorIds.size === 0) {
        G.mapTitleH3.textContent = 'No operator selected';
        return;
    }
    let title = `Tracking routes: `;
    // Show short names for *selected* routes in the title
    if (G.selectedRealtimeRouteIds.size === 0) {
        title += "None selected";
    } else {
        const shortNames = Array.from(G.selectedRealtimeRouteIds).map(rtId => {
            const parts = rtId.split('_');
            return parts.length > 1 ? parts[parts.length - 1] : rtId; // Get the part after "AGENCYID_"
        }).sort((a,b) => { // Basic numeric sort for route numbers like "50", "100" then alpha for "N70"
            const numA = parseInt(a.match(/\d+/)?.[0]); // Extracts first number sequence
            const numB = parseInt(b.match(/\d+/)?.[0]);
            if (!isNaN(numA) && !isNaN(numB) && numA !== numB) return numA - numB;
            return a.localeCompare(b); // Fallback to alphanumeric for "XPT", "N70" or if numbers are same
        });
        title += shortNames.join(', ');
    }
    G.mapTitleH3.textContent = title;
}

export function clearAllMapLayers() {
    console.log("clearAllMapLayers: STARTED.");
    // Clear polylines from map
    for (const routeId in G.routePolylines) {
        if (G.routePolylines.hasOwnProperty(routeId)) {
            console.log(`clearAllMapLayers: Clearing polylines for ${routeId}`);
            G.routePolylines[routeId].forEach(polyline => {
                 if (polyline && typeof polyline.setMap === 'function') {
                      polyline.setMap(null);
                 } else {
                      console.warn(`clearAllMapLayers: Found invalid polyline object for route ${routeId}`, polyline);
                 }
            });
        }
    }
    G.setRoutePolylines({}); // Reset the storage object


    // Clear markers from map
    for (const vehicleId in G.busMarkerObjects) {
        if (G.busMarkerObjects.hasOwnProperty(vehicleId)) {
             console.log(`clearAllMapLayers: Clearing marker for vehicle ${vehicleId}`);
            const markerData = G.busMarkerObjects[vehicleId];
            if (markerData.gmapMarker) {
                 if (typeof markerData.gmapMarker.map === 'object' && markerData.gmapMarker.map !== null) {
                     // For AdvancedMarkerElement, setting map = null is the way to remove it
                     markerData.gmapMarker.map = null;
                 }
                 // Close infowindow if it exists and is open
                 if (markerData.infowindow && G.currentlyOpenInfoWindow === markerData.infowindow) {
                      markerData.infowindow.close();
                      G.setCurrentlyOpenInfoWindow(null); // Clear the global tracker
                 }
            } else {
                 console.warn(`clearAllMapLayers: Found marker data for vehicle ${vehicleId} but no gmapMarker object.`, markerData);
            }
        }
    }
    G.setBusMarkerObjects({}); // Reset the storage object


    // Clear sidebar list content
    if (G.sidebarRoutesListDiv) {
         G.sidebarRoutesListDiv.innerHTML = '';
         G.sidebarRoutesListDiv.textContent = 'No routes selected.'; // Default text
    }
    // Hide sidebar if no routes are selected
    if (G.sidebarDiv) {
        G.sidebarDiv.style.display = G.selectedRealtimeRouteIds.size > 0 ? 'block' : 'none';
    }


    // Cancel any ongoing animation frame
    if (G.animationFrameId) {
        console.log("clearAllMapLayers: Cancelling animation frame:", G.animationFrameId);
        cancelAnimationFrame(G.animationFrameId);
        G.setAnimationFrameId(null);
    }
    console.log("clearAllMapLayers: FINISHED. Polylines, markers, and sidebar content cleared.");
}


async function fetchAndDrawRouteShapes(routesParam) {
    if (!routesParam || G.currentMapOptions.showRoutePathsEnabled === false) { // Explicitly check option
        console.log("fetchAndDrawRouteShapes: No routesParam or showRoutePathsEnabled is false, skipping.");
        // Ensure polylines are cleared if paths were just disabled
        // This is handled by clearAllMapLayers at the start of updateMapData
        return;
    }
    console.log("fetchAndDrawRouteShapes: Fetching for routes:", routesParam);
    try {
        const response = await fetch(`/api/route_shapes?routes=${routesParam}`);
        if (!response.ok) {
            console.error(`fetchAndDrawRouteShapes: HTTP error ${response.status} for routes ${routesParam}`);
            return;
        }
        const shapesData = await response.json();
        if (Object.keys(shapesData).length === 0) {
            console.log("fetchAndDrawRouteShapes: No shape data received from API for routes:", routesParam);
            return;
        }

        // Create a temporary object to build the new polylines
        const tempRoutePolylines = {}; // Use a temp object to avoid modifying G.routePolylines mid-loop

        for (const routeId in shapesData) {
            if (!shapesData.hasOwnProperty(routeId) || !G.selectedRealtimeRouteIds.has(routeId)) {
                 // Only process shapes for routes that are still selected
                 continue;
            }

            // Clear existing polylines for this routeId before adding new ones
            // This step is actually handled by clearAllMapLayers *before* calling this function
            // So we just initialize the array for the new polylines for this routeId
             tempRoutePolylines[routeId] = [];

            const shapes = shapesData[routeId];
            if (!Array.isArray(shapes)) {
                console.warn(`Shapes for route ${routeId} is not an array:`, shapes);
                continue;
            }

            // Determine the color for this route (should be assigned in map_state_modals)
            let colorForPolyline = G.assignedRouteColors[routeId] || '#FF0000'; // Default to red if missing
            if (!G.assignedRouteColors[routeId] && routeId !== 'N/A') {
                // Fallback color assignment if somehow missed during modal save
                let hash = 0; for (let i = 0; i < routeId.length; i++) { hash = routeId.charCodeAt(i) + ((hash << 5) - hash); hash = hash & hash; }
                colorForPolyline = G.ROUTE_COLORS[Math.abs(hash) % G.ROUTE_COLORS.length];
                // Note: This fallback doesn't save the color to localStorage, assignment should happen in modal save.
            }

            const isRouteVisible = G.visibleRealtimeRouteIds.has(routeId); // Check visibility state


            shapes.forEach((pathPoints) => {
                if (!Array.isArray(pathPoints) || pathPoints.length < 2) {
                     console.warn(`Invalid pathPoints array for route ${routeId}:`, pathPoints);
                     return;
                }
                 // Filter out any points that don't look like valid lat/lng objects
                const validPathPoints = pathPoints.filter(p => typeof p?.lat === 'number' && typeof p?.lng === 'number');
                if (validPathPoints.length < 2) {
                    console.warn(`Not enough valid coordinate points for polyline on route ${routeId}`);
                    return;
                }

                try {
                    const polyline = new google.maps.Polyline({
                        path: validPathPoints,
                        geodesic: true, // Consider if geodesic is appropriate or creates performance issues
                        strokeColor: colorForPolyline,
                        strokeOpacity: G.DEFAULT_POLYLINE_OPACITY, // Start with default opacity
                        strokeWeight: G.DEFAULT_POLYLINE_WEIGHT,   // Start with default weight
                        zIndex: G.DEFAULT_POLYLINE_ZINDEX,         // Start with default zIndex
                        clickable: true, // Make the polyline clickable
                        map: isRouteVisible ? G.map : null // Set map property based on visibility
                    });

                    // Store the polyline in the temporary object
                    tempRoutePolylines[routeId].push(polyline);

                    // Add click listener to the polyline itself
                    const currentRouteIdForListener = routeId; // Capture routeId for the listener
                    polyline.addListener('click', () => {
                        console.log(`Polyline for route ${currentRouteIdForListener} clicked.`);
                         // Only handle interaction if the polyline is currently visible on the map
                         if (G.visibleRealtimeRouteIds.has(currentRouteIdForListener)) {
                              handleRouteInteraction(currentRouteIdForListener);
                         } else {
                              console.log(`Ignoring click on polyline for hidden route ${currentRouteIdForListener}.`);
                         }
                });

                } catch (e) {
                    console.error(`fetchAndDrawRouteShapes: Error creating polyline for ${routeId}`, e, validPathPoints);
                }
            });

             // Apply initial highlight styles if this route is currently highlighted
            if (G.currentlyHighlightedRouteId === routeId) {
                 applyPolylineStyles(routeId, true);
            }
        }
        G.setRoutePolylines(tempRoutePolylines); // Update global store with the new polylines

    } catch (error) {
        console.error("fetchAndDrawRouteShapes: General error:", error);
    }
    console.log("fetchAndDrawRouteShapes: FINISHED.");
}

export async function fetchAndUpdateMarkers(routesParam) {
     // This function fetches data for *all selected* routes but updates/creates markers
     // on the map only for those that are *visible*.
    if (!routesParam) {
        console.log("fetchAndUpdateMarkers: No routesParam, skipping fetch.");
        return;
    }
    if (G.currentMapOptions.liveTrackingEnabled === false) {
         console.log("fetchAndUpdateMarkers: Live tracking is disabled, skipping periodic fetch.");
         // If called once when live tracking is off, this check prevents the log spam
         // but the initial fetch still happens before this check.
    }

    console.log("fetchAndUpdateMarkers: Fetching data for routes:", routesParam);

    try {
        const response = await fetch(`/api/bus_data?routes=${routesParam}`);
        if (!response.ok) {
            console.error(`fetchAndUpdateMarkers: HTTP error ${response.status} for routes ${routesParam}`);
            // Potentially clear markers or show error state? For now, just log.
            return;
        }
        const busData = await response.json();
        console.log(`fetchAndUpdateMarkers: Received ${busData.length} vehicles.`);

        const updatedVehicleIds = new Set();
        const newBusMarkerObjects = { ...G.busMarkerObjects }; // Work on a copy

        busData.forEach(bus => {
            const vehicleId = bus.vehicle_id;
            const routeId = bus.route_id || 'N/A';

            // Crucially, only process and potentially display markers for routes that are *selected*.
            // If a bus appears for a route not in G.selectedRealtimeRouteIds, ignore it.
            if (!vehicleId || vehicleId === 'N/A' || typeof bus.latitude !== 'number' || typeof bus.longitude !== 'number' || !G.selectedRealtimeRouteIds.has(routeId)) {
                 if (!G.selectedRealtimeRouteIds.has(routeId)) {
                      // console.log(`fetchAndUpdateMarkers: Ignoring bus ${vehicleId} on route ${routeId} as the route is not selected.`);
                 }
                return;
            }
            updatedVehicleIds.add(vehicleId);

            const newPosition = { lat: bus.latitude, lng: bus.longitude };
            const bearing = Number(bus.bearing) ?? 0; // Default to 0 if bearing is null/undefined
            const routeShortName = routeId.includes('_') ? routeId.split('_').pop() : routeId;
            const speedDisplay = bus.speed || 'N/A';
            const timeDisplay = formatTimestamp(bus.raw_timestamp);

            let markerColor = G.assignedRouteColors[routeId] || '#FF0000'; // Default to red if no color assigned


            const currentInfoContent = `
                <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4; max-width: 200px;">
                    <strong>Route:</strong> <span style="color:${markerColor}; font-weight:bold;">${routeId}</span><br>
                    <strong>Vehicle:</strong> ${vehicleId}<br>
                    ${speedDisplay !== 'N/A' ? `<strong>Speed:</strong> ${speedDisplay}<br>` : ''}
                    <strong>Last Update:</strong> ${timeDisplay}
                    ${bus.latitude && bus.longitude ? `<br><strong>Coords:</strong> ${bus.latitude.toFixed(5)}, ${bus.longitude.toFixed(5)}` : ''}
                </div>`;

            const iconSize = 50; // Keep icon size consistent
            const fontSize = routeShortName.length > 3 ? 7 : (routeShortName.length > 2 ? 8 : 10); // Adjust font size based on length

            // Create the SVG content for the marker icon
            const svgContent = `
                <svg version="1.1" width="${iconSize}" height="${iconSize}" xmlns="http://www.w3.org/2000/svg">
                    <g transform="rotate(${bearing}, ${iconSize/2}, ${iconSize/2})">
                        <polygon points="${iconSize *.5},${iconSize * .2} ${iconSize *.7},${iconSize * .3} ${iconSize *.65},${iconSize * .7} ${iconSize *.35},${iconSize * .7} ${iconSize *.3},${iconSize * .3}" fill="${markerColor}" stroke="black" stroke-width="1.5"/>
                        <circle cx="${iconSize / 2}" cy="${iconSize * .5}" r="${iconSize *.15}" fill="black"/>
                        <text x="${iconSize / 2}" y="${iconSize / 2}" font-size="${fontSize}" text-anchor="middle" dominant-baseline="central" fill="white" font-family="Arial, sans-serif" transform="rotate(${-bearing}, ${iconSize/2}, ${iconSize/2})">${routeShortName}</text>
                    </g>
                </svg>`;

            const isRouteVisible = G.visibleRealtimeRouteIds.has(routeId); // Check visibility state

            if (newBusMarkerObjects[vehicleId]) {
                // Marker exists, update it
                const md = newBusMarkerObjects[vehicleId];

                // Update marker content (icon and infowindow content)
                if (md.gmapMarker) {
                    md.gmapMarker.title = `Route: ${routeId}\nVehicle: ${vehicleId}\nSpeed: ${speedDisplay}\nTime: ${timeDisplay}`;
                     if (md.gmapMarker.content instanceof HTMLElement) {
                         md.gmapMarker.content.innerHTML = svgContent; // Update SVG content directly
                     } else {
                          // If content wasn't HTML element (e.g., old marker), replace it
                          const el = document.createElement('div');
                          el.innerHTML = svgContent;
                          el.style.cursor = 'pointer';
                          md.gmapMarker.content = el;
                           // Need to re-add click listener if content element was replaced? Advanced Markers might bind to the element itself.
                           // Assuming the event listener remains bound to the AdvancedMarkerElement instance.
                     }
                     // Ensure the marker's map property is correct based on current visibility
                     md.gmapMarker.map = isRouteVisible ? G.map : null;
                } else {
                     console.warn(`fetchAndUpdateMarkers: Marker data for ${vehicleId} exists but gmapMarker is null.`);
                }

                // Update InfoWindow content
                if (md.infowindow) {
                    md.infowindow.setContent(currentInfoContent);
                    // If this infowindow is currently open, update its position (optional, Google Maps usually handles)
                    // and ensure it stays open if the marker is visible
                    if (G.currentlyOpenInfoWindow === md.infowindow && !isRouteVisible) {
                        // If the route just became hidden and its infowindow was open, close it
                        console.log(`fetchAndUpdateMarkers: Closing infowindow for vehicle ${vehicleId} as its route ${routeId} is now hidden.`);
                        md.infowindow.close();
                        G.setCurrentlyOpenInfoWindow(null);
                    }
                } else {
                     // Should not happen if created correctly, but as a fallback: create it
                     md.infowindow = new google.maps.InfoWindow({ content: currentInfoContent, ariaLabel: `Bus ${vehicleId}`});
                     // Need to add closeclick listener here too if we are recreating it
                     md.infowindow.addListener('closeclick', () => {
                         if (G.currentlyOpenInfoWindow === md.infowindow) {
                             G.setCurrentlyOpenInfoWindow(null);
                         }
                     });
                }


                // Handle position animation
                const currentMarkerPosition = md.gmapMarker?.position; // Use optional chaining
                if (currentMarkerPosition && // Check if we have a valid current position
                    (Math.abs(currentMarkerPosition.lat - newPosition.lat) > 1e-6 || Math.abs(currentMarkerPosition.lng - newPosition.lng) > 1e-6)) { // Check if new position is different
                    // Position has changed, start/continue animation
                    // Check if we need to start a NEW animation segment (either wasn't animating or target changed)
                    if (!md.isAnimating || md.targetPos?.lat !== newPosition.lat || md.targetPos?.lng !== newPosition.lng) {
                        md.startPos = { lat: currentMarkerPosition.lat, lng: currentMarkerPosition.lng };
                        md.targetPos = newPosition;
                        md.startTime = performance.now();
                        md.isAnimating = true;
                        // console.log(`  Vehicle ${vehicleId}: New animation segment started.`);
                    } else {
                         // console.log(`  Vehicle ${vehicleId}: Continuing existing animation.`);
                         // Animation is already running towards the correct target. No need to reset startTime.
                    }
                } else if (currentMarkerPosition) {
                     // Position is the same or very close, ensure animation is off and position is exact
                     // console.log(`  Vehicle ${vehicleId}: Position unchanged, ensuring animation is off.`);
                    md.isAnimating = false;
                    md.startPos = null; // Clear start pos as we are at the final position
                    if (md.gmapMarker && typeof md.gmapMarker.position === 'object') { // Ensure position is mutable
                        md.gmapMarker.position = newPosition; // Snap to exact new position
                    } else if (md.gmapMarker) {
                         console.warn(`fetchAndUpdateMarkers: gmapMarker.position for ${vehicleId} is unexpectedly not an object.`);
                    }
                } else {
                    // Marker had no previous position (might be new or somehow lost it)
                     console.log(`  Vehicle ${vehicleId}: No previous position, snapping to new position.`);
                     md.isAnimating = false;
                     md.startPos = null;
                     if (md.gmapMarker && typeof md.gmapMarker.position === 'object') {
                         md.gmapMarker.position = newPosition;
                     } else if (md.gmapMarker) {
                         console.warn(`fetchAndUpdateMarkers: gmapMarker.position for ${vehicleId} is unexpectedly null or not an object.`);
                     }
                }
                // Store the route_id on the marker data for easy lookup later
                 md.route_id = routeId;

            } else {
                // Marker is new, create it
                 console.log(`  Vehicle ${vehicleId}: Creating new marker.`);
                const el = document.createElement('div');
                el.innerHTML = svgContent;
                el.style.cursor = 'pointer';

                const newMarker = new google.maps.marker.AdvancedMarkerElement({
                    map: isRouteVisible ? G.map : null, // Set map property based on visibility
                    position: newPosition,
                    content: el,
                    title: `R: ${routeId} V: ${vehicleId}`, // Tooltip title
                    zIndex: 100, // Ensure markers are above polylines
                    gmpClickable: true // Essential for catching click events
                });

                const infowindow = new google.maps.InfoWindow({
                    content: currentInfoContent,
                    ariaLabel: `Bus ${vehicleId}`
                });

                // Add listener for the InfoWindow's own close button
                infowindow.addListener('closeclick', () => {
                    // If this infowindow was the one being tracked as open, clear the tracker
                    if (G.currentlyOpenInfoWindow === infowindow) {
                        G.setCurrentlyOpenInfoWindow(null);
                        console.log(`InfoWindow for ${vehicleId} closed via its 'x' button.`);
                    }
                });

                const capturedVehicleId = vehicleId;
                const capturedRouteId = routeId;
                newMarker.addEventListener('gmp-click', () => {
                    console.log(`gmp-click FIRED for vehicleId: ${capturedVehicleId}`);
                    // Only handle interaction if the marker's route is currently visible on the map
                    if (G.visibleRealtimeRouteIds.has(capturedRouteId)) {
                         const currentMarkerData = newBusMarkerObjects[capturedVehicleId]; // Get data from the potentially updated object
                         if (currentMarkerData && currentMarkerData.infowindow) {
                             // Close any previously open InfoWindow that is NOT this one
                             if (G.currentlyOpenInfoWindow && G.currentlyOpenInfoWindow !== currentMarkerData.infowindow) {
                                 console.log("Closing previously open InfoWindow.");
                                 G.currentlyOpenInfoWindow.close();
                             }
                             // Open the new one and track it
                             try {
                                 currentMarkerData.infowindow.open({ anchor: currentMarkerData.gmapMarker, map: G.map });
                                 G.setCurrentlyOpenInfoWindow(currentMarkerData.infowindow); // Track this as the open one
                             } catch (e) {
                                 console.error('  ERROR calling infowindow.open:', e);
                                 G.setCurrentlyOpenInfoWindow(null); // Ensure tracker is cleared on error
                             }
                         } else {
                             console.error('  gmp-click: currentMarkerData or currentMarkerData.infowindow is missing or invalid.');
                         }
                         handleRouteInteraction(capturedRouteId); // Highlight the route path
                    } else {
                         console.log(`Ignoring click on marker for hidden route ${capturedRouteId}.`);
                         // If clicking a hidden marker, close any open infowindow but don't highlight
                          if (G.currentlyOpenInfoWindow) {
                            G.currentlyOpenInfoWindow.close();
                            G.setCurrentlyOpenInfoWindow(null);
                          }
                           // Maybe provide feedback? E.g., "Route is hidden in the sidebar"
                    }
                });

                newBusMarkerObjects[vehicleId] = {
                    gmapMarker: newMarker,
                    infowindow: infowindow,
                    isAnimating: false,
                    startPos: null,
                    targetPos: newPosition,
                    startTime: 0,
                    route_id: routeId // Store route_id on the marker data
                };
            }
        });

        // Remove markers for vehicles that are no longer in the fetched data
        const vehiclesToRemove = Object.keys(newBusMarkerObjects).filter(vid => !updatedVehicleIds.has(vid));
        vehiclesToRemove.forEach(vid => {
            console.log(`fetchAndUpdateMarkers: Removing vehicle ${vid} (no longer in feed).`);
            const markerData = newBusMarkerObjects[vid];
            if (markerData.gmapMarker) {
                // If the marker being removed had the currently open infowindow, clear the tracker
                if (G.currentlyOpenInfoWindow && markerData.infowindow === G.currentlyOpenInfoWindow) {
                    G.setCurrentlyOpenInfoWindow(null);
                }
                markerData.gmapMarker.map = null; // Remove from map
            }
            delete newBusMarkerObjects[vid]; // Remove from our object
        });

        G.setBusMarkerObjects(newBusMarkerObjects); // Update global store
        startAnimationLoop(); // Ensure animation loop is running if any markers need it

    } catch (error) {
        console.error("fetchAndUpdateMarkers: General error:", error);
        // Decide how to handle fetch errors - e.g., keep old markers, clear them, show error message
        // For now, old markers remain, new data just isn't processed.
    }
}

function applyPolylineStyles(routeIdToStyle, isHighlight) {
    for (const polylineRouteId in G.routePolylines) {
        if (G.routePolylines.hasOwnProperty(polylineRouteId)) {
            G.routePolylines[polylineRouteId].forEach(polyline => {
                // Only apply styles if the polyline is currently visible on the map
                if (polyline.getMap() === G.map) { // Check if setMap(G.map) was called
                    if (polylineRouteId === routeIdToStyle) {
                        polyline.setOptions({
                            strokeOpacity: G.HIGHLIGHTED_POLYLINE_OPACITY,
                            strokeWeight: G.HIGHLIGHTED_POLYLINE_WEIGHT,
                            zIndex: G.HIGHLIGHTED_POLYLINE_ZINDEX
                        });
                    } else { // De-emphasize other routes if a highlight is active
                        polyline.setOptions({
                            strokeOpacity: isHighlight ? G.DEEMPHASIZED_POLYLINE_OPACITY : G.DEFAULT_POLYLINE_OPACITY,
                            strokeWeight: isHighlight ? G.DEEMPHASIZED_POLYLINE_WEIGHT : G.DEFAULT_POLYLINE_WEIGHT,
                            zIndex: G.DEFAULT_POLYLINE_ZINDEX
                        });
                    }
                }
                 // If polyline.getMap() is null, styles are irrelevant until it's shown again.
            });
        }
    }
}

export function handleRouteInteraction(clickedRouteId) {
    console.log(`Handling interaction for route: ${clickedRouteId}`);
    if (!clickedRouteId || clickedRouteId === 'N/A') {
        if (G.currentlyHighlightedRouteId) {
            clearRouteHighlight();
        }
        return;
    }

     // Ensure the route is currently visible before allowing interaction
    if (!G.visibleRealtimeRouteIds.has(clickedRouteId)) {
         console.log(`Interaction ignored for route ${clickedRouteId} as it is not currently visible.`);
         // Optional: If something triggers this for a hidden route, clear any active highlight
         if (G.currentlyHighlightedRouteId) {
              clearRouteHighlight();
         }
         return;
    }


    if (G.currentlyHighlightedRouteId === clickedRouteId) {
        // Clicked the same route again, so clear highlight
        clearRouteHighlight();
    } else {
        // New route selected or first highlight
        G.setCurrentlyHighlightedRouteId(clickedRouteId);
        applyPolylineStyles(clickedRouteId, true); // true for highlighting
        console.log(`Route ${clickedRouteId} highlighted.`);
    }
}

export function clearRouteHighlight() {
    if (!G.currentlyHighlightedRouteId) {
        // console.log("clearRouteHighlight: No route currently highlighted.");
        return;
    }
    console.log("Clearing route highlight for:", G.currentlyHighlightedRouteId);
     // Revert all polylines that are currently on the map to default styles
    for (const routeId in G.routePolylines) {
        if (G.routePolylines.hasOwnProperty(routeId)) {
             G.routePolylines[routeId].forEach(polyline => {
                 if (polyline.getMap() === G.map) { // Check if setMap(G.map) was called
                      polyline.setOptions({
                          strokeOpacity: G.DEFAULT_POLYLINE_OPACITY,
                          strokeWeight: G.DEFAULT_POLYLINE_WEIGHT,
                          zIndex: G.DEFAULT_POLYLINE_ZINDEX
                      });
                 }
             });
        }
    }
    G.setCurrentlyHighlightedRouteId(null);
    console.log("All route highlights cleared.");
}

console.log("map_data_layer.js: FINISHED PARSING.");