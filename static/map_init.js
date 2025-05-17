// static/map_init.js
console.log("map_init.js: PARSING.");

import * as G from './map_globals.js'; // G for Globals
import { loadStateFromLocalStorage, openOperatorsModal, openRoutesModal, openOptionsModal, handleSaveOperators, handleSaveRoutes, handleSaveOptions, filterAvailableRoutes } from './map_state_modals.js';
import { updateMapData, fetchAndUpdateMarkers } from './map_data_layer.js';

// --- Constants ---
const animationDuration = 1500; // Moved from map_logic.js global scope

// Function to dynamically load the Google Maps script
async function loadGoogleMapsScript() {
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
                document.getElementById('map').textContent = 'Error loading Google Maps. Please check your API key and network connection.';
                reject(new Error("Google Maps script could not be loaded."));
            };
            document.head.appendChild(script);
        });
    } catch (error) {
        console.error("Error in loadGoogleMapsScript:", error);
        document.getElementById('map').textContent = `Error initializing map: ${error.message}. Please check server logs and configuration.`;
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
        return;
    }

    // Initialize DOM elements and event listeners
    initializeDOMElements();
    addEventListeners();

    // Load application state
    loadStateFromLocalStorage(); // This will populate G.selectedOperatorIds etc. from map_state_modals.js

    console.log(">>> initMapGoogleCallback: Initial G.selectedOperatorIds size:", G.selectedOperatorIds.size);
    console.log(">>> initMapGoogleCallback: Initial G.selectedRealtimeRouteIds size:", G.selectedRealtimeRouteIds.size);

    // Initial map setup based on loaded state
    if (G.selectedOperatorIds.size > 0) {
        if (G.btnRoutes) G.btnRoutes.disabled = false;
        else console.error(">>> initMapGoogleCallback: G.btnRoutes is null!");

        if (G.selectedRealtimeRouteIds.size > 0) {
            console.log(">>> initMapGoogleCallback: Operators and routes selected, calling updateMapData.");
            await updateMapData(); // From map_data_layer.js
        } else {
            console.log(">>> initMapGoogleCallback: Operators loaded, but no routes selected.");
            // updateMapTitle(); // updateMapTitle is in map_data_layer, called by updateMapData
            if (G.mapTitleH3) G.mapTitleH3.textContent = 'No routes selected'; // Direct update if no updateMapData call
            if (!G.currentMapOptions.liveTrackingEnabled && G.dataFetchIntervalId) {
                clearInterval(G.dataFetchIntervalId);
                G.setDataFetchIntervalId(null);
            }
        }
    } else {
        console.log(">>> initMapGoogleCallback: No operators selected on initial load.");
        // updateMapTitle();
        if (G.mapTitleH3) G.mapTitleH3.textContent = 'No operator selected';
        if (G.dataFetchIntervalId) {
            clearInterval(G.dataFetchIntervalId);
            G.setDataFetchIntervalId(null);
        }
    }

    // Initialize and start the countdown timer
    if (G.timerDisplayElement) {
        updateTimerDisplay();
        startOneSecondCountdown();
    } else {
        console.error("Timer display element 'small-timer' not found!");
    }

    // If routes are already selected, fetch shapes. updateMapData will handle this if live path enabled.
    // For robustness, ensure shapes are attempted if paths are on and routes exist.
    if (G.currentMapOptions.showRoutePathsEnabled && G.selectedRealtimeRouteIds.size > 0) {
       // await fetchAndDrawRouteShapes(Array.from(G.selectedRealtimeRouteIds).join(',')); // from map_data_layer
       // updateMapData already calls fetchAndDrawRouteShapes if paths are enabled.
    }
    
    // Initial fetch of bus markers if tracking is on
    if (G.currentMapOptions.liveTrackingEnabled && G.selectedRealtimeRouteIds.size > 0) {
        G.setIsFetchingApiData(true);
        await fetchAndUpdateMarkers(Array.from(G.selectedRealtimeRouteIds).join(',')).finally(() => { // from map_data_layer
            G.setIsFetchingApiData(false);
        });
    }
    
    if (G.map) {
        G.map.addListener('click', (e) => {
            console.log("Map base clicked."); 
            if (G.currentlyOpenInfoWindow) {
                G.currentlyOpenInfoWindow.close();
                G.setCurrentlyOpenInfoWindow(null);
            }
        });
    }

    startAnimationLoop();

    // Set up the main data refresh interval based on JS_DATA_REFRESH_INTERVAL_SECONDS
    // This interval just resets the countdown. The actual fetch happens due to countdown.
    setInterval(() => {
        resetCountdown();
    }, G.JS_DATA_REFRESH_INTERVAL_SECONDS * 1000);

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
    G.setUpdateFrequencySelect(document.getElementById('update-frequency'));
    G.setToggleLiveTrackingCheckbox(document.getElementById('toggle-live-tracking'));
    G.setToggleRoutePathsCheckbox(document.getElementById('toggle-route-paths'));
    G.setSaveOptionsBtn(document.getElementById('save-options'));
    G.setTimerDisplayElement(document.getElementById('small-timer'));
    console.log("initializeDOMElements: FINISHED. DOM elements stored in G.");
}

