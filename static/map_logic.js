console.log("map_logic.js script started parsing.");

// --- Global variables ---
let map;
let busMarkerObjects = {}; // vehicleId: { gmapMarker, infowindow, isAnimating, startPos, targetPos, startTime }
let routePolylines = {};   // realtime_route_id: [Polyline, Polyline, ...]
const animationDuration = 1500;
let animationFrameId = null;
let dataFetchIntervalId = null; // To control the main data fetching interval

// --- NEW: State variables for selections ---
let selectedOperatorIds = new Set(); // Stores IDs like "2606"
let selectedRealtimeRouteIds = new Set(); // Stores IDs like "2606_50"

// --- NEW: DOM Elements ---
let btnOperators, btnRoutes; // btnOptions;
let operatorsModal, routesModal;
let closeOperatorsModalBtn, closeRoutesModalBtn;
let operatorsListDiv, saveOperatorsBtn;
let selectedRoutesListDiv, availableRoutesListDiv, saveRoutesBtn, routeSearchInput;
let mapTitleH3;

// IMPORTANT: This function is called by the Google Maps script's callback parameter
async function initMap() {
    console.log(">>> initMap function STARTED!");

    const initialCenter = { lat: -33.48, lng: 151.33 }; // Central Coast, NSW
    try {
        map = new google.maps.Map(document.getElementById("map"), {
            zoom: 11, // Zoom out a bit initially
            center: initialCenter,
            mapId: "BUS_MAP_REALTIME"
        });
        console.log(">>> google.maps.Map object CREATED successfully.");
    } catch (mapError) {
        console.error(">>> ERROR Creating google.maps.Map object:", mapError);
        return;
    }

    // --- NEW: Initialize UI Elements and Load State ---
    initializeDOMElements();
    addEventListeners();
    loadStateFromLocalStorage(); // Load selections (operators, routes)

    // --- Initial data load based on loaded state ---
    if (selectedOperatorIds.size > 0) {
        btnRoutes.disabled = false;
        // If routes are also selected, fetch and draw them
        if (selectedRealtimeRouteIds.size > 0) {
            await updateMapData(); // This will fetch shapes and bus positions
        } else {
             // Operators selected, but no routes yet. Maybe prompt to select routes or show empty map.
            console.log("Operators loaded, but no routes selected yet.");
            updateMapTitle(); // Update title even if no routes
        }
    } else {
        console.log("No operators selected on initial load. Please select operators.");
        // Optionally, open the operators modal automatically
        // operatorsModal.style.display = "block";
        updateMapTitle(); // Update title to "No operator selected"
    }

    // The main data fetch interval will be started/restarted by updateMapData
    console.log("Map initialized. UI elements and state loaded.");
}
window.initMap = initMap;


function initializeDOMElements() {
    btnOperators = document.getElementById('btn-operators');
    btnRoutes = document.getElementById('btn-routes');
    // btnOptions = document.getElementById('btn-options');

    operatorsModal = document.getElementById('operators-modal');
    routesModal = document.getElementById('routes-modal');

    closeOperatorsModalBtn = document.getElementById('close-operators-modal');
    closeRoutesModalBtn = document.getElementById('close-routes-modal');

    operatorsListDiv = document.getElementById('operators-list');
    saveOperatorsBtn = document.getElementById('save-operators');

    selectedRoutesListDiv = document.getElementById('selected-routes-list');
    availableRoutesListDiv = document.getElementById('available-routes-list');
    saveRoutesBtn = document.getElementById('save-routes');
    routeSearchInput = document.getElementById('route-search-input');

    mapTitleH3 = document.getElementById('map-title');
    console.log("DOM elements initialized.");
}

function addEventListeners() {
    btnOperators.addEventListener('click', openOperatorsModal);
    btnRoutes.addEventListener('click', openRoutesModal);

    closeOperatorsModalBtn.addEventListener('click', () => operatorsModal.style.display = "none");
    closeRoutesModalBtn.addEventListener('click', () => routesModal.style.display = "none");

    saveOperatorsBtn.addEventListener('click', handleSaveOperators);
    saveRoutesBtn.addEventListener('click', handleSaveRoutes);
    
    routeSearchInput.addEventListener('input', filterAvailableRoutes);

    // Close modal if clicking outside of modal-content
    window.addEventListener('click', (event) => {
        if (event.target === operatorsModal) operatorsModal.style.display = "none";
        if (event.target === routesModal) routesModal.style.display = "none";
    });
    console.log("Event listeners added.");
}

