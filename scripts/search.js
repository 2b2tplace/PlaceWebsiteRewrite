function fetchAtlasLocations(query, showSuggestionsAfter = true) {
    if (!query || query.trim().length === 0) {
        atlasLocations = [];
        if (typeof renderSuggestions === 'function' && showSuggestionsAfter) renderSuggestions();
        return;
    }

    const trimmedQuery = query.toLowerCase().trim();
    const parsed = getParsedInput(query);
    const isJustCoords = /^(overworld|nether|end)?\s*:?\s*-?\d+(\.\d+)?\s*,?\s*-?\d+(\.\d+)?\s*$/i.test(query.trim());
    const filterRadius = filterSettings.radius.value;

    if (parsed && isJustCoords) {
        let px = Math.round(parsed.x);
        let pz = Math.round(parsed.z);
        let targetDim = parsed.dim === 'end' ? 2 : (parsed.dim === 'overworld' ? 0 : (parsed.dim === 'nether' ? 1 : null));

        let results = allAtlasLocations.map(loc => { return { ...loc, distToSearch: Math.sqrt(Math.pow(loc.x - px, 2) + Math.pow(loc.z - pz, 2)) }; });
        if (targetDim !== null) results = results.filter(l => l.dim === targetDim);
        results = results.filter(l => l.distToSearch <= filterRadius);
        results.sort((a, b) => a.distToSearch - b.distToSearch);
        atlasLocations = results;
    } else {
        let results = [];
        for (const loc of allAtlasLocations) {
            let score = 0;
            const name = loc.name.toLowerCase();
            const desc = (loc.desc || "").toLowerCase();

            if (name === trimmedQuery) score += 1000;
            else if (name.startsWith(trimmedQuery)) score += 500;
            else if (name.includes(trimmedQuery)) score += 200;
            else if (desc.includes(trimmedQuery)) score += 50;

            if (trimmedQuery.length > 3) {
                const distance = getLevenshteinDistance(trimmedQuery, name);
                if (distance <= 4) score += (300 - (distance * 100));
            }

            if (score > 0) results.push({ ...loc, searchScore: score, distToCam: getDistanceFromCamera(loc) });
        }
        results.sort((a, b) => (b.searchScore !== a.searchScore) ? b.searchScore - a.searchScore : a.distToCam - b.distToCam);
        atlasLocations = results;
    }

    if (typeof renderSuggestions === 'function' && showSuggestionsAfter) renderSuggestions();
}

// Show more info about a waypoint
function loadAtlasResult(location) {
    const result = resultsLibrary.find(item => item.uuid === location.uuid);
    searchPanel.innerHTML = '';
    searchPanel.classList.add('open');

    const banner = document.createElement('div');
    banner.className = 'atlasResultBanner';
    if (result) {
        banner.style.background = `url(${result.image_url})`;
        banner.style.backgroundSize = 'cover';
        banner.style.backgroundPosition = 'center';
    }

    const title = document.createElement('div');
    title.className = 'atlasResultTitle';
    title.textContent = location.name;

    const type = document.createElement('div');
    type.className = 'atlasResultType';
    if (location.name != 'End Portal') {
        type.textContent = 'Point Of Interest';
    } else {
        type.textContent = 'Structure';
    }

    const buttons = document.createElement('div');
    buttons.className = 'atlasResultButtons';
    [['copy', 'Coordinates'], ['command', 'Vanilla'], ['commandAlt', 'PlaceViewer']].forEach(icon => {
        const button = document.createElement('div');
        button.className = 'atlasResultButton';
        const label = document.createElement('div');
        label.textContent = icon[1];
        label.className = 'atlasResultButtonLabel';
        if (icon[0] == 'copy') {
            button.addEventListener('click', () => {
                copyToClipboard(`${location.x}, ${location.z}`);
            })
        } else if (icon[0] == 'command') {
            copyToClipboard(`/execute in minecraft:${location.dimId == 'overworld' ? 'overworld' : 'the_' + location.dimId} run tp @s ${location.x} ~ ${location.z}`)
        } else {
            copyToClipboard(`/tp ${location.x} ${location.z} ${location.dimId == 'end' ? 'the_end' : location.dimId}`)
        }
        button.append(createIcon(icon[0]), label)
        buttons.append(button)
    });

    const desc = document.createElement('div');
    desc.className = 'atlasResultDesc';
    desc.style.webkitLineClamp = '5';
    desc.style.overflow = 'hidden';
    const descSubtitle = document.createElement('div');
    descSubtitle.className = 'atlasResultSubheading'
    descSubtitle.textContent = 'About';
    desc.append(descSubtitle, result ? result.summary : (location.desc || 'No Information Currently.'));

    const locCoords = document.createElement('div');
    locCoords.textContent = `${location.x}, ${location.z} in the ${location.dimId.charAt(0).toUpperCase() + location.dimId.slice(1)}`
    const loc = document.createElement('div');
    loc.className = 'atlasResultLocation';
    loc.append(createIcon('pin'), locCoords);

    searchPanel.append(banner, title, type, buttons, loc, desc);

    desc.style.webkitLineClamp = 'unset';
    desc.style.lineClamp = 'unset';
    desc.style.overflow = 'unset';
    const descTotalHeight = desc.scrollHeight;
    desc.style.webkitLineClamp = '5';
    desc.style.lineClamp = '5';
    desc.style.overflow = 'hidden';

    if (descTotalHeight > 124) {
        const descReadMore = document.createElement('div');
        descReadMore.className = 'atlasResultMore';
        descReadMore.textContent = 'Show More';
        descReadMore.addEventListener('click', () => {
            if (desc.style.webkitLineClamp == '5') {
                desc.style.webkitLineClamp = 'unset';
                desc.style.lineClamp = 'unset';
                desc.style.overflow = 'unset';
                descReadMore.textContent = 'Show Less';
            } else {
                desc.style.webkitLineClamp = '5';
                desc.style.lineClamp = '5';
                desc.style.overflow = 'hidden';
                descReadMore.textContent = 'Show More';
            }
        })
        searchPanel.appendChild(descReadMore);
    }

    if (location.wiki || location.video) {
        const extra = document.createElement('div');
        extra.className = 'atlasResultExtra';
        if (location.wiki) {
            const wiki = document.createElement('div');
            wiki.className = 'atlasResultPill';
            wiki.append(createIcon('world'), 'Wiki');
            wiki.addEventListener('click', () => {
                window.open(location.wiki, '_blank');
            });
            extra.appendChild(wiki);
        }
        if (location.video) {
            const video = document.createElement('div');
            video.className = 'atlasResultPill';
            video.append(createIcon('play'), 'Video')
            video.addEventListener('click', () => {
                window.open(location.video, '_blank');
            });
            extra.appendChild(video);
        }
        searchPanel.append(extra);
    }
}

