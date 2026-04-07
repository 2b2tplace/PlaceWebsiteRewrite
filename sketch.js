let originalMouseX, originalMouseY, originalCameraX, originalCameraY;
let lastCamX = 0, lastCamY = 0;
let lastDisplayX = null, lastDisplayY = null;
let smoothCamVel = 0;
let lod;
let wasPressed = false;
let camera = { x: 0, y: 0, zoom: 0.004 };
let rightClickCoords = { x: 0, z: 0 };
let intendedCamZoom = 0.004;
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
let layers = {
	"World": {
		icon: "world",
		visible: true,
		type: 'base',
		settings: {
			Opacity: { icon: "opacity", type: "slider", value: 1 }
		}
	},
	"Obsidian": {
		icon: "obsidian",
		visible: true,
		type: 'overlay',
		settings: {
			Opacity: { icon: "opacity", type: "slider", value: 1 },
			Parallax: { icon: "parallax", type: "toggle", value: true }
		}
	},
	"New Chunks": {
		icon: "chunkhighlights",
		visible: false,
		type: 'newchunks',
		settings: {
			Opacity: { icon: "opacity", type: "slider", value: 0.5 }
		}
	}
}

let searchPanel;
let selectedSuggestionIndex = 0;
let currentSuggestions = [];
const dimensionOptions = [
	{ id: 'overworld', name: 'Overworld Coordinates', icon: 'world' },
	{ id: 'nether', name: 'Nether Coordinates', icon: 'obsidian' },
	{ id: 'end', name: 'End Coordinates', icon: 'enderchest' }
];

let debounceTimer;
let atlasLocations = [];
let pinIcon;
let renderSuggestions;
let cachedClusters = [];
let lastClusterCamX, lastClusterCamY, lastClusterZoom, lastClusterDim;
const CLUSTER_RADIUS_PIXELS = 60;

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

function fetchAtlasLocations(query) {
	clearTimeout(debounceTimer);
	if (!query) {
		atlasLocations = [];
		if (typeof renderSuggestions === 'function') renderSuggestions();
		return;
	}

	debounceTimer = setTimeout(async () => {
		try {
			const parsed = getParsedInput(query);
			let url = `https://2b2tatlas.com/api/locations.php?rows=100`;

			const isJustCoords = /^(overworld|nether|end)?\s*:?\s*-?\d+(\.\d+)?\s*,?\s*-?\d+(\.\d+)?\s*$/i.test(query.trim());

			if (parsed && isJustCoords) {
				url += `&x=${Math.round(parsed.x)}&z=${Math.round(parsed.z)}`;
				if (parsed.dim === 'end') url += `&dimension=1`;
				else if (parsed.dim === 'overworld') url += `&dimension=0`;
			} else {
				url += `&search=${encodeURIComponent(query)}`;
			}

			const res = await fetch(url);
			if (!res.ok) throw new Error("API responded with " + res.status);
			const data = await res.json();
			atlasLocations = data.map(loc => {
				let dim = 0; // overworld
				if (loc.end_dimension === "1") dim = 2; // end
				return {
					name: loc.name,
					x: parseFloat(loc.x),
					z: parseFloat(loc.z),
					dim: dim,
					uuid: loc.location_uuid,
					desc: loc.description
				};
			});
			if (typeof renderSuggestions === 'function') renderSuggestions();
		} catch (e) {
			console.error("Atlas search failed:", e);
		}
	}, 300);
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
	"Your Markers": false,
	"Keep Existing URL Parameters": false
}

function preload() {
	poppins = loadFont('/media/Poppins-Regular.ttf');
}

