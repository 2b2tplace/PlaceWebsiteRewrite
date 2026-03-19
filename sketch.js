let originalMouseX, originalMouseY, originalCameraX, originalCameraY;
let lastCamX = 0, lastCamY = 0;
let smoothCamVel = 0;
let lod;
let intendedCamZoom = 1;
let tileCache = {};
let cameraVel = 0;
let isTrackpad = false;
let mouseScrollX = 0, mouseScrollY = 0;
let uiElements = {}
let tilesToDraw = [];
let inFlightRequests = new Set();
let activeTileKeys = new Set();
let currentDimension = 0;
let OVERLAY_DEPTH = 0.5;

// elements
let searchInput;
let coordinateText;

function setup() {
	createCanvas(windowWidth, windowHeight, WEBGL);
	camera.on();
	camera.x = 0;
	camera.y = 0;
	frameRate(120);

	// element setup
	searchInput = document.getElementById('search');
	searchInput.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') {
			handleCoordinateSearch(searchInput.value);
			searchInput.blur();
		}
		if (e.key === 'Escape') {
			searchInput.blur();
		}
	});

	coordinateText = document.getElementById('coordinateText');

	createIcons();
}

function draw() {
	// clear canvas
	background('black');
	camera.on();
	noSmooth();
	tilesToDraw.length = 0;
	activeTileKeys.clear();

	if (cameraVel >= 0) {
		lod = Math.floor(-Math.log2(camera.zoom));
		lod = Math.max(0, Math.min(10, lod));
	}

	// calculate current camera speed
	const speed = Math.sqrt((camera.x - lastCamX) ** 2 + (camera.y - lastCamY) ** 2);
	smoothCamVel = (smoothCamVel * 0.9) + (speed * 0.1);
	lastCamX = camera.x;
	lastCamY = camera.y;

	const tileSize = Math.round(512 * 2 ** lod)
	const borderLod = (lod + 2) > 10 ? 10 : lod + 2;
	if (borderLod !== lod) {
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
	}

	const topLeftTileX = Math.floor((camera.x - halfWidth / camera.zoom) / tileSize);
	const topLeftTileY = Math.floor((camera.y - halfHeight / camera.zoom) / tileSize);
	const bottomRightTileX = Math.floor((camera.x + halfWidth / camera.zoom) / tileSize);
	const bottomRightTileY = Math.floor((camera.y + halfHeight / camera.zoom) / tileSize);
	// to load tiles from center of screen instead of top left to bottom right
	const centerX = (topLeftTileX + bottomRightTileX) / 2;
	const centerY = (topLeftTileY + bottomRightTileY) / 2;

	for (let j = 0; j < (bottomRightTileY - topLeftTileY) + 1; j++) {
		for (let i = 0; i < (bottomRightTileX - topLeftTileX) + 1; i++) {
			const tx = topLeftTileX + i;
			const ty = topLeftTileY + j;

			// no need to sqrt because i dont need perfect distance calc
			const dx = tx - centerX;
			const dy = ty - centerY;
			const dist = dx ** 2 + dy ** 2;

			tilesToDraw.push({ tx, ty, dist });
		}
	}
	// sort tiles
	tilesToDraw.sort((a, b) => a.dist - b.dist);
	const isFastMoving = Math.abs(cameraVel) > 0.005;
	const dynamicDwell = isFastMoving ? 600 : 50;

	// draw base
	tilesToDraw.forEach((tile, index) => {
		const drawX = Math.floor(tile.tx * tileSize);
		const drawY = Math.floor(tile.ty * tileSize);

		drawTile(tile.tx, tile.ty, lod, drawX, drawY, Math.floor(tileSize), !isFastMoving, false, dynamicDwell, 'base');
	});

	OVERLAY_DEPTH = camera.zoom * 0.1
	// overlay
	tilesToDraw.forEach((tile, index) => {
		const drawX = Math.floor(tile.tx * tileSize);
		const drawY = Math.floor(tile.ty * tileSize);
		
		// parallax
		const dx = drawX - camera.x;
		const dy = drawY - camera.y;

		const parallaxX = drawX + (dx * OVERLAY_DEPTH);
		const parallaxY = drawY + (dy * OVERLAY_DEPTH);

		const parallaxSize = Math.ceil((tileSize * (1 + OVERLAY_DEPTH)) + 2);

		drawTile(tile.tx, tile.ty, lod, parallaxX, parallaxY, Math.ceil(parallaxSize + 2), !isFastMoving, false, dynamicDwell, 'overlay');
	});

	if (frameCount % 120 == 0) {
		pruneCache();
	}

	for (let key of inFlightRequests) {
		if (!activeTileKeys.has(key)) {
			abortTile(key);
		}
	}

	// map panning logic
	if (mouse.presses('left')) {
		originalMouseX = mouseX;
		originalMouseY = mouseY;
		originalCameraX = camera.x;
		originalCameraY = camera.y;
	}
	if (mouse.pressing('left')) {
		camera.x = originalCameraX + ((originalMouseX - mouseX) / camera.zoom);
		camera.y = originalCameraY + ((originalMouseY - mouseY) / camera.zoom);
	}

	coordinateText.innerText = `${Math.round(mouse.x)} ${Math.round(mouse.y)}`;

	// reset mouse scroll
	mouseScrollX = 0;
	mouseScrollY = 0;
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
	// includes both X and Y for supported devices
	mouseScrollX = event.deltaX;
	mouseScrollY = event.deltaY;
	// return required for safari browser to be supported
	return false;
}

