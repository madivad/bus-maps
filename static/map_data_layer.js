// static/map_data_layer.js
console.log("map_data_layer.js: PARSING.");

import * as G from './map_globals.js';
import { startAnimationLoop, formatTimestamp } from './map_init.js';
import { saveStateToLocalStorage } from './map_state_modals.js';

// Helper function to calculate bounding box for a set of points
function getBoundingBox(points) {
    if (!points || points.length === 0) {
        console.warn("getBoundingBox: No points provided or empty array.");
        return null;
    }
    let minLat = points[0].lat;
    let maxLat = points[0].lat;
    let minLng = points[0].lng;
    let maxLng = points[0].lng;

    for (let i = 1; i < points.length; i++) {
        minLat = Math.min(minLat, points[i].lat);
        maxLat = Math.max(maxLat, points[i].lat);
        minLng = Math.min(minLng, points[i].lng);
        maxLng = Math.max(maxLng, points[i].lng);
    }
    
    const rangeEpsilon = 0.00001; // How small a range is considered "too small"
    const paddingEpsilon = 0.0001; // How much to pad if range is too small

    if (Math.abs(maxLat - minLat) < rangeEpsilon) { 
        console.warn("getBoundingBox: Latitude range very small, adding padding epsilon.");
        maxLat += paddingEpsilon; 
        minLat -= paddingEpsilon;
    }
    if (Math.abs(maxLng - minLng) < rangeEpsilon) { 
        console.warn("getBoundingBox: Longitude range very small, adding padding epsilon.");
        maxLng += paddingEpsilon; 
        minLng -= paddingEpsilon;
    }
    
    return { minLat, maxLat, minLng, maxLng };
}