function setup() {
	createCanvas(windowWidth, windowHeight, WEBGL);
	textFont(poppins);
	imageMode(CORNER);

	const copycoords = document.getElementById('copycoordinates');
	copycoords.addEventListener("click", () => {
		navigator.clipboard.writeText(`${rightClickCoords.x}, ${rightClickCoords.z}`);
		document.getElementById('rightClickContext').classList.remove('open');
	});

	const copyLink = document.getElementById('copylink');
	copyLink.addEventListener("click", () => {
		document.getElementById('copyLinkText').value = createURL();

		document.getElementById('copyLinkButton').onclick = () => {
			copyToClipboard(createURL());
		}

		document.getElementById('copyLinkScreen').classList.add('open');
		document.getElementById('rightClickContext').classList.remove('open');
	});

	window.addEventListener('mousedown', (e) => {
		const context = document.getElementById('rightClickContext');
		if (!context.contains(e.target)) {
			context.classList.remove('open');
		}
	});

	document.addEventListener('contextmenu', event => {
		if (event.target.tagName.toLowerCase() === 'canvas') {
			event.preventDefault();

			const context = document.getElementById('rightClickContext');
			context.classList.add('open');
			context.style.left = event.clientX + 'px';
			context.style.top = event.clientY + 'px';

			const wMouse = getWorldMouse();
			rightClickCoords.x = Math.round(wMouse.x);
			rightClickCoords.z = Math.round(wMouse.y);
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
		}
	} else {
		camera.zoom = intendedCamZoom;
		camera.x = 0;
		camera.y = 0;
	}

	// element setup
	searchInput = document.getElementById('search');
	searchPanel = document.getElementById('searchPanel');

	pinIcon = loadImage('/icon/pin.png');

	renderSuggestions = () => {
		const parsed = getParsedInput(searchInput.value);
		if (!parsed && atlasLocations.length === 0) {
			searchPanel.classList.remove('open');
			return;
		}

		searchPanel.innerHTML = '';
		currentSuggestions = [];

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
					tag: `${dim.id}: ${parsed.x}, ${parsed.z}`
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
						tag: `${itemData.id}: ${itemData.x}, ${itemData.z}`
					});
				});
			}
		}

		if (atlasLocations.length > 0) {
			atlasLocations.forEach(loc => {
				let dimId = loc.dim === 2 ? 'end' : (loc.dim === 1 ? 'nether' : 'overworld');
				let icon = loc.dim === 2 ? 'enderchest' : (loc.dim === 1 ? 'obsidian' : 'world');
				currentSuggestions.push({
					type: 'location',
					name: loc.name,
					x: loc.x,
					z: loc.z,
					dimId: dimId,
					dim: loc.dim,
					icon: icon,
					tag: `${dimId}: ${loc.x}, ${loc.z}`
				});
			});
		}

		if (selectedSuggestionIndex >= currentSuggestions.length) {
			selectedSuggestionIndex = Math.max(0, currentSuggestions.length - 1);
		}

		let currentSubheading = null;

		currentSuggestions.forEach((sug, index) => {
			let neededSubheading = null;
			if (sug.type === 'coord') neededSubheading = 'Exact Coordinates';
			else if (sug.type === 'coord_converted') neededSubheading = 'Converted';
			else if (sug.type === 'location') neededSubheading = 'Locations';

			if (neededSubheading !== currentSubheading) {
				let sh = document.createElement('div');
				sh.className = 'subheading';
				sh.innerText = neededSubheading;
				searchPanel.appendChild(sh);
				currentSubheading = neededSubheading;
			}

			const item = document.createElement("div");
			item.className = `item ${index === selectedSuggestionIndex ? 'selected' : ''}`;
			item.innerHTML = `
            <img src="/icon/${sug.icon}.png" class="icon">
            <div class="details">
                <div class="name">${sug.name}</div>
                <div class="tag">${sug.tag}</div>
            </div>
        `;
			item.addEventListener('mousedown', (e) => {
				e.preventDefault();
				handleCoordinateSearch(`${sug.dimId}: ${sug.x}, ${sug.z}`);
				searchPanel.classList.remove('open');
			});
			searchPanel.appendChild(item);
		});

		if (currentSuggestions.length > 0) {
			searchPanel.classList.add('open');
		} else {
			searchPanel.classList.remove('open');
		}
	};

	searchInput.addEventListener('input', () => {
		selectedSuggestionIndex = 0;
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
				handleCoordinateSearch(`${sug.dimId}: ${sug.x}, ${sug.z}`);
			} else {
				handleCoordinateSearch(searchInput.value);
			}
			searchInput.blur();
		} else if (e.key === 'Escape') {
			searchInput.blur();
		}
	});

	searchInput.addEventListener('focus', () => {
		fetchAtlasLocations(searchInput.value);
		renderSuggestions();
	});

	searchInput.addEventListener('blur', () => {
		searchPanel.classList.remove('open');
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
		visibilityIcon.style.cursor = "pointer";
		visibilityIcon.addEventListener("click", (e) => {
			layer.visible = !layer.visible;
		});
		updateOnChange(() => layer.visible, (val) => {
			changeIcon(visibilityIcon, val ? "checked" : "unchecked");
		});

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
			if (item.classList.contains('disabled')) return;
			copyLinkSettings[settingName] = !copyLinkSettings[settingName];
			const includeAll = copyLinkSettings["Include All"];

			Object.entries(items).forEach(([name, refs]) => {
				const { item, icon } = refs;
				if (includeAll && name !== "Include All") {
					changeIcon(icon, 'checked');
					item.classList.add('disabled');
				} else {
					changeIcon(icon, copyLinkSettings[name] ? 'checked' : 'unchecked');
					item.classList.remove('disabled');
				}
			});
			document.getElementById('copyLinkText').value = createURL();
			document.getElementById('copyLinkButton').onclick = () => copyToClipboard(createURL());
		});
		copyLinkBody.appendChild(item);
	});
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

	let setting = document.createElement("div");
	setting.className = "setting";

	let reset = createIcon('reset');
	reset.style.opacity = 0.5;
	let icon = createIcon('eye');
	let name = 'Visibility';
	let toggle = createIcon(layer.visible ? 'on' : 'off');
	toggle.classList.add('right');
	toggle.addEventListener("click", (e) => {
		layer.visible = !layer.visible
		changeIcon(e.target, layer.visible ? 'on' : 'off')
	});
	updateOnChange(() => layer.visible, (val) => {
		changeIcon(toggle, val ? 'on' : 'off');
	});

	setting.append(reset, icon, name, toggle);
	layersettings.appendChild(setting);

	for (const item in layer.settings) {
		setting = document.createElement("div");
		setting.className = "setting";

		reset = createIcon('reset');
		reset.style.opacity = 0.5;
		icon = createIcon(layer.settings[item].icon);
		name = item;
		setting.append(reset, icon, name);

		if (layer.settings[item].type == 'toggle') {
			let settingtoggle = createIcon(layer.settings[item].value ? 'on' : 'off');
			settingtoggle.classList.add('right');
			settingtoggle.addEventListener("click", (e) => {
				layer.settings[item].value = !layer.settings[item].value
				changeIcon(e.target, layer.settings[item].value ? 'on' : 'off')
			});
			updateOnChange(() => layer.settings[item].value, (val) => {
				changeIcon(settingtoggle, val ? 'on' : 'off');
			});
			setting.appendChild(settingtoggle);
		} else if (layer.settings[item].type == 'slider') {
			let settingslider = document.createElement("img");
			settingslider.src = '/icon/slider.png';
			settingslider.className = 'slider'
			setting.appendChild(settingslider);
			setupSlider(settingslider, layer.settings[item], 0, 1);
		}
		layersettings.appendChild(setting);
	}
}

