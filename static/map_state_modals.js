// static/map_state_modals.js
console.log("map_state_modals.js: PARSING.");

import * as G from './map_globals.js';
import { updateMapData, populateSidebar, toggleRouteVisibility, renderRoutePreviewInModal } from './map_data_layer.js'; 

async function fetchRoutesForOperators(operatorIdsSet) {
    if (!operatorIdsSet || operatorIdsSet.size === 0) {
        G.setAllFetchedRoutesForCurrentOperators([]);
        console.log("fetchRoutesForOperators: No operator IDs provided, cleared allFetchedRoutes.");
        return;
    }
    try {
        const agencyIdsParam = Array.from(operatorIdsSet).join(',');
        console.log(`fetchRoutesForOperators: Fetching routes for operators: ${agencyIdsParam}`);
        const response = await fetch(`/api/routes_by_agency?agency_ids=${agencyIdsParam}`);
        if (!response.ok) {
            console.error(`fetchRoutesForOperators: HTTP error! status: ${response.status} for agencies ${agencyIdsParam}`);
            G.setAllFetchedRoutesForCurrentOperators([]); // Clear on error
            return;
        }
        const fetchedRoutes = await response.json();
        G.setAllFetchedRoutesForCurrentOperators(fetchedRoutes);
        console.log(`fetchRoutesForOperators: Stored ${fetchedRoutes.length} routes in G.allFetchedRoutesForCurrentOperators.`);

        // Assign colors if not already assigned for these fetched routes
        const tempAssignedColors = { ...G.assignedRouteColors }; 
        let colorsAssignedCount = 0;
        G.allFetchedRoutesForCurrentOperators.forEach(route => {
            if (!tempAssignedColors[route.realtime_id]) {
                 let hash = 0;
                 for (let i = 0; i < route.realtime_id.length; i++) {
                     hash = route.realtime_id.charCodeAt(i) + ((hash << 5) - hash);
                     hash = hash & hash; // Convert to 32bit integer
                 }
                 tempAssignedColors[route.realtime_id] = G.ROUTE_COLORS[Math.abs(hash) % G.ROUTE_COLORS.length];
                 colorsAssignedCount++;
             }
        });
        if (colorsAssignedCount > 0) {
            console.log(`fetchRoutesForOperators: Assigned colors for ${colorsAssignedCount} new routes.`);
        }
        G.setAssignedRouteColors(tempAssignedColors); // Update global colors

    } catch (error) {
        console.error("Error in fetchRoutesForOperators:", error);
        G.setAllFetchedRoutesForCurrentOperators([]); // Clear on error
    }
}