export async function renderRoutePreviewInModal(routeId, previewContainerElement) {
    if (!routeId || !previewContainerElement) {
        console.error("renderRoutePreviewInModal: Missing routeId or container element.");
        if (previewContainerElement) previewContainerElement.innerHTML = 'Error: Missing data for preview.';
        return;
    }
    console.log(`renderRoutePreviewInModal: START - Fetching shape for route ${routeId}`);
    previewContainerElement.innerHTML = 'Loading preview...';

    try {
        const response = await fetch(`/api/route_shapes?routes=${routeId}`);
        console.log(`renderRoutePreviewInModal: API response status for ${routeId}: ${response.status}`);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error ${response.status} for route ${routeId}. Response: ${errorText}`);
        }
        const shapesData = await response.json();
        console.log(`renderRoutePreviewInModal: shapesData for ${routeId}:`, JSON.stringify(shapesData, null, 2).substring(0, 300) + "...");


        if (!shapesData || !shapesData[routeId] || shapesData[routeId].length === 0 || shapesData[routeId][0].length === 0) {
            console.warn(`No shape data found for previewing route ${routeId}. shapesData[routeId]:`, shapesData ? shapesData[routeId] : 'undefined');
            previewContainerElement.innerHTML = 'No path data available for this route.';
            return;
        }

        const pathPoints = shapesData[routeId][0].filter(p => typeof p?.lat === 'number' && typeof p?.lng === 'number');
        console.log(`renderRoutePreviewInModal: Filtered pathPoints for ${routeId} (count: ${pathPoints.length}):`, JSON.stringify(pathPoints.slice(0, 3), null, 2) + "...");

        if (pathPoints.length < 2) {
            console.warn(`Not enough valid path points for preview for route ${routeId}. Count: ${pathPoints.length}`);
            previewContainerElement.innerHTML = 'Not enough path data for preview.';
            return;
        }

        const bounds = getBoundingBox(pathPoints);
        console.log(`renderRoutePreviewInModal: Calculated bounds for ${routeId}:`, JSON.stringify(bounds));
        if (!bounds) {
            console.error(`Could not determine path bounds for route ${routeId}.`);
            previewContainerElement.innerHTML = 'Could not determine path bounds.';
            return;
        }

        const containerWidth = previewContainerElement.clientWidth;
        const containerHeight = previewContainerElement.clientHeight;
        console.log(`renderRoutePreviewInModal: Preview container dimensions (WxH): ${containerWidth}x${containerHeight}`);
        if (containerWidth === 0 || containerHeight === 0) {
            console.warn("renderRoutePreviewInModal: Preview container has zero width or height. SVG might not be visible.");
            // previewContainerElement.innerHTML = 'Preview area not ready.'; // Optional: User feedback
            // return; // Or attempt to render anyway
        }

        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("width", "100%");
        svg.setAttribute("height", "100%");

        const latRange = Math.abs(bounds.maxLat - bounds.minLat);
        const lngRange = Math.abs(bounds.maxLng - bounds.minLng);
        console.log(`renderRoutePreviewInModal: LatRange=${latRange.toFixed(6)}, LngRange=${lngRange.toFixed(6)}`);

        const paddingFactor = 0.1; // 10% padding on each side
        let viewMinX = bounds.minLng - lngRange * paddingFactor;
        // viewMinYGeo is not directly used for svgViewBoxMinY calculation with this specific inversion method
        let viewWidth = lngRange * (1 + 2 * paddingFactor);
        let viewHeight = latRange * (1 + 2 * paddingFactor);

        if (viewWidth <= 0.000001) { 
            console.warn(`renderRoutePreviewInModal: viewWidth is effectively zero (${viewWidth}). Adjusting.`);
            viewWidth = 0.01; 
            viewMinX = bounds.minLng - (viewWidth / 2);
        }
        if (viewHeight <= 0.000001) {
            console.warn(`renderRoutePreviewInModal: viewHeight is effectively zero (${viewHeight}). Adjusting.`);
            viewHeight = 0.01; 
            // The calculation for svgViewBoxMinY depends on bounds.maxLat, so adjusting viewMinYGeo isn't directly used here.
        }
        
        const svgViewBoxMinY = -(bounds.maxLat + latRange * paddingFactor);

        svg.setAttribute("viewBox", `${viewMinX} ${svgViewBoxMinY} ${viewWidth} ${viewHeight}`);
        svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
        console.log(`renderRoutePreviewInModal: SVG viewBox for ${routeId}: "${viewMinX.toFixed(6)} ${svgViewBoxMinY.toFixed(6)} ${viewWidth.toFixed(6)} ${viewHeight.toFixed(6)}"`);

        const polyline = document.createElementNS(svgNS, "polyline");
        let pointsStr = "";
        pathPoints.forEach(p => {
            pointsStr += `${p.lng.toFixed(6)},${(-p.lat).toFixed(6)} `;
        });
        polyline.setAttribute("points", pointsStr.trim());
        
        let routeColor = G.assignedRouteColors[routeId] || '#007bff';
        if (!G.assignedRouteColors[routeId] && routeId !== 'N/A') {
            let hash = 0; 
            for (let i = 0; i < routeId.length; i++) { 
                hash = routeId.charCodeAt(i) + ((hash << 5) - hash); 
                hash = hash & hash;
            }
            routeColor = G.ROUTE_COLORS[Math.abs(hash) % G.ROUTE_COLORS.length];
        }
        polyline.setAttribute("stroke", routeColor);
        polyline.setAttribute("fill", "none");
        polyline.setAttribute("vector-effect", "non-scaling-stroke"); // KEEP THIS!

        // --- CORRECTED STROKE WIDTH when using non-scaling-stroke ---
        // Set a small, "pixel-like" value. "1" or "1.5" or "2" usually works well.
        const desiredPixelStrokeWidth = "1.5"; // Experiment with 1, 1.5, 2
        polyline.setAttribute("stroke-width", desiredPixelStrokeWidth); 

        console.log(`renderRoutePreviewInModal: Polyline stroke for ${routeId}: color=${routeColor}, width=${desiredPixelStrokeWidth} (intended as screen units due to non-scaling-stroke)`);
        
        svg.appendChild(polyline);
        previewContainerElement.innerHTML = '';
        previewContainerElement.appendChild(svg);
        
        const computedContainerStyle = window.getComputedStyle(previewContainerElement);
        const computedSvgStyle = window.getComputedStyle(svg);
        console.log("renderRoutePreviewInModal: Computed Container Style (WxH):", computedContainerStyle.width, computedContainerStyle.height);
        console.log("renderRoutePreviewInModal: Computed SVG Style (WxH):", computedSvgStyle.width, computedSvgStyle.height);
        console.log("renderRoutePreviewInModal: SVG Element OuterHTML (first 500 chars):", svg.outerHTML.substring(0, 500) + "...");
        
        console.log(`renderRoutePreviewInModal: SUCCESS - Rendered preview for ${routeId}. SVG appended.`);

    } catch (error) {
        console.error(`renderRoutePreviewInModal: CATCH - Error rendering route preview for ${routeId}:`, error);
        previewContainerElement.innerHTML = 'Error loading preview.';
    }
}


export async function updateMapData() {
    console.log("updateMapData: STARTED. Current selected routes (G.selectedRealtimeRouteIds):", Array.from(G.selectedRealtimeRouteIds));
    console.log("updateMapData: Current visible routes (G.visibleRealtimeRouteIds):", Array.from(G.visibleRealtimeRouteIds));

    if (G.currentlyHighlightedRouteId) {
        clearRouteHighlight();
    }

    clearAllMapLayers();
    populateSidebar();
    updateMapTitle();

    if (G.sidebarDiv) {
        G.sidebarDiv.style.display = G.selectedRealtimeRouteIds.size > 0 ? 'block' : 'none';
    } else {
         console.error("updateMapData: G.sidebarDiv is null!");
    }

    if (G.selectedRealtimeRouteIds.size === 0) {
        console.log("updateMapData: No routes selected. Map will be empty except base layer.");
        if (G.dataFetchIntervalId) {
            clearInterval(G.dataFetchIntervalId);
            G.setDataFetchIntervalId(null);
            console.log("updateMapData: Cleared data fetch interval (no routes selected).");
        }
        return;
    }

    const routesParam = Array.from(G.selectedRealtimeRouteIds).join(',');
    // console.log("updateMapData: routesParam for API (selected routes):", routesParam); // Can be verbose

    if (G.currentMapOptions.showRoutePathsEnabled) {
        // console.log("updateMapData: Route paths ARE enabled. Fetching shapes."); // Can be verbose
        await fetchAndDrawRouteShapes(routesParam);
    } else {
        console.log("updateMapData: Route paths ARE NOT enabled. Skipping shapes.");
    }

    if (G.dataFetchIntervalId) {
        clearInterval(G.dataFetchIntervalId);
        G.setDataFetchIntervalId(null);
        // console.log("updateMapData: Cleared existing data fetch interval."); // Can be verbose
    }

    // console.log("updateMapData: Fetching markers."); // Can be verbose
    await fetchAndUpdateMarkers(routesParam);

    if (G.currentMapOptions.liveTrackingEnabled) {
        // console.log("updateMapData: Live tracking IS enabled. Starting interval."); // Can be verbose
        G.setDataFetchIntervalId(setInterval(async () => {
            if (G.currentMapOptions.liveTrackingEnabled && G.selectedRealtimeRouteIds.size > 0) {
                const currentRoutesParamForInterval = Array.from(G.selectedRealtimeRouteIds).join(',');
                await fetchAndUpdateMarkers(currentRoutesParamForInterval);
            } else {
                if (G.dataFetchIntervalId) {
                    clearInterval(G.dataFetchIntervalId);
                    G.setDataFetchIntervalId(null);
                    console.log("Interval Tick: Tracking disabled or no routes. Interval STOPPED from within.");
                }
            }
        }, G.currentMapOptions.updateIntervalMs));
        // console.log(`updateMapData: Live tracking interval (re)started for ${G.currentMapOptions.updateIntervalMs / 1000}s.`);
    } else {
        console.log("updateMapData: Live tracking IS NOT enabled. Markers fetched once.");
    }

    console.log("updateMapData: FINISHED.");
}

export function populateSidebar() {
    // console.log("populateSidebar: STARTED."); // Can be verbose
    if (!G.sidebarRoutesListDiv) {
         console.error("populateSidebar: G.sidebarRoutesListDiv is null!");
         return;
    }
    G.sidebarRoutesListDiv.innerHTML = '';

    if (G.selectedRealtimeRouteIds.size === 0) {
        G.sidebarRoutesListDiv.textContent = 'No routes selected.';
         if (G.sidebarDiv) G.sidebarDiv.style.display = 'none';
        // console.log("populateSidebar: No selected routes to populate.");
        return;
    }

    if (G.sidebarDiv) G.sidebarDiv.style.display = 'block';

    const selectedRouteDetails = G.allFetchedRoutesForCurrentOperators.filter(route =>
        G.selectedRealtimeRouteIds.has(route.realtime_id)
    );

     const sortedSelectedRoutes = selectedRouteDetails.sort((a, b) => {
         const aParts = a.short_name.split(/[/\s]/);
         const bParts = b.short_name.split(/[/\s]/);
         const aNum = parseInt(aParts[0], 10);
         const bNum = parseInt(bParts[0], 10);

         if (!isNaN(aNum) && !isNaN(bNum) && aNum !== bNum) return aNum - bNum;
         return a.short_name.localeCompare(b.short_name);
     });

    sortedSelectedRoutes.forEach(route => {
        const routeItemDiv = document.createElement('div');
        routeItemDiv.className = 'sidebar-route-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = route.realtime_id;
        checkbox.checked = G.visibleRealtimeRouteIds.has(route.realtime_id);

        const colorDot = document.createElement('span');
        colorDot.className = 'route-color-dot';
        colorDot.style.backgroundColor = G.assignedRouteColors[route.realtime_id] || G.ROUTE_COLORS[0];

        const labelText = document.createTextNode(`${route.short_name}`);

        routeItemDiv.appendChild(colorDot);
        routeItemDiv.appendChild(checkbox);
        routeItemDiv.appendChild(labelText);

        checkbox.addEventListener('change', (event) => {
            const routeId = event.target.value;
            const isVisible = event.target.checked;
            toggleRouteVisibility(routeId, isVisible);
        });

        G.sidebarRoutesListDiv.appendChild(routeItemDiv);
    });
     // console.log(`populateSidebar: Populated sidebar with ${sortedSelectedRoutes.length} routes.`);
}

export function toggleRouteVisibility(routeId, isVisible) {
    // console.log(`toggleRouteVisibility: Route ${routeId}, Visible: ${isVisible}`); // Can be verbose

    const currentVisible = new Set(G.visibleRealtimeRouteIds);
    if (isVisible) {
        currentVisible.add(routeId);
    } else {
        currentVisible.delete(routeId);
    }
    G.setVisibleRealtimeRouteIds(currentVisible);

    saveStateToLocalStorage();
    // console.log(`toggleRouteVisibility: Saved new state after toggling ${routeId}.`);

    if (G.routePolylines[routeId]) {
        G.routePolylines[routeId].forEach(polyline => {
            polyline.setMap(isVisible ? G.map : null);
        });
    }

    for (const vehicleId in G.busMarkerObjects) {
        if (G.busMarkerObjects.hasOwnProperty(vehicleId)) {
            const markerData = G.busMarkerObjects[vehicleId];
            if (markerData.route_id === routeId && markerData.gmapMarker) {
                markerData.gmapMarker.map = isVisible ? G.map : null;
                if (!isVisible && G.currentlyOpenInfoWindow === markerData.infowindow) {
                     markerData.infowindow.close();
                     G.setCurrentlyOpenInfoWindow(null);
                }
            }
        }
    }

     if (G.currentlyHighlightedRouteId) {
        if (!isVisible && G.currentlyHighlightedRouteId === routeId) {
             clearRouteHighlight();
        } else {
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
    if (G.selectedRealtimeRouteIds.size === 0) {
        title += "None selected";
    } else {
        const shortNames = Array.from(G.selectedRealtimeRouteIds).map(rtId => {
            const parts = rtId.split('_');
            return parts.length > 1 ? parts[parts.length - 1] : rtId;
        }).sort((a,b) => {
            const numA = parseInt(a.match(/\d+/)?.[0]);
            const numB = parseInt(b.match(/\d+/)?.[0]);
            if (!isNaN(numA) && !isNaN(numB) && numA !== numB) return numA - numB;
            return a.localeCompare(b);
        });
        title += shortNames.join(', ');
    }
    G.mapTitleH3.textContent = title;
}

export function clearAllMapLayers() {
    // console.log("clearAllMapLayers: STARTED."); // Can be verbose
    for (const routeId in G.routePolylines) {
        if (G.routePolylines.hasOwnProperty(routeId)) {
            G.routePolylines[routeId].forEach(polyline => {
                 if (polyline && typeof polyline.setMap === 'function') {
                      polyline.setMap(null);
                 }
            });
        }
    }
    G.setRoutePolylines({});

    for (const vehicleId in G.busMarkerObjects) {
        if (G.busMarkerObjects.hasOwnProperty(vehicleId)) {
            const markerData = G.busMarkerObjects[vehicleId];
            if (markerData.gmapMarker) {
                 if (typeof markerData.gmapMarker.map === 'object' && markerData.gmapMarker.map !== null) {
                     markerData.gmapMarker.map = null;
                 }
                 if (markerData.infowindow && G.currentlyOpenInfoWindow === markerData.infowindow) {
                      markerData.infowindow.close();
                      G.setCurrentlyOpenInfoWindow(null);
                 }
            }
        }
    }
    G.setBusMarkerObjects({});

    if (G.sidebarRoutesListDiv) {
         G.sidebarRoutesListDiv.innerHTML = '';
         G.sidebarRoutesListDiv.textContent = 'No routes selected.';
    }
    if (G.sidebarDiv) {
        G.sidebarDiv.style.display = G.selectedRealtimeRouteIds.size > 0 ? 'block' : 'none';
    }

    if (G.animationFrameId) {
        cancelAnimationFrame(G.animationFrameId);
        G.setAnimationFrameId(null);
    }
    // console.log("clearAllMapLayers: FINISHED.");
}

async function fetchAndDrawRouteShapes(routesParam) {
    if (!routesParam || G.currentMapOptions.showRoutePathsEnabled === false) {
        // console.log("fetchAndDrawRouteShapes: No routesParam or showRoutePathsEnabled is false, skipping.");
        return;
    }
    // console.log("fetchAndDrawRouteShapes: Fetching for routes:", routesParam);
    try {
        const response = await fetch(`/api/route_shapes?routes=${routesParam}`);
        if (!response.ok) {
            console.error(`fetchAndDrawRouteShapes: HTTP error ${response.status} for routes ${routesParam}`);
            return;
        }
        const shapesData = await response.json();
        if (Object.keys(shapesData).length === 0) {
            // console.log("fetchAndDrawRouteShapes: No shape data received from API for routes:", routesParam);
            return;
        }

        const tempRoutePolylines = {};

        for (const routeId in shapesData) {
            if (!shapesData.hasOwnProperty(routeId) || !G.selectedRealtimeRouteIds.has(routeId)) {
                 continue;
            }

             tempRoutePolylines[routeId] = [];

            const shapes = shapesData[routeId];
            if (!Array.isArray(shapes)) {
                console.warn(`Shapes for route ${routeId} is not an array:`, shapes);
                continue;
            }

            let colorForPolyline = G.assignedRouteColors[routeId] || '#FF0000';
            if (!G.assignedRouteColors[routeId] && routeId !== 'N/A') {
                let hash = 0; 
                for (let i = 0; i < routeId.length; i++) { 
                    hash = routeId.charCodeAt(i) + ((hash << 5) - hash); 
                    hash = hash & hash;
                }
                colorForPolyline = G.ROUTE_COLORS[Math.abs(hash) % G.ROUTE_COLORS.length];
                console.warn(`fetchAndDrawRouteShapes: Used fallback color for route ${routeId}.`);
            }

            const isRouteVisible = G.visibleRealtimeRouteIds.has(routeId);

            shapes.forEach((pathPoints) => {
                if (!Array.isArray(pathPoints) || pathPoints.length < 2) {
                     // console.warn(`Invalid pathPoints array for route ${routeId}:`, pathPoints);
                     return;
                }
                const validPathPoints = pathPoints.filter(p => typeof p?.lat === 'number' && typeof p?.lng === 'number');
                if (validPathPoints.length < 2) {
                    // console.warn(`Not enough valid coordinate points for polyline on route ${routeId}`);
                    return;
                }

                try {
                    const polyline = new google.maps.Polyline({
                        path: validPathPoints,
                        geodesic: true,
                        strokeColor: colorForPolyline,
                        strokeOpacity: G.DEFAULT_POLYLINE_OPACITY,
                        strokeWeight: G.DEFAULT_POLYLINE_WEIGHT,
                        zIndex: G.DEFAULT_POLYLINE_ZINDEX,
                        clickable: true,
                        map: isRouteVisible ? G.map : null
                    });

                    tempRoutePolylines[routeId].push(polyline);

                    const currentRouteIdForListener = routeId;
                    polyline.addListener('click', () => {
                        // console.log(`Polyline for route ${currentRouteIdForListener} clicked.`);
                         if (G.visibleRealtimeRouteIds.has(currentRouteIdForListener)) {
                              handleRouteInteraction(currentRouteIdForListener);
                         } else {
                              // console.log(`Ignoring click on polyline for hidden route ${currentRouteIdForListener}.`);
                         }
                    });

                } catch (e) {
                    console.error(`fetchAndDrawRouteShapes: Error creating polyline for ${routeId}`, e, validPathPoints);
                }
            });

            if (G.currentlyHighlightedRouteId === routeId && isRouteVisible) {
                 applyPolylineStyles(routeId, true);
            }
        }
        G.setRoutePolylines(tempRoutePolylines);

    } catch (error) {
        console.error("fetchAndDrawRouteShapes: General error:", error);
    }
    // console.log("fetchAndDrawRouteShapes: FINISHED.");
}

export async function fetchAndUpdateMarkers(routesParam) {
    if (!routesParam) {
        // console.log("fetchAndUpdateMarkers: No routesParam, skipping fetch.");
        return;
    }

    // console.log("fetchAndUpdateMarkers: Fetching data for routes:", routesParam);

    try {
        const response = await fetch(`/api/bus_data?routes=${routesParam}`);
        if (!response.ok) {
            console.error(`fetchAndUpdateMarkers: HTTP error ${response.status} for routes ${routesParam}`);
            return;
        }
        const busData = await response.json();
        // console.log(`fetchAndUpdateMarkers: Received ${busData.length} vehicles.`);

        const updatedVehicleIds = new Set();
        const newBusMarkerObjects = { ...G.busMarkerObjects };

        busData.forEach(bus => {
            const vehicleId = bus.vehicle_id;
            const routeId = bus.route_id || 'N/A';

            if (!vehicleId || vehicleId === 'N/A' || typeof bus.latitude !== 'number' || typeof bus.longitude !== 'number' || !G.selectedRealtimeRouteIds.has(routeId)) {
                return;
            }
            updatedVehicleIds.add(vehicleId);

            const newPosition = { lat: bus.latitude, lng: bus.longitude };
            const bearing = Number(bus.bearing) ?? 0;
            const routeShortName = routeId.includes('_') ? routeId.split('_').pop() : routeId;
            const speedDisplay = bus.speed || 'N/A';
            const timeDisplay = formatTimestamp(bus.raw_timestamp);
            let markerColor = G.assignedRouteColors[routeId] || '#FF0000';

            const currentInfoContent = `
                <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4; max-width: 200px;">
                    <strong>Route:</strong> <span style="color:${markerColor}; font-weight:bold;">${routeId}</span><br>
                    <strong>Vehicle:</strong> ${vehicleId}<br>
                    ${speedDisplay !== 'N/A' ? `<strong>Speed:</strong> ${speedDisplay}<br>` : ''}
                    <strong>Last Update:</strong> ${timeDisplay}
                    ${bus.latitude && bus.longitude ? `<br><strong>Coords:</strong> ${bus.latitude.toFixed(5)}, ${bus.longitude.toFixed(5)}` : ''}
                </div>`;

            const iconSize = 50;
            const fontSize = routeShortName.length > 3 ? 7 : (routeShortName.length > 2 ? 8 : 10);
            const svgContent = `
                <svg version="1.1" width="${iconSize}" height="${iconSize}" xmlns="http://www.w3.org/2000/svg">
                    <g transform="rotate(${bearing}, ${iconSize/2}, ${iconSize/2})">
                        <polygon points="${iconSize *.5},${iconSize * .2} ${iconSize *.7},${iconSize * .3} ${iconSize *.65},${iconSize * .7} ${iconSize *.35},${iconSize * .7} ${iconSize *.3},${iconSize * .3}" fill="${markerColor}" stroke="black" stroke-width="1.5"/>
                        <circle cx="${iconSize / 2}" cy="${iconSize * .5}" r="${iconSize *.15}" fill="black"/>
                        <text x="${iconSize / 2}" y="${iconSize / 2}" font-size="${fontSize}" text-anchor="middle" dominant-baseline="central" fill="white" font-family="Arial, sans-serif" transform="rotate(${-bearing}, ${iconSize/2}, ${iconSize/2})">${routeShortName}</text>
                    </g>
                </svg>`;

            const isRouteVisible = G.visibleRealtimeRouteIds.has(routeId);

            if (newBusMarkerObjects[vehicleId]) {
                const md = newBusMarkerObjects[vehicleId];
                md.route_id = routeId;

                if (md.gmapMarker) {
                    md.gmapMarker.title = `Route: ${routeId}\nVehicle: ${vehicleId}\nSpeed: ${speedDisplay}\nTime: ${timeDisplay}`;
                     if (md.gmapMarker.content instanceof HTMLElement) {
                         md.gmapMarker.content.innerHTML = svgContent;
                     } else {
                          const el = document.createElement('div');
                          el.innerHTML = svgContent;
                          el.style.cursor = 'pointer';
                          md.gmapMarker.content = el;
                     }
                     md.gmapMarker.map = isRouteVisible ? G.map : null;
                }

                if (md.infowindow) {
                    md.infowindow.setContent(currentInfoContent);
                    if (G.currentlyOpenInfoWindow === md.infowindow && !isRouteVisible) {
                        md.infowindow.close();
                        G.setCurrentlyOpenInfoWindow(null);
                    }
                } else {
                     md.infowindow = new google.maps.InfoWindow({ content: currentInfoContent, ariaLabel: `Bus ${vehicleId}`});
                     md.infowindow.addListener('closeclick', () => {
                         if (G.currentlyOpenInfoWindow === md.infowindow) {
                             G.setCurrentlyOpenInfoWindow(null);
                         }
                     });
                }

                const currentMarkerPosition = md.gmapMarker?.position;
                if (currentMarkerPosition &&
                    (Math.abs(currentMarkerPosition.lat - newPosition.lat) > 1e-6 || Math.abs(currentMarkerPosition.lng - newPosition.lng) > 1e-6)) {
                    if (!md.isAnimating || md.targetPos?.lat !== newPosition.lat || md.targetPos?.lng !== newPosition.lng) {
                        md.startPos = { lat: currentMarkerPosition.lat, lng: currentMarkerPosition.lng };
                        md.targetPos = newPosition;
                        md.startTime = performance.now();
                        md.isAnimating = true;
                    }
                } else if (currentMarkerPosition) {
                    md.isAnimating = false;
                    md.startPos = null;
                    if (md.gmapMarker && typeof md.gmapMarker.position === 'object') {
                        md.gmapMarker.position = newPosition;
                    }
                } else {
                     md.isAnimating = false;
                     md.startPos = null;
                     if (md.gmapMarker && typeof md.gmapMarker.position === 'object') {
                         md.gmapMarker.position = newPosition;
                     }
                }
            } else {
                const el = document.createElement('div');
                el.innerHTML = svgContent;
                el.style.cursor = 'pointer';

                const newMarker = new google.maps.marker.AdvancedMarkerElement({
                    map: isRouteVisible ? G.map : null,
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

                infowindow.addListener('closeclick', () => {
                    if (G.currentlyOpenInfoWindow === infowindow) {
                        G.setCurrentlyOpenInfoWindow(null);
                    }
                });

                const capturedVehicleId = vehicleId;
                const capturedRouteId = routeId;
                newMarker.addEventListener('gmp-click', () => {
                    if (G.visibleRealtimeRouteIds.has(capturedRouteId)) {
                         const currentMarkerData = newBusMarkerObjects[capturedVehicleId];
                         if (currentMarkerData && currentMarkerData.infowindow) {
                             if (G.currentlyOpenInfoWindow && G.currentlyOpenInfoWindow !== currentMarkerData.infowindow) {
                                 G.currentlyOpenInfoWindow.close();
                             }
                             try {
                                 currentMarkerData.infowindow.open({ anchor: currentMarkerData.gmapMarker, map: G.map });
                                 G.setCurrentlyOpenInfoWindow(currentMarkerData.infowindow);
                             } catch (e) {
                                 console.error('  ERROR calling infowindow.open:', e);
                                 G.setCurrentlyOpenInfoWindow(null);
                             }
                         }
                         handleRouteInteraction(capturedRouteId);
                    } else {
                         if (G.currentlyOpenInfoWindow) {
                            G.currentlyOpenInfoWindow.close();
                            G.setCurrentlyOpenInfoWindow(null);
                          }
                    }
                });

                newBusMarkerObjects[vehicleId] = {
                    gmapMarker: newMarker,
                    infowindow: infowindow,
                    isAnimating: false,
                    startPos: null,
                    targetPos: newPosition,
                    startTime: 0,
                    route_id: routeId
                };
            }
        });

        const vehiclesToRemove = Object.keys(newBusMarkerObjects).filter(vid => !updatedVehicleIds.has(vid));
        vehiclesToRemove.forEach(vid => {
            const markerData = newBusMarkerObjects[vid];
            if (markerData.gmapMarker) {
                if (G.currentlyOpenInfoWindow && markerData.infowindow === G.currentlyOpenInfoWindow) {
                    G.setCurrentlyOpenInfoWindow(null);
                }
                markerData.gmapMarker.map = null;
            }
            delete newBusMarkerObjects[vid];
        });

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
                if (polyline.getMap() === G.map) { // Only style if visible
                    if (polylineRouteId === routeIdToStyle) {
                        polyline.setOptions({
                            strokeOpacity: G.HIGHLIGHTED_POLYLINE_OPACITY,
                            strokeWeight: G.HIGHLIGHTED_POLYLINE_WEIGHT,
                            zIndex: G.HIGHLIGHTED_POLYLINE_ZINDEX
                        });
                    } else {
                        polyline.setOptions({
                            strokeOpacity: isHighlight ? G.DEEMPHASIZED_POLYLINE_OPACITY : G.DEFAULT_POLYLINE_OPACITY,
                            strokeWeight: isHighlight ? G.DEEMPHASIZED_POLYLINE_WEIGHT : G.DEFAULT_POLYLINE_WEIGHT,
                            zIndex: G.DEFAULT_POLYLINE_ZINDEX
                        });
                    }
                }
            });
        }
    }
}

export function handleRouteInteraction(clickedRouteId) {
    // console.log(`Handling interaction for route: ${clickedRouteId}`);
    if (!clickedRouteId || clickedRouteId === 'N/A') {
        if (G.currentlyHighlightedRouteId) {
            clearRouteHighlight();
        }
        return;
    }

    if (!G.visibleRealtimeRouteIds.has(clickedRouteId)) {
        //  console.log(`Interaction ignored for route ${clickedRouteId} as it is not currently visible.`);
         if (G.currentlyHighlightedRouteId) {
              clearRouteHighlight();
         }
         return;
    }

    if (G.currentlyHighlightedRouteId === clickedRouteId) {
        clearRouteHighlight();
    } else {
        G.setCurrentlyHighlightedRouteId(clickedRouteId);
        applyPolylineStyles(clickedRouteId, true);
        // console.log(`Route ${clickedRouteId} highlighted.`);
    }
}

export function clearRouteHighlight() {
    if (!G.currentlyHighlightedRouteId) {
        return;
    }
    // console.log("Clearing route highlight for:", G.currentlyHighlightedRouteId);
    for (const routeId in G.routePolylines) {
        if (G.routePolylines.hasOwnProperty(routeId)) {
             G.routePolylines[routeId].forEach(polyline => {
                 if (polyline.getMap() === G.map) { // Only reset style if visible
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
    // console.log("All route highlights cleared.");
}

console.log("map_data_layer.js: FINISHED PARSING.");