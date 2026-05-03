function setupAPI() {
    fetch('https://2b2tatlas.com/api/locations.php')
        .then(res => res.json())
        .then(data => {
            allAtlasLocations = data.map(loc => {
                let dim = 0;
                if (loc.end_dimension === "1") dim = 2;
                return { name: loc.name, x: parseFloat(loc.x), z: parseFloat(loc.z), dim: dim, dimId: (dim == 0) ? 'overworld' : (dim == 1) ? 'nether' : 'end', uuid: loc.location_uuid, desc: loc.description, wiki: loc.wiki || null, video: loc.video_url || null, content: loc };
            });
            if (searchInput && searchInput.value) fetchAtlasLocations(searchInput.value);
        })
        .catch(e => console.error("Initial Atlas load failed:", e));

    fetch('/media/solidTile.webp')
        .then(res => res.blob())
        .then(blob => createImageBitmap(blob))
        .then(bitmap => { solidBitmap = bitmap; });

    waypointColors.forEach(col => { waypointIcons[col] = loadImage(`/icon/worldPin${col}.png`); });
    pinIcon = loadImage('/icon/worldPinBlack.png');
    pinEnd = loadImage('/icon/worldPinEnd.png');
}

function setupUIEvents() {
    const copycoords = document.getElementById('copycoordinates');
    copycoords.addEventListener("click", () => {
        navigator.clipboard.writeText(`${rightClickCoords.x}, ${rightClickCoords.z}`);
        document.getElementById('rightClickContext').classList.remove('open');
    });

    const searchHere = document.getElementById('searchhere');
    searchHere.addEventListener("click", () => {
        searchState = 'filter';
        renderFilterPanel();
        fetchAtlasLocations(`${rightClickCoords.x}, ${rightClickCoords.z}`);
        searchInput.value = `${rightClickCoords.x}, ${rightClickCoords.z}`;
        renderSuggestions();
        const sIcon = document.getElementById('searchIcon');
        if (sIcon) { changeIcon(sIcon, 'close'); sIcon.style.cursor = 'pointer'; }
        document.getElementById('rightClickContext').classList.remove('open');
    });

    document.querySelectorAll('.color-swatch').forEach(swatch => {
        swatch.addEventListener('click', (e) => {
            document.querySelectorAll('.color-swatch').forEach(s => s.style.borderColor = 'transparent');
            e.target.style.borderColor = 'white';
            selectedWaypointColor = e.target.getAttribute('data-color');
        });
    });

    document.getElementById('placewaypoint').addEventListener("click", () => openWaypointEditDialog(null));
    const editwaypoint = document.getElementById('editwaypoint');
    if (editwaypoint) editwaypoint.addEventListener("click", () => { if (activeHoveredWaypoint) openWaypointEditDialog(activeHoveredWaypoint); });

    document.getElementById('removewaypoint').addEventListener("click", () => {
        if (activeHoveredWaypoint) tempWaypoints = tempWaypoints.filter(m => m !== activeHoveredWaypoint);
        document.getElementById('rightClickContext').classList.remove('open');
    });

    window.addEventListener('mousedown', (e) => {
        if (e.target.tagName.toLowerCase() === 'canvas') {
            if (document.activeElement === searchInput) searchInput.blur();
            if (searchState != 'result') {
                searchPanel.classList.remove('open');
                searchState == null;
            }
        }
        const context = document.getElementById('rightClickContext');
        if (!context.contains(e.target)) context.classList.remove('open');
    });

    coordinateText = document.getElementById('coordinateText');
    coordinateTextNether = document.getElementById('coordinateTextNether');
}

