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
export let visibleRealtimeRouteIds = new Set();
export const ROUTE_COLORS = ['#FF5733', '#3375FF', '#33FF57', '#FFC300', '#C70039', '#900C3F', '#581845', '#FF8C00', '#00CED1', '#DA70D6', '#20B2AA', '#FF4500', '#4682B4', '#8A2BE2', '#D2691E'];
export let assignedRouteColors = {};
export let currentMapOptions = {
    updateIntervalMs: 20000,
    liveTrackingEnabled: true,
    showRoutePathsEnabled: true
};
export let allFetchedRoutesForCurrentOperators = [];
export let isPreviewingRouteId = null;
// --- DOM Element References ---
export let btnOperators, btnRoutes, btnOptions;
export let operatorsModal, routesModal, optionsModal;
export let closeOperatorsModalBtn, closeRoutesModalBtn, closeOptionsModalBtn;
export let operatorsListDiv, saveOperatorsBtn;
export let selectedRoutesListDiv, availableRoutesListDiv, saveRoutesBtn, routeSearchInput;
export let mapTitleH3;
export let updateFrequencySelect, toggleLiveTrackingCheckbox, toggleRoutePathsCheckbox, saveOptionsBtn;
export let timerDisplayElement;
export let sidebarDiv, sidebarRoutesListDiv;
export let routePreviewContainerDiv; 
export let availableRoutesCountSpan; 
export let isSidebarVisible = true; // Default to visible, will be overridden by localStorage
export let sidebarToggleBtn;

// --- Polyline Style Constants ---
export const DEFAULT_POLYLINE_OPACITY = 0.35;
export const DEFAULT_POLYLINE_WEIGHT = 5;
export const DEFAULT_POLYLINE_ZINDEX = 1;
export const HIGHLIGHTED_POLYLINE_OPACITY = 0.9;
export const HIGHLIGHTED_POLYLINE_WEIGHT = 5;
export const HIGHLIGHTED_POLYLINE_ZINDEX = 5;
export const DEEMPHASIZED_POLYLINE_OPACITY = 0.15;
export const DEEMPHASIZED_POLYLINE_WEIGHT = 3;
export const DEEMPHASIZED_POLYLINE_ZINDEX = DEFAULT_POLYLINE_ZINDEX;

export let currentlyHighlightedRouteId = null;
export function setCurrentlyHighlightedRouteId(routeId) { currentlyHighlightedRouteId = routeId; }

// --- Countdown Timer Variables ---
export const ANIMATION_DURATION_FACTOR = 0.5;
export const JS_DATA_REFRESH_INTERVAL_SECONDS = 10;
export const FETCH_API_AT_COUNT = 1;
export let countdownValue = JS_DATA_REFRESH_INTERVAL_SECONDS;
export let countdownIntervalId = null;
export let isFetchingApiData = false;

export let currentlyOpenInfoWindow = null;
export function setCurrentlyOpenInfoWindow(iw) { currentlyOpenInfoWindow = iw; }

export function setMap(newMap) { map = newMap; }
export function setBusMarkerObjects(newObj) { busMarkerObjects = newObj; }
export function setRoutePolylines(newObj) { routePolylines = newObj; }
export function setAnimationFrameId(id) { animationFrameId = id; }
export function setDataFetchIntervalId(id) { dataFetchIntervalId = id; }
export function setSelectedOperatorIds(newSet) { selectedOperatorIds = newSet; }
export function setSelectedRealtimeRouteIds(newSet) { selectedRealtimeRouteIds = newSet; }
export function setVisibleRealtimeRouteIds(newSet) { visibleRealtimeRouteIds = newSet; }
export function setAssignedRouteColors(newObj) { assignedRouteColors = newObj; }
export function setCurrentMapOptions(newOptions) { currentMapOptions = newOptions; }
export function setAllFetchedRoutesForCurrentOperators(newArray) { allFetchedRoutesForCurrentOperators = newArray; }
export function setIsPreviewingRouteId(routeId) { isPreviewingRouteId = routeId; } 

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
export function setSidebarDiv(el) { sidebarDiv = el; }
export function setSidebarRoutesListDiv(el) { sidebarRoutesListDiv = el; }
export function setRoutePreviewContainerDiv(el) { routePreviewContainerDiv = el; }
export function setAvailableRoutesCountSpan(el) { availableRoutesCountSpan = el; }
export function setIsSidebarVisible(isVisible) { isSidebarVisible = isVisible; }
export function setSidebarToggleBtn(el) { sidebarToggleBtn = el; }


export function setCountdownValue(val) { countdownValue = val; }
export function setCountdownIntervalId(id) { countdownIntervalId = id; }
export function setIsFetchingApiData(val) { isFetchingApiData = val; }

console.log("map_globals.js: FINISHED PARSING.");