// static/map_state_modals.js
console.log("map_state_modals.js: PARSING.");

import * as G from './map_globals.js';
import { updateMapData, populateSidebar, toggleRouteVisibility } from './map_data_layer.js'; // Import populateSidebar and toggleRouteVisibility

export function loadStateFromLocalStorage() {
    console.log("loadStateFromLocalStorage: STARTED");
    const storedOperatorIds = localStorage.getItem('selectedOperatorIds');
    const storedRouteIds = localStorage.getItem('selectedRealtimeRouteIds');
    const storedVisibleRouteIds = localStorage.getItem('visibleRealtimeRouteIds'); // NEW
    const storedOptions = localStorage.getItem('currentMapOptions');
    const storedAssignedColors = localStorage.getItem('assignedRouteColors');

    let tempSelectedOperatorIds = new Set();
    if (storedOperatorIds) {
        try {
            const parsedIds = JSON.parse(storedOperatorIds);
             // Ensure it's an array before creating a Set
            if (Array.isArray(parsedIds)) {
                 tempSelectedOperatorIds = new Set(parsedIds);
            } else {
                 console.warn("Stored selectedOperatorIds was not an array, clearing.");
                 localStorage.removeItem('selectedOperatorIds');
            }
        } catch (e) { console.error("Error parsing storedOperatorIds", e); localStorage.removeItem('selectedOperatorIds');}
    }
    G.setSelectedOperatorIds(tempSelectedOperatorIds);

    let tempSelectedRealtimeRouteIds = new Set();
    if (storedRouteIds) {
         try {
            const parsedIds = JSON.parse(storedRouteIds);
             if (Array.isArray(parsedIds)) {
                tempSelectedRealtimeRouteIds = new Set(parsedIds);
             } else {
                 console.warn("Stored selectedRealtimeRouteIds was not an array, clearing.");
                 localStorage.removeItem('selectedRealtimeRouteIds');
             }
        } catch (e) { console.error("Error parsing storedRouteIds", e); localStorage.removeItem('selectedRealtimeRouteIds'); }
    }
    // Filter routes based on currently selected operators AFTER loading them
    const validSelectedRoutesForSelectedOperators = new Set();
    tempSelectedRealtimeRouteIds.forEach(routeId => {
        const agencyId = routeId.split('_')[0];
        if (G.selectedOperatorIds.has(agencyId)) {
            validSelectedRoutesForSelectedOperators.add(routeId);
        } else {
            console.log(`loadStateFromLocalStorage: Removing route ${routeId} from selectedRealtimeRouteIds as its operator ${agencyId} is not in G.selectedOperatorIds.`);
        }
    });
    G.setSelectedRealtimeRouteIds(validSelectedRoutesForSelectedOperators);

    // NEW: Load visible routes, filter by currently selected routes
    let tempVisibleRealtimeRouteIds = new Set();
    if (storedVisibleRouteIds) {
        try {
            const parsedIds = JSON.parse(storedVisibleRouteIds);
             if (Array.isArray(parsedIds)) {
                // Only load visible routes if they are also in the now-filtered selected routes
                parsedIds.forEach(routeId => {
                    if (G.selectedRealtimeRouteIds.has(routeId)) {
                        tempVisibleRealtimeRouteIds.add(routeId);
                    } else {
                         console.log(`loadStateFromLocalStorage: Removing route ${routeId} from visibleRealtimeRouteIds as it's not in G.selectedRealtimeRouteIds.`);
                    }
                });
             } else {
                 console.warn("Stored visibleRealtimeRouteIds was not an array, clearing.");
                 localStorage.removeItem('visibleRealtimeRouteIds');
             }
        } catch (e) { console.error("Error parsing storedVisibleRouteIds", e); localStorage.removeItem('visibleRealtimeRouteIds'); }
    } else {
         // If no visible state saved, default to showing all selected routes
         console.log("loadStateFromLocalStorage: No visibleRealtimeRouteIds found, defaulting to show all selected routes.");
         tempVisibleRealtimeRouteIds = new Set(G.selectedRealtimeRouteIds);
    }
     G.setVisibleRealtimeRouteIds(tempVisibleRealtimeRouteIds); // Update global state


    let tempCurrentMapOptions = { ...G.currentMapOptions }; // Start with defaults
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
             } else {
                 console.warn("Stored assignedRouteColors was not an object, clearing.");
                 localStorage.removeItem('assignedRouteColors');
             }
        } catch (e) { console.error("Error parsing storedAssignedColors", e); localStorage.removeItem('assignedRouteColors');}
    }
    G.setAssignedRouteColors(tempAssignedColors);


    console.log("loadStateFromLocalStorage: FINISHED. State loaded into G:", {
        operators: Array.from(G.selectedOperatorIds),
        routes_selected: Array.from(G.selectedRealtimeRouteIds),
        routes_visible: Array.from(G.visibleRealtimeRouteIds), // NEW
        options: G.currentMapOptions,
        colors: G.assignedRouteColors
    });
}

