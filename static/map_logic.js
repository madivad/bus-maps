console.log("map_logic.js script started parsing."); // <-- ADD 1

// Global variables (accessible within this script)
let map;
let busMarkerObjects = {};
let routePolylines = {};
const animationDuration = 1500; // Milliseconds for marker animation
let animationFrameId = null; // To control the animation loop

// --- Countdown Timer Variables ---
const JS_DATA_REFRESH_INTERVAL_SECONDS = 10; // Should match DATA_REFRESH_INTERVAL_SECONDS in app.py and setInterval below
const FETCH_API_AT_COUNT = 1; // <<< NEW: Fetch when countdown reaches this value (e.g., 2 seconds left)
let countdownValue = JS_DATA_REFRESH_INTERVAL_SECONDS;
let countdownIntervalId = null; // To store the ID of the 1-second interval
let timerDisplayElement; // To store the <div> element
let isFetchingApiData = false; // <<< NEW: Flag to track if an early fetch is in progress

// IMPORTANT: This function is called by the Google Maps script's callback parameter
async function initMap() {
    console.log(">>> initMap function STARTED!"); // <-- ADD 2

    // Initial map center (adjust as needed)
    const initialCenter = { lat: -33.48, lng: 151.33 };
    try {
        map = new google.maps.Map(document.getElementById("map"), {
            zoom: 14,
            center: initialCenter,
            mapId: "BUS_MAP_REALTIME" // Optional Map ID
        });
        console.log(">>> google.maps.Map object CREATED successfully."); // <-- ADD 3
    } catch (mapError) {
        console.error(">>> ERROR Creating google.maps.Map object:", mapError); // <-- ADD 4
        return; // Stop if map creation failed
    }

    console.log("Map initialized.");

    timerDisplayElement = document.getElementById("small-timer");
    if (timerDisplayElement) {
        updateTimerDisplay();
        startOneSecondCountdown(); // This will now also handle the early fetch
    } else {
        console.error("Timer display element 'small-timer' not found!");
    }

    await fetchAndDrawRouteShapes();
    isFetchingApiData = true;
    await fetchAndUpdateMarkers().finally(() => {
        isFetchingApiData = false;
    });
    startAnimationLoop();

    // setInterval(fetchAndUpdateMarkers, 10000); // 10 seconds
    setInterval(() => {
        resetCountdown();
    },JS_DATA_REFRESH_INTERVAL_SECONDS * 1000);
}

// --- Countdown Timer Functions ---
function updateTimerDisplay() {
    if (timerDisplayElement) {
        timerDisplayElement.textContent = `${countdownValue}`;
    }
}

function startOneSecondCountdown() {
    if (countdownIntervalId) {
        clearInterval(countdownIntervalId); // Clear any existing 1-second interval
    }
    countdownIntervalId = setInterval(async () => {
        countdownValue--;
        updateTimerDisplay();

        if (countdownValue === FETCH_API_AT_COUNT && !isFetchingApiData) {
            console.log(`Countdown reached ${FETCH_API_AT_COUNT}s. Fetching data early...`);
            isFetchingApiData = true;
            // We call fetchAndUpdateMarkers but don't necessarily need to await it here
            // as the countdown continues independently. The .finally ensures the flag is reset.
            fetchAndUpdateMarkers().finally(() => {
                isFetchingApiData = false;
                console.log("Early data fetch complete.");
            });
        }
    }, 1000);

}

function resetCountdown() {
    countdownValue = JS_DATA_REFRESH_INTERVAL_SECONDS; // Reset to full interval
    updateTimerDisplay(); // Immediately update the display
    // The startOneSecondCountdown and its setInterval are already running,
    // so just resetting countdownValue is enough for it to pick up.
}

// --- End Countdown Timer Functions ---


// --- Assign to window explicitly ---
// This ensures Google Maps API loader finds it after this script is parsed.
console.log("Assigning initMap to window object."); // <-- ADD 10
window.initMap = initMap;

