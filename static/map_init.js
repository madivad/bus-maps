// static/map_init.js
console.log("map_init.js: PARSING.");

import * as G from './map_globals.js'; // G for Globals
import { loadStateFromLocalStorage, openOperatorsModal, openRoutesModal, openOptionsModal, handleSaveOperators, handleSaveRoutes, handleSaveOptions, filterAvailableRoutes } from './map_state_modals.js';
// Import specific functions needed from map_data_layer
import { updateMapData, fetchAndUpdateMarkers, startAnimationLoop, populateSidebar, handleRouteInteraction, clearRouteHighlight } from './map_data_layer.js';

// --- Constants ---
const animationDuration = 1500; // Moved from map_logic.js global scope (and now map_globals)


// Function to dynamically load the Google Maps script
async function loadGoogleMapsScript() {
    console.log("loadGoogleMapsScript: STARTED.");
    try {
        const response = await fetch('/api/maps_config');
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Failed to fetch Maps API config: ${response.status} ${errorData.error || ''}`);
        }
        const config = await response.json();
        const apiKey = config.google_maps_api_key;

        if (!apiKey) {
            throw new Error("Google Maps API key not received from server.");
        }

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initMap&v=beta&libraries=marker&loading=async`;
            script.async = true;
            script.defer = true;
            script.onload = () => {
                console.log("Google Maps script loaded successfully.");
                resolve();
            };
            script.onerror = () => {
                console.error("Error loading Google Maps script.");
                const mapDiv = document.getElementById('map');
                 if (mapDiv) {
                      mapDiv.textContent = 'Error loading Google Maps. Please check your API key, network connection, and server logs.';
                 }
                reject(new Error("Google Maps script could not be loaded."));
            };
            document.head.appendChild(script);
        });
    } catch (error) {
        console.error("Error in loadGoogleMapsScript:", error);
        const mapDiv = document.getElementById('map');
        if (mapDiv) {
             mapDiv.textContent = `Error initializing map: ${error.message}. Please check server logs and configuration.`;
        }
         // Ensure map variable is explicitly set to null or undefined if creation fails
         G.setMap(null); // Prevent trying to use a non-existent map
         // Continue execution to initialize DOM and listeners, but map operations will fail gracefully.
    }
}

async function initMapGoogleCallback() {
    console.log(">>> initMapGoogleCallback: STARTED by Google Maps API!");
    try {
        const initialCenter = { lat: -33.51, lng: 151.32 }; // Central Coast, NSW approx.
        G.setMap(new google.maps.Map(document.getElementById("map"), {
            zoom: 14,
            center: initialCenter,
            mapId: "BUS_MAP_REALTIME" // Example Map ID
        }));
        console.log(">>> initMapGoogleCallback: Google Maps object CREATED and stored in G.map.");
    } catch (mapError) {
        console.error(">>> initMapGoogleCallback: ERROR Creating Google Maps object:", mapError);
        document.getElementById('map').textContent = 'Failed to create Google Map object. See console for details.';
        G.setMap(null); // Ensure G.map is null on error
        // Continue initialization of DOM elements and listeners even if map creation failed
    }

    // Initialize DOM elements and event listeners
    initializeDOMElements();
    addEventListeners();

    // Load application state from local storage
    loadStateFromLocalStorage(); // This populates G.selectedOperatorIds, G.selectedRealtimeRouteIds, G.visibleRealtimeRouteIds etc.


    console.log(">>> initMapGoogleCallback: Initial G.selectedOperatorIds size:", G.selectedOperatorIds.size);
    console.log(">>> initMapGoogleCallback: Initial G.selectedRealtimeRouteIds size:", G.selectedRealtimeRouteIds.size);
     console.log(">>> initMapGoogleCallback: Initial G.visibleRealtimeRouteIds size:", G.visibleRealtimeRouteIds.size);


    // Enable the Routes button if operators are already selected
     if (G.btnRoutes) { // Check if element exists
        G.btnRoutes.disabled = G.selectedOperatorIds.size === 0;
     } else {
        console.error(">>> initMapGoogleCallback: G.btnRoutes is null!");
     }


    // Initial map setup based on loaded state.
    // updateMapData handles clearing, populating sidebar, fetching shapes/markers based on visibility.
    // It also handles the data fetch interval.
     if (G.map) { // Only proceed if map object was successfully created
        console.log(">>> initMapGoogleCallback: Map object exists. Calling updateMapData for initial load.");
        await updateMapData(); // From map_data_layer.js

        // Add global map click listener to close infowindow and clear highlight
        G.map.addListener('click', (e) => {
            // console.log("Map base clicked.");
            if (G.currentlyOpenInfoWindow) {
                // console.log("Closing currently open infowindow on map click.");
                G.currentlyOpenInfoWindow.close();
                G.setCurrentlyOpenInfoWindow(null);
            }
            if (G.currentlyHighlightedRouteId) {
                 // console.log("Clearing route highlight on map click.");
                 clearRouteHighlight(); // From map_data_layer.js
            }
        });

         // Start the animation loop (it checks if animation is actually needed internally)
         startAnimationLoop(); // From map_data_layer.js

     } else {
         console.log(">>> initMapGoogleCallback: Map object NOT created. Skipping map data initialization.");
         // Update title even if map failed
         if (G.mapTitleH3) G.mapTitleH3.textContent = 'Map failed to load';
     }


    // Initialize and start the countdown timer regardless of map success
    if (G.timerDisplayElement) {
        updateTimerDisplay();
        startOneSecondCountdown(); // This timer is just for the display, main data fetch is interval/early fetch
    } else {
        console.error("Timer display element 'small-timer' not found!");
    }

    // The main data refresh interval is now managed within updateMapData based on live tracking option.
    // We only need the 1-second countdown interval running constantly to update the display.
    // The interval logic within updateMapData will call fetchAndUpdateMarkers.

    console.log(">>> initMapGoogleCallback: FINISHED.");
}
// Assign the callback to the window object so Google Maps API can find it
window.initMap = initMapGoogleCallback;