function addEventListeners() {
    console.log("addEventListeners: STARTED.");
    if (G.btnOperators) G.btnOperators.addEventListener('click', openOperatorsModal); // from map_state_modals
    if (G.btnRoutes) G.btnRoutes.addEventListener('click', openRoutesModal);     // from map_state_modals
    if (G.btnOptions) G.btnOptions.addEventListener('click', openOptionsModal);   // from map_state_modals

    if (G.closeOperatorsModalBtn) G.closeOperatorsModalBtn.addEventListener('click', () => { G.operatorsModal.style.display = "none"; });
    if (G.closeRoutesModalBtn) G.closeRoutesModalBtn.addEventListener('click', () => { G.routesModal.style.display = "none"; });
    if (G.closeOptionsModalBtn) G.closeOptionsModalBtn.addEventListener('click', () => { G.optionsModal.style.display = "none"; });

    if (G.saveOperatorsBtn) G.saveOperatorsBtn.addEventListener('click', handleSaveOperators); // from map_state_modals
    if (G.saveRoutesBtn) G.saveRoutesBtn.addEventListener('click', handleSaveRoutes);       // from map_state_modals
    if (G.saveOptionsBtn) G.saveOptionsBtn.addEventListener('click', handleSaveOptions);     // from map_state_modals
    
    if (G.routeSearchInput) G.routeSearchInput.addEventListener('input', filterAvailableRoutes); // from map_state_modals

    window.addEventListener('click', (event) => {
        if (G.operatorsModal && event.target === G.operatorsModal) G.operatorsModal.style.display = "none";
        if (G.routesModal && event.target === G.routesModal) G.routesModal.style.display = "none";
        if (G.optionsModal && event.target === G.optionsModal) G.optionsModal.style.display = "none";
    });
    console.log("addEventListeners: FINISHED.");
}

// --- Countdown Timer Functions ---
function updateTimerDisplay() {
    if (G.timerDisplayElement) {
        G.timerDisplayElement.textContent = `${G.countdownValue}`;
    }
}

function startOneSecondCountdown() {
    if (G.countdownIntervalId) {
        clearInterval(G.countdownIntervalId);
    }
    G.setCountdownIntervalId(setInterval(async () => {
        G.setCountdownValue(G.countdownValue - 1);
        updateTimerDisplay();

        if (G.countdownValue === G.FETCH_API_AT_COUNT && !G.isFetchingApiData && G.currentMapOptions.liveTrackingEnabled && G.selectedRealtimeRouteIds.size > 0) {
            console.log(`Countdown reached ${G.FETCH_API_AT_COUNT}s. Fetching data early...`);
            G.setIsFetchingApiData(true);
            const routesParam = Array.from(G.selectedRealtimeRouteIds).join(',');
            fetchAndUpdateMarkers(routesParam).finally(() => { // from map_data_layer.js
                G.setIsFetchingApiData(false);
                console.log("Early data fetch complete.");
            });
        }
    }, 1000));
}

function resetCountdown() {
    G.setCountdownValue(G.JS_DATA_REFRESH_INTERVAL_SECONDS);
    updateTimerDisplay();
}