// --- Exported Functions ---
export async function loadStateFromLocalStorage() {
    console.log("loadStateFromLocalStorage: STARTED");
    const storedOperatorIds = localStorage.getItem('selectedOperatorIds');
    const storedRouteIds = localStorage.getItem('selectedRealtimeRouteIds');
    const storedVisibleRouteIds = localStorage.getItem('visibleRealtimeRouteIds');
    const storedOptions = localStorage.getItem('currentMapOptions');
    const storedAssignedColors = localStorage.getItem('assignedRouteColors');
    const storedSidebarState = localStorage.getItem('isSidebarVisible');
    if (storedSidebarState !== null) {
        try {
            G.setIsSidebarVisible(JSON.parse(storedSidebarState));
        } catch (e) {
            console.error("Error parsing storedSidebarState, using default.", e);
            G.setIsSidebarVisible(window.innerWidth > 768); // Default based on screen width
        }
    } else {
        // Default for first load (e.g., visible on desktop, hidden on mobile)
        // Ensure window object is available (it should be in browser context)
        if (typeof window !== 'undefined') {
            G.setIsSidebarVisible(window.innerWidth > 768); 
        } else {
            G.setIsSidebarVisible(true); // Fallback if window is not available (e.g. testing env)
        }
        console.log("loadStateFromLocalStorage: No sidebar state found, defaulting to:", G.isSidebarVisible);
    }
    let tempSelectedOperatorIds = new Set();
    if (storedOperatorIds) {
        try {
            const parsedIds = JSON.parse(storedOperatorIds);
            if (Array.isArray(parsedIds)) {
                 tempSelectedOperatorIds = new Set(parsedIds);
            } else { console.warn("Stored selectedOperatorIds was not an array, clearing."); localStorage.removeItem('selectedOperatorIds');}
        } catch (e) { console.error("Error parsing storedOperatorIds", e); localStorage.removeItem('selectedOperatorIds');}
    }
    G.setSelectedOperatorIds(tempSelectedOperatorIds);

    if (G.selectedOperatorIds.size > 0) {
        await fetchRoutesForOperators(G.selectedOperatorIds);
    } else {
        G.setAllFetchedRoutesForCurrentOperators([]);
    }

    let tempSelectedRealtimeRouteIds = new Set();
    if (storedRouteIds) {
         try {
            const parsedIds = JSON.parse(storedRouteIds);
             if (Array.isArray(parsedIds)) {
                tempSelectedRealtimeRouteIds = new Set(parsedIds);
             } else { console.warn("Stored selectedRealtimeRouteIds was not an array, clearing."); localStorage.removeItem('selectedRealtimeRouteIds'); }
        } catch (e) { console.error("Error parsing storedRouteIds", e); localStorage.removeItem('selectedRealtimeRouteIds'); }
    }
    const validSelectedRoutesForSelectedOperators = new Set();
    tempSelectedRealtimeRouteIds.forEach(routeId => {
        const agencyId = routeId.split('_')[0];
        if (G.selectedOperatorIds.has(agencyId)) {
            validSelectedRoutesForSelectedOperators.add(routeId);
        } else {
            console.log(`loadStateFromLocalStorage: Removing route ${routeId} from selected as operator ${agencyId} is not selected.`);
        }
    });
    G.setSelectedRealtimeRouteIds(validSelectedRoutesForSelectedOperators);

    let tempVisibleRealtimeRouteIds = new Set();
    if (storedVisibleRouteIds) {
        try {
            const parsedIds = JSON.parse(storedVisibleRouteIds);
             if (Array.isArray(parsedIds)) {
                parsedIds.forEach(routeId => {
                    if (G.selectedRealtimeRouteIds.has(routeId)) { // Only keep visible if also selected
                        tempVisibleRealtimeRouteIds.add(routeId);
                    }
                });
             } else { console.warn("Stored visibleRealtimeRouteIds was not an array, clearing."); localStorage.removeItem('visibleRealtimeRouteIds'); }
        } catch (e) { console.error("Error parsing storedVisibleRouteIds", e); localStorage.removeItem('visibleRealtimeRouteIds'); }
    } else {
         // Default: all selected routes are visible if no specific visibility state is saved
         tempVisibleRealtimeRouteIds = new Set(G.selectedRealtimeRouteIds);
         console.log("loadStateFromLocalStorage: No visible routes stored, defaulting to all selected routes being visible.");
    }
     G.setVisibleRealtimeRouteIds(tempVisibleRealtimeRouteIds);

    let tempCurrentMapOptions = { ...G.currentMapOptions }; // Start with defaults
    if (storedOptions) {
        try {
            const parsedOptions = JSON.parse(storedOptions);
            tempCurrentMapOptions = { ...tempCurrentMapOptions, ...parsedOptions }; // Merge stored over defaults
        } catch (e) { console.error("Error parsing storedOptions", e); localStorage.removeItem('currentMapOptions');}
    }
    G.setCurrentMapOptions(tempCurrentMapOptions);

    // Load stored colors, then potentially merge/override with colors from fetchRoutesForOperators
    let tempStoredAssignedColors = {};
    if (storedAssignedColors) {
        try {
            const parsedColors = JSON.parse(storedAssignedColors);
             if (typeof parsedColors === 'object' && parsedColors !== null && !Array.isArray(parsedColors)) {
                 tempStoredAssignedColors = parsedColors;
             } else { console.warn("Stored assignedRouteColors was not an object, clearing."); localStorage.removeItem('assignedRouteColors'); }
        } catch (e) { console.error("Error parsing storedAssignedColors", e); localStorage.removeItem('assignedRouteColors');}
    }
    // G.assignedRouteColors is already populated by fetchRoutesForOperators if operators were selected.
    // We merge stored colors first, so freshly fetched/assigned colors take precedence.
    G.setAssignedRouteColors({ ...tempStoredAssignedColors, ...G.assignedRouteColors });


    console.log("loadStateFromLocalStorage: FINISHED. State loaded into G:", {
        operators: Array.from(G.selectedOperatorIds),
        routes_selected: Array.from(G.selectedRealtimeRouteIds),
        routes_visible: Array.from(G.visibleRealtimeRouteIds),
        options: G.currentMapOptions,
        colors: G.assignedRouteColors,
        allFetchedRoutesCount: G.allFetchedRoutesForCurrentOperators.length
    });
}

