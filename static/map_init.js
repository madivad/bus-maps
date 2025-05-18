// static/map_init.js
console.log("map_init.js: PARSING.");

import * as G from './map_globals.js'; // G for Globals
import { loadStateFromLocalStorage, 
         saveStateToLocalStorage,
         openOperatorsModal, 
         openRoutesModal, 
         openOptionsModal, 
         handleSaveOperators, 
         handleSaveRoutes, 
         handleSaveOptions, 
         filterAvailableRoutes } from './map_state_modals.js';
import { updateMapData, fetchAndUpdateMarkers, populateSidebar, handleRouteInteraction, clearRouteHighlight } from './map_data_layer.js';

function positionSidebarToggleButton() {
    if (!G.map || !G.sidebarToggleBtn) return false; // Return a status

    const mapDiv = G.map.getDiv();
    const fullscreenButton = mapDiv.querySelector('button.gm-fullscreen-control');

    const fsButtonRect = fullscreenButton.getBoundingClientRect(); // Dimensions and position of the Google Maps fullscreen button RELATIVE TO THE VIEWPORT

    G.sidebarToggleBtn.style.top = (fullscreenButton ? '105px' : '45px'); // Let CSS handle 'right'
    G.sidebarToggleBtn.style.right = (G.isSidebarVisible ? '260px' : '10px');   // Let CSS handle 'top'
    G.sidebarToggleBtn.style.position = 'absolute';
    console.log("FS: " + fullscreenButton.top);
}

export function applySidebarVisibilityState() {
    if (!G.sidebarDiv || !G.sidebarToggleBtn) return;

    const wasPositionedAbsolutely = positionSidebarToggleButton(); // Try to position it

    // The rest of the logic handles visibility classes and icon changes
    if (G.isSidebarVisible) {
        G.sidebarDiv.classList.remove('sidebar-hidden');
        document.body.classList.add('sidebar-is-visible'); // This class now primarily controls fixed pos via CSS
        G.sidebarToggleBtn.title = "Hide Sidebar";
        if (G.selectedRealtimeRouteIds.size > 0) { // Only populate if routes are selected
            populateSidebar(); // Ensure content is there when shown
        } else {
            if(G.sidebarRoutesListDiv) G.sidebarRoutesListDiv.textContent = 'No routes selected.';
        }
    } else {
        G.sidebarDiv.classList.add('sidebar-hidden');
        document.body.classList.remove('sidebar-is-visible'); // This class now primarily controls fixed pos via CSS
        G.sidebarToggleBtn.title = "Show Sidebar";
        if (G.sidebarToggleBtn.querySelector('.chevron-icon')) {
            G.sidebarToggleBtn.querySelector('.chevron-icon').innerHTML = '<'; // Or your SVG logic
        }
    }
    
    // Trigger map resize
    if (G.map && google && google.maps && google.maps.event) {
        google.maps.event.trigger(G.map, 'resize');
    }
}

export function toggleSidebarVisibilityUI() {
    G.setIsSidebarVisible(!G.isSidebarVisible);
    applySidebarVisibilityState(); // This will re-evaluate positioning
    saveStateToLocalStorage();
}

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
         G.setMap(null);
    }
}

