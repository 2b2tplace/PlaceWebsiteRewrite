const ZOOM_SMOOTHING = 5;
const LOG_ZOOM_MIN = -7;
const LOG_ZOOM_MAX = 4;
const ROUND_ZOOM = 100000;
const ROUND_VEL = 10000;

function handleTargetCameraFocus() {
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
}

function handleCameraInertia() {
    if (!isDraggingMap) {
        camera.x += inertiaVel.x;
        camera.y += inertiaVel.y;
        inertiaVel.x *= friction;
        inertiaVel.y *= friction;
        if (Math.abs(inertiaVel.x) < 0.01) inertiaVel.x = 0;
        if (Math.abs(inertiaVel.y) < 0.01) inertiaVel.y = 0;
    }
}

function handleMouseScrolling() {
    if (Date.now() - timeOfLastPan > 50) {
        const scroll = Math.abs(mouseScrollY) < 50 ? mouseScrollY * 10 : mouseScrollY;
        intendedCamZoom *= Math.exp(scroll / -250);
        const logZoom = Math.log(intendedCamZoom);
        intendedCamZoom = Math.exp(Math.min(LOG_ZOOM_MAX, Math.max(LOG_ZOOM_MIN, logZoom)));

        const previousZoom = camera.zoom;
        const newZoom = Math.round((previousZoom + (intendedCamZoom - previousZoom) / ZOOM_SMOOTHING) * ROUND_ZOOM) / ROUND_ZOOM;

        const wMouseX = (mouseX - width / 2) / previousZoom + camera.x;
        const wMouseY = (mouseY - height / 2) / previousZoom + camera.y;

        camera.zoom = newZoom;
        camera.x = wMouseX - (mouseX - width / 2) / newZoom;
        camera.y = wMouseY - (mouseY - height / 2) / newZoom;
        cameraVel = Math.round((previousZoom - newZoom) * ROUND_VEL) / ROUND_VEL;
    }
}

function handleTrackpadPanning() {
    timeOfLastPan = Date.now();
    camera.x += mouseScrollX / camera.zoom;
    camera.y += mouseScrollY / camera.zoom;
    cameraVel = 0;
}