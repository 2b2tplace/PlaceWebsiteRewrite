let originalMouseX, originalMouseY, originalCameraX, originalCameraY;
let lod;
let intendedCamZoom = 1;
let tileCache = {};
let cameraVel = 0;
let isTrackpad = false;
let mouseScrollX = 0, mouseScrollY = 0;
let uiElements = {}

function setup() {
	createCanvas(windowWidth, windowHeight, WEBGL);
	textFont(loadFont('pixelFont.ttf'));
	camera.on();
	camera.x = 0;
	camera.y = 0;
	frameRate(120);
	createIcons();
}

function draw() {
	// clear canvas
	background('black');
	camera.on();
	const t = (Math.log(55) - Math.log(camera.zoom)) / (Math.log(55) - Math.log(0.009));
	// 1.6 gives bias towards the lower lods (~ 10)
	if (cameraVel >= 0) lod = Math.floor(Math.pow(t, 1.6) * 10);
	const tileSize = 100 * 2 ** lod
	const borderLod = (lod + 1) > 10 ? 10 : lod + 1;
	if (borderLod !== lod) {
		const borderTileSize = 100 * 2 ** borderLod;
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
	const tilesToDraw = [];


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
	// sort by general distance and draw
	tilesToDraw.sort((a, b) => a.dist - b.dist);
	tilesToDraw.forEach(tile => {
		const drawX = tile.tx * tileSize;
		const drawY = tile.ty * tileSize;
		// if the camera zoom is changing, don't try and load the tile if it's not cached.
		const cameraSpeedThreshold = cameraVel == 0;
		drawTile(tile.tx, tile.ty, lod, drawX, drawY, tileSize, cameraSpeedThreshold, false);
	});

	if (frameCount % 120 == 0) {
		pruneCache();
	}

	// map panning logic
	if (mouse.presses()) {
		originalMouseX = mouseX;
		originalMouseY = mouseY;
		originalCameraX = camera.x;
		originalCameraY = camera.y;
	}
	if (mouseIsPressed) {
		camera.x = (originalCameraX + ((originalMouseX - mouseX) / camera.zoom));
		camera.y = (originalCameraY + ((originalMouseY - mouseY) / camera.zoom));
	}

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
	console.log(mouseScrollX, mouseScrollY, isTrackpad)
	// return required for safari browser to be supported
	return false;
}

function update() {
	if (!isTrackpad) {
		// apply exponential zoom step
		intendedCamZoom *= Math.exp(
			(Math.abs(mouseScrollY) < 50 ? mouseScrollY * 10 : mouseScrollY) / -250
		);
		// clamp in log space
		const logZoom = Math.log(intendedCamZoom);
		const clampedLogZoom = Math.min(4, Math.max(-5, logZoom));
		// convert back
		intendedCamZoom = Math.exp(clampedLogZoom);
		cameraVel = camera.zoom;
		const newZoom = Math.round((camera.zoom + (intendedCamZoom - camera.zoom) / 5) * 1000) / 1000;
		const zoomRatio = camera.zoom / newZoom;
		camera.zoom = newZoom;
		camera.x += (mouse.x - camera.x) * (1 - zoomRatio);
		camera.y += (mouse.y - camera.y) * (1 - zoomRatio);
		cameraVel = Math.round((cameraVel - camera.zoom) * 100) / 100;
	} else {
		camera.x += mouseScrollX / camera.zoom;
		camera.y += mouseScrollY / camera.zoom;
		cameraVel = 0;
	}
	if (camera.zoom > 0.025) {
		noSmooth();
	} else {
		smooth();
	}
}

function windowResized() {
	let tempCamX = camera.x;
	let tempCamY = camera.y;
	resizeCanvas(windowWidth, windowHeight);
	camera.x = tempCamX;
	camera.y = tempCamY;
}

function loadTile(lod, tx, ty, loadIfUncached = true) {
	const key = `${lod}_${tx}_${ty}`;
	if (!tileCache[key] && loadIfUncached) {
		tileCache[key] = {
			imgBase: null,
			imgOverlay: null,
			loaded: false,
			loading: true,
			firstLoaded: null,
			timestamp: Date.now()
		}
		const urlBase = `tiles/base/${lod}/0/0/0/t.${tx}.${ty}.webp`;
		loadImage(urlBase, null, (img) => {
			if (tileCache[key]) {
				tileCache[key].imgBase = loadImage(urlBase)
				tileCache[key].loaded = true;
				tileCache[key].loading = false;
				tileCache[key].firstLoaded = Date.now();
			}
		});
		const urlOverlay = `tiles/overlay/${lod}/0/0/0/t.${tx}.${ty}.webp`;
		loadImage(urlOverlay, null, (img) => {
			if (tileCache[key]) {
				tileCache[key].imgOverlay = loadImage(urlOverlay);
			}
		});
	}
}

function drawTile(tx, ty, lod, x, y, size, loadIfUncached = true, loadingForLowQual = false) {
	loadTile(lod, tx, ty, loadIfUncached);

	const key = `${lod}_${tx}_${ty}`;
	const tile = tileCache[key]
	if (tile && tile.loaded && tile.imgBase) {
		tile.timestamp = Date.now();
		fill('black');
		noStroke();
		rect(x, y, size, size);
		image(tile.imgBase, x, y, size, size);
		if (tile.imgOverlay) {
			image(tile.imgOverlay, x, y, size, size)
		}
		return;
	}

	if (!loadingForLowQual && lod > 0) {
		const childLod = lod - 1;
		const childSize = size / 2;
		const childTx = tx * 2;
		const childTy = ty * 2;

		drawTile(childTx, childTy, childLod, x, y, childSize, false, true);
		drawTile(childTx + 1, childTy, childLod, x + childSize, y, childSize, false, true);
		drawTile(childTx, childTy + 1, childLod, x, y + childSize, childSize, false, true);
		drawTile(childTx + 1, childTy + 1, childLod, x + childSize, y + childSize, childSize, false, true);
	}

	if (tile && tile.loading && Date.now() - tile.timestamp > 5000) {
		// image(loadImage('/errortile.png'), x, y, size, size);
	}
}

function pruneCache() {
	const now = Date.now();
	const expiration = 60000;

	for (let key in tileCache) {
		if (now - tileCache[key].timestamp > expiration) {
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