export function saveStateToLocalStorage() {
    console.log("saveStateToLocalStorage: SAVING. Current state from G:", {
        operators: Array.from(G.selectedOperatorIds),
        routes_selected: Array.from(G.selectedRealtimeRouteIds),
        routes_visible: Array.from(G.visibleRealtimeRouteIds),
        options: G.currentMapOptions,
        colors: G.assignedRouteColors
        // Not saving allFetchedRoutesCount as it's dynamic
    });

    try {
        localStorage.setItem('selectedOperatorIds', JSON.stringify(Array.from(G.selectedOperatorIds)));
        localStorage.setItem('selectedRealtimeRouteIds', JSON.stringify(Array.from(G.selectedRealtimeRouteIds)));
        localStorage.setItem('visibleRealtimeRouteIds', JSON.stringify(Array.from(G.visibleRealtimeRouteIds)));
        localStorage.setItem('currentMapOptions', JSON.stringify(G.currentMapOptions));
        localStorage.setItem('assignedRouteColors', JSON.stringify(G.assignedRouteColors));
        localStorage.setItem('isSidebarVisible', JSON.stringify(G.isSidebarVisible));

        console.log("saveStateToLocalStorage: FINISHED - State saved to localStorage.");
    } catch (e) {
        console.error("saveStateToLocalStorage: ERROR saving to localStorage.", e);
    }
}

export async function openOperatorsModal() {
    console.log("openOperatorsModal: CLICKED.");
    if (!G.operatorsListDiv || !G.operatorsModal) {
        console.error("Operators modal elements not found in G."); return;
    }
    try {
        const response = await fetch('/api/agencies');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const agencies = await response.json();

        G.operatorsListDiv.innerHTML = '';
        agencies.forEach(agency => {
            const label = document.createElement('label');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = agency.id;
            checkbox.checked = G.selectedOperatorIds.has(agency.id);
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(` ${agency.name} (${agency.id})`));
            G.operatorsListDiv.appendChild(label);
        });
        G.operatorsModal.style.display = "block";
    } catch (error) {
        console.error("Error fetching or populating agencies:", error);
        alert("Could not load operator list. Please try again.");
    }
}

export async function handleSaveOperators() {
    console.log("handleSaveOperators: CLICKED.");
    if (!G.operatorsListDiv || !G.operatorsModal || !G.btnRoutes) {
        console.error("Operator save elements not found in G."); return;
    }
    const newSelectedOperatorIds = new Set();
    G.operatorsListDiv.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
        newSelectedOperatorIds.add(cb.value);
    });

    const oldSelectedOperatorIds = new Set(G.selectedOperatorIds);
    const operatorsActuallyChanged = newSelectedOperatorIds.size !== oldSelectedOperatorIds.size ||
                           ![...newSelectedOperatorIds].every(id => oldSelectedOperatorIds.has(id));

    G.setSelectedOperatorIds(newSelectedOperatorIds);
    G.operatorsModal.style.display = "none";

    if (operatorsActuallyChanged) {
        console.log("handleSaveOperators: Operators changed, re-fetching routes and colors.");
        await fetchRoutesForOperators(G.selectedOperatorIds);
    }

    // Filter selectedRealtimeRouteIds based on the new operator selection
    const updatedSelectedRoutes = new Set();
    G.selectedRealtimeRouteIds.forEach(routeId => {
        const agencyId = routeId.split('_')[0];
        if (G.selectedOperatorIds.has(agencyId)) {
            updatedSelectedRoutes.add(routeId);
        }
    });
    const oldSelectedRouteIds = new Set(G.selectedRealtimeRouteIds); // For comparing if routes were newly selected
    G.setSelectedRealtimeRouteIds(updatedSelectedRoutes);

    // Update visibleRealtimeRouteIds: keep visible if still selected, make newly valid routes visible
    const newVisibleRealtimeRouteIds = new Set();
    G.visibleRealtimeRouteIds.forEach(routeId => { // Start with currently visible
        if (G.selectedRealtimeRouteIds.has(routeId)) { // If still a selected route
            newVisibleRealtimeRouteIds.add(routeId);
        }
    });
    G.selectedRealtimeRouteIds.forEach(routeId => { // For all currently selected routes
        // If a route is now selected but wasn't in the old set of selected routes
        // (meaning it became valid due to operator change OR was newly checked in a complex scenario)
        // AND it's part of the routes for the currently selected operators (sanity check)
        if (!oldSelectedRouteIds.has(routeId) && G.allFetchedRoutesForCurrentOperators.some(r => r.realtime_id === routeId)) {
            newVisibleRealtimeRouteIds.add(routeId); // Make it visible by default
         }
     });
    G.setVisibleRealtimeRouteIds(newVisibleRealtimeRouteIds);

    saveStateToLocalStorage();
    console.log("Operators selection saved. G.selectedOperatorIds:", Array.from(G.selectedOperatorIds));
    G.btnRoutes.disabled = G.selectedOperatorIds.size === 0;
    await updateMapData();
}

