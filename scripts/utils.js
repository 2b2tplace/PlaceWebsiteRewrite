function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    let max = Math.max(r, g, b), min = Math.min(r, g, b), h, s, v = max, d = max - min;
    s = max === 0 ? 0 : d / max;
    if (max === min) h = 0;
    else {
        switch (max) { case r: h = (g - b) / d + (g < b ? 6 : 0); break; case g: h = (b - r) / d + 2; break; case b: h = (r - g) / d + 4; break; }
        h /= 6;
    }
    return [h, s, v];
}

function hslToRgb(h, s, l) {
    h /= 360; s /= 100; l /= 100; let r, g, b;
    if (s === 0) r = g = b = l;
    else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1; if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1 / 3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function hsvToRgb(h, s, v) {
    let r, g, b, i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = v, g = t, b = p; break; case 1: r = q, g = v, b = p; break; case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break; case 4: r = t, g = p, b = v; break; case 5: r = v, g = p, b = q; break;
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function getWorldMouse() { return { x: (mouseX - width / 2) / camera.zoom + camera.x, y: (mouseY - height / 2) / camera.zoom + camera.y }; }
function worldToScreen(wx, wz) { return { x: (wx - camera.x) * camera.zoom + width / 2, y: (wz - camera.y) * camera.zoom + height / 2 }; }

async function copyToClipboard(text) {
    try {
        if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
        else {
            const textarea = document.createElement("textarea"); textarea.value = text; textarea.style.position = "fixed"; textarea.style.left = "-9999px";
            document.body.appendChild(textarea); textarea.focus(); textarea.select(); document.execCommand("copy"); document.body.removeChild(textarea);
        }
        const element = document.getElementById('copyPopup'); element.classList.add("animate");
        setTimeout(() => { element.classList.remove("animate"); }, 1000); return true;
    } catch (err) { return false; }
}

function createIcon(icon) {
    let tempIcon = document.createElement("img"); tempIcon.className = "icon"; tempIcon.src = `/icon/${icon}.png`; return tempIcon;
}

function changeIcon(target, icon) { target.src = `/icon/${icon}.png`; }

function createIcons() {
    document.querySelectorAll('icon').forEach(icon => {
        const img = document.createElement('img'); img.src = '/icon/' + icon.textContent + '.png'; img.className = 'icon';
        if (icon.id) img.id = icon.id;
        Array.from(icon.attributes).forEach(attr => { if (attr.name !== 'src') img.setAttribute(attr.name, attr.value); });
        icon.replaceWith(img);
    });
}

function updateOnChange(getter, callback) { changeListeners.push({ getter: getter, callback: callback, lastValue: getter() }); }

function checkChanges() {
    for (let i = 0; i < changeListeners.length; i++) {
        const listener = changeListeners[i], currentValue = listener.getter();
        if (currentValue !== listener.lastValue) { listener.callback(currentValue); listener.lastValue = currentValue; }
    }
}

function measureRefreshRate(duration = 1000) {
    return new Promise(resolve => {
        let frames = 0, startTime = null;
        function frame(time) {
            if (!startTime) startTime = time; frames++;
            if (time - startTime < duration) requestAnimationFrame(frame);
            else resolve(frames / ((time - startTime) / 1000));
        }
        requestAnimationFrame(frame);
    });
}

let measuredFPS = 60;
async function refreshRateUpdateLoop() {
    const COMMON_REFRESH_RATES = [30, 50, 60, 72, 75, 90, 100, 120, 144, 165, 180, 200, 240, 360];
    while (true) {
        if (document.hidden || !document.hasFocus()) { await new Promise(r => setTimeout(r, 1000)); continue; }
        const fps = await measureRefreshRate(500);
        const snapped = COMMON_REFRESH_RATES.reduce((closest, rate) => Math.abs(rate - fps) < Math.abs(closest - fps) ? rate : closest);
        window.measuredFPS = snapped;
        if (!document.hidden && document.hasFocus()) frameRate(snapped);
        await new Promise(r => setTimeout(r, 2500));
    }
}

function handleVisibilityChange() {
    if (document.hidden || !document.hasFocus()) noLoop(); else loop();
}

refreshRateUpdateLoop();
document.addEventListener("visibilitychange", handleVisibilityChange);
window.addEventListener("blur", handleVisibilityChange);
window.addEventListener("focus", handleVisibilityChange);