function setupRightClickMenu() {
    document.addEventListener('contextmenu', event => {
        if (event.target.tagName.toLowerCase() === 'canvas') {
            event.preventDefault();
            const wMouse = getWorldMouse();
            rightClickCoords.x = Math.round(wMouse.x);
            rightClickCoords.z = Math.round(wMouse.y);
            activeHoveredWaypoint = null;
            const currentScale = 1 / camera.zoom;
            const iconHitbox = 32 * currentScale;

            for (let i = tempWaypoints.length - 1; i >= 0; i--) {
                let m = tempWaypoints[i];
                let mDim = m.dim !== undefined ? m.dim : 0;
                if ((mDim === 2) !== (currentDimension === 2)) continue;
                let mx = currentDimension === 1 ? m.x / 8 : m.x;
                let mz = currentDimension === 1 ? m.z / 8 : m.z;
                if (wMouse.x >= mx - iconHitbox / 2 && wMouse.x <= mx + iconHitbox / 2 && wMouse.y >= mz - iconHitbox && wMouse.y <= mz) {
                    activeHoveredWaypoint = m;
                    break;
                }
            }

            if (activeHoveredWaypoint) {
                document.getElementById('placewaypoint').style.display = 'none';
                document.getElementById('editwaypoint').style.display = '';
                document.getElementById('removewaypoint').style.display = '';
            } else {
                document.getElementById('placewaypoint').style.display = '';
                document.getElementById('editwaypoint').style.display = 'none';
                document.getElementById('removewaypoint').style.display = 'none';
            }

            const context = document.getElementById('rightClickContext');
            context.classList.add('open');
            context.style.left = event.clientX + 'px';
            context.style.top = event.clientY + 'px';
        }
    });
}

function loadStateFromURL() {
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
                                if (layers[name].settings[sName]) layers[name].settings[sName].value = details.layers[name].settings[sName];
                            }
                        }
                    }
                }
            }
            if (details.search) {
                setTimeout(() => {
                    if (searchInput) {
                        searchInput.value = details.search;
                        const sIcon = document.getElementById('searchIcon');
                        if (sIcon && searchInput.value.length > 0) {
                            changeIcon(sIcon, 'close');
                            sIcon.style.cursor = 'pointer';
                        }
                        fetchAtlasLocations(details.search);
                    }
                }, 100);
            }
        }
    } else {
        camera.zoom = intendedCamZoom;
        camera.x = 0;
        camera.y = 0;
    }
}

