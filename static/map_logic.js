console.log("map_logic.js script START PARSING.");

// --- Global variables ---
let map;
let busMarkerObjects = {};
let routePolylines = {};
const animationDuration = 1500;
let animationFrameId = null;
let dataFetchIntervalId = null;

let selectedOperatorIds = new Set();
let selectedRealtimeRouteIds = new Set();

const ROUTE_COLORS = ['#FF5733', '#3375FF', '#33FF57', '#FFC300', '#C70039', '#900C3F', '#581845', '#FF8C00', '#00CED1', '#DA70D6', '#20B2AA', '#FF4500', '#4682B4', '#8A2BE2', '#D2691E'];
let assignedRouteColors = {};

let currentMapOptions = {
    updateIntervalMs: 10000,
    liveTrackingEnabled: true,
    showRoutePathsEnabled: true
};

// DOM Elements
let btnOperators, btnRoutes, btnOptions;
let operatorsModal, routesModal, optionsModal;
let closeOperatorsModalBtn, closeRoutesModalBtn, closeOptionsModalBtn;
let operatorsListDiv, saveOperatorsBtn;
let selectedRoutesListDiv, availableRoutesListDiv, saveRoutesBtn, routeSearchInput;
let mapTitleH3;
let updateFrequencySelect, toggleLiveTrackingCheckbox, toggleRoutePathsCheckbox;
let saveOptionsBtn;

// --- Countdown Timer Variables ---
const JS_DATA_REFRESH_INTERVAL_SECONDS = 10; // Should match DATA_REFRESH_INTERVAL_SECONDS in app.py and setInterval below
const FETCH_API_AT_COUNT = 1; // <<< NEW: Fetch when countdown reaches this value (e.g., 2 seconds left)
let countdownValue = JS_DATA_REFRESH_INTERVAL_SECONDS;
let countdownIntervalId = null; // To store the ID of the 1-second interval
let timerDisplayElement; // To store the <div> element
let isFetchingApiData = false; // <<< NEW: Flag to track if an early fetch is in progress

