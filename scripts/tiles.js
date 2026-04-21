function tileKey(tileX, tileY, lod, dim) {
    return (BigInt(tileX) & 0x1FFFFFFn) << 35n | (BigInt(tileY) & 0x1FFFFFFn) << 10n | (BigInt(lod) & 0x7Fn) << 3n | (BigInt(dim) & 0x7n);
}

async function loadTile(thisLod, tx, ty, allowLoading = true) {
    const key = tileKey(tx, ty, thisLod, currentDimension);
    let tile = tileCache[key];
    let needsFetch = false;

    if (tile) {
        if (layers["World"].visible && !tile.fetchedBase) needsFetch = true;
        if (layers["Obsidian"].visible && !tile.fetchedOverlay) needsFetch = true;
        if (layers["New Chunks"].visible && !tile.fetchedNewChunks) needsFetch = true;
    } else needsFetch = true;

    if ((tile && (!needsFetch || tile.loading)) || !allowLoading || inFlightRequests.has(key)) return;

    const controller = new AbortController();
    if (!tile) {
        tile = { loading: true, controller: controller, firstSeen: Date.now(), lastAccessed: Date.now(), fetchedBase: false, fetchedOverlay: false, fetchedNewChunks: false, loaded: false, failed: false };
        tileCache[key] = tile;
    } else {
        tile.loading = true;
        tile.controller = controller;
    }

    inFlightRequests.add(key);
    try {
        const sx = (tx / 32) >> 0;
        const sy = (ty / 32) >> 0;
        const fetchPromises = [];
        const fetchBase = layers["World"].visible && !tile.fetchedBase;
        const fetchOverlay = layers["Obsidian"].visible && !tile.fetchedOverlay;
        const fetchNewChunks = layers["New Chunks"].visible && !tile.fetchedNewChunks;

        if (fetchBase) fetchPromises.push(fetch(`/tiles/base/${thisLod}/${currentDimension}/${sx}/${sy}/t.${tx}.${ty}.webp`, { signal: controller.signal })); else fetchPromises.push(Promise.resolve(null));
        if (fetchOverlay) fetchPromises.push(fetch(`/tiles/overlay/${thisLod}/${currentDimension}/${sx}/${sy}/t.${tx}.${ty}.webp`, { signal: controller.signal })); else fetchPromises.push(Promise.resolve(null));
        if (fetchNewChunks) fetchPromises.push(fetch(`/tiles/newchunks/${thisLod}/${currentDimension}/${sx}/${sy}/t.${tx}.${ty}.webp`, { signal: controller.signal })); else fetchPromises.push(Promise.resolve(null));

        const [resBase, resOverlay, resNewChunks] = await Promise.all(fetchPromises);
        let bitmapBase = tile.imgBase || null;
        if (fetchBase && resBase && resBase.ok) { try { bitmapBase = await createImageBitmap(await resBase.blob()); } catch (err) { } }

        let bitmapOverlay = tile.imgOverlay || null;
        if (fetchOverlay && resOverlay && resOverlay.ok) { try { bitmapOverlay = await createImageBitmap(await resOverlay.blob()); } catch (err) { } }

        let rawNewChunks = tile.imgNewChunksRaw || null;
        let bitmapNewChunks = tile.imgNewChunks || null;
        const targetColor = layers["New Chunks"].settings.Color ? layers["New Chunks"].settings.Color.value : { r: 255, g: 0, b: 0 };
        const isInverted = layers["New Chunks"].settings.Invert ? layers["New Chunks"].settings.Invert.value : false;
        const stateKey = `${targetColor.r},${targetColor.g},${targetColor.b},${isInverted}`;

        if (fetchNewChunks && resNewChunks && resNewChunks.ok) {
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

        tile.imgBase = bitmapBase; tile.imgOverlay = bitmapOverlay; tile.imgNewChunksRaw = rawNewChunks; tile.imgNewChunks = bitmapNewChunks;
        tile.newChunksStateKey = bitmapNewChunks ? stateKey : tile.newChunksStateKey;
        tile.fetchedBase = tile.fetchedBase || layers["World"].visible; tile.fetchedOverlay = tile.fetchedOverlay || layers["Obsidian"].visible; tile.fetchedNewChunks = tile.fetchedNewChunks || layers["New Chunks"].visible;
        tile.loaded = true; tile.loading = false; tile.failed = false; tile.lastAccessed = Date.now();

    } catch (e) {
        if (e.name === 'AbortError') return;
        tile.loaded = tile.loaded || false; tile.loading = false; tile.failed = !tile.loaded; tile.timestamp = Date.now();
    } finally {
        inFlightRequests.delete(key);
    }
}

function drawTile(tx, ty, lod, x, y, size, loadIfUncached = true, loadingForLowQual = false, currentDwell = 500, layer = 'base', targetCtx = window) {
    const speedThreshold = Math.min(6, Math.floor(smoothCamVel / 5));
    const isZoomingFast = Math.abs(cameraVel) > 0.001;
    let isAllowedToLoad = isZoomingFast ? (loadIfUncached && (lod >= 8 || loadingForLowQual)) : (loadIfUncached && (lod >= Math.max(lod, speedThreshold) || lod >= 8 || loadingForLowQual));
    const key = tileKey(tx, ty, lod, currentDimension);

    let tile = tileCache[key];
    if (!tile) {
        tile = { loading: false, loaded: false, failed: false, firstSeen: Date.now(), lastAccessed: Date.now(), fetchedBase: false, fetchedOverlay: false, fetchedNewChunks: false };
        tileCache[key] = tile;
    } else tile.lastAccessed = Date.now();

    activeTileKeys.add(key);

    let needsFetch = false;
    if (layers["World"].visible && !tile.fetchedBase) needsFetch = true;
    if (layers["Obsidian"].visible && !tile.fetchedOverlay) needsFetch = true;
    if (layers["New Chunks"].visible && !tile.fetchedNewChunks) needsFetch = true;

    if (isAllowedToLoad) {
        const actualDwell = (lod >= 8 || isZoomingFast) ? 30 : currentDwell;
        if (!tile.loading && (!tile.loaded || needsFetch) && !tile.failed && (Date.now() - tile.firstSeen > actualDwell)) loadTile(lod, tx, ty, loadIfUncached);
    }

    let hasLayerImage = false; let layerFetched = false;
    if (layer === 'base') { hasLayerImage = !!tile.imgBase; layerFetched = tile.fetchedBase; }
    else if (layer === 'overlay') { hasLayerImage = !!tile.imgOverlay; layerFetched = tile.fetchedOverlay; }
    else if (layer === 'newchunks') {
        const targetColor = layers["New Chunks"].settings.Color.value, isInverted = layers["New Chunks"].settings.Invert.value;
        const stateKey = `${targetColor.r},${targetColor.g},${targetColor.b},${isInverted}`;
        hasLayerImage = tile.imgNewChunks && tile.newChunksStateKey === stateKey; layerFetched = tile.fetchedNewChunks;
        if (layerFetched && !hasLayerImage && (tile.imgNewChunksRaw || (isInverted && tile.imgBase)) && !tile.isRetinting) {
            tile.isRetinting = true; retintQueue.add(tile); processRetintQueue();
        }
    }

    if (debugGrid && layer === 'base') {
        targetCtx.push();
        if (tile.loaded && !tile.failed) targetCtx.fill('#ff00003a'); else if (tile.loading) targetCtx.fill('#2bff0018'); else targetCtx.noFill();
        tile.loading ? targetCtx.stroke(255, 255, 0) : targetCtx.stroke(255, 0, 0);
        targetCtx.strokeWeight(1 / camera.zoom); targetCtx.rect(x, y, size, size);
        targetCtx.noStroke(); targetCtx.fill('red'); targetCtx.textSize(12 / camera.zoom);
        targetCtx.text(`${tx}, ${ty}\nLOD: ${lod}`, x + (10 / camera.zoom), y + (20 / camera.zoom));
        targetCtx.pop();
    }

    if (tile.loaded) {
        if (!debugGrid) {
            if (layerFetched) {
                if (hasLayerImage) {
                    if (layer === 'base') targetCtx.image(tile.imgBase, x, y, size, size);
                    else if (layer === 'overlay') targetCtx.image(tile.imgOverlay, x, y, size, size);
                    else if (layer === 'newchunks') targetCtx.image(tile.imgNewChunks, x, y, size, size);
                }
                return;
            }
        } else return;
    }

    if (tile.failed) return;

    let parentLod = lod + 1;
    while (parentLod <= 10) {
        const scaleDiff = 1 << (parentLod - lod);
        const pTx = Math.floor(tx / scaleDiff), pTy = Math.floor(ty / scaleDiff);
        const pKey = tileKey(pTx, pTy, parentLod, currentDimension);
        const pTile = tileCache[pKey];

        if (pTile && pTile.loaded) {
            activeTileKeys.add(pKey);
            const offsetX = tx - (pTx * scaleDiff), offsetY = ty - (pTy * scaleDiff);
            const sSize = 512 / scaleDiff;
            let sX = Math.floor(offsetX * sSize), sY = Math.floor(offsetY * sSize), sW = Math.ceil(sSize), sH = Math.ceil(sSize);

            let pLayerFetched = false, pHasLayerImage = false;
            if (layer === 'base') { pLayerFetched = pTile.fetchedBase; pHasLayerImage = !!pTile.imgBase; }
            else if (layer === 'overlay') { pLayerFetched = pTile.fetchedOverlay; pHasLayerImage = !!pTile.imgOverlay; }
            else if (layer === 'newchunks') {
                const targetColor = layers["New Chunks"].settings.Color.value, isInverted = layers["New Chunks"].settings.Invert.value;
                const stateKey = `${targetColor.r},${targetColor.g},${targetColor.b},${isInverted}`;
                pLayerFetched = pTile.fetchedNewChunks; pHasLayerImage = pTile.imgNewChunks && pTile.newChunksStateKey === stateKey;
                if (pLayerFetched && !pHasLayerImage && (pTile.imgNewChunksRaw || (isInverted && pTile.imgBase)) && !pTile.isRetinting) {
                    pTile.isRetinting = true; retintQueue.add(pTile); processRetintQueue();
                }
            }

            if (!debugGrid) {
                if (pLayerFetched) {
                    if (pHasLayerImage) {
                        if (layer === 'base') targetCtx.image(pTile.imgBase, x, y, size, size, sX, sY, sW, sH);
                        else if (layer === 'overlay') targetCtx.image(pTile.imgOverlay, x, y, size, size, sX, sY, sW, sH);
                        else if (layer === 'newchunks') targetCtx.image(pTile.imgNewChunks, x, y, size, size, sX, sY, sW, sH);
                    }
                    return;
                }
            } else return;
        }
        parentLod++;
    }

    if (!loadingForLowQual && lod > 0) {
        const childLod = lod - 1, childSize = size / 2, childTx = tx * 2, childTy = ty * 2;
        let cKey = tileKey(childTx, childTy, childLod, currentDimension);
        if (tileCache[cKey] && tileCache[cKey].loaded) drawTile(childTx, childTy, childLod, x, y, childSize, false, true, currentDwell, layer, targetCtx);
        cKey = tileKey(childTx + 1, childTy, childLod, currentDimension);
        if (tileCache[cKey] && tileCache[cKey].loaded) drawTile(childTx + 1, childTy, childLod, x + childSize, y, childSize, false, true, currentDwell, layer, targetCtx);
        cKey = tileKey(childTx, childTy + 1, childLod, currentDimension);
        if (tileCache[cKey] && tileCache[cKey].loaded) drawTile(childTx, childTy + 1, childLod, x, y + childSize, childSize, false, true, currentDwell, layer, targetCtx);
        cKey = tileKey(childTx + 1, childTy + 1, childLod, currentDimension);
        if (tileCache[cKey] && tileCache[cKey].loaded) drawTile(childTx + 1, childTy + 1, childLod, x + childSize, y + childSize, childSize, false, true, currentDwell, layer, targetCtx);
    }
}

function abortTile(key) {
    const tile = tileCache[key];
    if (tile && tile.loading && tile.controller) {
        tile.controller.abort();
        tile.loading = false;
        inFlightRequests.delete(key);
        if (!tile.loaded) delete tileCache[key];
    }
}

function pruneCache() {
    const now = Date.now();
    for (let key in tileCache) {
        if (!activeTileKeys.has(key) && !tileCache[key].loading && (now - tileCache[key].lastAccessed > 60000)) {
            if (tileCache[key].imgBase) tileCache[key].imgBase.close();
            if (tileCache[key].imgOverlay) tileCache[key].imgOverlay.close();
            if (tileCache[key].imgNewChunksRaw) tileCache[key].imgNewChunksRaw.close();
            if (tileCache[key].imgNewChunks) tileCache[key].imgNewChunks.close();
            delete tileCache[key];
        }
    }
}

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
                        if (tile.imgNewChunksRaw) tileTintCtx.drawImage(tile.imgNewChunksRaw, 0, 0);
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
            if (tile.imgNewChunks) { tile.imgNewChunks.close(); tile.imgNewChunks = null; }
            tile.newChunksStateKey = stateKey;
        }
        tile.isRetinting = false;
    }
    isRetintingQueue = false;
}