// static/map_state_modals.js
console.log("map_state_modals.js: PARSING.");

import * as G from './map_globals.js';
import { updateMapData } from './map_data_layer.js';

export function loadStateFromLocalStorage() {
    console.log("loadStateFromLocalStorage: STARTED");
    const storedOperatorIds = localStorage.getItem('selectedOperatorIds');
    const storedRouteIds = localStorage.getItem('selectedRealtimeRouteIds');
    const storedOptions = localStorage.getItem('currentMapOptions');
    const storedAssignedColors = localStorage.getItem('assignedRouteColors');

    let tempSelectedOperatorIds = new Set();
    if (storedOperatorIds) {
        try {
            tempSelectedOperatorIds = new Set(JSON.parse(storedOperatorIds));
        } catch (e) { console.error("Error parsing storedOperatorIds", e); localStorage.removeItem('selectedOperatorIds');}
    }
    G.setSelectedOperatorIds(tempSelectedOperatorIds);

    let tempSelectedRealtimeRouteIds = new Set();
    if (storedRouteIds) {
         try {
            tempSelectedRealtimeRouteIds = new Set(JSON.parse(storedRouteIds));
        } catch (e) { console.error("Error parsing storedRouteIds", e); localStorage.removeItem('selectedRealtimeRouteIds'); }
    }
    // Filter routes based on currently selected operators
    const validRoutesForSelectedOperators = new Set();
    tempSelectedRealtimeRouteIds.forEach(routeId => {
        const agencyId = routeId.split('_')[0];
        if (G.selectedOperatorIds.has(agencyId)) {
            validRoutesForSelectedOperators.add(routeId);
        } else {
            console.log(`loadStateFromLocalStorage: Removing route ${routeId} as its operator ${agencyId} is not in G.selectedOperatorIds.`);
        }
    });
    G.setSelectedRealtimeRouteIds(validRoutesForSelectedOperators);


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
            tempAssignedRouteColors = JSON.parse(storedAssignedColors);
        } catch (e) { console.error("Error parsing storedAssignedColors", e); localStorage.removeItem('assignedRouteColors');}
    }
    G.setAssignedRouteColors(tempAssignedRouteColors);


    console.log("loadStateFromLocalStorage: FINISHED. State loaded into G:", {
        operators: Array.from(G.selectedOperatorIds),
        routes: Array.from(G.selectedRealtimeRouteIds),
        options: G.currentMapOptions,
        colors: G.assignedRouteColors
    });
}

export function saveStateToLocalStorage() {
    console.log("saveStateToLocalStorage: SAVING. Current state from G:", {
        operators: Array.from(G.selectedOperatorIds),
        routes: Array.from(G.selectedRealtimeRouteIds),
        options: G.currentMapOptions,
        colors: G.assignedRouteColors
    });
    localStorage.setItem('selectedOperatorIds', JSON.stringify(Array.from(G.selectedOperatorIds)));
    localStorage.setItem('selectedRealtimeRouteIds', JSON.stringify(Array.from(G.selectedRealtimeRouteIds)));
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

    const deselectedOperators = new Set([...G.selectedOperatorIds].filter(x => !newSelectedOperatorIds.has(x)));
    G.setSelectedOperatorIds(newSelectedOperatorIds); // Update global state
    G.operatorsModal.style.display = "none";

    // If any operators were deselected, remove their routes from selectedRealtimeRouteIds
    if (deselectedOperators.size > 0) {
        const updatedSelectedRoutes = new Set();
        G.selectedRealtimeRouteIds.forEach(routeId => {
            const agencyId = routeId.split('_')[0];
            if (!deselectedOperators.has(agencyId)) {
                updatedSelectedRoutes.add(routeId);
            }
        });
        G.setSelectedRealtimeRouteIds(updatedSelectedRoutes); // Update global state
    }
    
    saveStateToLocalStorage();
    console.log("Operators selection saved (G.selectedOperatorIds):", Array.from(G.selectedOperatorIds));
    G.btnRoutes.disabled = G.selectedOperatorIds.size === 0;
    await updateMapData(); // from map_data_layer.js
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

        // Assign colors if not already assigned
        const tempAssignedColors = { ...G.assignedRouteColors }; // Work on a copy
        G.allFetchedRoutesForCurrentOperators.forEach(route => {
            if (!tempAssignedColors[route.realtime_id]) {
                let hash = 0;
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
        if (aSelected && !bSelected) return -1; // a comes first
        if (!aSelected && bSelected) return 1;  // b comes first

        // Both selected or both not selected, sort by name
        const aParts = a.short_name.split('/');
        const bParts = b.short_name.split('/');
        const aNum = parseInt(aParts[0], 10);
        const bNum = parseInt(bParts[0], 10);

        if (!isNaN(aNum) && !isNaN(bNum) && aNum !== bNum) return aNum - bNum;
        return a.short_name.localeCompare(b.short_name);
    });

    sortedRoutes.forEach(route => {
        const routeDisplayName = `${route.short_name} - ${route.long_name || 'No description'}`;
        // Filter based on search term
        if (searchTerm && !routeDisplayName.toLowerCase().includes(searchTerm) && !route.realtime_id.toLowerCase().includes(searchTerm)) {
            return; // Skip this route if it doesn't match search
        }

        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = route.realtime_id;
        checkbox.dataset.shortName = route.short_name; // Store for display if needed
        checkbox.checked = G.selectedRealtimeRouteIds.has(route.realtime_id);
        
        checkbox.addEventListener('change', (event) => {
            const tempSelectedRoutes = new Set(G.selectedRealtimeRouteIds); // Work on a copy
            if (event.target.checked) {
                tempSelectedRoutes.add(event.target.value);
            } else {
                tempSelectedRoutes.delete(event.target.value);
            }
            G.setSelectedRealtimeRouteIds(tempSelectedRoutes); // Update global state
            populateRoutesModalLists(); // Re-populate to move item between lists
        });

        const colorDot = document.createElement('span');
        colorDot.className = 'route-color-dot';
        colorDot.style.backgroundColor = G.assignedRouteColors[route.realtime_id] || G.ROUTE_COLORS[0]; // Fallback color
        
        label.appendChild(colorDot);
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(` ${routeDisplayName} (Agency: ${route.agency_id})`));

        if (checkbox.checked) {
            G.selectedRoutesListDiv.appendChild(label);
        } else {
            G.availableRoutesListDiv.appendChild(label);
        }
    });
    console.log("populateRoutesModalLists: FINISHED.");
}

export function filterAvailableRoutes() {
    console.log("filterAvailableRoutes: Input changed.");
    populateRoutesModalLists();
}

export async function handleSaveRoutes() {
    console.log("handleSaveRoutes: CLICKED.");
    if (!G.routesModal) { console.error("Routes modal not found in G."); return; }
    saveStateToLocalStorage(); // Save G.selectedRealtimeRouteIds and G.assignedRouteColors
    G.routesModal.style.display = "none";
    console.log("Routes selection saved (G.selectedRealtimeRouteIds):", Array.from(G.selectedRealtimeRouteIds));
    await updateMapData(); // from map_data_layer.js
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

    // Update global currentMapOptions
    G.setCurrentMapOptions({
        updateIntervalMs: newUpdateInterval,
        liveTrackingEnabled: newLiveTracking,
        showRoutePathsEnabled: newShowRoutePaths
    });

    saveStateToLocalStorage();
    G.optionsModal.style.display = "none";
    console.log("Map options saved (G.currentMapOptions):", G.currentMapOptions);
    await updateMapData(); // from map_data_layer.js
}

console.log("map_state_modals.js: FINISHED PARSING.");