async function initMapGoogleCallback() {
    console.log(">>> initMapGoogleCallback: STARTED by Google Maps API!");
    try {
        const initialCenter = { lat: -33.51, lng: 151.32 };
        G.setMap(new google.maps.Map(document.getElementById("map"), {
            zoom: 14,
            center: initialCenter,
            mapId: "BUS_MAP_REALTIME",
            fullscreenControl: true, // Ensure fullscreen control is enabled
            mapTypeControl: false,   // Example: disable map type
            streetViewControl: false // Example: disable street view
            // Add other map options as needed
        }));
        console.log(">>> initMapGoogleCallback: Google Maps object CREATED and stored in G.map.");
    } catch (mapError) {
        console.error(">>> initMapGoogleCallback: ERROR Creating Google Maps object:", mapError);
        document.getElementById('map').textContent = 'Failed to create Google Map object. See console for details.';
        G.setMap(null); // Ensure G.map is null on error
    }

    initializeDOMElements();
    addEventListeners();
    
    // Load state from localStorage (this will set G.isSidebarVisible, G.selectedOperatorIds etc.)
    await loadStateFromLocalStorage();

    // applySidebarVisibilityState();

    console.log(">>> initMapGoogleCallback: Initial G.selectedOperatorIds size:", G.selectedOperatorIds.size);
    console.log(">>> initMapGoogleCallback: Initial G.selectedRealtimeRouteIds size:", G.selectedRealtimeRouteIds.size);
    console.log(">>> initMapGoogleCallback: Initial G.visibleRealtimeRouteIds size:", G.visibleRealtimeRouteIds.size);
    console.log(">>> initMapGoogleCallback: Initial G.isSidebarVisible state:", G.isSidebarVisible);


     if (G.btnRoutes) {
        G.btnRoutes.disabled = G.selectedOperatorIds.size === 0;
     } else {
        console.error(">>> initMapGoogleCallback: G.btnRoutes is null!");
     }

    if (G.map) { // Only proceed with map-dependent operations if map was created
        console.log(">>> initMapGoogleCallback: Map object exists. Initializing map data and UI states.");

        // Add a listener for when the map is idle (tiles loaded, controls likely rendered)
        google.maps.event.addListenerOnce(G.map, 'idle', async () => {
            console.log(">>> initMapGoogleCallback: Map is idle. Applying initial sidebar state and toggle position.");
            // This is the best time to position relative to GMaps controls and apply initial visibility
            applySidebarVisibilityState(); 
            
            console.log(">>> initMapGoogleCallback: Map idle. Calling updateMapData for initial data load.");
            await updateMapData(); // This will populate sidebar, draw paths/markers based on loaded state
        });

        // General map click listener
        G.map.addListener('click', (e) => {
            if (G.currentlyOpenInfoWindow) {
                G.currentlyOpenInfoWindow.close();
                G.setCurrentlyOpenInfoWindow(null);
            }
            if (G.currentlyHighlightedRouteId) {
                 clearRouteHighlight();
            }
        });

        startAnimationLoop(); // Start animation loop if needed
     } else {
         console.log(">>> initMapGoogleCallback: Map object NOT created. Skipping map data initialization and sidebar positioning.");
         if (G.mapTitleH3) G.mapTitleH3.textContent = 'Map failed to load';
         // Even if map fails, try to apply sidebar visibility based on localStorage (it will use fixed CSS positioning)
         applySidebarVisibilityState(); 
     }

    if (G.timerDisplayElement) {
        updateTimerDisplay();
        startOneSecondCountdown();
    } else {
        console.error("Timer display element 'small-timer' not found!");
    }

    console.log(">>> initMapGoogleCallback: FINISHED.");
}
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
    G.setTimerDisplayElement(document.getElementById('small-timer'));
    G.setUpdateFrequencySelect(document.getElementById('update-frequency'));
    G.setToggleLiveTrackingCheckbox(document.getElementById('toggle-live-tracking'));
    G.setToggleRoutePathsCheckbox(document.getElementById('toggle-route-paths'));
    G.setSaveOptionsBtn(document.getElementById('save-options'));
    G.setSidebarDiv(document.getElementById('route-sidebar'));
    G.setSidebarRoutesListDiv(document.getElementById('sidebar-routes-list'));
    G.setRoutePreviewContainerDiv(document.getElementById('route-preview-container'));
    G.setAvailableRoutesCountSpan(document.getElementById('available-routes-count')); 
    G.setSidebarToggleBtn(document.getElementById('sidebar-toggle-btn'));


    if (G.updateFrequencySelect) G.updateFrequencySelect.value = G.currentMapOptions.updateIntervalMs.toString();
    if (G.toggleLiveTrackingCheckbox) G.toggleLiveTrackingCheckbox.checked = G.currentMapOptions.liveTrackingEnabled;
    if (G.toggleRoutePathsCheckbox) G.toggleRoutePathsCheckbox.checked = G.currentMapOptions.showRoutePathsEnabled;

    console.log("initializeDOMElements: FINISHED. DOM elements stored in G.");
}

