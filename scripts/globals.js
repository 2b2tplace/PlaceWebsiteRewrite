new Q5("global");

// Camera and viewport
let camera = { x: 0, y: 0, zoom: 0.004 };
let targetCam = { x: null, y: null, zoom: null };
let intendedCamZoom = 0.004;
let lastCamX = 0, lastCamY = 0;
let smoothCamVel = 0;
let cameraVel = 0;
let inertiaVel = { x: 0, y: 0 };
let friction = 0.9;
let isDraggingMap = false;
let isTrackpad = false;
let timeOfLastPan = Date.now();
let originalMouseX, originalMouseY, originalCameraX, originalCameraY;
let mouseScrollX = 0, mouseScrollY = 0;

// Map and tiles
let currentDimension = 0;
let lod;
let tileCache = {};
let tilesToDraw = [];
let inFlightRequests = new Set();
let activeTileKeys = new Set();
let parallax = 0.5;
let overlayOpacity = 1;
let solidBitmap;
let retintQueue = new Set();
let isRetintingQueue = false;
const tileTintCanvas = document.createElement('canvas');
const tileTintCtx = tileTintCanvas.getContext('2d');
const LOD_ADD = Math.log2(1.33);
const LOD_MULTIPLY = 1.058;

// Layers
let currentLayerSettings;
let layers = {
	"New Chunks": {
		icon: "chunkhighlights", visible: false, defaultVisible: false, type: 'newchunks',
		settings: {
			Opacity: { icon: "opacity", type: "slider", value: 0.5, defaultValue: 0.5 },
			Color: { icon: "brush", type: "colorpicker", value: { r: 255, g: 0, b: 0, h: 0, s: 1, v: 1 }, defaultValue: { r: 255, g: 0, b: 0, h: 0, s: 1, v: 1 } },
			Invert: { icon: "invert", type: "toggle", value: false, defaultValue: false }
		}
	},
	"Obsidian": {
		icon: "obsidian", visible: true, defaultVisible: true, type: 'overlay',
		settings: {
			Opacity: { icon: "opacity", type: "slider", value: 1, defaultValue: 1 },
			Parallax: { icon: "parallax", type: "toggle", value: true, defaultValue: true }
		}
	},
	"World": {
		icon: "world", visible: true, defaultVisible: true, type: 'base',
		settings: {
			Opacity: { icon: "opacity", type: "slider", value: 1, defaultValue: 1 }
		}
	},
	"Background": {
		icon: "2d", visible: true, defaultVisible: true, type: "background",
		settings: {
			Color: { icon: "brush", type: "colorpicker", value: { r: 0, g: 0, b: 0, h: 0, s: 0, v: 0 }, defaultValue: { r: 0, g: 0, b: 0, h: 0, s: 0, v: 0 } }
		}
	}
};

// Markers and pins
let tempMarkers = [];
let activeHoveredMarker = null;
let editingMarker = null;
let selectedMarkerColor = 'Red';
const markerColors = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple', 'Pink'];
let markerIcons = {};
let pinIcon;
let pinEnd;
let rightClickCoords = { x: 0, z: 0 };

// Search and atlas
let allAtlasLocations = [];
let atlasLocations = [];
let cachedClusters = [];
let lastClusterCamX, lastClusterCamY, lastClusterZoom, lastClusterDim;
const CLUSTER_RADIUS_PIXELS = 60;
let recentSearches = [];
let searchInput;
let searchPanel;
let selectedSuggestionIndex = 0;
let currentSuggestions = [];
let itemHeight = 60;
let searchPanelVisibleCount = 10;
let lastSearchQuery = "";
let searchClickX, searchClickY;
let renderSuggestions;
let isFilterMode = false;
let isSelectingSuggestion = false;
let filterSettings = {
	radius: { icon: "radius", type: "slider", value: 1000, defaultValue: 1000, min: 5, max: 50000 }
};
const dimensionOptions = [
	{ id: 'overworld', name: 'Overworld Coordinates', icon: 'world' },
	{ id: 'nether', name: 'Nether Coordinates', icon: 'obsidian' },
	{ id: 'end', name: 'End Coordinates', icon: 'enderchest' }
];

// UI and misc things
let uiElements = {};
let coordinateText, coordinateTextNether;
let layersButton;
let layersettings;
let changeListeners = [];
let poppins;
let debugGrid = false;
let lastDisplayX = null, lastDisplayY = null;
let copyLinkSettings = {
	"Include All": false, "Layer Settings": false, "Current Search": false,
	"Temporary Markers": false, "Keep Existing URL Parameters": false
};