function findViaUUID(uuid) {
    const result = allAtlasLocations.find(item => item.uuid === uuid);
    return result || null;
}

function selectSuggestion(sug) {
    const sIcon = document.getElementById('searchIcon');
    if (sIcon) { changeIcon(sIcon, 'close'); sIcon.style.cursor = 'pointer'; }

    if (sug.type === 'recent_query') {
        searchInput.value = sug.text;
        fetchAtlasLocations(sug.text, true);
        if (atlasLocations.length > 0) {
            let loc = atlasLocations[0];
            let dimId = loc.dim === 2 ? 'end' : (loc.dim === 1 ? 'nether' : 'overworld');
            handleCoordinateSearch(`${dimId}: ${loc.x}, ${loc.z}`, false);
        } else handleCoordinateSearch(sug.text, false);
        searchState = null;
    } else if (sug.source == 'coordinates') {
        searchInput.value = sug.tag;
        handleCoordinateSearch(`${sug.dimId}: ${sug.x}, ${sug.z}`);
        searchPanel.classList.remove('open');
        searchState = null;
    } else {
        searchState = 'result';
        searchInput.value = sug.name;
        // fetchAtlasLocations(sug.name, false);
        handleCoordinateSearch(`${sug.dimId}: ${sug.x}, ${sug.z}`, false);
        loadAtlasResult(sug);
    }
}

function addRecentSearch(query) {
    if (!query || typeof query !== 'string') return;
    const text = query.trim();
    if (!text) return;
    recentSearches = recentSearches.filter(r => r.text !== text);
    recentSearches.unshift({ type: 'recent_query', text: text, icon: 'search', tag: 'Recent search' });
    if (recentSearches.length > 10) recentSearches.pop();
    try { localStorage.setItem('recentSearches', JSON.stringify(recentSearches)); } catch (e) { }
}

function handleCoordinateSearch(val, createTempWaypoint = true) {
    const isEnd = val.toLowerCase().includes('end:');
    const isNether = val.toLowerCase().includes('nether:');
    const isOverworld = val.toLowerCase().includes('overworld:');
    const numbers = val.match(/-?\d+(\.\d+)?/g);

    if (numbers && numbers.length >= 2) {
        let x = parseFloat(numbers[0]), z = parseFloat(numbers[numbers.length >= 3 ? 2 : 1]);
        if (!isNaN(x) && !isNaN(z)) {
            if (isNether) currentDimension = 1; else if (isOverworld) currentDimension = 0; else if (isEnd) currentDimension = 2;

            if (createTempWaypoint) {
                tempWaypoints = tempWaypoints.filter(m => !m.isSearch);
                tempWaypoints.push({
                    x: currentDimension === 1 ? x * 8 : x, z: currentDimension === 1 ? z * 8 : z,
                    name: '', color: 'Red', showCoords: true, isSearch: true, dim: currentDimension === 2 ? 2 : 0
                });
            }
            targetCam = { x: x, y: z, zoom: 1.1 };
            updateMapURL();
        }
    }
}