function setupSearchUI() {
    searchPanel = document.getElementById('searchPanel');
    const searchBar = document.getElementById('searchBar');
    searchBar.innerHTML = '';
    const searchIcon = createIcon('search');
    searchIcon.id = 'searchIcon';
    searchIcon.style.cursor = 'default';
    searchBar.appendChild(searchIcon);

    searchIcon.addEventListener('click', () => {
        if (searchInput.value.length > 0) {
            searchInput.value = '';
            changeIcon(searchIcon, 'search');
            searchIcon.style.cursor = 'default';
            atlasLocations = [];
            tempWaypoints = tempWaypoints.filter(m => !m.isSearch);
            renderSuggestions();
            searchInput.focus();
        }
    });

    searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.name = 'Search';
    searchInput.placeholder = 'Search 2b2t';
    searchInput.id = 'search';
    searchBar.appendChild(searchInput);

    const filterIcon = createIcon('filter');
    filterIcon.id = 'filterIcon';
    filterIcon.style.cursor = 'pointer';
    searchBar.appendChild(filterIcon);

    const moreIcon = createIcon('more');
    moreIcon.id = 'moreIcon';
    searchBar.appendChild(moreIcon);

    filterIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        if (searchState == 'filter') {
            searchState = null
            searchPanel.classList.remove('open');
        } else if (searchState != 'filter') {
            searchState = 'filter';
            renderFilterPanel();
        };
        // if (searchState != 'result') renderFilterPanel();
        // else {
        //     if (searchInput.value || recentSearches.length > 0) renderSuggestions();
        //     else searchPanel.classList.remove('open');
        // }
    });

    renderSuggestions = () => {
        if (searchState == 'filter') return;

        const parsed = getParsedInput(searchInput.value);
        currentSuggestions = [];

        if (searchInput.value.trim() === '') {
            if (recentSearches.length > 0) {
                recentSearches.forEach(r => {
                    currentSuggestions.push({ ...r, source: 'recent' });
                });
            } else {
                searchPanel.classList.remove('open');
                return;
            }
        } else {
            if (!parsed && atlasLocations.length === 0) {
                searchPanel.classList.remove('open');
                return;
            }

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
                        tag: `${dim.id}: ${parsed.x}, ${parsed.z}`,
                        source: 'coordinates'
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
                            tag: `${itemData.id}: ${itemData.x}, ${itemData.z}`,
                            source: 'coordinates'
                        });
                    });
                }
            }

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
                    tag: `${dimId}: ${loc.x}, ${loc.z}`,
                    desc: loc.desc,
                    source: 'atlas',
                    uuid: loc.uuid,
                    wiki: loc.wiki || null,
                    video: loc.video || null
                });
            });
        }

        if (currentSuggestions.length === 0) {
            searchPanel.classList.remove('open');
            return;
        }

        let renderItems = [];
        let currentY = 0;
        let currentSubheading = null;
        const SUBHEADING_HEIGHT = 28;

        currentSuggestions.forEach((sug, index) => {
            let neededSubheading = null;
            if (sug.source === 'recent') neededSubheading = 'Recent Searches';
            else if (sug.type === 'coord') neededSubheading = 'Exact Coordinates';
            else if (sug.type === 'coord_converted') neededSubheading = 'Converted';
            else if (sug.type === 'location') neededSubheading = 'Locations';

            if (neededSubheading && neededSubheading !== currentSubheading) {
                renderItems.push({
                    isHeader: true,
                    text: neededSubheading,
                    y: currentY,
                    height: SUBHEADING_HEIGHT
                });
                currentY += SUBHEADING_HEIGHT;
                currentSubheading = neededSubheading;
            }

            renderItems.push({
                ...sug,
                isHeader: false,
                originalIndex: index,
                y: currentY,
                height: itemHeight
            });
            currentY += itemHeight;
        });

        const previousScrollTop = searchPanel.scrollTop || 0;

        searchPanel.classList.add('open');
        searchPanel.innerHTML = '';

        const container = document.createElement('div');
        container.className = 'scrollContainer';
        container.style.height = currentY + 'px';
        container.style.position = 'relative';
        searchPanel.appendChild(container);

        const selectedObj = renderItems.find(r => !r.isHeader && r.originalIndex === selectedSuggestionIndex);
        let targetScrollTop = previousScrollTop;
        if (selectedObj) {
            const viewHeight = 350;
            if (selectedObj.y < previousScrollTop) {
                targetScrollTop = Math.max(0, selectedObj.y - SUBHEADING_HEIGHT);
            } else if (selectedObj.y + selectedObj.height > previousScrollTop + viewHeight) {
                targetScrollTop = selectedObj.y + selectedObj.height - viewHeight;
            }
        }

        searchPanel.scrollTop = targetScrollTop;

        const updateVisibleItems = () => {
            const scrollTop = searchPanel.scrollTop;
            const scrollBottom = scrollTop + searchPanel.clientHeight;

            container.innerHTML = '';
            for (let i = 0; i < renderItems.length; i++) {
                const itemObj = renderItems[i];

                if (itemObj.y + itemObj.height > scrollTop - itemHeight && itemObj.y < scrollBottom + itemHeight) {
                    const domNode = document.createElement("div");
                    domNode.style.position = 'absolute';
                    domNode.style.top = itemObj.y + 'px';
                    domNode.style.width = '100%';
                    domNode.style.height = itemObj.height + 'px';
                    domNode.style.boxSizing = 'border-box';

                    if (itemObj.isHeader) {
                        domNode.className = 'subheading';
                        domNode.innerText = itemObj.text;
                    } else {
                        domNode.className = `item ${itemObj.originalIndex === selectedSuggestionIndex ? 'selected' : ''}`;
                        let displayIcon = itemObj.icon || 'search';
                        let displayName = itemObj.name || itemObj.text;
                        let displayTag = itemObj.tag || '';

                        domNode.innerHTML = `
						<img src="/icon/${displayIcon}.png" class="icon">
						<div class="details">
							<div class="name">${displayName}</div>
							<div class="tag">${displayTag}</div>
						</div>`;

                        domNode.onmousedown = (e) => {
                            e.preventDefault();
                            isSelectingSuggestion = true;
                            selectSuggestion(itemObj);
                            setTimeout(() => { isSelectingSuggestion = false; }, 100);
                        };
                    }
                    container.appendChild(domNode);
                }
            }
        };

        searchPanel.onscroll = updateVisibleItems;
        updateVisibleItems();
    };
    setupSearchInputEvents();
}