function initializeDOMElements() {
    console.log("initializeDOMElements: STARTED.");
    G.setBtnOperators(document.getElementById('btn-operators'));
    G.setBtnRoutes(document.getElementById('btn-routes'));
    G.setBtnOptions(document.getElementById('btn-options'));

    G.setOperatorsModal(document.getElementById('operators-modal'));
    G.setRoutesModal(document.getElementById('routes-modal'));
    G.setOptionsModal(document.getElementById('options-modal'));

    G.setCloseOperatorsModalBtn(document.getElementById('close-operators-modal'));
    G.setCloseRoutesModalBtn(document.getElementById('close-routes-modal'));
    G.setCloseOptionsModalBtn(document.getElementById('close-options-modal'));

    G.setOperatorsListDiv(document.getElementById('operators-list'));
    G.setSaveOperatorsBtn(document.getElementById('save-operators'));

    G.setSelectedRoutesListDiv(document.getElementById('selected-routes-list'));
    G.setAvailableRoutesListDiv(document.getElementById('available-routes-list'));
    G.setSaveRoutesBtn(document.getElementById('save-routes'));
    G.setRouteSearchInput(document.getElementById('route-search-input'));

    G.setMapTitleH3(document.getElementById('map-title'));
    G.setTimerDisplayElement(document.getElementById('small-timer')); // Initialize timer element reference

    G.setUpdateFrequencySelect(document.getElementById('update-frequency'));
    G.setToggleLiveTrackingCheckbox(document.getElementById('toggle-live-tracking'));
    G.setToggleRoutePathsCheckbox(document.getElementById('toggle-route-paths'));
    G.setSaveOptionsBtn(document.getElementById('save-options'));

    G.setSidebarDiv(document.getElementById('route-sidebar')); // NEW: Sidebar div
    G.setSidebarRoutesListDiv(document.getElementById('sidebar-routes-list')); // NEW: Sidebar list div


    // Ensure initial state of options controls matches loaded options
    if (G.updateFrequencySelect) G.updateFrequencySelect.value = G.currentMapOptions.updateIntervalMs.toString();
    if (G.toggleLiveTrackingCheckbox) G.toggleLiveTrackingCheckbox.checked = G.currentMapOptions.liveTrackingEnabled;
    if (G.toggleRoutePathsCheckbox) G.toggleRoutePathsCheckbox.checked = G.currentMapOptions.showRoutePathsEnabled;


    console.log("initializeDOMElements: FINISHED. DOM elements stored in G.");
}

