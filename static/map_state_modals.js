// static/map_state_modals.js

import * as G from './map_globals.js';
// Make sure updateMapData is imported if not already, though it's usually called after modal saves
import { updateMapData, populateSidebar, toggleRouteVisibility, renderRoutePreviewInModal } from './map_data_layer.js'; 

async function fetchRoutesForOperators(operatorIdsSet) {
    if (!operatorIdsSet || operatorIdsSet.size === 0) {
        G.setAllFetchedRoutesForCurrentOperators([]);
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
        G.allFetchedRoutesForCurrentOperators.forEach(route => {
            if (!tempAssignedColors[route.realtime_id]) {
                 let hash = 0;
                 for (let i = 0; i < route.realtime_id.length; i++) {
                     hash = route.realtime_id.charCodeAt(i) + ((hash << 5) - hash);
                     hash = hash & hash;
                 }
                 tempAssignedColors[route.realtime_id] = G.ROUTE_COLORS[Math.abs(hash) % G.ROUTE_COLORS.length];
             }
        });
        G.setAssignedRouteColors(tempAssignedColors); // Update global colors

    } catch (error) {
        console.error("Error in fetchRoutesForOperators:", error);
        G.setAllFetchedRoutesForCurrentOperators([]); // Clear on error
    }
}

export function saveStateToLocalStorage() {
    console.log("saveStateToLocalStorage: SAVING. Current state from G:", {
        operators: Array.from(G.selectedOperatorIds),
        routes_selected: Array.from(G.selectedRealtimeRouteIds),
        routes_visible: Array.from(G.visibleRealtimeRouteIds),
        options: G.currentMapOptions,
        colors: G.assignedRouteColors,
        allFetchedRoutesCount: G.allFetchedRoutesForCurrentOperators.length // Also log this for context
    });

    try {
        localStorage.setItem('selectedOperatorIds', JSON.stringify(Array.from(G.selectedOperatorIds)));
        localStorage.setItem('selectedRealtimeRouteIds', JSON.stringify(Array.from(G.selectedRealtimeRouteIds)));
        localStorage.setItem('visibleRealtimeRouteIds', JSON.stringify(Array.from(G.visibleRealtimeRouteIds)));
        localStorage.setItem('currentMapOptions', JSON.stringify(G.currentMapOptions));
        localStorage.setItem('assignedRouteColors', JSON.stringify(G.assignedRouteColors));
        // Note: We don't save allFetchedRoutesForCurrentOperators to localStorage as it's dynamic
        // and can be large. It's refetched based on selected operators.
        console.log("saveStateToLocalStorage: FINISHED - State saved to localStorage.");
    } catch (e) {
        console.error("saveStateToLocalStorage: ERROR saving to localStorage.", e);
        // Optionally, inform the user if localStorage is full or unavailable, though this is rare.
        // alert("Could not save preferences. Your browser's local storage might be full or disabled.");
    }
}

// Modify loadStateFromLocalStorage
export async function loadStateFromLocalStorage() { // Make it async
    console.log("loadStateFromLocalStorage: STARTED");
    const storedOperatorIds = localStorage.getItem('selectedOperatorIds');
    const storedRouteIds = localStorage.getItem('selectedRealtimeRouteIds');
    const storedVisibleRouteIds = localStorage.getItem('visibleRealtimeRouteIds');
    const storedOptions = localStorage.getItem('currentMapOptions');
    const storedAssignedColors = localStorage.getItem('assignedRouteColors');

    let tempSelectedOperatorIds = new Set();
    if (storedOperatorIds) {
        try {
            const parsedIds = JSON.parse(storedOperatorIds);
            if (Array.isArray(parsedIds)) {
                 tempSelectedOperatorIds = new Set(parsedIds);
            } else { localStorage.removeItem('selectedOperatorIds');}
        } catch (e) { console.error("Error parsing storedOperatorIds", e); localStorage.removeItem('selectedOperatorIds');}
    }
    G.setSelectedOperatorIds(tempSelectedOperatorIds);

    if (G.selectedOperatorIds.size > 0) {
        await fetchRoutesForOperators(G.selectedOperatorIds); // Await this
    } else {
        G.setAllFetchedRoutesForCurrentOperators([]); // Ensure it's empty if no operators
    }

    let tempSelectedRealtimeRouteIds = new Set();
    if (storedRouteIds) {
         try {
            const parsedIds = JSON.parse(storedRouteIds);
             if (Array.isArray(parsedIds)) {
                tempSelectedRealtimeRouteIds = new Set(parsedIds);
             } else { localStorage.removeItem('selectedRealtimeRouteIds'); }
        } catch (e) { console.error("Error parsing storedRouteIds", e); localStorage.removeItem('selectedRealtimeRouteIds'); }
    }
    const validSelectedRoutesForSelectedOperators = new Set();
    tempSelectedRealtimeRouteIds.forEach(routeId => {
        const agencyId = routeId.split('_')[0];
        if (G.selectedOperatorIds.has(agencyId)) {
            validSelectedRoutesForSelectedOperators.add(routeId);
        }
    });
    G.setSelectedRealtimeRouteIds(validSelectedRoutesForSelectedOperators);

    let tempVisibleRealtimeRouteIds = new Set();
    if (storedVisibleRouteIds) {
        try {
            const parsedIds = JSON.parse(storedVisibleRouteIds);
             if (Array.isArray(parsedIds)) {
                parsedIds.forEach(routeId => {
                    if (G.selectedRealtimeRouteIds.has(routeId)) {
                        tempVisibleRealtimeRouteIds.add(routeId);
                    }
                });
             } else { localStorage.removeItem('visibleRealtimeRouteIds'); }
        } catch (e) { console.error("Error parsing storedVisibleRouteIds", e); localStorage.removeItem('visibleRealtimeRouteIds'); }
    } else {
         tempVisibleRealtimeRouteIds = new Set(G.selectedRealtimeRouteIds);
    }
     G.setVisibleRealtimeRouteIds(tempVisibleRealtimeRouteIds);

    let tempCurrentMapOptions = { ...G.currentMapOptions };
    if (storedOptions) {
        try {
            const parsedOptions = JSON.parse(storedOptions);
            tempCurrentMapOptions = { ...tempCurrentMapOptions, ...parsedOptions };
        } catch (e) { console.error("Error parsing storedOptions", e); localStorage.removeItem('currentMapOptions');}
    }
    G.setCurrentMapOptions(tempCurrentMapOptions);

    let tempAssignedRouteColors = {};
    if (storedAssignedColors) {
        try {
            const parsedColors = JSON.parse(storedAssignedColors);
             // Basic check for object type
             if (typeof parsedColors === 'object' && parsedColors !== null && !Array.isArray(parsedColors)) {
                 tempAssignedRouteColors = parsedColors;
             } else { localStorage.removeItem('assignedRouteColors'); }
        } catch (e) { console.error("Error parsing storedAssignedColors", e); localStorage.removeItem('assignedRouteColors');}
    }
    // Merge with any colors just assigned by fetchRoutesForOperators
    G.setAssignedRouteColors({ ...tempAssignedRouteColors, ...G.assignedRouteColors });


    console.log("loadStateFromLocalStorage: FINISHED. State loaded into G:", {
        operators: Array.from(G.selectedOperatorIds),
        routes_selected: Array.from(G.selectedRealtimeRouteIds),
        routes_visible: Array.from(G.visibleRealtimeRouteIds),
        options: G.currentMapOptions,
        colors: G.assignedRouteColors,
        allFetchedRoutesCount: G.allFetchedRoutesForCurrentOperators.length
    });
}

