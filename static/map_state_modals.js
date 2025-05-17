// static/map_state_modals.js
console.log("map_state_modals.js: PARSING.");

import * as G from './map_globals.js';
import { updateMapData, populateSidebar, toggleRouteVisibility, renderRoutePreviewInModal } from './map_data_layer.js'; // Added renderRoutePreviewInModal

export function loadStateFromLocalStorage() {
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
    G.setAssignedRouteColors(tempAssignedRouteColors);

    console.log("loadStateFromLocalStorage: FINISHED. State loaded into G:", {
        operators: Array.from(G.selectedOperatorIds),
        routes_selected: Array.from(G.selectedRealtimeRouteIds),
        routes_visible: Array.from(G.visibleRealtimeRouteIds),
        options: G.currentMapOptions,
        colors: G.assignedRouteColors
    });
}

export function saveStateToLocalStorage() {
    console.log("saveStateToLocalStorage: SAVING. Current state from G:", {
        operators: Array.from(G.selectedOperatorIds),
        routes_selected: Array.from(G.selectedRealtimeRouteIds),
        routes_visible: Array.from(G.visibleRealtimeRouteIds),
        options: G.currentMapOptions,
        colors: G.assignedRouteColors
    });
    localStorage.setItem('selectedOperatorIds', JSON.stringify(Array.from(G.selectedOperatorIds)));
    localStorage.setItem('selectedRealtimeRouteIds', JSON.stringify(Array.from(G.selectedRealtimeRouteIds)));
    localStorage.setItem('visibleRealtimeRouteIds', JSON.stringify(Array.from(G.visibleRealtimeRouteIds)));
    localStorage.setItem('currentMapOptions', JSON.stringify(G.currentMapOptions));
    localStorage.setItem('assignedRouteColors', JSON.stringify(G.assignedRouteColors));
    console.log("saveStateToLocalStorage: FINISHED.");
}

export async function openOperatorsModal() {
    console.log("openOperatorsModal: CLICKED.");
    if (!G.operatorsListDiv || !G.operatorsModal) return;
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
    if (!G.operatorsListDiv || !G.operatorsModal || !G.btnRoutes) return;

    const newSelectedOperatorIds = new Set();
    G.operatorsListDiv.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
        newSelectedOperatorIds.add(cb.value);
    });

    G.setSelectedOperatorIds(newSelectedOperatorIds);
    G.operatorsModal.style.display = "none";

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
         if (!oldSelectedRouteIds.has(routeId)) {
             newVisibleRealtimeRouteIds.add(routeId);
         }
     });
    G.setVisibleRealtimeRouteIds(newVisibleRealtimeRouteIds);

    saveStateToLocalStorage();
    G.btnRoutes.disabled = G.selectedOperatorIds.size === 0;
    await updateMapData();
}


