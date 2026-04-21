function handleMapDragging() {
    if (isDraggingMap && mouseButton === LEFT) {
        camera.x = originalCameraX + ((originalMouseX - mouseX) / camera.zoom);
        camera.y = originalCameraY + ((originalMouseY - mouseY) / camera.zoom);
        inertiaVel.x = (pmouseX - mouseX) / camera.zoom;
        inertiaVel.y = (pmouseY - mouseY) / camera.zoom;
    }
}

function updateCameraVelocity() {
    const speed = Math.sqrt((camera.x - lastCamX) ** 2 + (camera.y - lastCamY) ** 2);
    smoothCamVel = (smoothCamVel * 0.9) + (speed * 0.1);
    lastCamX = camera.x;
    lastCamY = camera.y;
}

function calculateLOD() {
    if (cameraVel >= 0) {
        lod = Math.floor(LOD_ADD - LOD_MULTIPLY * Math.log2(camera.zoom));
        lod = Math.max(0, Math.min(10, lod));
    }
}

function getTileRenderingParams() {
    const tileSize = Math.round(512 * 2 ** lod);
    const borderLod = (lod + 2) > 10 ? 10 : lod + 2;
    const isFastMoving = Math.abs(cameraVel) > 0.005;
    const dynamicDwell = isFastMoving ? 600 : 50;
    return { tileSize, borderLod, isFastMoving, dynamicDwell };
}

function drawGridBorders(borderLod, borderTileSizeRaw) {
    if (borderLod !== lod && layers["World"].visible && !debugGrid) {
        push();
        opacity(layers["World"].settings.Opacity.value ** 2);
        const borderTileSize = 512 * 2 ** borderLod;
        const borderPadding = 1;
        const halfWidth = width / 2;
        const halfHeight = height / 2;
        const borderTLX = Math.floor((camera.x - halfWidth / camera.zoom) / borderTileSize) - borderPadding;
        const borderTLY = Math.floor((camera.y - halfHeight / camera.zoom) / borderTileSize) - borderPadding;
        const borderBRX = Math.floor((camera.x + halfWidth / camera.zoom) / borderTileSize) + borderPadding;
        const borderBRY = Math.floor((camera.y + halfHeight / camera.zoom) / borderTileSize) + borderPadding;

        for (let j = borderTLY; j <= borderBRY; j++) {
            for (let i = borderTLX; i <= borderBRX; i++) {
                drawTile(i, j, borderLod, i * borderTileSize, j * borderTileSize, borderTileSize, true, true);
            }
        }
        pop();
    }
}

function calculateVisibleTiles(tileSize) {
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    const topLeftTileX = Math.floor((camera.x - halfWidth / camera.zoom) / tileSize);
    const topLeftTileY = Math.floor((camera.y - halfHeight / camera.zoom) / tileSize);
    const bottomRightTileX = Math.floor((camera.x + halfWidth / camera.zoom) / tileSize);
    const bottomRightTileY = Math.floor((camera.y + halfHeight / camera.zoom) / tileSize);
    const centerX = (topLeftTileX + bottomRightTileX) / 2;
    const centerY = (topLeftTileY + bottomRightTileY) / 2;

    tilesToDraw.length = 0;
    for (let j = 0; j < (bottomRightTileY - topLeftTileY) + 1; j++) {
        for (let i = 0; i < (bottomRightTileX - topLeftTileX) + 1; i++) {
            const tx = topLeftTileX + i;
            const ty = topLeftTileY + j;
            const dist = (tx - centerX) ** 2 + (ty - centerY) ** 2;
            tilesToDraw.push({ tx, ty, dist });
        }
    }
    tilesToDraw.sort((a, b) => a.dist - b.dist);
    return tilesToDraw;
}

function drawVisibleLayers(tileSize, isFastMoving, dynamicDwell) {
    if (layers["World"].visible) {
        push();
        opacity(layers["World"].settings.Opacity.value);
        tilesToDraw.forEach((tile) => {
            drawTile(tile.tx, tile.ty, lod, Math.floor(tile.tx * tileSize), Math.floor(tile.ty * tileSize), Math.floor(tileSize), !isFastMoving, false, dynamicDwell, 'base');
        });
        pop();
    }

    parallax = 0.5 * camera.zoom ** 2;
    if (parallax < 5) overlayOpacity = lerp(overlayOpacity, layers["Obsidian"].settings.Opacity.value, 0.1);
    else if (layers["Obsidian"].settings.Parallax.value) overlayOpacity = lerp(overlayOpacity, 0, 0.1);

    if (layers["Obsidian"].visible && overlayOpacity > 0) {
        push();
        opacity(overlayOpacity);
        tilesToDraw.forEach((tile) => {
            const drawX = Math.floor(tile.tx * tileSize);
            const drawY = Math.floor(tile.ty * tileSize);
            if (layers["Obsidian"].settings.Parallax.value) {
                const parallaxX = drawX + ((drawX - camera.x) * parallax);
                const parallaxY = drawY + ((drawY - camera.y) * parallax);
                drawTile(tile.tx, tile.ty, lod, parallaxX, parallaxY, Math.ceil((tileSize * (1 + parallax)) + 2) + 2, !isFastMoving, false, dynamicDwell, 'overlay');
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
            drawTile(tile.tx, tile.ty, lod, Math.floor(tile.tx * tileSize), Math.floor(tile.ty * tileSize), Math.floor(tileSize), !isFastMoving, false, dynamicDwell, 'newchunks');
        });
        pop();
    }
}

function handleHoveredMarker() {
    push();
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
    pop();
}

function cleanupInFlightRequests() {
    for (let key of inFlightRequests) {
        if (!activeTileKeys.has(key)) abortTile(key);
    }
}

function updateCoordinateDisplay() {
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
}