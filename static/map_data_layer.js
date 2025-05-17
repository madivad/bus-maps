// static/map_data_layer.js
console.log("map_data_layer.js: PARSING.");

import * as G from './map_globals.js';
import { startAnimationLoop, formatTimestamp } from './map_init.js';
import { saveStateToLocalStorage } from './map_state_modals.js';

// Helper function to calculate bounding box for a set of points
function getBoundingBox(points) {
    if (!points || points.length === 0) {
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
    return { minLat, maxLat, minLng, maxLng };
}


// NEW: Function to render a route shape preview as SVG in the modal
export async function renderRoutePreviewInModal(routeId, previewContainerElement) {
    if (!routeId || !previewContainerElement) {
        console.error("renderRoutePreviewInModal: Missing routeId or container element.");
        if (previewContainerElement) previewContainerElement.innerHTML = 'Error: Missing data for preview.';
        return;
    }
    console.log(`renderRoutePreviewInModal: Fetching shape for route ${routeId}`);
    previewContainerElement.innerHTML = 'Loading preview...';

    try {
        const response = await fetch(`/api/route_shapes?routes=${routeId}`);
        if (!response.ok) {
            throw new Error(`HTTP error ${response.status} for route ${routeId}`);
        }
        const shapesData = await response.json();

        if (!shapesData || !shapesData[routeId] || shapesData[routeId].length === 0 || shapesData[routeId][0].length === 0) {
            console.warn(`No shape data found for previewing route ${routeId}.`);
            previewContainerElement.innerHTML = 'No path data available for this route.';
            return;
        }

        // Assuming the first shape path is representative for preview
        const pathPoints = shapesData[routeId][0].filter(p => typeof p?.lat === 'number' && typeof p?.lng === 'number');
        if (pathPoints.length < 2) {
            previewContainerElement.innerHTML = 'Not enough path data for preview.';
            return;
        }

        const bounds = getBoundingBox(pathPoints);
        if (!bounds) {
            previewContainerElement.innerHTML = 'Could not determine path bounds.';
            return;
        }

        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");

        const previewWidth = previewContainerElement.clientWidth || 200; // Fallback width
        const previewHeight = previewContainerElement.clientHeight || 150; // Fallback height
        
        // Set viewBox to the bounding box of the route
        // This is a simple Mercator-like projection for visualization, not geographically accurate scaling.
        // For a simple preview, we scale longitude more than latitude to make it look less squashed.
        const latRange = bounds.maxLat - bounds.minLat;
        const lngRange = bounds.maxLng - bounds.minLng;

        // Add some padding to the viewBox
        const paddingFactor = 0.1; // 10% padding
        const viewMinX = bounds.minLng - lngRange * paddingFactor;
        const viewMinY = bounds.minLat - latRange * paddingFactor;
        const viewWidth = lngRange * (1 + 2 * paddingFactor);
        const viewHeight = latRange * (1 + 2 * paddingFactor);

        svg.setAttribute("viewBox", `${viewMinX} ${-bounds.maxLat - latRange*paddingFactor} ${viewWidth} ${viewHeight}`); // Y is inverted in SVG
        svg.setAttribute("preserveAspectRatio", "xMidYMid meet"); // Scale to fit, maintain aspect ratio

        const polyline = document.createElementNS(svgNS, "polyline");
        let pointsStr = "";
        pathPoints.forEach(p => {
            pointsStr += `${p.lng},${-p.lat} `; // Invert Y for SVG coordinates
        });
        polyline.setAttribute("points", pointsStr.trim());

        let routeColor = G.assignedRouteColors[routeId] || '#007bff'; // Default blue for preview
        if (!G.assignedRouteColors[routeId]) {
            let hash = 0; for (let i = 0; i < routeId.length; i++) { hash = routeId.charCodeAt(i) + ((hash << 5) - hash); hash = hash & hash; }
            routeColor = G.ROUTE_COLORS[Math.abs(hash) % G.ROUTE_COLORS.length];
        }

        polyline.setAttribute("stroke", routeColor);
        polyline.setAttribute("stroke-width", Math.min(viewWidth, viewHeight) * 0.02); // Stroke relative to viewBox
        polyline.setAttribute("fill", "none");
        polyline.setAttribute("vector-effect", "non-scaling-stroke"); // Keep stroke width constant on zoom (if SVG itself is scaled)


        svg.appendChild(polyline);
        previewContainerElement.innerHTML = ''; // Clear "Loading..."
        previewContainerElement.appendChild(svg);
        console.log(`Rendered preview for ${routeId}`);

    } catch (error) {
        console.error(`Error rendering route preview for ${routeId}:`, error);
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
    console.log("updateMapData: routesParam for API (selected routes):", routesParam);

    if (G.currentMapOptions.showRoutePathsEnabled) {
        console.log("updateMapData: Route paths ARE enabled. Fetching shapes.");
        await fetchAndDrawRouteShapes(routesParam);
    } else {
        console.log("updateMapData: Route paths ARE NOT enabled. Skipping shapes.");
    }

    if (G.dataFetchIntervalId) {
        clearInterval(G.dataFetchIntervalId);
        G.setDataFetchIntervalId(null);
        console.log("updateMapData: Cleared existing data fetch interval.");
    }

    console.log("updateMapData: Fetching markers.");
    await fetchAndUpdateMarkers(routesParam);

    if (G.currentMapOptions.liveTrackingEnabled) {
        console.log("updateMapData: Live tracking IS enabled. Starting interval.");
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
        console.log(`updateMapData: Live tracking interval (re)started for ${G.currentMapOptions.updateIntervalMs / 1000}s.`);
    } else {
        console.log("updateMapData: Live tracking IS NOT enabled. Markers fetched once.");
    }

    console.log("updateMapData: FINISHED.");
}

export function populateSidebar() {
    console.log("populateSidebar: STARTED.");
    if (!G.sidebarRoutesListDiv) {
         console.error("populateSidebar: G.sidebarRoutesListDiv is null!");
         return;
    }
    G.sidebarRoutesListDiv.innerHTML = '';

    if (G.selectedRealtimeRouteIds.size === 0) {
        G.sidebarRoutesListDiv.textContent = 'No routes selected.';
         if (G.sidebarDiv) G.sidebarDiv.style.display = 'none';
        console.log("populateSidebar: No selected routes to populate.");
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
     console.log(`populateSidebar: Populated sidebar with ${sortedSelectedRoutes.length} routes.`);
}

export function toggleRouteVisibility(routeId, isVisible) {
    console.log(`toggleRouteVisibility: Route ${routeId}, Visible: ${isVisible}`);

    const currentVisible = new Set(G.visibleRealtimeRouteIds);
    if (isVisible) {
        currentVisible.add(routeId);
    } else {
        currentVisible.delete(routeId);
    }
    G.setVisibleRealtimeRouteIds(currentVisible);

    saveStateToLocalStorage();
    console.log(`toggleRouteVisibility: Saved new state after toggling ${routeId}.`);

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
    console.log("clearAllMapLayers: STARTED.");
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
    console.log("clearAllMapLayers: FINISHED. Polylines, markers, and sidebar content cleared.");
}

async function fetchAndDrawRouteShapes(routesParam) {
    if (!routesParam || G.currentMapOptions.showRoutePathsEnabled === false) {
        console.log("fetchAndDrawRouteShapes: No routesParam or showRoutePathsEnabled is false, skipping.");
        return;
    }
    console.log("fetchAndDrawRouteShapes: Fetching for routes:", routesParam);
    try {
        const response = await fetch(`/api/route_shapes?routes=${routesParam}`);
        if (!response.ok) return;
        const shapesData = await response.json();
        if (Object.keys(shapesData).length === 0) return;

        const tempRoutePolylines = {};
        for (const routeId in shapesData) {
            if (!shapesData.hasOwnProperty(routeId) || !G.selectedRealtimeRouteIds.has(routeId)) continue;
             tempRoutePolylines[routeId] = [];
            const shapes = shapesData[routeId];
            if (!Array.isArray(shapes)) continue;
            let colorForPolyline = G.assignedRouteColors[routeId] || '#FF0000';
            if (!G.assignedRouteColors[routeId] && routeId !== 'N/A') { /* ... hash color ... */ colorForPolyline = G.ROUTE_COLORS[Math.abs(hash) % G.ROUTE_COLORS.length]; }
            const isRouteVisible = G.visibleRealtimeRouteIds.has(routeId);
            shapes.forEach((pathPoints) => {
                if (!Array.isArray(pathPoints) || pathPoints.length < 2) return;
                const validPathPoints = pathPoints.filter(p => typeof p?.lat === 'number' && typeof p?.lng === 'number');
                if (validPathPoints.length < 2) return;
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
                    polyline.addListener('click', () => { if (G.visibleRealtimeRouteIds.has(routeId)) { handleRouteInteraction(routeId); }});
                } catch (e) { console.error(`Error creating polyline for ${routeId}`, e); }
            });
            if (G.currentlyHighlightedRouteId === routeId && isRouteVisible) { applyPolylineStyles(routeId, true); }
        }
        G.setRoutePolylines(tempRoutePolylines);
    } catch (error) { console.error("fetchAndDrawRouteShapes: General error:", error); }
}

export async function fetchAndUpdateMarkers(routesParam) {
    // ... same as before, but ensure formatTimestamp and startAnimationLoop are correctly used from map_init.js imports
    if (!routesParam) return;
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
            const routeId = bus.route_id || 'N/A';
            if (!vehicleId || vehicleId === 'N/A' || typeof bus.latitude !== 'number' || typeof bus.longitude !== 'number' || !G.selectedRealtimeRouteIds.has(routeId)) return;
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
        startAnimationLoop(); // Call the imported startAnimationLoop

    } catch (error) {
        console.error("fetchAndUpdateMarkers: General error:", error);
    }
}

function applyPolylineStyles(routeIdToStyle, isHighlight) {
    for (const polylineRouteId in G.routePolylines) {
        if (G.routePolylines.hasOwnProperty(polylineRouteId)) {
            G.routePolylines[polylineRouteId].forEach(polyline => {
                if (polyline.getMap() === G.map) {
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
    // ... same as before
    if (!clickedRouteId || clickedRouteId === 'N/A') { if (G.currentlyHighlightedRouteId) { clearRouteHighlight(); } return; }
    if (!G.visibleRealtimeRouteIds.has(clickedRouteId)) { if (G.currentlyHighlightedRouteId) { clearRouteHighlight(); } return; }
    if (G.currentlyHighlightedRouteId === clickedRouteId) { clearRouteHighlight(); }
    else { G.setCurrentlyHighlightedRouteId(clickedRouteId); applyPolylineStyles(clickedRouteId, true); }
}

export function clearRouteHighlight() {
    // ... same as before
    if (!G.currentlyHighlightedRouteId) { return; }
    for (const routeId in G.routePolylines) {
        if (G.routePolylines.hasOwnProperty(routeId)) {
             G.routePolylines[routeId].forEach(polyline => {
                 if (polyline.getMap() === G.map) {
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