function update() {
	const ZOOM_SMOOTHING = 5;
	const LOG_ZOOM_MIN = -9;
	const LOG_ZOOM_MAX = 4;
	const ROUND_ZOOM = 100000;
	const ROUND_VEL = 10000;

	if (!isTrackpad) {
		const scroll = Math.abs(mouseScrollY) < 50 ? mouseScrollY * 10 : mouseScrollY;

		intendedCamZoom *= Math.exp(scroll / -250);

		// clamp in log space
		const logZoom = Math.log(intendedCamZoom);
		intendedCamZoom = Math.exp(
			Math.min(LOG_ZOOM_MAX, Math.max(LOG_ZOOM_MIN, logZoom))
		);

		// smooth zoom
		const previousZoom = camera.zoom;

		const newZoom =
			Math.round(
				(previousZoom +
					(intendedCamZoom - previousZoom) / ZOOM_SMOOTHING) *
				ROUND_ZOOM
			) / ROUND_ZOOM;

		camera.zoom = newZoom;

		// zoom towards mouse
		const zoomRatio = previousZoom / newZoom;

		camera.x += (mouse.x - camera.x) * (1 - zoomRatio);
		camera.y += (mouse.y - camera.y) * (1 - zoomRatio);

		// velocity
		cameraVel =
			Math.round((previousZoom - newZoom) * ROUND_VEL) / ROUND_VEL;

	} else {
		// trackpad
		camera.x += mouseScrollX / camera.zoom;
		camera.y += mouseScrollY / camera.zoom;
		cameraVel = 0;
	}
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

async function loadTile(lod, tx, ty, allowLoading = true) {
	const key = tileKey(tx, ty, lod, currentDimension);

	if ((tileCache[key] && (tileCache[key].loaded || tileCache[key].failed || tileCache[key].loading)) || !allowLoading || inFlightRequests.has(key)) return;

	const controller = new AbortController();

	if (!tileCache[key]) tileCache[key] = { loading: true, controller: controller };
	inFlightRequests.add(key);

	try {
		const sx = (tx / 32) >> 0;
		const sy = (ty / 32) >> 0;
		const urlBase = `/tiles/base/${lod}/${currentDimension}/${sx}/${sy}/t.${tx}.${ty}.webp`;
		const urlOverlay = `/tiles/overlay/${lod}/${currentDimension}/${sx}/${sy}/t.${tx}.${ty}.webp`;

		const [resBase, resOverlay] = await Promise.all([
			fetch(urlBase, { signal: controller.signal }),
			fetch(urlOverlay, { signal: controller.signal })
		]);

		if (!resBase.ok) throw new Error(`Base tile ${tx},${ty} not found`);
		const bitmapBase = await createImageBitmap(await resBase.blob());

		// decode if base comes back ok
		let bitmapOverlay = null;
		if (resOverlay.ok) {
			try {
				bitmapOverlay = await createImageBitmap(await resOverlay.blob());
			} catch (err) { }
		}

		// success
		tileCache[key] = {
			imgBase: bitmapBase,
			imgOverlay: bitmapOverlay,
			loaded: true,
			loading: false,
			timestamp: Date.now()
		};

	} catch (e) {
		if (e.name === 'AbortError') {
			return;
		}
		// failed if fetch fails
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
		tile = { loading: false, loaded: false, failed: false, firstSeen: Date.now() };
		tileCache[key] = tile;
	}

	if (layer === 'base' && isAllowedToLoad) {
		const shouldLoad = !tile.loading && !tile.loaded && !tile.failed && (Date.now() - tile.firstSeen > currentDwell);
		if (shouldLoad) {
			activeTileKeys.add(key);
			loadTile(lod, tx, ty, loadIfUncached);
		}
	}

	if (tile && tile.loaded) {
		activeTileKeys.add(key);
		if (layer === 'base' && tile.imgBase) {
			image(tile.imgBase, x, y, size, size);
			return;
		} else if (layer === 'overlay' && tile.imgOverlay) {
			image(tile.imgOverlay, x, y, size, size);
			return;
		}
	}

	if (tile && tile.failed) return;

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

			// draw requested layer
			if (layer === 'base' && pTile.imgBase) {
				image(pTile.imgBase, x, y, size, size, sX, sY, sW, sH);
				return;
			} else if (layer === 'overlay' && pTile.imgOverlay) {
				image(pTile.imgOverlay, x, y, size, size, sX, sY, sW, sH);
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
		drawTile(childTx, childTy, childLod, x, y, childSize, false, true, currentDwell, layer);
		drawTile(childTx + 1, childTy, childLod, x + childSize, y, childSize, false, true, currentDwell, layer);
		drawTile(childTx, childTy + 1, childLod, x, y + childSize, childSize, false, true, currentDwell, layer);
		drawTile(childTx + 1, childTy + 1, childLod, x + childSize, y + childSize, childSize, false, true, currentDwell, layer);
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
	const expiration = 180000;

	for (let key in tileCache) {
		if (!tileCache[key].loading && (now - tileCache[key].timestamp > expiration)) {
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

function keyPressed() {
	if (key === '1') currentDimension = 0;
	else if (key === '2') currentDimension = 1;
	else if (key === '3') currentDimension = 2;
}

window.addEventListener('keydown', (e) => {
	if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
		e.preventDefault();
		searchInput.focus();
		searchInput.select();
	}
});

function handleCoordinateSearch(val) {
	const coords = val.split(/[ ,]+/);
	if (coords.length >= 2) {
		const x = parseFloat(coords[0]);
		const y = parseFloat(coords[1]);

		if (!isNaN(x) && !isNaN(y)) {
			camera.x = x;
			camera.y = y;
		}
	}
}