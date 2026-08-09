new Q5("global");

// Camera and viewport
let camera = { x: 0, y: 0, zoom: 0.004 };
let targetCam = { x: null, y: null, zoom: null };
let intendedCamZoom = 0.004;
let lastCamX = 0, lastCamY = 0;
let smoothCamVel = 0;
let cameraVel = 0;
let inertiaVel = { x: 0, y: 0 };
let friction = 0.9;
let isDraggingMap = false;
let isTrackpad = false;
let timeOfLastPan = Date.now();
let originalMouseX, originalMouseY, originalCameraX, originalCameraY;
let mouseScrollX = 0, mouseScrollY = 0;

// Map and tiles
let currentDimension = 0;
const dimensionNames = ["overworld", "nether", "end"];
let lod;
let tileCache = {};
let tilesToDraw = [];
let inFlightRequests = new Set();
let activeTileKeys = new Set();
let parallax = 0.5;
let overlayOpacity = 1;
let solidBitmap;
let retintQueue = new Set();
let isRetintingQueue = false;
const tileTintCanvas = document.createElement('canvas');
const tileTintCtx = tileTintCanvas.getContext('2d');
const LOD_ADD = Math.log2(1.33);
const LOD_MULTIPLY = 1.058;

// Layers
let currentLayerSettings;
let layers = {
	"Overlay": {
		icon: "parallax",
		visible: true,
		defaultVisible: true,
		type: 'ui',
		settings: {
			"Show All Waypoints": { icon: "pin", type: "toggle", value: false, defaultValue: false },
			"Hide Atlas Waypoints": { icon: "world", type: "toggle", value: false, defaultValue: false },
			"Hide Temp Waypoints": { icon: "person", type: "toggle", value: false, defaultValue: false }
		}
	},
	"New Chunks": {
		icon: "chunkhighlights",
		visible: false,
		defaultVisible: false,
		type: 'newchunks',
		settings: {
			Opacity: { icon: "opacity", type: "slider", value: 0.5, defaultValue: 0.5 },
			Color: { icon: "brush", type: "colorpicker", value: { r: 255, g: 0, b: 0, h: 0, s: 1, v: 1 }, defaultValue: { r: 255, g: 0, b: 0, h: 0, s: 1, v: 1 } },
			Invert: { icon: "invert", type: "toggle", value: false, defaultValue: false }
		}
	},
	"Obsidian": {
		icon: "obsidian",
		visible: true,
		defaultVisible: true,
		type: 'overlay',
		settings: {
			Opacity: { icon: "opacity", type: "slider", value: 1, defaultValue: 1 },
			Parallax: { icon: "parallax", type: "toggle", value: true, defaultValue: true }
		}
	},
	"World": {
		icon: "world",
		visible: true,
		defaultVisible: true,
		type: 'base',
		settings: {
			Opacity: { icon: "opacity", type: "slider", value: 1, defaultValue: 1 }
		}
	},
	"Background": {
		icon: "2d",
		visible: true,
		defaultVisible: true,
		type: "background",
		settings: {
			Color: { icon: "brush", type: "colorpicker", value: { r: 0, g: 0, b: 0, h: 0, s: 0, v: 0 }, defaultValue: { r: 0, g: 0, b: 0, h: 0, s: 0, v: 0 } }
		}
	}
};

// Waypoints and pins
let tempWaypoints = [];
let activeHoveredWaypoint = null;
let editingWaypoint = null;
let selectedWaypointColor = 'Red';
const waypointColors = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple', 'Pink'];
let waypointIcons = {};
let pinIcon;
let pinEnd;
let rightClickCoords = { x: 0, z: 0 };