// --- LocalStorage Persistence ---
function saveStateToLocalStorage() {
    localStorage.setItem('selectedOperatorIds', JSON.stringify(Array.from(selectedOperatorIds)));
    localStorage.setItem('selectedRealtimeRouteIds', JSON.stringify(Array.from(selectedRealtimeRouteIds)));
    console.log("State saved to localStorage.");
}

function loadStateFromLocalStorage() {
    const storedOperatorIds = localStorage.getItem('selectedOperatorIds');
    const storedRouteIds = localStorage.getItem('selectedRealtimeRouteIds');

    if (storedOperatorIds) {
        selectedOperatorIds = new Set(JSON.parse(storedOperatorIds));
    } else {
        // --- DEFAULT OPERATOR (e.g., 2606) ---
        // selectedOperatorIds.add("2606"); // Pre-select "2606" if nothing stored
        // console.log("Defaulted to operator 2606 as no selection was found in localStorage.");
    }

    if (storedRouteIds) {
        selectedRealtimeRouteIds = new Set(JSON.parse(storedRouteIds));
    }
    // Filter selectedRealtimeRouteIds to ensure they belong to currently selectedOperatorIds
    // This is important if operators were deselected, their routes should also be deselected.
    const validRoutesForSelectedOperators = new Set();
    selectedRealtimeRouteIds.forEach(routeId => {
        const agencyId = routeId.split('_')[0];
        if (selectedOperatorIds.has(agencyId)) {
            validRoutesForSelectedOperators.add(routeId);
        }
    });
    selectedRealtimeRouteIds = validRoutesForSelectedOperators;

    console.log("State loaded from localStorage:", {selectedOperatorIds, selectedRealtimeRouteIds});
}

// --- Operator Modal Logic ---
async function openOperatorsModal() {
    console.log("Opening Operators Modal");
    try {
        const response = await fetch('/api/agencies');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const agencies = await response.json();

        operatorsListDiv.innerHTML = ''; // Clear previous list
        agencies.forEach(agency => {
            const label = document.createElement('label');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = agency.id;
            checkbox.checked = selectedOperatorIds.has(agency.id);
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(` ${agency.name} (${agency.id})`));
            operatorsListDiv.appendChild(label);
        });
        operatorsModal.style.display = "block";
    } catch (error) {
        console.error("Error fetching or populating agencies:", error);
        alert("Could not load operator list. Please try again.");
    }
}

async function handleSaveOperators() {
    const newSelectedOperatorIds = new Set();
    operatorsListDiv.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
        newSelectedOperatorIds.add(cb.value);
    });

    const deselectedOperators = new Set([...selectedOperatorIds].filter(x => !newSelectedOperatorIds.has(x)));

    selectedOperatorIds = newSelectedOperatorIds;
    operatorsModal.style.display = "none";

    // If operators were deselected, remove their routes from selectedRealtimeRouteIds
    if (deselectedOperators.size > 0) {
        const updatedSelectedRoutes = new Set();
        selectedRealtimeRouteIds.forEach(routeId => {
            const agencyId = routeId.split('_')[0];
            if (!deselectedOperators.has(agencyId)) {
                updatedSelectedRoutes.add(routeId);
            }
        });
        selectedRealtimeRouteIds = updatedSelectedRoutes;
    }
    
    saveStateToLocalStorage();
    console.log("Operators selection saved:", selectedOperatorIds);

    btnRoutes.disabled = selectedOperatorIds.size === 0;

    // Refresh map data if operators changed
    // This will also clear routes if no operators are selected
    await updateMapData();
}

// --- Route Modal Logic ---
let allFetchedRoutesForCurrentOperators = []; // Cache routes for current operators