function setupSearchInputEvents() {
    searchInput.addEventListener('input', () => {
        searchState = null;
        selectedSuggestionIndex = 0;
        const sIcon = document.getElementById('searchIcon');
        if (searchInput.value.length > 0) {
            changeIcon(sIcon, 'close');
            sIcon.style.cursor = 'pointer';
        } else {
            changeIcon(sIcon, 'search');
            sIcon.style.cursor = 'default';
        }
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
                selectSuggestion(currentSuggestions[selectedSuggestionIndex]);
            } else {
                addRecentSearch(searchInput.value);
                handleCoordinateSearch(searchInput.value);
                searchPanel.classList.remove('open');
                searchState = null;
            }
            searchInput.blur();
        } else if (e.key === 'Escape') searchInput.blur();
    });

    searchInput.addEventListener('focus', () => {
        searchState = null;
        fetchAtlasLocations(searchInput.value);
        renderSuggestions();
    });

    searchInput.addEventListener('click', () => {
        if (!searchPanel.classList.contains('open')) {
            searchState = null;
            fetchAtlasLocations(searchInput.value);
            renderSuggestions();
        }
    });

    searchInput.addEventListener('blur', () => {
        if (!isSelectingSuggestion && searchInput.value.trim().length > 0 && (atlasLocations.length > 0 || getParsedInput(searchInput.value) !== null)) {
            addRecentSearch(searchInput.value);
        }
        setTimeout(() => {
            const isOverPanel = searchPanel.matches(':hover');
            const isOverFilter = document.getElementById('filterIcon')?.matches(':hover');
            const isOverSearchIcon = document.getElementById('searchIcon')?.matches(':hover');
            if (isOverPanel || isOverFilter || isOverSearchIcon || searchState == 'result') return;
            searchPanel.classList.remove('open');
            searchState = null;
        }, 150);
    });
}