export async function openRoutesModal() {
    console.log("openRoutesModal: CLICKED.");
    if (!G.routeSearchInput || !G.routesModal || !G.routePreviewContainerDiv) return;

    if (G.selectedOperatorIds.size === 0) {
        alert("Please select an operator first.");
        return;
    }
    G.routeSearchInput.value = '';
    G.setIsPreviewingRouteId(null); // Clear any previous preview
    G.routePreviewContainerDiv.innerHTML = 'Click an available route to preview its path.'; // Reset preview area


    try {
        const agencyIdsParam = Array.from(G.selectedOperatorIds).join(',');
        const response = await fetch(`/api/routes_by_agency?agency_ids=${agencyIdsParam}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const fetchedRoutes = await response.json();
        G.setAllFetchedRoutesForCurrentOperators(fetchedRoutes);

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
        G.setAssignedRouteColors(tempAssignedColors);

        populateRoutesModalLists();
        G.routesModal.style.display = "block";
    } catch (error) {
        console.error("Error fetching or populating routes:", error);
        G.setAllFetchedRoutesForCurrentOperators([]);
        alert("Could not load route list. Please try again.");
    }
}

export function populateRoutesModalLists() {
    console.log("populateRoutesModalLists: STARTED.");
    if (!G.selectedRoutesListDiv || !G.availableRoutesListDiv || !G.routeSearchInput || !G.availableRoutesCountSpan) return;

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

        // Use a div as a container for better layout control
        const routeItemDiv = document.createElement('div');
        routeItemDiv.className = 'modal-route-item'; // For styling clickable items

        const label = document.createElement('label');
        // label.style.display = 'flex'; // Use flexbox for alignment inside label
        // label.style.alignItems = 'center';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = route.realtime_id;
        checkbox.dataset.shortName = route.short_name;
        checkbox.checked = G.selectedRealtimeRouteIds.has(route.realtime_id);

        // Create color dot
        const colorDot = document.createElement('span');
        colorDot.className = 'route-color-dot';
        colorDot.style.backgroundColor = G.assignedRouteColors[route.realtime_id] || G.ROUTE_COLORS[0];

        // Append elements to label, then label to div
        label.appendChild(colorDot);
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(` ${route.short_name} - ${route.long_name || 'No description'}`)); // Simpler label for modal
        // label.appendChild(document.createTextNode(` ${routeDisplayName}`)); // Original fuller label

        routeItemDiv.appendChild(label);

        // Add event listener directly to the checkbox for selection change
        checkbox.addEventListener('change', (event) => {
            const routeId = event.target.value;
            const isChecked = event.target.checked;
            const tempSelectedRoutes = new Set(G.selectedRealtimeRouteIds);
            const tempVisibleRoutes = new Set(G.visibleRealtimeRouteIds);

            if (isChecked) {
                tempSelectedRoutes.add(routeId);
                tempVisibleRoutes.add(routeId);
            } else {
                tempSelectedRoutes.delete(routeId);
                tempVisibleRoutes.delete(routeId);
                 // If unchecking the route that is currently being previewed, clear the preview
                if (G.isPreviewingRouteId === routeId) {
                    G.setIsPreviewingRouteId(null);
                    if (G.routePreviewContainerDiv) G.routePreviewContainerDiv.innerHTML = 'Click an available route to preview its path.';
                }
            }
            G.setSelectedRealtimeRouteIds(tempSelectedRoutes);
            G.setVisibleRealtimeRouteIds(tempVisibleRoutes);
            populateRoutesModalLists(); // Re-populate to move item & update styling/counts
        });


        if (checkbox.checked) {
            G.selectedRoutesListDiv.appendChild(routeItemDiv);
        } else {
            availableCount++;
            // Make the entire available route item div clickable for preview
            routeItemDiv.addEventListener('click', (event) => {
                // Prevent checkbox from toggling if clicking on the div for preview
                // Allow click on checkbox itself to proceed normally
                if (event.target.type !== 'checkbox') {
                    event.preventDefault(); // Stop label from checking checkbox
                    const routeId = route.realtime_id; // Get routeId from the closure

                    // Remove 'previewing' class from previously previewed item
                    const currentlyPreviewingItem = G.availableRoutesListDiv.querySelector('.previewing');
                    if (currentlyPreviewingItem) {
                        currentlyPreviewingItem.classList.remove('previewing');
                    }

                    if (G.isPreviewingRouteId === routeId) { // Clicking same route again
                        G.setIsPreviewingRouteId(null);
                        if(G.routePreviewContainerDiv) G.routePreviewContainerDiv.innerHTML = 'Click an available route to preview its path.';
                    } else {
                        G.setIsPreviewingRouteId(routeId);
                        routeItemDiv.classList.add('previewing'); // Add class to current item
                        if(G.routePreviewContainerDiv) G.routePreviewContainerDiv.innerHTML = `Loading preview for ${route.short_name}...`;
                        renderRoutePreviewInModal(routeId, G.routePreviewContainerDiv); // Call preview render
                    }
                }
            });
            // Add 'previewing' class if this route is currently being previewed
            if (G.isPreviewingRouteId === route.realtime_id) {
                routeItemDiv.classList.add('previewing');
            }
            G.availableRoutesListDiv.appendChild(routeItemDiv);
        }
    });
    G.availableRoutesCountSpan.textContent = `(${availableCount})`;
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
    if (!G.routesModal) return;
    saveStateToLocalStorage();
    G.routesModal.style.display = "none";
    G.setIsPreviewingRouteId(null); // Clear preview state when saving
    if (G.routePreviewContainerDiv) G.routePreviewContainerDiv.innerHTML = 'Click an available route to preview its path.'; // Reset preview on save
    await updateMapData();
}

export function openOptionsModal() {
    console.log("openOptionsModal: CLICKED.");
    if (!G.updateFrequencySelect || !G.toggleLiveTrackingCheckbox || !G.toggleRoutePathsCheckbox || !G.optionsModal) return;
    G.updateFrequencySelect.value = G.currentMapOptions.updateIntervalMs.toString();
    G.toggleLiveTrackingCheckbox.checked = G.currentMapOptions.liveTrackingEnabled;
    G.toggleRoutePathsCheckbox.checked = G.currentMapOptions.showRoutePathsEnabled;
    G.optionsModal.style.display = "block";
}

export async function handleSaveOptions() {
    console.log("handleSaveOptions: CLICKED.");
     if (!G.updateFrequencySelect || !G.toggleLiveTrackingCheckbox || !G.toggleRoutePathsCheckbox || !G.optionsModal) return;

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
         await updateMapData();
     }
    G.optionsModal.style.display = "none";
}

console.log("map_state_modals.js: FINISHED PARSING.");