// IMPORTANT: This function is called by the Google Maps script's callback parameter
async function initMap() {
    console.log(">>> initMap: STARTED!");
    try {
        const initialCenter = { lat: -33.48, lng: 151.33 };
        map = new google.maps.Map(document.getElementById("map"), {
            zoom: 11, center: initialCenter, mapId: "BUS_MAP_REALTIME"
        });
        console.log(">>> initMap: Google Maps object CREATED.");
    } catch (mapError) {
        console.error(">>> initMap: ERROR Creating Google Maps object:", mapError);
        return;
    }

    initializeDOMElements(); // Call before addEventListeners
    addEventListeners();     // Call after initializeDOMElements
    loadStateFromLocalStorage();

    console.log(">>> initMap: Initial selectedOperatorIds size:", selectedOperatorIds.size);
    console.log(">>> initMap: Initial selectedRealtimeRouteIds size:", selectedRealtimeRouteIds.size);

    if (selectedOperatorIds.size > 0) {
        if (btnRoutes) btnRoutes.disabled = false; else console.error(">>> initMap: btnRoutes is null!");
        if (selectedRealtimeRouteIds.size > 0) {
            console.log(">>> initMap: Operators and routes selected, calling updateMapData.");
            await updateMapData();
        } else {
            console.log(">>> initMap: Operators loaded, but no routes selected.");
            updateMapTitle();
            if (!currentMapOptions.liveTrackingEnabled && dataFetchIntervalId) {
                clearInterval(dataFetchIntervalId); dataFetchIntervalId = null;
            }
        }
    } else {
        console.log(">>> initMap: No operators selected on initial load.");
        updateMapTitle();
        if (dataFetchIntervalId) {
            clearInterval(dataFetchIntervalId); dataFetchIntervalId = null;
        }
    }
    console.log(">>> initMap: FINISHED.");

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

function initializeDOMElements() {
    console.log("initializeDOMElements: STARTED.");
    btnOperators = document.getElementById('btn-operators'); console.log("btnOperators:", btnOperators);
    btnRoutes = document.getElementById('btn-routes'); console.log("btnRoutes:", btnRoutes);
    btnOptions = document.getElementById('btn-options'); console.log("btnOptions:", btnOptions);

    operatorsModal = document.getElementById('operators-modal'); console.log("operatorsModal:", operatorsModal);
    routesModal = document.getElementById('routes-modal'); console.log("routesModal:", routesModal);
    optionsModal = document.getElementById('options-modal'); console.log("optionsModal:", optionsModal);

    closeOperatorsModalBtn = document.getElementById('close-operators-modal'); console.log("closeOperatorsModalBtn:", closeOperatorsModalBtn);
    closeRoutesModalBtn = document.getElementById('close-routes-modal'); console.log("closeRoutesModalBtn:", closeRoutesModalBtn);
    closeOptionsModalBtn = document.getElementById('close-options-modal'); console.log("closeOptionsModalBtn:", closeOptionsModalBtn);

    operatorsListDiv = document.getElementById('operators-list'); console.log("operatorsListDiv:", operatorsListDiv);
    saveOperatorsBtn = document.getElementById('save-operators'); console.log("saveOperatorsBtn:", saveOperatorsBtn);

    selectedRoutesListDiv = document.getElementById('selected-routes-list'); console.log("selectedRoutesListDiv:", selectedRoutesListDiv);
    availableRoutesListDiv = document.getElementById('available-routes-list'); console.log("availableRoutesListDiv:", availableRoutesListDiv);
    saveRoutesBtn = document.getElementById('save-routes'); console.log("saveRoutesBtn:", saveRoutesBtn);
    routeSearchInput = document.getElementById('route-search-input'); console.log("routeSearchInput:", routeSearchInput);

    mapTitleH3 = document.getElementById('map-title'); console.log("mapTitleH3:", mapTitleH3);

    updateFrequencySelect = document.getElementById('update-frequency'); console.log("updateFrequencySelect:", updateFrequencySelect);
    toggleLiveTrackingCheckbox = document.getElementById('toggle-live-tracking'); console.log("toggleLiveTrackingCheckbox:", toggleLiveTrackingCheckbox);
    toggleRoutePathsCheckbox = document.getElementById('toggle-route-paths'); console.log("toggleRoutePathsCheckbox:", toggleRoutePathsCheckbox);
    saveOptionsBtn = document.getElementById('save-options'); console.log("saveOptionsBtn:", saveOptionsBtn);

    console.log("initializeDOMElements: FINISHED.");
}

function addEventListeners() {
    console.log("addEventListeners: STARTED.");
    // Check if elements exist before adding listeners
    if (btnOperators) btnOperators.addEventListener('click', openOperatorsModal); else console.error("addEventListeners: btnOperators is null!");
    if (btnRoutes) btnRoutes.addEventListener('click', openRoutesModal); else console.error("addEventListeners: btnRoutes is null!");
    if (btnOptions) btnOptions.addEventListener('click', openOptionsModal); else console.error("addEventListeners: btnOptions is null!");

    if (closeOperatorsModalBtn) closeOperatorsModalBtn.addEventListener('click', () => { console.log("Close Operators Modal clicked"); operatorsModal.style.display = "none"; }); else console.error("addEventListeners: closeOperatorsModalBtn is null!");
    if (closeRoutesModalBtn) closeRoutesModalBtn.addEventListener('click', () => { console.log("Close Routes Modal clicked"); routesModal.style.display = "none"; }); else console.error("addEventListeners: closeRoutesModalBtn is null!");
    if (closeOptionsModalBtn) closeOptionsModalBtn.addEventListener('click', () => { console.log("Close Options Modal clicked"); optionsModal.style.display = "none"; }); else console.error("addEventListeners: closeOptionsModalBtn is null!");

    if (saveOperatorsBtn) saveOperatorsBtn.addEventListener('click', handleSaveOperators); else console.error("addEventListeners: saveOperatorsBtn is null!");
    if (saveRoutesBtn) saveRoutesBtn.addEventListener('click', handleSaveRoutes); else console.error("addEventListeners: saveRoutesBtn is null!");
    if (saveOptionsBtn) saveOptionsBtn.addEventListener('click', handleSaveOptions); else console.error("addEventListeners: saveOptionsBtn is null!");
    
    if (routeSearchInput) routeSearchInput.addEventListener('input', filterAvailableRoutes); else console.error("addEventListeners: routeSearchInput is null!");

    window.addEventListener('click', (event) => {
        if (event.target === operatorsModal) { console.log("Window click on Operators Modal background"); operatorsModal.style.display = "none"; }
        if (event.target === routesModal) { console.log("Window click on Routes Modal background"); routesModal.style.display = "none"; }
        if (event.target === optionsModal) { console.log("Window click on Options Modal background"); optionsModal.style.display = "none"; }
    });
    console.log("addEventListeners: FINISHED.");
}

function loadStateFromLocalStorage() {
    console.log("loadStateFromLocalStorage: STARTED");
    const storedOperatorIds = localStorage.getItem('selectedOperatorIds');
    console.log("loadStateFromLocalStorage: raw storedOperatorIds:", storedOperatorIds);
    const storedRouteIds = localStorage.getItem('selectedRealtimeRouteIds');
    console.log("loadStateFromLocalStorage: raw storedRouteIds:", storedRouteIds);
    const storedOptions = localStorage.getItem('currentMapOptions');
    console.log("loadStateFromLocalStorage: raw storedOptions:", storedOptions);

    if (storedOperatorIds) {
        try {
            selectedOperatorIds = new Set(JSON.parse(storedOperatorIds));
        } catch (e) {
            console.error("loadStateFromLocalStorage: Error parsing storedOperatorIds. Using empty set.", e);
            selectedOperatorIds = new Set();
            localStorage.removeItem('selectedOperatorIds'); // Remove corrupted data
        }
    }

    if (storedRouteIds) {
         try {
            selectedRealtimeRouteIds = new Set(JSON.parse(storedRouteIds));
        } catch (e) {
            console.error("loadStateFromLocalStorage: Error parsing storedRouteIds. Using empty set.", e);
            selectedRealtimeRouteIds = new Set();
            localStorage.removeItem('selectedRealtimeRouteIds'); // Remove corrupted data
        }
    }

    const validRoutesForSelectedOperators = new Set();
    selectedRealtimeRouteIds.forEach(routeId => {
        const agencyId = routeId.split('_')[0];
        if (selectedOperatorIds.has(agencyId)) {
            validRoutesForSelectedOperators.add(routeId);
        } else {
            console.log(`loadStateFromLocalStorage: Removing route ${routeId} as its operator ${agencyId} is not selected.`);
        }
    });
    selectedRealtimeRouteIds = validRoutesForSelectedOperators;

    if (storedOptions) {
        try {
            const parsedOptions = JSON.parse(storedOptions);
            currentMapOptions = { ...currentMapOptions, ...parsedOptions };
        } catch (e) {
            console.error("loadStateFromLocalStorage: Error parsing storedOptions. Using defaults.", e);
            localStorage.removeItem('currentMapOptions'); // Remove corrupted data
        }
    }
    console.log("loadStateFromLocalStorage: FINAL STATE:", { selectedOperatorIds: Array.from(selectedOperatorIds), selectedRealtimeRouteIds: Array.from(selectedRealtimeRouteIds), currentMapOptions });
    console.log("loadStateFromLocalStorage: FINISHED.");
}

function saveStateToLocalStorage() {
    console.log("saveStateToLocalStorage: SAVING. Current state:", { selectedOperatorIds: Array.from(selectedOperatorIds), selectedRealtimeRouteIds: Array.from(selectedRealtimeRouteIds), currentMapOptions });
    localStorage.setItem('selectedOperatorIds', JSON.stringify(Array.from(selectedOperatorIds)));
    localStorage.setItem('selectedRealtimeRouteIds', JSON.stringify(Array.from(selectedRealtimeRouteIds)));
    localStorage.setItem('currentMapOptions', JSON.stringify(currentMapOptions));
    console.log("saveStateToLocalStorage: FINISHED.");
}

async function openOperatorsModal() {
    console.log("openOperatorsModal: CLICKED.");
    // ... (rest of function is likely okay, but check console for fetch errors)
    try {
        const response = await fetch('/api/agencies');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const agencies = await response.json();

        operatorsListDiv.innerHTML = '';
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
        if (operatorsModal) operatorsModal.style.display = "block"; else console.error("openOperatorsModal: operatorsModal is null!");
    } catch (error) {
        console.error("Error fetching or populating agencies:", error);
        alert("Could not load operator list. Please try again.");
    }
}

async function handleSaveOperators() {
    console.log("handleSaveOperators: CLICKED.");
    // ... (rest of function)
    const newSelectedOperatorIds = new Set();
    if (!operatorsListDiv) { console.error("handleSaveOperators: operatorsListDiv is null!"); return; }
    operatorsListDiv.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
        newSelectedOperatorIds.add(cb.value);
    });

    const deselectedOperators = new Set([...selectedOperatorIds].filter(x => !newSelectedOperatorIds.has(x)));
    selectedOperatorIds = newSelectedOperatorIds;
    if (operatorsModal) operatorsModal.style.display = "none"; else console.error("handleSaveOperators: operatorsModal is null!");

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
    console.log("Operators selection saved:", Array.from(selectedOperatorIds));
    if (btnRoutes) btnRoutes.disabled = selectedOperatorIds.size === 0; else console.error("handleSaveOperators: btnRoutes is null!");
    await updateMapData();
}

