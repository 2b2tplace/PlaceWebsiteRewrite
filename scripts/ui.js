function openWaypointEditDialog(waypoint = null) {
    document.getElementById('rightClickContext').classList.remove('open');
    document.getElementById('waypointDialogueScreen').classList.add('open');

    editingWaypoint = waypoint;
    const waypointNameInput = document.getElementById('waypointNameInput');
    waypointNameInput.value = waypoint ? waypoint.name : '';
    waypointNameInput.focus();

    const closeBtn = document.getElementById('closeWaypointDialog');
    if (closeBtn) closeBtn.onclick = () => document.getElementById('waypointDialogueScreen').classList.remove('open');

    const owX = document.getElementById('waypointOverworldX'), owZ = document.getElementById('waypointOverworldZ');
    const neX = document.getElementById('waypointNetherX'), neZ = document.getElementById('waypointNetherZ');
    let baseX = waypoint ? waypoint.x : (currentDimension === 1 ? rightClickCoords.x * 8 : rightClickCoords.x);
    let baseZ = waypoint ? waypoint.z : (currentDimension === 1 ? rightClickCoords.z * 8 : rightClickCoords.z);

    const updateCoords = (dim) => {
        if (dim === 'overworld') { neX.value = Math.floor(parseFloat(owX.value || 0) / 8); neZ.value = Math.floor(parseFloat(owZ.value || 0) / 8); }
        else { owX.value = Math.floor(parseFloat(neX.value || 0) * 8); owZ.value = Math.floor(parseFloat(neZ.value || 0) * 8); }
    };

    if (currentDimension === 1) { neX.value = Math.round(baseX / 8); neZ.value = Math.round(baseZ / 8); owX.value = Math.round(baseX); owZ.value = Math.round(baseZ); }
    else { owX.value = Math.round(baseX); owZ.value = Math.round(baseZ); neX.value = Math.floor(baseX / 8); neZ.value = Math.floor(baseZ / 8); }

    owX.oninput = () => updateCoords('overworld'); owZ.oninput = () => updateCoords('overworld');
    neX.oninput = () => updateCoords('nether'); neZ.oninput = () => updateCoords('nether');

    const showCoordsContainer = document.getElementById('showCoords'); showCoordsContainer.innerHTML = '';
    let waypointShowCoords = waypoint ? waypoint.showCoords : false;
    let coordIcon = createIcon(waypointShowCoords ? 'checked' : 'unchecked');
    showCoordsContainer.append(coordIcon, "Show Coordinates");
    showCoordsContainer.onclick = () => { waypointShowCoords = !waypointShowCoords; changeIcon(coordIcon, waypointShowCoords ? 'checked' : 'unchecked'); };

    if (waypoint && waypoint.color) selectedWaypointColor = waypoint.color;
    const waypointColours = document.getElementById('waypointColours'); waypointColours.innerHTML = '';
    waypointColors.forEach(colour => {
        let option = createIcon(`worldPin${colour}`);
        option.classList.add('item');
        if (selectedWaypointColor == colour) option.classList.add('selected');
        option.onclick = () => {
            selectedWaypointColor = colour; Array.from(waypointColours.children).forEach(child => child.classList.remove('selected')); option.classList.add('selected');
        };
        waypointColours.appendChild(option);
    });

    document.getElementById('saveWaypoint').onclick = () => {
        const mName = waypointNameInput.value.trim();
        let finalX = parseFloat(owX.value), finalZ = parseFloat(owZ.value);
        if (isNaN(finalX)) finalX = 0; if (isNaN(finalZ)) finalZ = 0;

        if (editingWaypoint) {
            editingWaypoint.name = mName; editingWaypoint.x = finalX; editingWaypoint.z = finalZ;
            editingWaypoint.color = selectedWaypointColor; editingWaypoint.showCoords = waypointShowCoords; editingWaypoint.isSearch = false;
        } else {
            tempWaypoints.push({ x: finalX, z: finalZ, name: mName, color: selectedWaypointColor, showCoords: waypointShowCoords, isSearch: false, dim: currentDimension === 2 ? 2 : 0 });
        }
        document.getElementById('waypointDialogueScreen').classList.remove('open'); updateMapURL();
    };
}

