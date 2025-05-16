// static/map_data_layer.js
console.log("map_data_layer.js: PARSING.");

import * as G from './map_globals.js';
import { startAnimationLoop, formatTimestamp } from './map_init.js';

export async function updateMapData() {
    console.log("updateMapData: STARTED. Current selected routes (G.selectedRealtimeRouteIds):", Array.from(G.selectedRealtimeRouteIds));

    if (G.currentlyHighlightedRouteId) {
    clearRouteHighlight(); 

    clearAllMapLayers();
    updateMapTitle();

    if (G.selectedRealtimeRouteIds.size === 0) {
        console.log("updateMapData: No routes selected. Map will be empty.");
        if (G.dataFetchIntervalId) {
            clearInterval(G.dataFetchIntervalId);
            G.setDataFetchIntervalId(null);
            console.log("updateMapData: Cleared data fetch interval (no routes).");
        }
        return;
    }

    const routesParam = Array.from(G.selectedRealtimeRouteIds).join(',');
    console.log("updateMapData: routesParam for API:", routesParam);

    if (G.currentMapOptions.showRoutePathsEnabled) {
        console.log("updateMapData: Route paths ARE enabled. Fetching shapes.");
        await fetchAndDrawRouteShapes(routesParam);
    } else {
        console.log("updateMapData: Route paths ARE NOT enabled. Skipping shapes.");
        // Ensure existing polylines are cleared if paths were just disabled
        for (const routeId in G.routePolylines) {
            if (G.routePolylines.hasOwnProperty(routeId)) {
                G.routePolylines[routeId].forEach(polyline => polyline.setMap(null));
            }
        }
        G.setRoutePolylines({}); // Clear the store
    }

    // Clear existing interval before starting a new one or fetching once
    if (G.dataFetchIntervalId) {
        clearInterval(G.dataFetchIntervalId);
        G.setDataFetchIntervalId(null);
        console.log("updateMapData: Cleared existing data fetch interval.");
    }

    if (G.currentMapOptions.liveTrackingEnabled) {
        console.log("updateMapData: Live tracking IS enabled. Fetching markers and starting interval.");
        await fetchAndUpdateMarkers(routesParam); // Initial fetch

        G.setDataFetchIntervalId(setInterval(async () => {
            if (G.currentMapOptions.liveTrackingEnabled && G.selectedRealtimeRouteIds.size > 0) {
                const currentRoutesParamForInterval = Array.from(G.selectedRealtimeRouteIds).join(',');
                await fetchAndUpdateMarkers(currentRoutesParamForInterval);
            } else {
                if (G.dataFetchIntervalId) { // If tracking disabled or no routes during an interval cycle
                    clearInterval(G.dataFetchIntervalId);
                    G.setDataFetchIntervalId(null);
                    console.log("Interval Tick: Tracking disabled or no routes. Interval STOPPED from within.");
                }
            }
        }, G.currentMapOptions.updateIntervalMs));
        console.log(`updateMapData: Live tracking interval (re)started for ${G.currentMapOptions.updateIntervalMs / 1000}s.`);
    } else {
        console.log("updateMapData: Live tracking IS NOT enabled. Fetching markers once.");
        await fetchAndUpdateMarkers(routesParam); // Fetch once if tracking is off but routes are selected
    }
    console.log("updateMapData: FINISHED.");
}

export function updateMapTitle() {
    if (!G.mapTitleH3) { console.error("updateMapTitle: G.mapTitleH3 is null!"); return; }
    if (G.selectedOperatorIds.size === 0) {
        G.mapTitleH3.textContent = 'No operator selected';
        return;
    }
    let title = `Tracking routes: `;
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
    // Clear polylines
    for (const routeId in G.routePolylines) {
        if (G.routePolylines.hasOwnProperty(routeId)) {
            G.routePolylines[routeId].forEach(polyline => polyline.setMap(null));
        }
    }
    G.setRoutePolylines({}); // Reset the storage object

    // Clear markers
    for (const vehicleId in G.busMarkerObjects) {
        if (G.busMarkerObjects.hasOwnProperty(vehicleId)) {
            if (G.busMarkerObjects[vehicleId].gmapMarker) {
                // For AdvancedMarkerElement, setting map to null might not be the direct way.
                // Instead, we just stop tracking it. The new Advanced Markers are removed when their content element is removed or map property is null.
                // If using older google.maps.Marker, marker.setMap(null) is correct.
                // Assuming AdvancedMarkerElement, not having it on the map (e.g. map: null at creation)
                // or clearing the busMarkerObjects store is the primary way to "remove" them.
                // Let's ensure they are explicitly set to map: null if possible.
                G.busMarkerObjects[vehicleId].gmapMarker.map = null; // Explicitly disassociate from map
            }
        }
    }
    G.setBusMarkerObjects({}); // Reset the storage object

    // Cancel any ongoing animation frame
    if (G.animationFrameId) {
        cancelAnimationFrame(G.animationFrameId);
        G.setAnimationFrameId(null);
    }
    console.log("clearAllMapLayers: FINISHED. Polylines and markers cleared from G stores.");
}

async function fetchAndDrawRouteShapes(routesParam) {
    if (!routesParam) {
        console.log("fetchAndDrawRouteShapes: No routesParam provided, skipping.");
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

        const newRoutePolylines = { ...G.routePolylines }; // Work on a copy

        for (const routeId in shapesData) {
            if (!shapesData.hasOwnProperty(routeId)) continue;

            // Clear existing polylines for this routeId before drawing new ones
            if (newRoutePolylines[routeId]) {
                newRoutePolylines[routeId].forEach(p => p.setMap(null));
            }
            newRoutePolylines[routeId] = []; // Initialize array for new polylines

            const shapes = shapesData[routeId];
            if (!Array.isArray(shapes)) {
                console.warn(`Shapes for route ${routeId} is not an array:`, shapes);
                continue;
            }

            let colorForPolyline = G.assignedRouteColors[routeId]; // || G.ROUTE_COLORS[0];
            if (!colorForPolyline) {
                let hash = 0;
                for (let i = 0; i < routeId.length; i++) {
                    hash = routeId.charCodeAt(i) + ((hash << 5) - hash);
                    hash = hash & hash; // Convert to 32bit integer
                }
                colorForPolyline = G.ROUTE_COLORS[Math.abs(hash) % G.ROUTE_COLORS.length];
                // G.assignedRouteColors[routeId] = colorForPolyline; // Color assignment is in map_state_modals
            }
            
            shapes.forEach((pathPoints) => {
                if (!Array.isArray(pathPoints) || pathPoints.length < 2) {
                     console.warn(`Invalid pathPoints for route ${routeId}:`, pathPoints);
                     return;
                }
                const validPathPoints = pathPoints.filter(p => typeof p?.lat === 'number' && typeof p?.lng === 'number');
                if (validPathPoints.length < 2) {
                    console.warn(`Not enough valid points for polyline on route ${routeId}`);
                    return;
                }

                try {
                    const polyline = new google.maps.Polyline({
                        path: validPathPoints,
                        geodesic: true,
                        strokeColor: colorForPolyline,
                        strokeOpacity: G.DEFAULT_POLYLINE_OPACITY, // Uses global constant
                        strokeWeight: G.DEFAULT_POLYLINE_WEIGHT,   // Uses global constant
                        zIndex: G.DEFAULT_POLYLINE_ZINDEX,         // Uses global constant
                        clickable: true // Make the polyline clickable
                    });
                    polyline.setMap(G.map);
                    newRoutePolylines[routeId].push(polyline);

                    // Add click listener to the polyline itself
                    const currentRouteIdForListener = routeId; // Capture routeId for the listener
                    polyline.addListener('click', () => {
                        console.log(`Polyline for route ${currentRouteIdForListener} clicked.`);
                        handleRouteInteraction(currentRouteIdForListener);
                });

                } catch (e) {
                    console.error(`fetchAndDrawRouteShapes: Error creating polyline for ${routeId}`, e, validPathPoints);
                }
            });
        }
        G.setRoutePolylines(newRoutePolylines); // Update global store
    } catch (error) {
        console.error("fetchAndDrawRouteShapes: General error:", error);
    }
    console.log("fetchAndDrawRouteShapes: FINISHED.");
}

export async function fetchAndUpdateMarkers(routesParam) {
    if (!routesParam) {
        return;
    }
    try {
        const response = await fetch(`/api/bus_data?routes=${routesParam}`);
        if (!response.ok) {
            console.error(`fetchAndUpdateMarkers: HTTP error ${response.status} for routes ${routesParam}`);
            return;
        }
        const busData = await response.json();
        const updatedVehicleIds = new Set();
        const newBusMarkerObjects = { ...G.busMarkerObjects }; 

        busData.forEach(bus => {
            const vehicleId = bus.vehicle_id;
            if (!vehicleId || vehicleId === 'N/A' || typeof bus.latitude !== 'number' || typeof bus.longitude !== 'number') {
                return;
            }
            updatedVehicleIds.add(vehicleId);

            const newPosition = { lat: bus.latitude, lng: bus.longitude };
            const bearing = Number(bus.bearing) ?? 0;
            const routeId = bus.route_id || 'N/A';
            const routeShortName = routeId.includes('_') ? routeId.split('_').pop() : routeId;
            const speedDisplay = bus.speed || 'N/A'; 
            const timeDisplay = formatTimestamp(bus.raw_timestamp); 

            let arrowStrokeColor = G.assignedRouteColors[routeId] || '#FF0000'; 
             if (!G.assignedRouteColors[routeId] && routeId !== 'N/A') { 
                let hash = 0; for (let i = 0; i < routeId.length; i++) { hash = routeId.charCodeAt(i) + ((hash << 5) - hash); hash = hash & hash; }
                arrowStrokeColor = G.ROUTE_COLORS[Math.abs(hash) % G.ROUTE_COLORS.length];
            }

            const currentInfoContent = `
                <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4;">
                    <strong>Route:</strong> <span style="color:${arrowStrokeColor}; font-weight:bold;">${routeId}</span><br>
                    <strong>Vehicle:</strong> ${vehicleId}<br><strong>Speed:</strong> ${speedDisplay}<br>
                    <strong>Last Update:</strong> ${timeDisplay}<br>
                    <strong>Coords:</strong> ${bus.latitude.toFixed(5)}, ${bus.longitude.toFixed(5)}
                </div>`;
            
            const iconSize = 50;
            const fontSize = routeShortName.length > 2 ? 8 : 10;

            const svgContent = `
                <svg version="1.1" width="${iconSize}" height="${iconSize}" xmlns="http://www.w3.org/2000/svg">
                    <g transform="rotate(${bearing}, ${iconSize/2}, ${iconSize/2})">
                        <polygon points="${iconSize *.5},${iconSize * .2} ${iconSize *.7},${iconSize * .3} ${iconSize *.65},${iconSize * .7} ${iconSize *.35},${iconSize * .7} ${iconSize *.3},${iconSize * .3}" fill="${arrowStrokeColor}" stroke="black" stroke-width="1.5"/>
                        <circle cx="${iconSize / 2}" cy="${iconSize * .5}" r="${iconSize *.15}" fill="black"/>
                        <text x="${iconSize / 2}" y="${iconSize / 2}" font-size="${fontSize}" text-anchor="middle" dominant-baseline="central" fill="white" font-family="Arial, sans-serif" transform="rotate(${-bearing}, ${iconSize/2}, ${iconSize/2})">${routeShortName}</text>
                    </g>
                </svg>`;

            if (newBusMarkerObjects[vehicleId]) { 
                const md = newBusMarkerObjects[vehicleId];
                md.gmapMarker.title = `Route: ${routeId}\nVehicle: ${vehicleId}\nSpeed: ${speedDisplay}\nTime: ${timeDisplay}`;
                // Update content of existing infowindow if it exists
                if (md.infowindow) {
                    md.infowindow.setContent(currentInfoContent);
                } else { // Should not happen if created correctly, but as a fallback
                    md.infowindow = new google.maps.InfoWindow({ content: currentInfoContent, ariaLabel: `Bus ${vehicleId}`});
                    // Need to add closeclick listener here too if we are recreating it
                    md.infowindow.addListener('closeclick', () => {
                        if (G.currentlyOpenInfoWindow === md.infowindow) {
                            G.setCurrentlyOpenInfoWindow(null);
                        }
                    });
                }
                
                if (md.gmapMarker.content instanceof HTMLElement) {
                    md.gmapMarker.content.innerHTML = svgContent;
                } else { 
                    const el = document.createElement('div');
                    el.innerHTML = svgContent;
                    el.style.cursor = 'pointer';
                    md.gmapMarker.content = el;
                }
                
                const currentMarkerPosition = md.gmapMarker.position; 
                if (currentMarkerPosition && 
                    (Math.abs(currentMarkerPosition.lat - newPosition.lat) > 1e-6 || Math.abs(currentMarkerPosition.lng - newPosition.lng) > 1e-6)) {
                    if (!md.isAnimating || md.targetPos?.lat !== newPosition.lat || md.targetPos?.lng !== newPosition.lng) {
                        md.startPos = { lat: currentMarkerPosition.lat, lng: currentMarkerPosition.lng };
                        md.targetPos = newPosition;
                        md.startTime = performance.now();
                        md.isAnimating = true; 
                    }
                } else if (currentMarkerPosition) { 
                    if (!md.isAnimating) { 
                         md.gmapMarker.position = newPosition; 
                         md.startPos = null; 
                    }
                } else { 
                    md.gmapMarker.position = newPosition; 
                    md.isAnimating = false; 
                    md.startPos = null;
                }
            } else { 
                const el = document.createElement('div');
                el.innerHTML = svgContent;
                el.style.cursor = 'pointer'; 

                const newMarker = new google.maps.marker.AdvancedMarkerElement({
                    map: G.map,
                    position: newPosition, 
                    content: el,
                    title: `R: ${routeId} V: ${vehicleId}`, 
                    zIndex: 100,
                    gmpClickable: true 
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
                    const currentMarkerData = G.busMarkerObjects[capturedVehicleId]; 
                    if (currentMarkerData && currentMarkerData.infowindow) {
                        // Close any previously open InfoWindow
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
                    handleRouteInteraction(capturedRouteId); 
                });

                newBusMarkerObjects[vehicleId] = {
                    gmapMarker: newMarker,
                    infowindow: infowindow,
                    isAnimating: false, 
                    startPos: null, 
                    targetPos: newPosition, 
                    startTime: 0
                };
            }
        });

        for (const vid in newBusMarkerObjects) {
            if (!updatedVehicleIds.has(vid)) {
                if (newBusMarkerObjects[vid].gmapMarker) {
                    // If the marker being removed had the currently open infowindow, clear the tracker
                    if (G.currentlyOpenInfoWindow && newBusMarkerObjects[vid].infowindow === G.currentlyOpenInfoWindow) {
                        G.setCurrentlyOpenInfoWindow(null);
                    }
                    newBusMarkerObjects[vid].gmapMarker.map = null; 
                }
                delete newBusMarkerObjects[vid]; 
            }
        }
        G.setBusMarkerObjects(newBusMarkerObjects); 
        startAnimationLoop(); 
    } catch (error) {
        console.error("fetchAndUpdateMarkers: General error:", error);
    }
}

function applyPolylineStyles(routeIdToStyle, isHighlight) {
    for (const polylineRouteId in G.routePolylines) {
        if (G.routePolylines.hasOwnProperty(polylineRouteId)) {
            G.routePolylines[polylineRouteId].forEach(polyline => {
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
            });
        }
    }
}

export function handleRouteInteraction(clickedRouteId) { // Export if called from map_init (it won't be for this)
    console.log(`Handling interaction for route: ${clickedRouteId}`);
    if (!clickedRouteId || clickedRouteId === 'N/A') {
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

export function clearRouteHighlight() { // Needs to be exported to be called by map_init.js
    if (!G.currentlyHighlightedRouteId) {
        // console.log("clearRouteHighlight: No route currently highlighted.");
        return; 
    }
    console.log("Clearing route highlight for:", G.currentlyHighlightedRouteId);
    applyPolylineStyles(null, false); // Pass null/false to revert all to default
    G.setCurrentlyHighlightedRouteId(null);
    console.log("All route highlights cleared.");
}

console.log("map_data_layer.js: FINISHED PARSING.");