function setupLayersUI() {
    layersButton = document.getElementById('layers');
    let layertitle = document.getElementById('layerstitle');
    let layerclose = document.getElementById('layerclose');
    layersettings = document.getElementById('layersettings');

    layerclose.addEventListener("click", () => layersButton.classList.remove("open"));
    layertitle.addEventListener("click", () => layersButton.classList.add("open"));

    for (const [name, layer] of Object.entries(layers)) {
        const item = document.createElement("div");
        item.className = "item";
        const visibilityIcon = createIcon(layer.visible ? "checked" : "unchecked");
        if (layer.type === "background") {
            visibilityIcon.style.opacity = 0.5;
            visibilityIcon.style.cursor = "default";
        } else {
            visibilityIcon.style.cursor = "pointer";
            visibilityIcon.addEventListener("click", () => layer.visible = !layer.visible);
            updateOnChange(() => layer.visible, (val) => {
                changeIcon(visibilityIcon, val ? "checked" : "unchecked");
                if (val) updateMapURL();
            });
        }
        const layerIcon = createIcon(layer.icon);
        const settingsIcon = createIcon('settings');
        settingsIcon.classList.add('right')
        if (layer.settings) {
            settingsIcon.addEventListener("click", () => {
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

    document.getElementById('overworldToggle').addEventListener("click", () => {
        if (currentDimension == 1) { camera.x *= 8; camera.y *= 8; }
        currentDimension = 0;
        updateMapURL();
    });
    document.getElementById('netherToggle').addEventListener("click", () => {
        if (currentDimension != 1) { camera.x /= 8; camera.y /= 8; }
        currentDimension = 1;
        updateMapURL();
    });
    document.getElementById('endToggle').addEventListener("click", () => {
        if (currentDimension == 1) { camera.x *= 8; camera.y *= 8; }
        currentDimension = 2;
        updateMapURL();
    });
}

function setupShareUI() {
    const copyLink = document.getElementById('copylink');
    const items = {};

    copyLink.addEventListener("click", () => {
        const layersChanged = hasLayerSettingsChanged();
        const searchVal = searchInput.value.trim();
        const parsedSearch = getParsedInput(searchVal);
        const searchYieldsResults = atlasLocations.length > 0 || parsedSearch !== null;

        const layerItem = items["Layer Settings"];
        if (!layersChanged) {
            copyLinkSettings["Layer Settings"] = false;
            layerItem.item.classList.add('disabled-by-system');
            changeIcon(layerItem.icon, 'unchecked');
        } else {
            layerItem.item.classList.remove('disabled-by-system');
            changeIcon(layerItem.icon, copyLinkSettings["Layer Settings"] ? 'checked' : 'unchecked');
        }

        const searchItem = items["Current Search"];
        if (!searchVal || !searchYieldsResults) {
            copyLinkSettings["Current Search"] = false;
            searchItem.item.classList.add('disabled-by-system');
            changeIcon(searchItem.icon, 'unchecked');
        } else {
            searchItem.item.classList.remove('disabled-by-system');
            changeIcon(searchItem.icon, copyLinkSettings["Current Search"] ? 'checked' : 'unchecked');
        }

        const waypointItem = items["Temporary Waypoints"];
        if (tempWaypoints.length < 1) {
            copyLinkSettings["Temporary Waypoints"] = false;
            waypointItem.item.classList.add('disabled-by-system');
            changeIcon(waypointItem.icon, 'unchecked');
        } else {
            waypointItem.item.classList.remove('disabled-by-system');
            changeIcon(waypointItem.icon, copyLinkSettings["Temporary Waypoints"] ? 'checked' : 'unchecked');
        }

        document.getElementById('copyLinkText').value = createURL();
        document.getElementById('copyLinkButton').onclick = () => copyToClipboard(createURL());
        document.getElementById('copyLinkScreen').classList.add('open');
        document.getElementById('rightClickContext').classList.remove('open');
    });

    const copyLinkTitle = document.getElementById('copyLinkTitle');
    copyLinkTitle.innerHTML = 'Share'
    const closeButton = createIcon('close');
    closeButton.addEventListener('click', () => document.getElementById('copyLinkScreen').classList.remove('open'));
    copyLinkTitle.appendChild(closeButton);

    const copyLinkBody = document.getElementById('copyLinkBody');
    copyLinkBody.innerHTML = '<div class="subheading">Options</div>';

    Object.keys(copyLinkSettings).forEach(settingName => {
        let item = document.createElement('div');
        item.className = 'item';
        let icon = createIcon(copyLinkSettings[settingName] ? 'checked' : 'unchecked');
        item.appendChild(icon);
        item.insertAdjacentText('beforeend', settingName);
        items[settingName] = { item, icon };

        item.addEventListener('click', () => {
            if (item.classList.contains('disabled') || item.classList.contains('disabled-by-system')) return;
            copyLinkSettings[settingName] = !copyLinkSettings[settingName];
            const includeAll = copyLinkSettings["Include All"];

            Object.entries(items).forEach(([name, refs]) => {
                const { item: refItem, icon: refIcon } = refs;
                if (includeAll && name !== "Include All") {
                    if (refItem.classList.contains('disabled-by-system')) changeIcon(refIcon, 'unchecked');
                    else { changeIcon(refIcon, 'checked'); refItem.classList.add('disabled'); }
                } else {
                    if (refItem.classList.contains('disabled-by-system')) changeIcon(refIcon, 'unchecked');
                    else { changeIcon(refIcon, copyLinkSettings[name] ? 'checked' : 'unchecked'); refItem.classList.remove('disabled'); }
                }
            });
            document.getElementById('copyLinkText').value = createURL();
            document.getElementById('copyLinkButton').onclick = () => copyToClipboard(createURL());
        });
        copyLinkBody.appendChild(item);
    });
}