export async function openRoutesModal() {
    console.log("openRoutesModal: CLICKED.");
    if (!G.routeSearchInput || !G.routesModal || !G.routePreviewContainerDiv || !G.availableRoutesCountSpan) {
        console.error("Route modal elements not found in G."); return;
    }
    if (G.selectedOperatorIds.size === 0) {
        alert("Please select an operator first.");
        return;
    }
    G.routeSearchInput.value = ''; // Clear search
    G.setIsPreviewingRouteId(null); // Clear any previous preview
    G.routePreviewContainerDiv.innerHTML = 'Click an available route to preview its path.'; // Reset preview area

    // Ensure route data and colors for current operators are loaded/refreshed
    await fetchRoutesForOperators(G.selectedOperatorIds);

    if (G.allFetchedRoutesForCurrentOperators.length === 0 && G.selectedOperatorIds.size > 0) {
        console.warn("openRoutesModal: No routes found for selected operators. Route list will be empty.");
        // alert("No routes seem to be available for the selected operator(s)."); // Optional user feedback
    }

    populateRoutesModalLists(); // This function will use G.allFetchedRoutesForCurrentOperators
    G.routesModal.style.display = "block";
}

export function populateRoutesModalLists() {
    console.log("populateRoutesModalLists: STARTED.");
    if (!G.selectedRoutesListDiv || !G.availableRoutesListDiv || !G.routeSearchInput || !G.availableRoutesCountSpan) {
        console.error("Route modal list population elements not found in G."); return;
    }
    G.selectedRoutesListDiv.innerHTML = '';
    G.availableRoutesListDiv.innerHTML = '';
    const searchTerm = G.routeSearchInput.value.toLowerCase();

    const sortedRoutes = [...G.allFetchedRoutesForCurrentOperators].sort((a, b) => {
        const aSelected = G.selectedRealtimeRouteIds.has(a.realtime_id);
        const bSelected = G.selectedRealtimeRouteIds.has(b.realtime_id);
        if (aSelected && !bSelected) return -1;
        if (!aSelected && bSelected) return 1;
        const aParts = a.short_name.split(/[/\s]/);
        const bParts = b.short_name.split(/[/\s]/);
        const aNum = parseInt(aParts[0], 10);
        const bNum = parseInt(bParts[0], 10);
        if (!isNaN(aNum) && !isNaN(bNum) && aNum !== bNum) return aNum - bNum;
        return a.short_name.localeCompare(b.short_name);
    });

    let availableCount = 0;
    sortedRoutes.forEach(route => {
        const routeDisplayName = `${route.short_name} - ${route.long_name || 'No description'} (Agency: ${route.agency_id})`;
        if (searchTerm && !routeDisplayName.toLowerCase().includes(searchTerm) && !route.realtime_id.toLowerCase().includes(searchTerm)) {
            return;
        }

        const routeItemDiv = document.createElement('div');
        routeItemDiv.className = 'modal-route-item';

        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = route.realtime_id;
        checkbox.dataset.shortName = route.short_name;
        checkbox.checked = G.selectedRealtimeRouteIds.has(route.realtime_id);

        const colorDot = document.createElement('span');
        colorDot.className = 'route-color-dot';
        colorDot.style.backgroundColor = G.assignedRouteColors[route.realtime_id] || G.ROUTE_COLORS[0];

        label.appendChild(colorDot);
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(` ${route.short_name} - ${route.long_name || 'No description'}`));

        routeItemDiv.appendChild(label);

        checkbox.addEventListener('change', (event) => {
            const routeId = event.target.value;
            const isChecked = event.target.checked;
            const tempSelectedRoutes = new Set(G.selectedRealtimeRouteIds);
            const tempVisibleRoutes = new Set(G.visibleRealtimeRouteIds);

            if (isChecked) {
                tempSelectedRoutes.add(routeId);
                tempVisibleRoutes.add(routeId); // Newly selected routes become visible by default
            } else {
                tempSelectedRoutes.delete(routeId);
                tempVisibleRoutes.delete(routeId); // Deselecting also hides
                if (G.isPreviewingRouteId === routeId) { // If unchecking the previewed route
                    G.setIsPreviewingRouteId(null);
                    if (G.routePreviewContainerDiv) G.routePreviewContainerDiv.innerHTML = 'Click an available route to preview its path.';
                }
            }
            G.setSelectedRealtimeRouteIds(tempSelectedRoutes);
            G.setVisibleRealtimeRouteIds(tempVisibleRoutes);
            populateRoutesModalLists(); // Re-populate to move item and update styles/counts
        });

        if (checkbox.checked) {
            G.selectedRoutesListDiv.appendChild(routeItemDiv);
        } else {
            availableCount++;
            routeItemDiv.addEventListener('click', (event) => {
                if (event.target.type !== 'checkbox') { // Don't interfere with checkbox click itself
                    event.preventDefault(); 
                    const routeIdForPreview = route.realtime_id;

                    // Update visual state for previewing item
                    G.availableRoutesListDiv.querySelectorAll('.modal-route-item.previewing').forEach(item => item.classList.remove('previewing'));
                    
                    if (G.isPreviewingRouteId === routeIdForPreview) {
                        G.setIsPreviewingRouteId(null);
                        if(G.routePreviewContainerDiv) G.routePreviewContainerDiv.innerHTML = 'Click an available route to preview its path.';
                    } else {
                        G.setIsPreviewingRouteId(routeIdForPreview);
                        routeItemDiv.classList.add('previewing');
                        if(G.routePreviewContainerDiv) G.routePreviewContainerDiv.innerHTML = `Loading preview for ${route.short_name}...`;
                        renderRoutePreviewInModal(routeIdForPreview, G.routePreviewContainerDiv);
                    }
                }
            });
            if (G.isPreviewingRouteId === route.realtime_id) {
                routeItemDiv.classList.add('previewing');
            }
            G.availableRoutesListDiv.appendChild(routeItemDiv);
        }
    });
    if (G.availableRoutesCountSpan) G.availableRoutesCountSpan.textContent = `(${availableCount})`;
    console.log("populateRoutesModalLists: FINISHED.");
}

