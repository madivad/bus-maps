// static/map_globals.js
console.log("map_globals.js: PARSING.");

// --- Map Core Variables ---
export let map;
export let busMarkerObjects = {};
export let routePolylines = {};
export let animationFrameId = null;
export let dataFetchIntervalId = null;

// --- Application State Variables ---
export let selectedOperatorIds = new Set();
export let selectedRealtimeRouteIds = new Set();
export const ROUTE_COLORS = ['#FF5733', '#3375FF', '#33FF57', '#FFC300', '#C70039', '#900C3F', '#581845', '#FF8C00', '#00CED1', '#DA70D6', '#20B2AA', '#FF4500', '#4682B4', '#8A2BE2', '#D2691E'];
export let assignedRouteColors = {}; // route_id -> color string
export let currentMapOptions = {
    updateIntervalMs: 20000, // Default value
    liveTrackingEnabled: true,
    showRoutePathsEnabled: true
};
export let allFetchedRoutesForCurrentOperators = []; // Cache for routes modal

// --- DOM Element References ---
// These will be initialized in map_init.js
export let btnOperators, btnRoutes, btnOptions;
export let operatorsModal, routesModal, optionsModal;
export let closeOperatorsModalBtn, closeRoutesModalBtn, closeOptionsModalBtn;
export let operatorsListDiv, saveOperatorsBtn;
export let selectedRoutesListDiv, availableRoutesListDiv, saveRoutesBtn, routeSearchInput;
export let mapTitleH3;
export let updateFrequencySelect, toggleLiveTrackingCheckbox, toggleRoutePathsCheckbox, saveOptionsBtn;
export let timerDisplayElement;

// -- Styles for overlaying routes and making them more visible
export const DEFAULT_POLYLINE_OPACITY = 0.35;
export const DEFAULT_POLYLINE_WEIGHT = 5;
export const DEFAULT_POLYLINE_ZINDEX = 1;

// Styles for highlighted route
export const HIGHLIGHTED_POLYLINE_OPACITY = 0.9;
export const HIGHLIGHTED_POLYLINE_WEIGHT = 7;
export const HIGHLIGHTED_POLYLINE_ZINDEX = 5;

// Styles for de-emphasized (other) routes when one is highlighted
export const DEEMPHASIZED_POLYLINE_OPACITY = 0.15;
export const DEEMPHASIZED_POLYLINE_WEIGHT = 4;
export const DEEMPHASIZED_POLYLINE_ZINDEX = DEFAULT_POLYLINE_ZINDEX;
// DEEMPHASIZED_POLYLINE_ZINDEX can remain DEFAULT_POLYLINE_ZINDEX

// State variable to track the currently highlighted route
export let currentlyHighlightedRouteId = null;
export function setCurrentlyHighlightedRouteId(routeId) { currentlyHighlightedRouteId = routeId; }

// --- Countdown Timer Variables ---
export const ANIMATION_DURATION_FACTOR = 0.5; // Animate for 90% of the update interval
export const JS_DATA_REFRESH_INTERVAL_SECONDS = 10;
export const FETCH_API_AT_COUNT = 1; // Fetch when countdown reaches this value
export let countdownValue = JS_DATA_REFRESH_INTERVAL_SECONDS;
export let countdownIntervalId = null;
export let isFetchingApiData = false; // Flag to prevent concurrent early fetches

// --- InfoWindow Management ---
export let currentlyOpenInfoWindow = null;
export function setCurrentlyOpenInfoWindow(iw) { 
    // console.log("Setting currentlyOpenInfoWindow to:", iw); // Optional debug
    currentlyOpenInfoWindow = iw; 
}

// --- Functions to update exported let variables (since direct import assignment is not allowed for `let`) ---
// For simple types or re-assignable objects
export function setMap(newMap) { map = newMap; }
export function setBusMarkerObjects(newObj) { busMarkerObjects = newObj; }
export function setRoutePolylines(newObj) { routePolylines = newObj; }
export function setAnimationFrameId(id) { animationFrameId = id; }
export function setDataFetchIntervalId(id) { dataFetchIntervalId = id; }
export function setSelectedOperatorIds(newSet) { selectedOperatorIds = newSet; }
export function setSelectedRealtimeRouteIds(newSet) { selectedRealtimeRouteIds = newSet; }
export function setAssignedRouteColors(newObj) { assignedRouteColors = newObj; }
export function setCurrentMapOptions(newOptions) { currentMapOptions = newOptions; }
export function setAllFetchedRoutesForCurrentOperators(newArray) { allFetchedRoutesForCurrentOperators = newArray; }

export function setBtnOperators(el) { btnOperators = el; }
export function setBtnRoutes(el) { btnRoutes = el; }
export function setBtnOptions(el) { btnOptions = el; }
export function setOperatorsModal(el) { operatorsModal = el; }
export function setRoutesModal(el) { routesModal = el; }
export function setOptionsModal(el) { optionsModal = el; }
export function setCloseOperatorsModalBtn(el) { closeOperatorsModalBtn = el; }
export function setCloseRoutesModalBtn(el) { closeRoutesModalBtn = el; }
export function setCloseOptionsModalBtn(el) { closeOptionsModalBtn = el; }
export function setOperatorsListDiv(el) { operatorsListDiv = el; }
export function setSaveOperatorsBtn(el) { saveOperatorsBtn = el; }
export function setSelectedRoutesListDiv(el) { selectedRoutesListDiv = el; }
export function setAvailableRoutesListDiv(el) { availableRoutesListDiv = el; }
export function setSaveRoutesBtn(el) { saveRoutesBtn = el; }
export function setRouteSearchInput(el) { routeSearchInput = el; }
export function setMapTitleH3(el) { mapTitleH3 = el; }
export function setUpdateFrequencySelect(el) { updateFrequencySelect = el; }
export function setToggleLiveTrackingCheckbox(el) { toggleLiveTrackingCheckbox = el; }
export function setToggleRoutePathsCheckbox(el) { toggleRoutePathsCheckbox = el; }
export function setSaveOptionsBtn(el) { saveOptionsBtn = el; }
export function setTimerDisplayElement(el) { timerDisplayElement = el; }

export function setCountdownValue(val) { countdownValue = val; }
export function setCountdownIntervalId(id) { countdownIntervalId = id; }
export function setIsFetchingApiData(val) { isFetchingApiData = val; }


console.log("map_globals.js: FINISHED PARSING.");