export function saveStateToLocalStorage() {
    console.log("saveStateToLocalStorage: SAVING. Current state from G:", {
        operators: Array.from(G.selectedOperatorIds),
        routes_selected: Array.from(G.selectedRealtimeRouteIds),
        routes_visible: Array.from(G.visibleRealtimeRouteIds), // NEW
        options: G.currentMapOptions,
        colors: G.assignedRouteColors
    });
    localStorage.setItem('selectedOperatorIds', JSON.stringify(Array.from(G.selectedOperatorIds)));
    localStorage.setItem('selectedRealtimeRouteIds', JSON.stringify(Array.from(G.selectedRealtimeRouteIds)));
    localStorage.setItem('visibleRealtimeRouteIds', JSON.stringify(Array.from(G.visibleRealtimeRouteIds))); // NEW
    localStorage.setItem('currentMapOptions', JSON.stringify(G.currentMapOptions));
    localStorage.setItem('assignedRouteColors', JSON.stringify(G.assignedRouteColors)); // Save route colors
    console.log("saveStateToLocalStorage: FINISHED.");
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

    const oldSelectedOperatorIds = new Set(G.selectedOperatorIds); // Store old set before update
    G.setSelectedOperatorIds(newSelectedOperatorIds); // Update global state
    G.operatorsModal.style.display = "none";

    // Determine which routes are still valid based on the new operator selection
    const updatedSelectedRoutes = new Set();
    G.selectedRealtimeRouteIds.forEach(routeId => {
        const agencyId = routeId.split('_')[0];
        if (G.selectedOperatorIds.has(agencyId)) {
            updatedSelectedRoutes.add(routeId);
        }
    });

    // Update selected routes and visible routes simultaneously
    const oldSelectedRouteIds = new Set(G.selectedRealtimeRouteIds); // Store old set
    G.setSelectedRealtimeRouteIds(updatedSelectedRoutes); // Update global state

    // NEW: Filter visible routes based on the new selected routes, and add any *newly selected* routes as visible by default
    const newVisibleRealtimeRouteIds = new Set();
    G.visibleRealtimeRouteIds.forEach(routeId => {
        if (G.selectedRealtimeRouteIds.has(routeId)) {
            newVisibleRealtimeRouteIds.add(routeId); // Keep visible if still selected
        }
    });
    // Add any brand new selections as visible by default
     G.selectedRealtimeRouteIds.forEach(routeId => {
         if (!oldSelectedRouteIds.has(routeId)) {
             newVisibleRealtimeRouteIds.add(routeId);
         }
     });
    G.setVisibleRealtimeRouteIds(newVisibleRealtimeRouteIds); // Update global state


    saveStateToLocalStorage();
    console.log("Operators selection saved (G.selectedOperatorIds):", Array.from(G.selectedOperatorIds));
    console.log("Routes selection updated (G.selectedRealtimeRouteIds):", Array.from(G.selectedRealtimeRouteIds));
    console.log("Routes visibility updated (G.visibleRealtimeRouteIds):", Array.from(G.visibleRealtimeRouteIds));

    G.btnRoutes.disabled = G.selectedOperatorIds.size === 0;
    await updateMapData(); // from map_data_layer.js (will now use the updated G.selectedRealtimeRouteIds and G.visibleRealtimeRouteIds)
}