function addEventListeners() {
    console.log("addEventListeners: STARTED.");
    if (G.btnOperators) G.btnOperators.addEventListener('click', openOperatorsModal);
    if (G.btnRoutes) G.btnRoutes.addEventListener('click', openRoutesModal);
    if (G.btnOptions) G.btnOptions.addEventListener('click', openOptionsModal);
    if (G.closeOperatorsModalBtn) G.closeOperatorsModalBtn.addEventListener('click', () => { if(G.operatorsModal) G.operatorsModal.style.display = "none"; });
    if (G.closeRoutesModalBtn) G.closeRoutesModalBtn.addEventListener('click', () => {
        if(G.routesModal) G.routesModal.style.display = "none";
        G.setIsPreviewingRouteId(null);
        if (G.routePreviewContainerDiv) G.routePreviewContainerDiv.innerHTML = 'Click an available route to preview its path.';
    });

    if (G.sidebarToggleBtn) {
        G.sidebarToggleBtn.addEventListener('click', toggleSidebarVisibilityUI);
    }

    if (G.closeOptionsModalBtn) G.closeOptionsModalBtn.addEventListener('click', () => { if(G.optionsModal) G.optionsModal.style.display = "none"; });
    if (G.saveOperatorsBtn) G.saveOperatorsBtn.addEventListener('click', handleSaveOperators);
    if (G.saveRoutesBtn) G.saveRoutesBtn.addEventListener('click', handleSaveRoutes);
    if (G.saveOptionsBtn) G.saveOptionsBtn.addEventListener('click', handleSaveOptions);
    if (G.routeSearchInput) G.routeSearchInput.addEventListener('input', filterAvailableRoutes);

    window.addEventListener('click', (event) => {
        if (G.operatorsModal && event.target === G.operatorsModal) G.operatorsModal.style.display = "none";
        if (G.routesModal && event.target === G.routesModal) {
            G.routesModal.style.display = "none";
            G.setIsPreviewingRouteId(null); // Clear preview
            if (G.routePreviewContainerDiv) G.routePreviewContainerDiv.innerHTML = 'Click an available route to preview its path.';
        }
        if (G.optionsModal && event.target === G.optionsModal) G.optionsModal.style.display = "none";
    });
    console.log("addEventListeners: FINISHED.");
}

function updateTimerDisplay() {
    if (G.timerDisplayElement) {
        G.timerDisplayElement.textContent = `${G.countdownValue}`;
    } else {
         console.error("updateTimerDisplay: G.timerDisplayElement is null!");
    }
}

function startOneSecondCountdown() {
    // console.log("startOneSecondCountdown: STARTED."); // Can be noisy
    if (G.countdownIntervalId) {
        clearInterval(G.countdownIntervalId);
        G.setCountdownIntervalId(null);
        // console.log("startOneSecondCountdown: Cleared existing countdown interval.");
    }
    G.setCountdownValue(G.JS_DATA_REFRESH_INTERVAL_SECONDS);
    updateTimerDisplay();

    const newIntervalId = setInterval(async () => {
        G.setCountdownValue(G.countdownValue - 1);
        updateTimerDisplay();

        if (G.countdownValue <= G.FETCH_API_AT_COUNT && !G.isFetchingApiData && G.currentMapOptions.liveTrackingEnabled && G.selectedRealtimeRouteIds.size > 0) {
            console.log(`Countdown reached ${G.countdownValue}s. Fetching data early...`);
            G.setIsFetchingApiData(true);
            const routesParam = Array.from(G.selectedRealtimeRouteIds).join(',');
            fetchAndUpdateMarkers(routesParam).finally(() => {
                G.setIsFetchingApiData(false);
                console.log("Early data fetch complete.");
                 resetCountdown();
            });
        }

        if (G.countdownValue <= 0) {
            if (!G.isFetchingApiData) {
                 console.log("Countdown reached 0s. Resetting countdown.");
                 resetCountdown();
            } else {
                 console.log("Countdown reached 0s, but early fetch is ongoing. Will reset after fetch.");
            }
        }
    }, 1000);
    G.setCountdownIntervalId(newIntervalId);
    console.log(`startOneSecondCountdown: New countdown interval started with ID ${newIntervalId}.`);
}