function addEventListeners() {
    console.log("addEventListeners: STARTED.");
    // Button listeners (check if elements exist before adding listeners)
    if (G.btnOperators) G.btnOperators.addEventListener('click', openOperatorsModal); // from map_state_modals
    if (G.btnRoutes) G.btnRoutes.addEventListener('click', openRoutesModal);     // from map_state_modals
    if (G.btnOptions) G.btnOptions.addEventListener('click', openOptionsModal);   // from map_state_modals

    // Modal close button listeners
    if (G.closeOperatorsModalBtn) G.closeOperatorsModalBtn.addEventListener('click', () => { if(G.operatorsModal) G.operatorsModal.style.display = "none"; });
    if (G.closeRoutesModalBtn) G.closeRoutesModalBtn.addEventListener('click', () => { if(G.routesModal) G.routesModal.style.display = "none"; });
    if (G.closeOptionsModalBtn) G.closeOptionsModalBtn.addEventListener('click', () => { if(G.optionsModal) G.optionsModal.style.display = "none"; });

    // Modal save button listeners
    if (G.saveOperatorsBtn) G.saveOperatorsBtn.addEventListener('click', handleSaveOperators); // from map_state_modals
    if (G.saveRoutesBtn) G.saveRoutesBtn.addEventListener('click', handleSaveRoutes);       // from map_state_modals
    if (G.saveOptionsBtn) G.saveOptionsBtn.addEventListener('click', handleSaveOptions);     // from map_state_modals

    // Route search input listener
    if (G.routeSearchInput) G.routeSearchInput.addEventListener('input', filterAvailableRoutes); // from map_state_modals

    // Window click listener to close modals when clicking outside
    window.addEventListener('click', (event) => {
        if (G.operatorsModal && event.target === G.operatorsModal) G.operatorsModal.style.display = "none";
        if (G.routesModal && event.target === G.routesModal) G.routesModal.style.display = "none";
        if (G.optionsModal && event.target === G.optionsModal) G.optionsModal.style.display = "none";
    });
    console.log("addEventListeners: FINISHED.");
}

// --- Countdown Timer Functions ---
// Moved from map_globals.js to map_init.js as they are part of the init/UI loop
function updateTimerDisplay() {
    if (G.timerDisplayElement) {
        G.timerDisplayElement.textContent = `${G.countdownValue}`;
    } else {
         console.error("updateTimerDisplay: G.timerDisplayElement is null!");
    }
}

function startOneSecondCountdown() {
    console.log("startOneSecondCountdown: STARTED.");
    if (G.countdownIntervalId) {
        clearInterval(G.countdownIntervalId);
        G.setCountdownIntervalId(null); // Clear any existing interval
        console.log("startOneSecondCountdown: Cleared existing countdown interval.");
    }
    // Reset countdown value initially
    G.setCountdownValue(G.JS_DATA_REFRESH_INTERVAL_SECONDS);
    updateTimerDisplay(); // Update display immediately

    // Start the new countdown interval
    const newIntervalId = setInterval(async () => {
        G.setCountdownValue(G.countdownValue - 1);
        updateTimerDisplay();

        // Check for early fetch trigger conditions
        if (G.countdownValue <= G.FETCH_API_AT_COUNT && !G.isFetchingApiData && G.currentMapOptions.liveTrackingEnabled && G.selectedRealtimeRouteIds.size > 0) {
            console.log(`Countdown reached ${G.countdownValue}s. Fetching data early...`);
            G.setIsFetchingApiData(true);
            const routesParam = Array.from(G.selectedRealtimeRouteIds).join(',');
            // Fetch markers (this function also triggers animation start if needed)
            fetchAndUpdateMarkers(routesParam).finally(() => { // from map_data_layer.js
                G.setIsFetchingApiData(false);
                console.log("Early data fetch complete.");
                // Reset countdown after a successful or failed fetch attempt that was triggered early
                 resetCountdown();
            });
        }

         // Reset countdown if it hits zero and an early fetch wasn't triggered (or happened)
        if (G.countdownValue <= 0) {
            if (!G.isFetchingApiData) { // Only reset if no early fetch is pending/in progress
                 console.log("Countdown reached 0s. Resetting countdown.");
                 resetCountdown();
            } else {
                 console.log("Countdown reached 0s, but early fetch is ongoing. Will reset after fetch.");
                 // The .finally() block above handles reset after an early fetch.
            }
        }

    }, 1000); // 1000 milliseconds = 1 second
    G.setCountdownIntervalId(newIntervalId);
    console.log(`startOneSecondCountdown: New countdown interval started with ID ${newIntervalId}.`);
}

function resetCountdown() {
     console.log("resetCountdown: Resetting countdown value to", G.JS_DATA_REFRESH_INTERVAL_SECONDS);
    G.setCountdownValue(G.JS_DATA_REFRESH_INTERVAL_SECONDS);
    updateTimerDisplay();
     // Note: The main data fetch interval is managed by updateMapData based on the options.
     // This 1-second interval is just for updating the countdown display and triggering early fetches.
}


// --- Start the process by loading Google Maps ---
loadGoogleMapsScript().then(() => {
    console.log("Google Maps script loading initiated. Callback 'initMapGoogleCallback' will be invoked by Google.");
    // initMapGoogleCallback is assigned to window.initMap and called by the Google Maps API script
}).catch(error => {
    console.error("Failed to initiate Google Maps script loading:", error);
    // Error message is already displayed on the map div by loadGoogleMapsScript
    // No further action needed here, the application won't proceed with map initialization.
});

console.log("map_init.js: FINISHED PARSING.");