export async function openRoutesModal() {
    console.log("openRoutesModal: CLICKED.");
    if (!G.routeSearchInput || !G.routesModal) {
        console.error("Route modal elements not found in G."); return;
    }
    if (G.selectedOperatorIds.size === 0) {
        alert("Please select an operator first.");
        return;
    }
    console.log("Opening Routes Modal for operators (G.selectedOperatorIds):", Array.from(G.selectedOperatorIds).join(','));
    G.routeSearchInput.value = ''; // Clear search

    try {
        const agencyIdsParam = Array.from(G.selectedOperatorIds).join(',');
        const response = await fetch(`/api/routes_by_agency?agency_ids=${agencyIdsParam}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const fetchedRoutes = await response.json();
        G.setAllFetchedRoutesForCurrentOperators(fetchedRoutes); // Update global cache

        // Assign colors if not already assigned (only for routes loaded for the currently selected operators)
        const tempAssignedColors = { ...G.assignedRouteColors }; // Work on a copy
        G.allFetchedRoutesForCurrentOperators.forEach(route => {
            if (!tempAssignedColors[route.realtime_id]) {
                 let hash = 0;
                 // Use a simple hash of the realtime_id to pick a color deterministically
                 for (let i = 0; i < route.realtime_id.length; i++) {
                     hash = route.realtime_id.charCodeAt(i) + ((hash << 5) - hash);
                     hash = hash & hash; // Convert to 32bit integer
                 }
                 tempAssignedColors[route.realtime_id] = G.ROUTE_COLORS[Math.abs(hash) % G.ROUTE_COLORS.length];
             }
        });
        G.setAssignedRouteColors(tempAssignedColors); // Update global colors

        populateRoutesModalLists(); // This function will use G.allFetchedRoutesForCurrentOperators
        G.routesModal.style.display = "block";
    } catch (error) {
        console.error("Error fetching or populating routes:", error);
        G.setAllFetchedRoutesForCurrentOperators([]); // Clear cache on error
        alert("Could not load route list. Please try again.");
    }
}

export function populateRoutesModalLists() {
    console.log("populateRoutesModalLists: STARTED.");
    if (!G.selectedRoutesListDiv || !G.availableRoutesListDiv || !G.routeSearchInput) {
        console.error("Route modal list elements not found in G."); return;
    }
    G.selectedRoutesListDiv.innerHTML = '';
    G.availableRoutesListDiv.innerHTML = '';
    const searchTerm = G.routeSearchInput.value.toLowerCase();

    // Sort allFetchedRoutesForCurrentOperators: selected first, then numerically/alphabetically
    const sortedRoutes = [...G.allFetchedRoutesForCurrentOperators].sort((a, b) => {
        const aSelected = G.selectedRealtimeRouteIds.has(a.realtime_id);
        const bSelected = G.selectedRealtimeRouteIds.has(b.realtime_id);
        if (aSelected && !bSelected) return -1; // a comes first (selected)
        if (!aSelected && bSelected) return 1;  // b comes first (selected)

        // Both selected or both not selected, sort by short_name
        const aParts = a.short_name.split(/[/\s]/); // Split by / or space for better numeric sorting
        const bParts = b.short_name.split(/[/\s]/);
        const aNum = parseInt(aParts[0], 10);
        const bNum = parseInt(bParts[0], 10);

        if (!isNaN(aNum) && !isNaN(bNum) && aNum !== bNum) return aNum - bNum; // Sort primarily by leading number
        return a.short_name.localeCompare(b.short_name); // Fallback to alphanumeric
    });


    sortedRoutes.forEach(route => {
        // Filter based on search term (match short name, long name, or realtime_id)
        const routeDisplayName = `${route.short_name} - ${route.long_name || 'No description'} (Agency: ${route.agency_id})`;
        if (searchTerm && !routeDisplayName.toLowerCase().includes(searchTerm) && !route.realtime_id.toLowerCase().includes(searchTerm)) {
            return; // Skip this route if it doesn't match search
        }

        // Use a div as a container for better layout control
        const routeItemDiv = document.createElement('div');
        // routeItemDiv.className = 'modal-route-item'; // Add a class for styling if needed

        const label = document.createElement('label');
        // label.style.display = 'flex'; // Use flexbox for alignment inside label
        // label.style.alignItems = 'center';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = route.realtime_id;
        checkbox.dataset.shortName = route.short_name; // Store for display if needed
        checkbox.checked = G.selectedRealtimeRouteIds.has(route.realtime_id); // Check based on SELECTED status

        // Create color dot
        const colorDot = document.createElement('span');
        colorDot.className = 'route-color-dot';
        colorDot.style.backgroundColor = G.assignedRouteColors[route.realtime_id] || G.ROUTE_COLORS[0]; // Fallback color

        // Append elements to label, then label to div
        label.appendChild(colorDot);
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(` ${route.short_name} - ${route.long_name || 'No description'} (Agency: ${route.agency_id})`));

        routeItemDiv.appendChild(label);

        // Add event listener directly to the checkbox for selection change
        checkbox.addEventListener('change', (event) => {
            const routeId = event.target.value;
            const isChecked = event.target.checked;
            const tempSelectedRoutes = new Set(G.selectedRealtimeRouteIds); // Work on a copy of Selected set
            const tempVisibleRoutes = new Set(G.visibleRealtimeRouteIds); // Work on a copy of Visible set

            if (isChecked) {
                tempSelectedRoutes.add(routeId);
                tempVisibleRoutes.add(routeId); // Also make newly selected routes visible by default
            } else {
                tempSelectedRoutes.delete(routeId);
                tempVisibleRoutes.delete(routeId); // Deselecting means hiding
            }

            G.setSelectedRealtimeRouteIds(tempSelectedRoutes); // Update global Selected state
            G.setVisibleRealtimeRouteIds(tempVisibleRoutes); // Update global Visible state

            // Re-populate lists to move items between 'Selected' and 'Available' sections
            populateRoutesModalLists(); // Recalculates list based on G.selectedRealtimeRouteIds
        });

        if (checkbox.checked) {
            G.selectedRoutesListDiv.appendChild(routeItemDiv);
        } else {
            G.availableRoutesListDiv.appendChild(routeItemDiv);
        }
    });
    console.log("populateRoutesModalLists: FINISHED.");
}

export function filterAvailableRoutes() {
    console.log("filterAvailableRoutes: Input changed. Re-populating lists.");
    // This function is triggered by input, it just calls populateRoutesModalLists
    // which handles the filtering based on the current input value.
    populateRoutesModalLists();
}

export async function handleSaveRoutes() {
    console.log("handleSaveRoutes: CLICKED.");
    if (!G.routesModal) { console.error("Routes modal not found in G."); return; }

    // Note: The route selection logic and visible state updates
    // already happened within the checkbox change listeners in populateRoutesModalLists.
    // We just need to save the state and update the map now.

    saveStateToLocalStorage(); // Save G.selectedRealtimeRouteIds and G.visibleRealtimeRouteIds, G.assignedRouteColors
    G.routesModal.style.display = "none";
    console.log("Routes selection saved (G.selectedRealtimeRouteIds):", Array.from(G.selectedRealtimeRouteIds));
    console.log("Routes visibility saved (G.visibleRealtimeRouteIds):", Array.from(G.visibleRealtimeRouteIds));

    await updateMapData(); // from map_data_layer.js
}

export function openOptionsModal() {
    console.log("openOptionsModal: CLICKED.");
    if (!G.updateFrequencySelect || !G.toggleLiveTrackingCheckbox || !G.toggleRoutePathsCheckbox || !G.optionsModal) {
        console.error("Options modal elements not found in G."); return;
    }
    // Set modal values based on current state
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

    // Check if options actually changed to avoid unnecessary saves/updates
    const optionsChanged = G.currentMapOptions.updateIntervalMs !== newUpdateInterval ||
                           G.currentMapOptions.liveTrackingEnabled !== newLiveTracking ||
                           G.currentMapOptions.showRoutePathsEnabled !== newShowRoutePaths;


    if (optionsChanged) {
         // Update global currentMapOptions
         G.setCurrentMapOptions({
             updateIntervalMs: newUpdateInterval,
             liveTrackingEnabled: newLiveTracking,
             showRoutePathsEnabled: newShowRoutePaths
         });

         saveStateToLocalStorage();
         console.log("Map options saved (G.currentMapOptions):", G.currentMapOptions);

         // updateMapData will handle stopping/starting interval and showing/hiding paths
         await updateMapData();
     } else {
         console.log("Map options did not change. Skipping save and map update.");
     }

    G.optionsModal.style.display = "none";
}

console.log("map_state_modals.js: FINISHED PARSING.");