function getWorldMouse() {
	return {
		x: (mouseX - width / 2) / camera.zoom + camera.x,
		y: (mouseY - height / 2) / camera.zoom + camera.y
	};
}

function draw() {
	update();

	if (mouseIsPressed && mouseButton === LEFT) {
		if (!wasPressed) {
			originalMouseX = mouseX;
			originalMouseY = mouseY;
			originalCameraX = camera.x;
			originalCameraY = camera.y;
			wasPressed = true;
		} else {
			camera.x = originalCameraX + ((originalMouseX - mouseX) / camera.zoom);
			camera.y = originalCameraY + ((originalMouseY - mouseY) / camera.zoom);
		}
	} else {
		if (wasPressed) {
			updateMapURL();
			wasPressed = false;
		}
	}

	background('black');
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
		lod = Math.floor(-Math.log2(camera.zoom / (Math.pow(camera.zoom, -0.1) * 1.5)));
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
		const moved = abs(camera.x - lastClusterCamX) > (1 / camera.zoom) ||
			abs(camera.y - lastClusterCamY) > (1 / camera.zoom) ||
			camera.zoom !== lastClusterZoom ||
			currentDimension !== lastClusterDim;

		if (moved) {
			cachedClusters = getClusters();
			lastClusterCamX = camera.x;
			lastClusterCamY = camera.y;
			lastClusterZoom = camera.zoom;
			lastClusterDim = currentDimension;
		}

		push();
		const scaleAmount = 1 / camera.zoom;

		for (let cluster of cachedClusters) {
			if (cluster.count > 1) {
				fill(40, 150, 255, 200);
				stroke(255);
				strokeWeight(2 * scaleAmount);
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
					image(pinIcon, loc.x - iconSize / 2, loc.z - iconSize, iconSize, iconSize);
				}

				if (camera.zoom > 0.001) {
					fill(255);
					stroke(0);
					strokeWeight(2 * scaleAmount);
					textAlign(CENTER, BOTTOM);
					textSize(18 * scaleAmount);
					text(loc.name, loc.x, loc.z - iconSize - (4 * scaleAmount));
				}
			}
		}
		pop();
	}

	pop();

	if (frameCount % 120 == 0) {
		pruneCache();
	}

	for (let key of inFlightRequests) {
		if (!activeTileKeys.has(key)) {
			abortTile(key);
		}
	}

	const wMouse = getWorldMouse();
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
	if (event.target.tagName.toLowerCase() !== 'canvas') {
		wasPressed = false;
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

	updateMapURL();
	return false; // prevent safari default scrolling
}

