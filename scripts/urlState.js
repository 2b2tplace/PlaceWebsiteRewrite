function createURL() {
    const baseURL = `${window.location.origin}/@${encodeURL()}`;
    return (copyLinkSettings["Keep Existing URL Parameters"] || copyLinkSettings["Include All"]) ? baseURL + window.location.search : baseURL;
}

function updateMapURL() {
    const lat = Math.round(camera.x), lng = Math.round(camera.y), camzoom = parseFloat(camera.zoom.toFixed(4));
    const url = new URL(window.location.href);
    url.pathname = `/@${lat},${lng},${camzoom},${currentDimension}`;
    history.replaceState({ lat, lng, camzoom, currentDimension }, "", url.toString());
}

function encodeURL({ lat = Math.round(camera.x), lng = Math.round(camera.y), camzoom = parseFloat(camera.zoom.toFixed(4)) } = {}) {
    lat = Math.round(camera.x); lng = Math.round(camera.y); camzoom = parseFloat(camera.zoom.toFixed(4));
    const stream = new BitStream();
    stream.writeVarint(zigzag(lat)); stream.writeVarint(zigzag(lng)); stream.writeVarint(Math.round(camzoom * 10000)); stream.writeBits(currentDimension, 2);

    let featureMask = 0;
    if (copyLinkSettings["Include All"]) {
        if (hasLayerSettingsChanged()) featureMask |= 1;
        const searchVal = document.getElementById('search').value.trim();
        if (searchVal && (atlasLocations.length > 0 || getParsedInput(searchVal) !== null)) featureMask |= 2;
        if (tempMarkers.length > 0) featureMask |= 4;
    } else {
        if (copyLinkSettings["Layer Settings"] && hasLayerSettingsChanged()) featureMask |= 1;
        if (copyLinkSettings["Current Search"]) featureMask |= 2;
        if (copyLinkSettings["Temporary Markers"] && tempMarkers.length > 0) featureMask |= 4;
    }

    if (featureMask > 0) {
        stream.writeVarint(featureMask);
        if (featureMask & 1) {
            for (const name of Object.keys(layers)) {
                const layer = layers[name], visChanged = layer.visible !== layer.defaultVisible;
                stream.writeBits(visChanged ? 1 : 0, 1);
                if (visChanged) stream.writeBits(layer.visible ? 1 : 0, 1);
                if (layer.settings) {
                    for (const sName of Object.keys(layer.settings)) {
                        const setting = layer.settings[sName];
                        let setChanged = setting.type === 'colorpicker' ? (setting.value.r !== setting.defaultValue.r || setting.value.g !== setting.defaultValue.g || setting.value.b !== setting.defaultValue.b) : (setting.value !== setting.defaultValue);
                        stream.writeBits(setChanged ? 1 : 0, 1);
                        if (setChanged) {
                            if (setting.type === 'toggle') stream.writeBits(setting.value ? 1 : 0, 1);
                            else if (setting.type === 'slider') stream.writeBits(Math.round(Math.max(0, Math.min(1, setting.value)) * 255), 8);
                            else if (setting.type === 'colorpicker') { stream.writeBits(setting.value.r, 8); stream.writeBits(setting.value.g, 8); stream.writeBits(setting.value.b, 8); }
                        }
                    }
                }
            }
        }
        if (featureMask & 2) {
            let saveSearch = document.getElementById('search').value.trim();
            const parsed = getParsedInput(saveSearch);
            if (atlasLocations.length === 0 && parsed !== null) saveSearch = parsed.dim ? `${parsed.dim}: ${parsed.x}, ${parsed.z}` : `${parsed.x}, ${parsed.z}`;
            stream.writeString(saveSearch);
        }
        if (featureMask & 4) {
            stream.writeVarint(tempMarkers.length);
            tempMarkers.forEach(m => {
                stream.writeVarint(zigzag(Math.round(m.x))); stream.writeVarint(zigzag(Math.round(m.z)));
                let colorIdx = markerColors.indexOf(m.color);
                stream.writeBits(colorIdx === -1 ? 0 : colorIdx, 3); stream.writeBits(m.showCoords ? 1 : 0, 1); stream.writeString(m.name || "");
            });
        }
    }
    return base64UrlEncode(stream.getUint8Array());
}

