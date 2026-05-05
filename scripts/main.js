function preload() {
    poppins = loadFont('/media/Poppins-Regular.ttf');
}

function setup() {
    createCanvas(windowWidth, windowHeight, WEBGL);
    textFont(poppins);
    imageMode(CORNER);

    setupAPI();
    setupUI();
    setupUIEvents();
    setupRightClickMenu();
    loadStateFromURL();
    createIcons();
    setupSearchUI();
    setupLayersUI();
    setupShareUI();
    setupColorPickerUI();
    setupColorPickerTabs();
}

function draw() {
    update();
    handleMapDragging();

    const bgCol = layers["Background"].settings.Color.value;
    background(bgCol.r, bgCol.g, bgCol.b);
    noSmooth();
    push();

    translate(width / 2, height / 2);
    scale(camera.zoom);
    translate(-camera.x, -camera.y);

    updateCameraVelocity();
    calculateLOD();

    const { tileSize, borderLod, isFastMoving, dynamicDwell } = getTileRenderingParams();

    drawGridBorders(borderLod, tileSize);
    calculateVisibleTiles(tileSize);
    drawVisibleLayers(tileSize, isFastMoving, dynamicDwell);

    pop();

    drawPinsAndLabels();
    handleHoveredWaypoint();

    if (frameCount % 120 == 0) pruneCache();
    cleanupInFlightRequests();
    updateCoordinateDisplay();

    mouseScrollX = 0;
    mouseScrollY = 0;
}

function update() {
    if (targetCam.x !== null) {
        handleTargetCameraFocus();
    } else if (!isTrackpad) {
        handleCameraInertia();
        handleMouseScrolling();
    } else {
        handleTrackpadPanning();
    }
    checkChanges();
}

function drawPinsAndLabels() {
    if (atlasLocations.length > 0 && !layers["Overlay"].settings["Hide Atlas Waypoints"].value) {
        cachedClusters = getClusters();
        push();
        for (let cluster of cachedClusters) {
            let screenPos = worldToScreen(cluster.x, cluster.z);
            if (cluster.count > 1) {
                fill(40, 150, 255, 200); stroke(255); strokeWeight(2);
                ellipse(screenPos.x, screenPos.y, (25 + Math.min(cluster.count, 20)));
                fill(255); noStroke(); textAlign(CENTER, CENTER); textSize(16);
                text(cluster.count, screenPos.x, screenPos.y);
            } else {
                let loc = cluster.original, iconSize = 32, img = (loc.name == 'End Portal') ? pinEnd : pinIcon;
                if (img && img.width > 0) image(img, screenPos.x - iconSize / 2, screenPos.y - iconSize, iconSize, iconSize);
                fill(255); stroke(0); strokeWeight(3); textAlign(CENTER, BOTTOM); textSize(18);
                text(loc.name, screenPos.x, screenPos.y - iconSize - 4);
            }
        }
        pop();
    } else if (layers["Overlay"].settings["Show All Waypoints"].value && !layers["Overlay"].settings["Hide Atlas Waypoints"].value) {
        cachedClusters = getClusters(true);
        push();
        for (let cluster of cachedClusters) {
            let screenPos = worldToScreen(cluster.x, cluster.z);
            if (cluster.count > 1) {
                fill(40, 150, 255, 200); stroke(255); strokeWeight(2);
                ellipse(screenPos.x, screenPos.y, (25 + Math.min(cluster.count, 20)));
                fill(255); noStroke(); textAlign(CENTER, CENTER); textSize(16);
                text(cluster.count, screenPos.x, screenPos.y);
            } else {
                let loc = cluster.original, iconSize = 32, img = (loc.name == 'End Portal') ? pinEnd : pinIcon;
                if (img && img.width > 0) image(img, screenPos.x - iconSize / 2, screenPos.y - iconSize, iconSize, iconSize);
                fill(255); stroke(0); strokeWeight(3); textAlign(CENTER, BOTTOM); textSize(18);
                text(loc.name, screenPos.x, screenPos.y - iconSize - 4);
            }
        }
        pop();
    }

    push();
    tempWaypoints.forEach(waypoint => {
        if (!layers["Overlay"].settings["Hide Temp Waypoints"].value) {
            let mDim = waypoint.dim !== undefined ? waypoint.dim : 0;
            if ((mDim === 2) !== (currentDimension === 2)) return;

            let mx = waypoint.x, mz = waypoint.z;
            if (currentDimension === 1) { mx /= 8; mz /= 8; }

            let screenPos = worldToScreen(mx, mz), iconSize = 32, img = waypointIcons[waypoint.color];
            image(img, screenPos.x - iconSize / 2, screenPos.y - iconSize, iconSize, iconSize);

            fill(255); stroke(waypoint.color || '#ff0000'); strokeWeight(3); textAlign(CENTER, BOTTOM); textSize(18);
            let displayName = waypoint.name || (waypoint.isSearch ? "" : "Custom Pin");
            if (displayName) text(displayName, screenPos.x, screenPos.y - iconSize - 4);
            if (waypoint.showCoords) { textSize(14); textAlign(CENTER, TOP); text(`${Math.round(mx)}, ${Math.round(mz)}`, screenPos.x, screenPos.y + 4); }
        }
    });
    pop();
}