function configureLayerSettings(layerName, layer) {
    currentLayerSettings = layerName; layersettings.innerHTML = '';
    const layersettingslabel = document.createElement("div"); layersettingslabel.className = "label";
    const close = createIcon('close');
    close.classList.add('close');
    close.addEventListener('click', () => { layersettings.classList.remove('open') });
    layersettingslabel.append(createIcon(layer.icon), `${layerName} Settings`, close); layersettings.append(layersettingslabel);

    if (layer.type !== "background") {
        let setting = document.createElement("div"); setting.className = "setting";
        let reset = createIcon('reset');
        reset.addEventListener("click", () => { if (layer.visible !== layer.defaultVisible) layer.visible = layer.defaultVisible; });

        let icon = createIcon('eye'), name = 'Visibility', toggle = createIcon(layer.visible ? 'on' : 'off');
        toggle.classList.add('right'); toggle.addEventListener("click", () => layer.visible = !layer.visible);

        updateOnChange(() => layer.visible, (val) => {
            changeIcon(toggle, val ? 'on' : 'off');
            reset.style.opacity = (val !== layer.defaultVisible) ? 1 : 0.5; reset.style.cursor = (val !== layer.defaultVisible) ? 'pointer' : 'default';
        });
        reset.style.opacity = (layer.visible !== layer.defaultVisible) ? 1 : 0.5; reset.style.cursor = (layer.visible !== layer.defaultVisible) ? 'pointer' : 'default';
        setting.append(reset, icon, name, toggle); layersettings.appendChild(setting);
    }

    for (const item in layer.settings) {
        let layerSettingDiv = document.createElement("div"); layerSettingDiv.className = "setting";
        const settingObj = layer.settings[item];
        let setReset = createIcon('reset');
        setReset.addEventListener("click", () => { if (settingObj.value !== settingObj.defaultValue) settingObj.value = settingObj.defaultValue; });

        let setIcon = createIcon(settingObj.icon), setName = item;
        layerSettingDiv.append(setReset, setIcon, setName);

        if (settingObj.type == 'toggle') {
            let settingtoggle = createIcon(settingObj.value ? 'on' : 'off'); settingtoggle.classList.add('right');
            settingtoggle.addEventListener("click", () => settingObj.value = !settingObj.value);
            updateOnChange(() => settingObj.value, (val) => {
                changeIcon(settingtoggle, val ? 'on' : 'off');
                setReset.style.opacity = (val !== settingObj.defaultValue) ? 1 : 0.5; setReset.style.cursor = (val !== settingObj.defaultValue) ? 'pointer' : 'default';
            });
            setReset.style.opacity = (settingObj.value !== settingObj.defaultValue) ? 1 : 0.5; setReset.style.cursor = (settingObj.value !== settingObj.defaultValue) ? 'pointer' : 'default';
            layerSettingDiv.appendChild(settingtoggle);
        } else if (settingObj.type == 'slider') {
            let settingslider = document.createElement("img"); settingslider.src = '/icon/slider.png'; settingslider.className = 'slider';
            layerSettingDiv.appendChild(settingslider); setupSlider(settingslider, settingObj, 0, 1);
            updateOnChange(() => settingObj.value, (val) => {
                setReset.style.opacity = (val !== settingObj.defaultValue) ? 1 : 0.5; setReset.style.cursor = (val !== settingObj.defaultValue) ? 'pointer' : 'default';
            });
            setReset.style.opacity = (settingObj.value !== settingObj.defaultValue) ? 1 : 0.5; setReset.style.cursor = (settingObj.value !== settingObj.defaultValue) ? 'pointer' : 'default';
        } else if (settingObj.type == 'colorpicker') {
            let colorSquare = document.createElement("div"); colorSquare.className = 'color-square';
            colorSquare.style.backgroundColor = `rgb(${settingObj.value.r}, ${settingObj.value.g}, ${settingObj.value.b})`;
            layerSettingDiv.appendChild(colorSquare);

            colorSquare.addEventListener("click", (e) => {
                window.activeColorTarget = (newColor) => {
                    settingObj.value = { ...newColor }; colorSquare.style.backgroundColor = `rgb(${newColor.r}, ${newColor.g}, ${newColor.b})`;
                    const changed = (newColor.r !== settingObj.defaultValue.r || newColor.g !== settingObj.defaultValue.g || newColor.b !== settingObj.defaultValue.b);
                    setReset.style.opacity = changed ? 1 : 0.5; setReset.style.cursor = changed ? 'pointer' : 'default'; checkChanges();
                };
                if (window.syncPickerUI) window.syncPickerUI(settingObj.value);
                const pickerUI = document.querySelector('.picker'); pickerUI.style.display = 'flex'; pickerUI.style.zIndex = '999999'; pickerUI.style.position = 'absolute'; pickerUI.style.margin = '0';
                let left = e.clientX + 20, top = e.clientY - 20;
                if (left + 350 > window.innerWidth) left = window.innerWidth - 370; if (top + 513 > window.innerHeight) top = window.innerHeight - 533;
                if (left < 0) left = 10; if (top < 0) top = 10;
                pickerUI.style.left = `${left}px`; pickerUI.style.top = `${top}px`;
            });

            setReset.addEventListener("click", () => {
                settingObj.value = { ...settingObj.defaultValue }; colorSquare.style.backgroundColor = `rgb(${settingObj.value.r}, ${settingObj.value.g}, ${settingObj.value.b})`;
                if (window.syncPickerUI) window.syncPickerUI(settingObj.value); checkChanges();
            });

            const changed = (settingObj.value.r !== settingObj.defaultValue.r || settingObj.value.g !== settingObj.defaultValue.g || settingObj.value.b !== settingObj.defaultValue.b);
            setReset.style.opacity = changed ? 1 : 0.5; setReset.style.cursor = changed ? 'pointer' : 'default';
        }
        layersettings.appendChild(layerSettingDiv);
    }
}