function getParsedInput(val) {
    const lowerVal = val.toLowerCase();
    const detectedDim = dimensionOptions.find(d => lowerVal.includes(d.id))?.id || null;
    const numbers = val.match(/-?\d+(\.\d+)?/g);
    if (!numbers || numbers.length < 2) return null;
    return { x: parseFloat(numbers[0]), z: parseFloat(numbers[numbers.length >= 3 ? 2 : 1]), dim: detectedDim };
}

function getDistanceFromCamera(loc) {
    let locX = loc.x, locZ = loc.z;
    if (loc.dim === 2 && currentDimension !== 2) return Infinity;
    if (currentDimension === 2 && loc.dim !== 2) return Infinity;
    if (loc.dim === 0 && currentDimension === 1) { locX /= 8; locZ /= 8; }
    else if (loc.dim === 1 && currentDimension === 0) { locX *= 8; locZ *= 8; }
    return Math.sqrt(Math.pow(locX - camera.x, 2) + Math.pow(locZ - camera.y, 2));
}

function getClusters(all = false) {
    let visibleLocations = [];
    const halfWidth = width / 2, halfHeight = height / 2, margin = 100 * (1 / camera.zoom);
    const viewLeft = camera.x - halfWidth / camera.zoom - margin, viewRight = camera.x + halfWidth / camera.zoom + margin;
    const viewTop = camera.y - halfHeight / camera.zoom - margin, viewBottom = camera.y + halfHeight / camera.zoom + margin;

    if (all) {
        for (let loc of allAtlasLocations) {
            let x = loc.x, z = loc.z;
            if (loc.dim === 0 && currentDimension === 1) { x /= 8; z /= 8; }
            else if (loc.dim === 1 && currentDimension === 0) { x *= 8; z *= 8; }
            else if (loc.dim !== currentDimension) continue;

            if (x > viewLeft && x < viewRight && z > viewTop && z < viewBottom) visibleLocations.push({ x, z, original: loc });
        }
    } else {
        for (let loc of atlasLocations) {
            let x = loc.x, z = loc.z;
            if (loc.dim === 0 && currentDimension === 1) { x /= 8; z /= 8; }
            else if (loc.dim === 1 && currentDimension === 0) { x *= 8; z *= 8; }
            else if (loc.dim !== currentDimension) continue;

            if (x > viewLeft && x < viewRight && z > viewTop && z < viewBottom) visibleLocations.push({ x, z, original: loc });
        }
    }

    let clusters = [];
    const distThreshold = CLUSTER_RADIUS_PIXELS / camera.zoom;
    for (let loc of visibleLocations) {
        let foundCluster = false;
        for (let cluster of clusters) {
            if (Math.sqrt((loc.x - cluster.x) ** 2 + (loc.z - cluster.z) ** 2) < distThreshold) {
                cluster.x = (cluster.x * cluster.count + loc.x) / (cluster.count + 1);
                cluster.z = (cluster.z * cluster.count + loc.z) / (cluster.count + 1);
                cluster.count++; foundCluster = true; break;
            }
        }
        if (!foundCluster) clusters.push({ x: loc.x, z: loc.z, count: 1, original: loc.original });
    }
    return clusters;
}

function getLevenshteinDistance(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) matrix[i][j] = matrix[i - 1][j - 1];
            else matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
        }
    }
    return matrix[b.length][a.length];
}