// Modify openRoutesModal to use the helper
export async function openRoutesModal() {
    console.log("openRoutesModal: CLICKED.");
    if (!G.routeSearchInput || !G.routesModal || !G.routePreviewContainerDiv) return;

    if (G.selectedOperatorIds.size === 0) {
        alert("Please select an operator first.");
        return;
    }
    G.routeSearchInput.value = '';
    G.setIsPreviewingRouteId(null); 
    G.routePreviewContainerDiv.innerHTML = 'Click an available route to preview its path.';

    // Use the helper function to ensure routes and colors are loaded/updated
    await fetchRoutesForOperators(G.selectedOperatorIds); // This now also handles color assignment

    if (G.allFetchedRoutesForCurrentOperators.length === 0 && G.selectedOperatorIds.size > 0) {
        // This case might occur if API returns empty or fails for selected operators
        console.warn("openRoutesModal: No routes found for selected operators. Modal might be empty.");
        // alert("No routes available for the selected operator(s)."); // Optional user feedback
    }

    populateRoutesModalLists(); // This function will use G.allFetchedRoutesForCurrentOperators
    G.routesModal.style.display = "block";
}

export async function handleSaveOperators() {
    console.log("handleSaveOperators: CLICKED.");
    if (!G.operatorsListDiv || !G.operatorsModal || !G.btnRoutes) return;

    const newSelectedOperatorIds = new Set();
    G.operatorsListDiv.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
        newSelectedOperatorIds.add(cb.value);
    });

    const oldSelectedOperatorIds = new Set(G.selectedOperatorIds);
    const operatorsChanged = newSelectedOperatorIds.size !== oldSelectedOperatorIds.size || 
                           ![...newSelectedOperatorIds].every(id => oldSelectedOperatorIds.has(id));

    G.setSelectedOperatorIds(newSelectedOperatorIds);
    G.operatorsModal.style.display = "none";

    // If operators changed, re-fetch routes for the new set of operators
    if (operatorsChanged) {
        console.log("handleSaveOperators: Operators changed, fetching new route list.");
        await fetchRoutesForOperators(G.selectedOperatorIds); // Update G.allFetchedRoutesForCurrentOperators
    }

    const updatedSelectedRoutes = new Set();
    G.selectedRealtimeRouteIds.forEach(routeId => {
        const agencyId = routeId.split('_')[0];
        if (G.selectedOperatorIds.has(agencyId)) {
            updatedSelectedRoutes.add(routeId);
        }
    });

    const oldSelectedRouteIds = new Set(G.selectedRealtimeRouteIds);
    G.setSelectedRealtimeRouteIds(updatedSelectedRoutes);

    const newVisibleRealtimeRouteIds = new Set();
    G.visibleRealtimeRouteIds.forEach(routeId => {
        if (G.selectedRealtimeRouteIds.has(routeId)) {
            newVisibleRealtimeRouteIds.add(routeId);
        }
    });
     G.selectedRealtimeRouteIds.forEach(routeId => {
         if (!oldSelectedRouteIds.has(routeId)) { // If it's a newly selected route (due to operator change making it valid)
             // Check if it's part of the routes for the new operators before making visible
             if (G.allFetchedRoutesForCurrentOperators.some(r => r.realtime_id === routeId)) {
             newVisibleRealtimeRouteIds.add(routeId);
             }
         }
     });
    G.setVisibleRealtimeRouteIds(newVisibleRealtimeRouteIds);

    saveStateToLocalStorage();
    G.btnRoutes.disabled = G.selectedOperatorIds.size === 0;
    await updateMapData(); // This will call populateSidebar, which now should have route details
}