// Search and atlas
let allAtlasLocations = [];
let atlasLocations = [];
let cachedClusters = [];
let lastClusterCamX, lastClusterCamY, lastClusterZoom, lastClusterDim;
const CLUSTER_RADIUS_PIXELS = 60;
let recentSearches = [];
let searchInput;
let searchPanel;
let selectedSuggestionIndex = 0;
let currentSuggestions = [];
let itemHeight = 60;
let searchPanelVisibleCount = 10;
let lastSearchQuery = "";
let searchClickX, searchClickY;
let renderSuggestions;
let isFilterMode = false;
let searchState = null;
let isSelectingSuggestion = false;
let filterSettings = {
	radius: { icon: "radius", type: "slider", value: 10000, defaultValue: 10000, min: 5, max: 30000000 }
};
const dimensionOptions = [
	{ id: 'overworld', name: 'Overworld Coordinates', icon: 'world' },
	{ id: 'nether', name: 'Nether Coordinates', icon: 'obsidian' },
	{ id: 'end', name: 'End Coordinates', icon: 'enderchest' }
];
const formatter = new Intl.NumberFormat('en-US', {
	notation: 'compact',
	compactDisplay: 'short',
	maximumFractionDigits: 1
});
const resultsLibrary = [
    {
        "uuid": "032bdd64-e0d0-11ea-bb3c-0200516ae545",
        "summary": "Point Nemo was a base located on the 2b2t X+ World Border, established by the +X Digging Group in March 2017. Named after the oceanic pole of inaccessibility, it was built near signs left by Pyrobyte and iTristan from 2013. The base was repeatedly griefed shortly after construction and completely destroyed by May 2017.",
        "image_url": "https://static.wikitide.net/2b2twiki/5/59/PointNemoGriefed.png"
    },
    {
        "uuid": "ebfe6884-e0e0-11ea-bb3c-0200516ae545",
        "summary": "The Valley of Wheat was a massive sanctuary created by Jaang, featuring extensive wheat fields and Ancient Egyptian-style structures built from sandstone and netherrack. It was protected by players like Offtopia until the Rusher War. Following severe griefing, the sanctuary was eventually abandoned by its defenders.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/1/13/EXIjh8O.png/1200px-EXIjh8O.png"
    },
    {
        "uuid": "0cb0080f-e0e1-11ea-bb3c-0200516ae545",
        "summary": "Negative Fourhundred Eighthundred (NFE) was an early 2011 spawnbase and sanctuary originally started by Facepunch users. Despite its close proximity to spawn, it was defended by players like xcc2 and alex02028 for two years. The base was repeatedly griefed and lavacasted, ultimately falling into complete ruin after the introduction of withers.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/f/f6/ZSb8vok.png/1200px-ZSb8vok.png"
    },
    {
        "uuid": "b8adb814-e0e6-11ea-bb3c-0200516ae545",
        "summary": "Ziggy Town was a 2012 base famous for its giant bedrock comet, built using items obtained through a backdoor exploit. It featured standard Minecraft castles and a large walled-off section of dried ocean known as the Bedrock Dam. Despite numerous griefs and chunk ban attempts over the years, the bedrock comet remains a prominent server landmark.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/4/46/ZiggyTown.png/1200px-ZiggyTown.png"
    },
    {
        "uuid": "dd419f07-e0e6-11ea-bb3c-0200516ae545",
        "summary": "King's Landing was an enormous group base founded in June 2015 by OreMonger, Drewbookman, and Branillon following the Third Incursion. It featured numerous personal builds, automated farms, and the server's first automated item sorter. The base was destroyed by its own members after its coordinates were leaked by iTristan.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/5/57/Kingslandingraw.png/1200px-Kingslandingraw.png"
    },
    {
        "uuid": "0d60ff59-e0e7-11ea-bb3c-0200516ae545",
        "summary": "The Drain was the base of Offtopia and willyroof, built with assistance from Team Aurora during the Rusher War. The base was compromised in October 2016 when FitMC located it using a bedrock exploit and toured it without permission. It was subsequently griefed by the 4th Reich after its coordinates were accidentally published.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/b/b1/OfftopiasDrain.jpg/1200px-OfftopiasDrain.jpg"
    },
    {
        "uuid": "372ed124-e0e7-11ea-bb3c-0200516ae545",
        "summary": "The Kool Kids Klub was founded in 2014 by c1yd3i and Rustle_League as a remote base far from spawn. The group gradually invited other notable players and set out with grand ambitions for the location. It is most famous for housing the largest gold farm in 2b2t history.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/0/05/KoolKidsKlub.png/1200px-KoolKidsKlub.png"
    },
    {
        "uuid": "62dbf63e-e0e7-11ea-bb3c-0200516ae545",
        "summary": "Aureus City, founded in May 2015 by CainesLaw and Tachrev, was the largest base of 2016 and home to many prominent players. Known as the City of Gold, it utilized a massive gold farm to decorate its beautifully designed streets and fund extensive golden apple production. The city featured highly decorated underground mines, sea domes, and advanced redstone contraptions.",
        "image_url": "https://static.wikitide.net/2b2twiki/8/8b/Aureus_City.png"
    },
    {
        "uuid": "9329af5f-e0e7-11ea-bb3c-0200516ae545",
        "summary": "Imperator's Base was a large settlement established in 2012, famous for housing the iconic Jesus Statue. Dubbed The Ungriefable Base after the griefer popbob accepted an invitation to join, it was a hub for many well-known players. The base was eventually griefed by jared2013 in 2015 after its population declined.",
        "image_url": "https://static.wikitide.net/2b2twiki/0/02/Imperator%27s_base.png"
    },
    {
        "uuid": "fc6e8d71-e0e7-11ea-bb3c-0200516ae545",
        "summary": "Wintermelon was founded in October 2016 by Toshie and Vaxent following the destruction of Acacia. It began as a modest tower and underground storage area before expanding into a magnificent base with a cautious invitation system. The base's power increased significantly when member MrChoCho_ discovered the 11/11 dupe exploit.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/d/d0/17_-_oNnXrdm.png/1200px-17_-_oNnXrdm.png"
    },
    {
        "uuid": "1a6972ad-e0e8-11ea-bb3c-0200516ae545",
        "summary": "Summermelon was one of the largest bases on 2b2t, founded by former Wintermelon members after their previous base was griefed. It was under construction for four months before its coordinates were leaked to Fit. The base was destroyed in July 2017 by Fit and Alphacomputer acting independently of the Spawn Masons.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/4/47/Summermelonbaserender.png/1200px-Summermelonbaserender.png"
    },
    {
        "uuid": "3ceee76c-e0e8-11ea-bb3c-0200516ae545",
        "summary": "Squidbase, also known as Passietown, was founded in August 2011 by passie05 and policemike55. It boasted several castles, a Facepunch Republic meeting spot, and a large dome built by popbob using backdoor materials. The base was famously griefed on video by 4channers luke2thebun and tytoowns281 in late December 2011.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/7/74/Squidbase2.png/1200px-Squidbase2.png"
    },
    {
        "uuid": "67c1d9d8-e0e8-11ea-bb3c-0200516ae545",
        "summary": "Valkyria was created in April 2013 as a joint base between the Black Flag Group and remnants of Hitlerwood. It became the largest group base on the server, serving as the launching point for the First Incursion. The base faced internal conflict and was eventually griefed from within by former member Drewbookman.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/9/99/Valkyria1.png/1200px-Valkyria1.png"
    },
    {
        "uuid": "ff247173-e0e8-11ea-bb3c-0200516ae545",
        "summary": "The New Rainbow Islands served as the second iteration of the Rainbow Islands base. It continued the legacy of Team Rainbow on the server.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/1/1c/New_Rainbow_Islands_%28Rainbow_Republic%29_2018-04-28_Chunky_render.jpeg/1200px-New_Rainbow_Islands_%28Rainbow_Republic%29_2018-04-28_Chunky_render.jpeg"
    },
    {
        "uuid": "883ff359-e0ea-11ea-bb3c-0200516ae545",
        "summary": "The Crystal Islands were founded in October 2012 by Offtopia and two Australian players. The base featured an extensive network of strip mining tunnels and managed to stay intact for years despite its proximity to spawn. It later played a notable role during the Fourth Incursion in 2016.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/4/42/CrystalIslandsMain.png/1200px-CrystalIslandsMain.png"
    },
    {
        "uuid": "d873c9f7-e0ea-11ea-bb3c-0200516ae545",
        "summary": "Old Town was a 2011 base founded by THEJudgeHolden and Offtopia, serving as one of the few independent settlements during the Facepunch conflict. The group expanded to six members before the base was attacked by popbob in November 2011 using backdoor exploits. The site was eventually abandoned as its members migrated to other bases.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/2/20/Oldtown.jpg/1200px-Oldtown.jpg"
    },
    {
        "uuid": "13bd23cb-e0eb-11ea-bb3c-0200516ae545",
        "summary": "Plugin Town was constructed in the early days of 2b2t by former members of Passietown, including popbob and xcc2. The base was built using the TooManyItems mod, which popbob accessed via a backdoor plugin he created for Hausemaster. This exploit allowed the builders to use virtually unlimited resources despite the limited block palette of Minecraft Beta.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/d/d0/PluginTown1.png/1200px-PluginTown1.png"
    },
    {
        "uuid": "c8829838-e0eb-11ea-bb3c-0200516ae545",
        "summary": "The Dark Souls Castle was a highly detailed 2013 build created by SpoilerAlert, modeled after Sen's Fortress from the original Dark Souls game. The intentional ruin aesthetic featured massive corridors, climbing stairs, and small market areas populated with villagers. It became widely known as the site of the iconic duel between TheCampingRusher and FitMC.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/0/02/Darksoulscastle.jpg/1200px-Darksoulscastle.jpg"
    },
    {
        "uuid": "e08d017d-e0eb-11ea-bb3c-0200516ae545",
        "summary": "Tugboat Base was built in 2015 by The Fellowship of the Diamond and featured a cobblestone castle, a stone brick tower, and a distinct cartoon-style tugboat. It became a popular milestone and farming spot during the Rusher War before being heavily griefed. Despite restoration attempts by Joey_Coconut and Drachenstien, the original castle was destroyed beyond repair.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/c/c9/2017-08-22_19.31.56.png/1200px-2017-08-22_19.31.56.png"
    },
    {
        "uuid": "20b8f96e-e0ec-11ea-bb3c-0200516ae545",
        "summary": "Kaamtown was a 2012 base inhabited by xcc2 and other players. It was notable for a large sandstone temple built by xcc2. The location was eventually griefed by Javazon.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/d/dd/Kaamtown.jpg/1200px-Kaamtown.jpg"
    },
    {
        "uuid": "37766929-e0ec-11ea-bb3c-0200516ae545",
        "summary": "Gape 2.0, also known as Caleesii's Cape, was formed by members of the original Gape Group who traveled further from spawn after their previous settlements were griefed. The base was constructed by coconut4, Caleesii, James_Rustles, and Victor96. Members of this group later relocated to The Monastery, renaming it Gape Haven in 2016.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/9/95/AaronCytosGape.jpg/1200px-AaronCytosGape.jpg"
    },
    {
        "uuid": "52980b0d-e0ec-11ea-bb3c-0200516ae545",
        "summary": "Fenrir was founded by Sato86 and Pyrobyte after the griefing of the original Valkyria, bringing together the Valkyrians and the Gape Group. The base featured extensive spruce wood builds, a replica of the Second Incursion Spawn Beacon, and a brown wool Eiffel Tower. It was eventually abandoned in 2015 when its members moved to Asgard II.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/6/67/FenrirFP2.png/1200px-FenrirFP2.png"
    },
    {
        "uuid": "6bd39321-e0ec-11ea-bb3c-0200516ae545",
        "summary": "Asgard II was built by the remnants of Valkyria and the Legion during the Second Valkyrian Period, housing around 30 players. The base was destroyed following a controversial coordinate leak, prompting its members to initiate the Third Incursion in revenge. Following this conflict, the Valkyrians disbanded, with many members moving on to found Aureus City.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/8/87/Asgardii.jpg/1200px-Asgardii.jpg"
    },
    {
        "uuid": "c8a21b95-e0ec-11ea-bb3c-0200516ae545",
        "summary": "KinoGrad Base was a group settlement founded by kinorana and OreMonger following the fall of King's Landing. It featured massive, lag-inducing redstone farms, a giant stained glass sun, and a signature KinoGrad sign with Russian text. The base was destroyed by c1yd3i and iTristan during the Tyranny's Week of Destruction.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/1/16/KinoGrad1.png/1200px-KinoGrad1.png"
    },
    {
        "uuid": "dd2363d6-e0ec-11ea-bb3c-0200516ae545",
        "summary": "HardHat's Pyramid was a massive, uniquely designed structure built by CaptainHardHat in 2013 to leave a legacy on the server. Located near Imp Base, it became a well-known waypoint for travelers who often left signs or defended the site. After being leaked in 2016 and gradually destroyed by highway expansion, it was rebuilt in a new location.",
        "image_url": "https://static.miraheze.org/2b2twiki/e/ea/2b_wiki_logo.png"
    },
    {
        "uuid": "b4b32597-e0f8-11ea-bb3c-0200516ae545",
        "summary": "Wrath Outpost was an obsidian monument built by Valkyria during the Third Incursion to symbolize their rage over the destruction of Asgard II. It featured a massive domed heart and contained illegally placed bedrock from Pyrobyte's backdoor access. The outpost was heavily griefed by The 4th Reich, who used dragon eggs to remove the bedrock.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/e/e5/WrathRender.png/1200px-WrathRender.png"
    },
    {
        "uuid": "ce2eca80-e0f8-11ea-bb3c-0200516ae545",
        "summary": "The Valley of Furnaces was a creative and strange landmark located near spawn. Little is known about its earliest iterations on the server. It was later transformed into the Valley of Enderchests.",
        "image_url": "https://static.miraheze.org/2b2twiki/e/ea/2b_wiki_logo.png"
    },
    {
        "uuid": "ebd50f86-e0f8-11ea-bb3c-0200516ae545",
        "summary": "2k2k was the final stronghold of the Facepunch Republic, built in July 2012 by loyalists led by Phagocytic. The base faced relentless attacks and lavacasts from 4channers, leading to the ultimate collapse of the Republic. Over the years, the remaining structures were buried and destroyed entirely, leaving only a massive hole at its coordinates.",
        "image_url": "https://static.wikitide.net/2b2twiki/f/f5/2k2k%282012-04-02_224532%29.png"
    },
    {
        "uuid": "4d295441-e0f9-11ea-bb3c-0200516ae545",
        "summary": "The South Canal Terminal was built as an early construction and defense outpost. It served to aid the development of the southern canal.",
        "image_url": "https://static.wikitide.net/2b2twiki/0/05/71skguo8ksez.png"
    },
    {
        "uuid": "6860d235-e0f9-11ea-bb3c-0200516ae545",
        "summary": "Medina was a base established during the 4th Incursion on the server. It served as a point of operations for players involved in the spawn conflict.",
        "image_url": "https://upload.wikimedia.org/wikipedia/commons/3/37/2b2t_Logo_Vectorised.svg"
    },
    {
        "uuid": "8b227a14-e0f9-11ea-bb3c-0200516ae545",
        "summary": "The Lands was an incredibly distant base founded by Jacktherippa in 2012 after he traveled deep into the overworld via the Nether roof. It survived for years due to its sheer distance from spawn and gradually accumulated a community of notable players. The base was eventually raided and griefed by jared2013 and taylo112 using advanced movement exploits.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/d/d6/TheLands1.png/1200px-TheLands1.png"
    },
    {
        "uuid": "f16240dc-e10a-11ea-bb3c-0200516ae545",
        "summary": "Fitlantis was FitMC's first solo base since 2014, with its entire construction documented through YouTube livestreams. The base's location was discovered in late 2016 using a coordinate exploit, leading to a battle between griefers and Team Aurora. It was completely destroyed by lavacasts and flooding in April 2017.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/e/e4/2017-08-22_18.26.46.png/1200px-2017-08-22_18.26.46.png"
    },
    {
        "uuid": "907b3059-e10c-11ea-bb3c-0200516ae545",
        "summary": "The Old Spawn road is one of the oldest non-axis roads on 2b2t, built by LegitYarik in 2014. It was heavily griefed by Armorsmith in 2018, who constructed the Wrath of Armorsmith at the road's beginning.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/a/a7/Take_my_horse_to_the_old_spawn_road.png/1200px-Take_my_horse_to_the_old_spawn_road.png"
    },
    {
        "uuid": "931c5ec1-e169-11ea-bb3c-0200516ae545",
        "summary": "West Virginia was utilized as a base during the 7th Incursion. It functioned as a forward operating base for players involved in the spawn conflict.",
        "image_url": "https://upload.wikimedia.org/wikipedia/commons/3/37/2b2t_Logo_Vectorised.svg"
    },
    {
        "uuid": "2fad78dc-e16a-11ea-bb3c-0200516ae545",
        "summary": "Block Game Mecca was founded in January 2017 and grew into one of the largest bases on 2b2t, featuring massive builds aided by donkey dupes. The base operated on a strict trickle invitation system to prevent stagnation. It was ultimately destroyed from within in June 2018 by Beardler, leading to the BoeMeccan Witch Trials.",
        "image_url": "https://static.wikitide.net/2b2twiki/6/6f/Block_Game_Mecca_Banner.png"
    },
    {
        "uuid": "aea41600-e16a-11ea-bb3c-0200516ae545",
        "summary": "Equilibrium was founded in September 2016 by c3rv3z4 and initially served as a hub for German 2b2t players. The base was rapidly discovered and publicized by a YouTuber. It met its end in June 2018 when jared2013 griefed it during his month-long campaign of destruction.",
        "image_url": "https://static.wikitide.net/2b2twiki/0/0c/1200px-Equilibrium_overhead.png"
    },
    {
        "uuid": "2463ea90-e16b-11ea-bb3c-0200516ae545",
        "summary": "Invictus I was established by Vertrix and Russian, gradually recruiting players like Slappnbadkids and TechReadyGamer. The base was short-lived, lasting under a month due to member paranoia. After an unapproved invitee sent suspicious messages describing the base, the members destroyed it themselves and relocated.",
        "image_url": "https://static.wikitide.net/2b2twiki/5/58/Invictus_Banner.png"
    },
    {
        "uuid": "3e3b54e2-e16b-11ea-bb3c-0200516ae545",
        "summary": "Invictus II was constructed by the relocated Invictus group under the leadership of Vertrix, Slappnbadkids, and b3stplay3r. The base gained notoriety when its members raided and griefed La Rosa after accidentally discovering it via an exploit. Following a coordinate leak by PhantomOf2b2t, the members evacuated their stashes and abandoned the site in September 2016.",
        "image_url": "https://static.wikitide.net/2b2twiki/5/58/Invictus_Banner.png"
    },
    {
        "uuid": "092207d8-e16c-11ea-bb3c-0200516ae545",
        "summary": "Pacific Heights was a huge modern-style city on the server. The architecture was predominantly constructed out of quartz and glass.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/5/54/Pacific_Heights.png/1200px-Pacific_Heights.png"
    },
    {
        "uuid": "2ebaa6f7-e16c-11ea-bb3c-0200516ae545",
        "summary": "Ravendel was a very old town founded in 2011 by Willroof and other early players. It was a notable historical settlement during the server's early eras.",
        "image_url": "https://static.miraheze.org/2b2twiki/e/ea/2b_wiki_logo.png"
    },
    {
        "uuid": "4de2a47e-e16c-11ea-bb3c-0200516ae545",
        "summary": "The first Purgatory base was established as a temporary sanctuary. It was constructed by members of the Haven group.",
        "image_url": "https://static.wikitide.net/2b2twiki/c/c8/Builders_Haven_Banner.png"
    },
    {
        "uuid": "5e428c77-e16c-11ea-bb3c-0200516ae545",
        "summary": "Purgatory IV was the third temporary base built by the Haven group. It continued the group's series of transient settlements.",
        "image_url": "https://static.wikitide.net/2b2twiki/9/9b/Purgatory4Leak.png"
    },
    {
        "uuid": "7a3af687-e16c-11ea-bb3c-0200516ae545",
        "summary": "Shenandoah was a popular and well-known underground base on the server. It has since been griefed and abandoned.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/2/20/1_-_96rFhq0.jpg/1200px-1_-_96rFhq0.jpg"
    },
    {
        "uuid": "8c52896c-e16d-11ea-bb3c-0200516ae545",
        "summary": "This location served as an old stash belonging to the infamous player iTristan. It is notable for containing illegally obtained barrier blocks.",
        "image_url": "https://static.wikitide.net/2b2twiki/a/a3/ITristan%27s_skin.png"
    },
    {
        "uuid": "9a8f4f6e-e16f-11ea-bb3c-0200516ae545",
        "summary": "The City of Helios was a large sanctuary and monument built in June 2014. It is historically notable as the site of a widely recognized duel between Fit and NedaT in August 2016.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/f/fc/Helios4.png/1200px-Helios4.png"
    },
    {
        "uuid": "d52fa9dd-e17d-11ea-bb3c-0200516ae545",
        "summary": "Rhadamantis, originally named Kyriath, was the last major base built before the Second Incursion in 2013. Constructed by an independent group of players, it earned the title Lost City because it was abandoned and remained largely unknown for years.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/f/f3/IHSSuQ3.jpg/1200px-IHSSuQ3.jpg"
    },
    {
        "uuid": "0906b56c-e17e-11ea-bb3c-0200516ae545",
        "summary": "The 24 Million Cave was rapidly constructed in March 2017 by the +X Highway Diggers as a major outpost along the world border highway. It featured a massive custom Nether Portal, a large 24 Million wall sign, and a large nether hub. The base was quickly abandoned as diggers rushed to the world border, and it was subsequently griefed due to its exposed location on the highway.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/c/c8/24millioncave.png/1200px-24millioncave.png"
    },
    {
        "uuid": "01c6da23-e1b3-11ea-bb3c-0200516ae545",
        "summary": "Mu was an enormous group base founded in 2017 by members of the Melon Group and the Nether Highway Group. Built around a massive excavated circular basin and terraformed mountain, its construction was heavily accelerated by a secret chunk dupe. The base was intentionally flooded by its own members in 2020 after an account exploit compromised its location.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/0/09/MuRender.png/1200px-MuRender.png"
    },
    {
        "uuid": "13ae76ad-e372-11ea-bb3c-0200516ae545",
        "summary": "Asgard I was a Valkyrian base planned by Sato86 in 2013 on what he deemed the best terrain ever found on 2b2t. The base was abandoned during its construction phase after popbob discovered its coordinates using the thunderhack exploit. It served as the predecessor to Asgard II.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/7/74/Asgard_I_%281%29.jpg/1200px-Asgard_I_%281%29.jpg"
    },
    {
        "uuid": "cae03c83-e372-11ea-bb3c-0200516ae545",
        "summary": "The World Famous Spawn Base was started in February 2017 by HermeticLock as a social experiment to continuously rebuild a public base despite constant griefing. Its public coordinates turned it into a frequent battleground, hosting events like the Third Largest Battle in 2b2t History. It remained an active meeting point for years, eventually incorporating a gold farm and the Cloud Club.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/8/84/Wfsb1.png/1200px-Wfsb1.png"
    },
    {
        "uuid": "faf96e9b-e372-11ea-bb3c-0200516ae545",
        "summary": "Point Dory was the massive official base of the +X Digging Group, established right after the fall of Point Nemo. The base collapsed due to internal drama when a member named xxq shared an alt account with jared2013, leading to thefts of rare items like a Mein Kampf 121 book. Following xxq's expulsion, he leaked the coordinates, resulting in the base's destruction in May 2017.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/1/1b/PointDoryThumbnail.jpg/1200px-PointDoryThumbnail.jpg"
    },
    {
        "uuid": "89758f12-e373-11ea-bb3c-0200516ae545",
        "summary": "Sniper's Peaceful Island was started in April 2017 by Sniper231996 and zexesl2, growing to house 13 players including Valinor members. It existed for roughly eight months before being griefed in early 2018 by fr1kin, IamTUNA, and jared2013. The site was later further griefed by former member AutismBot.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/1/13/Spi2.jpg/1200px-Spi2.jpg"
    },
    {
        "uuid": "f37a3d05-e373-11ea-bb3c-0200516ae545",
        "summary": "HammerBeam was one of the bases associated with BarrenDome on the server. It has since been recorded in historical archives.",
        "image_url": "https://static.wikitide.net/2b2twiki/9/9d/Barrendome-skin.png"
    },
    {
        "uuid": "3f4ff58e-e374-11ea-bb3c-0200516ae545",
        "summary": "The Boedecken was founded in 2016 by Caineslaw following the destruction of Aureus City. The base remained a secret for two years before being leaked and griefed by Beardler during the BoeMeccan Witch Trials.",
        "image_url": "https://static.wikitide.net/2b2twiki/b/b8/Thebdkn.png"
    },
    {
        "uuid": "925213f5-e374-11ea-bb3c-0200516ae545",
        "summary": "Krobar's Keep was a base associated with the prominent builder Krobar01 on 2b2t. It stands as a testament to individual building efforts on the server.",
        "image_url": "https://static.wikitide.net/2b2twiki/9/91/Krobar_Skin.png"
    },
    {
        "uuid": "573fd705-e375-11ea-bb3c-0200516ae545",
        "summary": "Omega City was founded in July 2016 by Caviyaz as a small outpost before rapidly expanding into a fully terraformed, densely packed metropolis. Due to its proximity to spawn, it naturally attracted members of the SpawnMasons who contributed to the city's oceanic expansions. The base was discovered via elytra fly and destroyed in July 2017.",
        "image_url": "https://static.wikitide.net/2b2twiki/8/83/Minimalismo.jpg"
    },
    {
        "uuid": "c600408d-e375-11ea-bb3c-0200516ae545",
        "summary": "This location served as a base for the French YouTuber Fuze III, who initiated the 7th Incursion. It was associated with Team Baguette during his time on the server.",
        "image_url": "https://static.wikitide.net/2b2twiki/d/d9/FuzeIII.png"
    },
    {
        "uuid": "f49ab2b7-e375-11ea-bb3c-0200516ae545",
        "summary": "The Lonely Island was created in 2011 by Momo_the_Bear and BennyDeece, situated over 100k blocks from spawn—a massive distance at the time. It featured a giant Forever Alone meme statue, pretend businesses, and playable redstone minigames.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/3/33/Lonely_Island.jpg/1200px-Lonely_Island.jpg"
    },
    {
        "uuid": "ce1f630a-e376-11ea-bb3c-0200516ae545",
        "summary": "700Base was a small 2013 spawn base built by xcc2, omaliymix, and x0XP just 700 blocks away from spawn. Despite its dangerous location and heavy lavacasting, remnants of the structure can still be seen today.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/7/72/700BaseRender.jpg/1200px-700BaseRender.jpg"
    },
    {
        "uuid": "1e855672-e377-11ea-bb3c-0200516ae545",
        "summary": "Castle Hatehart was a traveler's inn constructed by LegitYarik along the Old Spawn Road in 2013. Designed to provide early players with food and basic necessities, it later served as a meeting point for Team Veteran during the 4th Incursion. The castle has faced continuous griefing and restoration cycles due to its proximity to spawn.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/a/a4/Castle_Hatehart.png/1200px-Castle_Hatehart.png"
    },
    {
        "uuid": "61f4e23f-e377-11ea-bb3c-0200516ae545",
        "summary": "Empire's Edge was a recognized base associated with the Emperium group on 2b2t. It served as one of the group's historical outposts.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/b/b5/Empires_edge_render.png/1200px-Empires_edge_render.png"
    },
    {
        "uuid": "1dfbfcc9-e379-11ea-bb3c-0200516ae545",
        "summary": "Hitlerwood was created by late Facepunchers in 2012, founded by Coldwave, Zach3397, and Hinderjd. The group later merged with the Black Flag group to establish Valkyria in 2013, leaving Hitlerwood abandoned.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/f/fd/Hitlerwoood.png/1200px-Hitlerwoood.png"
    },
    {
        "uuid": "4b878495-e3b8-11ea-bb3c-0200516ae545",
        "summary": "X-Topia was founded by DarkXL6 in February 2019 and served as the first major group base for several emerging builders. It was ultimately griefed in February 2020.",
        "image_url": "https://static.wikitide.net/2b2twiki/6/61/X-Topia.jpg"
    },
    {
        "uuid": "f6720134-e3b8-11ea-bb3c-0200516ae545",
        "summary": "Celestia was founded in late 2016 by RobMaster21, growing to support ten active members. The base was betrayed from the inside and griefed by Parthicus and http_logan in April 2017.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/8/8c/Rapture3.png/1200px-Rapture3.png"
    },
    {
        "uuid": "b5a3b298-e3b9-11ea-bb3c-0200516ae545",
        "summary": "The Monastery was a remarkably enduring 2012 base founded by marcus4761, ttfractal44, and asobl97. It survived completely undiscovered for years and featured a secret bedrock-level bunker built beneath the main structure by two later members. It remained intact until it was finally griefed in February 2020.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/9/94/Monastary.png/1200px-Monastary.png"
    },
    {
        "uuid": "46c59ffc-e3ba-11ea-bb3c-0200516ae545",
        "summary": "Lotus City II was established by the White Lotus Society after their first base was compromised, utilizing a backup stash made by elijah204. The new underwater settlement was designed as an expanded version of Rapture, though member attrition stunted the base's overall growth. The coordinates were made public in October, leading to its abandonment.",
        "image_url": "https://static.wikitide.net/2b2twiki/f/fb/White_Lotus_Banner.png"
    },
    {
        "uuid": "64d5324e-e3ba-11ea-bb3c-0200516ae545",
        "summary": "This temporary settlement was utilized by members of the 5th Incursion. It served as a staging ground for the group's operations around spawn.",
        "image_url": "https://upload.wikimedia.org/wikipedia/commons/3/37/2b2t_Logo_Vectorised.svg"
    },
    {
        "uuid": "7b989cb8-e3ba-11ea-bb3c-0200516ae545",
        "summary": "The 6th Incursion Stronghold was an operational base used by players participating in the Sixth Incursion. It acted as a primary location for the group's initiatives.",
        "image_url": "https://upload.wikimedia.org/wikipedia/commons/3/37/2b2t_Logo_Vectorised.svg"
    },
    {
        "uuid": "2508b28f-e3df-11ea-bb3c-0200516ae545",
        "summary": "Boatmurdered was an expansive early group base founded by Andrew_Gill in late 2011. It was renowned for its impressive scale, wealth, and large population of active members.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/0/08/EuU9d.jpg/1200px-EuU9d.jpg"
    },
    {
        "uuid": "7a8f3d58-e3df-11ea-bb3c-0200516ae545",
        "summary": "Whitewatch II was a significant structural build on the server, serving as a continuation of the original Whitewatch base. It represents another piece of 2b2t architectural history.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/8/8c/Rapture3.png/1200px-Rapture3.png"
    },
    {
        "uuid": "b160eded-e3df-11ea-bb3c-0200516ae545",
        "summary": "The Cloud Club was a short-lived Spawn Mason base located roughly 3,000 blocks from spawn. Built in August 2019, it served as a gathering spot for friends of the Masons and Emperium members before falling a week later.",
        "image_url": "https://static.wikitide.net/2b2twiki/8/8a/Cloud_Club.png"
    },
    {
        "uuid": "d433d21e-e3df-11ea-bb3c-0200516ae545",
        "summary": "Rocket City, also known as Fit's Sky base, was constructed in March 2017 by FitMC, Bigdon50, and other notable players. The skybase was eventually recorded into server history.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/1/1f/Rocket_Town_1.png/1200px-Rocket_Town_1.png"
    },
    {
        "uuid": "f8074a7d-e3df-11ea-bb3c-0200516ae545",
        "summary": "Yiffington I was founded by DemonElite119 following the Third Incursion and featured heavily developed artificial terrain in corrupted chunks. Despite welcoming many visitors peacefully, the base was ultimately betrayed and destroyed by jared2013. A planned successor base, Yiffington II, was intentionally leaked to prevent jared from utilizing its mob spawners.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/2/2c/Yiffington1PreGrief.png/1200px-Yiffington1PreGrief.png"
    },
    {
        "uuid": "74fdcfe8-e3e0-11ea-bb3c-0200516ae545",
        "summary": "The Gape Group traces its origins to February 2014 when Victor96 excavated a massive hole near spawn. Though a few fortresses were built, the area was quickly griefed and filled with lavacasts, prompting members to establish Gape 2.0 further out.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/9/95/AaronCytosGape.jpg/1200px-AaronCytosGape.jpg"
    },
    {
        "uuid": "a68bdbf7-e3e0-11ea-bb3c-0200516ae545",
        "summary": "Smibville was a snowy SpawnMason group base founded in May 2019. Built around a central area of ice spikes, it lasted until it was griefed in January 2020.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/9/9e/Smibville_2020-01-12a.png/1200px-Smibville_2020-01-12a.png"
    },
    {
        "uuid": "eb766f03-e3f2-11ea-bb3c-0200516ae545",
        "summary": "Avalon City, or the City of Peace, was founded in 2013 by AwesomeGuyMonkey as a safe sanctuary for wandering travelers. It featured interconnected railroads, villager trading hotels, and a functioning zoo. The refuge operated on the strict condition that visitors arrived in peace and abstained from violence.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/5/56/Avalon1.png/1200px-Avalon1.png"
    },
    {
        "uuid": "f5a9d782-e4aa-11ea-bb3c-0200516ae545",
        "summary": "Space Valkyria 3 was a large-scale End base initiated by Jacktherippa in early 2017, featuring an extensive underground dupe stash. Designed alongside players like SilverKrownKing and HermeticLock, it was built further out than any previous End base. The unfinished structure was likely griefed in 2019, though a world download was salvaged and released.",
        "image_url": "https://static.wikitide.net/2b2twiki/8/85/Space_Valk_3.png"
    },
    {
        "uuid": "19cc880e-e4ab-11ea-bb3c-0200516ae545",
        "summary": "Space Valkyria was an iconic End base built by Jacktherippa using glitched infinite blocks. Discovered accidentally by Fit in 2015, it was subsequently destroyed by griefers utilizing message coordinate exploits and iTristan's backdoor access. The ruins were repeatedly withered over the years, rendering the original structure unrecognizable.",
        "image_url": "https://static.wikitide.net/2b2twiki/3/30/Space_Valkyria.png"
    },
    {
        "uuid": "3e02ddbe-e4ab-11ea-bb3c-0200516ae545",
        "summary": "Space Valkyria 2 was constructed by Jacktherippa after the fall of the original base. To protect its location, Jack systematically destroyed every known End portal on the server in 2015. The base featured a massive quartz and obsidian structure alongside a floating, grass-covered island populated with villagers.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/0/01/SpaceValk2.png/1200px-SpaceValk2.png"
    },
    {
        "uuid": "13fda6a8-e4ae-11ea-bb3c-0200516ae545",
        "summary": "Armorland was established at the extreme corner of the world border by Armorsmith in August 2017. He utilized an elytra exploit that rapidly loaded chunks to reach the location before any other player.",
        "image_url": "https://static.miraheze.org/2b2twiki/e/ea/2b_wiki_logo.png"
    },
    {
        "uuid": "6e55dfa7-e4cc-11ea-bb3c-0200516ae545",
        "summary": "Argonath was a famous structural build on 2b2t created by The Last Templar. The creation is heavily noted in the server's architectural history.",
        "image_url": "https://static.miraheze.org/2b2twiki/e/ea/2b_wiki_logo.png"
    },
    {
        "uuid": "6dcab63a-e4cd-11ea-bb3c-0200516ae545",
        "summary": "Eldorado was an incredibly massive project started by Leuphou in July 2019, covering an entire landmass with precious ore blocks. The build predominantly utilized gold blocks before it was discovered and griefed in January 2020.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/2/2a/Eldorado.png/1200px-Eldorado.png"
    },
    {
        "uuid": "eeadc093-e4cd-11ea-bb3c-0200516ae545",
        "summary": "Etobase was a notable settlement recorded on the 2b2t server map. It remains archived as part of the server's extensive base history.",
        "image_url": "https://static.miraheze.org/2b2twiki/e/ea/2b_wiki_logo.png"
    },
    {
        "uuid": "7498533a-e4ce-11ea-bb3c-0200516ae545",
        "summary": "SnackyNorph's Library was a renowned literary build and repository created by SnackyNorph during the server's earlier years. It stands as a prominent historical monument.",
        "image_url": "https://static.wikitide.net/2b2twiki/7/7c/SnackyNorph-skin.png"
    },
    {
        "uuid": "e3c07f0a-fb40-11ea-b273-0200516ae545",
        "summary": "The Detroit Flight Center, built by FitMC, was an End base project that ultimately remained an unfinished stone brick platform. It never reached its full potential before being abandoned.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/8/8c/Rapture3.png/1200px-Rapture3.png"
    },
    {
        "uuid": "f5603b6e-e16c-11ea-bb3c-0200516ae545",
        "summary": "Valerian was a large group base initiated in March 2018 by HawkedOnFonix and OldFreeWilly. Operating with a structured Valerian Congress where members held specific bureaucratic titles, the base absorbed members from Builder's Haven. The coordinates were leaked in June 2019 and the base was griefed shortly after.",
        "image_url": "https://static.wikitide.net/2b2twiki/3/33/Valerian_logo.png"
    },
    {
        "uuid": "497bc076-0992-11eb-b273-0200516ae545",
        "summary": "This coordinate marks the north-west corner of the overworld world border. It was reached via a massive diagonal highway dug by the Motorway Extension Gurus in May 2020.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/1/1c/MEGNewLogo.png/1200px-MEGNewLogo.png"
    },
    {
        "uuid": "7bd00ff0-0992-11eb-b273-0200516ae545",
        "summary": "The south-east corner of the overworld was reached via the second elytra-friendly diagonal highway created by the Motorway Extension Gurus. The 3,000-hour digging project was completed in September 2020 by dedicated community members like harritaco and KevinKC2014.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/1/1c/MEGNewLogo.png/1200px-MEGNewLogo.png"
    },
    {
        "uuid": "86c94178-1d3a-11eb-b273-0200516ae545",
        "summary": "La Capital was the very first base built by The Republic group. It remained active from 2017 until its end in early 2018.",
        "image_url": "https://static.wikitide.net/2b2twiki/3/3d/Greece-38803_960_720.png"
    },
    {
        "uuid": "65f51507-e93a-11ea-bb3c-0200516ae545",
        "summary": "Turrim, known as the City of Towers, was a settlement founded by Todarac in July 2016. It is recorded among the notable historical bases on 2b2t.",
        "image_url": "https://static.miraheze.org/2b2twiki/e/ea/2b_wiki_logo.png"
    },
    {
        "uuid": "a6ae5db9-e93a-11ea-bb3c-0200516ae545",
        "summary": "Victoria was a notable base constructed by the player mattvtd. It exists within the archives of 2b2t's expansive base history.",
        "image_url": "https://static.wikitide.net/2b2twiki/9/93/VictoriaThumbnail.jpg"
    },
    {
        "uuid": "629045fb-e93b-11ea-bb3c-0200516ae545",
        "summary": "Zirilzuntir was a predominantly underground base founded by Doctrzombie in September 2017. Internal strife over destroyed items led member McNeo to abandon the group and subsequently leak the coordinates in April 2018. Following the leak, the base was griefed by its own members to deny others the satisfaction.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/0/02/ZirilzuntirFront.png/1200px-ZirilzuntirFront.png"
    },
    {
        "uuid": "88db1f92-e93b-11ea-bb3c-0200516ae545",
        "summary": "Swastika Base was an older build consisting of multiple swastikas and nether portals crafted from unusual materials like lava and diamond blocks. Its central feature was two pyramids touching at their points.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/2/2c/Griefed_Swastika.jpg/1200px-Griefed_Swastika.jpg"
    },
    {
        "uuid": "c5ebf103-e93b-11ea-bb3c-0200516ae545",
        "summary": "Shelter 404 was a documented base location on 2b2t associated with the server's long history of scattered settlements. It was established in the earlier days of the server.",
        "image_url": "https://static.miraheze.org/2b2twiki/e/ea/2b_wiki_logo.png"
    },
    {
        "uuid": "a2b905c6-e93c-11ea-bb3c-0200516ae545",
        "summary": "La Rosa was a large base started in early 2016 by C4RTM4N. It was accidentally discovered and subsequently robbed by the Invictus group, who mistakenly thought it was abandoned. After C4RTM4N expressed anger over the theft, the Invictus members returned to thoroughly grief the settlement.",
        "image_url": "https://static.miraheze.org/2b2twiki/e/ea/2b_wiki_logo.png"
    },
    {
        "uuid": "e41e3fe5-e93d-11ea-bb3c-0200516ae545",
        "summary": "Elysium I was established in June 2019 by Carlll_ and several players who traveled millions of blocks down the Z+ highway. The base slowly expanded over several months, gaining true significance and a larger community by October 2019.",
        "image_url": "https://static.wikitide.net/2b2twiki/8/8d/ElysiumIcon.gif"
    },
    {
        "uuid": "14e7a9f3-e93e-11ea-bb3c-0200516ae545",
        "summary": "The Cesspool was started by Happysnackers in August 2018 and rapidly grew as new members were recruited off the highway. Fueled by the public book dupe, members constructed a town hall, library, and an expansive slave district. The base ultimately met its end in July 2019.",
        "image_url": "https://static.miraheze.org/2b2twiki/e/ea/2b_wiki_logo.png"
    },
    {
        "uuid": "ebf7117e-e93f-11ea-bb3c-0200516ae545",
        "summary": "Valhalla was a famously large build featured within 2b2t's history. It represents another iconic piece of architecture from the server's past.",
        "image_url": "https://static.miraheze.org/2b2twiki/e/ea/2b_wiki_logo.png"
    },
    {
        "uuid": "53916041-e940-11ea-bb3c-0200516ae545",
        "summary": "Purgatory 2 was a massive but short-lived base that began construction in June 2018. It was griefed mere weeks later following the drama of the BoeMeccan Witch Trials.",
        "image_url": "https://static.wikitide.net/2b2twiki/0/04/Purgatory2.png"
    },
    {
        "uuid": "e27d4a93-eb4a-11ea-bb3c-0200516ae545",
        "summary": "The Paragon was notable for its extensive area coverage and association with the hyper-secret Valinor group. After being abandoned by its original builders, it was linked to Team Infrared and Emperium before facing destruction in January 2018.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/3/3c/Pargon.jpg/1200px-Pargon.jpg"
    },
    {
        "uuid": "a13eafa9-e946-11ea-bb3c-0200516ae545",
        "summary": "This base served as a stronghold for the notorious 4th Reich group on the server. It was heavily involved in the factional wars typical of the era.",
        "image_url": "https://static.wikitide.net/2b2twiki/d/d1/4thReichGroup.png"
    },
    {
        "uuid": "d36419bd-9a4c-11eb-9276-0200516ae545",
        "summary": "Built by jdw99666 and Omaliymix, the 1 Million Base was the first 2b2t settlement to surpass the one-million block mark from spawn. Players endured long, starvation-inducing nether tunnel treks to reach the sanctuary and build massive storage facilities and farms. It was griefed shortly after x0XP was invited and toured the premises.",
        "image_url": "https://static.wikitide.net/2b2twiki/1/1a/N3xJs.png"
    },
    {
        "uuid": "3990a4d2-c6cd-11eb-873f-0200516ae545",
        "summary": "Imperator's Base 2 was secretly created in 2015 when iTristan used root access to copy and paste the original base's region files millions of blocks away. The anomaly featured a massive flat bedrock floor due to a void-hole plugin. The rebuild remained untouched until jared2013 accidentally flew into it in May 2021 and subsequently griefed it again.",
        "image_url": "https://static.wikitide.net/2b2twiki/0/02/Imperator%27s_base.png"
    },
    {
        "uuid": "df3e829f-6b12-11eb-b0ae-0200516ae545",
        "summary": "The first Lost Nomad Games was an event hosted by The Lost Nomads featuring various minigame arenas. Built over a month by players like xAlyssa_ and oofplux, the event successfully took place in January 2021. The hosting PvP team effectively defended the grounds from a few griefers who attempted to disrupt the games.",
        "image_url": "https://static.wikitide.net/2b2twiki/6/63/The_Lost_Nomads_Logo.png"
    },
    {
        "uuid": "5d8ef0f2-6b17-11eb-b0ae-0200516ae545",
        "summary": "This location hosted the second installment of the Lost Nomad Games. It prominently featured a Hagia Sophia build by Franknificant.",
        "image_url": "https://static.wikitide.net/2b2twiki/6/63/The_Lost_Nomads_Logo.png"
    },
    {
        "uuid": "a8ddb66a-6b17-11eb-b0ae-0200516ae545",
        "summary": "The third iteration of the Lost Nomad Games event was held in collaboration with the 2b2t Wave Shop. It featured various minigame arenas and builds.",
        "image_url": "https://static.wikitide.net/2b2twiki/6/63/The_Lost_Nomads_Logo.png"
    },
    {
        "uuid": "838c2c43-8b3e-11eb-8bfb-0200516ae545",
        "summary": "The third and final Lost Nomad Games was constructed over a month and held in March 2021. It featured diverse builds like a miniature Space Valkyria 3 replica and a TNT Run arena. The event was prematurely griefed after its coordinates were accidentally leaked on stream.",
        "image_url": "https://static.wikitide.net/2b2twiki/6/63/The_Lost_Nomads_Logo.png"
    },
    {
        "uuid": "d11d0482-3fd5-11eb-9990-0200516ae545",
        "summary": "Iretown was a base associated with the faction known as The Order Of The Tower. It was established as a prominent settlement during its active period.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/8/8c/Rapture3.png/1200px-Rapture3.png"
    },
    {
        "uuid": "b1ececd3-ecf9-11eb-873f-0200516ae545",
        "summary": "c0mmiegrad was a large obsidian dome enclosing a central pyramid. The structure was pre-designed on a private server before being built on 2b2t by The Gulag, who spent roughly 12 hours manually mining the required ice for the base's watercube.",
        "image_url": "https://static.wikitide.net/2b2twiki/thumb/b/bf/GOOLAG_0_0.png/1200px-GOOLAG_0_0.png"
    },
    {
        "uuid": "7a7f8cb0-9a4e-11eb-9276-0200516ae545",
        "summary": "This base served as a recruiting hub for the Imperia group on 2b2t. It played an instrumental role in establishing new members for the faction.",
        "image_url": "https://static.miraheze.org/2b2twiki/e/ea/2b_wiki_logo.png"
    },
    {
        "uuid": "ae2c3c99-e4aa-11ea-bb3c-0200516ae545",
        "summary": "Endcursion was founded by Krobar01 after the fall of the Space Jam base. The base was ultimately abandoned after its coordinates were compromised by 0x22 utilizing an authentication exploit.",
        "image_url": "https://static.wikitide.net/2b2twiki/9/91/Krobar_Skin.png"
    },
    {
        "uuid": "8d829afc-7536-11eb-b0ae-0200516ae545",
        "summary": "This marks the original location of Space Valkyria 3 before it was relocated in early 2018. While the secondary location was later griefed, this initial site remained intact.",
        "image_url": "https://static.wikitide.net/2b2twiki/8/85/Space_Valk_3.png"
    }
]

// UI and misc things
let uiElements = {};
let coordinateText, coordinateTextNether;
let layersButton;
let layersettings;
let changeListeners = [];
let poppins;
let debugGrid = false;
let lastDisplayX = null, lastDisplayY = null;
let copyLinkSettings = {
	"Include All": false, "Layer Settings": false, "Current Search": false,
	"Temporary Waypoints": false, "Keep Existing URL Parameters": false
};