async function fetchAndDrawRouteShapes() {
    console.log("Fetching route shapes from /api/route_shapes...");
    try {
        const response = await fetch('/api/route_shapes');
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
        clearPolylines();

        const routeColors = ['#FF5733', '#3375FF', '#33FF57', '#FFC300', '#C70039', '#900C3F', '#581845'];
        let colorIndex = 0;

        for (const routeId in shapesData) {
            if (!shapesData.hasOwnProperty(routeId)) continue;
            const shapes = shapesData[routeId];
            if (!Array.isArray(shapes)) continue;

            const color = routeColors[colorIndex % routeColors.length];
            routePolylines[routeId] = [];

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
                    routePolylines[routeId].push(polyline);
                } catch (e) { console.error(`Error creating polyline for route ${routeId}, shape ${index + 1}:`, e); }
            });
            colorIndex++;
        }
         console.log("Finished drawing route polylines.");
    } catch (error) { console.error("Error fetching or drawing route shapes:", error); }
}
async function fetchAndUpdateMarkers() {
    // console.log("Fetching bus data from API..."); // Less noise
    try {
        const response = await fetch('/api/bus_data'); // Assuming this API now fetches ALL data and JS will filter later OR it accepts params
        if (!response.ok) {
            console.error(`Error fetching bus data: ${response.status} ${response.statusText}`);
            const errorData = await response.json().catch(() => ({}));
            console.error("Server error details for bus data:", errorData);
            return;
        }
        const busData = await response.json();
        // console.log(`Received ${busData.length} bus updates.`); // Less noise

        const updatedVehicleIds = new Set();

        busData.forEach(bus => {
            const vehicleId = bus.vehicle_id;
            if (!vehicleId || vehicleId === 'N/A') return;
            if (typeof bus.latitude !== 'number' || typeof bus.longitude !== 'number') return;

            updatedVehicleIds.add(vehicleId);
            const newPosition = { lat: bus.latitude, lng: bus.longitude };
            const bearing = Number(bus.bearing) ?? 0;
            const routeId = bus.route_id || 'N/A';
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

            const iconSize = 40; const circleRadius = 12; const center = iconSize / 2;
            const pointerHeight = 12; const pointerWidth = 15;
            const fontSize = routeShortName.length > 2 ? 11 : 15;
            const arrowOffset = 10; // This is the new offset.  Adjust this value!

            const svgContent = `
                <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 ${iconSize} ${iconSize}" xmlns="http://www.w3.org/2000/svg">
                  <g transform="rotate(${bearing}, ${center}, ${center})">
                    <circle cx="${center}" cy="${center}" r="${circleRadius}" fill="black" stroke="white" stroke-width="1.5"/>
                    <polygon points=
                        "${center}, ${center - circleRadius + 1 - arrowOffset}
                        ${center - pointerWidth / 2}, ${center - circleRadius + pointerHeight - arrowOffset}
                        ${center + pointerWidth / 2}, ${center - circleRadius + pointerHeight + 1 - arrowOffset}"                         
                         fill="black" stroke="red" stroke-width="1.5" />
                    <text x="${center}" y="${center + 1}" fill="white" font-size="${fontSize}" font-weight="bold" font-family="Arial, sans-serif" text-anchor="middle" dominant-baseline="middle" transform="rotate(${-bearing}, ${center}, ${center})">${routeShortName}</text>
                  </g>
                </svg>`;


            // "${center}, ${center - circleRadius + 1} 
            // ${center - pointerWidth / 2}, ${center - circleRadius + pointerHeight} 
            // ${center + pointerWidth / 2}, ${center - circleRadius + pointerHeight +1}" 

            // const iconSize = 40;
            // const circleRadius = 18;
            // const center = iconSize / 2;
            // const pointerHeight = 10; // Adjusted for more pronounced arrow
            // const pointerWidth = 10;
            // const fontSize = routeShortName.length > 2 ? 11 : 15;
            // const pointerOffset = 3; // Offset to push the pointer outside the circle

            // const svgContent = `
            //     <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 ${iconSize} ${iconSize}" xmlns="http://www.w3.org/2000/svg">
            //         <g transform="rotate(${bearing}, ${center}, ${center})">
            //             <circle cx="${center}" cy="${center}" r="${circleRadius}" fill="black" stroke="white" stroke-width="1.5"/>
            //             <polygon points="${center},${center - circleRadius - pointerOffset} 
            //                              ${center - pointerWidth / 2}, ${center - circleRadius - pointerOffset - pointerHeight} 
            //                              ${center + pointerWidth / 2}, ${center - circleRadius - pointerOffset - pointerHeight}" 
            //             fill="black"
            //             stroke="white"
            //             stroke-width="1"
            //             />
            //             <text x="${center}" y="${center + 1}" fill="white" font-size="${fontSize}" font-weight="bold" font-family="Arial, sans-serif" text-anchor="middle" dominant-baseline="middle" transform="rotate(${-bearing}, ${center}, ${center})">${routeShortName}</text>
            //         </g>
            //     </svg>`;

            if (busMarkerObjects[vehicleId]) {
                // --- Marker EXISTS ---
                const markerData = busMarkerObjects[vehicleId];
                markerData.gmapMarker.title = `Route: ${routeId}\nVehicle: ${vehicleId}\nSpeed: ${speedDisplay}\nTime: ${timeDisplay}`;
                if (markerData.infowindow) markerData.infowindow.setContent(currentInfoContent);
                if (markerData.gmapMarker.content instanceof HTMLElement) markerData.gmapMarker.content.innerHTML = svgContent;

                const currentPosition = markerData.gmapMarker.position;
                const latDiff = Math.abs((currentPosition?.lat || 0) - newPosition.lat);
                const lngDiff = Math.abs((currentPosition?.lng || 0) - newPosition.lng);

                if (currentPosition && (latDiff > 0.000001 || lngDiff > 0.000001)) {
                    if (!markerData.isAnimating || markerData.targetPos?.lat !== newPosition.lat || markerData.targetPos?.lng !== newPosition.lng) {
                        markerData.startPos = markerData.gmapMarker.position;
                        markerData.targetPos = newPosition;
                        markerData.startTime = performance.now();
                        markerData.isAnimating = true;
                    }
                } else if (!markerData.isAnimating) {
                    markerData.gmapMarker.position = newPosition;
                    markerData.startPos = null;
                }
            } else {
                // --- Marker is NEW ---
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

        // --- Remove stale markers ---
        for (const vehicleId in busMarkerObjects) {
            if (!updatedVehicleIds.has(vehicleId)) {
                busMarkerObjects[vehicleId].gmapMarker.map = null;
                delete busMarkerObjects[vehicleId];
            }
        }
        startAnimationLoop();
        // console.log(`Tracking ${Object.keys(busMarkerObjects).length} bus markers.`); // Less noise

    } catch (error) { console.error("Error in fetchAndUpdateMarkers:", error); }
} // <-- End of fetchAndUpdateMarkers function
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
            } else { markerData.isAnimating = false; }

            if (fraction < 1) {
                stillAnimating = true;
            } else {
                markerData.isAnimating = false;
                if (markerData.targetPos) markerData.gmapMarker.position = markerData.targetPos;
                markerData.startPos = null;
            }
        }
    } // End for loop

    if (stillAnimating) { animationFrameId = requestAnimationFrame(animateMarkers); }
    else { animationFrameId = null; }
}
function startAnimationLoop() {
    if (animationFrameId === null) {
         let needsAnimation = false;
         for (const vehicleId in busMarkerObjects) { if (busMarkerObjects[vehicleId].isAnimating) { needsAnimation = true; break; } }
         if (needsAnimation) { animationFrameId = requestAnimationFrame(animateMarkers); }
    }
}
 function clearPolylines() {
     for (const routeId in routePolylines) { routePolylines[routeId].forEach(polyline => polyline.setMap(null)); }
     routePolylines = {};
 }
function formatTimestamp(unixTimestamp) {
    if (unixTimestamp === null || typeof unixTimestamp === 'undefined') return 'No Timestamp';
    try {
        const timestampMs = Number(unixTimestamp) * 1000;
        if (isNaN(timestampMs)) return 'Invalid Time Data';
        const date = new Date(timestampMs);
        if (isNaN(date.getTime())) return 'Invalid Date';
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) { console.error("Error formatting timestamp:", unixTimestamp, e); return 'Time Format Error'; }
}

// Note: Any functions or variables that NEEDED data directly from Jinja2 templating
// would require adjustment (e.g., passing data via inline script or data attributes).
// In this case, the Google Maps API key is handled in its script URL, and the
// dynamic route display string is handled by Jinja2 directly in the h3 tag.