function renderFilterPanel() {
    searchPanel.innerHTML = ''; searchPanel.classList.add('open');
    const label = document.createElement('div'); label.className = 'subheading'; label.innerText = 'Filter Options'; searchPanel.appendChild(label);

    const settingDiv = document.createElement('div'); settingDiv.className = 'item noHover';
    settingDiv.style.cursor = 'default'; settingDiv.style.display = 'flex'; settingDiv.style.flexWrap = 'wrap'; settingDiv.style.justifyContent = 'space-between';

    const resetBtn = createIcon('reset'); resetBtn.style.cursor = 'pointer';
    const sIcon = createIcon(filterSettings.radius.icon);
    const nameDiv = document.createElement('div'); nameDiv.innerText = 'Radius: ' + formatter.format(Math.round(filterSettings.radius.value / 5) * 5);
    nameDiv.style.flexGrow = '1'; nameDiv.style.fontSize = '17px';

    const topRow = document.createElement('div'); topRow.style.display = 'flex'; topRow.style.alignItems = 'center'; topRow.style.gap = '10px';
    topRow.append(resetBtn, sIcon, nameDiv); settingDiv.appendChild(topRow);

    const bottomRow = document.createElement('div'); bottomRow.style.display = 'flex'; bottomRow.style.boxSizing = 'border-box';
    const sliderImg = document.createElement('img'); sliderImg.src = '/icon/slider.png'; sliderImg.className = 'slider';
    bottomRow.appendChild(sliderImg); settingDiv.appendChild(bottomRow); searchPanel.appendChild(settingDiv);

    setupSlider(sliderImg, filterSettings.radius, filterSettings.radius.min, filterSettings.radius.max, true);
    resetBtn.addEventListener('click', () => {
        if (filterSettings.radius.value !== filterSettings.radius.defaultValue) {
            filterSettings.radius.value = filterSettings.radius.defaultValue; nameDiv.innerText = 'Radius: ' + formatter.format(Math.round(filterSettings.radius.value / 5) * 5); fetchAtlasLocations(searchInput.value);
        }
    });

    let fetchTimeout;
    updateOnChange(() => filterSettings.radius.value, (val) => {
        resetBtn.style.opacity = (val !== filterSettings.radius.defaultValue) ? 1 : 0.5; resetBtn.style.cursor = (val !== filterSettings.radius.defaultValue) ? 'pointer' : 'default';
        nameDiv.innerText = 'Radius: ' + formatter.format(Math.round(val / 5) * 5);
        if (searchInput.value) fetchAtlasLocations(searchInput.value, false);
    });

    resetBtn.style.opacity = (filterSettings.radius.value !== filterSettings.radius.defaultValue) ? 1 : 0.5; resetBtn.style.cursor = (filterSettings.radius.value !== filterSettings.radius.defaultValue) ? 'pointer' : 'default';
}