renderSuggestions = () => {
    if (searchState == 'filter') return;
    const parsed = getParsedInput(searchInput.value);
    currentSuggestions = [];

    if (searchInput.value.trim() === '') {
        if (recentSearches.length > 0) recentSearches.forEach(r => currentSuggestions.push({ ...r, source: 'recent' }));
        else { searchPanel.classList.remove('open'); return; }
    } else {
        if (!parsed && atlasLocations.length === 0) { searchPanel.classList.remove('open'); return; }

        if (parsed) {
            let coordSuggestions = parsed.dim ? dimensionOptions.filter(d => d.id === parsed.dim) : dimensionOptions;
            coordSuggestions.forEach((dim) => currentSuggestions.push({
                type: 'coord', dimId: dim.id, x: parsed.x, z: parsed.z, name: dim.name, icon: dim.icon, tag: `${dim.id}: ${parsed.x}, ${parsed.z}`, source: 'coordinates'
            }));

            const converted = []; const { x, z, dim } = parsed;
            if (dim === 'nether') converted.push({ id: 'overworld', name: 'Overworld', icon: 'world', x: x * 8, z: z * 8 });
            else if (dim === 'overworld') converted.push({ id: 'nether', name: 'Nether', icon: 'obsidian', x: Math.floor(x / 8), z: Math.floor(z / 8) });
            else if (!dim) {
                converted.push({ id: 'overworld', name: 'Overworld', icon: 'world', x: x * 8, z: z * 8 });
                converted.push({ id: 'nether', name: 'Nether', icon: 'obsidian', x: Math.floor(x / 8), z: Math.floor(z / 8) });
            }

            if (converted.length > 0) converted.forEach((itemData) => currentSuggestions.push({
                type: 'coord_converted', dimId: itemData.id, x: itemData.x, z: itemData.z, name: itemData.name, icon: itemData.icon, tag: `${itemData.id}: ${itemData.x}, ${itemData.z}`, source: 'coordinates'
            }));
        }

        atlasLocations.forEach(loc => {
            let dimId = loc.dim === 2 ? 'end' : (loc.dim === 1 ? 'nether' : 'overworld');
            let icon = loc.dim === 2 ? 'enderchest' : (loc.dim === 1 ? 'obsidian' : 'world');
            currentSuggestions.push({ type: 'location', name: loc.name, x: loc.x, z: loc.z, dimId: dimId, dim: loc.dim, icon: icon, tag: `${dimId}: ${loc.x}, ${loc.z}`, source: 'atlas' });
        });
    }

    if (currentSuggestions.length === 0) { searchPanel.classList.remove('open'); return; }

    let renderItems = []; let currentY = 0; let currentSubheading = null; const SUBHEADING_HEIGHT = 28;

    currentSuggestions.forEach((sug, index) => {
        let neededSubheading = null;
        if (sug.source === 'recent') neededSubheading = 'Recent Searches';
        else if (sug.type === 'coord') neededSubheading = 'Exact Coordinates';
        else if (sug.type === 'coord_converted') neededSubheading = 'Converted';
        else if (sug.type === 'location') neededSubheading = 'Locations';

        if (neededSubheading && neededSubheading !== currentSubheading) {
            renderItems.push({ isHeader: true, text: neededSubheading, y: currentY, height: SUBHEADING_HEIGHT });
            currentY += SUBHEADING_HEIGHT; currentSubheading = neededSubheading;
        }
        renderItems.push({ ...sug, isHeader: false, originalIndex: index, y: currentY, height: itemHeight });
        currentY += itemHeight;
    });

    const previousScrollTop = searchPanel.scrollTop || 0;
    searchPanel.classList.add('open'); searchPanel.innerHTML = '';
    const container = document.createElement('div'); container.className = 'scrollContainer'; container.style.height = currentY + 'px'; container.style.position = 'relative'; searchPanel.appendChild(container);

    const selectedObj = renderItems.find(r => !r.isHeader && r.originalIndex === selectedSuggestionIndex);
    let targetScrollTop = previousScrollTop;
    if (selectedObj) {
        const viewHeight = 350;
        if (selectedObj.y < previousScrollTop) targetScrollTop = Math.max(0, selectedObj.y - SUBHEADING_HEIGHT);
        else if (selectedObj.y + selectedObj.height > previousScrollTop + viewHeight) targetScrollTop = selectedObj.y + selectedObj.height - viewHeight;
    }
    searchPanel.scrollTop = targetScrollTop;

    const updateVisibleItems = () => {
        const scrollTop = searchPanel.scrollTop, scrollBottom = scrollTop + searchPanel.clientHeight;
        container.innerHTML = '';
        for (let i = 0; i < renderItems.length; i++) {
            const itemObj = renderItems[i];
            if (itemObj.y + itemObj.height > scrollTop - itemHeight && itemObj.y < scrollBottom + itemHeight) {
                const domNode = document.createElement("div");
                domNode.style.position = 'absolute'; domNode.style.top = itemObj.y + 'px'; domNode.style.width = '100%'; domNode.style.height = itemObj.height + 'px'; domNode.style.boxSizing = 'border-box';

                if (itemObj.isHeader) { domNode.className = 'subheading'; domNode.innerText = itemObj.text; }
                else {
                    domNode.className = `item ${itemObj.originalIndex === selectedSuggestionIndex ? 'selected' : ''}`;
                    let displayIcon = itemObj.icon || 'search', displayName = itemObj.name || itemObj.text, displayTag = itemObj.tag || '';
                    domNode.innerHTML = `<img src="/icon/${displayIcon}.png" class="icon"><div class="details"><div class="name">${displayName}</div><div class="tag">${displayTag}</div></div>`;
                    domNode.onmousedown = (e) => { e.preventDefault(); isSelectingSuggestion = true; selectSuggestion(itemObj); setTimeout(() => { isSelectingSuggestion = false; }, 100); };
                }
                container.appendChild(domNode);
            }
        }
    };

    searchPanel.onscroll = updateVisibleItems; updateVisibleItems();
};