function resetCountdown() {
     console.log("resetCountdown: Resetting countdown value to", G.JS_DATA_REFRESH_INTERVAL_SECONDS);
    G.setCountdownValue(G.JS_DATA_REFRESH_INTERVAL_SECONDS);
    updateTimerDisplay();
}

function animateMarkers(timestamp) {
    let anyMarkerIsStillAnimatingThisFrame = false;
    const animationDuration = G.currentMapOptions.updateIntervalMs * G.ANIMATION_DURATION_FACTOR;

    for (const vehicleId in G.busMarkerObjects) {
        if (!G.busMarkerObjects.hasOwnProperty(vehicleId)) continue;
        const md = G.busMarkerObjects[vehicleId];

        if (md.isAnimating) {
            const elapsedTime = timestamp - md.startTime;
            let fraction = (animationDuration > 0) ? (elapsedTime / animationDuration) : 1.0;
            fraction = Math.max(0, Math.min(1, fraction));

            if (md.startPos && md.targetPos) {
                const lat = md.startPos.lat + (md.targetPos.lat - md.startPos.lat) * fraction;
                const lng = md.startPos.lng + (md.targetPos.lng - md.startPos.lng) * fraction;
                
                if (md.gmapMarker && typeof md.gmapMarker.position === 'object') { 
                    md.gmapMarker.position = { lat, lng }; 
                }
            } else {
                md.isAnimating = false;
            }

            if (fraction < 1.0) {
                anyMarkerIsStillAnimatingThisFrame = true;
            } else {
                md.isAnimating = false;
            }
        }
    }

    if (anyMarkerIsStillAnimatingThisFrame) {
        G.setAnimationFrameId(requestAnimationFrame(animateMarkers));
    } else {
        G.setAnimationFrameId(null);
    }
}

export function startAnimationLoop() {
    if (G.animationFrameId === null) {
        let needsAnimation = false;
        for (const vid in G.busMarkerObjects) {
            if (G.busMarkerObjects.hasOwnProperty(vid) && G.busMarkerObjects[vid].isAnimating) {
                needsAnimation = true;
                break;
            }
        }
        if (needsAnimation) {
            G.setAnimationFrameId(requestAnimationFrame(animateMarkers));
        }
    }
}

export function formatTimestamp(unixTimestamp) {
    if (unixTimestamp === null || typeof unixTimestamp === 'undefined') return 'No TS';
    try {
        const tsMs = Number(unixTimestamp) * 1000;
        if (isNaN(tsMs)) return 'Inv TS Data';
        const date = new Date(tsMs);
        if (isNaN(date.getTime())) return 'Inv Date';
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) {
        console.error("formatTimestamp Error:", unixTimestamp, e);
        return 'TS Fmt Err';
    }
}

loadGoogleMapsScript().then(() => {
    console.log("Google Maps script loading initiated. Callback 'initMapGoogleCallback' will be invoked by Google.");
}).catch(error => {
    console.error("Failed to initiate Google Maps script loading:", error);
});

console.log("map_init.js: FINISHED PARSING.");