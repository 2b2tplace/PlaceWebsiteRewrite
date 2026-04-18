new Q5("global");

let originalMouseX, originalMouseY, originalCameraX, originalCameraY;
let lastCamX = 0, lastCamY = 0;
let lastDisplayX = null, lastDisplayY = null;
let smoothCamVel = 0;
let lod;
let isDraggingMap = false;
let camera = { x: 0, y: 0, zoom: 0.004 };
let targetCam = { x: null, y: null, zoom: null };
let rightClickCoords = { x: 0, z: 0 };
let intendedCamZoom = 0.004;
let inertiaVel = { x: 0, y: 0 };
let friction = 0.9;
let tileCache = {};
let cameraVel = 0;
let isTrackpad = false;
let timeOfLastPan = Date.now();
let mouseScrollX = 0, mouseScrollY = 0;
let uiElements = {}
let tilesToDraw = [];
let inFlightRequests = new Set();
let activeTileKeys = new Set();
let currentDimension = 0;
let parallax = 0.5;
let overlayOpacity = 1;
let changeListeners = [];
let currentLayerSettings;
let poppins;
let debugGrid = false;
let solidBitmap;
const tileTintCanvas = document.createElement('canvas');
const tileTintCtx = tileTintCanvas.getContext('2d');
let layers = {
	"New Chunks": {
		icon: "chunkhighlights",
		visible: false, defaultVisible: false,
		type: 'newchunks',
		settings: {
			Opacity: { icon: "opacity", type: "slider", value: 0.5, defaultValue: 0.5 },
			Color: { icon: "brush", type: "colorpicker", value: { r: 255, g: 0, b: 0, h: 0, s: 1, v: 1 }, defaultValue: { r: 255, g: 0, b: 0, h: 0, s: 1, v: 1 } },
			Invert: { icon: "invert", type: "toggle", value: false, defaultValue: false }
		}
	},
	"Obsidian": {
		icon: "obsidian",
		visible: true, defaultVisible: true,
		type: 'overlay',
		settings: {
			Opacity: { icon: "opacity", type: "slider", value: 1, defaultValue: 1 },
			Parallax: { icon: "parallax", type: "toggle", value: true, defaultValue: true }
		}
	},
	"World": {
		icon: "world",
		visible: true, defaultVisible: true,
		type: 'base',
		settings: {
			Opacity: { icon: "opacity", type: "slider", value: 1, defaultValue: 1 }
		}
	},
	"Background": {
		icon: "2d",
		visible: true, defaultVisible: true,
		type: "background",
		settings: {
			Color: { icon: "brush", type: "colorpicker", value: { r: 0, g: 0, b: 0, h: 0, s: 0, v: 0 }, defaultValue: { r: 0, g: 0, b: 0, h: 0, s: 0, v: 0 } }
		}
	}
}

let searchPanel;
let selectedSuggestionIndex = 0;
let currentSuggestions = [];
let itemHeight = 60;
let searchPanelVisibleCount = 10;
let lastSearchQuery = "";
let searchClickX, searchClickY;

let isFilterMode = false;
let isSelectingSuggestion = false;
let filterSettings = {
	radius: { icon: "radius", type: "slider", value: 1000, defaultValue: 1000, min: 5, max: 50000 }
};
let recentSearches = [];
try {
	const stored = localStorage.getItem('recentSearches');
	if (stored) recentSearches = JSON.parse(stored);
} catch (e) { }

const dimensionOptions = [
	{ id: 'overworld', name: 'Overworld Coordinates', icon: 'world' },
	{ id: 'nether', name: 'Nether Coordinates', icon: 'obsidian' },
	{ id: 'end', name: 'End Coordinates', icon: 'enderchest' }
];

let allAtlasLocations = [];
let atlasLocations = [];
let pinIcon;
let pinEnd;
let renderSuggestions;
let cachedClusters = [];
let lastClusterCamX, lastClusterCamY, lastClusterZoom, lastClusterDim;
const CLUSTER_RADIUS_PIXELS = 60;

let tempMarkers = [];
let activeHoveredMarker = null;
let selectedMarkerColor = 'Red';
const markerColors = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple', 'Pink'];
let markerIcons = {};

function getParsedInput(val) {
	const lowerVal = val.toLowerCase();
	const detectedDim = dimensionOptions.find(d => lowerVal.includes(d.id))?.id || null;

	const numbers = val.match(/-?\d+(\.\d+)?/g);
	if (!numbers || numbers.length < 2) return null;

	return {
		x: parseFloat(numbers[0]),
		z: parseFloat(numbers[numbers.length >= 3 ? 2 : 1]),
		dim: detectedDim
	};
}

function getDistanceFromCamera(loc) {
	let locX = loc.x;
	let locZ = loc.z;
	if (loc.dim === 2 && currentDimension !== 2) return Infinity;
	if (currentDimension === 2 && loc.dim !== 2) return Infinity;

	if (loc.dim === 0 && currentDimension === 1) { locX /= 8; locZ /= 8; }
	else if (loc.dim === 1 && currentDimension === 0) { locX *= 8; locZ *= 8; }

	return Math.sqrt(Math.pow(locX - camera.x, 2) + Math.pow(locZ - camera.y, 2));
}

function fetchAtlasLocations(query, showSuggestionsAfter = true) {
	if (!query || query.trim().length === 0) {
		atlasLocations = [];
		if (typeof renderSuggestions === 'function' && showSuggestionsAfter) renderSuggestions();
		return;
	}

	const trimmedQuery = query.toLowerCase().trim();
	const parsed = getParsedInput(query);
	const isJustCoords = /^(overworld|nether|end)?\s*:?\s*-?\d+(\.\d+)?\s*,?\s*-?\d+(\.\d+)?\s*$/i.test(query.trim());

	const filterRadius = filterSettings.radius.value;

	if (parsed && isJustCoords) {
		let px = Math.round(parsed.x);
		let pz = Math.round(parsed.z);
		let targetDim = parsed.dim === 'end' ? 2 : (parsed.dim === 'overworld' ? 0 : (parsed.dim === 'nether' ? 1 : null));

		let results = allAtlasLocations.map(loc => {
			let d = Math.sqrt(Math.pow(loc.x - px, 2) + Math.pow(loc.z - pz, 2));
			return { ...loc, distToSearch: d };
		});

		if (targetDim !== null) {
			results = results.filter(l => l.dim === targetDim);
		}

		results = results.filter(l => l.distToSearch <= filterRadius);

		results.sort((a, b) => a.distToSearch - b.distToSearch);
		atlasLocations = results;

	} else {
		let results = [];
		for (const loc of allAtlasLocations) {
			let score = 0;
			const name = loc.name.toLowerCase();
			const desc = (loc.desc || "").toLowerCase();

			if (name === trimmedQuery) score += 1000;
			else if (name.startsWith(trimmedQuery)) score += 500;
			else if (name.includes(trimmedQuery)) score += 200;
			else if (desc.includes(trimmedQuery)) score += 50;

			if (trimmedQuery.length > 3) {
				const distance = getLevenshteinDistance(trimmedQuery, name);
				if (distance <= 4) {
					score += (300 - (distance * 100));
				}
			}

			if (score > 0) {
				let camDist = getDistanceFromCamera(loc);
				results.push({ ...loc, searchScore: score, distToCam: camDist });
			}
		}

		results.sort((a, b) => {
			if (b.searchScore !== a.searchScore) {
				return b.searchScore - a.searchScore;
			}
			return a.distToCam - b.distToCam;
		});

		atlasLocations = results;
	}

	if (typeof renderSuggestions === 'function' && showSuggestionsAfter) renderSuggestions();
}

// elements
let searchInput;
let coordinateText, coordinateTextNether;
let layersButton;
let layersettings;

let copyLinkSettings = {
	"Include All": false,
	"Layer Settings": false,
	"Current Search": false,
	"Temporary Markers": false,
	"Keep Existing URL Parameters": false
}

function preload() {
	poppins = loadFont('/media/Poppins-Regular.ttf');
}