function decodeURL(base64String) {
    if (!base64String) return null;
    const stream = new BitStream(base64UrlDecode(base64String));
    const lat = unzigzag(stream.readVarint()), lng = unzigzag(stream.readVarint()), zoomRaw = stream.readVarint(), currentDimension = stream.readBits(2);
    let decodedLayers = null, search = null;

    if (stream.hasMore()) {
        const featureMask = stream.readVarint();
        if (featureMask & 1) {
            decodedLayers = {};
            for (const name of Object.keys(layers)) {
                let visible = layers[name].defaultVisible;
                if (stream.readBits(1) === 1) visible = stream.readBits(1) === 1;
                const settings = {};
                if (layers[name].settings) {
                    for (const sName of Object.keys(layers[name].settings)) {
                        const type = layers[name].settings[sName].type; let val = layers[name].settings[sName].defaultValue;
                        if (stream.readBits(1) === 1) {
                            if (type === 'toggle') val = stream.readBits(1) === 1;
                            else if (type === 'slider') val = stream.readBits(8) / 255;
                            else if (type === 'colorpicker') { let r = stream.readBits(8), g = stream.readBits(8), b = stream.readBits(8), [h, s, v] = rgbToHsv(r, g, b); val = { r, g, b, h, s, v }; }
                        }
                        settings[sName] = val;
                    }
                }
                decodedLayers[name] = { visible, settings };
            }
        }
        if (featureMask & 2) search = stream.readString();
        if (featureMask & 4) {
            const count = stream.readVarint();
            for (let i = 0; i < count; i++) {
                const mx = unzigzag(stream.readVarint()), mz = unzigzag(stream.readVarint()), colorIdx = stream.readBits(3), showCoords = stream.readBits(1) === 1, mName = stream.readString();
                tempMarkers.push({ x: mx, z: mz, color: markerColors[colorIdx] || 'Red', showCoords: showCoords, name: mName, dim: currentDimension === 2 ? 2 : 0 });
            }
        }
    }
    return { lat, lng, camzoom: zoomRaw / 10000, currentDimension, layers: decodedLayers, search: search };
}

function hasLayerSettingsChanged() {
    for (const name in layers) {
        const layer = layers[name];
        if (layer.visible !== layer.defaultVisible) return true;
        if (layer.settings) {
            for (const sName in layer.settings) {
                const setting = layer.settings[sName];
                if (setting.type === 'colorpicker') { if (setting.value.r !== setting.defaultValue.r || setting.value.g !== setting.defaultValue.g || setting.value.b !== setting.defaultValue.b) return true; }
                else { if (setting.value !== setting.defaultValue) return true; }
            }
        }
    }
    return false;
}

class BitStream {
    constructor(uint8Array = null) { this.bytes = uint8Array ? Array.from(uint8Array) : []; this.byteIdx = 0; this.bitPos = 0; }
    hasMore() { return this.byteIdx < this.bytes.length; }
    writeBits(val, count) {
        for (let i = 0; i < count; i++) {
            if (this.bitPos === 0) this.bytes.push(0);
            if ((val >> (count - i - 1)) & 1) this.bytes[this.bytes.length - 1] |= (1 << (7 - this.bitPos));
            this.bitPos++; if (this.bitPos === 8) this.bitPos = 0;
        }
    }
    readBits(count) {
        let val = 0;
        for (let i = 0; i < count; i++) {
            val = (val << 1) | ((this.bytes[this.byteIdx] >> (7 - this.bitPos)) & 1);
            this.bitPos++; if (this.bitPos === 8) { this.bitPos = 0; this.byteIdx++; }
        }
        return val;
    }
    writeVarint(num) {
        let more = true;
        while (more) { let chunk = num & 0x7F; num >>>= 7; if (num > 0) chunk |= 0x80; else more = false; this.writeBits(chunk, 8); }
    }
    readVarint() {
        let result = 0, shift = 0;
        while (true) { const byte = this.readBits(8); result |= (byte & 127) << shift; if (!(byte & 128)) break; shift += 7; }
        return result;
    }
    writeString(str) {
        const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ,-:";
        const filteredString = [...str].filter(c => (new Set(ALPHABET)).has(c)).join("");
        this.writeVarint(filteredString.length);
        for (const ch of filteredString) { const idx = ALPHABET.indexOf(ch); if (idx !== -1) this.writeBits(idx, 6); }
    }
    readString() {
        const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ,-:";
        const len = this.readVarint(); let out = "";
        for (let i = 0; i < len; i++) out += ALPHABET[this.readBits(6)];
        return out;
    }
    getUint8Array() { return new Uint8Array(this.bytes); }
}

function zigzag(n) { return (n << 1) ^ (n >> 31); }
function unzigzag(n) { return (n >>> 1) ^ -(n & 1); }
function base64UrlEncode(bytes) { let binary = ""; for (const b of bytes) binary += String.fromCharCode(b); return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function base64UrlDecode(str) {
    str = str.replace(/-/g, "+").replace(/_/g, "/"); while (str.length % 4) str += "=";
    const binary = atob(str), bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}