// --- Route Modal Logic ---
let allFetchedRoutesForCurrentOperators = [];

async function openRoutesModal() {
    console.log("openRoutesModal: CLICKED.");
    // ... (rest of function)
    if (selectedOperatorIds.size === 0) {
        alert("Please select an operator first.");
        return;
    }
    console.log("Opening Routes Modal for operators:", Array.from(selectedOperatorIds).join(','));
    if (routeSearchInput) routeSearchInput.value = ''; else console.error("openRoutesModal: routeSearchInput is null!");

    try {
        const agencyIdsParam = Array.from(selectedOperatorIds).join(',');
        const response = await fetch(`/api/routes_by_agency?agency_ids=${agencyIdsParam}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        allFetchedRoutesForCurrentOperators = await response.json();

        const tempAssignedColors = {};
        allFetchedRoutesForCurrentOperators.forEach(route => {
            if (!assignedRouteColors[route.realtime_id]) {
                let hash = 0;
                for (let i = 0; i < route.realtime_id.length; i++) {
                    hash = route.realtime_id.charCodeAt(i) + ((hash << 5) - hash);
                    hash = hash & hash;
                }
                tempAssignedColors[route.realtime_id] = ROUTE_COLORS[Math.abs(hash) % ROUTE_COLORS.length];
            } else {
                tempAssignedColors[route.realtime_id] = assignedRouteColors[route.realtime_id];
            }
        });
        Object.assign(assignedRouteColors, tempAssignedColors);

        populateRoutesModalLists();
        if (routesModal) routesModal.style.display = "block"; else console.error("openRoutesModal: routesModal is null!");
    } catch (error) {
        console.error("Error fetching or populating routes:", error);
        alert("Could not load route list. Please try again.");
    }
}

function populateRoutesModalLists() {
    console.log("populateRoutesModalLists: STARTED.");
    if (!selectedRoutesListDiv || !availableRoutesListDiv) {
        console.error("populateRoutesModalLists: List divs are null!"); return;
    }
    selectedRoutesListDiv.innerHTML = '';
    availableRoutesListDiv.innerHTML = '';
    const searchTerm = routeSearchInput ? routeSearchInput.value.toLowerCase() : "";

    allFetchedRoutesForCurrentOperators.sort((a, b) => {
        const aSelected = selectedRealtimeRouteIds.has(a.realtime_id);
        const bSelected = selectedRealtimeRouteIds.has(b.realtime_id);
        if (aSelected && !bSelected) return -1;
        if (!aSelected && bSelected) return 1;
        const aParts = a.short_name.split('/');
        const bParts = b.short_name.split('/');
        const aNum = parseInt(aParts[0], 10);
        const bNum = parseInt(bParts[0], 10);
        if (!isNaN(aNum) && !isNaN(bNum) && aNum !== bNum) return aNum - bNum;
        return a.short_name.localeCompare(b.short_name);
    });

    allFetchedRoutesForCurrentOperators.forEach(route => {
        const routeDisplayName = `${route.short_name} - ${route.long_name || 'No description'}`;
        if (searchTerm && !routeDisplayName.toLowerCase().includes(searchTerm) && !route.realtime_id.toLowerCase().includes(searchTerm)) {
            return;
        }

        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = route.realtime_id;
        checkbox.dataset.shortName = route.short_name;
        checkbox.checked = selectedRealtimeRouteIds.has(route.realtime_id);
        
        checkbox.addEventListener('change', (event) => {
            console.log(`Route checkbox changed: ${event.target.value}, checked: ${event.target.checked}`);
            if (event.target.checked) {
                selectedRealtimeRouteIds.add(event.target.value);
            } else {
                selectedRealtimeRouteIds.delete(event.target.value);
            }
            populateRoutesModalLists(); 
        });

        const colorDot = document.createElement('span');
        colorDot.className = 'route-color-dot';
        colorDot.style.backgroundColor = assignedRouteColors[route.realtime_id] || ROUTE_COLORS[0];
        
        label.appendChild(colorDot);
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(` ${routeDisplayName} (Agency: ${route.agency_id})`));

        if (checkbox.checked) {
            selectedRoutesListDiv.appendChild(label);
        } else {
            availableRoutesListDiv.appendChild(label);
        }
    });
    console.log("populateRoutesModalLists: FINISHED.");
}

function filterAvailableRoutes() {
    console.log("filterAvailableRoutes: Input changed.");
    populateRoutesModalLists();
}

async function handleSaveRoutes() {
    console.log("handleSaveRoutes: CLICKED.");
    saveStateToLocalStorage();
    if (routesModal) routesModal.style.display = "none"; else console.error("handleSaveRoutes: routesModal is null!");
    console.log("Routes selection saved:", Array.from(selectedRealtimeRouteIds));
    await updateMapData();
}

function openOptionsModal() {
    console.log("openOptionsModal: CLICKED.");
    if (!updateFrequencySelect || !toggleLiveTrackingCheckbox || !toggleRoutePathsCheckbox) {
        console.error("openOptionsModal: Option elements are null!"); return;
    }
    updateFrequencySelect.value = currentMapOptions.updateIntervalMs.toString();
    toggleLiveTrackingCheckbox.checked = currentMapOptions.liveTrackingEnabled;
    toggleRoutePathsCheckbox.checked = currentMapOptions.showRoutePathsEnabled;
    if (optionsModal) optionsModal.style.display = "block"; else console.error("openOptionsModal: optionsModal is null!");
}

function handleSaveOptions() {
    console.log("handleSaveOptions: CLICKED.");
    if (!updateFrequencySelect || !toggleLiveTrackingCheckbox || !toggleRoutePathsCheckbox) {
        console.error("handleSaveOptions: Option elements are null!"); return;
    }
    const newUpdateInterval = parseInt(updateFrequencySelect.value, 10);
    const newLiveTracking = toggleLiveTrackingCheckbox.checked;
    const newShowRoutePaths = toggleRoutePathsCheckbox.checked;

    currentMapOptions.updateIntervalMs = newUpdateInterval;
    currentMapOptions.liveTrackingEnabled = newLiveTracking;
    currentMapOptions.showRoutePathsEnabled = newShowRoutePaths;

    saveStateToLocalStorage();
    if (optionsModal) optionsModal.style.display = "none"; else console.error("handleSaveOptions: optionsModal is null!");
    console.log("Map options saved:", currentMapOptions);
    updateMapData();
}

async function updateMapData() {
    console.log("updateMapData: STARTED. Current selected routes:", Array.from(selectedRealtimeRouteIds));
    clearAllMapLayers();
    updateMapTitle();

    if (selectedRealtimeRouteIds.size === 0) {
        console.log("updateMapData: No routes selected. Map will be empty.");
        if (dataFetchIntervalId) {
            clearInterval(dataFetchIntervalId);
            dataFetchIntervalId = null;
            console.log("updateMapData: Cleared data fetch interval (no routes).");
        }
        return;
    }

    const routesParam = Array.from(selectedRealtimeRouteIds).join(',');
    console.log("updateMapData: routesParam for API:", routesParam);

    if (currentMapOptions.showRoutePathsEnabled) {
        console.log("updateMapData: Route paths ARE enabled. Fetching shapes.");
        await fetchAndDrawRouteShapes(routesParam);
    } else {
        console.log("updateMapData: Route paths ARE NOT enabled. Skipping shapes.");
    }

    if (dataFetchIntervalId) {
        clearInterval(dataFetchIntervalId);
        dataFetchIntervalId = null;
        console.log("updateMapData: Cleared existing data fetch interval.");
    }

    if (currentMapOptions.liveTrackingEnabled) {
        console.log("updateMapData: Live tracking IS enabled. Fetching markers and starting interval.");
        await fetchAndUpdateMarkers(routesParam);

        dataFetchIntervalId = setInterval(async () => {
            if (currentMapOptions.liveTrackingEnabled && selectedRealtimeRouteIds.size > 0) {
                const currentRoutesParamForInterval = Array.from(selectedRealtimeRouteIds).join(',');
                // console.log("Interval Tick: Fetching markers for", currentRoutesParamForInterval); // Can be very noisy
                await fetchAndUpdateMarkers(currentRoutesParamForInterval);
            } else {
                if (dataFetchIntervalId) {
                    clearInterval(dataFetchIntervalId);
                    dataFetchIntervalId = null;
                    console.log("Interval Tick: Tracking disabled or no routes. Interval STOPPED from within.");
                }
            }
        }, currentMapOptions.updateIntervalMs);
        console.log(`updateMapData: Live tracking interval (re)started for ${currentMapOptions.updateIntervalMs / 1000}s.`);
    } else {
        console.log("updateMapData: Live tracking IS NOT enabled. Fetching markers once.");
        await fetchAndUpdateMarkers(routesParam);
    }
    console.log("updateMapData: FINISHED.");
}

function updateMapTitle() {
    // console.log("updateMapTitle: Updating...");
    if (!mapTitleH3) { console.error("updateMapTitle: mapTitleH3 is null!"); return; }
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
            return parts.length > 1 ? parts[parts.length - 1] : rtId;
        }).sort((a, b) => {
            const numA = parseInt(a.match(/\d+/)?.[0]);
            const numB = parseInt(b.match(/\d+/)?.[0]);
            if (!isNaN(numA) && !isNaN(numB) && numA !== numB) return numA - numB;
            return a.localeCompare(b);
        });
        title += shortNames.join(', ');
    }
    mapTitleH3.textContent = title;
}

function clearAllMapLayers() {
    console.log("clearAllMapLayers: STARTED.");
    for (const routeId in routePolylines) {
        if (routePolylines.hasOwnProperty(routeId)) {
            routePolylines[routeId].forEach(polyline => polyline.setMap(null));
        }
    }
    routePolylines = {};

    for (const vehicleId in busMarkerObjects) {
        if (busMarkerObjects.hasOwnProperty(vehicleId)) {
            if (busMarkerObjects[vehicleId].gmapMarker) {
                busMarkerObjects[vehicleId].gmapMarker.map = null;
            }
        }
    }
    busMarkerObjects = {};

    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    console.log("clearAllMapLayers: FINISHED. Polylines and markers cleared.");
}

async function fetchAndDrawRouteShapes(routesParam) {
    // console.log("fetchAndDrawRouteShapes: Fetching for routes:", routesParam);
    if (!routesParam) return;
    try {
        const response = await fetch(`/api/route_shapes?routes=${routesParam}`);
        if (!response.ok) {
            console.error(`fetchAndDrawRouteShapes: HTTP error ${response.status}`); return;
        }
        const shapesData = await response.json();
        if (Object.keys(shapesData).length === 0) { /* console.log("fetchAndDrawRouteShapes: No shape data received."); */ return; }
        // console.log(`fetchAndDrawRouteShapes: Received shape data for ${Object.keys(shapesData).length} routes.`);

        for (const routeId in shapesData) {
            if (!shapesData.hasOwnProperty(routeId)) continue;
            const shapes = shapesData[routeId];
            if (!Array.isArray(shapes)) continue;

            let colorForPolyline = assignedRouteColors[routeId];
            if (!colorForPolyline) {
                let hash = 0;
                for (let i = 0; i < routeId.length; i++) { hash = routeId.charCodeAt(i) + ((hash << 5) - hash); hash = hash & hash; }
                colorForPolyline = ROUTE_COLORS[Math.abs(hash) % ROUTE_COLORS.length];
                assignedRouteColors[routeId] = colorForPolyline;
            }
            
            if (!routePolylines[routeId]) routePolylines[routeId] = [];

            shapes.forEach((pathPoints) => {
                if (!Array.isArray(pathPoints) || pathPoints.length < 2) return;
                const validPathPoints = pathPoints.filter(p => typeof p?.lat === 'number' && typeof p?.lng === 'number');
                if (validPathPoints.length < 2) return;
                try {
                    const polyline = new google.maps.Polyline({
                        path: validPathPoints, geodesic: true, strokeColor: colorForPolyline,
                        strokeOpacity: 0.45, strokeWeight: 5, zIndex: 1
                    });
                    polyline.setMap(map);
                    routePolylines[routeId].push(polyline);
                } catch (e) { console.error(`fetchAndDrawRouteShapes: Error creating polyline for ${routeId}`, e); }
            });
        }
    } catch (error) { console.error("fetchAndDrawRouteShapes: General error:", error); }
    // console.log("fetchAndDrawRouteShapes: FINISHED.");
}

async function fetchAndUpdateMarkers(routesParam) {
    // console.log("fetchAndUpdateMarkers: Fetching for routes:", routesParam);
    if (!routesParam) return;
    try {
        const response = await fetch(`/api/bus_data?routes=${routesParam}`);
        if (!response.ok) { console.error(`fetchAndUpdateMarkers: HTTP error ${response.status}`); return; }
        const busData = await response.json();
        const updatedVehicleIds = new Set();

        busData.forEach(bus => {
            const vehicleId = bus.vehicle_id;
            if (!vehicleId || vehicleId === 'N/A' || typeof bus.latitude !== 'number' || typeof bus.longitude !== 'number') return;
            updatedVehicleIds.add(vehicleId);

            const newPosition = { lat: bus.latitude, lng: bus.longitude };
            const bearing = Number(bus.bearing) ?? 0;
            const routeId = bus.route_id || 'N/A';
            const routeShortName = routeId.includes('_') ? routeId.split('_').pop() : routeId;
            const speedDisplay = bus.speed || 'N/A';
            const timeDisplay = formatTimestamp(bus.raw_timestamp);

            let arrowStrokeColor = 'red';
            if (assignedRouteColors[routeId]) {
                arrowStrokeColor = assignedRouteColors[routeId];
            } else if (routeId !== 'N/A') {
                let hash = 0;
                for (let i = 0; i < routeId.length; i++) { hash = routeId.charCodeAt(i) + ((hash << 5) - hash); hash = hash & hash;}
                arrowStrokeColor = ROUTE_COLORS[Math.abs(hash) % ROUTE_COLORS.length];
                assignedRouteColors[routeId] = arrowStrokeColor;
            }

            const currentInfoContent = `
                <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4;">
                    <strong>Route:</strong> <span style="color:${arrowStrokeColor}; font-weight:bold;">${routeId}</span><br>
                    <strong>Vehicle:</strong> ${vehicleId}<br><strong>Speed:</strong> ${speedDisplay}<br>
                    <strong>Last Update:</strong> ${timeDisplay}<br>
                    <strong>Coords:</strong> ${bus.latitude.toFixed(5)}, ${bus.longitude.toFixed(5)}
                </div>`;
            
            const iconSize = 50; const circleRadius = 12; const center = iconSize / 2;
            const pointerHeight = 12; const pointerWidth = 15;
            const fontSize = routeShortName.length > 2 ? 8 : 10;
            const arrowOffset = 10;

            const svgContent = `
                <svg version="1.1" width="${iconSize}" height="${iconSize}" xmlns="http://www.w3.org/2000/svg">0
                    <g transform="rotate(${bearing}, 25, 25)">
                        <polygon points="
                            ${iconSize *.5} ,${iconSize * .2} 
                            ${iconSize *.7} ,${iconSize * .3} 
                            ${iconSize *.65},${iconSize * .7} 
                            ${iconSize *.35},${iconSize * .7} 
                            ${iconSize *.3} ,${iconSize * .3} 
                            " fill="${arrowStrokeColor}" stroke="black" stroke-width="1.5"/>
                        <circle cx="${iconSize / 2}" cy="${iconSize * .5}" r="${iconSize *.15}" fill="black" dominant-baseline="central"/>
                        <text x="${iconSize / 2}" y="${iconSize / 2}" font-size="${fontSize}" 
                                text-anchor="middle" dominant-baseline="central" 
                                fill="white" font-family="Arial, sans-serif"
                                transform="rotate(${-bearing}, 25, 25)">${routeShortName}</text>
                    </g>
                </svg>`

            if (busMarkerObjects[vehicleId]) {
                const md = busMarkerObjects[vehicleId];
                md.gmapMarker.title = `Route: ${routeId}\nVehicle: ${vehicleId}\nSpeed: ${speedDisplay}\nTime: ${timeDisplay}`;
                if (md.infowindow) md.infowindow.setContent(currentInfoContent);
                if (md.gmapMarker.content instanceof HTMLElement) md.gmapMarker.content.innerHTML = svgContent;
                else { const el = document.createElement('div'); el.innerHTML = svgContent; el.style.cursor = 'pointer'; md.gmapMarker.content = el; }
                
                const cp = md.gmapMarker.position;
                if (cp && (Math.abs((cp.lat || 0) - newPosition.lat) > 1e-6 || Math.abs((cp.lng || 0) - newPosition.lng) > 1e-6)) {
                    if (!md.isAnimating || md.targetPos?.lat !== newPosition.lat || md.targetPos?.lng !== newPosition.lng) {
                        md.startPos = md.gmapMarker.position; md.targetPos = newPosition;
                        md.startTime = performance.now(); md.isAnimating = true;
                    }
                } else if (!md.isAnimating) { md.gmapMarker.position = newPosition; md.startPos = null; }
            } else {
                const el = document.createElement('div'); el.innerHTML = svgContent; el.style.cursor = 'pointer';
                const gm = new google.maps.marker.AdvancedMarkerElement({ map, position: newPosition, content: el, title: `R: ${routeId} V: ${vehicleId}`, zIndex: 100 });
                const iw = new google.maps.InfoWindow({ content: currentInfoContent, ariaLabel: `Bus ${vehicleId}` });
                gm.addListener("click", () => iw.open({ anchor: gm, map }));
                busMarkerObjects[vehicleId] = { gmapMarker: gm, infowindow: iw, isAnimating: false, startPos: null, targetPos: newPosition, startTime: 0 };
            }
        });

        for (const vid in busMarkerObjects) {
            if (!updatedVehicleIds.has(vid)) {
                if (busMarkerObjects[vid].gmapMarker) busMarkerObjects[vid].gmapMarker.map = null;
                delete busMarkerObjects[vid];
            }
        }
        startAnimationLoop();
    } catch (error) { console.error("fetchAndUpdateMarkers: General error:", error); }
    // console.log("fetchAndUpdateMarkers: FINISHED.");
}

function animateMarkers(timestamp) {
    let stillAnimating = false;
    for (const vehicleId in busMarkerObjects) {
        if (!busMarkerObjects.hasOwnProperty(vehicleId)) continue;
        const md = busMarkerObjects[vehicleId];
        if (md.isAnimating) {
            const elapsedTime = timestamp - md.startTime;
            const fraction = animationDuration > 0 ? Math.min(1, elapsedTime / animationDuration) : 1;
            if (md.startPos && md.targetPos) {
                const lat = md.startPos.lat + (md.targetPos.lat - md.startPos.lat) * fraction;
                const lng = md.startPos.lng + (md.targetPos.lng - md.startPos.lng) * fraction;
                md.gmapMarker.position = { lat, lng };
            } else { md.isAnimating = false; }
            if (fraction < 1) stillAnimating = true;
            else { md.isAnimating = false; if (md.targetPos) md.gmapMarker.position = md.targetPos; md.startPos = null; }
        }
    }
    if (stillAnimating) animationFrameId = requestAnimationFrame(animateMarkers);
    else animationFrameId = null;
}

function startAnimationLoop() {
    if (animationFrameId === null) {
         let needsAnimation = false;
         for (const vid in busMarkerObjects) { if (busMarkerObjects[vid].isAnimating) { needsAnimation = true; break; }}
         if (needsAnimation) animationFrameId = requestAnimationFrame(animateMarkers);
    }
}

function formatTimestamp(unixTimestamp) {
    if (unixTimestamp === null || typeof unixTimestamp === 'undefined') return 'No TS';
    try {
        const tsMs = Number(unixTimestamp) * 1000;
        if (isNaN(tsMs)) return 'Inv TS Data';
        const date = new Date(tsMs);
        if (isNaN(date.getTime())) return 'Inv Date';
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) { console.error("formatTimestamp Error:", unixTimestamp, e); return 'TS Fmt Err'; }
}

console.log("map_logic.js script FINISHED PARSING.");