function update() {
	const ZOOM_SMOOTHING = 5;
	const LOG_ZOOM_MIN = -7;
	const LOG_ZOOM_MAX = 4;
	const ROUND_ZOOM = 100000;
	const ROUND_VEL = 10000;

	if (!isTrackpad) {
		if (Date.now() - timeOfLastPan > 50) {
			const scroll = Math.abs(mouseScrollY) < 50 ? mouseScrollY * 10 : mouseScrollY;

			intendedCamZoom *= Math.exp(scroll / -250);

			const logZoom = Math.log(intendedCamZoom);
			intendedCamZoom = Math.exp(
				Math.min(LOG_ZOOM_MAX, Math.max(LOG_ZOOM_MIN, logZoom))
			);

			const previousZoom = camera.zoom;
			const newZoom = Math.round((previousZoom + (intendedCamZoom - previousZoom) / ZOOM_SMOOTHING) * ROUND_ZOOM) / ROUND_ZOOM;

			camera.zoom = newZoom;

			const zoomRatio = previousZoom / newZoom;
			const wMouse = getWorldMouse();

			camera.x += (wMouse.x - camera.x) * (1 - zoomRatio);
			camera.y += (wMouse.y - camera.y) * (1 - zoomRatio);

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

		let bitmapNewChunks = null;
		if (resNewChunks && resNewChunks.ok) {
			try { bitmapNewChunks = await createImageBitmap(await resNewChunks.blob()); } catch (err) { }
		}

		if (!bitmapBase && !bitmapOverlay && !bitmapNewChunks) throw new Error("No imagery found");

		tileCache[key] = {
			imgBase: bitmapBase,
			imgOverlay: bitmapOverlay,
			imgNewChunks: bitmapNewChunks,
			loaded: true,
			loading: false,
			lastAccessed: Date.now()
		};

		if (thisLod < lod) {
			console.log(lod, thisLod);
			// inFlightRequests.delete(key);
		}

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

function drawTile(tx, ty, lod, x, y, size, loadIfUncached = true, loadingForLowQual = false, currentDwell = 500, layer = 'base') {
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
			push();
			if (tile.loaded && !tile.failed) {
				fill('#ff00003a');
			} else if (tile.loading) {
				fill('#2bff0018');
			} else {
				noFill();
			}
			tile.loading ? stroke(255, 255, 0) : stroke(255, 0, 0);
			strokeWeight(1 / camera.zoom);
			rect(x, y, size, size);
			noStroke();
			fill('red');
			textSize(12 / camera.zoom);
			text(`${tx}, ${ty}\nLOD: ${lod}`, x + (10 / camera.zoom), y + (20 / camera.zoom));
			pop();
		}
	}

	if (tile.loaded) {
		activeTileKeys.add(key);
		if (!debugGrid) {
			if (layer === 'base') {
				if (tile.imgBase) image(tile.imgBase, x, y, size, size);
				return;
			} else if (layer === 'overlay') {
				if (tile.imgOverlay) image(tile.imgOverlay, x, y, size, size);
				return;
			} else if (layer === 'newchunks') {
				if (tile.imgNewChunks) image(tile.imgNewChunks, x, y, size, size);
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
					if (pTile.imgBase) image(pTile.imgBase, x, y, size, size, sX, sY, sW, sH);
					return;
				} else if (layer === 'overlay') {
					if (pTile.imgOverlay) image(pTile.imgOverlay, x, y, size, size, sX, sY, sW, sH);
					return;
				} else if (layer === 'newchunks') {
					if (pTile.imgNewChunks) image(pTile.imgNewChunks, x, y, size, size, sX, sY, sW, sH);
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
			drawTile(childTx, childTy, childLod, x, y, childSize, false, true, currentDwell, layer);
		}

		cKey = tileKey(childTx + 1, childTy, childLod, currentDimension);
		if (tileCache[cKey] && tileCache[cKey].loaded) {
			drawTile(childTx + 1, childTy, childLod, x + childSize, y, childSize, false, true, currentDwell, layer);
		}

		cKey = tileKey(childTx, childTy + 1, childLod, currentDimension);
		if (tileCache[cKey] && tileCache[cKey].loaded) {
			drawTile(childTx, childTy + 1, childLod, x, y + childSize, childSize, false, true, currentDwell, layer);
		}

		cKey = tileKey(childTx + 1, childTy + 1, childLod, currentDimension);
		if (tileCache[cKey] && tileCache[cKey].loaded) {
			drawTile(childTx + 1, childTy + 1, childLod, x + childSize, y + childSize, childSize, false, true, currentDwell, layer);
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
		icon.replaceWith(img);
	});
}

window.addEventListener('keydown', (e) => {
	if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
		e.preventDefault();
		searchInput.focus();
		searchInput.select();
	}
	if (e.shiftKey && e.key.toLowerCase() === 'g') {
		debugGrid = !debugGrid;
		console.log("debug grid:", debugGrid ? "ON" : "OFF");
	}
});

function handleCoordinateSearch(val) {
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

			camera.x = x;
			camera.y = z;
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
		featureMask |= 1;
		featureMask |= 2;
		featureMask |= 4;
	}
	if (copyLinkSettings["Layer Settings"]) featureMask |= 1;
	if (copyLinkSettings["Current Search"]) featureMask |= 2;
	if (copyLinkSettings["Your Markers"]) featureMask |= 4;

	if (featureMask > 0) {
		stream.writeVarint(featureMask);

		if (featureMask & 1) {
			for (const name of Object.keys(layers)) {
				const layer = layers[name];
				stream.writeBits(layer.visible ? 1 : 0, 1);
				if (layer.settings) {
					for (const sName of Object.keys(layer.settings)) {
						const setting = layer.settings[sName];
						if (setting.type === 'toggle') {
							stream.writeBits(setting.value ? 1 : 0, 1);
						} else if (setting.type === 'slider') {
							const val = Math.max(0, Math.min(1, setting.value));
							stream.writeBits(Math.round(val * 255), 8);
						}
					}
				}
			}
		}
		// gonna add current search and your markers later
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

	if (stream.hasMore()) {
		const featureMask = stream.readVarint();
		if (featureMask & 1) {
			decodedLayers = {};
			for (const name of Object.keys(layers)) {
				const visible = stream.readBits(1) === 1;
				const settings = {};
				if (layers[name].settings) {
					for (const sName of Object.keys(layers[name].settings)) {
						const type = layers[name].settings[sName].type;
						if (type === 'toggle') {
							settings[sName] = stream.readBits(1) === 1;
						} else if (type === 'slider') {
							settings[sName] = stream.readBits(8) / 255;
						}
					}
				}
				decodedLayers[name] = { visible, settings };
			}
		}

		// gonna add current search and your markers later
		// if (featureMask & 2) {
		// if (featureMask & 4) {
	}

	return {
		lat,
		lng,
		camzoom: zoomRaw / 10000,
		currentDimension,
		layers: decodedLayers
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

measureRefreshRate().then(fps => {
	const COMMON_REFRESH_RATES = [
		30,
		50,
		60,
		72,
		75,
		90,
		100,
		120,
		144,
		165,
		180,
		200,
		240,
		360
	];
	const snapped = COMMON_REFRESH_RATES.reduce((closest, rate) => {
		return Math.abs(rate - fps) < Math.abs(closest - fps)
			? rate
			: closest;
	});
	frameRate(snapped);
});

function encodeTileRequest(tlX, tlZ, brX, brZ, zoom) {
    const buffer = [];

    const zigzag = (n) => (n << 1) ^ (n >> 31);

    const pushVarint = (value) => {
        let uValue = zigzag(value) >>> 0;
        while (uValue >= 0x80) {
            buffer.push((uValue & 0x7F) | 0x80);
            uValue >>>= 7;
        }
        buffer.push(uValue);
    };

    pushVarint(tlX);
    pushVarint(tlZ);
    pushVarint(brX);
    pushVarint(brZ);

    buffer.push(zoom & 0xFF);

    return new Uint8Array(buffer);
}

const payload = encodeTileRequest(-105, 250, -90, 260, 10);
console.log(payload)