function setup() {
	createCanvas(windowWidth, windowHeight, WEBGL);
	textFont(poppins);
	imageMode(CORNER);

	fetch('https://2b2tatlas.com/api/locations.php?rows=99999')
		.then(res => res.json())
		.then(data => {
			allAtlasLocations = data.map(loc => {
				let dim = 0;
				if (loc.end_dimension === "1") dim = 2;
				return {
					name: loc.name,
					x: parseFloat(loc.x),
					z: parseFloat(loc.z),
					dim: dim,
					uuid: loc.location_uuid,
					desc: loc.description
				};
			});
			if (searchInput && searchInput.value) {
				fetchAtlasLocations(searchInput.value);
			}
		})
		.catch(e => console.error("Initial Atlas load failed:", e));

	fetch('/media/solidTile.webp')
		.then(res => res.blob())
		.then(blob => createImageBitmap(blob))
		.then(bitmap => {
			solidBitmap = bitmap;
		});

	markerColors.forEach(col => {
		markerIcons[col] = loadImage(`/icon/worldPin${col}.png`);
	});

	markerColors.forEach(col => {
		markerIcons[col] = loadImage(`/icon/worldPin${col}.png`);
	});

	const copycoords = document.getElementById('copycoordinates');
	copycoords.addEventListener("click", () => {
		navigator.clipboard.writeText(`${rightClickCoords.x}, ${rightClickCoords.z}`);
		document.getElementById('rightClickContext').classList.remove('open');
	});

	const copyLink = document.getElementById('copylink');
	copyLink.addEventListener("click", () => {
		const layersChanged = hasLayerSettingsChanged();
		const searchVal = searchInput.value.trim();
		const parsedSearch = getParsedInput(searchVal);
		const searchYieldsResults = atlasLocations.length > 0 || parsedSearch !== null;

		const layerItem = items["Layer Settings"];
		if (!layersChanged) {
			copyLinkSettings["Layer Settings"] = false;
			layerItem.item.classList.add('disabled-by-system');
			changeIcon(layerItem.icon, 'unchecked');
		} else {
			layerItem.item.classList.remove('disabled-by-system');
			changeIcon(layerItem.icon, copyLinkSettings["Layer Settings"] ? 'checked' : 'unchecked');
		}

		const searchItem = items["Current Search"];
		if (!searchVal || !searchYieldsResults) {
			copyLinkSettings["Current Search"] = false;
			searchItem.item.classList.add('disabled-by-system');
			changeIcon(searchItem.icon, 'unchecked');
		} else {
			searchItem.item.classList.remove('disabled-by-system');
			changeIcon(searchItem.icon, copyLinkSettings["Current Search"] ? 'checked' : 'unchecked');
		}

		const markerItem = items["Temporary Markers"];
		if (tempMarkers.length < 1) {
			copyLinkSettings["Temporary Markers"] = false;
			markerItem.item.classList.add('disabled-by-system');
			changeIcon(markerItem.icon, 'unchecked');
		} else {
			markerItem.item.classList.remove('disabled-by-system');
			changeIcon(markerItem.icon, copyLinkSettings["Temporary Markers"] ? 'checked' : 'unchecked');
		}

		document.getElementById('copyLinkText').value = createURL();

		document.getElementById('copyLinkButton').onclick = () => {
			copyToClipboard(createURL());
		}

		document.getElementById('copyLinkScreen').classList.add('open');
		document.getElementById('rightClickContext').classList.remove('open');
	});

	document.querySelectorAll('.color-swatch').forEach(swatch => {
		swatch.addEventListener('click', (e) => {
			document.querySelectorAll('.color-swatch').forEach(s => s.style.borderColor = 'transparent');
			e.target.style.borderColor = 'white';
			selectedMarkerColor = e.target.getAttribute('data-color');
		});
	});

	const placemarker = document.getElementById('placemarker');
	placemarker.addEventListener("click", () => openMarkerEditDialog(null));

	const editmarker = document.getElementById('editmarker');
	if (editmarker) {
		editmarker.addEventListener("click", () => {
			if (activeHoveredMarker) openMarkerEditDialog(activeHoveredMarker);
		});
	}

	const removemarker = document.getElementById('removemarker');
	removemarker.addEventListener("click", () => {
		if (activeHoveredMarker) {
			tempMarkers = tempMarkers.filter(m => m !== activeHoveredMarker);
		}
		document.getElementById('rightClickContext').classList.remove('open');
	});

	window.addEventListener('mousedown', (e) => {
		if (e.target.tagName.toLowerCase() === 'canvas') {
			if (document.activeElement === searchInput) {
				searchInput.blur();
			}
			searchPanel.classList.remove('open');
			isFilterMode = false;
		}
		const context = document.getElementById('rightClickContext');
		if (!context.contains(e.target)) {
			context.classList.remove('open');
		}
	});

	document.addEventListener('contextmenu', event => {
		if (event.target.tagName.toLowerCase() === 'canvas') {
			event.preventDefault();

			const wMouse = getWorldMouse();
			rightClickCoords.x = Math.round(wMouse.x);
			rightClickCoords.z = Math.round(wMouse.y);

			activeHoveredMarker = null;
			const currentScale = 1 / camera.zoom;
			const iconHitbox = 32 * currentScale;

			for (let i = tempMarkers.length - 1; i >= 0; i--) {
				let m = tempMarkers[i];
				let mDim = m.dim !== undefined ? m.dim : 0;
				if ((mDim === 2) !== (currentDimension === 2)) continue;

				let mx = currentDimension === 1 ? m.x / 8 : m.x;
				let mz = currentDimension === 1 ? m.z / 8 : m.z;

				if (wMouse.x >= mx - iconHitbox / 2 && wMouse.x <= mx + iconHitbox / 2 &&
					wMouse.y >= mz - iconHitbox && wMouse.y <= mz) {
					activeHoveredMarker = m;
					break;
				}
			}

			if (activeHoveredMarker) {
				document.getElementById('placemarker').style.display = 'none';
				document.getElementById('editmarker').style.display = '';
				document.getElementById('removemarker').style.display = '';
			} else {
				document.getElementById('placemarker').style.display = '';
				document.getElementById('editmarker').style.display = 'none';
				document.getElementById('removemarker').style.display = 'none';
			}

			const context = document.getElementById('rightClickContext');
			context.classList.add('open');
			context.style.left = event.clientX + 'px';
			context.style.top = event.clientY + 'px';
		}
	});

	// load prev camera view
	const path = window.location.pathname;
	const match = path.match(/@([^/]+)/);
	if (match) {
		const value = match[1];
		if (value.includes(",")) {
			const [lat, lng, zoom, dim] = value.split(",").map(Number);
			intendedCamZoom = zoom;
			camera.zoom = zoom;
			camera.x = lat;
			camera.y = lng;
			currentDimension = dim;
		} else {
			const details = decodeURL(value);
			intendedCamZoom = details.camzoom
			camera.zoom = details.camzoom;
			camera.x = details.lat;
			camera.y = details.lng;
			currentDimension = details.currentDimension;

			if (details.layers) {
				for (const name of Object.keys(details.layers)) {
					if (layers[name]) {
						layers[name].visible = details.layers[name].visible;
						if (layers[name].settings && details.layers[name].settings) {
							for (const sName of Object.keys(details.layers[name].settings)) {
								if (layers[name].settings[sName]) {
									layers[name].settings[sName].value = details.layers[name].settings[sName];
								}
							}
						}
					}
				}
			}

			if (details.search) {
				setTimeout(() => {
					if (searchInput) {
						searchInput.value = details.search;

						const sIcon = document.getElementById('searchIcon');
						if (sIcon && searchInput.value.length > 0) {
							changeIcon(sIcon, 'close');
							sIcon.style.cursor = 'pointer';
						}

						fetchAtlasLocations(details.search);
					}
				}, 100);
			}
		}
	} else {
		camera.zoom = intendedCamZoom;
		camera.x = 0;
		camera.y = 0;
	}

	// element setup
	searchPanel = document.getElementById('searchPanel');

	const searchBar = document.getElementById('searchBar');
	searchBar.innerHTML = '';
	const searchIcon = createIcon('search');
	searchIcon.id = 'searchIcon';
	searchIcon.style.cursor = 'default';
	searchBar.appendChild(searchIcon);

	searchIcon.addEventListener('click', () => {
		if (searchInput.value.length > 0) {
			searchInput.value = '';
			changeIcon(searchIcon, 'search');
			searchIcon.style.cursor = 'default';

			atlasLocations = [];
			tempMarkers = tempMarkers.filter(m => !m.isSearch);

			renderSuggestions();
			searchInput.focus();
		}
	});

	searchInput = document.createElement('input');
	searchInput.type = 'text';
	searchInput.name = 'Search';
	searchInput.placeholder = 'Search';
	searchInput.id = 'search';
	searchBar.appendChild(searchInput);

	const filterIcon = createIcon('filter');
	filterIcon.id = 'filterIcon';
	filterIcon.style.cursor = 'pointer';
	searchBar.appendChild(filterIcon);

	const moreIcon = createIcon('more');
	moreIcon.id = 'moreIcon';
	searchBar.appendChild(moreIcon);

	filterIcon.addEventListener('click', (e) => {
		e.stopPropagation();
		isFilterMode = !isFilterMode;
		if (isFilterMode) {
			renderFilterPanel();
		} else {
			if (searchInput.value || recentSearches.length > 0) {
				renderSuggestions();
			} else {
				searchPanel.classList.remove('open');
			}
		}
	});

	pinIcon = loadImage('/icon/worldPinBlack.png');
	pinEnd = loadImage('/icon/worldPinEnd.png');

	renderSuggestions = () => {
		if (isFilterMode) return;

		const parsed = getParsedInput(searchInput.value);
		currentSuggestions = [];

		if (searchInput.value.trim() === '') {
			if (recentSearches.length > 0) {
				recentSearches.forEach(r => {
					currentSuggestions.push({ ...r, source: 'recent' });
				});
			} else {
				searchPanel.classList.remove('open');
				return;
			}
		} else {
			if (!parsed && atlasLocations.length === 0) {
				searchPanel.classList.remove('open');
				return;
			}

			if (parsed) {
				let coordSuggestions = parsed.dim
					? dimensionOptions.filter(d => d.id === parsed.dim)
					: dimensionOptions;

				coordSuggestions.forEach((dim) => {
					currentSuggestions.push({
						type: 'coord',
						dimId: dim.id,
						x: parsed.x,
						z: parsed.z,
						name: dim.name,
						icon: dim.icon,
						tag: `${dim.id}: ${parsed.x}, ${parsed.z}`,
						source: 'coordinates'
					});
				});

				const converted = [];
				const { x, z, dim } = parsed;

				if (dim === 'nether') {
					converted.push({ id: 'overworld', name: 'Overworld', icon: 'world', x: x * 8, z: z * 8 });
				} else if (dim === 'overworld') {
					converted.push({ id: 'nether', name: 'Nether', icon: 'obsidian', x: Math.floor(x / 8), z: Math.floor(z / 8) });
				} else if (!dim) {
					converted.push({ id: 'overworld', name: 'Overworld', icon: 'world', x: x * 8, z: z * 8 });
					converted.push({ id: 'nether', name: 'Nether', icon: 'obsidian', x: Math.floor(x / 8), z: Math.floor(z / 8) });
				}

				if (converted.length > 0) {
					converted.forEach((itemData) => {
						currentSuggestions.push({
							type: 'coord_converted',
							dimId: itemData.id,
							x: itemData.x,
							z: itemData.z,
							name: itemData.name,
							icon: itemData.icon,
							tag: `${itemData.id}: ${itemData.x}, ${itemData.z}`,
							source: 'coordinates'
						});
					});
				}
			}

			atlasLocations.forEach(loc => {
				let dimId = loc.dim === 2 ? 'end' : (loc.dim === 1 ? 'nether' : 'overworld');
				let icon = loc.dim === 2 ? 'enderchest' : (loc.dim === 1 ? 'obsidian' : 'world');
				currentSuggestions.push({
					type: 'location', name: loc.name, x: loc.x, z: loc.z,
					dimId: dimId, dim: loc.dim, icon: icon,
					tag: `${dimId}: ${loc.x}, ${loc.z}`, source: 'atlas'
				});
			});
		}

		if (currentSuggestions.length === 0) {
			searchPanel.classList.remove('open');
			return;
		}

		let renderItems = [];
		let currentY = 0;
		let currentSubheading = null;
		const SUBHEADING_HEIGHT = 28;

		currentSuggestions.forEach((sug, index) => {
			let neededSubheading = null;
			if (sug.source === 'recent') neededSubheading = 'Recent Searches';
			else if (sug.type === 'coord') neededSubheading = 'Exact Coordinates';
			else if (sug.type === 'coord_converted') neededSubheading = 'Converted';
			else if (sug.type === 'location') neededSubheading = 'Locations';

			if (neededSubheading && neededSubheading !== currentSubheading) {
				renderItems.push({
					isHeader: true,
					text: neededSubheading,
					y: currentY,
					height: SUBHEADING_HEIGHT
				});
				currentY += SUBHEADING_HEIGHT;
				currentSubheading = neededSubheading;
			}

			renderItems.push({
				...sug,
				isHeader: false,
				originalIndex: index,
				y: currentY,
				height: itemHeight
			});
			currentY += itemHeight;
		});

		const previousScrollTop = searchPanel.scrollTop || 0;

		searchPanel.classList.add('open');
		searchPanel.innerHTML = '';

		const container = document.createElement('div');
		container.className = 'scrollContainer';
		container.style.height = currentY + 'px';
		container.style.position = 'relative';
		searchPanel.appendChild(container);

		const selectedObj = renderItems.find(r => !r.isHeader && r.originalIndex === selectedSuggestionIndex);
		let targetScrollTop = previousScrollTop;
		if (selectedObj) {
			const viewHeight = 350;
			if (selectedObj.y < previousScrollTop) {
				targetScrollTop = Math.max(0, selectedObj.y - SUBHEADING_HEIGHT);
			} else if (selectedObj.y + selectedObj.height > previousScrollTop + viewHeight) {
				targetScrollTop = selectedObj.y + selectedObj.height - viewHeight;
			}
		}

		searchPanel.scrollTop = targetScrollTop;

		const updateVisibleItems = () => {
			const scrollTop = searchPanel.scrollTop;
			const scrollBottom = scrollTop + searchPanel.clientHeight;

			container.innerHTML = '';
			for (let i = 0; i < renderItems.length; i++) {
				const itemObj = renderItems[i];

				if (itemObj.y + itemObj.height > scrollTop - itemHeight && itemObj.y < scrollBottom + itemHeight) {
					const domNode = document.createElement("div");
					domNode.style.position = 'absolute';
					domNode.style.top = itemObj.y + 'px';
					domNode.style.width = '100%';
					domNode.style.height = itemObj.height + 'px';
					domNode.style.boxSizing = 'border-box';

					if (itemObj.isHeader) {
						domNode.className = 'subheading';
						domNode.innerText = itemObj.text;
					} else {
						domNode.className = `item ${itemObj.originalIndex === selectedSuggestionIndex ? 'selected' : ''}`;
						let displayIcon = itemObj.icon || 'search';
						let displayName = itemObj.name || itemObj.text;
						let displayTag = itemObj.tag || '';

						domNode.innerHTML = `
						<img src="/icon/${displayIcon}.png" class="icon">
						<div class="details">
							<div class="name">${displayName}</div>
							<div class="tag">${displayTag}</div>
						</div>`;

						domNode.onmousedown = (e) => {
							e.preventDefault();
							isSelectingSuggestion = true;
							selectSuggestion(itemObj);
							setTimeout(() => { isSelectingSuggestion = false; }, 100);
						};
					}
					container.appendChild(domNode);
				}
			}
		};

		searchPanel.onscroll = updateVisibleItems;
		updateVisibleItems();
	};

	searchInput.addEventListener('input', () => {
		isFilterMode = false;
		selectedSuggestionIndex = 0;

		const sIcon = document.getElementById('searchIcon');
		if (searchInput.value.length > 0) {
			changeIcon(sIcon, 'close');
			sIcon.style.cursor = 'pointer';
		} else {
			changeIcon(sIcon, 'search');
			sIcon.style.cursor = 'default';
		}

		fetchAtlasLocations(searchInput.value);
		renderSuggestions();
	});

	searchInput.addEventListener('keydown', (e) => {
		const isOpen = searchPanel.classList.contains('open');

		if (e.key === 'ArrowDown') {
			e.preventDefault();
			if (isOpen && currentSuggestions.length > 0) {
				selectedSuggestionIndex = (selectedSuggestionIndex + 1) % currentSuggestions.length;
				renderSuggestions();
			}
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			if (isOpen && currentSuggestions.length > 0) {
				selectedSuggestionIndex = (selectedSuggestionIndex - 1 + currentSuggestions.length) % currentSuggestions.length;
				renderSuggestions();
			}
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (isOpen && currentSuggestions.length > 0) {
				const sug = currentSuggestions[selectedSuggestionIndex];
				selectSuggestion(sug);
			} else {
				addRecentSearch(searchInput.value);
				handleCoordinateSearch(searchInput.value);
				searchPanel.classList.remove('open');
				isFilterMode = false;
			}
			searchInput.blur();
		} else if (e.key === 'Escape') {
			searchInput.blur();
		}
	});

	searchInput.addEventListener('focus', () => {
		isFilterMode = false;
		fetchAtlasLocations(searchInput.value);
		renderSuggestions();
	});

	searchInput.addEventListener('click', () => {
		if (!searchPanel.classList.contains('open')) {
			isFilterMode = false;
			fetchAtlasLocations(searchInput.value);
			renderSuggestions();
		}
	});

	searchInput.addEventListener('blur', () => {
		if (!isSelectingSuggestion && searchInput.value.trim().length > 0 && (atlasLocations.length > 0 || getParsedInput(searchInput.value) !== null)) {
			addRecentSearch(searchInput.value);
		}
		setTimeout(() => {
			const isOverPanel = searchPanel.matches(':hover');
			const isOverFilter = document.getElementById('filterIcon')?.matches(':hover');
			const isOverSearchIcon = document.getElementById('searchIcon')?.matches(':hover');

			if (isOverPanel || isOverFilter || isOverSearchIcon) {
				return;
			}

			searchPanel.classList.remove('open');
			isFilterMode = false;
		}, 150);
	});

	coordinateText = document.getElementById('coordinateText');
	coordinateTextNether = document.getElementById('coordinateTextNether');

	layersButton = document.getElementById('layers');
	let layertitle = document.getElementById('layerstitle');
	let layerclose = document.getElementById('layerclose');

	layersettings = document.getElementById('layersettings');

	layerclose.addEventListener("click", (e) => {
		if (layersButton.classList.contains("open")) {
			layersButton.classList.remove("open")
		}
	});
	layertitle.addEventListener("click", (e) => {
		if (!layersButton.classList.contains("open")) {
			layersButton.classList.add("open")
		}
	});
	for (const [name, layer] of Object.entries(layers)) {
		const item = document.createElement("div");
		item.className = "item";

		const visibilityIcon = createIcon(layer.visible ? "checked" : "unchecked");
		if (layer.type === "background") {
			visibilityIcon.style.opacity = 0.5;
			visibilityIcon.style.cursor = "default";
		} else {
			visibilityIcon.style.cursor = "pointer";
			visibilityIcon.addEventListener("click", (e) => {
				layer.visible = !layer.visible;
			});
			updateOnChange(() => layer.visible, (val) => {
				changeIcon(visibilityIcon, val ? "checked" : "unchecked");
				if (val) {
					for (let key in tileCache) {
						if (tileCache[key].controller) {
							tileCache[key].controller.abort();
						}
					}
					tileCache = {};
					inFlightRequests.clear();
					activeTileKeys.clear();
					updateMapURL();
				}
			});
		}

		const layerIcon = createIcon(layer.icon);

		const settingsIcon = createIcon('settings');
		settingsIcon.classList.add('right')
		if (layer.settings) {
			settingsIcon.addEventListener("click", (e) => {
				if (!layersettings.classList.contains('open')) {
					layersettings.classList.add('open');
					configureLayerSettings(name, layer);
				} else if (currentLayerSettings != name) {
					configureLayerSettings(name, layer);
				} else {
					layersettings.classList.remove('open');
				}
			});
		} else {
			settingsIcon.style.opacity = 0.5;
			settingsIcon.style.cursor = "default";
		}

		item.append(visibilityIcon, layerIcon, name, settingsIcon);

		layersButton.appendChild(item);
	}

	const overworldToggle = document.getElementById('overworldToggle');
	overworldToggle.addEventListener("click", () => {
		if (currentDimension == 1) { camera.x *= 8; camera.y *= 8; }
		currentDimension = 0;
		updateMapURL();
	})
	const netherToggle = document.getElementById('netherToggle');
	netherToggle.addEventListener("click", () => {
		if (currentDimension != 1) { camera.x /= 8; camera.y /= 8; }
		currentDimension = 1;
		updateMapURL();
	})
	const endToggle = document.getElementById('endToggle');
	endToggle.addEventListener("click", () => {
		if (currentDimension == 1) { camera.x *= 8; camera.y *= 8; }
		currentDimension = 2;
		updateMapURL();
	})

	createIcons();

	const copyLinkTitle = document.getElementById('copyLinkTitle');
	copyLinkTitle.innerHTML = 'Share'
	const closeButton = createIcon('close');
	closeButton.addEventListener('click', () => {
		document.getElementById('copyLinkScreen').classList.remove('open');
	})
	copyLinkTitle.appendChild(closeButton);
	const copyLinkBody = document.getElementById('copyLinkBody');
	copyLinkBody.innerHTML = '<div class="subheading">Options</div>';

	const items = {};

	Object.keys(copyLinkSettings).forEach(settingName => {
		let item = document.createElement('div');
		item.className = 'item';
		let icon = createIcon(copyLinkSettings[settingName] ? 'checked' : 'unchecked');
		item.appendChild(icon);
		item.insertAdjacentText('beforeend', settingName);
		items[settingName] = { item, icon };

		item.addEventListener('click', () => {
			if (item.classList.contains('disabled') || item.classList.contains('disabled-by-system')) return;
			copyLinkSettings[settingName] = !copyLinkSettings[settingName];
			const includeAll = copyLinkSettings["Include All"];

			Object.entries(items).forEach(([name, refs]) => {
				const { item: refItem, icon: refIcon } = refs;
				if (includeAll && name !== "Include All") {
					if (refItem.classList.contains('disabled-by-system')) {
						changeIcon(refIcon, 'unchecked');
					} else {
						changeIcon(refIcon, 'checked');
						refItem.classList.add('disabled');
					}
				} else {
					if (refItem.classList.contains('disabled-by-system')) {
						changeIcon(refIcon, 'unchecked');
					} else {
						changeIcon(refIcon, copyLinkSettings[name] ? 'checked' : 'unchecked');
						refItem.classList.remove('disabled');
					}
				}
			});
			document.getElementById('copyLinkText').value = createURL();
			document.getElementById('copyLinkButton').onclick = () => copyToClipboard(createURL());
		});
		copyLinkBody.appendChild(item);
	});

	setupColorPickerUI();
	setupColorPickerTabs()
}