function mousePressed(event) {
    if (event.target.tagName.toLowerCase() === 'canvas') {
        searchClickX = mouseX; searchClickY = mouseY;
        if (activeHoveredWaypoint && mouseButton === LEFT) {
            let mx = currentDimension === 1 ? activeHoveredWaypoint.x / 8 : activeHoveredWaypoint.x;
            let mz = currentDimension === 1 ? activeHoveredWaypoint.z / 8 : activeHoveredWaypoint.z;
            targetCam = { x: mx, y: mz, zoom: 1.1 };
            return;
        } else if (mouseButton === LEFT) {
            const wMouse = getWorldMouse(), currentScale = 1 / camera.zoom, iconHitbox = 32 * currentScale;
            if (atlasLocations.length > 0 && !layers["Overlay"].settings["Hide Atlas Waypoints"].value) {
                cachedClusters = getClusters();
                lastClusterCamX = camera.x; lastClusterCamY = camera.y; lastClusterZoom = camera.zoom; lastClusterDim = currentDimension;
                for (let cluster of cachedClusters) {
                    if (cluster.count < 2 && wMouse.x >= cluster.x - iconHitbox / 2 && wMouse.x <= cluster.x + iconHitbox / 2 && wMouse.y >= cluster.z - iconHitbox && wMouse.y <= cluster.z) {
                        targetCam = { x: cluster.x, y: cluster.z, zoom: 1.1 };
                        searchState = 'result';
                        loadAtlasResult(findViaUUID(cluster.original.uuid));
                        return;
                    }
                }
            } else if (layers["Overlay"].settings["Show All Waypoints"].value && !layers["Overlay"].settings["Hide Atlas Waypoints"].value) {
                cachedClusters = getClusters(true);
                lastClusterCamX = camera.x; lastClusterCamY = camera.y; lastClusterZoom = camera.zoom; lastClusterDim = currentDimension;
                for (let cluster of cachedClusters) {
                    if (cluster.count < 2 && wMouse.x >= cluster.x - iconHitbox / 2 && wMouse.x <= cluster.x + iconHitbox / 2 && wMouse.y >= cluster.z - iconHitbox && wMouse.y <= cluster.z) {
                        targetCam = { x: cluster.x, y: cluster.z, zoom: 1.1 };
                        searchState = 'result';
                        loadAtlasResult(findViaUUID(cluster.original.uuid));
                        return;
                    }
                }
            }
        }

        isDraggingMap = true; inertiaVel = { x: 0, y: 0 };
        originalMouseX = mouseX; originalMouseY = mouseY;
        originalCameraX = camera.x; originalCameraY = camera.y;
        targetCam = { x: null, y: null, zoom: null };
    }
}

function mouseReleased(event) {
    if (isDraggingMap) { updateMapURL(); isDraggingMap = false; }
    const isActuallyAClick = dist(searchClickX, searchClickY, mouseX, mouseY) < 5;

    if (isActuallyAClick && event.target.tagName.toLowerCase() === 'canvas' && mouseButton === LEFT) {
        const wMouse = getWorldMouse(), currentScale = 1 / camera.zoom, iconHitbox = 32 * currentScale;
        if (activeHoveredWaypoint) {
            let mx = currentDimension === 1 ? activeHoveredWaypoint.x / 8 : activeHoveredWaypoint.x;
            let mz = currentDimension === 1 ? activeHoveredWaypoint.z / 8 : activeHoveredWaypoint.z;
            targetCam = { x: mx, y: mz, zoom: 1.1 };
            return;
        }
        if (atlasLocations.length > 0) {
            for (let cluster of cachedClusters) {
                if (cluster.count < 2 && wMouse.x >= cluster.x - iconHitbox / 2 && wMouse.x <= cluster.x + iconHitbox / 2 && wMouse.y >= cluster.z - iconHitbox && wMouse.y <= cluster.z) {
                    targetCam = { x: cluster.x, y: cluster.z, zoom: 1.1 }; return;
                }
            }
        }
    }
}

function mouseWheel(event) {
    isTrackpad = false;
    if (event.wheelDeltaY) { if (event.wheelDeltaY === (event.deltaY * -3)) isTrackpad = true; }
    else if (event.deltaMode === 0) isTrackpad = true;

    if (event.ctrlKey || event.metaKey) isTrackpad = false;
    mouseScrollX = event.deltaX; mouseScrollY = event.deltaY;
    targetCam = { x: null, y: null, zoom: null };
    updateMapURL();
    return false;
}

function windowResized() {
    let tempCamX = camera.x, tempCamY = camera.y;
    resizeCanvas(windowWidth, windowHeight);
    camera.x = tempCamX; camera.y = tempCamY;
}

window.addEventListener('keydown', (e) => {
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); searchInput.focus(); searchInput.select(); }
    if (e.shiftKey && e.key.toLowerCase() === 'g') debugGrid = !debugGrid;
    if ((e.key === 'Delete' || e.key === 'Backspace') && activeHoveredWaypoint) {
        tempWaypoints = tempWaypoints.filter(m => m !== activeHoveredWaypoint); activeHoveredWaypoint = null; updateMapURL();
    }
    if (e.key.toLowerCase() === 'e' && activeHoveredWaypoint) { e.preventDefault(); openWaypointEditDialog(activeHoveredWaypoint); }
});