function setupSlider(imgElement, settingObj, min = 0, max = 1, isExp = false) {
    const minVisual = 3.789062, maxVisual = 95.039063;
    const range = max - min, visualRange = maxVisual - minVisual;
    const wrapper = document.createElement('div'); wrapper.className = 'slider-wrapper';
    const thumb = createIcon('sliderthumb'); thumb.classList.add('slider-thumb');
    if (settingObj.type == 'hueslider') changeIcon(thumb, 'huethumb');

    imgElement.parentNode.insertBefore(wrapper, imgElement); wrapper.appendChild(imgElement); wrapper.appendChild(thumb);
    const mapValueToVisual = (val) => {
        if (isExp) {
            const normalised = (val - min) / range;
            const percent = Math.pow(normalised, 1 / 5);
            return minVisual + (percent * visualRange);
        } else {
            return minVisual + (((val - min) / (max - min)) * (maxVisual - minVisual));
        }
    }

    function updatePosition(e) {
        const rect = imgElement.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        let percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        if (isExp) {
            settingObj.value = min + (Math.pow(percent, 5) * range);
            thumb.style.left = (minVisual + (percent * visualRange)) + '%';
        } else {
            settingObj.value = min + (percent * (max - min));
            thumb.style.left = mapValueToVisual(settingObj.value) + '%';
        }
    }

    thumb.style.left = mapValueToVisual(settingObj.value) + '%';
    let isDragging = false;
    const startDrag = (e) => { isDragging = true; updatePosition(e); e.preventDefault(); };
    const doDrag = (e) => { if (isDragging) updatePosition(e); };
    const stopDrag = () => { isDragging = false; };

    wrapper.addEventListener('mousedown', startDrag); window.addEventListener('mousemove', doDrag); window.addEventListener('mouseup', stopDrag);
    wrapper.addEventListener('touchstart', startDrag, { passive: false }); window.addEventListener('touchmove', doDrag, { passive: false }); window.addEventListener('touchend', stopDrag);
    updateOnChange(() => settingObj.value, (val) => thumb.style.left = mapValueToVisual(val) + '%');
}

function setupColorPickerTabs() {
    const tabs = document.querySelectorAll('.picker .tablist .tab'), gridBody = document.getElementById('grid'), slidersBody = document.getElementById('sliders');
    if (!tabs.length || !gridBody || !slidersBody) return;
    const bodies = [gridBody, slidersBody];
    bodies.forEach((body, index) => body.style.display = index === 0 ? '' : 'none');

    tabs.forEach((tab, index) => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('selected')); tab.classList.add('selected');
            bodies.forEach((body, i) => body.style.display = i === index ? '' : 'none');
        });
    });
}