// --- Marker Animation ---
function animateMarkers(timestamp) {
    // console.log(`animateMarkers: ENTERED. Timestamp: ${timestamp.toFixed(2)}`); // Keep this minimal for now
    let anyMarkerIsStillAnimatingThisFrame = false; // Flag for this specific frame
    const animationDuration = G.currentMapOptions.updateIntervalMs * G.ANIMATION_DURATION_FACTOR;

    for (const vehicleId in G.busMarkerObjects) {
        if (!G.busMarkerObjects.hasOwnProperty(vehicleId)) continue;
        const md = G.busMarkerObjects[vehicleId];

        if (md.isAnimating) { // Only consider markers that are *supposed* to be animating
            const elapsedTime = timestamp - md.startTime;
            let fraction = (animationDuration > 0) ? (elapsedTime / animationDuration) : 1.0;
            fraction = Math.max(0, Math.min(1, fraction)); // Clamp fraction

            // Optional detailed log for debugging a specific troublesome marker if needed:
            // if (vehicleId === " проблемный_id_маркера ") {
            //    console.log(`  Veh ${vehicleId}: elapsed=${elapsedTime.toFixed(0)}, fraction=${fraction.toFixed(3)}, startT=${md.startTime.toFixed(0)}`);
            // }

            if (md.startPos && md.targetPos) {
                const lat = md.startPos.lat + (md.targetPos.lat - md.startPos.lat) * fraction;
                const lng = md.startPos.lng + (md.targetPos.lng - md.startPos.lng) * fraction;
                
                if (md.gmapMarker && typeof md.gmapMarker.position === 'object') { 
                    md.gmapMarker.position = { lat, lng }; 
                }
            } else {
                // This marker was told to animate but lacks start/target. Stop its animation.
                // console.warn(`  animateMarkers: Vehicle ${vehicleId} isAnimating but missing startPos or targetPos. Halting its animation.`);
                md.isAnimating = false;
            }

            // Update md.isAnimating status for the *next* frame check
            if (fraction < 1.0) {
                anyMarkerIsStillAnimatingThisFrame = true; // If this marker isn't done, the overall loop needs to continue
            } else {
                md.isAnimating = false; // This marker has completed its current segment
                // console.log(`  animateMarkers: Vehicle ${vehicleId} finished segment. isAnimating = false.`);
                // Position is already snapped by fraction being 1.0
            }
        }
    } // End of for...in loop over busMarkerObjects

    // Decision to continue the animation loop
    if (anyMarkerIsStillAnimatingThisFrame) {
        G.setAnimationFrameId(requestAnimationFrame(animateMarkers));
    } else {
        G.setAnimationFrameId(null); // CRITICAL: Stop the loop if no markers were animating in this frame
        console.log("animateMarkers: Loop stopped (ALL active animations for this cycle completed OR no markers were animating). G.animationFrameId set to null.");
    }
}

export function startAnimationLoop() {
    console.log("startAnimationLoop: CALLED. G.animationFrameId is:", G.animationFrameId);
    if (G.animationFrameId === null) {
        console.log("startAnimationLoop: G.animationFrameId is null, checking if animation is needed.");
        let needsAnimation = false;
        for (const vid in G.busMarkerObjects) {
            // Check hasOwnProperty on the object itself, not the key
            if (G.busMarkerObjects.hasOwnProperty(vid) && G.busMarkerObjects[vid].isAnimating) {
                // console.log(`startAnimationLoop: Vehicle ${vid} IS animating. Setting needsAnimation = true.`);
                needsAnimation = true;
                break;
            }
        }
        if (needsAnimation) {
            console.log("startAnimationLoop: Animation NEEDED, calling requestAnimationFrame(animateMarkers)."); // Corrected log
            G.setAnimationFrameId(requestAnimationFrame(animateMarkers));
        } else {
            console.log("startAnimationLoop: No animation needed currently (no vehicles have isAnimating=true or G.busMarkerObjects is empty).");
        }
    } else {
        console.log("startAnimationLoop: G.animationFrameId is NOT null, loop presumed running.");
    }
}


// --- Utility Functions ---
export function formatTimestamp(unixTimestamp) { // Export if needed
    if (unixTimestamp === null || typeof unixTimestamp === 'undefined') return 'No TS';
    try {
        const tsMs = Number(unixTimestamp) * 1000;
        if (isNaN(tsMs)) return 'Inv TS Data';
        const date = new Date(tsMs);
        if (isNaN(date.getTime())) return 'Inv Date'; // Check if date is valid
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) {
        console.error("formatTimestamp Error:", unixTimestamp, e);
        return 'TS Fmt Err';
    }
}


// --- Start the process by loading Google Maps ---
loadGoogleMapsScript().then(() => {
    console.log("Google Maps script loading initiated. Callback 'initMapGoogleCallback' will be invoked by Google.");
}).catch(error => {
    console.error("Failed to initiate Google Maps script loading:", error);
    // Display a user-friendly message on the page if #map exists
    const mapDiv = document.getElementById('map');
    if (mapDiv) {
        mapDiv.innerHTML = `<p style="padding: 20px; text-align: center; color: red;">Could not load Google Maps. ${error.message}</p>`;
    }
});

console.log("map_init.js: FINISHED PARSING.");