export function filterAvailableRoutes() {
    console.log("filterAvailableRoutes: Input changed. Re-populating lists.");
    // Clear preview if search term changes, as the list context is changing
    if (G.isPreviewingRouteId && G.routePreviewContainerDiv) {
        G.setIsPreviewingRouteId(null);
        G.routePreviewContainerDiv.innerHTML = 'Click an available route to preview its path.';
    }
    populateRoutesModalLists();
}

export async function handleSaveRoutes() {
    console.log("handleSaveRoutes: CLICKED.");
    if (!G.routesModal) { console.error("Routes modal not found in G."); return; }
    saveStateToLocalStorage();
    G.routesModal.style.display = "none";
    G.setIsPreviewingRouteId(null); // Clear preview state when saving/closing
    if (G.routePreviewContainerDiv) G.routePreviewContainerDiv.innerHTML = 'Click an available route to preview its path.';
    await updateMapData();
}

export function openOptionsModal() {
    console.log("openOptionsModal: CLICKED.");
    if (!G.updateFrequencySelect || !G.toggleLiveTrackingCheckbox || !G.toggleRoutePathsCheckbox || !G.optionsModal) {
        console.error("Options modal elements not found in G."); return;
    }
    G.updateFrequencySelect.value = G.currentMapOptions.updateIntervalMs.toString();
    G.toggleLiveTrackingCheckbox.checked = G.currentMapOptions.liveTrackingEnabled;
    G.toggleRoutePathsCheckbox.checked = G.currentMapOptions.showRoutePathsEnabled;
    G.optionsModal.style.display = "block";
}

export async function handleSaveOptions() {
    console.log("handleSaveOptions: CLICKED.");
     if (!G.updateFrequencySelect || !G.toggleLiveTrackingCheckbox || !G.toggleRoutePathsCheckbox || !G.optionsModal) {
        console.error("Options save elements not found in G."); return;
    }
    const newUpdateInterval = parseInt(G.updateFrequencySelect.value, 10);
    const newLiveTracking = G.toggleLiveTrackingCheckbox.checked;
    const newShowRoutePaths = G.toggleRoutePathsCheckbox.checked;

    const optionsChanged = G.currentMapOptions.updateIntervalMs !== newUpdateInterval ||
                           G.currentMapOptions.liveTrackingEnabled !== newLiveTracking ||
                           G.currentMapOptions.showRoutePathsEnabled !== newShowRoutePaths;

    if (optionsChanged) {
         G.setCurrentMapOptions({
             updateIntervalMs: newUpdateInterval,
             liveTrackingEnabled: newLiveTracking,
             showRoutePathsEnabled: newShowRoutePaths
         });
         saveStateToLocalStorage();
         console.log("Map options saved (G.currentMapOptions):", G.currentMapOptions);
         await updateMapData();
     } else {
         console.log("Map options did not change. Skipping save and map update.");
     }
    G.optionsModal.style.display = "none";
}

console.log("map_state_modals.js: FINISHED PARSING.");