function setupColorPickerUI() {
    const colourPicker = document.querySelector('.colourPicker'), colourSelect = document.querySelector('.colourPaletteSelect');
    if (!colourPicker || !colourSelect) return;

    window.currentColorMode = 'RGB'; window.currentSelectedColor = { r: 255, g: 0, b: 0, h: 0, s: 1, v: 1 };
    const closeBtn = document.querySelector('.picker .heading .title .icon');
    if (closeBtn) closeBtn.addEventListener('click', () => document.querySelector('.picker').style.display = 'none');

    const gridPreview = document.getElementById('grid-color-preview'), slidersPreview = document.getElementById('sliders-color-preview');
    window.updateCurrentColor = function (newColor) {
        window.currentSelectedColor = { ...newColor };
        const previewRgb = `rgb(${newColor.r}, ${newColor.g}, ${newColor.b})`;
        if (gridPreview) gridPreview.style.backgroundColor = previewRgb; if (slidersPreview) slidersPreview.style.backgroundColor = previewRgb;
        if (window.activeColorTarget) window.activeColorTarget(window.currentSelectedColor);
        updateSlidersFromState();
    };
    window.syncPickerUI = function (colorObj) { window.updateCurrentColor(colorObj); };

    const COLS = 12, ROWS = 10; let isDraggingPicker = false;
    function updatePickerSelection(e) {
        const rect = colourPicker.getBoundingClientRect(), clientX = e.touches ? e.touches[0].clientX : e.clientX, clientY = e.touches ? e.touches[0].clientY : e.clientY;
        let x = Math.max(0, Math.min(rect.width - 0.1, clientX - rect.left)), y = Math.max(0, Math.min(rect.height - 0.1, clientY - rect.top));
        const col = Math.floor(x / (rect.width / COLS)), row = Math.floor(y / (rect.height / ROWS));
        const centerX = (col * (rect.width / COLS)) + ((rect.width / COLS) / 2), centerY = (row * (rect.height / ROWS)) + ((rect.height / ROWS) / 2);
        const pickerUi = colourPicker.closest('.picker'), pickerRect = pickerUi.getBoundingClientRect();
        colourSelect.style.margin = '0px'; colourSelect.style.left = `${(rect.left - pickerRect.left) + centerX - 18}px`; colourSelect.style.top = `${(rect.top - pickerRect.top) + centerY - 18}px`;

        let r, g, b;
        if (row === 0) { const lightness = Math.round(100 - (col / (COLS - 1)) * 100);[r, g, b] = hslToRgb(0, 0, lightness); }
        else { const hue = (200 + col * 30) % 400, lightness = Math.round(20 + ((row - 1) / (ROWS - 2)) * 70);[r, g, b] = hslToRgb(hue, 100, lightness); }
        let [h_val, s_val, v_val] = rgbToHsv(r, g, b);
        window.updateCurrentColor({ r, g, b, h: h_val, s: s_val, v: v_val });
    }
    colourPicker.addEventListener('mousedown', (e) => { isDraggingPicker = true; updatePickerSelection(e); e.preventDefault(); });
    window.addEventListener('mousemove', (e) => { if (isDraggingPicker) updatePickerSelection(e); });
    window.addEventListener('mouseup', () => isDraggingPicker = false);

    const toggleBtn = document.getElementById('toggleColorMode');
    const labels = [document.querySelector('#slider-1-group .slider-label'), document.querySelector('#slider-2-group .slider-label'), document.querySelector('#slider-3-group .slider-label')];
    const inputs = [document.getElementById('slider-1-input'), document.getElementById('slider-2-input'), document.getElementById('slider-3-input')];
    const tracks = [document.getElementById('slider-1-track'), document.getElementById('slider-2-track'), document.getElementById('slider-3-track')];
    const thumbs = tracks.map(t => t.querySelector('.custom-slider-thumb'));

    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            window.currentColorMode = window.currentColorMode === 'RGB' ? 'HSV' : 'RGB';
            toggleBtn.innerText = `Switch to ${window.currentColorMode === 'RGB' ? 'HSV' : 'RGB'}`;
            labels[0].innerText = window.currentColorMode === 'RGB' ? 'R' : 'H'; labels[1].innerText = window.currentColorMode === 'RGB' ? 'G' : 'S'; labels[2].innerText = window.currentColorMode === 'RGB' ? 'B' : 'V';
            inputs[0].max = window.currentColorMode === 'RGB' ? 255 : 360; inputs[1].max = window.currentColorMode === 'RGB' ? 255 : 100; inputs[2].max = window.currentColorMode === 'RGB' ? 255 : 100;
            updateSlidersFromState();
        });
    }

    function updateSlidersFromState() {
        const c = window.currentSelectedColor;
        let vals = window.currentColorMode === 'RGB' ? [c.r, c.g, c.b] : [Math.round(c.h * 360), Math.round(c.s * 100), Math.round(c.v * 100)];
        for (let i = 0; i < 3; i++) {
            if (document.activeElement !== inputs[i]) inputs[i].value = vals[i];
            let percent = (vals[i] / (parseFloat(inputs[i].max) || 255));
            thumbs[i].style.left = `calc(10px + (${percent * 100}% - ${percent * 20}px))`;
        }
        if (window.currentColorMode === 'RGB') {
            tracks[0].style.background = `linear-gradient(to right, rgb(0, ${c.g}, ${c.b}), rgb(255, ${c.g}, ${c.b}))`;
            tracks[1].style.background = `linear-gradient(to right, rgb(${c.r}, 0, ${c.b}), rgb(${c.r}, 255, ${c.b}))`;
            tracks[2].style.background = `linear-gradient(to right, rgb(${c.r}, ${c.g}, 0), rgb(${c.r}, ${c.g}, 255))`;
        } else {
            let hStops = []; for (let i = 0; i <= 6; i++) { let [r, g, b] = hsvToRgb(i / 6, c.s, c.v); hStops.push(`rgb(${r}, ${g}, ${b})`); }
            tracks[0].style.background = `linear-gradient(to right, ${hStops.join(', ')})`;
            let [r0s, g0s, b0s] = hsvToRgb(c.h, 0, c.v), [r1s, g1s, b1s] = hsvToRgb(c.h, 1, c.v);
            tracks[1].style.background = `linear-gradient(to right, rgb(${r0s}, ${g0s}, ${b0s}), rgb(${r1s}, ${g1s}, ${b1s}))`;
            let [r0v, g0v, b0v] = hsvToRgb(c.h, c.s, 0), [r1v, g1v, b1v] = hsvToRgb(c.h, c.s, 1);
            tracks[2].style.background = `linear-gradient(to right, rgb(${r0v}, ${g0v}, ${b0v}), rgb(${r1v}, ${g1v}, ${b1v}))`;
        }
    }

    function onSliderChange(index, val) {
        val = Math.max(0, Math.min(parseFloat(inputs[index].max) || 255, val)); inputs[index].value = Math.round(val);
        const c = window.currentSelectedColor;
        if (window.currentColorMode === 'RGB') {
            let r = index === 0 ? val : c.r, g = index === 1 ? val : c.g, b = index === 2 ? val : c.b;
            let [h, s, v] = rgbToHsv(r, g, b); window.updateCurrentColor({ r: Math.round(r), g: Math.round(g), b: Math.round(b), h, s, v });
        } else {
            let h = (index === 0 ? val : c.h * 360) / 360, s = (index === 1 ? val : c.s * 100) / 100, v = (index === 2 ? val : c.v * 100) / 100;
            let [r, g, b] = hsvToRgb(h, s, v); window.updateCurrentColor({ r, g, b, h, s, v });
        }
    }

    tracks.forEach((track, i) => {
        let isDragging = false;
        const updateFromEvent = (e) => {
            const rect = track.getBoundingClientRect(), clientX = e.touches ? e.touches[0].clientX : e.clientX;
            onSliderChange(i, Math.max(0, Math.min(1, (clientX - rect.left - 10) / (rect.width - 20))) * (parseFloat(inputs[i].max) || 255));
        };
        track.addEventListener('mousedown', (e) => { isDragging = true; updateFromEvent(e); e.preventDefault(); });
        window.addEventListener('mousemove', (e) => { if (isDragging) updateFromEvent(e); });
        window.addEventListener('mouseup', () => isDragging = false);
        inputs[i].addEventListener('input', (e) => onSliderChange(i, parseFloat(e.target.value) || 0));
    });
}