function rgbToHsv(r, g, b) {
	r /= 255; g /= 255; b /= 255;
	let max = Math.max(r, g, b), min = Math.min(r, g, b);
	let h, s, v = max;
	let d = max - min;
	s = max === 0 ? 0 : d / max;
	if (max === min) h = 0;
	else {
		switch (max) {
			case r: h = (g - b) / d + (g < b ? 6 : 0); break;
			case g: h = (b - r) / d + 2; break;
			case b: h = (r - g) / d + 4; break;
		} h /= 6;
	}
	return [h, s, v];
}

function hslToRgb(h, s, l) {
	h /= 360; s /= 100; l /= 100;
	let r, g, b;
	if (s === 0) r = g = b = l;
	else {
		const hue2rgb = (p, q, t) => {
			if (t < 0) t += 1; if (t > 1) t -= 1;
			if (t < 1 / 6) return p + (q - p) * 6 * t;
			if (t < 1 / 2) return q;
			if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
			return p;
		};
		const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
		const p = 2 * l - q;
		r = hue2rgb(p, q, h + 1 / 3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1 / 3);
	}
	return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function setupColorPickerTabs() {
	const tabs = document.querySelectorAll('.picker .tablist .tab');
	const gridBody = document.getElementById('grid');
	const slidersBody = document.getElementById('sliders');

	if (!tabs.length || !gridBody || !slidersBody) return;

	const bodies = [gridBody, slidersBody];

	bodies.forEach((body, index) => {
		body.style.display = index === 0 ? '' : 'none';
	});

	tabs.forEach((tab, index) => {
		tab.addEventListener('click', () => {
			tabs.forEach(t => t.classList.remove('selected'));
			tab.classList.add('selected');

			bodies.forEach((body, i) => {
				body.style.display = i === index ? '' : 'none';
			});
		});
	});
}

function setupColorPickerUI() {
	const colourPicker = document.querySelector('.colourPicker');
	const colourSelect = document.querySelector('.colourPaletteSelect');
	if (!colourPicker || !colourSelect) return;

	window.currentColorMode = 'RGB';
	window.currentSelectedColor = { r: 255, g: 0, b: 0, h: 0, s: 1, v: 1 };

	const closeBtn = document.querySelector('.picker .heading .title .icon');
	if (closeBtn) closeBtn.addEventListener('click', () => { document.querySelector('.picker').style.display = 'none'; });

	const gridPreview = document.getElementById('grid-color-preview');
	const slidersPreview = document.getElementById('sliders-color-preview');

	window.updateCurrentColor = function (newColor) {
		window.currentSelectedColor = { ...newColor };
		const previewRgb = `rgb(${newColor.r}, ${newColor.g}, ${newColor.b})`;
		if (gridPreview) gridPreview.style.backgroundColor = previewRgb;
		if (slidersPreview) slidersPreview.style.backgroundColor = previewRgb;

		if (window.activeColorTarget) window.activeColorTarget(window.currentSelectedColor);
		updateSlidersFromState();
	};

	window.syncPickerUI = function (colorObj) { window.updateCurrentColor(colorObj); };

	// grid logic
	const COLS = 12, ROWS = 10;
	let isDraggingPicker = false;
	function updatePickerSelection(e) {
		const rect = colourPicker.getBoundingClientRect();
		const clientX = e.touches ? e.touches[0].clientX : e.clientX;
		const clientY = e.touches ? e.touches[0].clientY : e.clientY;
		let x = Math.max(0, Math.min(rect.width - 0.1, clientX - rect.left));
		let y = Math.max(0, Math.min(rect.height - 0.1, clientY - rect.top));

		const col = Math.floor(x / (rect.width / COLS));
		const row = Math.floor(y / (rect.height / ROWS));
		const centerX = (col * (rect.width / COLS)) + ((rect.width / COLS) / 2);
		const centerY = (row * (rect.height / ROWS)) + ((rect.height / ROWS) / 2);

		const pickerUi = colourPicker.closest('.picker');
		const pickerRect = pickerUi.getBoundingClientRect();
		colourSelect.style.margin = '0px';
		colourSelect.style.left = `${(rect.left - pickerRect.left) + centerX - 18}px`;
		colourSelect.style.top = `${(rect.top - pickerRect.top) + centerY - 18}px`;

		let r, g, b;
		if (row === 0) {
			const lightness = Math.round(100 - (col / (COLS - 1)) * 100);
			[r, g, b] = hslToRgb(0, 0, lightness);
		} else {
			const hue = (200 + col * 30) % 400;
			const lightness = Math.round(20 + ((row - 1) / (ROWS - 2)) * 70);
			[r, g, b] = hslToRgb(hue, 100, lightness);
		}
		let [h_val, s_val, v_val] = rgbToHsv(r, g, b);
		window.updateCurrentColor({ r, g, b, h: h_val, s: s_val, v: v_val });
	}

	colourPicker.addEventListener('mousedown', (e) => { isDraggingPicker = true; updatePickerSelection(e); e.preventDefault(); });
	window.addEventListener('mousemove', (e) => { if (isDraggingPicker) updatePickerSelection(e); });
	window.addEventListener('mouseup', () => isDraggingPicker = false);

	// slider logic
	const toggleBtn = document.getElementById('toggleColorMode');
	const labels = [document.querySelector('#slider-1-group .slider-label'), document.querySelector('#slider-2-group .slider-label'), document.querySelector('#slider-3-group .slider-label')];
	const inputs = [document.getElementById('slider-1-input'), document.getElementById('slider-2-input'), document.getElementById('slider-3-input')];
	const tracks = [document.getElementById('slider-1-track'), document.getElementById('slider-2-track'), document.getElementById('slider-3-track')];
	const thumbs = tracks.map(t => t.querySelector('.custom-slider-thumb'));

	if (toggleBtn) {
		toggleBtn.addEventListener('click', () => {
			window.currentColorMode = window.currentColorMode === 'RGB' ? 'HSV' : 'RGB';
			toggleBtn.innerText = `Switch to ${window.currentColorMode === 'RGB' ? 'HSV' : 'RGB'}`;
			labels[0].innerText = window.currentColorMode === 'RGB' ? 'R' : 'H';
			labels[1].innerText = window.currentColorMode === 'RGB' ? 'G' : 'S';
			labels[2].innerText = window.currentColorMode === 'RGB' ? 'B' : 'V';
			inputs[0].max = window.currentColorMode === 'RGB' ? 255 : 360;
			inputs[1].max = window.currentColorMode === 'RGB' ? 255 : 100;
			inputs[2].max = window.currentColorMode === 'RGB' ? 255 : 100;
			updateSlidersFromState();
		});
	}

	function updateSlidersFromState() {
		const c = window.currentSelectedColor;
		let vals = window.currentColorMode === 'RGB' ? [c.r, c.g, c.b] : [Math.round(c.h * 360), Math.round(c.s * 100), Math.round(c.v * 100)];

		for (let i = 0; i < 3; i++) {
			if (document.activeElement !== inputs[i]) inputs[i].value = vals[i];
			const max = parseFloat(inputs[i].max) || 255;
			let percent = (vals[i] / max);
			thumbs[i].style.left = `calc(10px + (${percent * 100}% - ${percent * 20}px))`;
		}

		if (window.currentColorMode === 'RGB') {
			tracks[0].style.background = `linear-gradient(to right, rgb(0, ${c.g}, ${c.b}), rgb(255, ${c.g}, ${c.b}))`;
			tracks[1].style.background = `linear-gradient(to right, rgb(${c.r}, 0, ${c.b}), rgb(${c.r}, 255, ${c.b}))`;
			tracks[2].style.background = `linear-gradient(to right, rgb(${c.r}, ${c.g}, 0), rgb(${c.r}, ${c.g}, 255))`;
		} else {
			let hStops = [];
			for (let i = 0; i <= 6; i++) {
				let [r, g, b] = hsvToRgb(i / 6, c.s, c.v);
				hStops.push(`rgb(${r}, ${g}, ${b})`);
			}
			tracks[0].style.background = `linear-gradient(to right, ${hStops.join(', ')})`;

			let [r0s, g0s, b0s] = hsvToRgb(c.h, 0, c.v);
			let [r1s, g1s, b1s] = hsvToRgb(c.h, 1, c.v);
			tracks[1].style.background = `linear-gradient(to right, rgb(${r0s}, ${g0s}, ${b0s}), rgb(${r1s}, ${g1s}, ${b1s}))`;

			let [r0v, g0v, b0v] = hsvToRgb(c.h, c.s, 0);
			let [r1v, g1v, b1v] = hsvToRgb(c.h, c.s, 1);
			tracks[2].style.background = `linear-gradient(to right, rgb(${r0v}, ${g0v}, ${b0v}), rgb(${r1v}, ${g1v}, ${b1v}))`;
		}
	}

	function onSliderChange(index, val) {
		const max = parseFloat(inputs[index].max) || 255;
		val = Math.max(0, Math.min(max, val));
		inputs[index].value = Math.round(val);

		const c = window.currentSelectedColor;
		if (window.currentColorMode === 'RGB') {
			let r = index === 0 ? val : c.r, g = index === 1 ? val : c.g, b = index === 2 ? val : c.b;
			let [h, s, v] = rgbToHsv(r, g, b);
			window.updateCurrentColor({ r: Math.round(r), g: Math.round(g), b: Math.round(b), h, s, v });
		} else {
			let h = (index === 0 ? val : c.h * 360) / 360, s = (index === 1 ? val : c.s * 100) / 100, v = (index === 2 ? val : c.v * 100) / 100;
			let [r, g, b] = hsvToRgb(h, s, v);
			window.updateCurrentColor({ r, g, b, h, s, v });
		}
	}

	tracks.forEach((track, i) => {
		let isDragging = false;
		const updateFromEvent = (e) => {
			const rect = track.getBoundingClientRect();
			const clientX = e.touches ? e.touches[0].clientX : e.clientX;
			let xInside = clientX - rect.left - 10;
			let availableWidth = rect.width - 20;

			let percent = Math.max(0, Math.min(1, xInside / availableWidth));
			onSliderChange(i, percent * (parseFloat(inputs[i].max) || 255));
		};
		track.addEventListener('mousedown', (e) => { isDragging = true; updateFromEvent(e); e.preventDefault(); });
		window.addEventListener('mousemove', (e) => { if (isDragging) updateFromEvent(e); });
		window.addEventListener('mouseup', () => isDragging = false);
		inputs[i].addEventListener('input', (e) => onSliderChange(i, parseFloat(e.target.value) || 0));
	});
}

function hsvToRgb(h, s, v) {
	let r, g, b;
	let i = Math.floor(h * 6);
	let f = h * 6 - i;
	let p = v * (1 - s);
	let q = v * (1 - f * s);
	let t = v * (1 - (1 - f) * s);
	switch (i % 6) {
		case 0: r = v, g = t, b = p; break;
		case 1: r = q, g = v, b = p; break;
		case 2: r = p, g = v, b = t; break;
		case 3: r = p, g = q, b = v; break;
		case 4: r = t, g = p, b = v; break;
		case 5: r = v, g = p, b = q; break;
	}
	return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

let retintQueue = new Set();
let isRetintingQueue = false;

async function processRetintQueue() {
	if (isRetintingQueue) return;
	isRetintingQueue = true;

	while (retintQueue.size > 0) {
		const tile = retintQueue.values().next().value;
		retintQueue.delete(tile);

		const targetColor = layers["New Chunks"].settings.Color.value;
		const isInverted = layers["New Chunks"].settings.Invert.value;
		const stateKey = `${targetColor.r},${targetColor.g},${targetColor.b},${isInverted}`;

		if (tile.newChunksStateKey !== stateKey && (tile.imgNewChunksRaw || isInverted)) {
			try {
				const rawBitmap = tile.imgNewChunksRaw || solidBitmap;
				if (!rawBitmap) continue;
				if (tileTintCanvas.width !== rawBitmap.width) tileTintCanvas.width = rawBitmap.width;
				if (tileTintCanvas.height !== rawBitmap.height) tileTintCanvas.height = rawBitmap.height;

				tileTintCtx.globalCompositeOperation = 'source-over';
				tileTintCtx.clearRect(0, 0, tileTintCanvas.width, tileTintCanvas.height);

				if (!isInverted) {
					tileTintCtx.drawImage(rawBitmap, 0, 0);
					tileTintCtx.globalCompositeOperation = 'source-atop';
					tileTintCtx.fillStyle = `rgb(${targetColor.r}, ${targetColor.g}, ${targetColor.b})`;
					tileTintCtx.fillRect(0, 0, tileTintCanvas.width, tileTintCanvas.height);
				} else {
					if (tile.imgBase) {
						tileTintCtx.drawImage(tile.imgBase, 0, 0, rawBitmap.width, rawBitmap.height);

						tileTintCtx.globalCompositeOperation = 'source-in';
						tileTintCtx.fillStyle = `rgb(${targetColor.r}, ${targetColor.g}, ${targetColor.b})`;
						tileTintCtx.fillRect(0, 0, tileTintCanvas.width, tileTintCanvas.height);

						tileTintCtx.globalCompositeOperation = 'destination-out';
						if (tile.imgNewChunksRaw) {
							tileTintCtx.drawImage(tile.imgNewChunksRaw, 0, 0);
						}
					} else {
						tileTintCtx.fillStyle = `rgb(${targetColor.r}, ${targetColor.g}, ${targetColor.b})`;
						tileTintCtx.fillRect(0, 0, tileTintCanvas.width, tileTintCanvas.height);
						if (tile.imgNewChunksRaw) {
							tileTintCtx.globalCompositeOperation = 'destination-out';
							tileTintCtx.drawImage(tile.imgNewChunksRaw, 0, 0);
						}
					}
				}

				const newBitmap = await createImageBitmap(tileTintCanvas);

				if (tile.imgNewChunks) tile.imgNewChunks.close();
				tile.imgNewChunks = newBitmap;
				tile.newChunksStateKey = stateKey;
			} catch (e) { console.error(e); }
		} else if (!isInverted && !tile.imgNewChunksRaw) {
			if (tile.imgNewChunks) {
				tile.imgNewChunks.close();
				tile.imgNewChunks = null;
			}
			tile.newChunksStateKey = stateKey;
		}
		tile.isRetinting = false;
	}
	isRetintingQueue = false;
}

function renderFilterPanel() {
	searchPanel.innerHTML = '';
	searchPanel.classList.add('open');

	const label = document.createElement('div');
	label.className = 'subheading';
	label.innerText = 'Filter Options';
	searchPanel.appendChild(label);

	const settingDiv = document.createElement('div');
	settingDiv.className = 'item noHover';
	settingDiv.style.cursor = 'default';
	settingDiv.style.display = 'flex';
	settingDiv.style.flexWrap = 'wrap';
	settingDiv.style.justifyContent = 'space-between';

	const resetBtn = createIcon('reset');
	resetBtn.style.cursor = 'pointer';

	const sIcon = createIcon(filterSettings.radius.icon);
	const nameDiv = document.createElement('div');
	nameDiv.innerText = 'Radius: ' + Math.round(filterSettings.radius.value);
	nameDiv.style.flexGrow = '1';
	nameDiv.style.fontSize = '17px';

	const topRow = document.createElement('div');
	topRow.style.display = 'flex';
	topRow.style.alignItems = 'center';
	topRow.style.gap = '10px';
	topRow.append(resetBtn, sIcon, nameDiv);

	settingDiv.appendChild(topRow);

	const bottomRow = document.createElement('div');
	bottomRow.style.display = 'flex';
	bottomRow.style.boxSizing = 'border-box';

	const sliderImg = document.createElement('img');
	sliderImg.src = '/icon/slider.png';
	sliderImg.className = 'slider';
	bottomRow.appendChild(sliderImg);

	settingDiv.appendChild(bottomRow);
	searchPanel.appendChild(settingDiv);

	setupSlider(sliderImg, filterSettings.radius, filterSettings.radius.min, filterSettings.radius.max);

	resetBtn.addEventListener('click', () => {
		if (filterSettings.radius.value !== filterSettings.radius.defaultValue) {
			filterSettings.radius.value = filterSettings.radius.defaultValue;
			nameDiv.innerText = 'Radius: ' + Math.round(filterSettings.radius.value);
			fetchAtlasLocations(searchInput.value);
		}
	});

	let fetchTimeout;
	updateOnChange(() => filterSettings.radius.value, (val) => {
		resetBtn.style.opacity = (val !== filterSettings.radius.defaultValue) ? 1 : 0.5;
		resetBtn.style.cursor = (val !== filterSettings.radius.defaultValue) ? 'pointer' : 'default';
		nameDiv.innerText = 'Radius: ' + Math.round(val / 5) * 5;

		clearTimeout(fetchTimeout);
		fetchTimeout = setTimeout(() => {
			if (searchInput.value) {
				fetchAtlasLocations(searchInput.value, false);
			}
		}, 100);
	});

	resetBtn.style.opacity = (filterSettings.radius.value !== filterSettings.radius.defaultValue) ? 1 : 0.5;
	resetBtn.style.cursor = (filterSettings.radius.value !== filterSettings.radius.defaultValue) ? 'pointer' : 'default';
}

function addRecentSearch(query) {
	if (!query || typeof query !== 'string') return;
	const text = query.trim();
	if (!text) return;

	const item = {
		type: 'recent_query',
		text: text,
		icon: 'search',
		tag: 'Recent search'
	};

	recentSearches = recentSearches.filter(r => r.text !== item.text);

	recentSearches.unshift(item);
	if (recentSearches.length > 10) recentSearches.pop();

	try {
		localStorage.setItem('recentSearches', JSON.stringify(recentSearches));
	} catch (e) { }
}

function selectSuggestion(sug) {
	const sIcon = document.getElementById('searchIcon');
	if (sIcon) {
		changeIcon(sIcon, 'close');
		sIcon.style.cursor = 'pointer';
	}

	if (sug.type === 'recent_query') {
		searchInput.value = sug.text;
		fetchAtlasLocations(sug.text, false);

		if (atlasLocations.length > 0) {
			let loc = atlasLocations[0];
			let dimId = loc.dim === 2 ? 'end' : (loc.dim === 1 ? 'nether' : 'overworld');
			handleCoordinateSearch(`${dimId}: ${loc.x}, ${loc.z}`, false);
		} else {
			handleCoordinateSearch(sug.text, false);
		}
	} else if (sug.source == 'coordinates') {
		searchInput.value = sug.tag;
		handleCoordinateSearch(`${sug.dimId}: ${sug.x}, ${sug.z}`);
	} else {
		searchInput.value = sug.name;

		fetchAtlasLocations(sug.name, false);

		handleCoordinateSearch(`${sug.dimId}: ${sug.x}, ${sug.z}`, false);
	}

	searchPanel.classList.remove('open');
	isFilterMode = false;
}

function hasLayerSettingsChanged() {
	for (const name in layers) {
		const layer = layers[name];
		if (layer.visible !== layer.defaultVisible) return true;
		if (layer.settings) {
			for (const sName in layer.settings) {
				if (layer.settings[sName].value !== layer.settings[sName].defaultValue) return true;
			}
		}
	}
	return false;
}

function createURL() {
	const baseURL = `${window.location.origin}/@${encodeURL()}`;
	const finalURL = (copyLinkSettings["Keep Existing URL Parameters"] || copyLinkSettings["Include All"])
		? baseURL + window.location.search
		: baseURL;
	return finalURL;
}

async function copyToClipboard(text) {
	try {
		if (navigator.clipboard && window.isSecureContext) {
			await navigator.clipboard.writeText(text);
		} else {
			const textarea = document.createElement("textarea");
			textarea.value = text;
			textarea.style.position = "fixed";
			textarea.style.left = "-9999px";
			document.body.appendChild(textarea);
			textarea.focus();
			textarea.select();
			document.execCommand("copy");
			document.body.removeChild(textarea);
		}
		const element = document.getElementById('copyPopup');
		element.classList.add("animate");
		setTimeout(() => { element.classList.remove("animate"); }, 1000);
		return true;
	} catch (err) {
		console.error("Copy failed:", err);
		return false;
	}
}

function configureLayerSettings(layerName, layer) {
	currentLayerSettings = layerName;
	layersettings.innerHTML = '';

	const layersettingslabel = document.createElement("div");
	layersettingslabel.className = "label";
	const layersettingicon = createIcon('settings');
	layersettingslabel.append(layersettingicon, `${layerName} Settings`);
	layersettings.append(layersettingslabel);

	if (layer.type !== "background") {
		let setting = document.createElement("div");
		setting.className = "setting";

		let reset = createIcon('reset');
		reset.addEventListener("click", () => {
			if (layer.visible !== layer.defaultVisible) {
				layer.visible = layer.defaultVisible;
			}
		});

		let icon = createIcon('eye');
		let name = 'Visibility';
		let toggle = createIcon(layer.visible ? 'on' : 'off');
		toggle.classList.add('right');
		toggle.addEventListener("click", (e) => {
			layer.visible = !layer.visible;
		});

		updateOnChange(() => layer.visible, (val) => {
			changeIcon(toggle, val ? 'on' : 'off');
			reset.style.opacity = (val !== layer.defaultVisible) ? 1 : 0.5;
			reset.style.cursor = (val !== layer.defaultVisible) ? 'pointer' : 'default';
		});
		reset.style.opacity = (layer.visible !== layer.defaultVisible) ? 1 : 0.5;
		reset.style.cursor = (layer.visible !== layer.defaultVisible) ? 'pointer' : 'default';

		setting.append(reset, icon, name, toggle);
		layersettings.appendChild(setting);
	}

	for (const item in layer.settings) {
		let layerSettingDiv = document.createElement("div");
		layerSettingDiv.className = "setting";

		const settingObj = layer.settings[item];

		let setReset = createIcon('reset');
		setReset.addEventListener("click", () => {
			if (settingObj.value !== settingObj.defaultValue) {
				settingObj.value = settingObj.defaultValue;
			}
		});

		let setIcon = createIcon(settingObj.icon);
		let setName = item;
		layerSettingDiv.append(setReset, setIcon, setName);

		if (settingObj.type == 'toggle') {
			let settingtoggle = createIcon(settingObj.value ? 'on' : 'off');
			settingtoggle.classList.add('right');
			settingtoggle.addEventListener("click", (e) => {
				settingObj.value = !settingObj.value;
			});
			updateOnChange(() => settingObj.value, (val) => {
				changeIcon(settingtoggle, val ? 'on' : 'off');
				setReset.style.opacity = (val !== settingObj.defaultValue) ? 1 : 0.5;
				setReset.style.cursor = (val !== settingObj.defaultValue) ? 'pointer' : 'default';
			});
			setReset.style.opacity = (settingObj.value !== settingObj.defaultValue) ? 1 : 0.5;
			setReset.style.cursor = (settingObj.value !== settingObj.defaultValue) ? 'pointer' : 'default';
			layerSettingDiv.appendChild(settingtoggle);
		} else if (settingObj.type == 'slider') {
			let settingslider = document.createElement("img");
			settingslider.src = '/icon/slider.png';
			settingslider.className = 'slider'
			layerSettingDiv.appendChild(settingslider);
			setupSlider(settingslider, settingObj, 0, 1);

			updateOnChange(() => settingObj.value, (val) => {
				setReset.style.opacity = (val !== settingObj.defaultValue) ? 1 : 0.5;
				setReset.style.cursor = (val !== settingObj.defaultValue) ? 'pointer' : 'default';
			});
			setReset.style.opacity = (settingObj.value !== settingObj.defaultValue) ? 1 : 0.5;
			setReset.style.cursor = (settingObj.value !== settingObj.defaultValue) ? 'pointer' : 'default';
		} else if (settingObj.type == 'colorpicker') {
			let colorSquare = document.createElement("div");
			colorSquare.className = 'color-square';
			colorSquare.style.backgroundColor = `rgb(${settingObj.value.r}, ${settingObj.value.g}, ${settingObj.value.b})`;
			layerSettingDiv.appendChild(colorSquare);

			colorSquare.addEventListener("click", (e) => {
				window.activeColorTarget = (newColor) => {
					settingObj.value = { ...newColor };
					colorSquare.style.backgroundColor = `rgb(${newColor.r}, ${newColor.g}, ${newColor.b})`;
					const changed = (newColor.r !== settingObj.defaultValue.r || newColor.g !== settingObj.defaultValue.g || newColor.b !== settingObj.defaultValue.b);
					setReset.style.opacity = changed ? 1 : 0.5;
					setReset.style.cursor = changed ? 'pointer' : 'default';
					checkChanges();
				};
				if (window.syncPickerUI) window.syncPickerUI(settingObj.value);

				const pickerUI = document.querySelector('.picker');
				pickerUI.style.display = 'flex';
				pickerUI.style.zIndex = '999999';
				pickerUI.style.position = 'absolute';
				pickerUI.style.margin = '0';

				let left = e.clientX + 20;
				let top = e.clientY - 20;
				if (left + 350 > window.innerWidth) left = window.innerWidth - 370;
				if (top + 513 > window.innerHeight) top = window.innerHeight - 533;
				if (left < 0) left = 10;
				if (top < 0) top = 10;

				pickerUI.style.left = `${left}px`;
				pickerUI.style.top = `${top}px`;
			});

			setReset.addEventListener("click", () => {
				settingObj.value = { ...settingObj.defaultValue };
				colorSquare.style.backgroundColor = `rgb(${settingObj.value.r}, ${settingObj.value.g}, ${settingObj.value.b})`;
				if (window.syncPickerUI) window.syncPickerUI(settingObj.value);
				checkChanges();
			});

			const changed = (settingObj.value.r !== settingObj.defaultValue.r || settingObj.value.g !== settingObj.defaultValue.g || settingObj.value.b !== settingObj.defaultValue.b);
			setReset.style.opacity = changed ? 1 : 0.5;
			setReset.style.cursor = changed ? 'pointer' : 'default';
		}
		layersettings.appendChild(layerSettingDiv);
	}
}

function getWorldMouse() {
	return {
		x: (mouseX - width / 2) / camera.zoom + camera.x,
		y: (mouseY - height / 2) / camera.zoom + camera.y
	};
}

let editingMarker = null;
function openMarkerEditDialog(marker = null) {
	document.getElementById('rightClickContext').classList.remove('open');
	document.getElementById('markerDialogueScreen').classList.add('open');

	editingMarker = marker;

	const markerNameInput = document.getElementById('markerNameInput');
	markerNameInput.value = marker ? marker.name : '';
	markerNameInput.focus();

	const closeBtn = document.getElementById('closeMarkerDialog');
	if (closeBtn) {
		closeBtn.onclick = () => {
			document.getElementById('markerDialogueScreen').classList.remove('open');
		};
	}

	const owX = document.getElementById('markerOverworldX');
	const owZ = document.getElementById('markerOverworldZ');
	const neX = document.getElementById('markerNetherX');
	const neZ = document.getElementById('markerNetherZ');

	let baseX = marker ? marker.x : (currentDimension === 1 ? rightClickCoords.x * 8 : rightClickCoords.x);
	let baseZ = marker ? marker.z : (currentDimension === 1 ? rightClickCoords.z * 8 : rightClickCoords.z);

	const updateCoords = (dim) => {
		if (dim === 'overworld') {
			neX.value = Math.floor(parseFloat(owX.value || 0) / 8);
			neZ.value = Math.floor(parseFloat(owZ.value || 0) / 8);
		} else {
			owX.value = Math.floor(parseFloat(neX.value || 0) * 8);
			owZ.value = Math.floor(parseFloat(neZ.value || 0) * 8);
		}
	};

	if (currentDimension === 1) {
		// nether
		neX.value = Math.round(baseX / 8);
		neZ.value = Math.round(baseZ / 8);
		owX.value = Math.round(baseX);
		owZ.value = Math.round(baseZ);
	} else {
		// overworld and end
		owX.value = Math.round(baseX);
		owZ.value = Math.round(baseZ);
		neX.value = Math.floor(baseX / 8);
		neZ.value = Math.floor(baseZ / 8);
	}

	owX.oninput = () => updateCoords('overworld');
	owZ.oninput = () => updateCoords('overworld');
	neX.oninput = () => updateCoords('nether');
	neZ.oninput = () => updateCoords('nether');

	const showCoordsContainer = document.getElementById('showCoords');
	showCoordsContainer.innerHTML = '';

	let markerShowCoords = marker ? marker.showCoords : false;
	let coordIcon = createIcon(markerShowCoords ? 'checked' : 'unchecked');
	showCoordsContainer.append(coordIcon, "Show Coordinates");

	showCoordsContainer.onclick = () => {
		markerShowCoords = !markerShowCoords;
		changeIcon(coordIcon, markerShowCoords ? 'checked' : 'unchecked');
	};

	if (marker && marker.color) selectedMarkerColor = marker.color;
	const markerColours = document.getElementById('markerColours');
	markerColours.innerHTML = '';
	markerColors.forEach(colour => {
		let option = createIcon(`worldPin${colour}`);
		option.classList.add('item');
		if (selectedMarkerColor == colour) option.classList.add('selected');

		option.onclick = () => {
			selectedMarkerColor = colour;
			Array.from(markerColours.children).forEach(child => child.classList.remove('selected'));
			option.classList.add('selected');
		};
		markerColours.appendChild(option);
	});

	document.getElementById('saveMarker').onclick = () => {
		const mName = markerNameInput.value.trim();
		let finalX = parseFloat(owX.value);
		let finalZ = parseFloat(owZ.value);

		if (isNaN(finalX)) finalX = 0;
		if (isNaN(finalZ)) finalZ = 0;

		if (editingMarker) {
			editingMarker.name = mName;
			editingMarker.x = finalX;
			editingMarker.z = finalZ;
			editingMarker.color = selectedMarkerColor;
			editingMarker.showCoords = markerShowCoords;
			editingMarker.isSearch = false;
		} else {
			tempMarkers.push({
				x: finalX,
				z: finalZ,
				name: mName,
				color: selectedMarkerColor,
				showCoords: markerShowCoords,
				isSearch: false,
				dim: currentDimension === 2 ? 2 : 0
			});
		}
		document.getElementById('markerDialogueScreen').classList.remove('open');
		updateMapURL();
	};
}

const LOD_ADD = Math.log2(1.33);
const LOD_MULTIPLY = 1.058;

function draw() {
	console.log('drawing');
	update();

	if (isDraggingMap && mouseButton === LEFT) {
		camera.x = originalCameraX + ((originalMouseX - mouseX) / camera.zoom);
		camera.y = originalCameraY + ((originalMouseY - mouseY) / camera.zoom);
		inertiaVel.x = (pmouseX - mouseX) / camera.zoom;
		inertiaVel.y = (pmouseY - mouseY) / camera.zoom;
	}

	const bgCol = layers["Background"].settings.Color.value;
	background(bgCol.r, bgCol.g, bgCol.b);
	noSmooth();
	push();

	translate(width / 2, height / 2);
	scale(camera.zoom);
	translate(-camera.x, -camera.y);

	tilesToDraw.length = 0;
	activeTileKeys.clear();

	const halfWidth = width / 2;
	const halfHeight = height / 2;

	if (cameraVel >= 0) {
		// lod = Math.floor(-Math.log2(camera.zoom / (Math.pow(camera.zoom, -0.1) * 1.5)));
		// lod = Math.floor(-Math.log2(camera.zoom));
		lod = Math.floor(LOD_ADD - LOD_MULTIPLY * Math.log2(camera.zoom));
		lod = Math.max(0, Math.min(10, lod));
	}

	const speed = Math.sqrt((camera.x - lastCamX) ** 2 + (camera.y - lastCamY) ** 2);
	smoothCamVel = (smoothCamVel * 0.9) + (speed * 0.1);
	lastCamX = camera.x;
	lastCamY = camera.y;

	const tileSize = Math.round(512 * 2 ** lod)
	const borderLod = (lod + 2) > 10 ? 10 : lod + 2;

	if (borderLod !== lod && layers["World"].visible && !debugGrid) {
		push();
		opacity(layers["World"].settings.Opacity.value ** 2)
		const borderTileSize = 512 * 2 ** borderLod;
		const borderPadding = 1;

		const borderTLX = Math.floor((camera.x - halfWidth / camera.zoom) / borderTileSize) - borderPadding;
		const borderTLY = Math.floor((camera.y - halfHeight / camera.zoom) / borderTileSize) - borderPadding;
		const borderBRX = Math.floor((camera.x + halfWidth / camera.zoom) / borderTileSize) + borderPadding;
		const borderBRY = Math.floor((camera.y + halfHeight / camera.zoom) / borderTileSize) + borderPadding;

		for (let j = borderTLY; j <= borderBRY; j++) {
			for (let i = borderTLX; i <= borderBRX; i++) {
				const drawX = i * borderTileSize;
				const drawY = j * borderTileSize;
				drawTile(i, j, borderLod, drawX, drawY, borderTileSize, true, true);
			}
		}
		pop();
	}

	const topLeftTileX = Math.floor((camera.x - halfWidth / camera.zoom) / tileSize);
	const topLeftTileY = Math.floor((camera.y - halfHeight / camera.zoom) / tileSize);
	const bottomRightTileX = Math.floor((camera.x + halfWidth / camera.zoom) / tileSize);
	const bottomRightTileY = Math.floor((camera.y + halfHeight / camera.zoom) / tileSize);

	const centerX = (topLeftTileX + bottomRightTileX) / 2;
	const centerY = (topLeftTileY + bottomRightTileY) / 2;

	for (let j = 0; j < (bottomRightTileY - topLeftTileY) + 1; j++) {
		for (let i = 0; i < (bottomRightTileX - topLeftTileX) + 1; i++) {
			const tx = topLeftTileX + i;
			const ty = topLeftTileY + j;

			const dx = tx - centerX;
			const dy = ty - centerY;
			const dist = dx ** 2 + dy ** 2;

			tilesToDraw.push({ tx, ty, dist });
		}
	}

	tilesToDraw.sort((a, b) => a.dist - b.dist);
	const isFastMoving = Math.abs(cameraVel) > 0.005;
	const dynamicDwell = isFastMoving ? 600 : 50;

	if (layers["World"].visible) {
		push();
		opacity(layers["World"].settings.Opacity.value)
		tilesToDraw.forEach((tile) => {
			const drawX = Math.floor(tile.tx * tileSize);
			const drawY = Math.floor(tile.ty * tileSize);
			drawTile(tile.tx, tile.ty, lod, drawX, drawY, Math.floor(tileSize), !isFastMoving, false, dynamicDwell, 'base');
		});
		pop();
	}

	parallax = 0.5 * camera.zoom ** 2;

	if (parallax < 5) {
		overlayOpacity = lerp(overlayOpacity, layers["Obsidian"].settings.Opacity.value, 0.1);
	} else if (layers["Obsidian"].settings.Parallax.value) {
		overlayOpacity = lerp(overlayOpacity, 0, 0.1);
	}

	if (layers["Obsidian"].visible && overlayOpacity > 0) {
		push();
		opacity(overlayOpacity);
		tilesToDraw.forEach((tile) => {
			const drawX = Math.floor(tile.tx * tileSize);
			const drawY = Math.floor(tile.ty * tileSize);

			const dx = drawX - camera.x;
			const dy = drawY - camera.y;

			if (layers["Obsidian"].settings.Parallax.value) {
				const parallaxX = drawX + (dx * parallax);
				const parallaxY = drawY + (dy * parallax);

				const parallaxSize = Math.ceil((tileSize * (1 + parallax)) + 2);
				drawTile(tile.tx, tile.ty, lod, parallaxX, parallaxY, Math.ceil(parallaxSize + 2), !isFastMoving, false, dynamicDwell, 'overlay');
			} else {
				drawTile(tile.tx, tile.ty, lod, drawX, drawY, Math.floor(tileSize), !isFastMoving, false, dynamicDwell, 'overlay');
			}
		});
		pop();
	}

	if (layers["New Chunks"].visible) {
		push();
		opacity(layers["New Chunks"].settings.Opacity.value);
		tilesToDraw.forEach((tile) => {
			const drawX = Math.floor(tile.tx * tileSize);
			const drawY = Math.floor(tile.ty * tileSize);
			drawTile(tile.tx, tile.ty, lod, drawX, drawY, Math.floor(tileSize), !isFastMoving, false, dynamicDwell, 'newchunks');
		});
		pop();
	}

	if (atlasLocations.length > 0) {
		cachedClusters = getClusters();
		lastClusterCamX = camera.x;
		lastClusterCamY = camera.y;
		lastClusterZoom = camera.zoom;
		lastClusterDim = currentDimension;

		push();
		const scaleAmount = 1 / camera.zoom;

		for (let cluster of cachedClusters) {
			if (cluster.count > 1) {
				fill(40, 150, 255, 200);
				stroke(255);
				strokeWeight(4 * scaleAmount);
				let circleSize = (25 + Math.min(cluster.count, 20)) * scaleAmount;
				ellipse(cluster.x, cluster.z, circleSize);

				fill(255);
				noStroke();
				textAlign(CENTER, CENTER);
				textSize(16 * scaleAmount);
				text(cluster.count, cluster.x, cluster.z);
			} else {
				let loc = cluster.original;
				let iconSize = 32 * scaleAmount;

				if (pinIcon && pinIcon.width > 0) {
					if (loc.name == 'End Portal') {
						image(pinEnd, cluster.x - iconSize / 2 + 0.5, cluster.z - iconSize + 0.5, iconSize, iconSize);
					} else {
						image(pinIcon, cluster.x - iconSize / 2 + 0.5, cluster.z - iconSize + 0.5, iconSize, iconSize);
					}
				}

				if (camera.zoom > 0.001) {
					fill(255);
					stroke(0);
					strokeWeight(4 * scaleAmount);
					textAlign(CENTER, BOTTOM);
					textSize(18 * scaleAmount);
					text(loc.name, cluster.x, cluster.z - iconSize - (4 * scaleAmount));
				}
			}
		}
		pop();
	}

	push()
	const scaleAmount = 1 / camera.zoom;
	const wMouse = getWorldMouse();
	let iconSize = 32 * scaleAmount;

	const isContextMenuOpen = document.getElementById('rightClickContext').classList.contains('open');
	if (!isContextMenuOpen) {
		activeHoveredMarker = null;
		for (let i = tempMarkers.length - 1; i >= 0; i--) {
			let m = tempMarkers[i];
			let mDim = m.dim !== undefined ? m.dim : 0;
			if ((mDim === 2) !== (currentDimension === 2)) continue;

			let mx = currentDimension === 1 ? m.x / 8 : m.x;
			let mz = currentDimension === 1 ? m.z / 8 : m.z;

			if (wMouse.x >= mx - iconSize / 2 && wMouse.x <= mx + iconSize / 2 &&
				wMouse.y >= mz - iconSize && wMouse.y <= mz) {
				activeHoveredMarker = m;
				break;
			}
		}
	}

	tempMarkers.forEach(marker => {
		let mDim = marker.dim !== undefined ? marker.dim : 0;
		if ((mDim === 2) !== (currentDimension === 2)) return;

		let mx = marker.x;
		let mz = marker.z;
		if (currentDimension === 1) { mx /= 8; mz /= 8; }

		let img = markerIcons[marker.color];
		image(img, mx - iconSize / 2 + 0.5, mz - iconSize + 0.5, iconSize, iconSize);

		if (camera.zoom > 0.001) {
			fill(255);
			stroke(marker.color || '#ff0000');
			strokeWeight(4 * scaleAmount);
			textAlign(CENTER, BOTTOM);
			textSize(18 * scaleAmount);

			let displayName = marker.name;
			if (marker.isSearch && !displayName) {
				displayName = "";
			} else if (!displayName) {
				displayName = "Custom Pin";
			}

			if (displayName) {
				text(displayName, mx + 0.5, mz + 0.5 - iconSize - (4 * scaleAmount));
			}

			if (marker.showCoords) {
				textSize(14 * scaleAmount);
				let displayX = Math.round(mx);
				let displayZ = Math.round(mz);
				let coordString = `${displayX}, ${displayZ}`;

				textAlign(CENTER, TOP);
				text(coordString, mx + 0.5, mz + 0.5 + (4 * scaleAmount));
			}
		}
	});
	pop();

	pop();

	if (frameCount % 120 == 0) {
		pruneCache();
	}

	for (let key of inFlightRequests) {
		if (!activeTileKeys.has(key)) {
			abortTile(key);
		}
	}

	let displayX = Math.round(wMouse.x);
	let displayY = Math.round(wMouse.y);

	if (displayX !== lastDisplayX || displayY !== lastDisplayY) {
		if (currentDimension == 0 || currentDimension == 2) {
			coordinateText.innerText = `${displayX} ${displayY}`;
			coordinateTextNether.innerText = `${Math.round(displayX / 8)} ${Math.round(displayY / 8)}`;
		} else {
			coordinateText.innerText = `${displayX * 8} ${displayY * 8}`;
			coordinateTextNether.innerText = `${displayX} ${displayY}`;
		}
		lastDisplayX = displayX;
		lastDisplayY = displayY;
	}

	if (currentDimension == 2) {
		document.getElementById('netherCoordinates').style.display = 'none';
		changeIcon(document.getElementById('overworldCoordinates').firstElementChild, 'enderchest');
	} else {
		document.getElementById('netherCoordinates').style.display = 'flex';
		changeIcon(document.getElementById('overworldCoordinates').firstElementChild, 'world');
	}

	mouseScrollX = 0;
	mouseScrollY = 0;
}

function mousePressed(event) {
	if (event.target.tagName.toLowerCase() === 'canvas') {
		searchClickX = mouseX;
		searchClickY = mouseY;
		if (activeHoveredMarker && mouseButton === LEFT) {
			let mx = currentDimension === 1 ? activeHoveredMarker.x / 8 : activeHoveredMarker.x;
			let mz = currentDimension === 1 ? activeHoveredMarker.z / 8 : activeHoveredMarker.z;
			targetCam = { x: mx, y: mz, zoom: 1.1 };
			return;
		} else if (mouseButton === LEFT) {
			const wMouse = getWorldMouse();
			const currentScale = 1 / camera.zoom;
			const iconHitbox = 32 * currentScale;
			if (atlasLocations.length > 0) {
				cachedClusters = getClusters();
				lastClusterCamX = camera.x;
				lastClusterCamY = camera.y;
				lastClusterZoom = camera.zoom;
				lastClusterDim = currentDimension;

				for (let cluster of cachedClusters) {
					if (cluster.count < 2) {
						if (wMouse.x >= cluster.x - iconHitbox / 2 && wMouse.x <= cluster.x + iconHitbox / 2 &&
							wMouse.y >= cluster.z - iconHitbox && wMouse.y <= cluster.z) {
							targetCam = { x: cluster.x, y: cluster.z, zoom: 1.1 };
							return;
						}
					}
				}
			}
		}

		isDraggingMap = true;
		inertiaVel = { x: 0, y: 0 };
		originalMouseX = mouseX;
		originalMouseY = mouseY;
		originalCameraX = camera.x;
		originalCameraY = camera.y;
		targetCam = { x: null, y: null, zoom: null };
	}
}

function mouseReleased(event) {
	if (isDraggingMap) {
		updateMapURL();
		isDraggingMap = false;
	}

	const moveDist = dist(searchClickX, searchClickY, mouseX, mouseY);
	const isActuallyAClick = moveDist < 5;

	if (isActuallyAClick && event.target.tagName.toLowerCase() === 'canvas' && mouseButton === LEFT) {
		const wMouse = getWorldMouse();
		const currentScale = 1 / camera.zoom;
		const iconHitbox = 32 * currentScale;

		if (activeHoveredMarker) {
			let mx = currentDimension === 1 ? activeHoveredMarker.x / 8 : activeHoveredMarker.x;
			let mz = currentDimension === 1 ? activeHoveredMarker.z / 8 : activeHoveredMarker.z;
			targetCam = { x: mx, y: mz, zoom: 1.1 };
			return;
		}

		if (atlasLocations.length > 0) {
			for (let cluster of cachedClusters) {
				if (cluster.count < 2) {
					if (wMouse.x >= cluster.x - iconHitbox / 2 && wMouse.x <= cluster.x + iconHitbox / 2 &&
						wMouse.y >= cluster.z - iconHitbox && wMouse.y <= cluster.z) {
						targetCam = { x: cluster.x, y: cluster.z, zoom: 1.1 };
						return;
					}
				}
			}
		}
	}
}

function mouseWheel(event) {
	isTrackpad = false;
	if (event.wheelDeltaY) {
		if (event.wheelDeltaY === (event.deltaY * -3)) {
			isTrackpad = true;
		}
	} else if (event.deltaMode === 0) {
		isTrackpad = true;
	}
	mouseScrollX = event.deltaX;
	mouseScrollY = event.deltaY;
	targetCam = { x: null, y: null, zoom: null };

	updateMapURL();
	return false;
}

function update() {
	const ZOOM_SMOOTHING = 5;
	const LOG_ZOOM_MIN = -7;
	const LOG_ZOOM_MAX = 4;
	const ROUND_ZOOM = 100000;
	const ROUND_VEL = 10000;

	if (targetCam.x !== null) {
		const dx = targetCam.x - camera.x;
		const dy = targetCam.y - camera.y;

		const distSq = dx * dx + dy * dy;
		const isCentered = distSq < 10000 / camera.zoom;

		if (!isCentered) {
			camera.x += dx * 0.15;
			camera.y += dy * 0.15;
			cameraVel = 0;
		} else {
			camera.x = targetCam.x;
			camera.y = targetCam.y;

			let currentLogZoom = Math.log(camera.zoom);
			let targetLogZoom = Math.log(targetCam.zoom);
			let zoomDiff = targetLogZoom - currentLogZoom;

			if (Math.abs(zoomDiff) > 0.001) {
				camera.zoom = Math.exp(currentLogZoom + zoomDiff * 0.15);
				intendedCamZoom = camera.zoom;
			} else {
				camera.zoom = targetCam.zoom;
				intendedCamZoom = targetCam.zoom;
				targetCam = { x: null, y: null, zoom: null };
				updateMapURL();
			}
		}
	} else if (!isTrackpad) {
		if (!isDraggingMap) {
			camera.x += inertiaVel.x;
			camera.y += inertiaVel.y;

			inertiaVel.x *= friction;
			inertiaVel.y *= friction;

			if (Math.abs(inertiaVel.x) < 0.01) inertiaVel.x = 0;
			if (Math.abs(inertiaVel.y) < 0.01) inertiaVel.y = 0;
		}

		if (Date.now() - timeOfLastPan > 50) {
			const scroll = Math.abs(mouseScrollY) < 50 ? mouseScrollY * 10 : mouseScrollY;

			intendedCamZoom *= Math.exp(scroll / -250);

			const logZoom = Math.log(intendedCamZoom);
			intendedCamZoom = Math.exp(
				Math.min(LOG_ZOOM_MAX, Math.max(LOG_ZOOM_MIN, logZoom))
			);

			const previousZoom = camera.zoom;
			const newZoom = Math.round((previousZoom + (intendedCamZoom - previousZoom) / ZOOM_SMOOTHING) * ROUND_ZOOM) / ROUND_ZOOM;

			const wMouseX = (mouseX - width / 2) / previousZoom + camera.x;
			const wMouseY = (mouseY - height / 2) / previousZoom + camera.y;

			camera.zoom = newZoom;

			camera.x = wMouseX - (mouseX - width / 2) / newZoom;
			camera.y = wMouseY - (mouseY - height / 2) / newZoom;

			cameraVel = Math.round((previousZoom - newZoom) * ROUND_VEL) / ROUND_VEL;
		}
	} else {
		timeOfLastPan = Date.now();
		camera.x += mouseScrollX / camera.zoom;
		camera.y += mouseScrollY / camera.zoom;
		cameraVel = 0;
	}

	checkChanges();
}

function windowResized() {
	let tempCamX = camera.x;
	let tempCamY = camera.y;
	resizeCanvas(windowWidth, windowHeight);
	camera.x = tempCamX;
	camera.y = tempCamY;
}

function tileKey(tileX, tileY, lod, dim) {
	return (BigInt(tileX) & 0x1FFFFFFn) << 35n | (BigInt(tileY) & 0x1FFFFFFn) << 10n | (BigInt(lod) & 0x7Fn) << 3n | (BigInt(dim) & 0x7n);
}

async function loadTile(thisLod, tx, ty, allowLoading = true) {
	const key = tileKey(tx, ty, thisLod, currentDimension);

	if ((tileCache[key] && (tileCache[key].loaded || tileCache[key].failed || tileCache[key].loading)) || !allowLoading || inFlightRequests.has(key)) return;

	const controller = new AbortController();

	if (!tileCache[key]) tileCache[key] = { loading: true, controller: controller };
	inFlightRequests.add(key);

	try {
		const sx = (tx / 32) >> 0;
		const sy = (ty / 32) >> 0;

		const fetchPromises = [];

		if (layers["World"].visible) {
			fetchPromises.push(fetch(`/tiles/base/${thisLod}/${currentDimension}/${sx}/${sy}/t.${tx}.${ty}.webp`, { signal: controller.signal }));
		} else { fetchPromises.push(Promise.resolve(null)); }

		if (layers["Obsidian"].visible) {
			fetchPromises.push(fetch(`/tiles/overlay/${thisLod}/${currentDimension}/${sx}/${sy}/t.${tx}.${ty}.webp`, { signal: controller.signal }));
		} else { fetchPromises.push(Promise.resolve(null)); }

		if (layers["New Chunks"].visible) {
			fetchPromises.push(fetch(`/tiles/newchunks/${thisLod}/${currentDimension}/${sx}/${sy}/t.${tx}.${ty}.webp`, { signal: controller.signal }));
		} else { fetchPromises.push(Promise.resolve(null)); }

		const [resBase, resOverlay, resNewChunks] = await Promise.all(fetchPromises);

		let bitmapBase = null;
		if (resBase && resBase.ok) {
			try { bitmapBase = await createImageBitmap(await resBase.blob()); } catch (err) { }
		}

		let bitmapOverlay = null;
		if (resOverlay && resOverlay.ok) {
			try { bitmapOverlay = await createImageBitmap(await resOverlay.blob()); } catch (err) { }
		}

		let rawNewChunks = null;
		let bitmapNewChunks = null;
		const targetColor = layers["New Chunks"].settings.Color ? layers["New Chunks"].settings.Color.value : { r: 255, g: 0, b: 0 };
		const isInverted = layers["New Chunks"].settings.Invert ? layers["New Chunks"].settings.Invert.value : false;
		const stateKey = `${targetColor.r},${targetColor.g},${targetColor.b},${isInverted}`;

		if (resNewChunks && resNewChunks.ok) {
			try {
				rawNewChunks = await createImageBitmap(await resNewChunks.blob());

				if (tileTintCanvas.width !== rawNewChunks.width) tileTintCanvas.width = rawNewChunks.width;
				if (tileTintCanvas.height !== rawNewChunks.height) tileTintCanvas.height = rawNewChunks.height;

				tileTintCtx.globalCompositeOperation = 'source-over';
				tileTintCtx.clearRect(0, 0, tileTintCanvas.width, tileTintCanvas.height);

				if (!isInverted) {
					tileTintCtx.drawImage(rawNewChunks, 0, 0);
					tileTintCtx.globalCompositeOperation = 'source-atop';
					tileTintCtx.fillStyle = `rgb(${targetColor.r}, ${targetColor.g}, ${targetColor.b})`;
					tileTintCtx.fillRect(0, 0, tileTintCanvas.width, tileTintCanvas.height);
				} else {
					if (bitmapBase) {
						tileTintCtx.drawImage(bitmapBase, 0, 0, rawNewChunks.width, rawNewChunks.height);
						tileTintCtx.globalCompositeOperation = 'source-in';
						tileTintCtx.fillStyle = `rgb(${targetColor.r}, ${targetColor.g}, ${targetColor.b})`;
						tileTintCtx.fillRect(0, 0, tileTintCanvas.width, tileTintCanvas.height);
						tileTintCtx.globalCompositeOperation = 'destination-out';
						tileTintCtx.drawImage(rawNewChunks, 0, 0);
					}
				}

				bitmapNewChunks = await createImageBitmap(tileTintCanvas);
			} catch (err) { }
		}

		tileCache[key] = {
			imgBase: bitmapBase,
			imgOverlay: bitmapOverlay,
			imgNewChunksRaw: rawNewChunks,
			imgNewChunks: null,
			newChunksStateKey: null,
			isRetinting: false,
			loaded: true,
			loading: false,
			lastAccessed: Date.now()
		};

	} catch (e) {
		if (e.name === 'AbortError') return;

		tileCache[key] = {
			loaded: false,
			loading: false,
			failed: true,
			timestamp: Date.now()
		};
	} finally {
		inFlightRequests.delete(key);
	}
}

function drawTile(tx, ty, lod, x, y, size, loadIfUncached = true, loadingForLowQual = false, currentDwell = 500, layer = 'base', targetCtx = window) {
	const speedThreshold = Math.min(6, Math.floor(smoothCamVel / 5));
	const effectiveLod = Math.max(lod, speedThreshold);
	const isAllowedToLoad = loadIfUncached && (lod >= effectiveLod);

	const key = tileKey(tx, ty, lod, currentDimension);

	let tile = tileCache[key];
	if (!tile) {
		tile = { loading: false, loaded: false, failed: false, firstSeen: Date.now(), lastAccessed: Date.now() };
		tileCache[key] = tile;
	} else {
		tile.lastAccessed = Date.now();
	}

	if (isAllowedToLoad) {
		const shouldLoad = !tile.loading && !tile.loaded && !tile.failed && (Date.now() - tile.firstSeen > currentDwell);
		if (shouldLoad) {
			activeTileKeys.add(key);
			loadTile(lod, tx, ty, loadIfUncached);
		}
	}

	if (debugGrid) {
		activeTileKeys.add(key);

		if (layer === 'base') {
			targetCtx.push();
			if (tile.loaded && !tile.failed) {
				targetCtx.fill('#ff00003a');
			} else if (tile.loading) {
				targetCtx.fill('#2bff0018');
			} else {
				targetCtx.noFill();
			}
			tile.loading ? targetCtx.stroke(255, 255, 0) : targetCtx.stroke(255, 0, 0);
			targetCtx.strokeWeight(1 / camera.zoom);
			targetCtx.rect(x, y, size, size);
			targetCtx.noStroke();
			targetCtx.fill('red');
			targetCtx.textSize(12 / camera.zoom);
			targetCtx.text(`${tx}, ${ty}\nLOD: ${lod}`, x + (10 / camera.zoom), y + (20 / camera.zoom));
			targetCtx.pop();
		}
	}

	if (tile.loaded) {
		activeTileKeys.add(key);
		if (!debugGrid) {
			if (layer === 'base') {
				if (tile.imgBase) targetCtx.image(tile.imgBase, x, y, size, size);
				return;
			} else if (layer === 'overlay') {
				if (tile.imgOverlay) {
					targetCtx.image(tile.imgOverlay, x, y, size, size);
				}
				return;
			} else if (layer === 'newchunks') {
				const isInverted = layers["New Chunks"].settings.Invert.value;
				const targetColor = layers["New Chunks"].settings.Color.value;
				const stateKey = `${targetColor.r},${targetColor.g},${targetColor.b},${isInverted}`;

				if (tile.newChunksStateKey !== stateKey && !tile.isRetinting) {
					if (tile.imgNewChunksRaw || (isInverted && tile.imgBase)) {
						tile.isRetinting = true;
						retintQueue.add(tile);
						processRetintQueue();
					}
				}

				if (tile.imgNewChunks) {
					image(tile.imgNewChunks, x, y, size, size);
				}
				return;
			}
		} else {
			return;
		}
	}

	if (tile.failed) return;

	let parentLod = lod + 1;

	while (parentLod <= 10) {
		const lodGap = parentLod - lod;
		const scaleDiff = 1 << lodGap;
		const pTx = Math.floor(tx / scaleDiff);
		const pTy = Math.floor(ty / scaleDiff);
		const pKey = tileKey(pTx, pTy, parentLod, currentDimension);
		const pTile = tileCache[pKey];

		if (pTile && pTile.loaded) {
			activeTileKeys.add(pKey);
			const offsetX = tx - (pTx * scaleDiff);
			const offsetY = ty - (pTy * scaleDiff);
			const sSize = 512 / scaleDiff;
			let sX = Math.floor(offsetX * sSize);
			let sY = Math.floor(offsetY * sSize);
			let sW = Math.ceil(sSize);
			let sH = Math.ceil(sSize);

			if (!debugGrid) {
				if (layer === 'base') {
					if (pTile.imgBase) targetCtx.image(pTile.imgBase, x, y, size, size, sX, sY, sW, sH);
					return;
				} else if (layer === 'overlay') {
					if (pTile.imgOverlay) targetCtx.image(pTile.imgOverlay, x, y, size, size, sX, sY, sW, sH);
					return;
				} else if (layer === 'newchunks') {
					if (pTile.imgNewChunksRaw) {
						const targetColor = layers["New Chunks"].settings.Color.value;
						const isInverted = layers["New Chunks"].settings.Invert.value;
						const stateKey = `${targetColor.r},${targetColor.g},${targetColor.b},${isInverted}`;

						if (pTile.newChunksStateKey !== stateKey && !pTile.isRetinting) {
							pTile.isRetinting = true;
							retintQueue.add(pTile);
							processRetintQueue();
						}
					}

					if (pTile.imgNewChunks) {
						image(pTile.imgNewChunks, x, y, size, size, sX, sY, sW, sH);
					}
					return;
				}
			} else {
				return;
			}
		}
		parentLod++;
	}

	if (!loadingForLowQual && lod > 0) {
		const childLod = lod - 1;
		const childSize = size / 2;
		const childTx = tx * 2;
		const childTy = ty * 2;

		let cKey = tileKey(childTx, childTy, childLod, currentDimension);
		if (tileCache[cKey] && tileCache[cKey].loaded) {
			drawTile(childTx, childTy, childLod, x, y, childSize, false, true, currentDwell, layer, targetCtx);
		}

		cKey = tileKey(childTx + 1, childTy, childLod, currentDimension);
		if (tileCache[cKey] && tileCache[cKey].loaded) {
			drawTile(childTx + 1, childTy, childLod, x + childSize, y, childSize, false, true, currentDwell, layer, targetCtx);
		}

		cKey = tileKey(childTx, childTy + 1, childLod, currentDimension);
		if (tileCache[cKey] && tileCache[cKey].loaded) {
			drawTile(childTx, childTy + 1, childLod, x, y + childSize, childSize, false, true, currentDwell, layer, targetCtx);
		}

		cKey = tileKey(childTx + 1, childTy + 1, childLod, currentDimension);
		if (tileCache[cKey] && tileCache[cKey].loaded) {
			drawTile(childTx + 1, childTy + 1, childLod, x + childSize, y + childSize, childSize, false, true, currentDwell, layer, targetCtx);
		}
	}
}

function abortTile(key) {
	const tile = tileCache[key];
	if (tile && tile.loading && tile.controller) {
		tile.controller.abort();
		delete tileCache[key];
		inFlightRequests.delete(key);
	}
}

function pruneCache() {
	const now = Date.now();
	const expiration = 60000;

	for (let key in tileCache) {
		if (!activeTileKeys.has(key) && !tileCache[key].loading && (now - tileCache[key].lastAccessed > expiration)) {

			if (tileCache[key].imgBase) tileCache[key].imgBase.close();
			if (tileCache[key].imgOverlay) tileCache[key].imgOverlay.close();
			if (tileCache[key].imgNewChunksRaw) tileCache[key].imgNewChunksRaw.close();
			if (tileCache[key].imgNewChunks) tileCache[key].imgNewChunks.close();

			delete tileCache[key];
		}
	}
}

function createIcons() {
	const icons = document.querySelectorAll('icon');
	icons.forEach(icon => {
		const text = icon.textContent;
		const img = document.createElement('img');
		img.src = '/icon/' + text + '.png';
		img.className = 'icon';

		if (icon.id) img.id = icon.id;
		Array.from(icon.attributes).forEach(attr => {
			if (attr.name !== 'src') img.setAttribute(attr.name, attr.value);
		});

		icon.replaceWith(img);
	});
}

window.addEventListener('keydown', (e) => {
	if (document.activeElement && document.activeElement.tagName === 'INPUT') return;

	if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
		e.preventDefault();
		searchInput.focus();
		searchInput.select();
	}
	if (e.shiftKey && e.key.toLowerCase() === 'g') {
		debugGrid = !debugGrid;
	}
	if ((e.key === 'Delete' || e.key === 'Backspace') && activeHoveredMarker) {
		tempMarkers = tempMarkers.filter(m => m !== activeHoveredMarker);
		activeHoveredMarker = null;
		updateMapURL();
	}
	if (e.key.toLowerCase() === 'e' && activeHoveredMarker) {
		e.preventDefault();
		openMarkerEditDialog(activeHoveredMarker);
	}
});

function handleCoordinateSearch(val, createTempMarker = true) {
	const isEnd = val.toLowerCase().includes('end:');
	const isNether = val.toLowerCase().includes('nether:');
	const isOverworld = val.toLowerCase().includes('overworld:');

	const numbers = val.match(/-?\d+(\.\d+)?/g);

	if (numbers && numbers.length >= 2) {
		let x = parseFloat(numbers[0]);
		let z = parseFloat(numbers[numbers.length >= 3 ? 2 : 1]);

		if (!isNaN(x) && !isNaN(z)) {
			if (isNether) {
				currentDimension = 1;
			} else if (isOverworld) {
				currentDimension = 0;
			} else if (isEnd) {
				currentDimension = 2
			}

			if (createTempMarker) {
				tempMarkers = tempMarkers.filter(m => !m.isSearch);
				tempMarkers.push({
					x: currentDimension === 1 ? x * 8 : x,
					z: currentDimension === 1 ? z * 8 : z,
					name: '',
					color: 'Red',
					showCoords: true,
					isSearch: true,
					dim: currentDimension === 2 ? 2 : 0
				});
			}

			targetCam = { x: x, y: z, zoom: 1.1 };
			updateMapURL();
		}
	}
}

function createIcon(icon) {
	let tempIcon = document.createElement("img");
	tempIcon.className = "icon";
	tempIcon.src = `/icon/${icon}.png`;
	return tempIcon;
}

function changeIcon(target, icon) {
	target.src = `/icon/${icon}.png`;
}

function updateOnChange(getter, callback) {
	changeListeners.push({
		getter: getter,
		callback: callback,
		lastValue: getter()
	});
}

function checkChanges() {
	for (let i = 0; i < changeListeners.length; i++) {
		const listener = changeListeners[i];
		const currentValue = listener.getter();

		if (currentValue !== listener.lastValue) {
			listener.callback(currentValue);
			listener.lastValue = currentValue;
		}
	}
}

function setupSlider(imgElement, settingObj, min = 0, max = 1) {
	const minVisual = 3.789062;
	const maxVisual = 95.039063;

	const wrapper = document.createElement('div');
	wrapper.className = 'slider-wrapper';

	const thumb = createIcon('sliderthumb');
	thumb.classList.add('slider-thumb');
	if (settingObj.type == 'hueslider') changeIcon(thumb, 'huethumb');

	imgElement.parentNode.insertBefore(wrapper, imgElement);
	wrapper.appendChild(imgElement);
	wrapper.appendChild(thumb);

	const mapValueToVisual = (val) => {
		const normalized = (val - min) / (max - min);
		return minVisual + (normalized * (maxVisual - minVisual));
	};

	function updatePosition(e) {
		const rect = imgElement.getBoundingClientRect();
		const clientX = e.touches ? e.touches[0].clientX : e.clientX;

		let percent = (clientX - rect.left) / rect.width;
		percent = Math.max(0, Math.min(1, percent));

		settingObj.value = min + (percent * (max - min));

		const visualPercent = mapValueToVisual(settingObj.value);
		thumb.style.left = visualPercent + '%';
	}

	thumb.style.left = mapValueToVisual(settingObj.value) + '%';

	let isDragging = false;
	const startDrag = (e) => { isDragging = true; updatePosition(e); e.preventDefault(); };
	const doDrag = (e) => { if (isDragging) updatePosition(e); };
	const stopDrag = () => { isDragging = false; };

	wrapper.addEventListener('mousedown', startDrag);
	window.addEventListener('mousemove', doDrag);
	window.addEventListener('mouseup', stopDrag);

	wrapper.addEventListener('touchstart', startDrag, { passive: false });
	window.addEventListener('touchmove', doDrag, { passive: false });
	window.addEventListener('touchend', stopDrag);

	updateOnChange(() => settingObj.value, (val) => {
		thumb.style.left = mapValueToVisual(val) + '%';
	});
}

function getClusters() {
	let visibleLocations = [];

	const halfWidth = width / 2;
	const halfHeight = height / 2;
	const margin = 100 * (1 / camera.zoom);
	const viewLeft = camera.x - halfWidth / camera.zoom - margin;
	const viewRight = camera.x + halfWidth / camera.zoom + margin;
	const viewTop = camera.y - halfHeight / camera.zoom - margin;
	const viewBottom = camera.y + halfHeight / camera.zoom + margin;

	for (let loc of atlasLocations) {
		let x = loc.x;
		let z = loc.z;

		if (loc.dim === 0 && currentDimension === 1) { x /= 8; z /= 8; }
		else if (loc.dim === 1 && currentDimension === 0) { x *= 8; z *= 8; }
		else if (loc.dim !== currentDimension) continue;

		if (x > viewLeft && x < viewRight && z > viewTop && z < viewBottom) {
			visibleLocations.push({ x, z, original: loc });
		}
	}

	let clusters = [];
	const distThreshold = CLUSTER_RADIUS_PIXELS / camera.zoom;

	for (let loc of visibleLocations) {
		let foundCluster = false;
		for (let cluster of clusters) {
			let d = Math.sqrt((loc.x - cluster.x) ** 2 + (loc.z - cluster.z) ** 2);
			if (d < distThreshold) {
				cluster.x = (cluster.x * cluster.count + loc.x) / (cluster.count + 1);
				cluster.z = (cluster.z * cluster.count + loc.z) / (cluster.count + 1);
				cluster.count++;
				foundCluster = true;
				break;
			}
		}
		if (!foundCluster) {
			clusters.push({
				x: loc.x,
				z: loc.z,
				count: 1,
				original: loc.original
			});
		}
	}
	return clusters;
}

function getLevenshteinDistance(a, b) {
	const matrix = [];
	for (let i = 0; i <= b.length; i++) matrix[i] = [i];
	for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

	for (let i = 1; i <= b.length; i++) {
		for (let j = 1; j <= a.length; j++) {
			if (b.charAt(i - 1) === a.charAt(j - 1)) {
				matrix[i][j] = matrix[i - 1][j - 1];
			} else {
				matrix[i][j] = Math.min(
					matrix[i - 1][j - 1] + 1,
					matrix[i][j - 1] + 1,
					matrix[i - 1][j] + 1
				);
			}
		}
	}
	return matrix[b.length][a.length];
}

function updateMapURL() {
	const lat = Math.round(camera.x);
	const lng = Math.round(camera.y);
	const camzoom = parseFloat(camera.zoom.toFixed(4));

	const url = new URL(window.location.href);
	url.pathname = `/@${lat},${lng},${camzoom},${currentDimension}`;
	history.replaceState({ lat, lng, camzoom, currentDimension }, "", url.toString());
}

function encodeURL({ lat = Math.round(camera.x), lng = Math.round(camera.y), camzoom = parseFloat(camera.zoom.toFixed(4)) } = {}) {
	lat = Math.round(camera.x);
	lng = Math.round(camera.y);
	camzoom = parseFloat(camera.zoom.toFixed(4));
	const stream = new BitStream();

	stream.writeVarint(zigzag(lat));
	stream.writeVarint(zigzag(lng));
	stream.writeVarint(zigzag(Math.round(camzoom * 10000)));
	stream.writeBits(currentDimension, 2);

	let featureMask = 0;
	if (copyLinkSettings["Include All"]) {
		if (hasLayerSettingsChanged()) featureMask |= 1;

		const searchVal = document.getElementById('search').value.trim();
		if (searchVal && (atlasLocations.length > 0 || getParsedInput(searchVal) !== null)) {
			featureMask |= 2;
		}

		featureMask |= 4;
	} else {
		if (copyLinkSettings["Layer Settings"] && hasLayerSettingsChanged()) featureMask |= 1;
		if (copyLinkSettings["Current Search"]) featureMask |= 2;
		if (copyLinkSettings["Temporary Markers"]) featureMask |= 4;
	}

	if (featureMask > 0) {
		stream.writeVarint(featureMask);

		if (featureMask & 1) {
			for (const name of Object.keys(layers)) {
				const layer = layers[name];
				const visChanged = layer.visible !== layer.defaultVisible;
				stream.writeBits(visChanged ? 1 : 0, 1);
				if (visChanged) stream.writeBits(layer.visible ? 1 : 0, 1);

				if (layer.settings) {
					for (const sName of Object.keys(layer.settings)) {
						const setting = layer.settings[sName];
						const setChanged = setting.value !== setting.defaultValue;
						stream.writeBits(setChanged ? 1 : 0, 1);
						if (setChanged) {
							if (setting.type === 'toggle') {
								stream.writeBits(setting.value ? 1 : 0, 1);
							} else if (setting.type === 'slider') {
								const val = Math.max(0, Math.min(1, setting.value));
								stream.writeBits(Math.round(val * 255), 8);
							} else if (setting.type === 'colorpicker') {
								stream.writeBits(setting.value.r, 8);
								stream.writeBits(setting.value.g, 8);
								stream.writeBits(setting.value.b, 8);
							}
						}
					}
				}
			}
		}
		if (featureMask & 2) {
			let saveSearch = document.getElementById('search').value.trim();
			const parsed = getParsedInput(saveSearch);
			if (atlasLocations.length === 0 && parsed !== null) {
				if (parsed.dim) saveSearch = `${parsed.dim}: ${parsed.x}, ${parsed.z}`;
				else saveSearch = `${parsed.x}, ${parsed.z}`;
			}
			stream.writeString(saveSearch);
		}
		if (featureMask & 4) {
			stream.writeVarint(tempMarkers.length);
			tempMarkers.forEach(m => {
				stream.writeVarint(zigzag(Math.round(m.x)));
				stream.writeVarint(zigzag(Math.round(m.z)));

				let colorIdx = markerColors.indexOf(m.color);
				if (colorIdx === -1) colorIdx = 0;
				stream.writeBits(colorIdx, 3);
				stream.writeBits(m.showCoords ? 1 : 0, 1);
				stream.writeString(m.name || "");
			});
		}
	}

	return base64UrlEncode(stream.getUint8Array());
}

function decodeURL(base64String) {
	if (!base64String) return null;

	const bytes = base64UrlDecode(base64String);
	const stream = new BitStream(bytes);

	const lat = unzigzag(stream.readVarint());
	const lng = unzigzag(stream.readVarint());
	const zoomRaw = unzigzag(stream.readVarint());
	const currentDimension = stream.readBits(2);

	let decodedLayers = null;
	let search = null;

	if (stream.hasMore()) {
		const featureMask = stream.readVarint();

		if (featureMask & 1) {
			decodedLayers = {};
			for (const name of Object.keys(layers)) {
				let visible = layers[name].defaultVisible;
				const visChanged = stream.readBits(1) === 1;
				if (visChanged) visible = stream.readBits(1) === 1;

				const settings = {};
				if (layers[name].settings) {
					for (const sName of Object.keys(layers[name].settings)) {
						const type = layers[name].settings[sName].type;
						let val = layers[name].settings[sName].defaultValue;

						const setChanged = stream.readBits(1) === 1;
						if (setChanged) {
							if (type === 'toggle') {
								val = stream.readBits(1) === 1;
							} else if (type === 'slider') {
								val = stream.readBits(8) / 255;
							} else if (type === 'colorpicker') {
								let r = stream.readBits(8);
								let g = stream.readBits(8);
								let b = stream.readBits(8);
								let [h, s, v] = rgbToHsv(r, g, b);
								val = { r, g, b, h, s, v };
							}
						}
						settings[sName] = val;
					}
				}
				decodedLayers[name] = { visible, settings };
			}
		}

		if (featureMask & 2) {
			search = stream.readString();
		}

		if (featureMask & 4) {
			const count = stream.readVarint();
			for (let i = 0; i < count; i++) {
				const mx = unzigzag(stream.readVarint());
				const mz = unzigzag(stream.readVarint());
				const colorIdx = stream.readBits(3);
				const showCoords = stream.readBits(1) === 1;
				const mName = stream.readString();

				tempMarkers.push({
					x: mx,
					z: mz,
					color: markerColors[colorIdx] || 'Red',
					showCoords: showCoords,
					name: mName,
					dim: currentDimension === 2 ? 2 : 0
				});
			}
		}
	}

	return {
		lat,
		lng,
		camzoom: zoomRaw / 10000,
		currentDimension,
		layers: decodedLayers,
		search: search
	};
}

class BitStream {
	constructor(uint8Array = null) {
		this.bytes = uint8Array ? Array.from(uint8Array) : [];
		this.byteIdx = 0;
		this.bitPos = 0;
	}

	hasMore() {
		return this.byteIdx < this.bytes.length;
	}

	writeBits(val, count) {
		for (let i = 0; i < count; i++) {
			if (this.bitPos === 0) this.bytes.push(0);

			const bit = (val >> (count - i - 1)) & 1;
			if (bit) {
				this.bytes[this.bytes.length - 1] |= (1 << (7 - this.bitPos));
			}

			this.bitPos++;
			if (this.bitPos === 8) this.bitPos = 0;
		}
	}

	readBits(count) {
		let val = 0;
		for (let i = 0; i < count; i++) {
			const bit = (this.bytes[this.byteIdx] >> (7 - this.bitPos)) & 1;
			val = (val << 1) | bit;

			this.bitPos++;
			if (this.bitPos === 8) {
				this.bitPos = 0;
				this.byteIdx++;
			}
		}
		return val;
	}

	writeVarint(num) {
		let more = true;
		while (more) {
			let chunk = num & 0x7F;
			num >>>= 7;
			if (num > 0) chunk |= 0x80;
			else more = false;
			this.writeBits(chunk, 8);
		}
	}

	readVarint() {
		let result = 0, shift = 0;
		while (true) {
			const byte = this.readBits(8);
			result |= (byte & 127) << shift;
			if (!(byte & 128)) break;
			shift += 7;
		}
		return result;
	}

	writeString(str) {
		const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ,-:";
		const filteredString = [...str].filter(c => (new Set(ALPHABET)).has(c)).join("")
		this.writeVarint(filteredString.length);
		for (const ch of filteredString) {
			const idx = ALPHABET.indexOf(ch);
			if (idx !== -1) this.writeBits(idx, 6);
		}
	}

	readString() {
		const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ,-:";
		const len = this.readVarint();
		let out = "";
		for (let i = 0; i < len; i++) {
			out += ALPHABET[this.readBits(6)];
		}
		return out;
	}

	getUint8Array() {
		return new Uint8Array(this.bytes);
	}
}

function zigzag(n) {
	return (n << 1) ^ (n >> 31);
}

function unzigzag(n) {
	return (n >>> 1) ^ -(n & 1);
}

function base64UrlEncode(bytes) {
	let binary = "";
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

function base64UrlDecode(str) {
	str = str.replace(/-/g, "+").replace(/_/g, "/");
	while (str.length % 4) str += "=";
	const binary = atob(str);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

function measureRefreshRate(duration = 1000) {
	return new Promise(resolve => {
		let frames = 0;
		let startTime = null;

		function frame(time) {
			if (!startTime) startTime = time;
			frames++;

			if (time - startTime < duration) {
				requestAnimationFrame(frame);
			} else {
				const fps = frames / ((time - startTime) / 1000);
				resolve(fps);
			}
		}

		requestAnimationFrame(frame);
	});
}

let measuredFPS = 60;

async function refreshRateUpdateLoop() {
	const COMMON_REFRESH_RATES = [30, 50, 60, 72, 75, 90, 100, 120, 144, 165, 180, 200, 240, 360];

	while (true) {
		if (document.hidden || !document.hasFocus()) {
			await new Promise(r => setTimeout(r, 1000));
			continue;
		}

		const fps = await measureRefreshRate(500);

		const snapped = COMMON_REFRESH_RATES.reduce((closest, rate) => {
			return Math.abs(rate - fps) < Math.abs(closest - fps) ? rate : closest;
		});

		window.measuredFPS = snapped;

		if (!document.hidden && document.hasFocus()) {
			frameRate(snapped);
		}

		await new Promise(r => setTimeout(r, 2500));
	}
}

function handleVisibilityChange() {
	if (document.hidden || !document.hasFocus()) {
		noLoop();
	} else {
		loop();
	}
}

refreshRateUpdateLoop();

document.addEventListener("visibilitychange", handleVisibilityChange);
window.addEventListener("blur", handleVisibilityChange);
window.addEventListener("focus", handleVisibilityChange);