async function openRoutesModal() {
    if (selectedOperatorIds.size === 0) {
        alert("Please select an operator first.");
        return;
    }
    console.log("Opening Routes Modal for operators:", Array.from(selectedOperatorIds).join(','));
    routeSearchInput.value = ''; // Clear search

    try {
        const agencyIdsParam = Array.from(selectedOperatorIds).join(',');
        const response = await fetch(`/api/routes_by_agency?agency_ids=${agencyIdsParam}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        allFetchedRoutesForCurrentOperators = await response.json();

        populateRoutesModalLists(); // Use the cached/fetched routes
        routesModal.style.display = "block";

    } catch (error) {
        console.error("Error fetching or populating routes:", error);
        alert("Could not load route list. Please try again.");
    }
}

function populateRoutesModalLists() {
    selectedRoutesListDiv.innerHTML = '';
    availableRoutesListDiv.innerHTML = '';
    const searchTerm = routeSearchInput.value.toLowerCase();

    // Sort routes: selected ones first, then by short name
    allFetchedRoutesForCurrentOperators.sort((a, b) => {
        const aSelected = selectedRealtimeRouteIds.has(a.realtime_id);
        const bSelected = selectedRealtimeRouteIds.has(b.realtime_id);

        if (aSelected && !bSelected) return -1;
        if (!aSelected && bSelected) return 1;
        
        // Numeric sort for short_name primary part
        const aParts = a.short_name.split('/');
        const bParts = b.short_name.split('/');
        const aNum = parseInt(aParts[0], 10);
        const bNum = parseInt(bParts[0], 10);

        if (!isNaN(aNum) && !isNaN(bNum)) {
            if (aNum !== bNum) return aNum - bNum;
        }
        // Fallback to full string sort if not numeric or primary numbers are equal
        return a.short_name.localeCompare(b.short_name);
    });


    allFetchedRoutesForCurrentOperators.forEach(route => {
        // Filter by search term
        const routeDisplayName = `${route.short_name} - ${route.long_name || 'No description'}`;
        if (searchTerm && !routeDisplayName.toLowerCase().includes(searchTerm) && !route.realtime_id.toLowerCase().includes(searchTerm)) {
            return; // Skip if not matching search
        }

        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = route.realtime_id; // e.g., "2606_50"
        checkbox.dataset.shortName = route.short_name; // Store for display
        checkbox.checked = selectedRealtimeRouteIds.has(route.realtime_id);
        
        checkbox.addEventListener('change', (event) => {
            // Dynamically move between lists on check/uncheck
            if (event.target.checked) {
                selectedRealtimeRouteIds.add(event.target.value);
            } else {
                selectedRealtimeRouteIds.delete(event.target.value);
            }
            // Re-populate to reflect changes and maintain sort order
            // This is simpler than manually moving DOM elements and re-sorting
            populateRoutesModalLists(); 
        });

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(` ${routeDisplayName} (Agency: ${route.agency_id})`));

        if (checkbox.checked) {
            selectedRoutesListDiv.appendChild(label);
        } else {
            availableRoutesListDiv.appendChild(label);
        }
    });
}

function filterAvailableRoutes() {
    populateRoutesModalLists(); // Re-render lists with the current search term
}

async function handleSaveRoutes() {
    // selectedRealtimeRouteIds is already up-to-date due to checkbox change listeners
    saveStateToLocalStorage();
    routesModal.style.display = "none";
    console.log("Routes selection saved:", selectedRealtimeRouteIds);
    await updateMapData(); // This will fetch shapes and bus positions for new selection
}

// --- Map Update Logic ---
async function updateMapData() {
    console.log("Updating map data for routes:", selectedRealtimeRouteIds);
    clearAllMapLayers(); // Clear existing markers and polylines
    updateMapTitle();

    if (selectedRealtimeRouteIds.size === 0) {
        console.log("No routes selected. Map will be empty.");
        if (dataFetchIntervalId) clearInterval(dataFetchIntervalId);
        dataFetchIntervalId = null;
        return;
    }

    const routesParam = Array.from(selectedRealtimeRouteIds).join(',');

    // Fetch and draw route shapes
    await fetchAndDrawRouteShapes(routesParam);

    // Fetch bus positions (and set up interval)
    await fetchAndUpdateMarkers(routesParam); // Initial fetch

    if (dataFetchIntervalId) clearInterval(dataFetchIntervalId); // Clear existing interval
    dataFetchIntervalId = setInterval(async () => { // Assign to new global interval ID
        // Fetch only if there are selected routes
        if (selectedRealtimeRouteIds.size > 0) {
            const currentRoutesParam = Array.from(selectedRealtimeRouteIds).join(',');
            await fetchAndUpdateMarkers(currentRoutesParam);
        } else {
            // If no routes are selected (e.g., user deselects all), clear interval
            if (dataFetchIntervalId) clearInterval(dataFetchIntervalId);
            dataFetchIntervalId = null;
            clearAllMapLayers(); // Also clear markers if routes become empty
        }
    }, 20000); // 20 seconds
}

function updateMapTitle() {
    if (selectedOperatorIds.size === 0) {
        mapTitleH3.textContent = 'No operator selected';
        return;
    }
    
    let title = `Tracking routes: `;
    if (selectedRealtimeRouteIds.size === 0) {
        title += "None selected";
    } else {
        const shortNames = Array.from(selectedRealtimeRouteIds).map(rtId => {
            const parts = rtId.split('_');
            return parts.length > 1 ? parts[parts.length - 1] : rtId; // "2606_50" -> "50"
        }).sort((a, b) => { // Attempt numeric sort
            const numA = parseInt(a.match(/\d+/)?.[0]);
            const numB = parseInt(b.match(/\d+/)?.[0]);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a.localeCompare(b); // Fallback to string
        });
        title += shortNames.join(', ');
    }
    mapTitleH3.textContent = title;
    // console.log("Map title updated:", title);
}


function clearAllMapLayers() {
    // Clear Polylines
    for (const routeId in routePolylines) {
        routePolylines[routeId].forEach(polyline => polyline.setMap(null));
    }
    routePolylines = {};

    // Clear Markers
    for (const vehicleId in busMarkerObjects) {
        if (busMarkerObjects[vehicleId].gmapMarker) {
            busMarkerObjects[vehicleId].gmapMarker.map = null; // AdvancedMarkerElement
        }
    }
    busMarkerObjects = {};
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    animationFrameId = null;

    console.log("All map layers (polylines, markers) cleared.");
}


// --- MODIFIED: fetchAndDrawRouteShapes ---
// Now accepts routesParam
async function fetchAndDrawRouteShapes(routesParam) {
    if (!routesParam) {
        console.log("fetchAndDrawRouteShapes: No routes specified, skipping.");
        clearPolylines(); // Ensure polylines are cleared if no routes
        return;
    }
    console.log(`Fetching route shapes for: ${routesParam}`);
    try {
        const response = await fetch(`/api/route_shapes?routes=${routesParam}`);
        // ... (rest of the function remains largely the same, just uses the data for specific routes)
        if (!response.ok) {
            console.error(`Error fetching route shapes: ${response.status} ${response.statusText}`);
            try { const errorData = await response.json(); console.error("Server error details:", errorData); } catch (e) { /* Ignore */ }
            return;
        }
        const shapesData = await response.json();

        if (Object.keys(shapesData).length === 0) {
            console.log("Received empty shape data. No route paths drawn.");
            return;
        }
        console.log(`Received shape data for ${Object.keys(shapesData).length} routes.`);
        // No need for clearPolylines() here, as updateMapData handles overall clearing

        const routeColors = ['#FF5733', '#3375FF', '#33FF57', '#FFC300', '#C70039', '#900C3F', '#581845'];
        let colorIndex = 0;

        for (const routeId in shapesData) { // routeId here is realtime_route_id
            if (!shapesData.hasOwnProperty(routeId)) continue;
            const shapes = shapesData[routeId]; // shapes is an array of paths (arrays of points)
            if (!Array.isArray(shapes)) continue;

            const color = routeColors[colorIndex % routeColors.length];
            if (!routePolylines[routeId]) { // Check if already initialized for this routeId
                routePolylines[routeId] = [];
            }

            shapes.forEach((pathPoints, index) => {
                if (!Array.isArray(pathPoints) || pathPoints.length < 2) return;
                const validPathPoints = pathPoints.filter(p => typeof p?.lat === 'number' && typeof p?.lng === 'number');
                if (validPathPoints.length < 2) return;

                try {
                    const polyline = new google.maps.Polyline({
                        path: validPathPoints, geodesic: true, strokeColor: color,
                        strokeOpacity: 0.65, strokeWeight: 5, zIndex: 1
                    });
                    polyline.setMap(map);
                    routePolylines[routeId].push(polyline); // Add to the list for this routeId
                } catch (e) { console.error(`Error creating polyline for route ${routeId}, shape ${index + 1}:`, e); }
            });
            colorIndex++;
        }
         console.log("Finished drawing route polylines for current selection.");
    } catch (error) { console.error("Error fetching or drawing route shapes:", error); }
}

// --- MODIFIED: fetchAndUpdateMarkers ---
// Now accepts routesParam
async function fetchAndUpdateMarkers(routesParam) {
    if (!routesParam) {
        console.log("fetchAndUpdateMarkers: No routes specified, skipping bus data fetch.");
        // If no routes, ensure existing markers are cleared (though updateMapData should handle this)
        // For safety, one could iterate busMarkerObjects and set map to null.
        // However, clearAllMapLayers() in updateMapData is the primary clearing mechanism.
        return;
    }
    // console.log(`Fetching bus data for: ${routesParam}`);
    try {
        const response = await fetch(`/api/bus_data?routes=${routesParam}`);
        if (!response.ok) {
            console.error(`Error fetching bus data: ${response.status} ${response.statusText}`);
            const errorData = await response.json().catch(() => ({}));
            console.error("Server error details for bus data:", errorData);
            return;
        }
        const busData = await response.json();
        // console.log(`Received ${busData.length} bus updates for current selection.`);

        const updatedVehicleIds = new Set();

        busData.forEach(bus => {
            const vehicleId = bus.vehicle_id;
            if (!vehicleId || vehicleId === 'N/A') return;
            if (typeof bus.latitude !== 'number' || typeof bus.longitude !== 'number') return;

            updatedVehicleIds.add(vehicleId);
            const newPosition = { lat: bus.latitude, lng: bus.longitude };
            const bearing = Number(bus.bearing) ?? 0;
            const routeId = bus.route_id || 'N/A'; // This is the realtime_route_id
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
            
            // SVG Icon (same as before)
            const iconSize = 40; const circleRadius = 12; const center = iconSize / 2;
            const pointerHeight = 12; const pointerWidth = 15;
            const fontSize = routeShortName.length > 2 ? 11 : 15;
            const arrowOffset = 10;

            const svgContent = `
                <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 ${iconSize} ${iconSize}" xmlns="http://www.w3.org/2000/svg">
                  <g transform="rotate(${bearing}, ${center}, ${center})">
                    <circle cx="${center}" cy="${center}" r="${circleRadius}" fill="black" stroke="white" stroke-width="1.5"/>
                    <polygon points="${center}, ${center - circleRadius + 1 - arrowOffset} ${center - pointerWidth / 2}, ${center - circleRadius + pointerHeight - arrowOffset} ${center + pointerWidth / 2}, ${center - circleRadius + pointerHeight + 1 - arrowOffset}" fill="black" stroke="red" stroke-width="1.5" />
                    <text x="${center}" y="${center + 1}" fill="white" font-size="${fontSize}" font-weight="bold" font-family="Arial, sans-serif" text-anchor="middle" dominant-baseline="middle" transform="rotate(${-bearing}, ${center}, ${center})">${routeShortName}</text>
                  </g>
                </svg>`;


            if (busMarkerObjects[vehicleId]) {
                // Marker EXISTS
                const markerData = busMarkerObjects[vehicleId];
                markerData.gmapMarker.title = `Route: ${routeId}\nVehicle: ${vehicleId}\nSpeed: ${speedDisplay}\nTime: ${timeDisplay}`;
                if (markerData.infowindow) markerData.infowindow.setContent(currentInfoContent);
                
                // Check if content is an HTMLElement before setting innerHTML
                if (markerData.gmapMarker.content instanceof HTMLElement) {
                    markerData.gmapMarker.content.innerHTML = svgContent;
                } else { // If not, it might be the initial creation or a different type, recreate content div
                    const markerElement = document.createElement('div');
                    markerElement.innerHTML = svgContent;
                    markerElement.style.cursor = 'pointer';
                    markerData.gmapMarker.content = markerElement;
                }


                const currentPosition = markerData.gmapMarker.position;
                if (currentPosition && (Math.abs((currentPosition?.lat || 0) - newPosition.lat) > 0.000001 || Math.abs((currentPosition?.lng || 0) - newPosition.lng) > 0.000001)) {
                    if (!markerData.isAnimating || markerData.targetPos?.lat !== newPosition.lat || markerData.targetPos?.lng !== newPosition.lng) {
                        markerData.startPos = markerData.gmapMarker.position;
                        markerData.targetPos = newPosition;
                        markerData.startTime = performance.now();
                        markerData.isAnimating = true;
                    }
                } else if (!markerData.isAnimating) { // Snap to position if no significant change and not animating
                    markerData.gmapMarker.position = newPosition;
                    markerData.startPos = null;
                }
            } else {
                // Marker is NEW
                const markerElement = document.createElement('div');
                markerElement.innerHTML = svgContent;
                markerElement.style.cursor = 'pointer';

                const gmapMarker = new google.maps.marker.AdvancedMarkerElement({
                    map: map, position: newPosition, content: markerElement,
                    title: `Route: ${routeId}\nVehicle: ${vehicleId}\nSpeed: ${speedDisplay}\nTime: ${timeDisplay}`,
                    zIndex: 100
                });
                const infowindow = new google.maps.InfoWindow({ content: currentInfoContent, ariaLabel: `Bus ${vehicleId}` });
                gmapMarker.addListener("click", () => infowindow.open({ anchor: gmapMarker, map }));

                busMarkerObjects[vehicleId] = {
                    gmapMarker: gmapMarker, infowindow: infowindow, isAnimating: false,
                    startPos: null, targetPos: newPosition, startTime: 0
                };
            }
        }); // End busData.forEach

        // Remove stale markers
        for (const vehicleId in busMarkerObjects) {
            if (!updatedVehicleIds.has(vehicleId)) {
                if (busMarkerObjects[vehicleId].gmapMarker) {
                     busMarkerObjects[vehicleId].gmapMarker.map = null; // Remove from map
                }
                delete busMarkerObjects[vehicleId];
            }
        }
        startAnimationLoop(); // Ensure animation loop runs if needed
        // console.log(`Tracking ${Object.keys(busMarkerObjects).length} bus markers for current selection.`);

    } catch (error) { console.error("Error in fetchAndUpdateMarkers:", error); }
}

// --- Animation, Formatting (largely unchanged but ensure they are present) ---
function animateMarkers(timestamp) {
    let stillAnimating = false;
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
            } else { markerData.isAnimating = false; } // Should not happen if startPos/targetPos are set

            if (fraction < 1) {
                stillAnimating = true;
            } else {
                markerData.isAnimating = false;
                if (markerData.targetPos) markerData.gmapMarker.position = markerData.targetPos; // Snap to final
                markerData.startPos = null; // Clear startPos after animation
            }
        }
    }

    if (stillAnimating) { animationFrameId = requestAnimationFrame(animateMarkers); }
    else { animationFrameId = null; }
}

function startAnimationLoop() {
    if (animationFrameId === null) { // Only start if not already running
         let needsAnimation = false;
         for (const vehicleId in busMarkerObjects) { if (busMarkerObjects[vehicleId].isAnimating) { needsAnimation = true; break; } }
         if (needsAnimation) { animationFrameId = requestAnimationFrame(animateMarkers); }
    }
}

// Renamed from original clearPolylines, this is for SPECIFIC polylines, not all.
// clearAllMapLayers now handles the broad clearing.
// function clearRouteSpecificPolylines(routeIdToClear) {
//    if (routePolylines[routeIdToClear]) {
//        routePolylines[routeIdToClear].forEach(polyline => polyline.setMap(null));
//        delete routePolylines[routeIdToClear];
//    }
//}

function formatTimestamp(unixTimestamp) {
    if (unixTimestamp === null || typeof unixTimestamp === 'undefined') return 'No Timestamp';
    try {
        const timestampMs = Number(unixTimestamp) * 1000;
        if (isNaN(timestampMs)) return 'Invalid Time Data';
        const date = new Date(timestampMs);
        if (isNaN(date.getTime())) return 'Invalid Date'; // Check if date is valid
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) { console.error("Error formatting timestamp:", unixTimestamp, e); return 'Time Format Error'; }
}