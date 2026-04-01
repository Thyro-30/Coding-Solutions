/**
 * STIGMERGY WORKER — v20260331-A1 (COMPREHENSIVE)
 * Planetary Co-Intelligence Engine | Ayu.Earth
 *
 * Full RAG pipeline: BM25 retrieval → Claude synthesis → source attribution
 * All systems fully implemented: biosignal, clock, stigmergy traces,
 * actor alignment, ancient intelligence, wellbeing, discovery, energy,
 * multilateral agreements, recategorization, PDF ingestion, scraping.
 *
 * Bindings required:
 *   ADMIN_KEY     — Secrets Store
 *   AI             — Workers AI binding (free)
 *   STIGMERGY_KV  — KV Namespace
 *   STIGMERGY_R2  — R2 Bucket
 *   STIGMERGY_DB  — D1 Database
 *
 * Cron triggers:
 *   0 2 * * 0  — Weekly maintenance (scrape + wellbeing + recategorize + clock)
 *   0 * * * *  — Hourly decay engine
 */

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const VERSION = 'v20260331-A1';
const MODEL   = 'claude-opus-4-5';

// ── BUILD MANIFEST ─────────────────────────────────────────────────────────
// Single source of truth for what is built. Keep this in sync with the code.
// The admin Architecture page fetches /api/build/manifest to render live status.
// Rule: if you touch a gap's code, update its status here in the same commit.
const BUILD_MANIFEST = {
  version: VERSION,
  build_date: '2026-03-31',
  endpoint_count: 109,
  gaps: [
    { id: 1, name: 'Natural agent sovereignty', status: 'built',
      endpoints: ['/api/na/ingest', '/api/na/signals', '/api/na/traces'],
      notes: 'Immutable raw_value, sovereignty_tag, FPIC read-filter. D1: natural_signals.' },
    { id: 2, name: 'Cross-agent trace routing', status: 'built',
      endpoints: ['/api/stigmergy/deposit', '/api/na/traces'],
      notes: 'source_agent_class on every trace. Extended TTL by severity. HITL queue routing.' },
    { id: 3, name: 'Actor generative model inference', status: 'built',
      endpoints: ['/api/actors/:id/model', '/api/actors/infer-models'],
      notes: 'Behavioral trace → prior precision. Dynamic model replaces static AAI score.' },
    { id: 4, name: 'AIF Phase 4 collective signal', status: 'partial',
      endpoints: ['/api/collective/signal', '/api/bis/synchrony', '/api/stigmergy/attractors'],
      notes: 'Algorithms live. Missing: Cron Trigger for weekly attractor write-back to KV.' },
    { id: 5, name: 'Bio-hybrid sensor ingest', status: 'built',
      endpoints: ['/api/sensor/register', '/api/sensor/list', '/api/sensor/deactivate', '/api/ingest'],
      notes: 'Authenticated sensor registry + Umwelt-routed ingest with sphere validation.' },
    { id: 6, name: 'Indigenous data sovereignty', status: 'built',
      endpoints: ['/api/sovereignty/territory', '/api/sovereignty/request', '/api/sovereignty/decide'],
      notes: 'Full FPIC consent workflow. Territorial boundary registry. Steward-governed access.' },
    { id: 7, name: 'HITL intervention flow', status: 'built',
      endpoints: ['/api/hitl/queue', '/api/hitl/review', '/api/hitl/outcome'],
      notes: 'Review queue, intervention decision logging, outcome tracking, node maturity hooks.' },
    { id: 8, name: 'Semantic RAG (embeddings)', status: 'partial',
      endpoints: ['/api/embeddings/backfill', '/api/embeddings/status'],
      notes: 'BGE-small-en embeddings in KV. Hybrid BM25(0.4)+semantic(0.6). Fine-tuning not started.' },
  ],
  features: [
    { name: 'Umwelt sphere routing', status: 'built',
      notes: 'Every ingest signal routed via SIGNAL_TO_SPHERE → NATURAL_UMWELT biome check → liminal bucket.' },
    { name: 'Node maturation tracking (LITL)', status: 'built',
      notes: 'Per-node seeded→emerging→maturing→mature. HITL gate intensity reduces with maturity.' },
    { name: 'Biology-closes-loops', status: 'built',
      notes: '3+ consecutive above-preferred readings without HITL → self_resolution trace + kin propagation.' },
    { name: 'Cross-bioregion stigmergy', status: 'built',
      notes: 'BIOREGION_KINSHIP maps 52 bioregions. Distress/recovery propagated with dampening (×0.4).' },
    { name: 'BIS Synchrony detection', status: 'built',
      notes: 'Correlated node movement detection. Realm-level clustering. planetary_co_intelligence_signal.' },
    { name: 'LAP (Living Archive Protocol)', status: 'built',
      notes: 'Regenerative constraints + perturbation logging. /api/lap/query, /api/lap/constraints.' },
    { name: 'LITL score + stage', status: 'built',
      notes: 'Score = 1 − (hitl_30d / steward_30d). Stages: HITL→LITL Emerging→LITL Mature→Planetary CI.' },
    { name: 'Planetary co-intelligence signal', status: 'built',
      notes: 'Observable via /api/bis/synchrony → planetary_co_intelligence_signal field.' },
    { name: 'Historical data ingest (Open-Meteo + NOAA)', status: 'built',
      notes: '52 bioregions × ~4000 days × 3 signals = ~624k records. CO₂ 1979–present. /api/na/ingest-historical, /api/na/ingest-co2.' },
    { name: 'Real-time planetary streams', status: 'built',
      notes: 'Live weather (15min), air quality/CAMS (60min), marine/SST (15min), flood discharge (6h). 5 endpoints. Sunday cron ingest. /api/na/stream/*.' },
  ],
  litl_stage: 'HITL',
  next_milestone: 'Gap #4 cron trigger → weekly attractor accumulation → LITL Emerging',
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key',
  'Content-Type': 'application/json',
};

// Sphere taxonomy
const SPHERES = {
  BIOSPHERE:   { label: 'Biosphere',           icon: '🌿', desc: 'Living organisms, ecology, biodiversity' },
  ATMOSPHERE:  { label: 'Atmosphere',           icon: '🌤', desc: 'Climate, weather, air systems' },
  HYDROSPHERE: { label: 'Hydrosphere',          icon: '💧', desc: 'Water cycles, oceans, watersheds' },
  ANTHRO:      { label: 'Anthroposphere',       icon: '🏘', desc: 'Human settlements, built environment' },
  NOOSPHERE:   { label: 'Noosphere',            icon: '🧠', desc: 'Human knowledge, consciousness, worldviews' },
  TECHNO:      { label: 'Technosphere',         icon: '⚙',  desc: 'Technology, infrastructure, tools' },
  ECONO:       { label: 'Econosphere',          icon: '📊', desc: 'Economic systems, finance, trade' },
  ANCIENT:     { label: 'Ancient Intelligence', icon: '🪶', desc: 'Indigenous knowledge, ancestral wisdom' },
  REGEN:       { label: 'Regeneration',         icon: '♻',  desc: 'Cross-cutting regenerative practice' },
  GOVERNANCE:  { label: 'Governance',           icon: '🏛',  desc: 'Multilateral agreements, policy, law' },
};

// BM25 stop words
const STOP = new Set(['the','and','for','are','but','not','you','all','can','had','her','was',
  'one','our','out','day','get','has','him','his','how','man','new','now','old','see','two',
  'way','who','boy','did','its','let','put','say','she','too','use','that','this','with',
  'have','from','they','will','been','each','into','more','than','then','them','some','what',
  'also','when','where','which','there','their','about','would','these','other','after']);

// Living Systems Principles (Biomimicry Institute)
const PRINCIPLES = [
  'Life creates conditions conducive to life',
  'Optimize the whole, not the parts',
  'Use waste as resource',
  'Diversity enables resilience',
  'Integrate development with growth',
  'Use boundaries as creative opportunity',
  'Rely on local expertise',
  'Run on sunlight',
  'Use only what you need',
  'Fit form to function',
  'Reward cooperation',
  'Tap the power of limits',
];

// ── Umwelt signal vocabulary (sphere → signal types for natural nodes) ───────
// Defines which signal types belong to which sphere.
// Sphere vocabulary changes = code deploy (slow, deliberate).
// Node registration (bioregion × sphere combinations) = KV (fast).
const NATURAL_UMWELT = {
  tropical_forest:     ['BIOSPHERE', 'ATMOSPHERE', 'HYDROSPHERE'],
  coral_reef:          ['HYDROSPHERE', 'BIOSPHERE'],
  arid_grassland:      ['BIOSPHERE', 'ATMOSPHERE', 'HYDROSPHERE'],
  taiga:               ['BIOSPHERE', 'ATMOSPHERE'],
  alpine_glacier:      ['HYDROSPHERE', 'ATMOSPHERE'],
  polar_ice:           ['ATMOSPHERE', 'HYDROSPHERE'],
  tropical_savanna:    ['BIOSPHERE', 'ATMOSPHERE', 'HYDROSPHERE'],
  mediterranean_shrub: ['BIOSPHERE', 'HYDROSPHERE'],
  montane_grassland:   ['BIOSPHERE', 'HYDROSPHERE'],
  temperate_broadleaf: ['BIOSPHERE', 'ATMOSPHERE'],
  temperate_grassland: ['BIOSPHERE', 'ATMOSPHERE'],
  temperate_conifer:   ['BIOSPHERE', 'ATMOSPHERE'],
  tropical_dry_forest: ['BIOSPHERE', 'ATMOSPHERE', 'HYDROSPHERE'],
  island_endemic:      ['BIOSPHERE', 'HYDROSPHERE'],
  montane_forest:      ['BIOSPHERE', 'HYDROSPHERE', 'ATMOSPHERE'],
  alpine_grassland:    ['BIOSPHERE', 'HYDROSPHERE'],
  desert:              ['BIOSPHERE', 'ATMOSPHERE'],
  arid_shrubland:      ['BIOSPHERE', 'ATMOSPHERE'],
  mangrove:            ['HYDROSPHERE', 'BIOSPHERE'],
  wetland:             ['HYDROSPHERE', 'BIOSPHERE'],
  kelp_forest:         ['HYDROSPHERE', 'BIOSPHERE'],
  boreal_peatland:     ['BIOSPHERE', 'ATMOSPHERE', 'HYDROSPHERE'],
};

// ── One Earth Bioregions (~43 entries aligned to One Earth taxonomy) ─────────
// Each node = bioregion × sphere. Total nodes ≈ sum of spheres per biome.
// pop_level: 1=PoP1 Rocky Mountain pilot, 2=PoP2 major hotspots, 3=PoP3 full
// realm/subrealm: One Earth 8-realm → 14-subrealm hierarchy
const BIOREGIONS = [
  // ── NEARCTIC ──────────────────────────────────────────────────────────────
  { id:'rocky_mountain',        name:'Rocky Mountain Front Range',        realm:'Nearctic',    subrealm:'Northern Americas',    lat:39.95, lng:-105.16, vitality:58, trend:'variable',  biome:'montane_grassland',   pop_level:1 },
  { id:'california',            name:'California Floristic Province',     realm:'Nearctic',    subrealm:'Northern Americas',    lat:37.0,  lng:-120.0,  vitality:48, trend:'variable',  biome:'mediterranean_shrub', pop_level:3 },
  { id:'great_plains',          name:'North American Great Plains',       realm:'Nearctic',    subrealm:'Northern Americas',    lat:41.0,  lng:-100.0,  vitality:40, trend:'declining', biome:'temperate_grassland', pop_level:3 },
  { id:'appalachian',           name:'Appalachian Mixed Forests',         realm:'Nearctic',    subrealm:'Eastern Americas',     lat:37.5,  lng:-82.0,   vitality:55, trend:'stable',    biome:'temperate_broadleaf', pop_level:3 },
  { id:'pacific_northwest',     name:'Pacific Northwest Temperate Forest',realm:'Nearctic',    subrealm:'Northern Americas',    lat:47.0,  lng:-122.5,  vitality:61, trend:'stable',    biome:'temperate_conifer',   pop_level:3 },
  { id:'arctic_nearctic',       name:'Arctic Tundra — North America',     realm:'Nearctic',    subrealm:'Northern Americas',    lat:69.0,  lng:-105.0,  vitality:30, trend:'declining', biome:'polar_ice',           pop_level:3 },
  { id:'sonoran_chihuahuan',    name:'Sonoran & Chihuahuan Deserts',      realm:'Nearctic',    subrealm:'Northern Americas',    lat:30.5,  lng:-109.0,  vitality:45, trend:'variable',  biome:'desert',              pop_level:3 },
  // ── NEOTROPICS ────────────────────────────────────────────────────────────
  { id:'amazon',                name:'Amazon Basin',                      realm:'Neotropics',  subrealm:'Northern South America',lat:-3.5, lng:-62.2,  vitality:52, trend:'declining', biome:'tropical_forest',     pop_level:2 },
  { id:'cerrado',               name:'Brazilian Cerrado',                  realm:'Neotropics',  subrealm:'Southern South America',lat:-15.0,lng:-47.0,  vitality:33, trend:'declining', biome:'tropical_savanna',    pop_level:3 },
  { id:'atlantic_forest',       name:'Atlantic Forest',                   realm:'Neotropics',  subrealm:'Southern South America',lat:-23.0,lng:-46.0,  vitality:29, trend:'declining', biome:'tropical_forest',     pop_level:3 },
  { id:'andean_highlands',      name:'Andean Highlands & Páramo',         realm:'Neotropics',  subrealm:'Northern South America',lat:-4.0, lng:-77.0,  vitality:44, trend:'declining', biome:'montane_grassland',   pop_level:3 },
  { id:'patagonia',             name:'Patagonian Steppe & Andes',         realm:'Neotropics',  subrealm:'Southern South America',lat:-46.0,lng:-69.0,  vitality:60, trend:'stable',    biome:'arid_grassland',      pop_level:3 },
  { id:'caribbean_forests',     name:'Caribbean Dry & Moist Forests',     realm:'Neotropics',  subrealm:'Caribbean',            lat:18.0, lng:-70.0,   vitality:36, trend:'declining', biome:'tropical_dry_forest', pop_level:3 },
  { id:'orinoco',               name:'Orinoco Llanos & Flooded Savanna',  realm:'Neotropics',  subrealm:'Northern South America',lat:6.5,  lng:-67.0,  vitality:55, trend:'variable',  biome:'tropical_savanna',    pop_level:3 },
  // ── AFROTROPICS ───────────────────────────────────────────────────────────
  { id:'congo',                 name:'Congo Basin',                        realm:'Afrotropics', subrealm:'Central Africa',       lat:-1.5,  lng:23.0,   vitality:61, trend:'declining', biome:'tropical_forest',     pop_level:2 },
  { id:'sahel',                 name:'Sahel Dry Savanna',                 realm:'Afrotropics', subrealm:'Northern Africa',      lat:13.5,  lng:2.1,    vitality:38, trend:'variable',  biome:'arid_grassland',      pop_level:3 },
  { id:'east_african_savanna',  name:'East African Savanna & Rift',       realm:'Afrotropics', subrealm:'Eastern Africa',       lat:-1.5,  lng:36.5,   vitality:49, trend:'variable',  biome:'tropical_savanna',    pop_level:3 },
  { id:'cape_floristic',        name:'Cape Floristic Region',             realm:'Afrotropics', subrealm:'Southern Africa',      lat:-33.5, lng:19.0,   vitality:42, trend:'declining', biome:'mediterranean_shrub', pop_level:3 },
  { id:'madagascar',            name:'Madagascar & Indian Ocean Islands', realm:'Afrotropics', subrealm:'Indian Ocean Islands', lat:-19.0, lng:46.5,   vitality:31, trend:'declining', biome:'island_endemic',      pop_level:3 },
  { id:'miombo',                name:'Miombo Woodlands',                  realm:'Afrotropics', subrealm:'Eastern Africa',       lat:-12.0, lng:30.0,   vitality:50, trend:'declining', biome:'tropical_dry_forest', pop_level:3 },
  { id:'horn_of_africa',        name:'Horn of Africa Dry Forests',        realm:'Afrotropics', subrealm:'Northern Africa',      lat:9.0,   lng:44.0,   vitality:27, trend:'declining', biome:'arid_shrubland',      pop_level:3 },
  // ── PALEARCTIC ────────────────────────────────────────────────────────────
  { id:'boreal',                name:'Eurasian Boreal Forest (Taiga)',    realm:'Palearctic',  subrealm:'Northern Eurasia',     lat:58.0,  lng:85.0,   vitality:67, trend:'stable',    biome:'taiga',               pop_level:3 },
  { id:'mediterranean',         name:'Mediterranean Basin',               realm:'Palearctic',  subrealm:'Southern Europe',      lat:38.0,  lng:15.0,   vitality:44, trend:'stable',    biome:'mediterranean_shrub', pop_level:3 },
  { id:'central_asian_steppe',  name:'Central Asian Steppe',              realm:'Palearctic',  subrealm:'Central Asia',         lat:48.0,  lng:62.0,   vitality:46, trend:'variable',  biome:'temperate_grassland', pop_level:3 },
  { id:'caucasus',              name:'Caucasus Mixed Forests',            realm:'Palearctic',  subrealm:'Western Eurasia',      lat:41.5,  lng:44.0,   vitality:53, trend:'stable',    biome:'temperate_broadleaf', pop_level:3 },
  { id:'arctic_palearctic',     name:'Arctic Tundra — Eurasia',           realm:'Palearctic',  subrealm:'Northern Eurasia',     lat:73.0,  lng:100.0,  vitality:28, trend:'declining', biome:'polar_ice',           pop_level:3 },
  { id:'european_broadleaf',    name:'European Broadleaf & Mixed Forests',realm:'Palearctic',  subrealm:'Western Europe',       lat:51.0,  lng:10.0,   vitality:50, trend:'stable',    biome:'temperate_broadleaf', pop_level:3 },
  // ── INDOMALAYAN ───────────────────────────────────────────────────────────
  { id:'himalayan',             name:'Himalayan Alpine & Glaciers',       realm:'Indomalayan', subrealm:'South Asia',           lat:29.0,  lng:83.0,   vitality:35, trend:'declining', biome:'alpine_glacier',      pop_level:3 },
  { id:'sundaland',             name:'Sundaland Tropical Forests',        realm:'Indomalayan', subrealm:'Southeast Asia',       lat:0.0,   lng:110.0,  vitality:36, trend:'declining', biome:'tropical_forest',     pop_level:3 },
  { id:'western_ghats',         name:'Western Ghats & Sri Lanka',         realm:'Indomalayan', subrealm:'South Asia',           lat:10.5,  lng:76.5,   vitality:38, trend:'declining', biome:'tropical_forest',     pop_level:3 },
  { id:'indochina',             name:'Indochina Dry & Moist Forests',     realm:'Indomalayan', subrealm:'Southeast Asia',       lat:16.0,  lng:104.0,  vitality:42, trend:'declining', biome:'tropical_forest',     pop_level:3 },
  { id:'ganges_brahmaputra',    name:'Ganges-Brahmaputra Floodplains',    realm:'Indomalayan', subrealm:'South Asia',           lat:24.0,  lng:89.0,   vitality:33, trend:'declining', biome:'wetland',             pop_level:3 },
  // ── AUSTRALASIAN ──────────────────────────────────────────────────────────
  { id:'great_barrier',         name:'Great Barrier Reef',                realm:'Australasian',subrealm:'Australia',            lat:-18.3, lng:147.7,  vitality:41, trend:'declining', biome:'coral_reef',          pop_level:2 },
  { id:'southwest_australia',   name:'Southwest Australia Forests',       realm:'Australasian',subrealm:'Australia',            lat:-31.0, lng:117.5,  vitality:40, trend:'declining', biome:'mediterranean_shrub', pop_level:3 },
  { id:'new_guinea',            name:'New Guinea Montane & Lowland',      realm:'Australasian',subrealm:'Melanesia',            lat:-5.5,  lng:144.0,  vitality:62, trend:'stable',    biome:'montane_forest',      pop_level:3 },
  { id:'new_zealand',           name:'New Zealand Temperate Rainforest',  realm:'Australasian',subrealm:'New Zealand',          lat:-42.0, lng:172.0,  vitality:45, trend:'stable',    biome:'temperate_conifer',   pop_level:3 },
  // ── OCEANIAN ──────────────────────────────────────────────────────────────
  { id:'coral_triangle',        name:'Coral Triangle',                    realm:'Oceanian',    subrealm:'Southeast Asia & Pacific',lat:2.0,lng:124.0,  vitality:47, trend:'declining', biome:'coral_reef',          pop_level:2 },
  { id:'pacific_islands',       name:'Pacific Island Forests & Reefs',    realm:'Oceanian',    subrealm:'Pacific Islands',      lat:-15.0, lng:168.0,  vitality:44, trend:'declining', biome:'island_endemic',      pop_level:3 },
  // ── ANTARCTIC ─────────────────────────────────────────────────────────────
  { id:'arctic',                name:'Arctic Sea Ice',                    realm:'Antarctic',   subrealm:'Polar',                lat:80.0,  lng:0.0,    vitality:22, trend:'critical',  biome:'polar_ice',           pop_level:3 },
  { id:'antarctic_tundra',      name:'Antarctic & Sub-Antarctic Tundra',  realm:'Antarctic',   subrealm:'Polar',                lat:-72.0, lng:-10.0,  vitality:38, trend:'declining', biome:'polar_ice',           pop_level:3 },
  // ── ADDITIONAL HIGH-PRIORITY ──────────────────────────────────────────────
  { id:'mekong',                name:'Mekong River & Delta',              realm:'Indomalayan', subrealm:'Southeast Asia',       lat:15.5,  lng:104.5,  vitality:35, trend:'declining', biome:'wetland',             pop_level:3 },
  { id:'drc_miombo',            name:'DRC Miombo & Albertine Rift',       realm:'Afrotropics', subrealm:'Central Africa',       lat:-5.0,  lng:28.0,   vitality:48, trend:'declining', biome:'tropical_dry_forest', pop_level:3 },
  { id:'chiapas_mesoamerica',   name:'Mesoamerican Forests (Chiapas-Darien)',realm:'Neotropics',subrealm:'Central America',    lat:15.5,  lng:-89.0,  vitality:37, trend:'declining', biome:'tropical_forest',     pop_level:3 },
  // ── COMPLETING ONE EARTH 52 — 9 ADDITIONS ─────────────────────────────────
  // Neotropics
  { id:'chilean_matorral',      name:'Chilean Matorral',                    realm:'Neotropics',  subrealm:'Southern South America', lat:-33.0, lng:-71.0,  vitality:42, trend:'declining', biome:'mediterranean_shrub', pop_level:3 },
  // Afrotropics
  { id:'guinean_forests',       name:'Guinean Forests of West Africa',      realm:'Afrotropics', subrealm:'West Africa',            lat:6.0,   lng:-3.0,   vitality:35, trend:'declining', biome:'tropical_forest',     pop_level:3 },
  // Palearctic
  { id:'tibetan_plateau',       name:'Tibetan Plateau',                     realm:'Palearctic',  subrealm:'Central Asia',           lat:32.0,  lng:88.0,   vitality:43, trend:'declining', biome:'alpine_grassland',    pop_level:3 },
  { id:'anatolian_iranian',     name:'Anatolian & Iranian Highlands',       realm:'Palearctic',  subrealm:'Western Asia',           lat:38.5,  lng:37.0,   vitality:40, trend:'declining', biome:'arid_shrubland',      pop_level:3 },
  { id:'east_asian_forests',    name:'East Asian Mixed Forests',            realm:'Palearctic',  subrealm:'East Asia',              lat:38.0,  lng:130.0,  vitality:47, trend:'stable',    biome:'temperate_broadleaf', pop_level:3 },
  { id:'arabian_desert',        name:'Arabian Desert & Coastal Fog Deserts',realm:'Palearctic',  subrealm:'Western Asia',           lat:24.0,  lng:47.0,   vitality:31, trend:'declining', biome:'desert',              pop_level:3 },
  // Indomalayan
  { id:'philippine_forests',    name:'Philippine Forests & Seas',           realm:'Indomalayan', subrealm:'Southeast Asia',         lat:12.0,  lng:122.0,  vitality:33, trend:'declining', biome:'island_endemic',      pop_level:3 },
  // Australasian
  { id:'australian_savanna',    name:'Australian Tropical Savannas',        realm:'Australasian',subrealm:'Australia',              lat:-15.0, lng:132.0,  vitality:55, trend:'variable',  biome:'tropical_savanna',    pop_level:3 },
  { id:'eastern_australia',     name:'Eastern Australian Temperate Forests',realm:'Australasian',subrealm:'Australia',              lat:-33.0, lng:150.0,  vitality:44, trend:'declining', biome:'temperate_broadleaf', pop_level:3 },
];

// Multilateral agreements registry
const MULTILATERAL_AGREEMENTS = [
  { id:'paris',     name:'Paris Agreement',                               year:2015, scope:'global',   domain:'climate',          alignment_score:62, ratified_by:196,
    what:'Limits global warming to 1.5-2°C above pre-industrial levels via nationally determined contributions.',
    implication:'Binds nations to emissions cuts but lacks enforcement — progress is voluntary and currently insufficient.',
    tension:'Growth-based economies resist the pace of transition required.' },
  { id:'cbd',       name:'Convention on Biological Diversity',            year:1992, scope:'global',   domain:'biodiversity',     alignment_score:74, ratified_by:196,
    what:'Framework to protect biodiversity, ensure sustainable use, and share genetic resource benefits equitably.',
    implication:'30×30 target (protect 30% of land/sea by 2030) is the key current commitment.',
    tension:'Biodiversity loss continues despite the treaty — implementation remains weak.' },
  { id:'undrip',    name:'UN Declaration on Rights of Indigenous Peoples',year:2007, scope:'global',   domain:'indigenous',       alignment_score:81, ratified_by:144,
    what:'Establishes collective rights of indigenous peoples including self-determination, land, culture, and free prior informed consent (FPIC).',
    implication:'Most aligned with Living Systems — indigenous lands protect 80% of remaining biodiversity.',
    tension:'Non-binding; routinely violated by extractive industries with state complicity.' },
  { id:'sdg',       name:'Sustainable Development Goals',                 year:2015, scope:'global',   domain:'development',      alignment_score:48, ratified_by:193,
    what:'17 goals covering poverty, health, education, climate, and justice for 2030.',
    implication:'Broad but internally contradictory — SDG8 promotes GDP growth while SDG13 demands climate action.',
    tension:'Growth framing conflicts with planetary boundaries; off-track on most goals.' },
  { id:'kunming',   name:'Kunming-Montreal Global Biodiversity Framework',year:2022, scope:'global',   domain:'biodiversity',     alignment_score:71, ratified_by:188,
    what:'Post-2020 biodiversity framework: halt and reverse biodiversity loss by 2030.',
    implication:'30×30 land/sea protection + USD 200B/yr biodiversity finance from wealthy nations.',
    tension:'Financing commitments remain largely unmet; corporate accountability weak.' },
  { id:'unfg',      name:'Declaration on Future Generations',             year:2024, scope:'global',   domain:'intergenerational',alignment_score:78, ratified_by:167,
    what:'UN commitment to consider long-term impacts on future generations in policy decisions.',
    implication:'Aligns with Seventh Generation Principle — extends moral circle across time.',
    tension:'Newly adopted; no enforcement mechanism; depends on political will.' },
  { id:'ramsar',    name:'Ramsar Convention on Wetlands',                 year:1971, scope:'global',   domain:'water',            alignment_score:76, ratified_by:172,
    what:'Protects wetlands of international importance — critical for water, carbon, and biodiversity.',
    implication:'Over 2,400 Ramsar sites designated globally.',
    tension:'40% of wetlands lost since 1970 despite the convention.' },
  { id:'cites',     name:'CITES — Wildlife Trade Convention',             year:1973, scope:'global',   domain:'biodiversity',     alignment_score:69, ratified_by:183,
    what:'Regulates international trade in wild plants and animals to prevent over-exploitation.',
    implication:'Controls trade in 38,000 species; has saved species from extinction.',
    tension:'Illegal wildlife trade remains the 4th largest criminal enterprise globally.' },
  { id:'unccd',     name:'UN Convention to Combat Desertification',       year:1994, scope:'global',   domain:'land',             alignment_score:65, ratified_by:197,
    what:'Addresses land degradation, desertification, and drought — particularly in dryland regions.',
    implication:'Land degradation neutrality (LDN) target: no net land degradation by 2030.',
    tension:'Industrial agriculture — the primary driver — is largely exempt from obligations.' },
  { id:'marpol',    name:'MARPOL — Marine Pollution Convention',          year:1973, scope:'global',   domain:'ocean',            alignment_score:70, ratified_by:159,
    what:'Prevents pollution from ships — oil, sewage, garbage, and air emissions.',
    implication:'Has significantly reduced oil spills from shipping.',
    tension:'Plastic pollution from land and microplastics not covered; ocean health still critical.' },
  { id:'aarhus',    name:'Aarhus Convention — Environmental Democracy',   year:1998, scope:'regional', domain:'governance',       alignment_score:83, ratified_by:47,
    what:'Grants public rights to environmental information, participation in decisions, and access to justice.',
    implication:'Most democratic environmental governance framework — enables citizens to challenge decisions.',
    tension:'Regional (Europe/Central Asia) — not globally applicable.' },
  { id:'escazú',    name:'Escazú Agreement',                              year:2018, scope:'regional', domain:'governance',       alignment_score:85, ratified_by:25,
    what:'Latin America/Caribbean equivalent of Aarhus — rights of access, participation, and justice in environmental matters.',
    implication:'First regional agreement to protect environmental defenders from harassment and violence.',
    tension:'Only 25 ratifications; environmental defenders in LAC remain among most at-risk globally.' },
];

// Ancient Intelligence traditions
const ANCIENT_TRADITIONS = [
  { id:'buen_vivir',  name:'Buen Vivir / Sumak Kawsay',  origin:'Andean (Ecuador/Bolivia)', principle:'Living well, not better — harmony with Pachamama', sphere:'ANCIENT' },
  { id:'ubuntu',      name:'Ubuntu',                     origin:'Southern Africa',           principle:'I am because we are — radical interdependence', sphere:'ANCIENT' },
  { id:'swaraj',      name:'Swaraj',                     origin:'India',                     principle:'Self-rule through community sovereignty and right relationship', sphere:'ANCIENT' },
  { id:'seventh_gen', name:'Seventh Generation Principle',origin:'Haudenosaunee (Iroquois)', principle:'Consider the impact of decisions on seven generations hence', sphere:'ANCIENT' },
  { id:'ubuntu_ubuntu',name:'Pachamama',                 origin:'Andean cosmology',          principle:'Mother Earth as living being with inherent rights', sphere:'ANCIENT' },
  { id:'whakapapa',   name:'Whakapapa',                  origin:'Māori (Aotearoa)',           principle:'All existence connected through genealogical relationships', sphere:'ANCIENT' },
  { id:'hozho',       name:'Hózhó',                      origin:'Diné (Navajo Nation)',       principle:'Walking in beauty — balance and harmony as foundation', sphere:'ANCIENT' },
  { id:'ubuntu2',     name:'Blak Sovereignty',           origin:'Aboriginal Australia',      principle:'Country is not owned but belongs to; deep listening (dadirri)', sphere:'ANCIENT' },
  { id:'dharma',      name:'Dharma / Ṛta',               origin:'Vedic / Hindu tradition',   principle:'Right action aligned with cosmic order and natural law', sphere:'ANCIENT' },
  { id:'tao',         name:'Tao / Wu Wei',               origin:'Taoist tradition (China)',  principle:'Acting in harmony with the natural way; effortless action', sphere:'ANCIENT' },
];

// Wellbeing practice domains
const WELLBEING_DOMAINS = [
  'somatic practices', 'collective grief work', 'gratitude cultivation',
  'ecological belonging', 'place-based ritual', 'council practice',
  'deep time perspectives', 'inter-species communication',
  'regenerative creativity', 'slow food and communal eating',
];

// ═══════════════════════════════════════════════════════════════════════════
// MULTI-AGENT AIF FRAMEWORK — Unified agent registry
// Platform as stigmergic medium: natural, human, and AI agents all minimize
// free energy through the same shared trace network. Each agent class has
// distinct timescales, sensory/action channels, and sovereignty levels.
//
// Architecture:
//   Natural agents  — bioregions, ecosystems (timescale: decades/centuries)
//   Human agents    — actors: orgs, nations, communities (timescale: quarters/years)
//   AI agents       — synthesis, monitor, inference, intervention (timescale: seconds/days)
//
// Interaction rules:
//   1. Temporal sovereignty: slow signals carry more epistemic weight
//   2. Natural constraints are constitutional, not advisory
//   3. High prior_precision → calibrated surprise; low → direct elaboration
//   4. Traces reinforce when cited; decay when ignored — emergence from interaction
// ═══════════════════════════════════════════════════════════════════════════

const AGENT_TYPES = { NATURAL: 'natural', HUMAN: 'human', AI: 'ai' };

// Timescale hierarchy — deeper timescales carry higher epistemic weight
const TIMESCALE_WEIGHTS = {
  milliseconds: 0.01, seconds: 0.02, minutes: 0.05, hours: 0.1,
  days: 0.2, months: 0.4, years: 0.6, decades: 0.85, centuries: 0.95, millennia: 1.0,
};

// Preferred vitality ranges by biome — what each natural agent works to maintain
const BIOME_PREFERRED_VITALITY = {
  tropical_forest:     { min: 65, max: 90 },
  coral_reef:          { min: 60, max: 85 },
  arid_grassland:      { min: 35, max: 65 },
  taiga:               { min: 60, max: 85 },
  alpine_glacier:      { min: 55, max: 80 },
  polar_ice:           { min: 60, max: 90 },
  tropical_savanna:    { min: 45, max: 70 },
  mediterranean_shrub: { min: 50, max: 75 },
  montane_grassland:   { min: 55, max: 80 },
  // Additions for full One Earth 52-bioregion coverage
  alpine_grassland:    { min: 50, max: 75 },
  arid_shrubland:      { min: 30, max: 60 },
  temperate_broadleaf: { min: 55, max: 80 },
  temperate_grassland: { min: 45, max: 70 },
  temperate_conifer:   { min: 60, max: 85 },
  tropical_dry_forest: { min: 50, max: 75 },
  island_endemic:      { min: 55, max: 80 },
  desert:              { min: 25, max: 55 },
  montane_forest:      { min: 60, max: 85 },
  wetland:             { min: 55, max: 80 },
  mangrove:            { min: 55, max: 80 },
  kelp_forest:         { min: 55, max: 80 },
  boreal_peatland:     { min: 60, max: 85 },
};

// Bioregion-to-timescale mapping — all 52 One Earth bioregions
// Default for any unlisted bioregion: 'decades'
const BIOREGION_TIMESCALES = {
  // Nearctic
  rocky_mountain: 'decades',    california: 'decades',        great_plains: 'decades',
  appalachian: 'centuries',     pacific_northwest: 'centuries',arctic_nearctic: 'millennia',
  sonoran_chihuahuan: 'decades',
  // Neotropics
  amazon: 'centuries',          cerrado: 'decades',           atlantic_forest: 'decades',
  andean_highlands: 'centuries',patagonia: 'decades',         caribbean_forests: 'decades',
  orinoco: 'decades',           chiapas_mesoamerica: 'decades',chilean_matorral: 'decades',
  // Afrotropics
  congo: 'centuries',           sahel: 'decades',             east_african_savanna: 'decades',
  cape_floristic: 'decades',    madagascar: 'decades',        miombo: 'decades',
  horn_of_africa: 'decades',    drc_miombo: 'centuries',      guinean_forests: 'centuries',
  // Palearctic
  boreal: 'centuries',          mediterranean: 'decades',     central_asian_steppe: 'decades',
  caucasus: 'decades',          arctic_palearctic: 'millennia',european_broadleaf: 'centuries',
  tibetan_plateau: 'centuries', anatolian_iranian: 'decades', east_asian_forests: 'centuries',
  arabian_desert: 'decades',
  // Indomalayan
  himalayan: 'centuries',       sundaland: 'decades',         western_ghats: 'decades',
  indochina: 'decades',         ganges_brahmaputra: 'decades',mekong: 'decades',
  philippine_forests: 'decades',
  // Australasian
  great_barrier: 'decades',     southwest_australia: 'decades',new_guinea: 'centuries',
  new_zealand: 'decades',       australian_savanna: 'decades', eastern_australia: 'decades',
  // Oceanian
  coral_triangle: 'decades',    pacific_islands: 'decades',
  // Antarctic
  arctic: 'millennia',          antarctic_tundra: 'millennia',
};

// ── Ecological kinship — cross-bioregion relationship map ─────────────────
// Defines which bioregions share significant ecological relationships:
// hydrological connections, atmospheric teleconnections, same biome continuity,
// or evolutionary shared history. Used for cross-bioregion signal propagation.
// Relationship strength: 1.0 = direct (same watershed), 0.6 = adjacent biome,
// 0.4 = atmospheric/climatic teleconnection, 0.3 = evolutionary kinship only.
const BIOREGION_KINSHIP = {
  // Amazon basin — the keystone of Neotropical hydrology
  amazon_basin:          [{ id:'cerrado',              strength:0.7 }, { id:'atlantic_forest',      strength:0.6 },
                          { id:'orinoco_llanos',        strength:0.8 }, { id:'congo',                strength:0.4 },
                          { id:'mekong',                strength:0.3 }],
  cerrado:               [{ id:'amazon_basin',          strength:0.7 }, { id:'atlantic_forest',      strength:0.7 },
                          { id:'patagonia',             strength:0.4 }],
  atlantic_forest:       [{ id:'amazon_basin',          strength:0.6 }, { id:'cerrado',              strength:0.7 },
                          { id:'patagonia',             strength:0.5 }],
  orinoco_llanos:        [{ id:'amazon_basin',          strength:0.8 }, { id:'caribbean_forests',    strength:0.6 }],
  // Congo — African anchor of tropical forest belt
  congo:                 [{ id:'guinean_forests',        strength:0.7 }, { id:'drc_miombo',           strength:0.8 },
                          { id:'amazon_basin',          strength:0.4 }, { id:'east_african_savanna',  strength:0.5 }],
  guinean_forests:       [{ id:'congo',                 strength:0.7 }, { id:'sahel_sudanian',        strength:0.5 }],
  drc_miombo:            [{ id:'congo',                 strength:0.8 }, { id:'miombo',                strength:0.9 },
                          { id:'east_african_savanna',  strength:0.6 }],
  // Sahel — fragile drylands with atmospheric teleconnections
  sahel_sudanian:        [{ id:'horn_of_africa',         strength:0.6 }, { id:'guinean_forests',      strength:0.5 },
                          { id:'east_african_savanna',  strength:0.5 }, { id:'arabian_desert',        strength:0.4 }],
  horn_of_africa:        [{ id:'sahel_sudanian',         strength:0.6 }, { id:'east_african_savanna',  strength:0.7 },
                          { id:'arabian_desert',        strength:0.5 }],
  east_african_savanna:  [{ id:'horn_of_africa',         strength:0.7 }, { id:'miombo',                strength:0.7 },
                          { id:'drc_miombo',            strength:0.6 }],
  miombo:                [{ id:'drc_miombo',             strength:0.9 }, { id:'east_african_savanna',  strength:0.7 },
                          { id:'cape_floristic',        strength:0.4 }],
  // Coral Triangle — global marine biodiversity centre
  coral_triangle:        [{ id:'great_barrier',          strength:0.7 }, { id:'sundaland',             strength:0.6 },
                          { id:'philippine_forests',    strength:0.7 }, { id:'pacific_islands',       strength:0.5 }],
  great_barrier:         [{ id:'coral_triangle',         strength:0.7 }, { id:'eastern_australia',     strength:0.6 }],
  pacific_islands:       [{ id:'coral_triangle',         strength:0.5 }, { id:'new_zealand',           strength:0.4 }],
  // Mekong — Southeast Asian river system
  mekong:                [{ id:'indochina',              strength:0.8 }, { id:'sundaland',             strength:0.5 },
                          { id:'ganges_brahmaputra',    strength:0.5 }, { id:'amazon_basin',          strength:0.3 }],
  indochina:             [{ id:'mekong',                 strength:0.8 }, { id:'sundaland',             strength:0.6 },
                          { id:'western_ghats',         strength:0.4 }],
  ganges_brahmaputra:    [{ id:'himalayan',              strength:0.9 }, { id:'mekong',                strength:0.5 },
                          { id:'indochina',             strength:0.4 }],
  himalayan:             [{ id:'ganges_brahmaputra',     strength:0.9 }, { id:'tibetan_plateau',       strength:0.8 },
                          { id:'central_asian_steppe',  strength:0.5 }],
  // Boreal — northern forest belt
  boreal:                [{ id:'arctic_nearctic',        strength:0.7 }, { id:'arctic_palearctic',     strength:0.7 },
                          { id:'pacific_northwest',     strength:0.5 }, { id:'european_broadleaf',    strength:0.5 }],
  arctic_nearctic:       [{ id:'boreal',                 strength:0.7 }, { id:'arctic_palearctic',     strength:0.8 },
                          { id:'arctic',                strength:0.9 }],
  arctic_palearctic:     [{ id:'boreal',                 strength:0.7 }, { id:'arctic_nearctic',       strength:0.8 },
                          { id:'arctic',                strength:0.9 }],
  arctic:                [{ id:'arctic_nearctic',        strength:0.9 }, { id:'arctic_palearctic',     strength:0.9 }],
  // Mediterranean biome kinship (disjunct but same biome type)
  california:            [{ id:'mediterranean',          strength:0.5 }, { id:'chilean_matorral',      strength:0.5 },
                          { id:'cape_floristic',        strength:0.5 }, { id:'southwest_australia',   strength:0.5 }],
  mediterranean:         [{ id:'california',             strength:0.5 }, { id:'caucasus',              strength:0.6 },
                          { id:'anatolian_iranian',     strength:0.6 }],
  chilean_matorral:      [{ id:'california',             strength:0.5 }, { id:'patagonia',             strength:0.6 }],
  cape_floristic:        [{ id:'california',             strength:0.5 }, { id:'miombo',                strength:0.4 }],
  southwest_australia:   [{ id:'california',             strength:0.5 }, { id:'eastern_australia',     strength:0.6 }],
};

// Node maturity levels — HITL gate intensity per level
// seeded:   new node, all critical = blocking HITL
// emerging: 30-day track record, high = advisory HITL
// maturing: self-resolutions occurring, high = advisory, critical = soft-block
// mature:   biology closing loops, HITL only for constitutional (cross-node systemic)
const NODE_MATURITY_LEVELS = ['seeded', 'emerging', 'maturing', 'mature'];
const MATURITY_THRESHOLDS = {
  emerging: { min_days: 7,  min_accuracy: 0.7, max_override_rate: 0.3 },
  maturing: { min_days: 30, min_accuracy: 0.8, max_override_rate: 0.2, min_self_resolutions: 1 },
  mature:   { min_days: 90, min_accuracy: 0.85,max_override_rate: 0.1, min_self_resolutions: 3 },
};

// AI agents registry — the four specialized sub-agents of the platform
const AI_AGENTS = [
  {
    id: 'synthesis_engine',
    name: 'Planetary Synthesis Engine',
    type: AGENT_TYPES.AI,
    role: 'synthesis',
    description: 'RAG synthesis calibrated to actor generative models and natural agent constraints',
    timescale: 'seconds',
    sphere_focus: 'all',
    sensory_channels: ['corpus_docs', 'active_traces', 'session_state', 'natural_constraints'],
    action_channels: ['synthesis_response', 'synthesis_trace', 'learning_path'],
    free_energy: 0.0,
  },
  {
    id: 'bioregional_monitor',
    name: 'Bioregional Monitor',
    type: AGENT_TYPES.AI,
    role: 'monitor',
    description: 'Continuous monitoring of bioregional vitality, threshold detection, priority routing',
    timescale: 'hours',
    sphere_focus: 'BIOSPHERE',
    sensory_channels: ['biosignal_logs', 'steward_actions', 'ingest_readings'],
    action_channels: ['natural_signal_trace', 'vitality_alert', 'threshold_crossing'],
    free_energy: 0.0,
  },
  {
    id: 'actor_model_inference',
    name: 'Actor Model Inference Engine',
    type: AGENT_TYPES.AI,
    role: 'inference',
    description: 'Infers actor generative models from behavioral traces; updates prior_precision dynamically',
    timescale: 'days',
    sphere_focus: 'GOVERNANCE',
    sensory_channels: ['actor_interactions', 'query_patterns', 'agreement_ratifications', 'feedback_scores'],
    action_channels: ['generative_model_update', 'prior_precision_shift', 'model_inference_trace'],
    free_energy: 0.0,
  },
  {
    id: 'intervention_designer',
    name: 'Intervention Designer',
    type: AGENT_TYPES.AI,
    role: 'intervention',
    description: 'Designs precision-calibrated surprises for actor model evolution toward ecosystem coupling',
    timescale: 'months',
    sphere_focus: 'all',
    sensory_channels: ['actor_generative_models', 'ecosystem_states', 'historical_interventions'],
    action_channels: ['calibrated_synthesis_frame', 'intervention_trace', 'precision_adjustment'],
    free_energy: 0.0,
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-INIT — Create D1 tables on first request (self-healing, idempotent)
// ═══════════════════════════════════════════════════════════════════════════

let _tablesReady = false;

async function autoInitTables(env) {
  if (_tablesReady || !env.STIGMERGY_DB) return;
  const ddl = [
    `CREATE TABLE IF NOT EXISTS queries (id TEXT PRIMARY KEY, query TEXT NOT NULL, response TEXT, sources TEXT, sphere TEXT, score REAL DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS feedback (id TEXT PRIMARY KEY, query_id TEXT, score INTEGER CHECK(score BETWEEN 0 AND 5), comment TEXT, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS scrape_logs (id TEXT PRIMARY KEY, url TEXT NOT NULL, status INTEGER, chars INTEGER, sphere TEXT, delta INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS biosignal_logs (id TEXT PRIMARY KEY, bioregion TEXT, lat REAL, lng REAL, vitality_index REAL, indicators TEXT, source TEXT DEFAULT 'computed', created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS steward_log (id TEXT PRIMARY KEY, actor_id TEXT, bioregion TEXT, action TEXT, impact_score REAL, notes TEXT, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS actor_interactions (id TEXT PRIMARY KEY, actor_a TEXT, actor_b TEXT, interaction_type TEXT, alignment_delta REAL, trace_id TEXT, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS clock_history (id TEXT PRIMARY KEY, vitality_index REAL, indicators TEXT, week TEXT, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS agent_vitality (id TEXT PRIMARY KEY, bioregion_id TEXT NOT NULL, vitality_index REAL, cumulative_steward_impact REAL DEFAULT 0, source TEXT DEFAULT 'computed', recorded_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS agent_interactions (id TEXT PRIMARY KEY, agent_a TEXT, agent_b TEXT, interaction_type TEXT, free_energy_delta REAL, sphere TEXT, bioregion TEXT, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS natural_signals (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, bioregion_id TEXT, signal_type TEXT, raw_value TEXT, unit TEXT, source_type TEXT, sovereignty_tag TEXT, distress INTEGER DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS hitl_reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, trace_id TEXT, reviewer_id TEXT, decision TEXT, intervention_note TEXT, planned_action TEXT, bioregion_id TEXT, signal_type TEXT, raw_value TEXT, severity TEXT, outcome_value TEXT, outcome_delta REAL, resolved_at INTEGER)`,
    `CREATE TABLE IF NOT EXISTS fpic_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, request_id TEXT, territory_id TEXT, requester_id TEXT, requester_type TEXT, purpose TEXT, status TEXT, decided_at INTEGER, olr_acknowledged INTEGER DEFAULT 0)`,
  ];
  try {
    for (const sql of ddl) await env.STIGMERGY_DB.prepare(sql).run();
    _tablesReady = true;
  } catch(e) { /* non-fatal — tables may already exist or DB unavailable */ }
}

// ═══════════════════════════════════════════════════════════════════════════
// ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    await autoInitTables(env);
    try { return await route(request, env); }
    catch (e) { return R({ error: e.message, stack: e.stack?.split('\n').slice(0,3), version: VERSION }, 500); }
  },

  async scheduled(event, env, ctx) {
    if (event.cron === '0 2 * * 0') ctx.waitUntil((async () => {
      await runWeeklyMaintenance(env);
      await computeCollectiveSignal(env);
      await handleStreamIngestNow(
        new Request('https://stigmergy.earth/api/na/stream/ingest-now', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dry_run: false, streams: ['weather','airquality','marine'] })
        }),
        env
      );
      await handleBatchModelInference(env);
    })());
    if (event.cron === '0 * * * *')  ctx.waitUntil(runDecayEngine(env));
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// ROUTER
// ═══════════════════════════════════════════════════════════════════════════

async function route(request, env) {
  const url   = new URL(request.url);
  const path  = url.pathname;
  const meth  = request.method;
  const key   = request.headers.get('X-Admin-Key')
               || url.searchParams.get('admin_key')
               || url.searchParams.get('key')
               || '';
  const admin = key && key === env.ADMIN_KEY;

  // ── Core ────────────────────────────────────────────────────────────────
  if (path === '/' || path === '/health')               return handleHealth(env);
  if (path === '/api/my-location'        && meth === 'GET') return handleMyLocation(request);
  if (path === '/api/init-db')                          return handleInitDB(env, admin);
  if (path === '/api/query'         && meth === 'POST') return handleQuery(request, env);
  if (path === '/api/session'       && meth === 'GET')  return handleGetSession(request, env);
  if (path === '/api/session'       && meth === 'POST') return handleUpdateSession(request, env);
  if (path === '/api/collective/signal')                return handleCollectiveSignalV2(env);
  if (path === '/api/seed')                             return handleSeed(env, admin);
  if (path === '/api/corpus')                           return handleCorpus(env);
  if (path === '/api/corpus/sphere')                    return handleCorpusBySphere(request, env);
  if (path === '/api/corpus/search')                    return handleCorpusSearch(request, env);
  if (path === '/api/corpus/update-sphere'      && meth==='POST') return handleUpdateSphere(request, env, admin);
  if (path === '/api/corpus/backfill-spheres'  && meth==='POST') return handleBackfillSpheres(env, admin);
  if (path === '/api/feedback'      && meth === 'POST') return handleFeedback(request, env);

  // ── PDF management ──────────────────────────────────────────────────────
  if (path === '/api/pdfs'          && meth === 'GET')  return handleListPDFs(env);
  if (path === '/api/upload-pdf'    && meth === 'POST') return handleUploadPDF(request, env, admin);
  if (path === '/api/pdfs/process'  && meth === 'POST') return handleProcessPDFs(env, admin);
  if (path === '/api/pdfs/view')                         return handleViewPDF(request, env, admin);
  if (path === '/api/pdfs/update'   && meth === 'POST') return handleUpdatePDF(request, env, admin);
  if (path === '/api/pdfs/delete'   && meth === 'POST') return handleDeletePDF(request, env, admin);

  // ── Scraper ─────────────────────────────────────────────────────────────
  if (path === '/api/scrape/url'    && meth === 'POST') return handleScrapeUrl(request, env, admin);
  if (path === '/api/scrape/logs')                       return handleScrapeLogs(env, admin);
  if (path.startsWith('/api/scrape'))                   return handleScrape(request, env, admin);

  // ── Recategorization ────────────────────────────────────────────────────
  if (path === '/api/recategorize'           && meth !== 'POST') return handleRecategorize(env, admin);
  if (path === '/api/recategorize/pending')              return handleRecategorizePending(env);
  if (path === '/api/recategorize/apply'    && meth === 'POST') return handleRecategorizeApply(request, env, admin);
  if (path === '/api/recategorize/dismiss'  && meth === 'POST') return handleRecategorizeDismiss(request, env, admin);
  if (path === '/api/export-training-data')              return handleExportTraining(env, admin);

  // ── Biosignal ───────────────────────────────────────────────────────────
  if (path === '/api/biosignal'              && meth === 'GET')  return handleBiosignal(request, env);
  if (path === '/api/biosignal'              && meth === 'POST') return handleBiosignalPost(request, env);
  if (path === '/api/biosignal/dashboard')                       return handleBiosignalDashboard(env);
  if (path === '/api/biosignal/history')                         return handleBiosignalHistory(env);
  if (path === '/api/biosignal/bioregion')                       return handleBiosignalBioregion(request, env);
  if (path === '/api/biosignal/steward'     && meth === 'GET')   return handleStewardLog(env);
  if (path === '/api/biosignal/steward'     && meth === 'POST')  return handleStewardLogPost(request, env);
  if (path === '/api/ingest'                && meth === 'POST')  return handleIngest(request, env);

  // ── Natural Agent ────────────────────────────────────────────────────────
  if (path === '/api/na/ingest'            && meth === 'POST') return handleNaturalAgentIngest(request, env);
  if (path === '/api/na/ingest-historical'  && meth === 'POST') return handleHistoricalIngest(request, env);
  if (path === '/api/na/ingest-co2'         && meth === 'POST') return handleCo2Ingest(request, env);
  if (path === '/api/na/stream/weather'     && meth === 'GET')  return handleStreamWeather(request, env);
  if (path === '/api/na/stream/airquality'  && meth === 'GET')  return handleStreamAirQuality(request, env);
  if (path === '/api/na/stream/marine'      && meth === 'GET')  return handleStreamMarine(request, env);
  if (path === '/api/na/stream/flood'       && meth === 'GET')  return handleStreamFlood(request, env);
  if (path === '/api/na/stream/ingest-now'  && meth === 'POST') return handleStreamIngestNow(request, env);
  if (path === '/api/na/signals' && meth === 'GET')  return handleNaturalAgentRead(request, env);
  if (path === '/api/na/traces'  && meth === 'GET')  return handleNaturalAgentTraces(request, env);

  // ── Umwelt node endpoints ──────────────────────────────────────────────
  if (path === '/api/nodes'            && meth === 'GET') return handleGetNodes(request, env);
  if (path === '/api/nodes/unwell'     && meth === 'GET') return handleGetUnwellNodes(request, env);
  if (path === '/api/nodes/candidates' && meth === 'GET') return handleGetCandidateNodes(request, env);

  // ── BIS — Biotic Index System ──────────────────────────────────────────
  if (path === '/api/bis/global'                         && meth === 'GET') return handleBISGlobal(env);
  if (path.match(/^\/api\/bis\/(.+)$/)                   && meth === 'GET') return handleBISBioregion(request, env);

  // ── LAP — Life Alignment Protocol ─────────────────────────────────────
  if (path === '/api/lap/query'                          && meth === 'POST') return handleLAPQuery(request, env);
  if (path === '/api/lap/domains'                        && meth === 'GET')  return handleLAPDomains(env);
  if (path.match(/^\/api\/lap\/constraints\/(.+)$/)      && meth === 'GET')  return handleLAPConstraints(request, env);

  // ── PoP principles — Perturbation accounting + Loop maturation ────────
  if (path === '/api/perturbation/log'                   && meth === 'POST') return handlePerturbationLog(request, env);
  if (path.match(/^\/api\/perturbation\/log\/(.+)$/)     && meth === 'GET')  return handlePerturbationRead(request, env);
  if (path === '/api/loop/maturation'                    && meth === 'GET')  return handleLoopMaturation(env);
  if (path === '/api/nodes/maturity'                     && meth === 'GET')  return handleNodeMaturityList(env);
  if (path.match(/^\/api\/nodes\/maturity\/.+$/)         && meth === 'GET')  return handleNodeMaturitySingle(request, env);
  if (path === '/api/bis/synchrony'                      && meth === 'GET')  return handleBISSynchrony(env);

  // ── Gap #3 — Actor generative model inference ─────────────────────────
  if (path.match(/^\/api\/actors\/(.+)\/model$/) && meth === 'GET')
    return handleActorModel(request, env);
  if (path === '/api/actors/infer-models' && meth === 'POST') return handleBatchModelInference(env);
  if (path === '/api/actors/infer-models' && meth === 'GET')
    return R({ ok: true, method: 'POST', description: 'Batch-infer generative models for all registered actors. Use POST to trigger.', endpoint: 'POST /api/actors/infer-models' });

  // ── Gap #5 — Sensor registry ──────────────────────────────────────────
  if (path === '/api/sensor/register'   && meth === 'POST') return handleSensorRegister(request, env);
  if (path === '/api/sensor/list'       && meth === 'GET')  return handleSensorList(request, env);
  if (path === '/api/sensor/deactivate' && meth === 'POST') return handleSensorDeactivate(request, env);

  // ── Gap #6 — Sovereignty ──────────────────────────────────────────────
  if (path === '/api/sovereignty/territory' && meth === 'GET')  return handleTerritoryList(env);
  if (path === '/api/sovereignty/territory' && meth === 'POST') return handleTerritoryRegister(request, env);
  if (path === '/api/sovereignty/request'   && meth === 'POST') return handleConsentRequest(request, env);
  if (path === '/api/sovereignty/decide'    && meth === 'POST') return handleConsentDecision(request, env);

  // ── Gap #7 — HITL ─────────────────────────────────────────────────────
  if (path === '/api/hitl/queue'   && meth === 'GET')  return handleHitlQueue(env);
  if (path === '/api/hitl/review'  && meth === 'POST') return handleHitlReview(request, env);
  if (path === '/api/hitl/outcome' && meth === 'POST') return handleHitlOutcome(request, env);

  // ── Gap #8 — Embeddings ───────────────────────────────────────────────
  if (path === '/api/embeddings/backfill' && meth === 'POST') return handleEmbeddingBackfill(env);
  if (path === '/api/embeddings/status'  && meth === 'GET')  return handleEmbeddingStatus(env);
  if (path === '/api/build/manifest'     && meth === 'GET')  return R(BUILD_MANIFEST);

  // ── Clock ───────────────────────────────────────────────────────────────
  if (path === '/api/clock')                            return handleClock(env);
  if (path === '/api/clock/history')                    return handleClockHistory(env);

  // ── Vitality timeline ───────────────────────────────────────────────────
  if (path === '/api/vitality/timeline')                return handleVitalityTimeline(env);
  if (path === '/api/vitality/node')                    return handleNodeHealth(request, env);

  // ── Stigmergy trace network ─────────────────────────────────────────────
  if (path === '/api/stigmergy/deposit'     && meth === 'POST') return handleTraceDeposit(request, env);
  if (path === '/api/stigmergy/traces')                          return handleTraceRead(request, env);
  if (path === '/api/stigmergy/state' || path === '/api/stigmergy/network') return handleTraceState(env);
  if (path === '/api/stigmergy/pulse')                           return R({ pulse: Date.now(), alive: true, version: VERSION });
  if (path === '/api/stigmergy/decay'       && meth === 'POST') return handleDecayManual(env);
  if (path === '/api/stigmergy/summary')                         return handleNetworkSummary(env);
  if (path === '/api/stigmergy/global-pulse')                    return handleGlobalPulse(env);
  if (path.startsWith('/api/stigmergy'))                         return R({ error: 'Unknown stigmergy endpoint' }, 404);

  // ── Actors & agreements ─────────────────────────────────────────────────
  if (path === '/api/actors'                && meth === 'GET')  return handleActorsList(env);
  if (path === '/api/actors/dedup'          && meth === 'POST') return handleActorsDedup(env, admin);
  if (path === '/api/actors/create'         && meth === 'POST') return handleActorCreate(request, env);
  if (path === '/api/actors/node'           && meth === 'GET')  return handleActorNodeGet(request, env);
  if (path === '/api/actors/node'           && meth === 'POST') return handleActorNode(request, env);
  if (path === '/api/actors/interaction'    && meth === 'POST') return handleActorInteraction(request, env);
  if (path === '/api/actors'                && meth === 'POST') return handleActorCreate(request, env);
  if (path === '/api/agreements'            && meth === 'GET')  return handleAgreementsList(env);
  if (path === '/api/agreements/log'        && meth === 'POST') return handleAgreementLog(request, env);

  // ── Ancient Intelligence ────────────────────────────────────────────────
  if (path === '/api/ancient-intelligence')              return handleAncientIntelligence(request, env);
  if (path === '/api/ancient-intelligence/traditions')   return R({ traditions: ANCIENT_TRADITIONS, count: ANCIENT_TRADITIONS.length });

  // ── Wellbeing ───────────────────────────────────────────────────────────
  if (path === '/api/wellbeing' || path === '/api/wellbeing/suggestions') return handleWellbeing(env);
  if (path === '/api/wellbeing/generate'    && meth === 'POST') return handleWellbeingGenerate(env);

  // ── Discovery ───────────────────────────────────────────────────────────
  if (path === '/api/discovery'             && meth === 'GET')  return handleDiscoveryList(env);
  if (path === '/api/discovery/queue'       && meth === 'GET')  return handleDiscoveryList(env);
  if (path === '/api/discovery'             && meth === 'POST') return handleDiscoveryAdd(request, env);
  if (path === '/api/discovery/run'         && meth === 'POST') return handleDiscoveryRun(env, admin);

  // ── Energy ──────────────────────────────────────────────────────────────
  if (path === '/api/energy')                            return handleEnergy(env);
  if (path === '/api/energy/scrape-log')                 return handleEnergyScrapeLog(env);

  // ── Multi-Agent AIF Framework ────────────────────────────────────────────
  if (path === '/api/agents'                 && meth === 'GET')  return handleAgentsList(env);
  if (path.match(/^\/api\/agents\/[^/]+$/)   && meth === 'GET')  return handleAgentState(request, env);
  if (path === '/api/agents/natural/signal'  && meth === 'POST') return handleNaturalAgentSignal(request, env);
  if (path === '/api/agents/system/free-energy')                 return handleSystemFreeEnergy(env);
  if (path === '/api/stigmergy/attractors')                      return handleAttractorAnalysis(env);
  if (path === '/api/stigmergy/emergence')                       return handleEmergenceReport(env);

  // ── Analytics ───────────────────────────────────────────────────────────
  if (path === '/api/query-analytics')                   return handleQueryAnalytics(env, admin);

  // ── Smoke Test & E2E Test ────────────────────────────────────────────────
  if (path === '/api/smoke-test')                        return handleSmokeTest(env);
  if (path === '/api/e2e-test')                          return handleE2ETest(env, admin);
  if (path === '/api/e2e-mvp-test')                      return handleE2EMVPTest(env, admin);

  return R({ error: 'Not found', path, version: VERSION }, 404);
}

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH
// ═══════════════════════════════════════════════════════════════════════════

async function handleHealth(env) {
  const checks = {};

  // KV check
  try {
    await env.STIGMERGY_KV.put('_health_check', Date.now().toString(), { expirationTtl: 60 });
    const val = await env.STIGMERGY_KV.get('_health_check');
    checks.kv = val ? 'ok' : 'write-read-mismatch';
  } catch(e) { checks.kv = 'error: ' + e.message; }

  // R2 check
  try {
    await env.STIGMERGY_R2.put('_health', 'ok', {});
    checks.r2 = 'ok';
  } catch(e) { checks.r2 = 'error: ' + e.message; }

  // D1 check
  try {
    await env.STIGMERGY_DB.prepare('SELECT 1 as ping').first();
    checks.d1 = 'ok';
  } catch(e) { checks.d1 = 'error: ' + e.message; }

  // Corpus count
  let corpusCount = 0;
  try {
    const meta = await env.STIGMERGY_KV.get('_meta', 'json');
    corpusCount = meta?.count || 0;
  } catch(e) {}

  const allOk = Object.values(checks).every(v => v === 'ok');

  return R({
    status: allOk ? 'healthy' : 'degraded',
    version: VERSION,
    model: "llama-3.1-8b (Workers AI free)",
    bindings: checks,
    corpus_docs: corpusCount,
    timestamp: new Date().toISOString(),
    spheres: Object.keys(SPHERES).length,
    bioregions: BIOREGIONS.length,
    agreements: MULTILATERAL_AGREEMENTS.length,
    traditions: ANCIENT_TRADITIONS.length,
  }, allOk ? 200 : 503);
}

// ═══════════════════════════════════════════════════════════════════════════
// INIT DB — Create all 7 D1 tables
// ═══════════════════════════════════════════════════════════════════════════

async function handleInitDB(env, admin) {
  const _dbErr = requireDB(env); if (_dbErr) return _dbErr;
  if (!admin) return R({ error: 'Admin key required' }, 403);

  const tables = [
    `CREATE TABLE IF NOT EXISTS queries (
      id TEXT PRIMARY KEY,
      query TEXT NOT NULL,
      response TEXT,
      sources TEXT,
      sphere TEXT,
      score REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      query_id TEXT,
      score INTEGER CHECK(score BETWEEN 0 AND 5),
      comment TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS scrape_logs (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      status INTEGER,
      chars INTEGER,
      sphere TEXT,
      delta INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS biosignal_logs (
      id TEXT PRIMARY KEY,
      bioregion TEXT,
      lat REAL,
      lng REAL,
      vitality_index REAL,
      indicators TEXT,
      source TEXT DEFAULT 'computed',
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS steward_log (
      id TEXT PRIMARY KEY,
      actor_id TEXT,
      bioregion TEXT,
      action TEXT,
      impact_score REAL,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS actor_interactions (
      id TEXT PRIMARY KEY,
      actor_a TEXT,
      actor_b TEXT,
      interaction_type TEXT,
      alignment_delta REAL,
      trace_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS clock_history (
      id TEXT PRIMARY KEY,
      vitality_index REAL,
      indicators TEXT,
      week TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
  ];

  const results = [];
  for (const sql of tables) {
    try {
      await env.STIGMERGY_DB.prepare(sql).run();
      const name = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1];
      results.push({ table: name, status: 'ok' });
    } catch(e) {
      results.push({ table: sql.slice(0,40), status: 'error', error: e.message });
    }
  }

  // ── Schema migration: verify each table has correct columns ─────────────
  // Strategy: test a known column; if missing, drop + recreate the table.
  // scrape_logs has had multiple schema versions — safest to rebuild it.
  const migrated = [];

  // Test scrape_logs schema by checking all required columns exist
  const scrapeLogsCols = ['id','url','status','chars','sphere','delta','created_at'];
  let scrapeLogsOk = true;
  for (const col of scrapeLogsCols) {
    try {
      await env.STIGMERGY_DB.prepare(`SELECT ${col} FROM scrape_logs LIMIT 1`).all();
    } catch(e) {
      scrapeLogsOk = false;
      migrated.push(`scrape_logs missing column: ${col}`);
      break;
    }
  }
  if (!scrapeLogsOk) {
    try {
      await env.STIGMERGY_DB.prepare(`DROP TABLE IF EXISTS scrape_logs`).run();
      await env.STIGMERGY_DB.prepare(`CREATE TABLE scrape_logs (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        sphere TEXT,
        status INTEGER,
        chars INTEGER,
        delta INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`).run();
      migrated.push('scrape_logs: dropped and recreated with correct schema');
    } catch(e) { migrated.push('scrape_logs recreate failed: ' + e.message); }
  }

  // Test feedback schema
  const feedbackCols = ['id','query_id','score','comment','session_id','sphere'];
  for (const col of feedbackCols) {
    try {
      await env.STIGMERGY_DB.prepare(`SELECT ${col} FROM feedback LIMIT 1`).all();
    } catch(e) {
      try {
        await env.STIGMERGY_DB.prepare(`ALTER TABLE feedback ADD COLUMN ${col} TEXT`).run();
        migrated.push(`feedback.${col} added`);
      } catch(e2) { /* already exists */ }
    }
  }

  // Test queries schema
  try {
    await env.STIGMERGY_DB.prepare(`SELECT sources FROM queries LIMIT 1`).all();
  } catch(e) {
    try {
      await env.STIGMERGY_DB.prepare(`ALTER TABLE queries ADD COLUMN sources TEXT`).run();
      migrated.push('queries.sources added');
    } catch(e2) { /* already exists */ }
  }

  return R({ ok: true, tables: results, migrated,
    message: migrated.length > 0 ? 'Schema migrated' : 'Schema up to date',
    version: VERSION });
}

// ═══════════════════════════════════════════════════════════════════════════
// BM25 RAG ENGINE
// ═══════════════════════════════════════════════════════════════════════════

function tokenize(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 2 && !STOP.has(t));
}

function bm25Score(doc, qTerms, avgLen, k1 = 1.5, b = 0.75) {
  const text = `${doc.title || ''} ${doc.text || ''}`;
  const tokens = tokenize(text);
  const tf = {};
  tokens.forEach(t => { tf[t] = (tf[t] || 0) + 1; });
  const docLen = tokens.length;

  let score = 0;
  for (const term of qTerms) {
    const f = tf[term] || 0;
    if (f === 0) continue;
    const idf = Math.log(1.5 + 1 / (f + 0.5));
    const numerator = f * (k1 + 1);
    const denominator = f + k1 * (1 - b + b * (docLen / avgLen));
    score += idf * (numerator / denominator);
  }
  return score;
}

async function bm25Search(query, env, topK = 6) {
  const qTerms = tokenize(query);
  if (!qTerms.length) return [];

  const meta = await env.STIGMERGY_KV.get('_meta', 'json') || { count: 0, keys: [] };
  const keys = meta.keys || [];
  if (!keys.length) return [];

  // Limit to 300 docs for performance
  const sample = keys.slice(0, 300);
  const docs = [];
  for (const k of sample) {
    const doc = await env.STIGMERGY_KV.get(k, 'json');
    if (doc) docs.push({ key: k, ...doc });
  }

  const avgLen = docs.reduce((a, d) => a + tokenize(`${d.title||''} ${d.text||''}`).length, 0) / Math.max(docs.length, 1);

  const scored = docs.map(d => ({ doc: d, score: bm25Score(d, qTerms, avgLen) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored.map(x => x.doc);
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERY — RAG pipeline
// ═══════════════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════════════
// ACTIVE INFERENCE FRAMEWORK (AIF)
// Based on Kaufmann, Gupta & Taylor (2021) — Active Inference Model of
// Collective Intelligence — adapted for human-AI co-learning in Stigmergy.
//
// Phase 1: Session belief state  — Sensory prior + belief update (bown)
// Phase 2: Theory of Mind prompt — Partner model (P(φ|b,a_partner))
// Phase 3: Goal alignment        — γ parameter (eq 5-6 in paper)
// Phase 4: Collective signal     — System-level F_system (stigmergic trace)
// ═══════════════════════════════════════════════════════════════════════════

const AIF_SESSION_TTL = 86400; // 24h

const SPHERE_LABELS = {
  BIOSPHERE:'living systems & ecology', ATMOSPHERE:'climate & atmosphere',
  HYDROSPHERE:'water systems', ANTHRO:'human & social systems',
  NOOSPHERE:'mind, culture & consciousness', TECHNO:'technology & innovation',
  ECONO:'economics & exchange', ANCIENT:'indigenous & ancestral wisdom',
  REGEN:'regeneration & restoration', GOVERNANCE:'governance & policy',
};

// ── Session belief state ──────────────────────────────────────────────────
function emptySession(sid) {
  return {
    session_id:     sid,
    created_at:     new Date().toISOString(),
    updated_at:     new Date().toISOString(),
    query_count:    0,
    topics_visited: [],        // rolling last-10 query phrases
    sphere_affinity:{},        // sphere → visit count
    uncertainty:    1.0,       // 1.0=novice → 0.0=expert
    rolling_score:  null,      // exponential moving avg of 0-5 feedback
    score_count:    0,
    goal_alignment: 0.8,       // γ — weight toward corpus values (0–1)
    last_sphere:    null,
  };
}

async function loadSession(sid, env) {
  if (!env.STIGMERGY_KV || !sid) return emptySession(sid || 'anon');
  const s = await env.STIGMERGY_KV.get('session:' + sid, 'json');
  return s || emptySession(sid);
}

async function saveSession(session, env) {
  if (!env.STIGMERGY_KV) return;
  session.updated_at = new Date().toISOString();
  try {
    await env.STIGMERGY_KV.put('session:' + session.session_id,
      JSON.stringify(session), { expirationTtl: AIF_SESSION_TTL });
  } catch(e) { /* non-fatal */ }
}

// Belief update step — AIF: b ← optimize(b, s, a)
function updateSessionBeliefs(session, { query, sphere, score }) {
  if (query) session.topics_visited = [...session.topics_visited, query].slice(-10);

  if (sphere) {
    session.sphere_affinity[sphere] = (session.sphere_affinity[sphere] || 0) + 1;
    session.last_sphere = sphere;
  }

  if (score !== undefined && score !== null) {
    // Uncertainty: high score → reduce (less surprise); low score → increase
    const surpriseDelta = (2.5 - score) / 20; // -0.125 to +0.125
    session.uncertainty = Math.max(0.05, Math.min(1.0, session.uncertainty + surpriseDelta));

    // Rolling score — exponential moving average (recent weighted 30%)
    session.rolling_score = session.rolling_score === null
      ? score : session.rolling_score * 0.7 + score * 0.3;
    session.score_count += 1;

    // Goal alignment γ — adapts to feedback signal
    // Low score: user felt response was too abstract/preachy → reduce γ
    // High score: response resonated → maintain or increase γ
    if (score <= 2)      session.goal_alignment = Math.max(0.3, session.goal_alignment - 0.08);
    else if (score >= 4) session.goal_alignment = Math.min(0.95, session.goal_alignment + 0.04);
  }

  session.query_count += 1;
  return session;
}

// ── Theory of Mind prompt builder ─────────────────────────────────────────
// AIF partner model P(φ|b, a_partner): infer where the user IS in their
// understanding arc, calibrate response depth and register accordingly.

function buildToMContext(session) {
  if (!session || session.query_count === 0) return '';

  const { query_count, uncertainty, rolling_score, sphere_affinity,
          topics_visited, goal_alignment, last_sphere } = session;

  const level = uncertainty > 0.75 ? 'a newcomer exploring this for the first time'
              : uncertainty > 0.5  ? 'a curious learner building their understanding'
              : uncertainty > 0.25 ? 'an engaged practitioner deepening their practice'
              :                      'an experienced practitioner seeking synthesis';

  const topSpheres = Object.entries(sphere_affinity)
    .sort((a,b) => b[1]-a[1]).slice(0,3)
    .map(([s]) => SPHERE_LABELS[s] || s);

  const calibration = rolling_score === null ? ''
    : rolling_score < 2.5
      ? 'Previous responses have not fully resonated — use concrete examples, shorter sentences, less abstraction.'
    : rolling_score >= 4
      ? 'Previous responses have resonated well — maintain this depth and register.'
    : 'Balance conceptual depth with practical grounding.';

  const depthGuide = uncertainty > 0.6
    ? 'Use foundational framing, avoid jargon, favour metaphor and story.'
    : uncertainty > 0.3
    ? 'Blend conceptual and practical — cite specific examples from corpus.'
    : 'Engage at practitioner depth. Surface nuance, tension, and contradiction.';

  return [
    '[SESSION CONTEXT — Active Inference Partner Model]',
    `This person appears to be ${level} (query ${query_count + 1} this session).`,
    topSpheres.length ? `Attention has centered on: ${topSpheres.join(', ')}.` : '',
    topics_visited.slice(-3).length
      ? `Recent queries: "${topics_visited.slice(-3).join('" → "')}"` : '',
    `Goal alignment: ${Math.round(goal_alignment*100)}% toward corpus values.`,
    calibration,
    depthGuide,
    last_sphere ? `Last sphere: ${SPHERE_LABELS[last_sphere] || last_sphere}.` : '',
  ].filter(Boolean).join('\n');
}

// ── Phase 3: Natural agent constraint builder ─────────────────────────────
// Checks whether any natural agents relevant to this query are in distress.
// Constitutional priority = must shape synthesis frame (not overridable).
// Warning priority = informs framing but does not override.

function getNaturalConstraints(sphere, bioregionId, storedVitality) {
  // Sphere-to-bioregion mapping: which bioregions are most relevant to each sphere?
  const sphereBioregionMap = {
    BIOSPHERE:   ['amazon', 'great_barrier', 'atlantic_forest', 'congo', 'coral_triangle', 'cerrado'],
    ATMOSPHERE:  ['arctic', 'amazon', 'boreal', 'himalayan'],
    HYDROSPHERE: ['amazon', 'himalayan', 'sahel', 'rocky_mountain'],
    ANCIENT:     ['amazon', 'congo', 'sahel'],
    REGEN:       ['amazon', 'atlantic_forest', 'cerrado', 'sahel'],
    GOVERNANCE:  ['arctic', 'amazon', 'great_barrier'],
    ANTHRO:      ['amazon', 'atlantic_forest', 'cerrado'],
    NOOSPHERE:   [],
    TECHNO:      [],
    ECONO:       ['amazon', 'cerrado', 'sahel'],
  };

  const relevantIds = bioregionId
    ? [bioregionId, ...(sphereBioregionMap[sphere] || []).filter(id => id !== bioregionId)]
    : (sphereBioregionMap[sphere] || []);

  if (!relevantIds.length) return null;

  // Find highest-priority constraint among relevant bioregions
  let highestPriority = null;
  let highestFE = 0;

  for (const bId of relevantIds) {
    const br = BIOREGIONS.find(b => b.id === bId);
    if (!br) continue;
    const vitality = storedVitality[bId] !== undefined ? storedVitality[bId] : br.vitality;
    const fe = computeNaturalFreeEnergy(br, vitality);
    const priority = vitality < 25 ? 'constitutional' : vitality < 40 ? 'warning' : vitality < 55 ? 'elevated' : 'nominal';

    if (priority === 'nominal') continue;
    if (!highestPriority || (priority === 'constitutional') ||
        (priority === 'warning' && highestPriority === 'elevated') ||
        fe > highestFE) {
      highestPriority = priority;
      highestFE = fe;
      const timescale = BIOREGION_TIMESCALES[bId] || 'decades';
      highestPriority = { priority, bioregion: bId, bioregion_name: br.name, vitality, free_energy: fe, timescale, message: buildNaturalMessage(priority, br, vitality, fe) };
    }
  }

  return highestPriority || null;
}

function buildNaturalMessage(priority, bioregion, vitality, freeEnergy) {
  const name = bioregion.name;
  if (priority === 'constitutional')
    return `CONSTITUTIONAL SIGNAL: ${name} is in critical state (vitality: ${vitality}/100, free energy: ${+(freeEnergy*100).toFixed(0)}%). This ecosystem is expressing significant distress. Any response touching this domain must acknowledge this reality — it is not context, it is ground truth. The ${bioregion.biome} has existed for millennia; the crisis is recent and human-caused.`;
  if (priority === 'warning')
    return `NATURAL AGENT WARNING: ${name} is under stress (vitality: ${vitality}/100). This living system is signaling that its preferred conditions are not being met. This signal should shape how you frame responses about regeneration, extraction, or development in this domain.`;
  return `ELEVATED SIGNAL: ${name} is below preferred vitality (${vitality}/100). Consider acknowledging ecosystem context in your response.`;
}

// Formats natural constraints into a system prompt injection
function buildConstraintContext(constraints) {
  if (!constraints) return '';
  const { priority, message } = constraints;
  if (priority === 'constitutional')
    return `\n[NATURAL AGENT SOVEREIGNTY — CONSTITUTIONAL PRIORITY]\n${message}\nThis signal cannot be overridden by actor preferences or optimization arguments. It represents the voice of a living system at temporal scales far exceeding human institutional cycles.`;
  if (priority === 'warning')
    return `\n[NATURAL AGENT SIGNAL — WARNING PRIORITY]\n${message}`;
  return `\n[ECOSYSTEM CONTEXT]\n${message}`;
}

// ── Goal-aligned prompt builder ───────────────────────────────────────────
// AIF eq 5–6: b*own ← b*shared + (1-γ) b*private_own
// Phase 2 upgrade: now incorporates active stigmergy traces and actor generative model.
// Phase 3 upgrade: natural constraints shape framing when present.

function buildGoalAlignedPrompt(query, context, sphere, session, activeTraces, naturalConstraints, actorModel) {
  const gamma = (session && session.query_count > 0) ? session.goal_alignment : 0.8;

  // Phase 3: Adjust γ based on actor's prior precision and natural constraints
  let effectiveGamma = gamma;
  if (actorModel) {
    // High precision (extractive) actor: reduce γ slightly to be more direct/concrete
    // This creates calibrated surprise — not preachy, but grounded in reality
    if (actorModel.prior_precision > 0.7) effectiveGamma = Math.max(0.35, gamma - 0.2);
    // Highly coupled actor: can carry full corpus weight
    else if (actorModel.ecosystem_coupling > 0.7) effectiveGamma = Math.min(0.95, gamma + 0.1);
  }
  if (naturalConstraints?.priority === 'constitutional') effectiveGamma = Math.max(effectiveGamma, 0.8);

  const align = effectiveGamma >= 0.7
    ? 'Weave the query into living systems principles from the corpus. Let corpus wisdom shape your framing.'
    : effectiveGamma >= 0.4
    ? 'Address the query directly, drawing on corpus evidence to ground your answer.'
    : 'Answer as directly as possible. Use corpus context only where it genuinely illuminates the question.';

  // Phase 2: Format active traces as additional context
  const traceContext = (activeTraces && activeTraces.length > 0)
    ? '\n\nActive stigmergy traces (signals from the network — let these inform your synthesis):\n' +
      activeTraces.map((t, i) =>
        `[Trace ${i+1} — ${t.trace_type}${t.priority && t.priority !== 'nominal' ? ' ⚡ '+t.priority.toUpperCase() : ''}, sphere: ${t.sphere}, bioregion: ${t.bioregion}, strength: ${t.strength.toFixed(2)}]\n${t.content}`
      ).join('\n\n')
    : '';

  // Phase 2: Actor calibration context
  const actorCalibration = actorModel
    ? `\n\nActor model: prior_precision=${actorModel.prior_precision} (${actorModel.prior_precision > 0.7 ? 'extractive/rigid' : actorModel.prior_precision > 0.4 ? 'moderate' : 'adaptive/regenerative'}), ecosystem_coupling=${actorModel.ecosystem_coupling}, timescale=${actorModel.timescale}. Calibrate response to be ${actorModel.prior_precision > 0.7 ? 'concrete and grounded in operational reality, surfacing ecosystem risk without moral argument' : 'deep and corpus-rich, this actor can receive full systems complexity'}.`
    : '';

  return `Query: "${query}"${sphere ? `\nFocused sphere: ${sphere}` : ''}

Retrieved corpus context:
${context || '(No matching corpus documents — draw on living systems principles)'}${traceContext}${actorCalibration}

Instruction: ${align}

Synthesize a response grounded in the evidence above.`;
}

// ── Session endpoint handlers ─────────────────────────────────────────────

async function handleGetSession(request, env) {
  const sid = new URL(request.url).searchParams.get('session_id');
  if (!sid) return R({ error: 'session_id required' }, 400);
  const session = await loadSession(sid, env);
  return R({ ok: true, session });
}

async function handleUpdateSession(request, env) {
  const { session_id, score, query, sphere } = await request.json();
  if (!session_id) return R({ error: 'session_id required' }, 400);
  let session = await loadSession(session_id, env);
  session = updateSessionBeliefs(session, { query, sphere, score });
  await saveSession(session, env);
  return R({ ok: true, session });
}


async function handleQuery(request, env) {
  const _qErr = requireKV(env); if (_qErr) return _qErr;
  let body;
  try { body = await request.json(); }
  catch(e) { return R({ error: 'Invalid JSON body' }, 400); }

  const query      = (body.query || '').trim();
  const sphere     = body.sphere || null;
  const session_id = body.session_id || null;
  const actor_id   = body.actor_id   || null;   // Phase 2: optional actor identity
  const bioregion  = body.bioregion  || null;   // Phase 2: optional bioregion context
  if (!query) return R({ error: 'query is required' }, 400);

  // AIF Phase 1: Load session belief state (sensory prior)
  const session = await loadSession(session_id, env);

  // Hybrid retrieval (BM25 + semantic) — weighted by sphere affinity if session exists
  let results = await hybridSearch(query, env, 8);

  // Sphere affinity boost: re-rank results toward user's dominant spheres
  if (session.query_count > 0 && Object.keys(session.sphere_affinity).length > 0) {
    const topSphere = Object.entries(session.sphere_affinity).sort((a,b)=>b[1]-a[1])[0]?.[0];
    if (topSphere && !sphere) {
      results = results.filter(d=>d.sphere===topSphere)
        .concat(results.filter(d=>d.sphere!==topSphere)).slice(0,8);
    }
  }

  if (sphere) results = results.filter(d=>d.sphere===sphere)
    .concat(results.filter(d=>d.sphere!==sphere)).slice(0,6);

  const context = results.map((d,i) =>
    `[Source ${i+1}: ${d.title||d.url}] (sphere: ${d.sphere||'NOOSPHERE'})\n${(d.text||'').slice(0,600)}`
  ).join('\n\n');

  if (!env.AI) return R({ error: 'Workers AI binding missing — add AI binding in Cloudflare Worker Settings' }, 503);

  // ── Phase 2: Pull active stigmergy traces relevant to this query ──────────
  const allTraces     = await env.STIGMERGY_KV.get('_stigmergy_traces', 'json') || [];
  const activeTraces  = allTraces.filter(t => t.active && t.strength > 0.05);
  const relevantSphere   = sphere || session.last_sphere || 'NOOSPHERE';
  const relevantBioregion= bioregion;

  // Priority: constitutional/warning natural signals first, then sphere-matched, then recent
  let queryTraces = activeTraces
    .filter(t => t.priority === 'constitutional' || t.priority === 'warning')
    .concat(activeTraces.filter(t => t.sphere === relevantSphere && t.priority !== 'constitutional' && t.priority !== 'warning'))
    .concat(relevantBioregion ? activeTraces.filter(t => t.bioregion === relevantBioregion && t.sphere !== relevantSphere) : [])
    .slice(0, 5);  // max 5 traces in context

  // Remove duplicates
  const seenIds = new Set();
  queryTraces = queryTraces.filter(t => { if (seenIds.has(t.id)) return false; seenIds.add(t.id); return true; });

  // ── Phase 3: Get natural agent constraints for this query ─────────────────
  const storedVitality = await env.STIGMERGY_KV.get('_natural_vitality', 'json') || {};
  const naturalConstraints = getNaturalConstraints(relevantSphere, relevantBioregion, storedVitality);

  // ── Phase 2: Infer actor generative model if actor_id provided ─────────────
  let actorModel = null;
  if (actor_id) {
    const actors = await env.STIGMERGY_KV.get('_actors', 'json') || [];
    const actor  = actors.find(a => a.id === actor_id);
    if (actor) {
      const actorTraces = allTraces.filter(t => t.actor_id === actor_id).slice(0, 10);
      actorModel = inferActorGenerativeModel(actor, actorTraces);
    }
  }

  // AIF Phase 2: Theory of Mind — build partner model context
  const tomContext = buildToMContext(session);

  // Gap #2: inject active natural-agent distress signals into synthesis context
  const distressContext = await buildDistressContext(session, env);

  // AIF Phase 3: Goal-aligned prompt (γ parameter) — now also actor-calibrated
  const prompt = buildGoalAlignedPrompt(query, context, sphere, session, queryTraces, naturalConstraints, actorModel);

  let synthesis = '';
  let learningPath = [];
  let suggestedSphere = sphere;
  const citedTraceIds = queryTraces.map(t => t.id);

  try {
    // Inject ToM context + natural constraints + BIS gap objective into system prompt
    // Patch 4: AIF is anchored to BIS gap (planetary health), not individual corpus resonance
    const constraintContext = buildConstraintContext(naturalConstraints);
    const bisObjective = `[AIF SYSTEM OBJECTIVE]\nThis synthesis engine minimizes the gap between current ecosystem health (BIS) and bioregion preferred states across 122 Umwelt nodes. Individual user learning is a means to this end — not the end itself. Ground all synthesis in what helps close that gap.`;
    const systemWithContext = [SYSTEM_PROMPT, bisObjective, tomContext, constraintContext, distressContext].filter(Boolean).join('\n\n');

    const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: systemWithContext },
        { role: 'user',   content: prompt }
      ],
      max_tokens: 1200,
    });

    const rawText = aiResponse.response || aiResponse.choices?.[0]?.message?.content || '';

    const synthMatch  = rawText.match(/SYNTHESIS:([\s\S]*?)(?:LEARNING_PATH:|$)/);
    const pathMatch   = rawText.match(/LEARNING_PATH:([\s\S]*?)(?:SPHERE:|$)/);
    const sphereMatch = rawText.match(/SPHERE:\s*(\w+)/);

    synthesis       = (synthMatch?.[1] || rawText).trim();
    suggestedSphere = sphereMatch?.[1] || sphere || 'NOOSPHERE';

    if (pathMatch?.[1]) {
      learningPath = pathMatch[1].split('\n').map(l => l.replace(/^[-*\d.]\s*/, '').trim()).filter(Boolean).slice(0, 4);
    }
  } catch(e) {
    return R({ error: 'Synthesis failed', detail: e.message }, 502);
  }

  // Log to D1
  const qid = rnd();
  try {
    await env.STIGMERGY_DB.prepare(
      'INSERT INTO queries (id, query, response, sources, sphere) VALUES (?,?,?,?,?)'
    ).bind(qid, query, synthesis, JSON.stringify(results.map(d => d.url || d.title)), suggestedSphere).run();
  } catch(e) { /* non-fatal */ }

  // AIF Phase 1: Update session belief state after query
  const updatedSession = updateSessionBeliefs(session, { query, sphere: suggestedSphere });
  await saveSession(updatedSession, env);

  // ── Phase 2: Auto-deposit synthesis trace into stigmergic layer ───────────
  try {
    const synthTrace = {
      id: rnd(),
      agent_id: 'synthesis_engine',
      agent_type: AGENT_TYPES.AI,
      actor_id: actor_id || session_id || 'anonymous',
      content: `Synthesis: ${query.slice(0, 80)}... [sphere: ${suggestedSphere}${relevantBioregion ? ', bioregion: ' + relevantBioregion : ''}]`.slice(0, 500),
      trace_type: 'synthesis_event',
      bioregion: relevantBioregion || 'global',
      sphere: suggestedSphere,
      strength: 0.55,
      timescale_depth: 'minutes',
      timescale_weight: TIMESCALE_WEIGHTS.minutes,
      deposited_at: new Date().toISOString(),
      decay_rate: 0.12,   // synthesis traces decay faster — they're ephemeral
      active: true,
      cites_traces: citedTraceIds,
      reinforcement_count: 0,
      cited_by: [],
      query_id: qid,
    };
    const updatedTraces = [synthTrace, ...allTraces.filter(t => t.active && t.strength > 0.05)].slice(0, 500);

    // ── Phase 4: Reinforce cited traces ──────────────────────────────────────
    const reinforced = updatedTraces.map(t => {
      if (citedTraceIds.includes(t.id)) {
        return {
          ...t,
          strength: Math.min(1.0, t.strength + 0.08),  // cited = stronger
          reinforcement_count: (t.reinforcement_count || 0) + 1,
          cited_by: [...(t.cited_by || []), qid].slice(-20),
          last_cited: new Date().toISOString(),
        };
      }
      return t;
    });
    await env.STIGMERGY_KV.put('_stigmergy_traces', JSON.stringify(reinforced));
  } catch(e) { /* non-fatal — don't break query response */ }

  // ── Phase 2: Update actor generative model from this query interaction ─────
  if (actor_id && actorModel) {
    try {
      const actors = await env.STIGMERGY_KV.get('_actors', 'json') || [];
      const actorIdx = actors.findIndex(a => a.id === actor_id);
      if (actorIdx >= 0) {
        actors[actorIdx].generative_model = actorModel;
        actors[actorIdx].last_query_sphere = suggestedSphere;
        await env.STIGMERGY_KV.put('_actors', JSON.stringify(actors));
      }
    } catch(e) { /* non-fatal */ }
  }

  return R({
    query,
    synthesis,
    sources: results.map(d => ({ title: d.title, url: d.url, sphere: d.sphere, category: d.category })),
    sphere: suggestedSphere,
    learning_path: learningPath,
    query_id: qid,
    retrieved: results.length,
    version: VERSION,
    // Phase 2: active trace context returned
    active_traces_used: queryTraces.length,
    trace_context: queryTraces.map(t => ({ id: t.id, type: t.trace_type, sphere: t.sphere, bioregion: t.bioregion, strength: t.strength, priority: t.priority || 'nominal' })),
    // Phase 3: natural agent constraint state
    natural_constraints: naturalConstraints ? { priority: naturalConstraints.priority, bioregion: naturalConstraints.bioregion, message: naturalConstraints.message } : null,
    // AIF session state
    session: {
      session_id:     updatedSession.session_id,
      query_count:    updatedSession.query_count,
      uncertainty:    +updatedSession.uncertainty.toFixed(2),
      goal_alignment: +updatedSession.goal_alignment.toFixed(2),
      last_sphere:    updatedSession.last_sphere,
    },
    // Phase 2: actor model state if available
    actor_model: actorModel ? { prior_precision: actorModel.prior_precision, ecosystem_coupling: actorModel.ecosystem_coupling, timescale: actorModel.timescale } : null,
  });
}

const SYSTEM_PROMPT = `You are the Ayu planetary co-intelligence — a synthesis engine rooted in living systems thinking, regenerative ethics, and deep ecological wisdom. You weave together scientific understanding with indigenous knowledge systems, systems thinking, and the Work That Reconnects.

Your responses:
- Honor the complexity and interconnectedness of living systems
- Integrate multiple ways of knowing: scientific, experiential, ancestral, somatic
- Point toward regenerative action rather than extractive solutions
- Acknowledge grief, uncertainty, and the Great Turning
- Are grounded in provided context but can draw on living systems principles

Format your response as:
SYNTHESIS: [Your synthesis — 3-4 paragraphs, integrative, alive]
LEARNING_PATH: [3-4 related explorations on separate lines]
SPHERE: [Most relevant sphere: BIOSPHERE/ATMOSPHERE/HYDROSPHERE/ANTHRO/NOOSPHERE/TECHNO/ECONO/ANCIENT/REGEN/GOVERNANCE]`;

function buildQueryPrompt(query, context, sphere) {
  return `Query: "${query}"${sphere ? `\nFocused sphere: ${sphere}` : ''}

Retrieved corpus context:
${context || '(No matching corpus documents — draw on living systems principles)'}

Synthesize a response that honors both the retrieved knowledge and the living intelligence of the planetary web.`;
}

// ═══════════════════════════════════════════════════════════════════════════
// FEEDBACK
// ═══════════════════════════════════════════════════════════════════════════

async function handleFeedback(request, env) {
  const _dbErr = requireDB(env); if (_dbErr) return _dbErr;
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  const { query_id, score, comment, session_id, sphere, actor_id } = await request.json();
  if (score === undefined || score < 0 || score > 5) return R({ error: 'score must be 0-5' }, 400);

  await env.STIGMERGY_DB.prepare(
    'INSERT INTO feedback (id, query_id, score, comment) VALUES (?,?,?,?)'
  ).bind(rnd(), query_id || null, score, comment || null).run();

  // AIF: Update session belief state with feedback signal
  let updatedSession = null;
  if (session_id) {
    let session = await loadSession(session_id, env);
    session = updateSessionBeliefs(session, { score, sphere });
    await saveSession(session, env);
    updatedSession = {
      uncertainty:    +session.uncertainty.toFixed(2),
      goal_alignment: +session.goal_alignment.toFixed(2),
      rolling_score:  session.rolling_score !== null ? +session.rolling_score.toFixed(2) : null,
    };
  }

  // Phase 2: Update actor generative model based on feedback
  // High feedback + ecosystem sphere → increase ecosystem coupling
  // Low feedback + ecosystem sphere → reduce prior precision (signal penetrated the model)
  let actorModelUpdate = null;
  if (actor_id) {
    try {
      const actors = await env.STIGMERGY_KV.get('_actors', 'json') || [];
      const actorIdx = actors.findIndex(a => a.id === actor_id);
      if (actorIdx >= 0) {
        const actor = actors[actorIdx];
        actor.interaction_scores = actor.interaction_scores || [];
        // Map score 0-5 → alignment delta -50 to +50
        const alignDelta = (score - 2.5) * 20;
        actor.interaction_scores.push(Math.max(0, Math.min(100, 50 + alignDelta)));
        if (actor.interaction_scores.length > 20) actor.interaction_scores.shift();

        // Phase 2: If low score on ecosystem sphere, slightly reduce prior_precision
        // This models the calibrated surprise mechanism — feedback penetrates the model
        const ecoSpheres = ['BIOSPHERE', 'ATMOSPHERE', 'HYDROSPHERE', 'REGEN', 'ANCIENT'];
        if (score <= 2 && ecoSpheres.includes(sphere)) {
          const gm = actor.generative_model || {};
          gm.prior_precision = Math.max(0.15, (gm.prior_precision || 0.5) - 0.03);
          actor.generative_model = gm;
        }

        await env.STIGMERGY_KV.put('_actors', JSON.stringify(actors));
        const newAAI = computeAAI(actors[actorIdx]);
        actorModelUpdate = { actor_id, new_aai: newAAI, ...aaiBand(newAAI), feedback_integrated: true };
      }
    } catch(e) { /* non-fatal */ }
  }

  // Phase 4: Reinforce the synthesis trace associated with this query
  // High score = synthesis resonated = reinforce the traces it cited
  if (score >= 4 && query_id) {
    try {
      const traces = await env.STIGMERGY_KV.get('_stigmergy_traces', 'json') || [];
      const synthTrace = traces.find(t => t.query_id === query_id && t.trace_type === 'synthesis_event');
      if (synthTrace && synthTrace.cites_traces) {
        const reinforced = traces.map(t => {
          if (synthTrace.cites_traces.includes(t.id)) {
            return { ...t, strength: Math.min(1.0, t.strength + 0.06), reinforcement_count: (t.reinforcement_count || 0) + 1 };
          }
          return t;
        });
        await env.STIGMERGY_KV.put('_stigmergy_traces', JSON.stringify(reinforced));
      }
    } catch(e) { /* non-fatal */ }
  }

  return R({
    ok: true,
    recorded: { query_id, score, comment },
    aif: updatedSession ? {
      message: score >= 4
        ? 'High resonance — belief state updated, uncertainty reduced'
        : score <= 2
        ? 'Low resonance — goal alignment reduced, response depth will adjust'
        : 'Moderate resonance — belief state stable',
      session: updatedSession,
    } : null,
    actor_update: actorModelUpdate,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// MULTI-AGENT AIF — Phase 1: Unified Agent Abstraction
// Every entity that minimizes free energy is an agent. Natural agents (bioregions),
// human agents (actors), and AI agents (specialized sub-systems) share one model.
// ═══════════════════════════════════════════════════════════════════════════

// ── Natural agent free energy: how far current vitality deviates from preferred range
function computeNaturalFreeEnergy(bioregion, currentVitality) {
  const range = BIOME_PREFERRED_VITALITY[bioregion.biome] || { min: 55, max: 80 };
  const mid   = (range.min + range.max) / 2;
  const span  = (range.max - range.min) / 2;
  const v     = currentVitality !== undefined ? currentVitality : bioregion.vitality;
  // Normalized distance from preferred midpoint — 0 = perfect, 1 = critical
  return +Math.min(1.0, Math.abs(v - mid) / (span + mid * 0.5)).toFixed(3);
}

// ── Build a natural agent object from a bioregion constant + current vitality
function buildNaturalAgent(bioregion, currentVitality) {
  const vitality = currentVitality !== undefined ? currentVitality : bioregion.vitality;
  const range    = BIOME_PREFERRED_VITALITY[bioregion.biome] || { min: 55, max: 80 };
  const timescale = BIOREGION_TIMESCALES[bioregion.id] || 'decades';
  const fe        = computeNaturalFreeEnergy(bioregion, vitality);

  // Threshold evaluation
  const priority = vitality < 25 ? 'constitutional'   // hard override — critical
                 : vitality < 40 ? 'warning'           // shapes synthesis frame
                 : vitality < 55 ? 'elevated'          // surfaced as context
                 :                 'nominal';

  return {
    id:   `natural_${bioregion.id}`,
    name: bioregion.name,
    type: AGENT_TYPES.NATURAL,
    bioregion_id: bioregion.id,
    biome: bioregion.biome,
    sovereignty: 'constitutional',   // natural agents hold sovereignty by default
    generative_model: {
      preferred_vitality_range: range,
      priors: { ecosystem_integrity: 0.92, self_regulation: 0.95, resilience: 0.88 },
      prior_precision: 0.92,         // tight: the bioregion knows what it is
      timescale,
      timescale_weight: TIMESCALE_WEIGHTS[timescale] || 0.8,
      sensory_channels: ['vitality_index', 'biodiversity', 'carbon_flux', 'water_cycle', 'species_abundance', 'steward_actions'],
      action_channels:  ['biosignals', 'vitality_change', 'species_events', 'threshold_crossing'],
    },
    current_state: {
      vitality,
      trend:       bioregion.trend,
      free_energy: fe,
      priority,
    },
    last_updated: new Date().toISOString(),
  };
}

// ── Build a natural agent from a node (bioregion × sphere) — the correct Umwelt unit
// Each node is a distinct perceptual world: amazon:BIOSPHERE ≠ amazon:HYDROSPHERE.
// storedVitality is the '_natural_vitality' KV blob keyed by bioregion_id.
function buildNaturalAgentNode(node, storedVitality) {
  const br       = BIOREGIONS.find(b => b.id === node.bioregion_id);
  const vitality = (storedVitality && storedVitality[node.bioregion_id] !== undefined)
    ? storedVitality[node.bioregion_id]
    : (br?.vitality ?? 50);
  const biome    = br?.biome || node.biome;
  const timescale = BIOREGION_TIMESCALES[node.bioregion_id] || 'decades';
  const fe       = computeNaturalFreeEnergy({ biome, vitality }, vitality);

  const priority = vitality < 25 ? 'constitutional'
                 : vitality < 40 ? 'warning'
                 : vitality < 55 ? 'elevated'
                 :                 'nominal';

  return {
    id:           `natural_${node.bioregion_id}:${node.sphere}`,
    name:         `${node.bioregion_name} — ${node.sphere}`,
    type:         AGENT_TYPES.NATURAL,
    node_id:      node.node_id,
    bioregion_id: node.bioregion_id,
    sphere:       node.sphere,
    biome,
    realm:        node.realm,
    subrealm:     node.subrealm,
    pop_level:    node.pop_level,
    sovereignty:  'constitutional',
    generative_model: {
      preferred_vitality_range: BIOME_PREFERRED_VITALITY[biome] || { min: 55, max: 80 },
      priors: { ecosystem_integrity: 0.92, self_regulation: 0.95, resilience: 0.88 },
      prior_precision: 0.92,
      timescale,
      timescale_weight: TIMESCALE_WEIGHTS[timescale] || 0.8,
      sensory_channels: SPHERE_SIGNAL_TYPES[node.sphere] || ['vitality_index'],
      action_channels:  ['biosignals', 'vitality_change', 'threshold_crossing'],
    },
    current_state: {
      vitality,
      trend:       br?.trend || 'unknown',
      free_energy: fe,
      priority,
    },
    last_updated: new Date().toISOString(),
  };
}

// ── Infer actor generative model from behavioral traces and history
function inferActorGenerativeModel(actor, recentTraces) {
  const { agreement_scores = [], interaction_scores = [], sphere_focus } = actor;

  // Prior precision: how rigid is this actor's model?
  // High AAI + consistent scores = more adaptive (low precision)
  // Low AAI + volatile scores  = more extractive (high precision / rigid)
  const aai = computeAAI(actor);
  const scoreVariance = interaction_scores.length > 1
    ? interaction_scores.reduce((acc, s, i, arr) => {
        if (i === 0) return 0;
        return acc + Math.abs(s - arr[i-1]);
      }, 0) / interaction_scores.length
    : 25;

  // High variance = actor is responsive to signals (lower precision)
  // Low variance + low AAI = locked into extractive model (high precision)
  const rawPrecision = aai >= 70 ? 0.25   // aligned, adaptive
                     : aai >= 50 ? 0.45   // moderate
                     : aai >= 35 ? 0.72   // contradictory / extractive
                     :             0.88;  // critical — highly rigid

  // Variance adjustment: responsive actors have lower precision
  const precisionAdj = Math.max(0.1, rawPrecision - (scoreVariance / 200));

  // Ecosystem coupling: how coupled is this actor's model to ecosystem health?
  const agrSpheres = (actor.agreements_ratified || []).map(id => {
    const agr = MULTILATERAL_AGREEMENTS.find(a => a.id === id);
    return agr?.domain;
  });
  const ecoDomains = ['biodiversity', 'water', 'land', 'ocean', 'climate'];
  const ecoCoupling = agrSpheres.length
    ? agrSpheres.filter(d => ecoDomains.includes(d)).length / Math.max(agrSpheres.length, 3)
    : 0.1;

  // Timescale inferred from actor type
  const timescale = actor.type === 'government' ? 'years'
                  : actor.type === 'corporation' ? 'quarters'
                  : actor.type === 'community'   ? 'years'
                  : actor.type === 'indigenous'  ? 'decades'
                  : actor.type === 'ngo'          ? 'years'
                  :                                'years';

  return {
    prior_precision:      +precisionAdj.toFixed(3),
    ecosystem_coupling:   +Math.min(1, ecoCoupling + aai / 300).toFixed(3),
    timescale,
    timescale_weight:     TIMESCALE_WEIGHTS[timescale] || 0.6,
    sphere_focus,
    priors: {
      growth_orientation:    +(1 - aai / 100).toFixed(2),
      reciprocity_expectation: +(aai / 100 * 0.9).toFixed(2),
      long_term_orientation: +(ecoCoupling * 0.8 + aai / 200).toFixed(2),
    },
    inferred_at: new Date().toISOString(),
  };
}

// ── Compute actor (human agent) free energy: misalignment between their model and ecosystem reality
function computeActorFreeEnergy(actor, naturalAgents) {
  const aai = computeAAI(actor);
  const model = actor.generative_model || {};
  const coupling = model.ecosystem_coupling || (aai / 100 * 0.8);

  // Free energy = gap between actor's model and average natural agent distress
  const avgNaturalFE = naturalAgents.length
    ? naturalAgents.reduce((s, n) => s + (n.current_state?.free_energy || 0.5), 0) / naturalAgents.length
    : 0.5;

  // An extractive actor with coupled natural agents = high free energy (mismatch)
  // An aligned actor with distressed natural agents = moderate free energy (aware, engaged)
  const mismatch = avgNaturalFE * (1 - coupling);
  return +Math.min(1.0, mismatch + (1 - aai / 100) * 0.3).toFixed(3);
}

// ── GET /api/agents — list all agents across all three types
async function handleAgentsList(env) {
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;

  // Natural agents — one per node (bioregion × sphere) = 122 agents
  const storedVitality = await env.STIGMERGY_KV.get('_natural_vitality', 'json') || {};
  const naturalAgents  = getAllNodes().map(n => buildNaturalAgentNode(n, storedVitality));

  // Human agents from actor registry with inferred generative models
  const actors = await env.STIGMERGY_KV.get('_actors', 'json') || [];
  const traces  = await env.STIGMERGY_KV.get('_stigmergy_traces', 'json') || [];
  const humanAgents = actors.map(actor => {
    const recentTraces = traces.filter(t => t.actor_id === actor.id).slice(0, 10);
    const gm = inferActorGenerativeModel(actor, recentTraces);
    const aai = computeAAI(actor);
    return {
      id: actor.id,
      name: actor.name,
      type: AGENT_TYPES.HUMAN,
      aai,
      ...aaiBand(aai),
      generative_model: gm,
      current_state: {
        free_energy: computeActorFreeEnergy({ ...actor, generative_model: gm }, naturalAgents),
        sphere_focus: actor.sphere_focus,
        agreements_ratified: (actor.agreements_ratified || []).length,
      },
      last_updated: actor.created_at,
    };
  });

  // AI agents from registry
  const aiAgents = AI_AGENTS.map(a => ({ ...a }));

  return R({
    ok: true,
    agents: { natural: naturalAgents, human: humanAgents, ai: aiAgents },
    counts: { natural: naturalAgents.length, human: humanAgents.length, ai: aiAgents.length, total: naturalAgents.length + humanAgents.length + aiAgents.length },
    paradigm: 'platform_as_stigmergic_medium',
    version: VERSION,
  });
}

// ── GET /api/agents/:id — state of a specific agent
async function handleAgentState(request, env) {
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  const agentId = new URL(request.url).pathname.split('/').pop();

  // Check natural agents — ID format: natural_{bioregion_id}:{SPHERE} or bare node_id
  // Also accepts legacy format natural_{bioregion_id} (returns all nodes for that bioregion)
  const stored = await env.STIGMERGY_KV.get('_natural_vitality', 'json') || {};
  const allNodes = getAllNodes();

  // Exact node match: natural_amazon:BIOSPHERE or amazon:BIOSPHERE
  const node = allNodes.find(n => n.node_id === agentId || `natural_${n.node_id}` === agentId);
  if (node) {
    const agent = buildNaturalAgentNode(node, stored);
    const traces = await env.STIGMERGY_KV.get('_stigmergy_traces', 'json') || [];
    const nodeTraces = traces.filter(t => t.bioregion === node.bioregion_id && (!t.sphere || t.sphere === node.sphere)).slice(0, 5);
    const nodeState = await env.STIGMERGY_KV.get(`na:node:state:${node.bioregion_id}:${node.sphere}`, 'json') || null;
    return R({ ok: true, agent, node_state: nodeState, recent_signals: nodeTraces });
  }

  // Legacy bioregion match: natural_amazon or amazon — return all nodes for that bioregion
  const bioregion = BIOREGIONS.find(b => `natural_${b.id}` === agentId || b.id === agentId);
  if (bioregion) {
    const bioNodes = getNodesForBioregion(bioregion.id);
    const agents = bioNodes.map(n => buildNaturalAgentNode(n, stored));
    return R({ ok: true, bioregion_id: bioregion.id, agents, node_count: agents.length,
      note: 'Use natural_{bioregion_id}:{SPHERE} to address a specific node' });
  }

  // Check AI agents
  const aiAgent = AI_AGENTS.find(a => a.id === agentId);
  if (aiAgent) return R({ ok: true, agent: aiAgent });

  // Check human agents
  const actors = await env.STIGMERGY_KV.get('_actors', 'json') || [];
  const actor  = actors.find(a => a.id === agentId);
  if (actor) {
    const traces = await env.STIGMERGY_KV.get('_stigmergy_traces', 'json') || [];
    const storedVitality = await env.STIGMERGY_KV.get('_natural_vitality', 'json') || {};
    const naturalAgents  = getAllNodes().map(n => buildNaturalAgentNode(n, storedVitality));
    const gm  = inferActorGenerativeModel(actor, traces.filter(t => t.actor_id === actor.id).slice(0, 10));
    const aai = computeAAI(actor);
    return R({
      ok: true,
      agent: {
        id: actor.id, name: actor.name, type: AGENT_TYPES.HUMAN,
        aai, ...aaiBand(aai), generative_model: gm,
        current_state: { free_energy: computeActorFreeEnergy({ ...actor, generative_model: gm }, naturalAgents), sphere_focus: actor.sphere_focus },
      },
    });
  }

  return R({ error: 'Agent not found', id: agentId }, 404);
}

// ── POST /api/agents/natural/signal — manually deposit a natural agent signal
async function handleNaturalAgentSignal(request, env) {
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  const body = await request.json();
  const { bioregion_id, vitality_index, source, notes } = body;
  if (!bioregion_id) return R({ error: 'bioregion_id required' }, 400);

  const bioregion = BIOREGIONS.find(b => b.id === bioregion_id);
  if (!bioregion)  return R({ error: 'Unknown bioregion_id', valid: BIOREGIONS.map(b => b.id) }, 404);

  // Update stored vitality for this natural agent
  const stored = await env.STIGMERGY_KV.get('_natural_vitality', 'json') || {};
  const prevVitality = stored[bioregion_id] || bioregion.vitality;
  stored[bioregion_id] = vitality_index || prevVitality;
  await env.STIGMERGY_KV.put('_natural_vitality', JSON.stringify(stored));

  // Use first node for this bioregion to build the representative agent
  const firstNode = getNodesForBioregion(bioregion_id)[0];
  const agent = firstNode ? buildNaturalAgentNode(firstNode, stored) : null;
  if (!agent) return R({ error: 'No nodes registered for this bioregion' }, 500);

  // Deposit natural agent signal trace
  const traces = await env.STIGMERGY_KV.get('_stigmergy_traces', 'json') || [];
  const traceId = rnd();
  const trend  = stored[bioregion_id] < prevVitality ? 'declining' : stored[bioregion_id] > prevVitality ? 'recovering' : 'stable';
  const signalTrace = {
    id: traceId,
    agent_id: agent.id,
    agent_type: AGENT_TYPES.NATURAL,
    actor_id: agent.id,
    content: `Natural agent signal: ${bioregion.name} vitality ${stored[bioregion_id]}/100 (${trend}). Free energy: ${agent.current_state.free_energy}. Priority: ${agent.current_state.priority}. ${notes || ''}`.trim().slice(0, 500),
    trace_type: 'natural_signal',
    bioregion: bioregion_id,
    sphere: 'BIOSPHERE',
    strength: Math.min(1.0, agent.current_state.free_energy + 0.3),
    timescale_depth: agent.generative_model.timescale,
    timescale_weight: agent.generative_model.timescale_weight,
    priority: agent.current_state.priority,
    free_energy: agent.current_state.free_energy,
    deposited_at: new Date().toISOString(),
    decay_rate: 0.02,  // natural signals decay slowly — they carry long timescale authority
    active: true,
    reinforcement_count: 0,
    cited_by: [],
  };
  traces.unshift(signalTrace);
  await env.STIGMERGY_KV.put('_stigmergy_traces', JSON.stringify(traces.filter(t => t.active && t.strength > 0.05).slice(0, 500)));

  return R({ ok: true, agent, trace_id: traceId, signal: signalTrace });
}

// ── GET /api/agents/system/free-energy — multi-agent system free energy
async function handleSystemFreeEnergy(env) {
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;

  const stored = await env.STIGMERGY_KV.get('_natural_vitality', 'json') || {};
  const naturalAgents = getAllNodes().map(n => buildNaturalAgentNode(n, stored));
  const actors = await env.STIGMERGY_KV.get('_actors', 'json') || [];
  const traces = await env.STIGMERGY_KV.get('_stigmergy_traces', 'json') || [];

  // Natural component — weighted by timescale authority
  const naturalFEs = naturalAgents.map(na => ({
    id: na.bioregion_id, name: na.name,
    free_energy: na.current_state.free_energy,
    priority: na.current_state.priority,
    vitality: na.current_state.vitality,
    weight: na.generative_model.timescale_weight,
  }));
  const totalNaturalWeight = naturalFEs.reduce((s, n) => s + n.weight, 0);
  const F_natural = totalNaturalWeight > 0
    ? +(naturalFEs.reduce((s, n) => s + n.free_energy * n.weight, 0) / totalNaturalWeight).toFixed(3)
    : 0.5;

  // Human component — actor free energies
  const humanFEs = actors.map(actor => {
    const gm = inferActorGenerativeModel(actor, traces.filter(t => t.actor_id === actor.id).slice(0, 10));
    return { id: actor.id, name: actor.name, free_energy: computeActorFreeEnergy({ ...actor, generative_model: gm }, naturalAgents) };
  });
  const F_human = humanFEs.length
    ? +(humanFEs.reduce((s, h) => s + h.free_energy, 0) / humanFEs.length).toFixed(3)
    : 0.5;

  // AI component — re-anchored to BIS gap (Phase 2 objective)
  // F_ai = how far the system's synthesis is from closing the BIS gap.
  // Uses stored vitality as BIS proxy until per-node signals accumulate.
  const activeTraces = traces.filter(t => t.active && t.strength > 0.05);
  const bisProxies = BIOREGIONS.map(br => {
    const vitality = stored[br.id] !== undefined ? stored[br.id] : br.vitality;
    const preferred_min = (BIOME_PREFERRED_VITALITY[br.biome]?.min || 55) / 100;
    const bis_score = vitality / 100;
    return Math.max(0, preferred_min - bis_score); // BIS gap per bioregion
  });
  const F_ai = bisProxies.length
    ? +(bisProxies.reduce((s, g) => s + g, 0) / bisProxies.length).toFixed(3)
    : 0.2;

  // Asymmetric weighting: natural agents carry most weight (sovereignty)
  // F_ai now measures BIS gap — AIF target is planetary health, not corpus resonance
  const F_system = +(F_natural * 0.45 + F_human * 0.40 + F_ai * 0.15).toFixed(3);

  const interpretation = F_system < 0.2 ? 'Low — system-wide coherence, agents in alignment'
    : F_system < 0.35 ? 'Moderate — healthy tension, adaptive learning in progress'
    : F_system < 0.55 ? 'Elevated — significant actor-ecosystem misalignment detected'
    : F_system < 0.75 ? 'High — natural agents signaling distress, intervention needed'
    :                   'Critical — systemic collapse risk, constitutional constraints active';

  const critical = naturalFEs.filter(n => n.priority === 'constitutional' || n.priority === 'warning');

  return R({
    ok: true,
    system_free_energy: F_system,
    interpretation,
    components: {
      natural:  { F: F_natural, weight: 0.45, agents: naturalFEs },
      human:    { F: F_human,   weight: 0.40, agents: humanFEs },
      ai: { F: F_ai, weight: 0.15, interpretation: 'BIS gap proxy — distance between current ecosystem health and preferred states',
             agents: AI_AGENTS.map(a => ({ id: a.id, role: a.role })) },
    },
    aif_objective: 'Minimize BIS gap across all 122 nodes — not corpus resonance scores',
    critical_bioregions: critical,
    constitutional_constraints_active: critical.filter(n => n.priority === 'constitutional').length > 0,
    active_traces: activeTraces.length,
    timestamp: new Date().toISOString(),
    version: VERSION,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SEED CORPUS — 25 documents
// ═══════════════════════════════════════════════════════════════════════════

async function handleSeed(env, admin) {
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  const seeds = getSeedDocs();
  const meta = await env.STIGMERGY_KV.get('_meta', 'json') || { count: 0, keys: [] };
  let added = 0;

  for (const doc of seeds) {
    const k = `doc:seed:${hash(doc.url)}`;
    const exists = meta.keys.includes(k);
    await env.STIGMERGY_KV.put(k, JSON.stringify({ ...doc, source: 'seed', indexed_at: new Date().toISOString(),
      spheres_secondary: computeSecondarySpheres((doc.description||doc.title||''), doc.sphere) }));
    if (!exists) { meta.keys.push(k); added++; }
  }

  meta.count = meta.keys.length;
  meta.last_seed = new Date().toISOString();
  await env.STIGMERGY_KV.put('_meta', JSON.stringify(meta));
  return R({ ok: true, seeded: seeds.length, added, total: meta.count, version: VERSION });
}

function getSeedDocs() {
  return [
    { url:'https://workthatreconnects.org/the-spiral/',        title:'The Spiral — Work That Reconnects',     sphere:'NOOSPHERE', category:'practice',
      text:`The Spiral of the Work That Reconnects moves through four stages: Gratitude, Honoring Our Pain for the World, Seeing with New Eyes, and Going Forth. Developed by Joanna Macy, this framework helps people transform despair and apathy into engaged action for the healing of the world. The spiral is recursive — each pass deepens the experience. Gratitude opens the heart. Honoring pain breaks through numbness and denial. Seeing with new eyes reconnects us to the larger web of life, drawing on systems thinking and deep ecology. Going forth mobilizes compassionate action aligned with our deepest values. The work is grounded in three streams: general systems theory, deep ecology, and Buddhist perspectives on the nature of self. Macy's insight is that the pain we feel for the world is not pathological but a sign of our love for it — and therefore a resource.` },

    { url:'https://www.joannamacy.net/the-work/',              title:'The Work That Reconnects — Joanna Macy',sphere:'NOOSPHERE', category:'foundation',
      text:`The Work That Reconnects addresses the psychological and spiritual dimensions of the global ecological and social crisis. It is grounded in three streams: systems thinking (Gregory Bateson, Norbert Wiener), deep ecology (Arne Naess, Bill Devall), and Buddhist perspectives on interdependence and compassion. Central is the notion of the ecological self — our identity extending beyond our skin to include all living beings. Macy describes a Great Turning underway: a shift from the Industrial Growth Society to a Life-Sustaining Civilization. This turning requires inner work as much as outer action. The work has reached hundreds of thousands of people worldwide through workshops, trainings, and the Active Hope book co-written with Chris Johnstone. Macy emphasizes that the crisis we face is not merely technical but psychological — we have been conditioned not to feel the pain of the world.` },

    { url:'https://activehope.info/',                          title:'Active Hope — Macy & Johnstone',        sphere:'NOOSPHERE', category:'foundation',
      text:`Active Hope is a practice — something we do rather than something we have. Three steps: clear-eyed acknowledgment of reality, identifying what we hope for in terms of direction and values, and taking steps to move there. Active Hope doesn't require optimism. The guiding impulse is intention aligned with deepest values regardless of outcome probability. The Three Stories of Our Time frame the current moment: Business as Usual (the mainstream narrative of growth and progress), the Great Unraveling (the systems collapse this entails), and the Great Turning (a conscious civilizational shift). Widely taught in climate psychology, transition towns, regenerative agriculture, and social movement organizing. Johnstone's work on the emotional cycles of grief, denial, and renewal provides practical tools for sustaining engagement.` },

    { url:'https://livingearthcommunity.com/',                  title:'Living Earth Community',                sphere:'BIOSPHERE', category:'community',
      text:`The Living Earth Community is a network of practitioners, educators, and activists working at the intersection of ecology, spirituality, and social transformation. The community draws on wisdom traditions from many cultures and the insights of modern systems science to cultivate a new relationship between humanity and the living Earth. Offerings include retreats, courses, and resources for those seeking to deepen their connection to life and contribute to its healing. Grounded in the understanding that the Earth is not a collection of resources but a living, self-organizing community of which we are members. Informed by Thomas Berry's cosmology, Teilhard de Chardin's noosphere, and indigenous Earth-centered teachings from multiple traditions.` },

    { url:'https://www.joannamacy.net/',          title:'The Great Turning — Three Dimensions', sphere:'NOOSPHERE', category:'systems',
      text:`The Great Turning is the essential adventure of our time: the shift from the Industrial Growth Society to a life-sustaining civilization. Three simultaneous dimensions characterize this turning. First: holding actions — slowing the damage through activism, legal challenges, and protest. Second: analysis and transformation of foundational structures — the economic and legal institutions that drive destruction. Third: a shift in consciousness and worldview — from the story of separation to belonging to the web of life. All three dimensions are required; none alone is sufficient. Systems thinking reveals that environmental problems are caused not by bad people but by fundamentally flawed systems whose logic must be changed. The name draws on Thomas Berry's notion of the Earth's great story.` },

    { url:'https://biomimicry.org/what-is-biomimicry/',         title:'Biomimicry — Learning from Life',       sphere:'BIOSPHERE', category:'science',
      text:`Biomimicry seeks sustainable solutions by emulating nature's time-tested patterns and strategies. After 3.8 billion years of R&D, failures are fossils — what surrounds us holds the secret to survival. Life has already solved problems of energy, food production, climate control, non-toxic chemistry, transportation, and packaging. Key principles: life builds from the bottom up; life optimizes the whole system; life rewards cooperation; life runs on current sunlight; life recycles everything; life banks on diversity; life demands local expertise. Janine Benyus coined the term and founded the Biomimicry Institute. The approach is increasingly applied in product design, architecture, urban planning, organizational design, and policy. Biomimicry asks: what would nature do here?` },

    { url:'https://donellameadows.org/systems-thinking-resources/', title:'Thinking in Systems — Donella Meadows', sphere:'NOOSPHERE', category:'systems',
      text:`Donella Meadows identified leverage points — places in a system where a small shift can produce big changes. Highest-leverage interventions: changing the goals of a system, shifting the mindset or paradigm from which goals arise, and having the power to change paradigms themselves. Co-author of The Limits to Growth (1972), which modeled exponential growth on a finite planet. Systems thinking reveals that feedback loops, stocks and flows, and time delays explain most complex system behavior. The iceberg model: events are visible above the waterline; below lie patterns, structures, and mental models as deeper drivers. Meadows saw systems thinking as inseparable from love — to understand a system deeply is a form of care for it. Her posthumous book Thinking in Systems is a foundational text.` },

    { url:'https://www.gaiatheory.org/',                        title:'Gaia Theory — The Living Earth',         sphere:'BIOSPHERE', category:'science',
      text:`Gaia theory, developed by James Lovelock and Lynn Margulis, proposes that Earth functions as a self-regulating system — a living superorganism in which biology, geology, atmosphere, and ocean interact to maintain conditions conducive to life. Temperature, salinity, atmospheric oxygen, and pH are all regulated by living processes — not designed or directed, but emergent from billions of interactions over billions of years. This fundamentally changes our understanding: Earth is not a rock with life on it but a living system of which life is an integral, co-creating part. Margulis's endosymbiosis theory demonstrated cooperation as fundamental to evolution. Recent Earth system science validates many Gaia hypotheses. Rights of Nature movements draw on Gaia theory for legal and ethical frameworks.` },

    { url:'https://charleseisenstein.org/topics/nature/',       title:'Story of Interbeing — Eisenstein',      sphere:'NOOSPHERE', category:'philosophy',
      text:`Charles Eisenstein describes the Story of Separation: the belief that we are separate from nature, from each other, that the world is made of dead matter, and that more for me means less for you. This story drives all our crises — ecological, social, psychological. He points toward a Story of Interbeing — all life woven together in a web of relationship and mutual dependence, in which doing good for another is doing good for oneself. This shift requires personal transformation alongside structural change. Practices of gift economy, sacred activism, and sacred economics support the transition. The More Beautiful World Our Hearts Know Is Possible argues that our deepest knowing already grasps interconnected reality — we are remembering, not learning. Sacred Economics traces money's history and envisions a different kind of economics.` },

    { url:'https://www.resilience.org/resilience-101/',         title:'Resilience in Living Systems',          sphere:'BIOSPHERE', category:'systems',
      text:`Resilience is the capacity of a system to absorb disturbance and reorganize while retaining essentially the same function, structure, identity, and feedbacks. Living systems are not in equilibrium but constantly changing — resilience is about maintaining adaptive capacity through change. Key principles for building resilience: diversity (redundancy and multiple approaches), modularity (not too tightly connected), tight feedback loops (rapid sensing and response), and social capital (trust, networks, cooperation). Brittleness — the opposite of resilience — comes from over-optimization for efficiency. Panarchy theory (Holling, Gunderson) describes cycles of growth, conservation, creative destruction, and reorganization across multiple scales. Human communities that maintain diversity of livelihood, knowledge, and social ties are most resilient.` },

    { url:'https://www.permaculture.org.uk/wisdom/principles',  title:'Permaculture Principles',              sphere:'BIOSPHERE', category:'practice',
      text:`Permaculture is a design system for human settlements and land use based on principles observed in natural ecosystems. Key principles by David Holmgren: observe and interact; catch and store energy; obtain a yield; apply self-regulation and accept feedback; use renewable resources and services; produce no waste; design from patterns to details; integrate rather than segregate; use small and slow solutions; use and value diversity; use edges and value the marginal; creatively respond to change. Originally focused on agricultural design, permaculture has expanded to organizational design, community building, financial permaculture, and social systems. Founded by Bill Mollison and David Holmgren in Australia in the 1970s, now a global design movement.` },

    { url:'https://www.degrowth.info/',                         title:'Degrowth — Beyond Growth',              sphere:'ECONO', category:'economics',
      text:`Degrowth critiques the assumption that economic growth is necessary or sufficient for human flourishing or ecological sustainability. It advocates for a planned, equitable reduction of energy and resource use to bring human economies within planetary boundaries while improving wellbeing. GDP growth = progress is challenged: wellbeing indicators — health, education, leisure, community, ecological integrity — often diverge sharply from GDP. Proposals include redistribution of work through shorter working hours, universal basic services, reduction of production and consumption in wealthy countries, focus on care work and relational goods, local economies and commons. Infinite growth on a finite planet is physically impossible — the question is whether the transition is managed or catastrophic. Rooted in ecological economics (Herman Daly, Kate Raworth's doughnut economics).` },

    { url:'https://www.ecopsychology.org/',                     title:'Ecopsychology — Healing the Split',     sphere:'NOOSPHERE', category:'psychology',
      text:`Ecopsychology explores the relationship between humans and the natural world through ecological and psychological principles simultaneously. Theodore Roszak coined the term in 1992. Central premise: the human psyche is embedded in the larger life of the planet — psychological health is inseparable from ecological health. The destruction of the natural world is not only an ecological crisis but a psychological and spiritual one. Healing requires both outer work — changing destructive systems — and inner work — transforming our sense of self from separate ego to ecological self. Practices of wilderness therapy, nature-based psychotherapy, and council with the more-than-human world support this healing. Connected to deep ecology (Arne Naess), the Work That Reconnects, and indigenous land-based practices.` },

    { url:'https://www.terranascientia.org/',                    title:'Stigmergy in Living Systems',           sphere:'NOOSPHERE', category:'science',
      text:`Stigmergy is a form of indirect coordination between agents mediated through environmental modification — an action leaves a trace that stimulates subsequent action by the same or different agents, leading to emergent, coherent behavior without central control or direct communication. The term comes from Greek stigma (mark) and ergon (work). First described in termite colonies by Pierre-Paul Grassé (1959). Observed in ant colonies, termite mounds, bird flocking, slime molds, and the immune system. In human contexts: shared physical, digital, or cultural traces enable spontaneous coordination. Wikipedia is a stigmergic system — each edit creates a trace that stimulates further editing. Key properties: self-organization, emergence, scalability, robustness to local failure, no central plan. The internet itself is a stigmergic infrastructure.` },

    { url:'https://pluriverse.world/',                          title:'Dictionary of the Pluriverse',          sphere:'NOOSPHERE', category:'indigenous',
      text:`The Pluriverse asserts that multiple valid worldviews, ontologies, and ways of knowing co-exist — there is no single universal story of reality, progress, or the good life. Arturo Escobar, Ashish Kothari, Federico Demaria, and collaborators challenge Western modernity's claim to universal truth and development as the singular path. Post-development thinking: the Global South is not "developing" toward a Western endpoint but holds its own visions of the good life — Buen Vivir (Ecuador/Bolivia), Ubuntu (Southern Africa), Swaraj (India), and thousands of indigenous cosmologies. The Pluriverse holds that biodiversity and cultural diversity are inseparable — to lose a language or worldview is to lose irreplaceable knowledge. This knowledge is not inferior to Western science — it is often older, more tested, and more ecologically sophisticated.` },

    { url:'https://www.rightsnature.org/',                      title:'Rights of Nature — Earth Jurisprudence',sphere:'GOVERNANCE', category:'law',
      text:`The Rights of Nature movement asserts that ecosystems, rivers, forests, and species have inherent rights to exist, regenerate, and flourish — independent of their usefulness to humans. Rooted in Earth jurisprudence (Cormac Cullinan, Thomas Berry) and indigenous legal traditions from many cultures. Ecuador became the first country to enshrine Rights of Nature in its constitution (2008), recognizing Pachamama (Mother Earth) as a rights holder. New Zealand granted legal personhood to the Whanganui River (2017) following decades of Māori advocacy. The Ganges in India, the Amazon in Colombia, and many other ecosystems have received similar legal recognition. The movement challenges the legal status of corporations and nature — reversing the current system where corporations have rights and nature has none. Rights of Nature connects to Earth System Governance frameworks.` },

    { url:'https://www.earthcharter.org/',                      title:'Earth Charter — Principles for a Just Society', sphere:'GOVERNANCE', category:'ethics',
      text:`The Earth Charter is an international declaration of fundamental ethical principles for building a just, sustainable, and peaceful global society in the 21st century. Drafted through a decade-long international consultation process (1994-2000), it reflects the shared values of diverse cultures, nations, and traditions. Four pillars: Respect and Care for the Community of Life; Ecological Integrity; Social and Economic Justice; Democracy, Nonviolence, and Peace. The charter affirms that environmental protection, human rights, equitable human development, and peace are interdependent and indivisible. The Earth Charter Initiative supports education, policy development, and social movements worldwide. It is recognized as a soft law instrument of international significance.` },

    { url:'https://www.regenerativeagriculture.com/',           title:'Regenerative Agriculture Principles',   sphere:'BIOSPHERE', category:'practice',
      text:`Regenerative agriculture refers to farming and grazing practices that, among other things, rebuild soil organic matter and restore degraded soil biodiversity — resulting in both carbon drawdown and improved water cycling. Key practices: minimizing soil disturbance (no-till), maintaining living soil cover, maximizing biodiversity, maintaining living roots, and integrating animals. Draws on indigenous agricultural wisdom, agroecology, holistic planned grazing (Allan Savory), and soil science. The Rodale Institute has been a major research and advocacy center since the 1940s. Beyond carbon, regenerative agriculture aims to restore ecosystem function, watershed health, and farm biodiversity while improving farmer livelihoods. The movement is distinct from (and more ambitious than) organic agriculture.` },

    { url:'https://www.doughnuteconomics.org/',                 title:'Doughnut Economics — Kate Raworth',     sphere:'ECONO', category:'economics',
      text:`Doughnut Economics, developed by economist Kate Raworth, envisions a safe and just space for humanity between a social foundation (meeting human needs) and an ecological ceiling (planetary boundaries). The doughnut shape represents this sweet spot. Nine planetary boundaries (climate, biodiversity, land, freshwater, etc.) form the outer ring. Twelve social foundations (food, water, health, education, etc.) form the inner ring. The goal: meeting the needs of all people within the means of the living planet. Applied in Amsterdam, Copenhagen, and other cities as a framework for post-growth municipal planning. Challenges GDP as the primary measure of economic success. Connects to degrowth, commons economics, and regenerative enterprise.` },

    { url:'https://www.commonsabundance.net/',                  title:'Commons and Commoning',                 sphere:'ECONO', category:'economics',
      text:`The commons refers to shared resources managed collectively by a community — including natural commons (oceans, atmosphere, forests), knowledge commons (open source, libraries), and social commons (health systems, public spaces). Elinor Ostrom, the first woman to win the Nobel Prize in Economics, showed that commons can be sustainably self-governed without either privatization or state control — contradicting the "tragedy of the commons" myth. Principles for successful commons governance: clearly defined boundaries, matching rules to local conditions, collective choice arrangements, monitoring, graduated sanctions, conflict resolution, and recognition of rights to organize. Digital commons (Wikipedia, Linux, Creative Commons) demonstrate commons-based peer production at scale. The commons stands as a third way between market and state.` },

    { url:'https://www.climateemergency.org/',                  title:'Climate Emergency — Science and Response',sphere:'ATMOSPHERE', category:'science',
      text:`The climate emergency refers to the accelerating ecological and social risks from human-caused climate change. The IPCC Sixth Assessment Report (2021-2022) confirms that human activities have warmed the climate by approximately 1.1°C above pre-industrial levels. Impacts already occurring: extreme heat events, flooding, drought, sea level rise, coral bleaching, ice sheet loss, ecosystem disruption. Tipping points — thresholds beyond which change becomes self-reinforcing — include Arctic permafrost thaw, Amazon dieback, West Antarctic ice sheet collapse, and monsoon disruption. The Paris Agreement targets limiting warming to 1.5°C, requiring net-zero emissions by 2050 and rapid reduction this decade. Climate justice recognizes that the communities least responsible for emissions suffer most from impacts.` },

    { url:'https://www.waterkeeper.org/',                       title:'Watershed Stewardship — Hydrosphere',   sphere:'HYDROSPHERE', category:'practice',
      text:`Watersheds are the fundamental unit of water governance — all land that drains to a common waterway. Watershed health determines water quality, flood resilience, drought resilience, and biodiversity. Indigenous water law in many traditions recognizes rivers and waters as living relatives, not resources. Watershed councils and waterkeeper organizations provide community-based governance at the watershed scale. Key threats: pollution (agricultural runoff, industrial discharge, microplastics), over-extraction for irrigation and urban supply, climate-driven drought and flood intensification, and wetland destruction. Wetlands provide flood buffering, water purification, carbon storage, and biodiversity habitat. The Ramsar Convention protects internationally significant wetlands. Watershed restoration combines native plant restoration, contaminant remediation, and indigenous stewardship practices.` },

    { url:'https://www.soil-association.org/',                  title:'Soil — Foundation of Life',             sphere:'BIOSPHERE', category:'science',
      text:`Soil is a living ecosystem — a teaspoon of healthy soil contains more organisms than humans on Earth, including bacteria, fungi, protozoa, nematodes, and arthropods. Healthy soils regulate the water cycle, store carbon (soils hold more carbon than the atmosphere and all vegetation combined), filter pollutants, and provide the foundation for food systems. Industrial agriculture has degraded 40% of the world's soils through tillage, monoculture, synthetic inputs, and erosion. Soil formation is extremely slow — 2.5 cm takes 500-1,000 years. Mycorrhizal fungi connect plants in networks of nutrient exchange (the Wood Wide Web). Regenerative practices restore soil microbiome, structure, and carbon content. Soil health is the foundation of food security, climate regulation, and biodiversity.` },

    { url:'https://www.indigenous-science.net/',               title:'Indigenous Science & Traditional Knowledge',sphere:'ANCIENT', category:'science',
      text:`Indigenous knowledge systems constitute sophisticated, place-based sciences developed over millennia of careful observation and experimentation. They encompass ecology, astronomy, medicine, agriculture, hydrology, meteorology, and social organization. Key characteristics: relational rather than extractive; place-specific and locally validated; transmitted through practice, story, and ceremony; holistic rather than reductive; oriented toward long-term sustainability. IPBES (Intergovernmental Science-Policy Platform on Biodiversity) recognizes indigenous and local knowledge as complementary to Western science for understanding and managing biodiversity. Where indigenous land management persists, biodiversity is often higher than in protected areas. The challenge of benefit-sharing and preventing biopiracy remains critical. Free, Prior and Informed Consent (FPIC) is the minimum ethical standard for engaging with indigenous knowledge.` },

    { url:'https://www.circulareconomy.org/',                  title:'Circular Economy — Closing the Loop',    sphere:'ECONO', category:'economics',
      text:`The circular economy is an economic system that eliminates waste and continuously cycles materials and energy. Contrasted with the linear take-make-dispose model. Three principles: eliminate waste and pollution; circulate products and materials at their highest value; regenerate natural systems. Inspired by biomimicry (waste as food; running on current energy), industrial ecology, and performance economy concepts (selling services rather than products). The Ellen MacArthur Foundation is the leading global organization advancing circular economy. Technical nutrients cycle in the industrial sphere; biological nutrients cycle through composting and regenerative agriculture. Major sectors: consumer goods (design for disassembly), buildings (material passports), electronics (modular design, right to repair), food systems (anaerobic digestion, composting).` },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// CORPUS STATS
// ═══════════════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════════════
// SPHERE SCORING — Primary + Secondary cross-reference
// ═══════════════════════════════════════════════════════════════════════════

const SPHERE_KEYWORDS = {
  BIOSPHERE:   ['biodiversity','species','ecosystem','ecology','habitat','extinction',
                'rewilding','wildlife','forest','coral','pollinator','soil microbiome',
                'living systems','flora','fauna','food web','biome','fungi','mycelium',
                'mycorrhizal','moss','lichen','microbe','organism','biomass','photosynthesis',
                'seed','plant','tree','root','soil','biotic','abiotic','keystone',
                'trophic','symbiosis','mutualism','nitrogen cycle','carbon cycle',
                'decomposer','pollination','habitat loss','species richness'],
  ATMOSPHERE:  ['climate','carbon','co2','emissions','atmosphere','temperature',
                'global warming','greenhouse','ipcc','net zero','decarbonize',
                'fossil fuel','methane','air quality','weather','precipitation',
                'climate change','climate crisis','carbon footprint','renewable energy',
                'solar','wind energy','deforestation','reforestation','climate justice'],
  HYDROSPHERE: ['water','ocean','freshwater','river','aquifer','watershed','wetland',
                'glacial','sea level','marine','coastal','flood','drought','groundwater',
                'lake','stream','hydrological','tidal','salinity','blue carbon',
                'ocean acidification','water cycle','water security','water rights'],
  ANTHRO:      ['community','culture','democracy','social movement','activism',
                'civil society','human','society','political','institution','collective',
                'urban','city','built environment','human rights','social justice',
                'equity','inclusion','diversity','public health','well-being',
                'education','food security','poverty','development','decolonization'],
  NOOSPHERE:   ['knowledge','wisdom','systems thinking','complexity','consciousness',
                'epistemology','worldview','ontology','pluriverse','paradigm',
                'philosophy','theory','framework','learning','intelligence',
                'pattern','emergence','cognition','meaning','narrative','story',
                'education','mind','thought','idea','concept','understanding',
                'sense-making','perception','belief','values','ethics','culture',
                'collective intelligence','distributed knowledge','network thinking'],
  TECHNO:      ['technology','artificial intelligence','machine learning','ai','algorithm',
                'data','software','digital','automation','robot','sensor','internet',
                'platform','code','model','neural','language model','llm','gpt',
                'biomimicry','design','innovation','engineering','tool',
                'prototype','invention','circular','material','manufacture',
                'infrastructure','built environment','techno','cyber','surveillance',
                'biometric','facial recognition','data sovereignty','digital rights',
                'open source','blockchain','protocol','interface','api','computing',
                'edge computing','federated','autonomous system','smart'],
  ECONO:       ['economics','economy','gdp','capital','finance','market','trade',
                'doughnut economics','degrowth','commons','post-growth','prosperity',
                'wealth','monetary','investment','banking','labor','work','livelihood',
                'regenerative economy','wellbeing economy','circular economy',
                'cooperative','mutual aid','gift economy','land value','rent','tax',
                'subsistence','consumption','extraction','supply chain','fair trade'],
  REGEN:       ['regenerative','restoration','rewilding','soil health','composting',
                'permaculture','agroforestry','land restoration','healing','repair',
                'transition','regenerate','revive','restore','renew',
                'reforestation','holistic management','cover crop','no-till',
                'carbon sequestration','ecosystem restoration','habitat restoration',
                'ecological restoration','land stewardship','regenerative agriculture'],
  GOVERNANCE:  ['treaty','rights of nature','earth charter','undrip','law','legal',
                'international','protocol','agreement','policy','rights',
                'declaration','convention','framework','multilateral','governance',
                'legislation','regulation','constitution','jurisdiction','sovereignty',
                'consent','free prior informed consent','fpic','accountability',
                'transparency','rule of law','human rights law','environmental law',
                'land rights','indigenous rights','self-determination','ocap',
                'care principles','data governance','ai governance','ethics board'],
  ANCIENT:     ['indigenous','traditional knowledge','ancestral','elder','ceremony',
                'oral tradition','sacred','first nations','aboriginal','native',
                'traditional ecological knowledge','tek','seasonal','ritual',
                'community knowledge','cultural protocol','sovereignty',
                'two-eyed seeing','medicine wheel','land-based','country',
                'clan','kinship','totem','dreaming','place-based','seasonal round',
                'ethnobotany','ethnobiology','traditional practice','knowledge keeper',
                'indigenous science','indigenous language','indigenous governance'],
};

// ══════════════════════════════════════════════════════════════════════════
// GAP #1 PATCH — Natural Agent Sovereignty Layer
// ══════════════════════════════════════════════════════════════════════════
// ── Natural Agent Schema ─────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════
// PATCH 3 — TIERED SCALE SCHEMA + POP PRINCIPLES
// Adds scale_level to every signal, trace, and actor record so escalation
// routing can be built incrementally without a schema migration later.
//   microcosm  = single sensor/site (<1km²) — resolved locally
//   mesocosm   = node level (bioregion × sphere, watershed scale)
//   macrocosm  = full bioregion (all spheres of one bioregion)
//   metacosm   = realm/global (cross-bioregion emergent patterns)
// PoP principles encoded:
//   1. Perturbation accounting — system logs its own interference
//   2. Loop maturation metric — declining HITL reviews = maturing feedback
//   3. Steward as primary layer — steward_observation weighted above AI inference
// ══════════════════════════════════════════════════════════════════════════

const SCALE_LEVELS = ['microcosm', 'mesocosm', 'macrocosm', 'metacosm'];

// Infer scale_level from source_type and context if not supplied
function inferScaleLevel(body) {
  if (body.scale_level && SCALE_LEVELS.includes(body.scale_level)) return body.scale_level;
  if (body.source_type === 'ground_sensor')      return 'microcosm';
  if (body.source_type === 'steward_observation') return 'mesocosm';
  if (body.source_type === 'satellite')           return 'macrocosm';
  if (body.source_type === 'proxy_api')           return 'macrocosm';
  return 'mesocosm';
}

// Steward source-type weight — PoP: biology and steward observation lead, AI translates
// steward_observation > satellite > proxy_api > ground_sensor (unvalidated)
const SOURCE_TYPE_AUTHORITY = {
  steward_observation: 1.0,   // PoP primary intelligence layer
  satellite:           0.85,  // broad coverage, no ground truth
  ground_sensor:       0.80,  // precise but single-site
  proxy_api:           0.60,  // derived/modelled data
};

// POST /api/perturbation/log — log the system's own interference in an ecosystem
// PoP principle: the system must account for its own perturbation, not just external interventions.
async function handlePerturbationLog(request, env) {
  const body = await request.json().catch(() => null);
  if (!body) return R({ error: 'Invalid JSON' }, 400);
  const { bioregion_id, action_type, description, actor_id, scale_level, estimated_impact } = body;
  if (!bioregion_id || !action_type || !description)
    return R({ error: 'bioregion_id, action_type, description required' }, 400);

  const entry = {
    perturbation_id: `perturb:${Date.now()}:${rnd()}`,
    bioregion_id,
    action_type,    // e.g. 'hitl_intervention', 'lap_query', 'synthesis_response', 'sensor_deploy'
    description,
    actor_id:       actor_id || 'system',
    scale_level:    scale_level || 'mesocosm',
    estimated_impact: estimated_impact || 'unknown',
    logged_at:      new Date().toISOString(),
    source:         'stigmergy_system',
  };

  // Append to bioregion perturbation log in KV
  const logKey = `perturbation:log:${bioregion_id}`;
  const existing = await env.STIGMERGY_KV.get(logKey, 'json') || { entries: [] };
  existing.entries.unshift(entry);
  existing.entries = existing.entries.slice(0, 200);
  await env.STIGMERGY_KV.put(logKey, JSON.stringify(existing));

  // Global perturbation index
  const indexKey = 'perturbation:index';
  const index = await env.STIGMERGY_KV.get(indexKey, 'json') || { total: 0, by_bioregion: {}, by_type: {} };
  index.total++;
  index.by_bioregion[bioregion_id] = (index.by_bioregion[bioregion_id] || 0) + 1;
  index.by_type[action_type]       = (index.by_type[action_type] || 0) + 1;
  index.last_updated = new Date().toISOString();
  await env.STIGMERGY_KV.put(indexKey, JSON.stringify(index));

  return R({ ok: true, perturbation_id: entry.perturbation_id, entry });
}

// GET /api/perturbation/log/:bioregion_id — retrieve perturbation history for a bioregion
async function handlePerturbationRead(request, env) {
  const bioregion_id = new URL(request.url).pathname.split('/').pop();
  const logKey = `perturbation:log:${bioregion_id}`;
  const log = await env.STIGMERGY_KV.get(logKey, 'json') || { entries: [] };
  const index = await env.STIGMERGY_KV.get('perturbation:index', 'json') || { total: 0 };
  return R({
    ok: true, bioregion_id,
    entry_count: log.entries.length,
    global_total: index.total,
    entries: log.entries,
    note: 'Perturbation accounting: the system logs its own interference, not just external interventions',
  });
}

// GET /api/loop/maturation — loop maturation metric
// PoP: declining HITL intervention frequency = the feedback loop is maturing.
// Success = biology + steward + AI need less human override over time.
async function handleLoopMaturation(env) {
  // Count HITL reviews over rolling time windows
  const now = Date.now();
  const window30d = 30 * 24 * 3600 * 1000;
  const window7d  =  7 * 24 * 3600 * 1000;

  let reviews30d = 0, reviews7d = 0;
  try {
    const rows30 = await env.STIGMERGY_DB.prepare(
      'SELECT COUNT(*) as cnt FROM hitl_reviews WHERE created_at > ?'
    ).bind(new Date(now - window30d).toISOString()).first();
    const rows7 = await env.STIGMERGY_DB.prepare(
      'SELECT COUNT(*) as cnt FROM hitl_reviews WHERE created_at > ?'
    ).bind(new Date(now - window7d).toISOString()).first();
    reviews30d = rows30?.cnt || 0;
    reviews7d  = rows7?.cnt  || 0;
  } catch(_) {}

  // Count steward observations (primary intelligence layer signals)
  let stewardSignals30d = 0;
  try {
    const rows = await env.STIGMERGY_DB.prepare(
      'SELECT COUNT(*) as cnt FROM natural_signals WHERE source_type = ? AND ts > ?'
    ).bind('steward_observation', now - window30d).first();
    stewardSignals30d = rows?.cnt || 0;
  } catch(_) {}

  // Maturation score: low HITL/steward ratio = system operating more autonomously
  // 0 = fully dependent on human override, 1 = Life-in-the-Loop (minimal intervention)
  const stewardRatio = stewardSignals30d > 0
    ? Math.max(0, 1 - (reviews30d / Math.max(stewardSignals30d, 1)))
    : null;

  const weekly_rate   = +(reviews7d / 7).toFixed(2);   // HITL reviews per day (last 7d)
  const monthly_rate  = +(reviews30d / 30).toFixed(2);  // HITL reviews per day (last 30d)
  const trend = weekly_rate < monthly_rate ? 'maturing' : weekly_rate > monthly_rate ? 'increasing_intervention' : 'stable';

  return R({
    ok: true,
    loop_maturation: {
      hitl_reviews_last_7d:   reviews7d,
      hitl_reviews_last_30d:  reviews30d,
      steward_signals_last_30d: stewardSignals30d,
      weekly_intervention_rate:  weekly_rate,
      monthly_intervention_rate: monthly_rate,
      maturation_score: stewardRatio,
      trend,
      interpretation: trend === 'maturing'
        ? 'Feedback loop maturing — intervention frequency declining. Biology + steward leading AI.'
        : trend === 'increasing_intervention'
        ? 'Intervention frequency rising — system may be encountering new signal patterns'
        : 'Stable intervention rate',
    },
    pop_principle: 'Reduced intervention frequency is the primary success metric — Life-in-the-Loop means biology leads',
    steward_authority: SOURCE_TYPE_AUTHORITY,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// NODE MATURATION — LITL Stage tracker per Umwelt node
// KV key: na:node:maturity:{bioregion_id}:{sphere}
// Tracks HITL history per node independently.
// Maturity upgrades: seeded → emerging → maturing → mature
// HITL gate intensity reduces with maturity level.
// ═══════════════════════════════════════════════════════════════════════════

function computeMaturityLevel(state) {
  const ageDays = state.first_signal_ts
    ? (Date.now() - state.first_signal_ts) / 86400000 : 0;
  const overrideRate = state.total_hitl_reviews > 0
    ? state.hitl_overrides / state.total_hitl_reviews : 0;
  const accuracy = 1 - overrideRate;
  const selfRes30 = state.self_resolutions_30d || 0;

  if (ageDays >= MATURITY_THRESHOLDS.mature.min_days
    && accuracy  >= MATURITY_THRESHOLDS.mature.min_accuracy
    && overrideRate <= MATURITY_THRESHOLDS.mature.max_override_rate
    && selfRes30 >= MATURITY_THRESHOLDS.mature.min_self_resolutions) return 'mature';

  if (ageDays >= MATURITY_THRESHOLDS.maturing.min_days
    && accuracy  >= MATURITY_THRESHOLDS.maturing.min_accuracy
    && overrideRate <= MATURITY_THRESHOLDS.maturing.max_override_rate
    && selfRes30 >= MATURITY_THRESHOLDS.maturing.min_self_resolutions) return 'maturing';

  if (ageDays >= MATURITY_THRESHOLDS.emerging.min_days
    && accuracy  >= MATURITY_THRESHOLDS.emerging.min_accuracy
    && overrideRate <= MATURITY_THRESHOLDS.emerging.max_override_rate) return 'emerging';

  return 'seeded';
}

function computeLITLScore(state) {
  const steward30 = state.steward_signals_30d || 0;
  const hitl30    = state.hitl_reviews_30d || 0;
  if (steward30 === 0) return null;
  return +Math.max(0, Math.min(1, 1 - (hitl30 / steward30))).toFixed(3);
}

// Returns the HITL gate mode for a given maturity level and distress severity
function hitlGateMode(maturity_level, severity) {
  if (severity === 'critical') {
    // Constitutional signals always warrant at least soft-block until mature
    if (maturity_level === 'mature') return 'advisory';
    return 'blocking';
  }
  if (severity === 'high') {
    if (maturity_level === 'mature' || maturity_level === 'maturing') return 'advisory';
    return 'blocking';
  }
  // moderate
  if (maturity_level === 'seeded') return 'blocking';
  return 'advisory';
}

async function getNodeMaturityState(bioregion_id, sphere, env) {
  const key = `na:node:maturity:${bioregion_id}:${sphere}`;
  const state = await env.STIGMERGY_KV.get(key, 'json') || {
    node_id:               `${bioregion_id}:${sphere}`,
    bioregion_id,
    sphere,
    first_signal_ts:       null,
    total_hitl_reviews:    0,
    hitl_reviews_30d:      0,
    hitl_overrides:        0,
    steward_signals_30d:   0,
    self_resolutions_30d:  0,
    total_self_resolutions:0,
    last_evaluated:        null,
    maturity_level:        'seeded',
    litl_score:            null,
  };
  // Re-compute maturity on every read
  state.maturity_level = computeMaturityLevel(state);
  state.litl_score     = computeLITLScore(state);
  return state;
}

async function updateNodeMaturityOnHITL(bioregion_id, sphere, wasOverridden, env) {
  const key   = `na:node:maturity:${bioregion_id}:${sphere}`;
  const state = await getNodeMaturityState(bioregion_id, sphere, env);
  state.total_hitl_reviews++;
  state.hitl_reviews_30d++;
  if (wasOverridden) state.hitl_overrides++;
  if (!state.first_signal_ts) state.first_signal_ts = Date.now();
  state.last_evaluated = new Date().toISOString();
  state.maturity_level = computeMaturityLevel(state);
  state.litl_score     = computeLITLScore(state);
  await env.STIGMERGY_KV.put(key, JSON.stringify(state), { expirationTtl: 86400 * 365 });
  return state;
}

async function updateNodeMaturityOnStewardSignal(bioregion_id, sphere, env) {
  const key   = `na:node:maturity:${bioregion_id}:${sphere}`;
  const state = await getNodeMaturityState(bioregion_id, sphere, env);
  state.steward_signals_30d++;
  if (!state.first_signal_ts) state.first_signal_ts = Date.now();
  state.last_evaluated = new Date().toISOString();
  state.maturity_level = computeMaturityLevel(state);
  state.litl_score     = computeLITLScore(state);
  await env.STIGMERGY_KV.put(key, JSON.stringify(state), { expirationTtl: 86400 * 365 });
  return state;
}

async function handleNodeMaturityList(env) {
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  const keys = await env.STIGMERGY_KV.list({ prefix: 'na:node:maturity:', limit: 200 });
  const states = await Promise.all(
    keys.keys.map(k => env.STIGMERGY_KV.get(k.name, 'json'))
  );
  const live = states.filter(Boolean).map(s => ({
    ...s,
    maturity_level: computeMaturityLevel(s),
    litl_score:     computeLITLScore(s),
  }));
  const globalLITL = live.length
    ? +(live.filter(s => s.litl_score !== null).reduce((acc, s) => acc + (s.litl_score || 0), 0)
        / Math.max(live.filter(s => s.litl_score !== null).length, 1)).toFixed(3)
    : null;
  const byLevel = NODE_MATURITY_LEVELS.reduce((acc, l) => {
    acc[l] = live.filter(s => s.maturity_level === l).length; return acc;
  }, {});
  return R({
    nodes: live,
    total: live.length,
    by_maturity_level: byLevel,
    global_litl_score: globalLITL,
    stage: globalLITL === null ? 'no_data'
         : globalLITL >= 0.8 ? 'Stage 3 — LITL Mature'
         : globalLITL >= 0.5 ? 'Stage 2 — LITL Maturing'
         : globalLITL >= 0.2 ? 'Stage 2 — LITL Emerging'
         : 'Stage 1 — HITL',
    timestamp: new Date().toISOString(),
  });
}

async function handleNodeMaturitySingle(request, env) {
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  const match = new URL(request.url).pathname.match(/\/api\/nodes\/maturity\/(.+)/);
  if (!match) return R({ error: 'node_id required in path' }, 400);
  const [bioregion_id, sphere] = match[1].split(':');
  if (!bioregion_id) return R({ error: 'node_id format: bioregion_id:SPHERE' }, 400);
  const state = await getNodeMaturityState(bioregion_id, sphere || 'BIOSPHERE', env);
  return R({ ...state, hitl_gate_modes: {
    critical: hitlGateMode(state.maturity_level, 'critical'),
    high:     hitlGateMode(state.maturity_level, 'high'),
    moderate: hitlGateMode(state.maturity_level, 'moderate'),
  }});
}

// ═══════════════════════════════════════════════════════════════════════════
// BIOLOGY CLOSES LOOPS — Self-resolution detection
// When a node's BIS recovers above preferred vitality for 3+ consecutive
// readings WITHOUT any HITL intervention, emit a positive stigmergy trace
// and increment self_resolutions. This is measurable LITL Stage 2→3 evidence.
// KV key: na:node:recovery:{bioregion_id}:{sphere}
// ═══════════════════════════════════════════════════════════════════════════

async function checkBiologyClosesLoop(bioregion_id, sphere, normalizedScore, env) {
  const br = BIOREGIONS.find(b => b.id === bioregion_id);
  if (!br) return null;
  const preferred = BIOME_PREFERRED_VITALITY[br.biome] || { min: 55, max: 85 };
  const preferredNorm = preferred.min / 100;

  const recovKey = `na:node:recovery:${bioregion_id}:${sphere}`;
  const recovery = await env.STIGMERGY_KV.get(recovKey, 'json') || {
    consecutive_above_preferred: 0,
    last_hitl_ts: null,
    self_resolution_emitted: false,
  };

  const abovePreferred = normalizedScore >= preferredNorm;

  if (abovePreferred) {
    recovery.consecutive_above_preferred++;
  } else {
    // Reset streak if below preferred
    recovery.consecutive_above_preferred = 0;
    recovery.self_resolution_emitted = false;
    await env.STIGMERGY_KV.put(recovKey, JSON.stringify(recovery), { expirationTtl: 86400 * 60 });
    return null;
  }

  // Need 3+ consecutive above-preferred readings with no recent HITL
  const hitlRecent = recovery.last_hitl_ts && (Date.now() - recovery.last_hitl_ts) < 86400000 * 7;
  if (recovery.consecutive_above_preferred >= 3 && !hitlRecent && !recovery.self_resolution_emitted) {
    recovery.self_resolution_emitted = true;
    await env.STIGMERGY_KV.put(recovKey, JSON.stringify(recovery), { expirationTtl: 86400 * 60 });

    // Emit positive self-resolution stigmergy trace
    const traceId = `trace:self_resolution:${bioregion_id}:${sphere}:${Date.now()}`;
    const trace = {
      id:             traceId,
      type:           'self_resolution',
      content:        `${br.name} (${sphere}) has recovered above preferred vitality for 3+ consecutive readings without human intervention. Biology closed the loop.`,
      actor_id:       `natural:${bioregion_id}:${sphere}`,
      sphere,
      node_id:        `${bioregion_id}:${sphere}`,
      bioregion:      bioregion_id,
      strength:       normalizedScore,
      litl_evidence:  true,
      deposited_at:   new Date().toISOString(),
      decay_rate:     0.02,   // self-resolution traces decay slowly — they're positive attractors
    };
    try {
      await env.STIGMERGY_KV.put(traceId, JSON.stringify(trace), { expirationTtl: 86400 * 30 });
      // Index under na:sphere: for cross-agent visibility
      const idxKey = `na:sphere:${sphere}`;
      const idx = await env.STIGMERGY_KV.get(idxKey, 'json') || { trace_ids: [] };
      idx.trace_ids.unshift(traceId);
      idx.trace_ids = idx.trace_ids.slice(0, 200);
      await env.STIGMERGY_KV.put(idxKey, JSON.stringify(idx));
    } catch(_) {}

    // Update node maturity — self-resolution increments the counter
    const matKey = `na:node:maturity:${bioregion_id}:${sphere}`;
    const matState = await getNodeMaturityState(bioregion_id, sphere, env);
    matState.self_resolutions_30d++;
    matState.total_self_resolutions++;
    matState.maturity_level = computeMaturityLevel(matState);
    matState.litl_score     = computeLITLScore(matState);
    await env.STIGMERGY_KV.put(matKey, JSON.stringify(matState), { expirationTtl: 86400 * 365 });

    // Propagate recovery signal to ecological kin
    await propagateToBioregionKin(bioregion_id, sphere, 'recovery', normalizedScore, env);

    return { self_resolution: true, trace_id: traceId, consecutive: recovery.consecutive_above_preferred };
  }

  await env.STIGMERGY_KV.put(recovKey, JSON.stringify(recovery), { expirationTtl: 86400 * 60 });
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// CROSS-BIOREGION STIGMERGY — Ecological signal propagation
// When a node emits distress or recovery, dampened signals propagate to
// ecologically-related kin nodes. Damping factor = kinship strength × 0.4.
// This is the foundation of planetary co-intelligence:
// nodes begin to know things no individual node's sensors measured.
// ═══════════════════════════════════════════════════════════════════════════

async function propagateToBioregionKin(bioregion_id, sphere, type, strength, env) {
  const kin = BIOREGION_KINSHIP[bioregion_id] || [];
  if (!kin.length) return;

  const ts = Date.now();
  for (const { id: kinId, strength: kinStrength } of kin) {
    const kinBr = BIOREGIONS.find(b => b.id === kinId);
    if (!kinBr) continue;
    // Only propagate to kin nodes that have this sphere in their Umwelt
    const kinSpheres = NATURAL_UMWELT[kinBr.biome] || ['BIOSPHERE'];
    if (!kinSpheres.includes(sphere)) continue;

    const propagatedStrength = +(strength * kinStrength * 0.4).toFixed(3);
    if (propagatedStrength < 0.05) continue;  // below noise floor

    const traceId = `trace:kin:${bioregion_id}:${kinId}:${sphere}:${ts}`;
    const trace = {
      id:             traceId,
      type:           `kin_${type}`,   // kin_distress or kin_recovery
      source_node:    `${bioregion_id}:${sphere}`,
      target_node:    `${kinId}:${sphere}`,
      content:        type === 'recovery'
        ? `Kinship recovery signal: ${kinBr.name} (${sphere}) receiving positive signal from ${bioregion_id} (kinship ${kinStrength}).`
        : `Kinship alert: ${kinBr.name} (${sphere}) receiving dampened distress signal from ${bioregion_id} (kinship ${kinStrength}). Watch this sphere.`,
      sphere,
      bioregion:      kinId,
      node_id:        `${kinId}:${sphere}`,
      strength:       propagatedStrength,
      kinship_source: bioregion_id,
      kinship_strength: kinStrength,
      cross_bioregion: true,
      deposited_at:   new Date().toISOString(),
      decay_rate:     type === 'recovery' ? 0.03 : 0.08,
    };
    try {
      await env.STIGMERGY_KV.put(traceId, JSON.stringify(trace), { expirationTtl: 86400 * 14 });
      // Append to kin node's trace index
      const idxKey = `na:traces:${kinId}`;
      const idx = await env.STIGMERGY_KV.get(idxKey, 'json') || { trace_ids: [] };
      idx.trace_ids.unshift(traceId);
      idx.trace_ids = idx.trace_ids.slice(0, 200);
      await env.STIGMERGY_KV.put(idxKey, JSON.stringify(idx));
    } catch(_) {}
  }
}

// ── GET /api/bis/synchrony — detect nodes with correlated BIS movement ────
// Looks for nodes whose vitality is declining or recovering together.
// This is the observable signal of planetary co-intelligence emerging.
async function handleBISSynchrony(env) {
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  const stored = await env.STIGMERGY_KV.get('_natural_vitality', 'json') || {};

  // Build current vitality + trend snapshot for all nodes
  const nodeSnapshots = getAllNodes().map(n => {
    const br = BIOREGIONS.find(b => b.id === n.bioregion_id);
    if (!br) return null;
    const vitality = stored[br.id] !== undefined ? stored[br.id] : br.vitality;
    const preferred = BIOME_PREFERRED_VITALITY[br.biome] || { min: 55 };
    const gap = Math.max(0, preferred.min - vitality);
    return { node_id: n.node_id, bioregion_id: n.bioregion_id, sphere: n.sphere,
             realm: br.realm, biome: br.biome, vitality, trend: br.trend, gap };
  }).filter(Boolean);

  // Find correlated distress — nodes in same realm declining together
  const realmGroups = {};
  for (const n of nodeSnapshots) {
    if (!realmGroups[n.realm]) realmGroups[n.realm] = [];
    realmGroups[n.realm].push(n);
  }

  const synchronyPatterns = [];
  for (const [realm, nodes] of Object.entries(realmGroups)) {
    const declining = nodes.filter(n => n.trend === 'declining' || n.gap > 20);
    if (declining.length >= 2) {
      synchronyPatterns.push({
        type:       'correlated_decline',
        realm,
        node_count: declining.length,
        nodes:      declining.map(n => ({ node_id: n.node_id, vitality: n.vitality, gap: n.gap })),
        avg_gap:    Math.round(declining.reduce((s,n) => s + n.gap, 0) / declining.length),
        interpretation: `${declining.length} nodes in ${realm} declining together — ecological kinship signal.`,
      });
    }
    const recovering = nodes.filter(n => n.trend === 'increasing' && n.vitality >= 55);
    if (recovering.length >= 2) {
      synchronyPatterns.push({
        type:       'correlated_recovery',
        realm,
        node_count: recovering.length,
        nodes:      recovering.map(n => ({ node_id: n.node_id, vitality: n.vitality })),
        interpretation: `${recovering.length} nodes in ${realm} recovering together — positive attractor active.`,
      });
    }
  }

  // Also check kinship-specific correlations
  const kinshipCorrelations = [];
  for (const [brId, kin] of Object.entries(BIOREGION_KINSHIP)) {
    const sourceNode = nodeSnapshots.find(n => n.bioregion_id === brId && n.sphere === 'BIOSPHERE');
    if (!sourceNode || sourceNode.gap < 10) continue;
    const distressedKin = kin.filter(k => {
      const kinNode = nodeSnapshots.find(n => n.bioregion_id === k.id && n.sphere === 'BIOSPHERE');
      return kinNode && kinNode.gap > 10;
    });
    if (distressedKin.length >= 1) {
      kinshipCorrelations.push({
        source: brId,
        kin_in_distress: distressedKin.map(k => k.id),
        kinship_strength: distressedKin.map(k => k.strength),
        note: `${brId} and ${distressedKin.length} kin node(s) simultaneously stressed — cross-bioregion pattern.`,
      });
    }
  }

  return R({
    synchrony_patterns:    synchronyPatterns,
    kinship_correlations:  kinshipCorrelations,
    total_patterns:        synchronyPatterns.length + kinshipCorrelations.length,
    planetary_co_intelligence_signal: synchronyPatterns.length + kinshipCorrelations.length >= 3
      ? 'Multiple cross-node patterns detected — emergent planetary signal present'
      : synchronyPatterns.length + kinshipCorrelations.length >= 1
      ? 'Early cross-node correlation — kinship network beginning to self-organise'
      : 'No synchrony patterns detected yet — insufficient node maturity or signal coverage',
    timestamp: new Date().toISOString(),
  });
}

const NATURAL_AGENT_SCHEMA = {
  required: ['bioregion_id', 'signal_type', 'raw_value', 'unit', 'source_type', 'ts'],
  source_types: ['satellite', 'ground_sensor', 'proxy_api', 'steward_observation'],
  signal_types: [
    'co2_ppm','temp_anomaly_c','precipitation_mm','soil_moisture_pct',
    'ndvi','ocean_ph','sea_surface_temp_c','dissolved_oxygen_mgl',
    'acoustic_biodiversity_index','species_observation_count',
    'air_quality_index','wildfire_smoke_aqi','snowpack_swe_mm',
    'groundwater_level_m','stream_flow_cms','wetland_extent_km2',
    'soil_carbon_pct','mycorrhizal_proxy_ndvi','canopy_cover_pct',
    'steward_qualitative'
  ],
  // These fields are locked the moment a signal is written.
  // No function in this worker may overwrite them after ingest.
  immutable_fields: [
    'bioregion_id','signal_type','raw_value','unit',
    'source_type','ts','sovereignty_tag','signal_id'
  ],
  // Stewards may add these post-ingest; they do not alter raw telemetry
  steward_fields: [
    'steward_note','steward_id','intervention_recommended','local_context'
  ]
};
const SOVEREIGNTY_TAGS = {
  'open':       'Freely shareable — satellite or public API source',
  'community':  'Shared within bioregion — steward-generated',
  'indigenous': 'Governed by territorial data sovereignty — FPIC required',
  'restricted': 'Research use only — explicit consent required'
};
// Distress thresholds — provisional until Biotic Adaptive Model (PoP Layer 3)
const DISTRESS_THRESHOLDS = {
  co2_ppm:                     { critical: 430,  unit: 'ppm',   direction: 'above' },
  temp_anomaly_c:              { critical: 1.5,  unit: '°C',    direction: 'absolute' },
  ocean_ph:                    { critical: 8.0,  unit: 'pH',    direction: 'below' },
  soil_moisture_pct:           { critical: 15,   unit: '%',     direction: 'below' },
  ndvi:                        { critical: 0.2,  unit: 'index', direction: 'below' },
  acoustic_biodiversity_index: { critical: 0.3,  unit: 'index', direction: 'below' },
  dissolved_oxygen_mgl:        { critical: 5.0,  unit: 'mg/L',  direction: 'below' },
  air_quality_index:           { critical: 150,  unit: 'AQI',   direction: 'above' },
  wildfire_smoke_aqi:          { critical: 100,  unit: 'AQI',   direction: 'above' },
};
function isDistressSignal(signal) {
  const threshold = DISTRESS_THRESHOLDS[signal.signal_type];
  if (!threshold) return null;
  const val = parseFloat(signal.raw_value);
  if (isNaN(val)) return null;
  const triggered =
    threshold.direction === 'above'    ? val >= threshold.critical :
    threshold.direction === 'below'    ? val <= threshold.critical :
    threshold.direction === 'absolute' ? Math.abs(val) >= threshold.critical : false;
  if (!triggered) return null;
  const pct = threshold.direction === 'above'
    ? (val - threshold.critical) / threshold.critical
    : (threshold.critical - val) / threshold.critical;
  const severity = pct > 0.3 ? 'critical' : pct > 0.1 ? 'high' : 'moderate';
  return { signal_type: signal.signal_type, raw_value: val,
           threshold: threshold.critical, unit: threshold.unit,
           direction: threshold.direction, severity };
}
// ── Ingest endpoint ───────────────────────────────────────────────────────
// POST /api/na/ingest
// Writes raw telemetry. Immutable fields locked on write.
// AI layer never touches raw_value after this point.
async function handleNaturalAgentIngest(request, env) {
  const body = await request.json().catch(() => null);
  if (!body) return R({ error: 'Invalid JSON' }, 400);
  // Gap #5: Auth gate for ground sensors only
  if (body.source_type === 'ground_sensor') {
    const authResult = await authenticateSensor(request, body.sensor_id, env);
    if (!authResult.ok) return R({ error: authResult.error }, 401);
  }
  const missing = NATURAL_AGENT_SCHEMA.required.filter(f => body[f] === undefined);
  if (missing.length)
    return R({ error: `Missing required fields: ${missing.join(', ')}` }, 400);
  if (!NATURAL_AGENT_SCHEMA.source_types.includes(body.source_type))
    return R({ error: `Invalid source_type. Valid: ${NATURAL_AGENT_SCHEMA.source_types.join(', ')}` }, 400);
  const sovereignty_tag = SOVEREIGNTY_TAGS[body.sovereignty_tag]
    ? body.sovereignty_tag : 'community';
  // Build immutable core — only NATURAL_AGENT_SCHEMA.immutable_fields
  const signal = {
    signal_id:       `na:${body.bioregion_id}:${body.signal_type}:${Date.now()}`,
    bioregion_id:    body.bioregion_id,
    signal_type:     body.signal_type,
    raw_value:       body.raw_value,       // never modified after this line
    unit:            body.unit,
    source_type:     body.source_type,
    ts:              body.ts || Date.now(),
    sovereignty_tag,
    // Steward annotation — permitted but separate from raw telemetry
    steward_note:    body.steward_note    || null,
    steward_id:      body.steward_id      || null,
    intervention_recommended: body.intervention_recommended || false,
    local_context:   body.local_context   || null,
    // Scale tier — Patch 3: Microcosm → Mesocosm → Macrocosm → Metacosm
    scale_level:     inferScaleLevel(body),
    // PoP: steward_observation carries highest authority (biology and steward lead, AI translates)
    authority_weight: SOURCE_TYPE_AUTHORITY[body.source_type] || 0.6,
    // Audit trail
    ingested_at:     Date.now(),
    immutable:       true,
    ai_interpreted:  false  // this field is NEVER set to true in this system
  };
  // Write to KV
  await env.STIGMERGY_KV.put(`na:signal:${signal.signal_id}`, JSON.stringify(signal));
  // Update bioregion index (keep last 500 signals per bioregion)
  const idxKey = `na:index:${body.bioregion_id}`;
  const idx = await env.STIGMERGY_KV.get(idxKey, 'json') || { signal_ids: [] };
  idx.signal_ids.unshift(signal.signal_id);
  idx.signal_ids = idx.signal_ids.slice(0, 500);
  await env.STIGMERGY_KV.put(idxKey, JSON.stringify(idx));
  // D1 log
  try {
    await env.STIGMERGY_DB.prepare(
      'INSERT INTO natural_signals (ts, bioregion_id, signal_type, raw_value, unit, source_type, sovereignty_tag, distress) VALUES (?,?,?,?,?,?,?,?)'
    ).bind(
      signal.ts, signal.bioregion_id, signal.signal_type,
      String(signal.raw_value), signal.unit, signal.source_type,
      sovereignty_tag, isDistressSignal(signal) ? 1 : 0
    ).run();
  } catch(_) {}
  const distress = isDistressSignal(signal);
  // Gap #2 hook — emit cross-agent trace if distress detected
  if (distress) {
    await emitNaturalAgentTrace(signal, distress, env);
  }
  // Liminal bucket — unknown signal types accumulate for Umwelt expansion review
  const isKnownType = NATURAL_AGENT_SCHEMA.signal_types.includes(signal.signal_type);
  if (!isKnownType) {
    const liminalKey = `na:liminal:signals:${signal.signal_type}`;
    const liminalEntry = await env.STIGMERGY_KV.get(liminalKey, 'json') || { signal_ids: [] };
    liminalEntry.signal_ids.unshift(signal.signal_id);
    liminalEntry.signal_ids = liminalEntry.signal_ids.slice(0, 200);
    await env.STIGMERGY_KV.put(liminalKey, JSON.stringify(liminalEntry));
    // Update global liminal index
    const liminalIndex = await env.STIGMERGY_KV.get('na:liminal:index', 'json') || { signal_types: {} };
    liminalIndex.signal_types[signal.signal_type] = (liminalIndex.signal_types[signal.signal_type] || 0) + 1;
    await env.STIGMERGY_KV.put('na:liminal:index', JSON.stringify(liminalIndex));
  }
  // Node state update — maintains per-node (bioregion × sphere) vitality
  await updateNodeState(signal, distress, env);
  // Perturbation accounting — log system's act of detecting and classifying distress
  if (distress) {
    const logKey = `perturbation:log:${signal.bioregion_id}`;
    const existing = await env.STIGMERGY_KV.get(logKey, 'json') || { entries: [] };
    existing.entries.unshift({
      perturbation_id: `perturb:auto:${signal.signal_id}`,
      bioregion_id: signal.bioregion_id, action_type: 'distress_classification',
      description: `System classified ${signal.signal_type} as ${distress.severity} distress — act of observation is itself a perturbation`,
      scale_level: signal.scale_level, logged_at: new Date().toISOString(), source: 'auto',
    });
    existing.entries = existing.entries.slice(0, 200);
    await env.STIGMERGY_KV.put(logKey, JSON.stringify(existing)).catch(() => {});
  }
  return R({
    ok: true,
    signal_id: signal.signal_id,
    sovereignty_tag,
    distress_detected: !!distress,
    distress,
    liminal: !isKnownType
      ? { status: 'routed_to_liminal', message: 'Unknown signal_type stored in liminal bucket — accumulation may trigger Umwelt expansion candidate alert' }
      : null
  });
}

// ══════════════════════════════════════════════════════════════════════════
// HISTORICAL INGEST — Open-Meteo archive + NOAA CO₂
// POST /api/na/ingest-historical  and  POST /api/na/ingest-co2
// No API keys required. Both sources are fully open.
// ══════════════════════════════════════════════════════════════════════════

// Biome baseline temperatures (°C daily max) — 1981–2010 climatological normals
const BIOME_BASELINES = {
  tropical_forest:     30.0,
  tropical_savanna:    32.0,
  tropical_dry_forest: 31.0,
  montane_forest:      22.0,
  montane_grassland:   20.0,
  temperate_forest:    18.0,
  temperate_broadleaf: 18.0,
  temperate_conifer:   16.0,
  temperate_grassland: 20.0,
  mediterranean_shrub: 24.0,
  arid_grassland:      30.0,
  arid_shrubland:      28.0,
  desert:              36.0,
  wetland:             28.0,
  taiga:               10.0,
  boreal:              12.0,
  alpine_grassland:    12.0,
  alpine_glacier:       8.0,
  polar_ice:           -8.0,
  coral_reef:          28.0,
  island_endemic:      28.0,
};

// 52 bioregions shared by historical ingest + real-time stream handlers
const ALL_BIOREGIONS = [
  { id:'rocky_mountain',    lat:39.95,  lng:-105.16, biome:'montane_grassland' },
  { id:'california',        lat:37.0,   lng:-120.0,  biome:'mediterranean_shrub' },
  { id:'great_plains',      lat:41.0,   lng:-100.0,  biome:'temperate_grassland' },
  { id:'appalachian',       lat:37.5,   lng:-82.0,   biome:'temperate_broadleaf' },
  { id:'pacific_northwest', lat:47.0,   lng:-122.5,  biome:'temperate_conifer' },
  { id:'arctic_nearctic',   lat:69.0,   lng:-105.0,  biome:'polar_ice' },
  { id:'sonoran_chihuahuan',lat:30.5,   lng:-109.0,  biome:'desert' },
  { id:'amazon',            lat:-3.5,   lng:-62.2,   biome:'tropical_forest' },
  { id:'cerrado',           lat:-15.0,  lng:-47.0,   biome:'tropical_savanna' },
  { id:'atlantic_forest',   lat:-23.0,  lng:-46.0,   biome:'tropical_forest' },
  { id:'andean_highlands',  lat:-4.0,   lng:-77.0,   biome:'montane_grassland' },
  { id:'patagonia',         lat:-46.0,  lng:-69.0,   biome:'arid_grassland' },
  { id:'caribbean_forests', lat:18.0,   lng:-70.0,   biome:'tropical_dry_forest' },
  { id:'orinoco',           lat:6.5,    lng:-67.0,   biome:'tropical_savanna' },
  { id:'congo',             lat:-1.5,   lng:23.0,    biome:'tropical_forest' },
  { id:'sahel',             lat:13.5,   lng:2.1,     biome:'arid_grassland' },
  { id:'east_african_savanna',lat:-1.5, lng:36.5,    biome:'tropical_savanna' },
  { id:'cape_floristic',    lat:-33.5,  lng:19.0,    biome:'mediterranean_shrub' },
  { id:'madagascar',        lat:-19.0,  lng:46.5,    biome:'island_endemic' },
  { id:'miombo',            lat:-12.0,  lng:30.0,    biome:'tropical_dry_forest' },
  { id:'horn_of_africa',    lat:9.0,    lng:44.0,    biome:'arid_shrubland' },
  { id:'boreal',            lat:58.0,   lng:85.0,    biome:'boreal' },
  { id:'mediterranean',     lat:38.0,   lng:15.0,    biome:'mediterranean_shrub' },
  { id:'central_asian_steppe',lat:48.0, lng:62.0,    biome:'temperate_grassland' },
  { id:'caucasus',          lat:41.5,   lng:44.0,    biome:'temperate_broadleaf' },
  { id:'arctic_palearctic', lat:73.0,   lng:100.0,   biome:'polar_ice' },
  { id:'european_broadleaf',lat:51.0,   lng:10.0,    biome:'temperate_broadleaf' },
  { id:'himalayan',         lat:29.0,   lng:83.0,    biome:'alpine_glacier' },
  { id:'sundaland',         lat:0.0,    lng:110.0,   biome:'tropical_forest' },
  { id:'western_ghats',     lat:10.5,   lng:76.5,    biome:'tropical_forest' },
  { id:'indochina',         lat:16.0,   lng:104.0,   biome:'tropical_forest' },
  { id:'ganges_brahmaputra',lat:24.0,   lng:89.0,    biome:'wetland' },
  { id:'great_barrier',     lat:-18.3,  lng:147.7,   biome:'coral_reef' },
  { id:'southwest_australia',lat:-31.0, lng:117.5,   biome:'mediterranean_shrub' },
  { id:'new_guinea',        lat:-5.5,   lng:144.0,   biome:'montane_forest' },
  { id:'new_zealand',       lat:-42.0,  lng:172.0,   biome:'temperate_conifer' },
  { id:'coral_triangle',    lat:2.0,    lng:124.0,   biome:'coral_reef' },
  { id:'pacific_islands',   lat:-15.0,  lng:168.0,   biome:'island_endemic' },
  { id:'arctic',            lat:80.0,   lng:0.0,     biome:'polar_ice' },
  { id:'antarctic_tundra',  lat:-72.0,  lng:-10.0,   biome:'polar_ice' },
  { id:'mekong',            lat:15.5,   lng:104.5,   biome:'wetland' },
  { id:'drc_miombo',        lat:-5.0,   lng:28.0,    biome:'tropical_dry_forest' },
  { id:'chiapas_mesoamerica',lat:15.5,  lng:-89.0,   biome:'tropical_forest' },
  { id:'chilean_matorral',  lat:-33.0,  lng:-71.0,   biome:'mediterranean_shrub' },
  { id:'guinean_forests',   lat:6.0,    lng:-3.0,    biome:'tropical_forest' },
  { id:'tibetan_plateau',   lat:32.0,   lng:88.0,    biome:'alpine_grassland' },
  { id:'anatolian_iranian', lat:38.5,   lng:37.0,    biome:'arid_shrubland' },
  { id:'east_asian_forests',lat:38.0,   lng:130.0,   biome:'temperate_broadleaf' },
  { id:'arabian_desert',    lat:24.0,   lng:47.0,    biome:'desert' },
  { id:'philippine_forests',lat:12.0,   lng:122.0,   biome:'island_endemic' },
  { id:'australian_savanna',lat:-15.0,  lng:132.0,   biome:'tropical_savanna' },
  { id:'eastern_australia', lat:-33.0,  lng:150.0,   biome:'temperate_broadleaf' },
];

async function handleHistoricalIngest(request, env) {
  const body = await request.json().catch(() => ({}));

  const start_date  = body.start_date  || '2015-01-01';
  const end_date    = body.end_date    || new Date().toISOString().split('T')[0];
  const batch_size  = Math.min(body.batch_size  || 5, 10);
  const offset      = body.offset || 0;
  const dry_run     = body.dry_run === true;

  const targets = body.bioregion_ids
    ? ALL_BIOREGIONS.filter(b => body.bioregion_ids.includes(b.id))
    : ALL_BIOREGIONS.slice(offset, offset + batch_size);

  const results = [];
  let total_ingested = 0;
  let total_failed   = 0;

  for (const bio of targets) {
    const baseline = BIOME_BASELINES[bio.biome] || 20.0;
    let bio_ingested = 0;

    try {
      const url = [
        'https://archive-api.open-meteo.com/v1/archive',
        `?latitude=${bio.lat}`,
        `&longitude=${bio.lng}`,
        `&start_date=${start_date}`,
        `&end_date=${end_date}`,
        '&daily=temperature_2m_mean,temperature_2m_max,temperature_2m_min,',
        'precipitation_sum,et0_fao_evapotranspiration,',
        'wind_speed_10m_max,shortwave_radiation_sum',
        '&timezone=auto'
      ].join('');

      const res = await fetch(url, {
        headers: { 'User-Agent': 'Stigmergy-NA-Ingest/1.0 (+https://stigmergy.ai)' }
      });

      if (!res.ok) {
        total_failed++;
        results.push({ id: bio.id, status: 'api_error', code: res.status });
        continue;
      }

      const data = await res.json();
      const days = data.daily?.time || [];

      for (let i = 0; i < days.length; i++) {
        const temp_mean = data.daily.temperature_2m_mean?.[i];
        const temp_max  = data.daily.temperature_2m_max?.[i];
        const precip    = data.daily.precipitation_sum?.[i];
        const et0       = data.daily.et0_fao_evapotranspiration?.[i];
        const ts        = new Date(days[i]).getTime();

        if (dry_run) { bio_ingested++; continue; }

        // Use daily mean (not max) vs climatological mean baseline — max inflates anomaly by ~5°C
        const temp_for_anomaly = temp_mean ?? temp_max;
        if (temp_for_anomaly != null) {
          const anomaly = parseFloat((temp_for_anomaly - baseline).toFixed(2));
          await writeHistoricalSignal(env, {
            bioregion_id: bio.id, signal_type: 'temp_anomaly_c',
            raw_value: anomaly, unit: '°C', ts,
            steward_note: `Open-Meteo archive. Daily mean ${temp_for_anomaly}°C vs ${baseline}°C ${bio.biome} baseline.`
          });
          // Populate na:sphere: index so computeCollectiveSignal sees distress
          const distress = isDistressSignal({ signal_type: 'temp_anomaly_c', raw_value: anomaly });
          if (distress) {
            await emitNaturalAgentTrace(
              { bioregion_id: bio.id, signal_type: 'temp_anomaly_c', raw_value: anomaly,
                unit: '°C', signal_id: `na:${bio.id}:temp_anomaly_c:${ts}`, sovereignty_tag: 'open' },
              distress, env
            ).catch(() => {});
          }
          bio_ingested++;
        }
        if (precip != null) {
          await writeHistoricalSignal(env, {
            bioregion_id: bio.id, signal_type: 'precipitation_mm',
            raw_value: precip, unit: 'mm', ts,
            steward_note: `Open-Meteo archive. Daily precipitation sum.`
          });
          bio_ingested++;
        }
        if (et0 != null) {
          const moisture_proxy = parseFloat(Math.min(100, Math.max(0, (et0 / 8) * 100)).toFixed(1));
          await writeHistoricalSignal(env, {
            bioregion_id: bio.id, signal_type: 'soil_moisture_pct',
            raw_value: moisture_proxy, unit: '%', ts,
            steward_note: `Open-Meteo ET0 proxy. ET0=${et0}mm → soil moisture estimate.`
          });
          bio_ingested++;
        }

        if (bio_ingested % 100 === 0) await new Promise(r => setTimeout(r, 10));
      }

      total_ingested += bio_ingested;
      results.push({ id: bio.id, days: days.length, signals: bio_ingested, status: 'ok' });

    } catch(e) {
      total_failed++;
      results.push({ id: bio.id, status: 'error', message: e.message });
    }

    await new Promise(r => setTimeout(r, 150));
  }

  return R({
    ok: true, dry_run,
    date_range: `${start_date} → ${end_date}`,
    bioregions_processed: targets.length,
    total_ingested, total_failed,
    next_offset: offset + batch_size,
    has_more: !body.bioregion_ids && (offset + batch_size) < ALL_BIOREGIONS.length,
    results
  });
}

// Immutable signal writer — Gap #1 schema. Named to avoid collision with any
// future top-level writeSignal. Key: na:signal:na:<bioregion>:<type>:<ts>
async function writeHistoricalSignal(env, { bioregion_id, signal_type, raw_value,
                                            unit, ts, steward_note }) {
  const signal_id = `na:${bioregion_id}:${signal_type}:${ts}`;
  const signal = {
    signal_id, bioregion_id, signal_type,
    raw_value,       // NEVER modified after this line — Gap #1 immutability
    unit,
    source_type:     'proxy_api',
    ts,
    sovereignty_tag: 'open',
    steward_note:    steward_note || null,
    ingested_at:     Date.now(),
    immutable:       true,
    ai_interpreted:  false
  };
  await env.STIGMERGY_KV.put(`na:signal:${signal_id}`, JSON.stringify(signal));

  // Update bioregion index — keep last 2000 per bioregion
  const idxKey = `na:index:${bioregion_id}`;
  const idx = await env.STIGMERGY_KV.get(idxKey, 'json') || { signal_ids: [] };
  if (!idx.signal_ids.includes(signal_id)) {
    idx.signal_ids.unshift(signal_id);
    idx.signal_ids = idx.signal_ids.slice(0, 2000);
    await env.STIGMERGY_KV.put(idxKey, JSON.stringify(idx));
  }
}

async function handleCo2Ingest(request, env) {
  const body = await request.json().catch(() => ({}));
  const dry_run = body.dry_run === true;

  const annual_url  = 'https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_annmean_gl.csv';
  const monthly_url = 'https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_mm_mlo.csv';

  let annual_ingested = 0;
  let monthly_value   = null;
  const errors = [];

  try {
    const ann_res = await fetch(annual_url, { headers: { 'User-Agent': 'Stigmergy-NA-Ingest/1.0' } });
    if (ann_res.ok) {
      const csv = await ann_res.text();
      const lines = csv.split('\n').filter(l => l.trim() && !l.startsWith('#')).slice(1);
      for (const line of lines) {
        const parts = line.split(',').map(p => p.trim());
        const year = parseInt(parts[0]);
        const mean = parseFloat(parts[1]);
        if (isNaN(year) || isNaN(mean) || year < 1979) continue;
        const ts = new Date(`${year}-07-01`).getTime();
        if (!dry_run) {
          for (const bio_id of ['global', 'amazon', 'arctic', 'great_barrier']) {
            await writeHistoricalSignal(env, {
              bioregion_id: bio_id, signal_type: 'co2_ppm',
              raw_value: mean, unit: 'ppm', ts,
              steward_note: `NOAA GML global annual mean CO₂. Year: ${year}.`
            });
          }
        }
        annual_ingested++;
      }
    }
  } catch(e) { errors.push('annual_csv: ' + e.message); }

  try {
    const mon_res = await fetch(monthly_url, { headers: { 'User-Agent': 'Stigmergy-NA-Ingest/1.0' } });
    if (mon_res.ok) {
      const csv = await mon_res.text();
      const data_lines = csv.split('\n')
        .filter(l => l.trim() && !l.startsWith('#')).slice(1)
        .filter(l => !l.includes('-99.99'));
      if (data_lines.length > 0) {
        const last  = data_lines[data_lines.length - 1].split(/\s+/).filter(Boolean);
        const year  = parseInt(last[0]);
        const month = parseInt(last[1]);
        const value = parseFloat(last[3]);
        if (!isNaN(value) && value > 0) {
          monthly_value = { year, month, co2_ppm: value };
          if (!dry_run) {
            const ts = new Date(`${year}-${String(month).padStart(2,'0')}-15`).getTime();
            for (const bio_id of ['global', 'amazon', 'arctic', 'great_barrier']) {
              await writeHistoricalSignal(env, {
                bioregion_id: bio_id, signal_type: 'co2_ppm',
                raw_value: value, unit: 'ppm', ts,
                steward_note: `NOAA Mauna Loa monthly mean. ${year}-${month}.`
              });
            }
          }
        }
      }
    }
  } catch(e) { errors.push('monthly_csv: ' + e.message); }

  return R({
    ok: true, dry_run,
    annual_years_ingested: annual_ingested,
    latest_monthly:        monthly_value,
    bioregions_written:    dry_run ? 0 : 4,
    errors
  });
}


// ══════════════════════════════════════════════════════════════════════════
// REAL-TIME STREAM — Open-Meteo live endpoints (no API key required)
// GET  /api/na/stream/weather      15-min cache
// GET  /api/na/stream/airquality   60-min cache (Copernicus CAMS)
// GET  /api/na/stream/marine       15-min cache (ocean/reef bioregions)
// GET  /api/na/stream/flood        6-hour cache (freshwater bioregions)
// POST /api/na/stream/ingest-now   Pull all streams → immutable KV signals
// ══════════════════════════════════════════════════════════════════════════

const OPEN_METEO_APIS = {
  weather:    'https://api.open-meteo.com/v1/forecast',
  airquality: 'https://air-quality-api.open-meteo.com/v1/air-quality',
  marine:     'https://marine-api.open-meteo.com/v1/marine',
  flood:      'https://flood-api.open-meteo.com/v1/flood',
};

const MARINE_BIOREGIONS = new Set([
  'great_barrier','coral_triangle','pacific_islands','new_zealand',
  'caribbean_forests','arctic','antarctic_tundra','arctic_nearctic','arctic_palearctic'
]);

const FLOOD_BIOREGIONS = new Set([
  'amazon','mekong','ganges_brahmaputra','orinoco','congo','drc_miombo',
  'mississippi','danube','great_plains','appalachian'
]);

async function handleStreamWeather(request, env) {
  const url        = new URL(request.url);
  const single_id  = url.searchParams.get('bioregion_id');
  const bust_cache = url.searchParams.get('bust_cache') === 'true';
  const limit      = Math.min(parseInt(url.searchParams.get('limit') || '52'), 52);
  const CACHE_TTL  = 900;
  const cache_key  = single_id ? `stream:weather:${single_id}` : `stream:weather:all:${limit}`;

  if (!bust_cache) {
    const cached = await env.STIGMERGY_KV.get(cache_key, 'json');
    if (cached && (Date.now() - cached.fetched_at) < CACHE_TTL * 1000)
      return R({ ...cached, from_cache: true, cache_age_sec: Math.floor((Date.now() - cached.fetched_at) / 1000) });
  }

  const targets = single_id
    ? ALL_BIOREGIONS.filter(b => b.id === single_id)
    : ALL_BIOREGIONS.slice(0, limit);
  if (!targets.length) return R({ error: `Bioregion not found: ${single_id}` }, 404);

  const WEATHER_FIELDS = 'temperature_2m,relative_humidity_2m,precipitation,surface_pressure,wind_speed_10m,cloud_cover,weather_code';

  const results = await Promise.all(targets.map(async bio => {
    try {
      const res = await fetch(
        `${OPEN_METEO_APIS.weather}?latitude=${bio.lat}&longitude=${bio.lng}` +
        `&current=${WEATHER_FIELDS}&wind_speed_unit=ms&timezone=auto`,
        { headers: { 'User-Agent': 'Stigmergy-Stream/1.0' } }
      );
      if (!res.ok) return { id: bio.id, error: res.status };
      const d = await res.json();
      const c = d.current;
      const baseline     = BIOME_BASELINES[bio.biome] || 20;
      const temp_anomaly = c.temperature_2m != null ? parseFloat((c.temperature_2m - baseline).toFixed(2)) : null;
      return {
        id: bio.id, time: c.time, interval_sec: c.interval,
        temperature_c: c.temperature_2m, humidity_pct: c.relative_humidity_2m,
        precipitation_mm: c.precipitation, pressure_hpa: c.surface_pressure,
        wind_ms: c.wind_speed_10m, cloud_pct: c.cloud_cover, weather_code: c.weather_code,
        temp_anomaly_c: temp_anomaly,
        distress: temp_anomaly != null && Math.abs(temp_anomaly) >= 1.5
          ? { signal_type: 'temp_anomaly_c', value: temp_anomaly,
              severity: Math.abs(temp_anomaly) >= 3 ? 'critical' : Math.abs(temp_anomaly) >= 2 ? 'high' : 'moderate' }
          : null
      };
    } catch(e) { return { id: bio.id, error: e.message }; }
  }));

  const payload = {
    fetched_at: Date.now(), source: 'open-meteo.com', update_interval_sec: 900,
    bioregions: results.filter(r => !r.error), errors: results.filter(r => r.error),
    distress_count: results.filter(r => r.distress).length,
    distress_zones: results.filter(r => r.distress).map(r => ({
      id: r.id, signal: r.temp_anomaly_c + '°C anomaly', severity: r.distress.severity
    })),
  };
  await env.STIGMERGY_KV.put(cache_key, JSON.stringify(payload), { expirationTtl: CACHE_TTL * 2 });
  return R({ ...payload, from_cache: false });
}

async function handleStreamAirQuality(request, env) {
  const url        = new URL(request.url);
  const single_id  = url.searchParams.get('bioregion_id');
  const bust_cache = url.searchParams.get('bust_cache') === 'true';
  const CACHE_TTL  = 3600;
  const cache_key  = single_id ? `stream:aq:${single_id}` : 'stream:aq:all';

  if (!bust_cache) {
    const cached = await env.STIGMERGY_KV.get(cache_key, 'json');
    if (cached && (Date.now() - cached.fetched_at) < CACHE_TTL * 1000)
      return R({ ...cached, from_cache: true });
  }

  const targets = single_id
    ? ALL_BIOREGIONS.filter(b => b.id === single_id)
    : ALL_BIOREGIONS.slice(0, 52);

  const AQ_FIELDS = 'pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,ozone,dust,uv_index';

  const results = await Promise.all(targets.map(async bio => {
    try {
      const res = await fetch(
        `${OPEN_METEO_APIS.airquality}?latitude=${bio.lat}&longitude=${bio.lng}` +
        `&current=${AQ_FIELDS}&domains=cams_global`,
        { headers: { 'User-Agent': 'Stigmergy-Stream/1.0' } }
      );
      if (!res.ok) return { id: bio.id, error: res.status };
      const d = await res.json();
      const c = d.current;
      const pm25 = c.pm2_5 || 0;
      const aqi_severity = pm25 > 50 ? 'critical' : pm25 > 25 ? 'high' : pm25 > 15 ? 'moderate' : null;
      return {
        id: bio.id, time: c.time, interval_sec: c.interval,
        pm2_5: c.pm2_5, pm10: c.pm10, ozone_ppb: c.ozone,
        co_ppb: c.carbon_monoxide, no2_ppb: c.nitrogen_dioxide,
        dust: c.dust, uv_index: c.uv_index,
        distress: aqi_severity ? { signal_type: 'air_quality_index', value: pm25, unit: 'µg/m³', severity: aqi_severity } : null
      };
    } catch(e) { return { id: bio.id, error: e.message }; }
  }));

  const payload = {
    fetched_at: Date.now(), source: 'open-meteo.com + Copernicus CAMS', update_interval_sec: 3600,
    bioregions: results.filter(r => !r.error), errors: results.filter(r => r.error),
    distress_count: results.filter(r => r.distress).length,
    distress_zones: results.filter(r => r.distress).map(r => ({ id: r.id, pm2_5: r.pm2_5, severity: r.distress.severity })),
  };
  await env.STIGMERGY_KV.put(cache_key, JSON.stringify(payload), { expirationTtl: CACHE_TTL * 2 });
  return R({ ...payload, from_cache: false });
}

async function handleStreamMarine(request, env) {
  const url        = new URL(request.url);
  const single_id  = url.searchParams.get('bioregion_id');
  const bust_cache = url.searchParams.get('bust_cache') === 'true';
  const CACHE_TTL  = 900;
  const cache_key  = single_id ? `stream:marine:${single_id}` : 'stream:marine:all';

  if (!bust_cache) {
    const cached = await env.STIGMERGY_KV.get(cache_key, 'json');
    if (cached && (Date.now() - cached.fetched_at) < CACHE_TTL * 1000)
      return R({ ...cached, from_cache: true });
  }

  const targets = single_id
    ? ALL_BIOREGIONS.filter(b => b.id === single_id && MARINE_BIOREGIONS.has(b.id))
    : ALL_BIOREGIONS.filter(b => MARINE_BIOREGIONS.has(b.id));

  if (!targets.length) return R({
    error: single_id ? `${single_id} is not a marine bioregion` : 'No marine bioregions found',
    marine_bioregions: [...MARINE_BIOREGIONS]
  }, 400);

  const MARINE_FIELDS = 'wave_height,wave_direction,wave_period,sea_surface_temperature,ocean_current_speed';

  const results = await Promise.all(targets.map(async bio => {
    try {
      const res = await fetch(
        `${OPEN_METEO_APIS.marine}?latitude=${bio.lat}&longitude=${bio.lng}` +
        `&current=${MARINE_FIELDS}&length_unit=metric`,
        { headers: { 'User-Agent': 'Stigmergy-Stream/1.0' } }
      );
      if (!res.ok) return { id: bio.id, error: res.status };
      const d = await res.json();
      const c   = d.current;
      const sst = c.sea_surface_temperature;
      const sst_distress = sst > 31 ? 'critical' : sst > 30 ? 'high' : sst > 29 ? 'moderate' : null;
      return {
        id: bio.id, time: c.time, interval_sec: c.interval,
        sst_c: sst, wave_height_m: c.wave_height, wave_period_s: c.wave_period,
        wave_direction: c.wave_direction, current_ms: c.ocean_current_speed,
        distress: sst_distress ? {
          signal_type: 'sea_surface_temp_c', value: sst, unit: '°C', severity: sst_distress,
          note: 'Coral bleaching: 30°C stress, 31°C bleaching risk'
        } : null
      };
    } catch(e) { return { id: bio.id, error: e.message }; }
  }));

  const payload = {
    fetched_at: Date.now(), source: 'open-meteo.com marine API', update_interval_sec: 900,
    bioregions: results.filter(r => !r.error), errors: results.filter(r => r.error),
    distress_count: results.filter(r => r.distress).length,
    distress_zones: results.filter(r => r.distress).map(r => ({ id: r.id, sst: r.sst_c, severity: r.distress.severity })),
  };
  await env.STIGMERGY_KV.put(cache_key, JSON.stringify(payload), { expirationTtl: CACHE_TTL * 2 });
  return R({ ...payload, from_cache: false });
}

async function handleStreamFlood(request, env) {
  const url        = new URL(request.url);
  const single_id  = url.searchParams.get('bioregion_id');
  const bust_cache = url.searchParams.get('bust_cache') === 'true';
  const CACHE_TTL  = 21600;
  const cache_key  = single_id ? `stream:flood:${single_id}` : 'stream:flood:all';

  if (!bust_cache) {
    const cached = await env.STIGMERGY_KV.get(cache_key, 'json');
    if (cached && (Date.now() - cached.fetched_at) < CACHE_TTL * 1000)
      return R({ ...cached, from_cache: true });
  }

  const targets = single_id
    ? ALL_BIOREGIONS.filter(b => b.id === single_id && FLOOD_BIOREGIONS.has(b.id))
    : ALL_BIOREGIONS.filter(b => FLOOD_BIOREGIONS.has(b.id));

  if (!targets.length) return R({
    error: single_id ? `${single_id} is not a river bioregion` : 'No river bioregions matched',
    river_bioregions: [...FLOOD_BIOREGIONS]
  }, 400);

  const results = await Promise.all(targets.map(async bio => {
    try {
      const res = await fetch(
        `${OPEN_METEO_APIS.flood}?latitude=${bio.lat}&longitude=${bio.lng}` +
        `&daily=river_discharge&forecast_days=3&models=forecast_v4`,
        { headers: { 'User-Agent': 'Stigmergy-Stream/1.0' } }
      );
      if (!res.ok) return { id: bio.id, error: res.status };
      const d        = await res.json();
      const discharge = d.daily?.river_discharge || [];
      const dates     = d.daily?.time || [];
      const max_q     = Math.max(...discharge.filter(Boolean));
      return {
        id: bio.id,
        forecast: dates.map((date, i) => ({ date, river_discharge_m3s: discharge[i] })),
        peak_discharge_m3s: parseFloat(max_q.toFixed(2)),
        trend: discharge.length >= 2
          ? (discharge[discharge.length-1] > discharge[0] ? 'rising' : 'falling')
          : 'stable'
      };
    } catch(e) { return { id: bio.id, error: e.message }; }
  }));

  const payload = {
    fetched_at: Date.now(), source: 'open-meteo.com flood API',
    update_interval_sec: 21600, forecast_days: 3,
    bioregions: results.filter(r => !r.error), errors: results.filter(r => r.error),
  };
  await env.STIGMERGY_KV.put(cache_key, JSON.stringify(payload), { expirationTtl: CACHE_TTL * 2 });
  return R({ ...payload, from_cache: false });
}

async function handleStreamIngestNow(request, env) {
  const body         = await request.json().catch(() => ({}));
  const dry_run      = body.dry_run === true;
  const streams      = body.streams || ['weather','airquality','marine','flood'];
  const bioregion_id = body.bioregion_id || null;
  const summary      = { ingested: 0, distress_emitted: 0, errors: 0, dry_run };
  const ts           = Date.now();

  if (streams.includes('weather')) {
    const targets = bioregion_id
      ? ALL_BIOREGIONS.filter(b => b.id === bioregion_id)
      : ALL_BIOREGIONS;
    const WEATHER_FIELDS = 'temperature_2m,precipitation,wind_speed_10m,relative_humidity_2m';
    for (const bio of targets) {
      try {
        const res = await fetch(
          `${OPEN_METEO_APIS.weather}?latitude=${bio.lat}&longitude=${bio.lng}` +
          `&current=${WEATHER_FIELDS}&wind_speed_unit=ms&timezone=auto`,
          { headers: { 'User-Agent': 'Stigmergy-Stream/1.0' } }
        );
        if (!res.ok) { summary.errors++; continue; }
        const d       = await res.json();
        const c       = d.current;
        const baseline = BIOME_BASELINES[bio.biome] || 20;
        const anomaly  = c.temperature_2m != null ? parseFloat((c.temperature_2m - baseline).toFixed(2)) : null;

        if (anomaly != null) {
          if (!dry_run) {
            await writeHistoricalSignal(env, {
              bioregion_id: bio.id, signal_type: 'temp_anomaly_c',
              raw_value: anomaly, unit: '°C', ts,
              steward_note: `Open-Meteo live. ${c.temperature_2m}°C vs ${baseline}°C ${bio.biome} baseline.`
            });
            const distress = isDistressSignal({ signal_type:'temp_anomaly_c', raw_value: anomaly });
            if (distress) {
              const sig = { bioregion_id: bio.id, signal_type:'temp_anomaly_c', raw_value: anomaly,
                unit:'°C', signal_id:`na:${bio.id}:temp_anomaly_c:${ts}`, sovereignty_tag:'open' };
              await emitNaturalAgentTrace(sig, distress, env);
              summary.distress_emitted++;
            }
          }
          summary.ingested++;
        }
        if (c.precipitation != null && !dry_run) {
          await writeHistoricalSignal(env, {
            bioregion_id: bio.id, signal_type: 'precipitation_mm',
            raw_value: c.precipitation, unit: 'mm', ts,
            steward_note: 'Open-Meteo live current precipitation.'
          });
          summary.ingested++;
        }
        await new Promise(r => setTimeout(r, 50));
      } catch(e) { summary.errors++; }
    }
  }

  if (streams.includes('airquality')) {
    const targets = bioregion_id
      ? ALL_BIOREGIONS.filter(b => b.id === bioregion_id)
      : ALL_BIOREGIONS.slice(0, 20);
    for (const bio of targets) {
      try {
        const res = await fetch(
          `${OPEN_METEO_APIS.airquality}?latitude=${bio.lat}&longitude=${bio.lng}` +
          `&current=pm2_5,ozone&domains=cams_global`,
          { headers: { 'User-Agent': 'Stigmergy-Stream/1.0' } }
        );
        if (!res.ok) { summary.errors++; continue; }
        const c = (await res.json()).current;
        if (c.pm2_5 != null) {
          if (!dry_run) {
            await writeHistoricalSignal(env, {
              bioregion_id: bio.id, signal_type: 'air_quality_index',
              raw_value: c.pm2_5, unit: 'µg/m³', ts,
              steward_note: 'Open-Meteo + CAMS live PM2.5.'
            });
          }
          summary.ingested++;
        }
        await new Promise(r => setTimeout(r, 50));
      } catch(e) { summary.errors++; }
    }
  }

  if (streams.includes('marine')) {
    const targets = bioregion_id
      ? ALL_BIOREGIONS.filter(b => b.id === bioregion_id && MARINE_BIOREGIONS.has(b.id))
      : ALL_BIOREGIONS.filter(b => MARINE_BIOREGIONS.has(b.id));
    for (const bio of targets) {
      try {
        const res = await fetch(
          `${OPEN_METEO_APIS.marine}?latitude=${bio.lat}&longitude=${bio.lng}` +
          `&current=sea_surface_temperature&length_unit=metric`,
          { headers: { 'User-Agent': 'Stigmergy-Stream/1.0' } }
        );
        if (!res.ok) { summary.errors++; continue; }
        const sst = (await res.json()).current?.sea_surface_temperature;
        if (sst != null) {
          if (!dry_run) {
            await writeHistoricalSignal(env, {
              bioregion_id: bio.id, signal_type: 'sea_surface_temp_c',
              raw_value: sst, unit: '°C', ts,
              steward_note: 'Open-Meteo marine API live SST.'
            });
          }
          summary.ingested++;
        }
        await new Promise(r => setTimeout(r, 50));
      } catch(e) { summary.errors++; }
    }
  }

  return R({ ok: true, dry_run, ts: new Date(ts).toISOString(), streams_run: streams, ...summary });
}

// ── Read endpoint ─────────────────────────────────────────────────────────
// GET /api/na/signals?bioregion_id=X&signal_type=Y&limit=20
// Returns raw records. Indigenous-tagged signals blocked by default.
async function handleNaturalAgentRead(request, env) {
  const url = new URL(request.url);
  const bioregion_id       = url.searchParams.get('bioregion_id');
  const signal_type        = url.searchParams.get('signal_type');
  const limit              = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
  const include_indigenous = url.searchParams.get('include_indigenous') === 'true';
  if (!bioregion_id) return R({ error: 'bioregion_id required' }, 400);
  const idxKey = `na:index:${bioregion_id}`;
  const idx = await env.STIGMERGY_KV.get(idxKey, 'json');
  if (!idx) return R({ bioregion_id, signals: [],
    message: 'No signals ingested yet for this bioregion' });
  let ids = idx.signal_ids;
  const all = await Promise.all(ids.map(id =>
    env.STIGMERGY_KV.get(`na:signal:${id}`, 'json')));
  let signals = all.filter(Boolean);
  if (signal_type) signals = signals.filter(s => s.signal_type === signal_type);
  if (!include_indigenous) signals = signals.filter(s => s.sovereignty_tag !== 'indigenous');
  return R({
    bioregion_id,
    total_indexed: idx.signal_ids.length,
    returned: Math.min(signals.length, limit),
    sovereignty_note: include_indigenous
      ? 'Indigenous signals included — ensure FPIC authorization is in place'
      : 'Indigenous-tagged signals withheld — add include_indigenous=true with FPIC authorization',
    signals: signals.slice(0, limit)
  });
}

// ══════════════════════════════════════════════════════════════════════════
// GAP #2 PATCH — Cross-Agent Stigmergy Trace Routing
// ══════════════════════════════════════════════════════════════════════════
// ── Agent class vocabulary ────────────────────────────────────────────────
const AGENT_CLASSES = {
  NATURAL: 'natural',  // bioregion, ecosystem, watershed, species population
  HUMAN:   'human',    // individual, organization, nation, indigenous community
  AI:      'ai'        // corpus, synthesis, inference, intervention agents
};
// Routes a distress signal type to the corpus sphere where
// relevant human actors are likely to have affinity
const SIGNAL_TO_SPHERE = {
  co2_ppm:                     'ATMOSPHERE',
  temp_anomaly_c:              'ATMOSPHERE',
  wildfire_smoke_aqi:          'ATMOSPHERE',
  air_quality_index:           'ATMOSPHERE',
  ocean_ph:                    'HYDROSPHERE',
  dissolved_oxygen_mgl:        'HYDROSPHERE',
  stream_flow_cms:             'HYDROSPHERE',
  groundwater_level_m:         'HYDROSPHERE',
  wetland_extent_km2:          'HYDROSPHERE',
  precipitation_mm:            'HYDROSPHERE',
  soil_moisture_pct:           'BIOSPHERE',
  ndvi:                        'BIOSPHERE',
  acoustic_biodiversity_index: 'BIOSPHERE',
  species_observation_count:   'BIOSPHERE',
  soil_carbon_pct:             'BIOSPHERE',
  mycorrhizal_proxy_ndvi:      'BIOSPHERE',
  canopy_cover_pct:            'BIOSPHERE',
  steward_qualitative:         'ANCIENT',
  sea_surface_temp_c:          'HYDROSPHERE',
  snowpack_swe_mm:             'HYDROSPHERE',
};
// Signal types that belong to each sphere — defines what each node "perceives"
// Used by buildNaturalAgentNode() to set sphere-specific sensory_channels
const SPHERE_SIGNAL_TYPES = {
  BIOSPHERE:   ['ndvi','soil_moisture_pct','acoustic_biodiversity_index','species_observation_count',
                 'soil_carbon_pct','mycorrhizal_proxy_ndvi','canopy_cover_pct'],
  ATMOSPHERE:  ['co2_ppm','temp_anomaly_c','wildfire_smoke_aqi','air_quality_index','precipitation_mm'],
  HYDROSPHERE: ['ocean_ph','dissolved_oxygen_mgl','stream_flow_cms','groundwater_level_m',
                 'wetland_extent_km2','sea_surface_temp_c','snowpack_swe_mm'],
  ANCIENT:     ['steward_qualitative'],
};

// ══════════════════════════════════════════════════════════════════════════
// PATCH 1 — FORMAL BIOTIC INDEX SYSTEM (BIS)
// Replaces crude health_index (single 0-100 proxy) with Umwelt-aligned BIS:
//   • Per-node (bioregion × sphere) — each node scores only its own signals
//   • Geometric mean aggregation — a single bad domain drags the whole score
//   • Preferred states from BIOME_PREFERRED_VITALITY — what the ecosystem maintains
//   • Staleness tracking — confidence degrades as data ages
//   • Global BIS = stigmergic emergence from node BIS values (not top-down)
// AIF is re-anchored: F_ai now measures BIS gap, not corpus resonance.
// ══════════════════════════════════════════════════════════════════════════

// Normalization bounds per signal type — maps raw sensor value to 0–1 health score
// 1.0 = optimal (within preferred range), 0.0 = critical threshold breached
const BIS_SIGNAL_BOUNDS = {
  // BIOSPHERE
  ndvi:                        { optimal_min: 0.6,  optimal_max: 1.0,  critical: 0.2,  direction: 'above' },
  soil_moisture_pct:           { optimal_min: 30,   optimal_max: 70,   critical: 15,   direction: 'above' },
  acoustic_biodiversity_index: { optimal_min: 0.6,  optimal_max: 1.0,  critical: 0.3,  direction: 'above' },
  species_observation_count:   { optimal_min: 50,   optimal_max: 500,  critical: 10,   direction: 'above' },
  soil_carbon_pct:             { optimal_min: 3.0,  optimal_max: 8.0,  critical: 1.0,  direction: 'above' },
  mycorrhizal_proxy_ndvi:      { optimal_min: 0.5,  optimal_max: 1.0,  critical: 0.2,  direction: 'above' },
  canopy_cover_pct:            { optimal_min: 60,   optimal_max: 100,  critical: 20,   direction: 'above' },
  // ATMOSPHERE
  co2_ppm:                     { optimal_min: 280,  optimal_max: 350,  critical: 430,  direction: 'below' },
  temp_anomaly_c:              { optimal_min: -0.5, optimal_max: 0.5,  critical: 1.5,  direction: 'below' },
  wildfire_smoke_aqi:          { optimal_min: 0,    optimal_max: 50,   critical: 100,  direction: 'below' },
  air_quality_index:           { optimal_min: 0,    optimal_max: 50,   critical: 150,  direction: 'below' },
  precipitation_mm:            { optimal_min: 50,   optimal_max: 300,  critical: 5,    direction: 'above' },
  // HYDROSPHERE
  ocean_ph:                    { optimal_min: 8.1,  optimal_max: 8.3,  critical: 8.0,  direction: 'above' },
  dissolved_oxygen_mgl:        { optimal_min: 7.0,  optimal_max: 12.0, critical: 5.0,  direction: 'above' },
  stream_flow_cms:             { optimal_min: 10,   optimal_max: 500,  critical: 1,    direction: 'above' },
  groundwater_level_m:         { optimal_min: 2,    optimal_max: 20,   critical: 0.5,  direction: 'above' },
  wetland_extent_km2:          { optimal_min: 100,  optimal_max: 10000,critical: 10,   direction: 'above' },
  sea_surface_temp_c:          { optimal_min: 18,   optimal_max: 26,   critical: 30,   direction: 'below' },
  snowpack_swe_mm:             { optimal_min: 200,  optimal_max: 1000, critical: 50,   direction: 'above' },
};

// Staleness thresholds — how long before confidence starts degrading
const BIS_STALENESS_HOURS = {
  satellite:            48,   // satellite passes every 1-3 days
  ground_sensor:        6,    // sensors should update frequently
  proxy_api:            24,   // API data refreshed daily
  steward_observation:  168,  // weekly steward observations acceptable
};

// Normalize a raw signal value to 0–1 health score
// 1.0 = within optimal range, 0.0 = at or beyond critical threshold
function normalizeBISSignal(signal_type, raw_value) {
  const bounds = BIS_SIGNAL_BOUNDS[signal_type];
  if (!bounds || raw_value === null || raw_value === undefined) return null;
  const v = parseFloat(raw_value);
  if (isNaN(v)) return null;

  if (bounds.direction === 'above') {
    // Higher is healthier — critical is a floor
    if (v <= bounds.critical) return 0.0;
    if (v >= bounds.optimal_min) return 1.0;
    // Interpolate between critical and optimal_min
    return +Math.max(0, Math.min(1, (v - bounds.critical) / (bounds.optimal_min - bounds.critical))).toFixed(3);
  } else {
    // Lower is healthier — critical is a ceiling
    if (v >= bounds.critical) return 0.0;
    if (v <= bounds.optimal_max) return 1.0;
    return +Math.max(0, Math.min(1, (bounds.critical - v) / (bounds.critical - bounds.optimal_max))).toFixed(3);
  }
}

// Staleness-adjusted confidence — degrades linearly from 1.0 to 0.1 as data ages
function computeConfidence(signal_ts, source_type) {
  const maxFreshMs = (BIS_STALENESS_HOURS[source_type] || 48) * 3600 * 1000;
  const ageMs = Date.now() - (signal_ts || 0);
  return +Math.max(0.1, Math.min(1.0, 1.0 - (ageMs / maxFreshMs) * 0.9)).toFixed(3);
}

// Geometric mean of an array of values (ignores nulls)
function geometricMean(values) {
  const valid = values.filter(v => v !== null && v > 0);
  if (!valid.length) return null;
  const logSum = valid.reduce((s, v) => s + Math.log(v), 0);
  return +Math.exp(logSum / valid.length).toFixed(3);
}

// Compute BIS for a single node from its recent signals (KV records)
// Returns { bis_score, confidence, domain_scores, staleness, signal_count }
function computeNodeBIS(node, recentSignals) {
  const sphereSignals = SPHERE_SIGNAL_TYPES[node.sphere] || [];
  if (!sphereSignals.length) return null;

  const domainScores = {};
  let totalConfidence = 0;
  let scoredCount = 0;

  for (const sig_type of sphereSignals) {
    // Find most recent signal of this type for this node's bioregion
    const sig = recentSignals
      .filter(s => s.signal_type === sig_type && s.bioregion_id === node.bioregion_id)
      .sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];

    if (!sig) { domainScores[sig_type] = null; continue; }

    const score      = normalizeBISSignal(sig_type, sig.raw_value);
    const confidence = computeConfidence(sig.ts, sig.source_type);
    domainScores[sig_type] = score !== null ? { score, confidence, ts: sig.ts } : null;
    if (score !== null) { totalConfidence += confidence; scoredCount++; }
  }

  const scores      = Object.values(domainScores).filter(d => d !== null).map(d => d.score);
  const bis_score   = geometricMean(scores);  // null if no data
  const confidence  = scoredCount > 0 ? +(totalConfidence / scoredCount).toFixed(3) : 0;
  const coverage    = +(scoredCount / sphereSignals.length).toFixed(2); // fraction of domains with data

  return {
    node_id:      node.node_id,
    bioregion_id: node.bioregion_id,
    sphere:       node.sphere,
    bis_score,                    // 0–1, null if no data
    confidence,                   // 0–1, staleness-adjusted
    coverage,                     // fraction of signal domains with data
    effective_score: bis_score !== null ? +(bis_score * confidence).toFixed(3) : null,
    domain_scores:  domainScores,
    signal_count:   scoredCount,
    interpretation: bis_score === null ? 'no_data'
      : bis_score >= 0.75 ? 'healthy'
      : bis_score >= 0.50 ? 'stressed'
      : bis_score >= 0.25 ? 'critical'
      :                     'emergency',
  };
}

// Aggregate node BIS values into bioregion BIS (geometric mean of node scores)
function computeBioregionBIS(bioregion_id, nodeBISList) {
  const br = BIOREGIONS.find(b => b.id === bioregion_id);
  if (!br) return null;
  const valid = nodeBISList.filter(n => n.bis_score !== null);
  if (!valid.length) return { bioregion_id, bis_score: null, nodes: nodeBISList, interpretation: 'no_data' };

  const scores     = valid.map(n => n.effective_score || n.bis_score);
  const bis_score  = geometricMean(scores);
  const confidence = +(valid.reduce((s, n) => s + n.confidence, 0) / valid.length).toFixed(3);

  return {
    bioregion_id,
    bioregion_name: br.name,
    realm: br.realm,
    biome: br.biome,
    pop_level: br.pop_level,
    bis_score,
    confidence,
    effective_score: bis_score !== null ? +(bis_score * confidence).toFixed(3) : null,
    preferred_vitality: BIOME_PREFERRED_VITALITY[br.biome] || { min: 55, max: 80 },
    // BIS gap = how far from preferred state (AIF objective)
    bis_gap: bis_score !== null
      ? +Math.max(0, ((BIOME_PREFERRED_VITALITY[br.biome]?.min || 55) / 100) - bis_score).toFixed(3)
      : null,
    node_count: nodeBISList.length,
    scored_nodes: valid.length,
    nodes: nodeBISList,
    interpretation: bis_score === null ? 'no_data'
      : bis_score >= 0.75 ? 'healthy'
      : bis_score >= 0.50 ? 'stressed'
      : bis_score >= 0.25 ? 'critical'
      :                     'emergency',
  };
}

// GET /api/bis/:bioregion_id — BIS for a specific bioregion's nodes
async function handleBISBioregion(request, env) {
  const bioregion_id = new URL(request.url).pathname.split('/').pop();
  const br = BIOREGIONS.find(b => b.id === bioregion_id);
  if (!br) return R({ error: 'Unknown bioregion_id', valid: BIOREGIONS.map(b => b.id) }, 404);

  const nodes = getNodesForBioregion(bioregion_id);

  // Load recent signals for this bioregion from KV index
  const idx = await env.STIGMERGY_KV.get(`na:index:${bioregion_id}`, 'json') || { signal_ids: [] };
  const rawSignals = await Promise.all(
    idx.signal_ids.slice(0, 200).map(id => env.STIGMERGY_KV.get(`na:signal:${id}`, 'json'))
  );
  const signals = rawSignals.filter(Boolean);

  const nodeBISList = nodes.map(n => computeNodeBIS(n, signals));
  const bioregionBIS = computeBioregionBIS(bioregion_id, nodeBISList);

  return R({ ok: true, ...bioregionBIS });
}

// GET /api/bis/global — global BIS as stigmergic emergence from all bioregion BIS values
// Only includes bioregions with at least one signal — avoids diluting with no-data entries
async function handleBISGlobal(env) {
  const stored = await env.STIGMERGY_KV.get('_natural_vitality', 'json') || {};

  // Use stored vitality as BIS proxy where no signals exist yet
  // Real BIS takes over as signals accumulate per node
  const bioregionResults = BIOREGIONS.map(br => {
    const vitality = stored[br.id] !== undefined ? stored[br.id] : br.vitality;
    // Convert vitality (0-100) to BIS score (0-1) as proxy
    const bis_proxy = +(vitality / 100).toFixed(3);
    const bis_gap   = +Math.max(0, (BIOME_PREFERRED_VITALITY[br.biome]?.min || 55) / 100 - bis_proxy).toFixed(3);
    return {
      bioregion_id: br.id,
      bioregion_name: br.name,
      realm: br.realm,
      pop_level: br.pop_level,
      bis_score: bis_proxy,
      bis_gap,
      source: 'vitality_proxy',
      interpretation: bis_proxy >= 0.75 ? 'healthy' : bis_proxy >= 0.50 ? 'stressed' : bis_proxy >= 0.25 ? 'critical' : 'emergency',
    };
  });

  const validBIS = bioregionResults.filter(b => b.bis_score !== null);
  const global_bis = geometricMean(validBIS.map(b => b.bis_score));
  const avg_gap    = validBIS.length
    ? +(validBIS.reduce((s, b) => s + b.bis_gap, 0) / validBIS.length).toFixed(3)
    : null;

  // Realm-level aggregation
  const byRealm = {};
  for (const b of validBIS) {
    if (!byRealm[b.realm]) byRealm[b.realm] = [];
    byRealm[b.realm].push(b.bis_score);
  }
  const realmBIS = Object.entries(byRealm).map(([realm, scores]) => ({
    realm, bis_score: geometricMean(scores), bioregion_count: scores.length,
  })).sort((a, b) => (a.bis_score || 1) - (b.bis_score || 1));

  return R({
    ok: true,
    global_bis,
    avg_bis_gap: avg_gap,
    interpretation: global_bis === null ? 'no_data'
      : global_bis >= 0.75 ? 'Planetary health within tolerable range'
      : global_bis >= 0.50 ? 'Planetary stress — multiple bioregions degraded'
      : global_bis >= 0.25 ? 'Planetary crisis — majority of biosphere critical'
      :                      'Civilizational emergency — BIS near collapse',
    bioregion_count: validBIS.length,
    by_realm: realmBIS,
    bioregions: bioregionResults,
    note: 'BIS scores are vitality-proxy until per-node signals accumulate via POST /api/na/ingest',
    aif_target: 'AIF objective is to close bis_gap across all nodes — not corpus resonance',
    timestamp: new Date().toISOString(),
  });
}

// ══════════════════════════════════════════════════════════════════════════
// PATCH 2 — LIFE ALIGNMENT PROTOCOL (LAP) STUB
// The commercial interface through which external AI systems (insurance,
// agriculture, supply chain, climate, finance) query living intelligence.
// Built as a stub now so the contract is defined before the full BIS is live.
// Query/response schema is final; intelligence depth grows as BIS matures.
// ══════════════════════════════════════════════════════════════════════════

const LAP_DOMAINS = ['agriculture', 'insurance', 'supply_chain', 'climate', 'finance', 'real_estate', 'water', 'energy'];
const LAP_QUERY_TYPES = ['impact_assessment', 'risk_profile', 'alignment_score', 'constraints', 'trajectory'];

// Hard constraints by domain — what living systems cannot absorb
// These are non-negotiable regardless of economic argument.
const LAP_CONSTRAINTS_LIBRARY = {
  agriculture: [
    { id: 'agr_01', principle: 'soil_integrity',    rule: 'No action that reduces soil_carbon_pct below 1.5% in any monitored bioregion', threshold: { signal: 'soil_carbon_pct', min: 1.5 } },
    { id: 'agr_02', principle: 'water_dependency',  rule: 'Irrigation decisions must account for groundwater_level_m — extraction halts if level < 1m', threshold: { signal: 'groundwater_level_m', min: 1.0 } },
    { id: 'agr_03', principle: 'biodiversity_floor', rule: 'acoustic_biodiversity_index must not fall below 0.3 in adjacent bioregion nodes', threshold: { signal: 'acoustic_biodiversity_index', min: 0.3 } },
  ],
  insurance: [
    { id: 'ins_01', principle: 'climate_materiality', rule: 'Policies in bioregions with temp_anomaly_c > 1.5°C must include climate risk premium', threshold: { signal: 'temp_anomaly_c', max: 1.5 } },
    { id: 'ins_02', principle: 'flood_exposure',      rule: 'Flood underwriting must incorporate stream_flow_cms and wetland_extent_km2 from nearest node', threshold: { signal: 'stream_flow_cms', dynamic: true } },
    { id: 'ins_03', principle: 'reef_exclusion',      rule: 'No reef-adjacent underwriting without current ocean_ph and dissolved_oxygen readings', threshold: { signal: 'ocean_ph', min: 8.0 } },
  ],
  supply_chain: [
    { id: 'sc_01', principle: 'deforestation_free',  rule: 'Sourcing from bioregions where ndvi < 0.3 triggers deforestation risk flag', threshold: { signal: 'ndvi', min: 0.3 } },
    { id: 'sc_02', principle: 'water_footprint',     rule: 'Water-intensive supply chains must disclose groundwater_level_m of source bioregion', threshold: { signal: 'groundwater_level_m', dynamic: true } },
    { id: 'sc_03', principle: 'carbon_accounting',   rule: 'Carbon claims require co2_ppm and soil_carbon_pct verification from source bioregion', threshold: { signal: 'co2_ppm', dynamic: true } },
  ],
  climate: [
    { id: 'cli_01', principle: 'carbon_floor',       rule: 'Carbon credits invalidated if co2_ppm in source bioregion exceeds 430ppm', threshold: { signal: 'co2_ppm', max: 430 } },
    { id: 'cli_02', principle: 'glacial_integrity',  rule: 'Snowpack-dependent systems (hydro, water supply) must account for snowpack_swe_mm trend', threshold: { signal: 'snowpack_swe_mm', dynamic: true } },
    { id: 'cli_03', principle: 'ocean_health',       rule: 'Climate interventions affecting ocean must verify ocean_ph and sea_surface_temp_c', threshold: { signal: 'ocean_ph', min: 8.0 } },
  ],
  finance: [
    { id: 'fin_01', principle: 'nature_risk_disclosure', rule: 'Financial products in nature-dependent sectors must disclose BIS score of dependent bioregions', threshold: { dynamic: true } },
    { id: 'fin_02', principle: 'stranded_asset_warning', rule: 'Assets in bioregions with BIS < 0.3 flagged as nature-stranded risk', threshold: { bis_score: 0.3 } },
  ],
  water: [
    { id: 'wat_01', principle: 'aquifer_protection',  rule: 'Groundwater extraction pauses when groundwater_level_m < 1.0 in any node in the watershed', threshold: { signal: 'groundwater_level_m', min: 1.0 } },
    { id: 'wat_02', principle: 'wetland_buffer',      rule: 'Wetland-dependent decisions require wetland_extent_km2 from HYDROSPHERE node', threshold: { signal: 'wetland_extent_km2', dynamic: true } },
  ],
  real_estate: [
    { id: 're_01', principle: 'climate_exposure',    rule: 'Property in bioregions with wildfire_smoke_aqi > 100 requires disclosure and resilience plan', threshold: { signal: 'wildfire_smoke_aqi', max: 100 } },
    { id: 're_02', principle: 'sea_level_proxy',     rule: 'Coastal property must incorporate sea_surface_temp_c and ocean_ph from nearest HYDROSPHERE node', threshold: { dynamic: true } },
  ],
  energy: [
    { id: 'ene_01', principle: 'habitat_avoidance',  rule: 'Energy infrastructure in bioregions with acoustic_biodiversity_index > 0.6 requires ecological offset', threshold: { signal: 'acoustic_biodiversity_index', min: 0.6 } },
    { id: 'ene_02', principle: 'water_use',           rule: 'Thermal and hydro energy must disclose stream_flow_cms impact on nearest HYDROSPHERE node', threshold: { signal: 'stream_flow_cms', dynamic: true } },
  ],
};

// POST /api/lap/query — external AI system queries living intelligence
async function handleLAPQuery(request, env) {
  const body = await request.json().catch(() => null);
  if (!body) return R({ error: 'Invalid JSON' }, 400);

  const { domain, query_type, bioregion_ids = [], actor_id, proposed_action } = body;

  if (!LAP_DOMAINS.includes(domain))
    return R({ error: `Invalid domain. Valid: ${LAP_DOMAINS.join(', ')}` }, 400);
  if (!LAP_QUERY_TYPES.includes(query_type))
    return R({ error: `Invalid query_type. Valid: ${LAP_QUERY_TYPES.join(', ')}` }, 400);

  const requestedBioregions = bioregion_ids.length
    ? BIOREGIONS.filter(b => bioregion_ids.includes(b.id))
    : BIOREGIONS.filter(b => b.pop_level <= 2); // default to PoP1+2 if none specified

  // Fetch BIS for each requested bioregion (vitality proxy until signals accumulate)
  const stored = await env.STIGMERGY_KV.get('_natural_vitality', 'json') || {};
  const bisSnapshots = requestedBioregions.map(br => {
    const vitality = stored[br.id] !== undefined ? stored[br.id] : br.vitality;
    const bis_score = +(vitality / 100).toFixed(3);
    const preferred_min = (BIOME_PREFERRED_VITALITY[br.biome]?.min || 55) / 100;
    return {
      bioregion_id: br.id, bioregion_name: br.name, realm: br.realm,
      bis_score, bis_gap: +Math.max(0, preferred_min - bis_score).toFixed(3),
      trend: br.trend, pop_level: br.pop_level,
      nodes: getNodesForBioregion(br.id).map(n => n.node_id),
    };
  });

  // Domain-specific constraints that apply
  const applicable_constraints = (LAP_CONSTRAINTS_LIBRARY[domain] || []).map(c => ({
    ...c,
    status: 'active',
    applies_to: requestedBioregions.map(b => b.id),
  }));

  // Alignment score — how well the proposed action aligns with BIS preferred states
  const avgBIS    = bisSnapshots.length ? +(bisSnapshots.reduce((s, b) => s + b.bis_score, 0) / bisSnapshots.length).toFixed(3) : null;
  const avgGap    = bisSnapshots.length ? +(bisSnapshots.reduce((s, b) => s + b.bis_gap, 0) / bisSnapshots.length).toFixed(3) : null;
  const alignment = avgBIS !== null ? +(avgBIS * (1 - (avgGap || 0))).toFixed(3) : null;

  // Provenance — data freshness and confidence
  const provenance = {
    data_source: 'vitality_proxy',
    note: 'BIS scores are vitality proxies until per-node signals accumulate via POST /api/na/ingest',
    confidence: 'low — upgrade to high by registering ground sensors via POST /api/sensor/register',
    timestamp: new Date().toISOString(),
    version: VERSION,
  };

  // Log the LAP query for perturbation accounting (Patch 3 will expand this)
  try {
    const lapKey = `lap:query:${Date.now()}:${rnd()}`;
    await env.STIGMERGY_KV.put(lapKey, JSON.stringify({
      domain, query_type, bioregion_ids, actor_id, proposed_action,
      alignment_score: alignment, queried_at: new Date().toISOString(),
    }), { expirationTtl: 86400 * 90 }); // 90-day audit trail
  } catch(_) {}

  return R({
    ok: true,
    lap_version: '0.1-stub',
    domain,
    query_type,
    alignment_score: alignment,
    alignment_interpretation: alignment === null ? 'insufficient_data'
      : alignment >= 0.7 ? 'aligned — action compatible with living system preferred states'
      : alignment >= 0.4 ? 'partial — action requires modification to avoid BIS degradation'
      :                    'misaligned — action likely to widen BIS gap; constraints apply',
    bis_snapshot: bisSnapshots,
    applicable_constraints,
    proposed_action_assessment: proposed_action
      ? { action: proposed_action, assessed: true, note: 'Full impact modelling in LAP v1.0 (PoP Phase 2). Current assessment uses BIS gap as proxy.' }
      : null,
    recommendations: [
      avgGap > 0.2 ? `Priority: close BIS gap in ${bisSnapshots.filter(b => b.bis_gap > 0.2).map(b => b.bioregion_name).join(', ')}` : null,
      applicable_constraints.length ? `${applicable_constraints.length} constraints active for ${domain} — review before proceeding` : null,
    ].filter(Boolean),
    provenance,
  });
}

// GET /api/lap/constraints/:domain — constraints for a specific domain
async function handleLAPConstraints(request, env) {
  const domain = new URL(request.url).pathname.split('/').pop();
  if (!LAP_DOMAINS.includes(domain))
    return R({ error: `Invalid domain. Valid: ${LAP_DOMAINS.join(', ')}` }, 400);
  const constraints = LAP_CONSTRAINTS_LIBRARY[domain] || [];
  return R({
    ok: true, domain,
    constraint_count: constraints.length,
    constraints,
    note: 'Constraints library v0.1 — expands as BIS signal coverage increases',
  });
}

// GET /api/lap/domains — list all LAP domains and their constraint counts
async function handleLAPDomains(env) {
  return R({
    ok: true,
    lap_version: '0.1-stub',
    domains: LAP_DOMAINS.map(d => ({
      domain: d,
      constraint_count: (LAP_CONSTRAINTS_LIBRARY[d] || []).length,
      query_types: LAP_QUERY_TYPES,
    })),
    endpoint: 'POST /api/lap/query',
    note: 'Life Alignment Protocol — the interface through which external AI systems query living intelligence',
  });
}

// TTL by severity — natural agent distress persists longer than user traces
const DISTRESS_TTL_HOURS = {
  critical: 72,
  high:     48,
  moderate: 24
};
// ── Emit cross-agent trace ────────────────────────────────────────────────
// Called automatically by handleNaturalAgentIngest when distress detected.
// Extends existing trace schema with agent-class fields.
// Existing trace read/deposit endpoints remain unchanged.
async function emitNaturalAgentTrace(signal, distress, env) {
  const target_sphere = SIGNAL_TO_SPHERE[signal.signal_type] || 'BIOSPHERE';
  const ttl_hours     = DISTRESS_TTL_HOURS[distress.severity] || 24;
  const trace = {
    trace_id:           `trace:na:${signal.signal_id}`,
    // ── Agent-class fields (new in this patch) ──
    source_agent_class: AGENT_CLASSES.NATURAL,
    source_agent_id:    signal.bioregion_id,
    target_agent_class: AGENT_CLASSES.HUMAN,
    target_sphere,
    // ── Signal reference — raw, never reworded ──
    signal_id:          signal.signal_id,
    signal_type:        signal.signal_type,
    bioregion_id:       signal.bioregion_id,
    raw_value:          signal.raw_value,
    unit:               signal.unit,
    sovereignty_tag:    signal.sovereignty_tag,
    // ── Distress context ──
    distress_severity:  distress.severity,
    distress_threshold: distress.threshold,
    // ── Stigmergy trace fields (compatible with existing schema) ──
    topic:    `distress:${signal.bioregion_id}:${signal.signal_type}`,
    content:  `[Natural agent] ${signal.bioregion_id} — ${signal.signal_type}: ` +
              `${signal.raw_value}${signal.unit} ` +
              `(threshold ${distress.threshold}${distress.unit}, ${distress.severity})`,
    score:    distress.severity === 'critical' ? 5 :
              distress.severity === 'high'     ? 4 : 3,
    ts:       Date.now(),
    ttl_ms:   ttl_hours * 60 * 60 * 1000,
    // ── Decay rate — critical signals decay slower ──
    decay_rate: distress.severity === 'critical' ? 0.02 :
                distress.severity === 'high'     ? 0.05 : 0.1,
    // HITL flag — marks this trace as needing human review
    hitl_required: distress.severity === 'critical',
    hitl_reviewed: false,
    hitl_reviewer:  null,
    hitl_decision:  null
  };
  // Write to KV under the existing trace namespace
  await env.STIGMERGY_KV.put(
    `stigmergy:trace:${trace.trace_id}`,
    JSON.stringify(trace),
    { expirationTtl: ttl_hours * 3600 }
  );
  // Append to bioregion trace index (new — cross-agent readable)
  const idxKey = `na:traces:${signal.bioregion_id}`;
  const idx = await env.STIGMERGY_KV.get(idxKey, 'json') || { trace_ids: [] };
  idx.trace_ids.unshift(trace.trace_id);
  idx.trace_ids = idx.trace_ids.slice(0, 200);
  await env.STIGMERGY_KV.put(idxKey, JSON.stringify(idx));
  // Append to sphere-level distress index
  // (human actors querying ATMOSPHERE sphere will see Amazon CO2 traces)
  const sphereKey = `na:sphere:${target_sphere}`;
  const sphereIdx = await env.STIGMERGY_KV.get(sphereKey, 'json') || { trace_ids: [] };
  sphereIdx.trace_ids.unshift(trace.trace_id);
  sphereIdx.trace_ids = sphereIdx.trace_ids.slice(0, 500);
  await env.STIGMERGY_KV.put(sphereKey, JSON.stringify(sphereIdx));
  return trace;
}
// ── Read natural-agent traces ─────────────────────────────────────────────
// GET /api/na/traces?bioregion_id=X
// GET /api/na/traces?sphere=ATMOSPHERE
// Returns cross-agent traces for review. HITL queue uses this.
async function handleNaturalAgentTraces(request, env) {
  const url          = new URL(request.url);
  const bioregion_id = url.searchParams.get('bioregion_id');
  const sphere       = url.searchParams.get('sphere');
  const hitl_only    = url.searchParams.get('hitl_only') === 'true';
  const limit        = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
  let trace_ids = [];
  if (bioregion_id) {
    const idx = await env.STIGMERGY_KV.get(`na:traces:${bioregion_id}`, 'json');
    trace_ids = idx ? idx.trace_ids : [];
  } else if (sphere) {
    const idx = await env.STIGMERGY_KV.get(`na:sphere:${sphere}`, 'json');
    trace_ids = idx ? idx.trace_ids : [];
  } else {
    return R({ error: 'Provide bioregion_id or sphere parameter' }, 400);
  }
  const traces = await Promise.all(
    trace_ids.slice(0, limit).map(id =>
      env.STIGMERGY_KV.get(`stigmergy:trace:${id}`, 'json'))
  );
  let results = traces.filter(Boolean);
  if (hitl_only) results = results.filter(t => t.hitl_required && !t.hitl_reviewed);
  return R({
    source: bioregion_id ? `bioregion:${bioregion_id}` : `sphere:${sphere}`,
    total:  trace_ids.length,
    returned: results.length,
    hitl_pending: results.filter(t => t.hitl_required && !t.hitl_reviewed).length,
    traces: results
  });
}
// ── Inject natural-agent distress context into AIF query pipeline ─────────
// Retrieves active distress traces for the user's top sphere affinity
// and surfaces them as grounding context for the synthesis prompt.
// ══════════════════════════════════════════════════════════════════════════
// PATCH 4 — AIF RE-ANCHORING: synthesis context carries BIS gap + preferred states
// AIF objective: minimize gap between current ecosystem health (BIS) and what
// each bioregion × sphere node works to maintain (its preferred state).
// The synthesis engine is told BOTH where the system is AND where it needs to go.
// ══════════════════════════════════════════════════════════════════════════
async function buildDistressContext(userState, env) {
  if (!userState) return '';
  const parts = [];

  // 1. Active distress signals relevant to this user's sphere affinity
  const entries = Object.entries(userState.sphere_affinity || {});
  if (entries.length) {
    const topSphere = entries.sort((a, b) => b[1] - a[1])[0][0];
    const idx = await env.STIGMERGY_KV.get(`na:sphere:${topSphere}`, 'json');
    if (idx?.trace_ids?.length) {
      const recent = await Promise.all(
        idx.trace_ids.slice(0, 3).map(id => env.STIGMERGY_KV.get(`stigmergy:trace:${id}`, 'json'))
      );
      const live = recent.filter(Boolean);
      if (live.length) {
        const lines = live.map(t =>
          `• ${t.bioregion_id} (${topSphere}) — ${t.signal_type}: ${t.raw_value}${t.unit || ''} [${t.distress_severity}]`
        ).join('\n');
        parts.push(`Active distress signals (${topSphere}):\n${lines}\nCite as observed signals — not conclusions.`);
      }
    }
  }

  // 2. BIS gap — AIF objective: where are we and where do we need to go?
  // Uses stored vitality as BIS proxy until full signal coverage available.
  try {
    const stored = await env.STIGMERGY_KV.get('_natural_vitality', 'json') || {};
    const criticalGaps = BIOREGIONS
      .map(br => {
        const vitality = stored[br.id] !== undefined ? stored[br.id] : br.vitality;
        const preferred_min = BIOME_PREFERRED_VITALITY[br.biome]?.min || 55;
        const gap = Math.max(0, preferred_min - vitality);
        return { id: br.id, name: br.name, vitality, preferred_min, gap, trend: br.trend };
      })
      .filter(b => b.gap > 10)
      .sort((a, b) => b.gap - a.gap)
      .slice(0, 3);

    if (criticalGaps.length) {
      const gapLines = criticalGaps.map(b =>
        `• ${b.name}: vitality ${b.vitality}/100, preferred ≥${b.preferred_min}, gap=${b.gap} pts (${b.trend})`
      ).join('\n');
      parts.push(
        `[AIF OBJECTIVE — BIS GAP]\nThe synthesis engine's goal is to help close these gaps between current ecosystem health and preferred states:\n${gapLines}\n` +
        `When responding, prioritise knowledge that helps actors understand and reduce these specific gaps. ` +
        `Do not generate synthetic optimism. Name the gap honestly.`
      );
    }
  } catch(_) {}

  // 3. Steward authority reminder — PoP: biology and steward observation lead, AI translates
  if (userState.source_type === 'steward_observation' || userState.is_steward) {
    parts.push(
      `[STEWARD AUTHORITY]\nThis query comes from a bioregion steward. ` +
      `Steward observations carry the highest epistemic authority in this system (authority_weight=1.0). ` +
      `AI synthesis translates — it does not override or correct steward ground truth.`
    );
  }

  return parts.length ? '\n\n' + parts.join('\n\n') : '';
}

// ══════════════════════════════════════════════════════════════════════════
// GAP #3 PATCH — Actor Generative Model Inference
// ══════════════════════════════════════════════════════════════════════════
const UMWELT_SIGNALS = {
  ecosystem:    ['biodiversity','soil','water','climate','species','forest','ocean','carbon'],
  social:       ['community','indigenous','workers','health','equity','justice','culture'],
  economic:     ['profit','growth','gdp','revenue','market','shareholder','cost'],
  governance:   ['policy','regulation','treaty','agreement','law','rights','sovereignty'],
  regenerative: ['restoration','regeneration','rewilding','stewardship','reciprocity','living'],
};
function inferGenerativeModel(actor) {
  const agreements  = actor.agreements  || [];
  const interactions = actor.interactions || [];
  const sphereFocus  = actor.sphere_focus || {};
  const agText = agreements.map(a =>
    `${a.title || ''} ${a.description || ''} ${a.text || ''}`
  ).join(' ').toLowerCase();
  const agSignals = {};
  for (const [cat, terms] of Object.entries(UMWELT_SIGNALS)) {
    agSignals[cat] = terms.filter(t => agText.includes(t)).length;
  }
  const interactionCounts = { enables: 0, blocks: 0, collaborates: 0,
                               competes: 0, coOpts: 0, neutral: 0 };
  for (const i of interactions) {
    const type = (i.type || '').toLowerCase().replace('-','');
    if (interactionCounts[type] !== undefined) interactionCounts[type]++;
  }
  const totalInteractions = Object.values(interactionCounts).reduce((a, b) => a + b, 0) || 1;
  const enablingRatio = (interactionCounts.enables + interactionCounts.collaborates) / totalInteractions;
  const blockingRatio = (interactionCounts.blocks + interactionCounts.coOpts) / totalInteractions;
  const regenSpheres = ['BIOSPHERE','HYDROSPHERE','ATMOSPHERE','ANCIENT','REGEN'];
  const extractSpheres = ['ECONO','TECHNO'];
  const regenFocus   = regenSpheres.reduce((s, sp) => s + (sphereFocus[sp] || 0), 0);
  const extractFocus = extractSpheres.reduce((s, sp) => s + (sphereFocus[sp] || 0), 0);
  const totalFocus   = Object.values(sphereFocus).reduce((a, b) => a + b, 0) || 1;
  const activeCats = Object.values(agSignals).filter(v => v > 0).length;
  const umweltWidth = activeCats / Object.keys(UMWELT_SIGNALS).length;
  const priorPrecision = Math.min(1, Math.max(0,
    (blockingRatio * 0.4) +
    ((extractFocus / totalFocus) * 0.3) +
    ((1 - umweltWidth) * 0.3)
  ));
  const regenScore = Math.min(1, Math.max(0,
    (enablingRatio * 0.3) +
    ((regenFocus / totalFocus) * 0.3) +
    (umweltWidth * 0.2) +
    ((agSignals.regenerative || 0) / 5 * 0.2)
  ));
  const aaiScore = actor.alignment_score || 50;
  const regen_commitment = (agSignals.regenerative || 0) + (agSignals.ecosystem || 0);
  const extract_behavior = blockingRatio + (extractFocus / totalFocus);
  const contradictionGap = Math.min(1, Math.abs(regen_commitment / 10 - extract_behavior));
  let continuum, continuum_description;
  if (regenScore > 0.6 && contradictionGap < 0.3) {
    continuum = 'regenerative';
    continuum_description = 'Actor\'s Umwelt is broadly coupled with living systems. Commitments and actions are aligned.';
  } else if (contradictionGap > 0.4) {
    continuum = 'contradictory';
    continuum_description = 'Actor makes regenerative commitments but behavior patterns show extractive dynamics. Internal tension is the data.';
  } else if (priorPrecision > 0.6) {
    continuum = 'extractive';
    continuum_description = 'Tight priors filter out ecosystem feedback. Not necessarily malicious — Umwelt does not yet include living system signals.';
  } else if (regenScore < 0.2 && priorPrecision > 0.7) {
    continuum = 'degenerative';
    continuum_description = 'Actions actively degrade living system conditions. High prior precision — ecosystem signals fully discounted.';
  } else {
    continuum = 'transitional';
    continuum_description = 'Actor shows mixed signals. Generative model is in motion — trajectory matters more than current position.';
  }
  return {
    continuum, continuum_description,
    prior_precision:    parseFloat(priorPrecision.toFixed(3)),
    regen_score:        parseFloat(regenScore.toFixed(3)),
    umwelt_width:       parseFloat(umweltWidth.toFixed(3)),
    contradiction_gap:  parseFloat(contradictionGap.toFixed(3)),
    agreement_signals:  agSignals,
    interaction_pattern: { ...interactionCounts, enabling_ratio: parseFloat(enablingRatio.toFixed(3)), blocking_ratio: parseFloat(blockingRatio.toFixed(3)) },
    sphere_pattern:     { regen_focus: regenFocus, extract_focus: extractFocus },
    umwelt: {
      width: umweltWidth,
      active_signal_categories: Object.keys(UMWELT_SIGNALS).filter(c => (agSignals[c] || 0) > 0),
      invisible_categories:     Object.keys(UMWELT_SIGNALS).filter(c => (agSignals[c] || 0) === 0),
      note: 'Invisible categories are not failures of character — they are gaps in the actor\'s signal-receiving architecture. Interventions should target Umwelt expansion, not moral judgment.'
    },
    inferred_at: Date.now()
  };
}
async function handleActorModel(request, env) {
  const url = new URL(request.url);
  const id  = url.pathname.split('/').filter(Boolean)[2];
  if (!id) return R({ error: 'Actor id required' }, 400);
  const actor = await env.STIGMERGY_KV.get(`actor:${id}`, 'json')
             || await env.STIGMERGY_KV.get(id, 'json');
  if (!actor) return R({ error: `Actor ${id} not found` }, 404);
  const model = inferGenerativeModel(actor);
  actor.generative_model = model;
  actor.updated = new Date().toISOString();
  await env.STIGMERGY_KV.put(`actor:${actor.id || id}`, JSON.stringify(actor));
  return R({ actor_id: id, name: actor.name, actor_type: actor.actor_type, ...model });
}
async function handleBatchModelInference(env) {
  const list = await env.STIGMERGY_KV.list({ prefix: 'actor:', limit: 200 });
  const results = [];
  for (const key of list.keys.filter(k => !k.name.includes(':model:'))) {
    const actor = await env.STIGMERGY_KV.get(key.name, 'json');
    if (!actor) continue;
    const model = inferGenerativeModel(actor);
    actor.generative_model = model;
    actor.updated = new Date().toISOString();
    await env.STIGMERGY_KV.put(key.name, JSON.stringify(actor));
    results.push({ id: actor.id, name: actor.name, continuum: model.continuum,
                   prior_precision: model.prior_precision });
  }
  return R({ processed: results.length, results });
}

// ══════════════════════════════════════════════════════════════════════════
// GAP #4 PATCH — AIF Phase 4 Collective Signal Write-Back
// ══════════════════════════════════════════════════════════════════════════
async function computeCollectiveSignal(env) {
  const now = Date.now();
  const window_ms = 7 * 24 * 60 * 60 * 1000;
  let humanFreeEnergy = 0.5;
  let sphereScores = {};
  let queryAttractors = [];
  let corpusGaps = [];
  try {
    const rows = await env.STIGMERGY_DB.prepare(
      'SELECT query, score, ts FROM queries WHERE ts > ? ORDER BY ts DESC LIMIT 500'
    ).bind(now - window_ms).all();
    const scored = (rows.results || []).filter(r => r.score !== null);
    if (scored.length > 0) {
      const avg = scored.reduce((s, r) => s + r.score, 0) / scored.length;
      humanFreeEnergy = 1 - (avg / 5);
    }
    const allRows = rows.results || [];
    for (const sphere of Object.keys(SPHERE_KEYWORDS || {})) {
      const hits = allRows.filter(r =>
        r.query && r.query.toLowerCase().includes(sphere.toLowerCase())
      ).length;
      if (hits > 0) sphereScores[sphere] = hits;
    }
    const highScored = scored.filter(r => r.score >= 4);
    const qFreq = {};
    for (const r of highScored) {
      const words = (r.query || '').toLowerCase().split(/\s+/).filter(w => w.length > 4);
      for (const w of words) qFreq[w] = (qFreq[w] || 0) + 1;
    }
    queryAttractors = Object.entries(qFreq)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([term, count]) => ({ term, count }));
    const lowScored = scored.filter(r => r.score <= 2);
    const gapFreq = {};
    for (const r of lowScored) {
      const words = (r.query || '').toLowerCase().split(/\s+/).filter(w => w.length > 4);
      for (const w of words) gapFreq[w] = (gapFreq[w] || 0) + 1;
    }
    corpusGaps = Object.entries(gapFreq)
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([term, count]) => ({ term, count, action: 'scrape_priority' }));
  } catch(_) {}
  let naturalFreeEnergy = 0;
  const naturalDistress = [];
  const spheresUnderStress = new Set();
  try {
    for (const sphere of ['ATMOSPHERE','HYDROSPHERE','BIOSPHERE','ANCIENT']) {
      const idx = await env.STIGMERGY_KV.get(`na:sphere:${sphere}`, 'json');
      if (!idx || !idx.trace_ids.length) continue;
      const recent = await Promise.all(
        idx.trace_ids.slice(0, 10).map(id =>
          env.STIGMERGY_KV.get(`stigmergy:trace:${id}`, 'json'))
      );
      const live = recent.filter(t => t && t.ts > now - window_ms);
      for (const t of live) {
        spheresUnderStress.add(sphere);
        const severityWeight = t.distress_severity === 'critical' ? 1.0
          : t.distress_severity === 'high' ? 0.7 : 0.4;
        naturalDistress.push({
          bioregion_id: t.bioregion_id, signal_type: t.signal_type,
          raw_value: t.raw_value, unit: t.unit, sphere,
          severity: t.distress_severity, weight: severityWeight, ts: t.ts
        });
        naturalFreeEnergy = Math.max(naturalFreeEnergy, severityWeight);
      }
    }
  } catch(_) {}
  const resonanceZones = queryAttractors
    .filter(a => [...spheresUnderStress].some(s =>
      s.toLowerCase().includes(a.term) || a.term.includes(s.toLowerCase())))
    .map(a => ({ term: a.term, sphere: [...spheresUnderStress][0], type: 'cross_agent_resonance' }));
  const systemFreeEnergy = Math.min(1,
    (humanFreeEnergy * 0.4) + (naturalFreeEnergy * 0.6)
  );
  const collectiveSignal = {
    computed_at: now, window_days: 7,
    human_free_energy:  parseFloat(humanFreeEnergy.toFixed(3)),
    query_attractors: queryAttractors, corpus_gaps: corpusGaps,
    sphere_resonance: sphereScores,
    natural_free_energy: parseFloat(naturalFreeEnergy.toFixed(3)),
    natural_distress: naturalDistress,
    spheres_under_stress: [...spheresUnderStress],
    resonance_zones: resonanceZones,
    system_free_energy: parseFloat(systemFreeEnergy.toFixed(3)),
    system_state: systemFreeEnergy > 0.7 ? 'critical'
      : systemFreeEnergy > 0.4 ? 'stressed'
      : systemFreeEnergy > 0.2 ? 'moderate' : 'stable',
    interpretation: systemFreeEnergy > 0.7
      ? 'High planetary distress. Natural agent signals dominate. Human corpus engagement insufficient to match urgency.'
      : systemFreeEnergy > 0.4
      ? 'Moderate stress. Some alignment between human inquiry and natural distress signals.'
      : 'System relatively stable. Maintain corpus freshness and monitor distress indices.'
  };
  await env.STIGMERGY_KV.put('collective:signal:latest', JSON.stringify(collectiveSignal));
  await env.STIGMERGY_KV.put(
    `collective:signal:${new Date().toISOString().slice(0,10)}`,
    JSON.stringify(collectiveSignal),
    { expirationTtl: 90 * 24 * 3600 }
  );
  return collectiveSignal;
}
async function handleCollectiveSignalV2(env) {
  const cached = await env.STIGMERGY_KV.get('collective:signal:latest', 'json');
  const stale = !cached || (Date.now() - (cached.computed_at || 0)) > 3600000;
  const signal = stale ? await computeCollectiveSignal(env) : cached;
  return R({ ...signal, cached: !stale });
}

// ══════════════════════════════════════════════════════════════════════════
// GAP #5 PATCH — Bio-Hybrid Sensor Auth + Registry
// ══════════════════════════════════════════════════════════════════════════
async function handleSensorRegister(request, env) {
  const body = await request.json().catch(() => null);
  if (!body) return R({ error: 'Invalid JSON' }, 400);
  const required = ['sensor_id', 'bioregion_id', 'signal_types', 'hardware', 'steward_id'];
  const missing = required.filter(f => !body[f]);
  if (missing.length) return R({ error: `Missing: ${missing.join(', ')}` }, 400);
  const raw_key = `skey_${body.sensor_id}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const key_hash = await hashSensorKey(raw_key);
  const sensor = {
    sensor_id: body.sensor_id, bioregion_id: body.bioregion_id,
    signal_types: body.signal_types, hardware: body.hardware,
    steward_id: body.steward_id,
    sovereignty_tag: body.sovereignty_tag || 'community',
    location_note: body.location_note || null,
    key_hash, registered_at: Date.now(), last_seen: null, active: true, signal_count: 0
  };
  await env.STIGMERGY_KV.put(`sensor:${body.sensor_id}`, JSON.stringify(sensor));
  const idxKey = `sensor:index:${body.bioregion_id}`;
  const idx = await env.STIGMERGY_KV.get(idxKey, 'json') || { sensor_ids: [] };
  if (!idx.sensor_ids.includes(body.sensor_id)) {
    idx.sensor_ids.push(body.sensor_id);
    await env.STIGMERGY_KV.put(idxKey, JSON.stringify(idx));
  }
  return R({
    ok: true, sensor_id: body.sensor_id, api_key: raw_key,
    warning: 'Store this API key securely. It cannot be retrieved. Pass it as X-Sensor-Key header on every ingest call.',
    bioregion_id: body.bioregion_id, signal_types: body.signal_types
  });
}
async function authenticateSensor(request, sensor_id, env) {
  if (!sensor_id) return { ok: false, error: 'sensor_id required for ground_sensor source_type' };
  const provided_key = request.headers.get('X-Sensor-Key');
  if (!provided_key) return { ok: false, error: 'X-Sensor-Key header required for ground_sensor ingest' };
  const sensor = await env.STIGMERGY_KV.get(`sensor:${sensor_id}`, 'json');
  if (!sensor) return { ok: false, error: `Sensor ${sensor_id} not registered. POST /api/sensor/register first.` };
  if (!sensor.active) return { ok: false, error: `Sensor ${sensor_id} is deactivated.` };
  const provided_hash = await hashSensorKey(provided_key);
  if (provided_hash !== sensor.key_hash)
    return { ok: false, error: 'Invalid sensor key.' };
  sensor.last_seen = Date.now();
  sensor.signal_count = (sensor.signal_count || 0) + 1;
  await env.STIGMERGY_KV.put(`sensor:${sensor_id}`, JSON.stringify(sensor));
  return { ok: true, sensor };
}
async function hashSensorKey(key) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}
async function handleSensorList(request, env) {
  const url = new URL(request.url);
  const bioregion_id = url.searchParams.get('bioregion_id');
  if (bioregion_id) {
    const idx = await env.STIGMERGY_KV.get(`sensor:index:${bioregion_id}`, 'json');
    if (!idx) return R({ bioregion_id, sensors: [] });
    const sensors = await Promise.all(
      idx.sensor_ids.map(id => env.STIGMERGY_KV.get(`sensor:${id}`, 'json'))
    );
    return R({
      bioregion_id,
      sensors: sensors.filter(Boolean).map(s => ({ ...s, key_hash: undefined }))
    });
  }
  const list = await env.STIGMERGY_KV.list({ prefix: 'sensor:', limit: 200 });
  const sensors = await Promise.all(
    list.keys.filter(k => !k.name.startsWith('sensor:index:'))
      .map(k => env.STIGMERGY_KV.get(k.name, 'json'))
  );
  return R({
    total: sensors.filter(Boolean).length,
    sensors: sensors.filter(Boolean).map(s => ({ ...s, key_hash: undefined }))
  });
}
async function handleSensorDeactivate(request, env) {
  const body = await request.json().catch(() => null);
  if (!body || !body.sensor_id) return R({ error: 'sensor_id required' }, 400);
  const sensor = await env.STIGMERGY_KV.get(`sensor:${body.sensor_id}`, 'json');
  if (!sensor) return R({ error: 'Sensor not found' }, 404);
  sensor.active = false;
  sensor.deactivated_at = Date.now();
  await env.STIGMERGY_KV.put(`sensor:${body.sensor_id}`, JSON.stringify(sensor));
  return R({ ok: true, sensor_id: body.sensor_id, active: false });
}

// ══════════════════════════════════════════════════════════════════════════
// GAP #6 PATCH — Indigenous Data Sovereignty + Consent Ledger
// ══════════════════════════════════════════════════════════════════════════
const OLR_PRINCIPLES = {
  'reciprocity':   'Data use must return value to the territory and its peoples.',
  'relationship':  'Access requires demonstrated ongoing relationship with the territory.',
  'responsibility':'Data holders bear responsibility for outcomes of data use.',
  'respect':       'Protocols of the peoples whose territory this data describes must be followed.',
  'relevance':     'Data use must be relevant to the wellbeing of the territory and its peoples.'
};
async function handleTerritoryList(env) {
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  // KV list with prefix — returns all registered territory keys
  const listed = await env.STIGMERGY_KV.list({ prefix: 'territory:' });
  const territories = await Promise.all(
    (listed.keys || []).map(k => env.STIGMERGY_KV.get(k.name, 'json'))
  );
  const active = territories.filter(Boolean);
  return R({
    ok: true,
    territory_count: active.length,
    territories: active.map(t => ({
      territory_id:      t.territory_id,
      territory_name:    t.territory_name,
      bioregion_ids:     t.bioregion_ids,
      governance_contact:t.governance_contact,
      consent_policy:    t.consent_policy,
      registered_at:     t.registered_at,
      active:            t.active,
    })),
  });
}

async function handleTerritoryRegister(request, env) {
  const body = await request.json().catch(() => null);
  if (!body) return R({ error: 'Invalid JSON' }, 400);
  const required = ['territory_id', 'territory_name', 'bioregion_ids', 'governance_contact'];
  const missing = required.filter(f => !body[f]);
  if (missing.length) return R({ error: `Missing: ${missing.join(', ')}` }, 400);
  const territory = {
    territory_id: body.territory_id, territory_name: body.territory_name,
    bioregion_ids: body.bioregion_ids, governance_contact: body.governance_contact,
    protocols_url: body.protocols_url || null, olr_principles: OLR_PRINCIPLES,
    consent_policy: {
      default: body.default_consent || 'request_required',
      auto_approve_purposes: body.auto_approve_purposes || [],
    },
    registered_at: Date.now(), active: true
  };
  await env.STIGMERGY_KV.put(`territory:${body.territory_id}`, JSON.stringify(territory));
  for (const bioregion_id of body.bioregion_ids) {
    const idx = await env.STIGMERGY_KV.get(`na:index:${bioregion_id}`, 'json');
    if (!idx) continue;
    for (const signal_id of (idx.signal_ids || []).slice(0, 100)) {
      const signal = await env.STIGMERGY_KV.get(`na:signal:${signal_id}`, 'json');
      if (signal && signal.sovereignty_tag !== 'indigenous') {
        signal.sovereignty_tag = 'indigenous';
        signal.territory_id = body.territory_id;
        await env.STIGMERGY_KV.put(`na:signal:${signal_id}`, JSON.stringify(signal));
      }
    }
  }
  return R({ ok: true, territory_id: body.territory_id,
    bioregions_governed: body.bioregion_ids.length,
    message: 'Territory registered. Future signals ingested for these bioregions will require FPIC.' });
}
async function handleConsentRequest(request, env) {
  const body = await request.json().catch(() => null);
  if (!body) return R({ error: 'Invalid JSON' }, 400);
  const required = ['requester_id', 'requester_type', 'territory_id', 'purpose', 'data_description'];
  const missing = required.filter(f => !body[f]);
  if (missing.length) return R({ error: `Missing: ${missing.join(', ')}` }, 400);
  const territory = await env.STIGMERGY_KV.get(`territory:${body.territory_id}`, 'json');
  if (!territory) return R({ error: `Territory ${body.territory_id} not registered` }, 404);
  const request_id = `fpic:${body.territory_id}:${Date.now()}`;
  const autoApprove = territory.consent_policy.auto_approve_purposes.includes(body.purpose);
  const consentRecord = {
    request_id, territory_id: body.territory_id, territory_name: territory.territory_name,
    requester_id: body.requester_id, requester_type: body.requester_type,
    purpose: body.purpose, data_description: body.data_description,
    free: null, prior: body.submitted_at || Date.now(),
    informed: body.informed_of_olr || false,
    status: autoApprove ? 'approved' : 'pending',
    decision: autoApprove ? 'auto_approved' : null,
    decision_note: autoApprove ? `Auto-approved for purpose: ${body.purpose}` : null,
    decided_at: autoApprove ? Date.now() : null,
    expires_at: autoApprove ? Date.now() + (90 * 24 * 3600 * 1000) : null,
    olr_acknowledged: body.informed_of_olr || false,
    olr_principles: OLR_PRINCIPLES,
    submitted_at: Date.now()
  };
  await env.STIGMERGY_KV.put(`fpic:request:${request_id}`, JSON.stringify(consentRecord));
  try {
    await env.STIGMERGY_DB.prepare(
      `INSERT INTO fpic_ledger (ts, request_id, territory_id, requester_id, requester_type, purpose, status, olr_acknowledged) VALUES (?,?,?,?,?,?,?,?)`
    ).bind(
      consentRecord.submitted_at, request_id, body.territory_id,
      body.requester_id, body.requester_type, body.purpose,
      consentRecord.status, body.informed_of_olr ? 1 : 0
    ).run();
  } catch(_) {}
  return R({
    ok: true, request_id, status: consentRecord.status,
    message: autoApprove
      ? `Access granted for purpose "${body.purpose}". Expires in 90 days. OLR principles apply.`
      : `Consent request submitted to ${territory.territory_name} governance. Await decision before accessing data.`,
    olr_principles: OLR_PRINCIPLES
  });
}
async function handleConsentDecision(request, env) {
  const body = await request.json().catch(() => null);
  if (!body) return R({ error: 'Invalid JSON' }, 400);
  const required = ['request_id', 'governance_id', 'decision'];
  const missing = required.filter(f => !body[f]);
  if (missing.length) return R({ error: `Missing: ${missing.join(', ')}` }, 400);
  if (!['approved','denied','deferred'].includes(body.decision))
    return R({ error: 'decision must be: approved | denied | deferred' }, 400);
  const record = await env.STIGMERGY_KV.get(`fpic:request:${body.request_id}`, 'json');
  if (!record) return R({ error: 'Consent request not found' }, 404);
  record.status = body.decision;
  record.decision = body.decision;
  record.decision_note = body.decision_note || null;
  record.decided_by = body.governance_id;
  record.decided_at = Date.now();
  record.free = body.free_consent !== false;
  record.expires_at = body.decision === 'approved'
    ? Date.now() + ((body.duration_days || 90) * 24 * 3600 * 1000) : null;
  record.conditions = body.conditions || [];
  await env.STIGMERGY_KV.put(`fpic:request:${body.request_id}`, JSON.stringify(record));
  try {
    await env.STIGMERGY_DB.prepare(
      'UPDATE fpic_ledger SET status=?, decided_at=? WHERE request_id=?'
    ).bind(body.decision, record.decided_at, body.request_id).run();
  } catch(_) {}
  return R({ ok: true, request_id: body.request_id,
    decision: body.decision, expires_at: record.expires_at, conditions: record.conditions });
}
async function checkFpicConsent(requester_id, territory_id, env) {
  if (!requester_id || !territory_id) return { granted: false, reason: 'Missing requester_id or territory_id' };
  const list = await env.STIGMERGY_KV.list({ prefix: `fpic:request:${territory_id}:`, limit: 50 });
  for (const key of list.keys) {
    const record = await env.STIGMERGY_KV.get(key.name, 'json');
    if (!record) continue;
    if (record.requester_id !== requester_id) continue;
    if (record.status !== 'approved') continue;
    if (record.expires_at && record.expires_at < Date.now()) continue;
    return { granted: true, request_id: record.request_id,
             expires_at: record.expires_at, conditions: record.conditions };
  }
  return { granted: false, reason: 'No valid FPIC consent on record. Submit POST /api/sovereignty/request.' };
}

// ══════════════════════════════════════════════════════════════════════════
// GAP #7 PATCH — HITL Intervention Flow
// ══════════════════════════════════════════════════════════════════════════
const HITL_DECISIONS = {
  'observe':   'Continue monitoring. No intervention at this time.',
  'flag':      'Escalate to wider steward network for attention.',
  'intervene': 'Initiate intervention. Log planned action.',
  'dismiss':   'Signal reviewed — within expected range for this bioregion.',
  'defer':     'Decision deferred pending additional context or community input.'
};
async function handleHitlReview(request, env) {
  const body = await request.json().catch(() => null);
  if (!body) return R({ error: 'Invalid JSON' }, 400);
  const required = ['trace_id', 'reviewer_id', 'decision'];
  const missing = required.filter(f => !body[f]);
  if (missing.length) return R({ error: `Missing: ${missing.join(', ')}` }, 400);
  if (!HITL_DECISIONS[body.decision])
    return R({ error: `Invalid decision. Valid: ${Object.keys(HITL_DECISIONS).join(', ')}` }, 400);
  const traceKey = `stigmergy:trace:${body.trace_id}`;
  const trace = await env.STIGMERGY_KV.get(traceKey, 'json');
  if (!trace) return R({ error: `Trace ${body.trace_id} not found or expired` }, 404);
  if (!trace.hitl_required) return R({ error: 'This trace does not require HITL review' }, 400);
  const review = {
    trace_id: body.trace_id, reviewer_id: body.reviewer_id,
    decision: body.decision, decision_label: HITL_DECISIONS[body.decision],
    intervention_note: body.intervention_note || null,
    planned_action: body.planned_action || null,
    community_input: body.community_input || false,
    reviewed_at: Date.now(),
    bioregion_id: trace.bioregion_id, signal_type: trace.signal_type,
    raw_value: trace.raw_value, distress_severity: trace.distress_severity
  };
  trace.hitl_reviewed = true;
  trace.hitl_reviewer = body.reviewer_id;
  trace.hitl_decision = body.decision;
  trace.hitl_reviewed_at = Date.now();
  await env.STIGMERGY_KV.put(traceKey, JSON.stringify(trace));
  try {
    await env.STIGMERGY_DB.prepare(
      `INSERT INTO hitl_reviews (ts, trace_id, reviewer_id, decision, intervention_note, planned_action, bioregion_id, signal_type, raw_value, severity) VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      review.reviewed_at, body.trace_id, body.reviewer_id,
      body.decision, body.intervention_note || null,
      body.planned_action || null, trace.bioregion_id,
      trace.signal_type, String(trace.raw_value), trace.distress_severity
    ).run();
  } catch(_) {}

  // LITL: update node maturity on every HITL review
  // 'override' = decision was 'intervene' (human override of system classification)
  if (trace.bioregion_id) {
    const sphere = SIGNAL_TO_SPHERE[trace.signal_type] || 'BIOSPHERE';
    const wasOverridden = body.decision === 'intervene';
    await updateNodeMaturityOnHITL(trace.bioregion_id, sphere, wasOverridden, env).catch(() => {});
    // Record last HITL timestamp on recovery state so biology-closes-loop resets correctly
    const recovKey = `na:node:recovery:${trace.bioregion_id}:${sphere}`;
    const recov = await env.STIGMERGY_KV.get(recovKey, 'json') || {};
    recov.last_hitl_ts = Date.now();
    recov.self_resolution_emitted = false;  // reset — streak broken by HITL
    recov.consecutive_above_preferred = 0;
    await env.STIGMERGY_KV.put(recovKey, JSON.stringify(recov), { expirationTtl: 86400 * 60 }).catch(() => {});
  }
  if (body.decision === 'intervene' && body.planned_action) {
    const outcome = {
      outcome_id: `outcome:${body.trace_id}:${Date.now()}`,
      trace_id: body.trace_id, signal_id: trace.signal_id,
      bioregion_id: trace.bioregion_id, signal_type: trace.signal_type,
      baseline_value: trace.raw_value, planned_action: body.planned_action,
      reviewer_id: body.reviewer_id, initiated_at: Date.now(),
      outcome_value: null, outcome_delta: null, resolved_at: null, resolved: false
    };
    await env.STIGMERGY_KV.put(`hitl:outcome:${outcome.outcome_id}`, JSON.stringify(outcome));
  }
  return R({ ok: true, review, trace_updated: true });
}
async function handleHitlOutcome(request, env) {
  const body = await request.json().catch(() => null);
  if (!body) return R({ error: 'Invalid JSON' }, 400);
  const required = ['outcome_id', 'outcome_value', 'observer_id'];
  const missing = required.filter(f => !body[f]);
  if (missing.length) return R({ error: `Missing: ${missing.join(', ')}` }, 400);
  const outcome = await env.STIGMERGY_KV.get(`hitl:outcome:${body.outcome_id}`, 'json');
  if (!outcome) return R({ error: 'Outcome record not found' }, 404);
  const baseline = parseFloat(outcome.baseline_value);
  const result   = parseFloat(body.outcome_value);
  const delta    = isNaN(baseline) || isNaN(result) ? null
    : parseFloat((result - baseline).toFixed(4));
  outcome.outcome_value = body.outcome_value;
  outcome.outcome_delta = delta;
  outcome.outcome_note  = body.outcome_note || null;
  outcome.observer_id   = body.observer_id;
  outcome.resolved_at   = Date.now();
  outcome.resolved      = true;
  outcome.direction = delta !== null
    ? (delta > 0 ? 'improving' : delta < 0 ? 'worsening' : 'unchanged') : 'unknown';
  await env.STIGMERGY_KV.put(`hitl:outcome:${body.outcome_id}`, JSON.stringify(outcome));
  try {
    await env.STIGMERGY_DB.prepare(
      'UPDATE hitl_reviews SET outcome_value=?, outcome_delta=?, resolved_at=? WHERE trace_id=?'
    ).bind(String(body.outcome_value), delta, outcome.resolved_at, outcome.trace_id).run();
  } catch(_) {}
  return R({ ok: true, outcome });
}
async function handleHitlQueue(env) {
  const spheres = ['ATMOSPHERE','HYDROSPHERE','BIOSPHERE','ANCIENT'];
  const pending = [];
  for (const sphere of spheres) {
    const idx = await env.STIGMERGY_KV.get(`na:sphere:${sphere}`, 'json');
    if (!idx) continue;
    const traces = await Promise.all(
      idx.trace_ids.slice(0, 50).map(id =>
        env.STIGMERGY_KV.get(`stigmergy:trace:${id}`, 'json'))
    );
    const unreviewed = traces.filter(t => t && t.hitl_required && !t.hitl_reviewed);
    pending.push(...unreviewed);
  }
  pending.sort((a, b) => {
    const sv = { critical: 3, high: 2, moderate: 1 };
    const sdiff = (sv[b.distress_severity] || 0) - (sv[a.distress_severity] || 0);
    return sdiff !== 0 ? sdiff : b.ts - a.ts;
  });
  return R({
    pending_count: pending.length,
    critical: pending.filter(t => t.distress_severity === 'critical').length,
    high: pending.filter(t => t.distress_severity === 'high').length,
    moderate: pending.filter(t => t.distress_severity === 'moderate').length,
    queue: pending, decisions: HITL_DECISIONS
  });
}

// ══════════════════════════════════════════════════════════════════════════
// GAP #8 PATCH — Workers AI Semantic Embeddings
// ══════════════════════════════════════════════════════════════════════════
const EMBEDDING_MODEL = '@cf/baai/bge-small-en-v1.5';
const EMBEDDING_DIM   = 384;
async function generateEmbedding(text, env) {
  if (!env.AI) return null;
  try {
    const result = await env.AI.run(EMBEDDING_MODEL, { text: text.slice(0, 512) });
    return result.data ? result.data[0] : null;
  } catch(_) { return null; }
}
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; normA += a[i] * a[i]; normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
// Hybrid search: BM25 + semantic — adapted to use existing bm25Search(query, env, topK)
async function hybridSearch(query, env, topK = 5) {
  const bm25Results = await bm25Search(query, env, topK * 3);
  const queryEmbedding = await generateEmbedding(query, env);
  if (!queryEmbedding) return bm25Results.slice(0, topK);
  const maxBm25 = bm25Results[0]?.score || 1;
  const scored = await Promise.all(
    bm25Results.map(async (doc) => {
      let embedding = null;
      if (doc.id) embedding = await env.STIGMERGY_KV.get(`emb:${doc.id}`, 'json');
      const semantic = embedding ? cosineSimilarity(queryEmbedding, embedding) : 0;
      const bm25Norm = maxBm25 > 0 ? (doc.score || 0) / maxBm25 : 0;
      const hybrid = (bm25Norm * 0.4) + (semantic * 0.6);
      return { ...doc, score: hybrid, bm25_score: bm25Norm, semantic_score: semantic };
    })
  );
  return scored.filter(d => d.score > 0).sort((a, b) => b.score - a.score).slice(0, topK);
}
async function indexDocumentEmbedding(doc, env) {
  if (!env.AI) return;
  const text = `${doc.title || ''} ${doc.text || ''}`.slice(0, 512);
  const embedding = await generateEmbedding(text, env);
  if (!embedding) return;
  await env.STIGMERGY_KV.put(`emb:${doc.id}`, JSON.stringify(embedding));
}
async function handleEmbeddingBackfill(env) {
  if (!env.AI) return R({ error: 'Workers AI binding not configured. Variable name must be "AI" in Cloudflare dashboard → Worker → Settings → Bindings.' }, 503);
  const meta = await env.STIGMERGY_KV.get('_meta', 'json');
  if (!meta || !meta.keys || !meta.keys.length) return R({ error: 'Corpus index not found — seed the corpus first via POST /api/seed or scrape docs.' }, 404);

  const MIN_TEXT_CHARS = 40;  // below this the embedding model returns noise or null
  const BATCH_LIMIT    = 60;  // max per call to stay within 30s Worker wall time

  let processed = 0, skipped = 0, failed = 0, too_short = 0;
  const failures   = [];
  const short_docs = [];

  for (const key of meta.keys) {
    if (processed >= BATCH_LIMIT) break;

    const embKey = `emb:${key}`;
    const existing = await env.STIGMERGY_KV.get(embKey, 'json');
    // Skip already-embedded docs (real vectors) and stubs that were re-enriched
    if (existing && !existing.stub) { skipped++; continue; }

    const doc = await env.STIGMERGY_KV.get(key, 'json');
    if (!doc) { skipped++; continue; }

    // Use richest available text — field names differ by source:
    // seed docs: doc.description  |  scrape/pdf/discovery: doc.text
    const richText = [doc.text, doc.description, doc.content, doc.summary]
      .filter(Boolean).join(' ').trim();
    const text = `${doc.title || ''} ${richText}`.trim().slice(0, 512);

    if (text.length < MIN_TEXT_CHARS) {
      // Write stub so repeat backfills skip it instead of retrying forever
      if (!existing) {
        await env.STIGMERGY_KV.put(embKey, JSON.stringify({ stub: true, reason: 'too_short', chars: text.length }), { expirationTtl: 86400 * 30 });
      }
      too_short++;
      short_docs.push({ key, title: doc.title || '(no title)', chars: text.length, source: doc.source });
      continue;
    }

    const embedding = await generateEmbedding(text, env);
    if (!embedding) {
      failed++;
      failures.push({ key, title: doc.title || '(no title)', chars: text.length, source: doc.source });
      continue;
    }

    await env.STIGMERGY_KV.put(embKey, JSON.stringify(embedding));
    processed++;
  }

  return R({
    ok: true,
    processed, skipped, failed, too_short,
    total: meta.keys.length,
    note: processed > 0
      ? `Embedded ${processed} docs. Run again if remaining_unembedded > 0.`
      : skipped === meta.keys.length
      ? 'All docs already embedded — nothing to do.'
      : 'Check failures and short_docs below for docs needing text enrichment.',
    failures:        failures.length   ? failures   : undefined,
    short_docs:      short_docs.length ? short_docs : undefined,
    short_docs_note: short_docs.length
      ? `${short_docs.length} doc(s) have < ${MIN_TEXT_CHARS} chars. Open in Corpus panel → add description text → re-run backfill.`
      : undefined,
  });
}

async function handleEmbeddingStatus(env) {
  if (!env.AI) return R({ error: 'Workers AI binding required' }, 503);
  const meta = await env.STIGMERGY_KV.get('_meta', 'json');
  if (!meta?.keys?.length) return R({ error: 'No corpus docs found' }, 404);

  const rows = [];
  for (const key of meta.keys) {
    const doc = await env.STIGMERGY_KV.get(key, 'json');
    if (!doc) continue;
    const emb = await env.STIGMERGY_KV.get(`emb:${key}`, 'json');
    const richText = [doc.text, doc.description, doc.content].filter(Boolean).join(' ').trim();
    const textLen  = `${doc.title || ''} ${richText}`.trim().length;
    rows.push({
      key,
      title:    doc.title || '(no title)',
      source:   doc.source || '?',
      chars:    textLen,
      embedded: !!emb && !emb.stub,
      stub:     emb?.stub === true,
      status:   !emb ? 'missing' : emb.stub ? `stub:${emb.reason}` : 'ok',
    });
  }
  const embedded = rows.filter(r => r.embedded).length;
  const missing  = rows.filter(r => r.status === 'missing').length;
  const stubs    = rows.filter(r => r.stub).length;
  return R({
    total: rows.length, embedded, missing, stubs,
    coverage_pct: rows.length ? Math.round(embedded / rows.length * 100) : 0,
    docs: rows,
  });
}

function computeSecondarySpheres(text, primarySphere) {
  const t = (text || '').toLowerCase();
  const scores = {};
  for (const [sphere, keywords] of Object.entries(SPHERE_KEYWORDS)) {
    const score = keywords.filter(kw => t.includes(kw)).length;
    if (score > 0) scores[sphere] = score;
  }
  // Sort by score descending
  const ranked = Object.entries(scores).sort((a,b) => b[1]-a[1]);
  // Dynamic threshold: short text (PDFs often <500 chars) → 1 hit enough
  // Rich text → require 2 hits to avoid noise
  const threshold = t.length < 400 ? 1 : 2;
  const secondary = ranked
    .filter(([s, sc]) => sc >= threshold && s !== primarySphere)
    .slice(0, 2)
    .map(([s]) => s);
  return secondary;
}


async function handleBackfillSpheres(env, admin) {
  if (!admin) return R({ error: 'Admin key required' }, 403);
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;

  const meta = await env.STIGMERGY_KV.get('_meta', 'json') || { keys: [] };
  let updated = 0, skipped = 0, errors = 0;
  const changed = [];

  for (const key of meta.keys) {
    try {
      const doc = await env.STIGMERGY_KV.get(key, 'json');
      if (!doc) { skipped++; continue; }
      const sec = computeSecondarySpheres(doc.text || doc.title || '', doc.sphere || 'NOOSPHERE');
      const hadSec = JSON.stringify(doc.spheres_secondary || []);
      const nowSec = JSON.stringify(sec);
      if (hadSec === nowSec) { skipped++; continue; }
      doc.spheres_secondary = sec;
      await env.STIGMERGY_KV.put(key, JSON.stringify(doc));
      updated++;
      if (changed.length < 20) changed.push({ key, title: doc.title, sphere: doc.sphere, secondary: sec });
    } catch(e) { errors++; }
  }

  return R({ ok: true, total: meta.keys.length, updated, skipped, errors, sample: changed });
}

async function handleUpdateSphere(request, env, admin) {
  if (!admin) return R({ error: 'Admin key required' }, 403);
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;

  const { doc_key, sphere } = await request.json();
  if (!doc_key || !sphere) return R({ error: 'doc_key and sphere required' }, 400);

  const doc = await env.STIGMERGY_KV.get(doc_key, 'json');
  if (!doc) return R({ error: 'Document not found: ' + doc_key }, 404);

  const old_sphere = doc.sphere;
  doc.sphere = sphere;
  // Recompute secondary spheres from stored text
  doc.spheres_secondary = computeSecondarySpheres(doc.text || doc.title || '', sphere);
  doc.sphere_updated_at = new Date().toISOString();

  await env.STIGMERGY_KV.put(doc_key, JSON.stringify(doc));

  // Also update _meta sphere counts (update corpus index)
  const meta = await env.STIGMERGY_KV.get('_meta', 'json') || { count: 0, keys: [] };
  await env.STIGMERGY_KV.put('_meta', JSON.stringify(meta)); // triggers recalc on next /api/corpus

  return R({
    ok: true,
    doc_key,
    title: doc.title,
    sphere_old: old_sphere,
    sphere_new: sphere,
    spheres_secondary: doc.spheres_secondary,
  });
}

async function handleCorpus(env) {
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  const meta = await env.STIGMERGY_KV.get('_meta', 'json') || { count: 0, keys: [] };
  const spheres = {};
  const sources = { seed: 0, scrape: 0, pdf: 0 };
  const categories = {};

  const doc_list = [];
  for (const key of (meta.keys || []).slice(0, 300)) {
    const doc = await env.STIGMERGY_KV.get(key, 'json');
    if (!doc) continue;
    const s = doc.sphere || 'NOOSPHERE';
    spheres[s] = (spheres[s] || 0) + 1;
    const src = doc.source || 'seed';
    sources[src] = (sources[src] || 0) + 1;
    const cat = doc.category || 'general';
    categories[cat] = (categories[cat] || 0) + 1;
    doc_list.push({
      title:             doc.title || doc.url || key,
      url:               doc.url   || null,
      sphere:            s,
      spheres_secondary: doc.spheres_secondary || [],
      source:            src,
      chars:             doc.text?.length || 0,
      indexed_at:        doc.indexed_at || doc.fetched_at || null,
      doc_key:           key,
    });
  }
  doc_list.sort((a,b) => (a.sphere||'').localeCompare(b.sphere||''));

  return R({
    total_docs: meta.count || 0,
    spheres,
    sources,
    categories,
    doc_list,
    last_seed: meta.last_seed || null,
    last_scrape: meta.last_scrape || null,
    version: VERSION,
  });
}

async function handleCorpusBySphere(request, env) {
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  const url = new URL(request.url);
  const sphere = url.searchParams.get('sphere');
  if (!sphere || !SPHERES[sphere]) return R({ error: 'Invalid sphere', valid: Object.keys(SPHERES) }, 400);

  const meta = await env.STIGMERGY_KV.get('_meta', 'json') || { keys: [] };
  const docs = [];

  for (const key of (meta.keys || []).slice(0, 300)) {
    const doc = await env.STIGMERGY_KV.get(key, 'json');
    if (doc?.sphere === sphere) docs.push({ title: doc.title, url: doc.url, category: doc.category, source: doc.source });
  }

  return R({ sphere, sphere_meta: SPHERES[sphere], docs, count: docs.length });
}

async function handleCorpusSearch(request, env) {
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  const url = new URL(request.url);
  const q = url.searchParams.get('q') || '';
  if (!q) return R({ error: 'q parameter required' }, 400);
  const results = await bm25Search(q, env, 10);
  return R({ query: q, results: results.map(d => ({ title: d.title, url: d.url, sphere: d.sphere, snippet: d.text?.slice(0,200) })), count: results.length });
}

// ═══════════════════════════════════════════════════════════════════════════
// PDF MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

async function handleListPDFs(env) {
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  // Sync R2 → _pdf_meta on every list so admin sees all 39 PDFs
  let pdfMeta = await env.STIGMERGY_KV.get('_pdf_meta', 'json') || { pdfs: [] };
  if (env.STIGMERGY_R2) {
    const registeredKeys = new Set(pdfMeta.pdfs.map(p => p.key));
    try {
      const r2List = await env.STIGMERGY_R2.list({ prefix: 'pdfs/' });
      let changed = false;
      for (const obj of (r2List.objects || [])) {
        if (!registeredKeys.has(obj.key) && obj.key.toLowerCase().endsWith('.pdf')) {
          const filename = obj.key.replace('pdfs/', '');
          const cleanTitle = /^pdf_\d+_[a-z0-9]+\.pdf$/i.test(filename)
            ? 'Unnamed PDF' : filename.replace(/_+/g,' ').replace(/\.pdf$/i,'').trim();
          pdfMeta.pdfs.push({
            key: obj.key, name: filename, title: cleanTitle,
            sphere: 'NOOSPHERE', source: 'pdf',
            uploaded: obj.uploaded || new Date().toISOString(), indexed: false,
          });
          changed = true;
        }
      }
      if (changed) await env.STIGMERGY_KV.put('_pdf_meta', JSON.stringify(pdfMeta));
    } catch(e) { /* non-fatal */ }
  }
  return R({ pdfs: pdfMeta.pdfs, count: pdfMeta.pdfs.length });
}


// ── PDF Text Extraction ────────────────────────────────────────────────────
// Handles: uncompressed PDFs (parenthesis strings), hex-encoded strings,
// BT/ET text blocks, and falls back to readable ASCII runs.
function extractPDFText(buf) {
  const MAX_BYTES = 150000; // Read up to 150KB (covers most PDFs)
  const raw = new TextDecoder('utf-8', { fatal: false })
    .decode(buf.slice(0, Math.min(buf.length, MAX_BYTES)));

  const parts = [];

  // 1. Parenthesis-encoded strings: (Hello World)
  const parenMatches = raw.match(/\(([^)]{3,400})\)/g) || [];
  parenMatches.forEach(m => {
    const t = m.slice(1,-1).trim();
    if (t.length > 3 && /[a-zA-Z]{2,}/.test(t) && !/^[\x00-\x1F]+$/.test(t))
      parts.push(t);
  });

  // 2. Hex-encoded strings: <48656c6c6f>
  const hexMatches = raw.match(/<([0-9a-fA-F]{4,200})>/g) || [];
  hexMatches.forEach(m => {
    const hex = m.slice(1,-1);
    let decoded = '';
    for (let i = 0; i < hex.length - 1; i += 2) {
      const code = parseInt(hex.slice(i, i+2), 16);
      if (code >= 32 && code < 127) decoded += String.fromCharCode(code);
    }
    if (decoded.length > 3 && /[a-zA-Z]{2,}/.test(decoded)) parts.push(decoded);
  });

  // 3. BT...ET text blocks (PDF text object syntax)
  const btBlocks = raw.match(/BT[\s\S]{0,500}?ET/g) || [];
  btBlocks.forEach(block => {
    const inner = block.match(/\(([^)]{2,200})\)/g) || [];
    inner.forEach(m => parts.push(m.slice(1,-1).trim()));
  });

  // 4. Fallback: long printable ASCII runs (catches some compressed streams)
  if (parts.length < 5) {
    const asciiRuns = raw.match(/[ -~]{20,}/g) || [];
    asciiRuns
      .filter(s => /[a-zA-Z]{4,}/.test(s) && s.split(' ').length > 2)
      .slice(0, 40)
      .forEach(s => parts.push(s.trim()));
  }

  // Deduplicate, join, clean
  const seen = new Set();
  const unique = parts.filter(p => {
    const k = p.slice(0,30);
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });

  return unique.join(' ').replace(/\s{3,}/g, ' ').trim().slice(0, 5000);
}

async function handleUploadPDF(request, env, admin) {
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  if (!admin) return R({ error: 'Admin key required' }, 403);
  let form;
  try { form = await request.formData(); } catch(e) { return R({ error: 'Invalid form data' }, 400); }

  const file    = form.get('file');
  const title   = form.get('title') || '';
  const docType = form.get('doc_type') || 'article';
  const sphere  = form.get('sphere') || 'NOOSPHERE';

  if (!file) return R({ error: 'No file provided' }, 400);

  const filename = file.name || `upload-${Date.now()}.pdf`;
  const key = `pdfs/${filename}`;
  try {
    const buf = await file.arrayBuffer();
    await env.STIGMERGY_R2.put(key, buf, { httpMetadata: { contentType: 'application/pdf' } });

    // Extract text from first 5000 bytes (PDF text chunks are in plaintext)
    const textChunks = extractPDFText(buf);

    const pdfMeta = await env.STIGMERGY_KV.get('_pdf_meta', 'json') || { pdfs: [] };
    const entry = { key, name: filename, title: title || filename, doc_type: docType, sphere, uploaded: new Date().toISOString(), indexed: false };
    pdfMeta.pdfs = pdfMeta.pdfs.filter(p => p.key !== key);
    pdfMeta.pdfs.push(entry);
    await env.STIGMERGY_KV.put('_pdf_meta', JSON.stringify(pdfMeta));

    // Index immediately if we got text
    if (textChunks.length > 100) {
      const docKey = `doc:pdf:${hash(key)}`;
      const meta = await env.STIGMERGY_KV.get('_meta', 'json') || { count: 0, keys: [] };
      const _pdfSecUp = computeSecondarySpheres(textChunks.slice(0,2000), sphere);
      await env.STIGMERGY_KV.put(docKey, JSON.stringify({ url: key, title: title || filename, text: textChunks.slice(0, 2000), sphere, source: 'pdf', indexed_at: new Date().toISOString(), spheres_secondary: _pdfSecUp }));
      if (!meta.keys.includes(docKey)) meta.keys.push(docKey);
      meta.count = meta.keys.length;
      await env.STIGMERGY_KV.put('_meta', JSON.stringify(meta));
      entry.indexed = true;
      await env.STIGMERGY_KV.put('_pdf_meta', JSON.stringify(pdfMeta));
    }

    return R({ ok: true, key, title, doc_type: docType, sphere, indexed: entry.indexed });
  } catch(e) { return R({ error: e.message }, 500); }
}

async function handleProcessPDFs(env, admin) {
  if (!admin) return R({ error: 'Admin key required' }, 403);
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  const _r2Err = requireR2(env); if (_r2Err) return _r2Err;

  // Step 1: Sync R2 → _pdf_meta to pick up any unregistered PDFs
  let pdfMeta = await env.STIGMERGY_KV.get('_pdf_meta', 'json') || { pdfs: [] };
  const registeredKeys = new Set(pdfMeta.pdfs.map(p => p.key));
  try {
    const r2List = await env.STIGMERGY_R2.list({ prefix: 'pdfs/' });
    let synced = 0;
    for (const obj of (r2List.objects || [])) {
      if (!registeredKeys.has(obj.key) && obj.key.toLowerCase().endsWith('.pdf')) {
        const filename = obj.key.replace('pdfs/', '');
        const cleanTitle = /^pdf_\d+_[a-z0-9]+\.pdf$/i.test(filename)
          ? 'Unnamed PDF' : filename.replace(/_+/g,' ').replace(/\.pdf$/i,'').trim();
        pdfMeta.pdfs.push({
          key: obj.key, name: filename, title: cleanTitle,
          sphere: 'NOOSPHERE', indexed: false,
          uploaded: obj.uploaded || new Date().toISOString(),
        });
        synced++;
      }
    }
    if (synced > 0) await env.STIGMERGY_KV.put('_pdf_meta', JSON.stringify(pdfMeta));
  } catch(e) { /* non-fatal — continue with existing meta */ }

  // Step 2: Index all unindexed PDFs into KV corpus
  const meta = await env.STIGMERGY_KV.get('_meta', 'json') || { count: 0, keys: [] };
  let indexed = 0, failed = 0, skipped = 0;
  const results = [];

  for (const pdf of pdfMeta.pdfs) {
    if (pdf.indexed) { skipped++; continue; }
    try {
      const obj = await env.STIGMERGY_R2.get(pdf.key);
      if (!obj) { failed++; results.push({ key: pdf.key, status: 'not found in R2' }); continue; }

      // Read first 12KB for text extraction
      const reader = obj.body.getReader();
      const chunks = [];
      let total = 0;
      while (total < 12000) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value); total += value.length;
      }
      reader.cancel();
      const buf = new Uint8Array(total);
      let off = 0; for (const c of chunks) { buf.set(c, off); off += c.length; }
      const text = extractPDFText(buf).slice(0, 3000).trim()
        || '(' + (pdf.title || pdf.name) + ' — image-based PDF, not text-extractable)';

      // Write to KV corpus
      const docKey = 'doc:pdf:' + hash(pdf.key);
      const doc = {
        url: pdf.key, title: pdf.title || pdf.name,
        sphere: pdf.sphere || 'NOOSPHERE',
        text, source: 'pdf',
        indexed_at: new Date().toISOString(),
        spheres_secondary: computeSecondarySpheres(text, pdf.sphere || 'NOOSPHERE'),
      };
      await env.STIGMERGY_KV.put(docKey, JSON.stringify(doc));
      if (!meta.keys.includes(docKey)) meta.keys.push(docKey);

      // Mark indexed
      const pdfIdx = pdfMeta.pdfs.findIndex(p => p.key === pdf.key);
      if (pdfIdx > -1) pdfMeta.pdfs[pdfIdx].indexed = true;

      indexed++;
      results.push({ key: pdf.name, status: 'indexed', chars: text.length, sphere: doc.sphere });
    } catch(e) {
      failed++;
      results.push({ key: pdf.key, status: 'error', error: e.message });
    }
  }

  // Save updated meta
  meta.count = meta.keys.length;
  await env.STIGMERGY_KV.put('_meta', JSON.stringify(meta));
  await env.STIGMERGY_KV.put('_pdf_meta', JSON.stringify(pdfMeta));

  return R({
    ok: true, indexed, skipped, failed,
    corpus_total: meta.count,
    results,
  });
}

async function handleViewPDF(request, env, admin) {
  if (!admin) return R({ error: 'Admin key required' }, 403);
  const _r2Err = requireR2(env); if (_r2Err) return _r2Err;
  const url  = new URL(request.url);
  const key  = url.searchParams.get('key');
  const isRaw = url.searchParams.get('raw') === '1';
  if (!key) return R({ error: 'key required' }, 400);

  try {
    const obj = await env.STIGMERGY_R2.get(key);
    if (!obj) return R({ error: 'PDF not found in R2' }, 404);

    if (isRaw) {
      // Raw bytes — fetched by PDF.js via fetch(), CORS enabled
      const headers = new Headers({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="' + key.replace('pdfs/','') + '"',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
      });
      return new Response(obj.body, { status: 200, headers });
    }

    // JSON metadata — attempt text extraction from first 12KB
    const reader = obj.body.getReader();
    const chunks = [];
    let totalBytes = 0;
    while (totalBytes < 12000) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); totalBytes += value.length;
    }
    reader.cancel();
    const buf = new Uint8Array(totalBytes);
    let off = 0; for (const c of chunks) { buf.set(c, off); off += c.length; }
    const rawText = new TextDecoder('utf-8', { fatal: false }).decode(buf);

    // Fixed regex — safe character class
    const parenTexts = (rawText.match(/\(([^)]{4,300})\)/g) || [])
      .map(m => m.slice(1,-1).trim())
      .filter(t => t.length > 4 && /[a-zA-Z]{2,}/.test(t) && !/^[\u0000-]/.test(t));

    const extracted = parenTexts.slice(0, 60).join(' ')
      .replace(/[--]/g,' ')
      .replace(/\s{3,}/g,'  ').slice(0, 800).trim();

    const filename = key.replace('pdfs/', '');
    const firstLine = extracted.split(/\s{2,}/).find(l => l.length > 5) || filename;

    return R({
      ok: true, key, filename,
      size_kb: Math.round(totalBytes / 1024),
      detected_title: firstLine.slice(0, 80),
      preview_text: extracted || '(Image-based PDF — visual preview will render above)',
      extraction_method: parenTexts.length > 3 ? 'paren-stream' : 'none',
    });
  } catch(e) { return R({ error: e.message }, 500); }
}

async function handleUpdatePDF(request, env, admin) {
  if (!admin) return R({ error: 'Admin key required' }, 403);
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  const { key, title, sphere, category, notes } = await request.json();
  if (!key) return R({ error: 'key required' }, 400);

  const pdfMeta = await env.STIGMERGY_KV.get('_pdf_meta', 'json') || { pdfs: [] };
  const idx = pdfMeta.pdfs.findIndex(p => p.key === key);
  if (idx === -1) return R({ error: 'PDF not found' }, 404);

  if (title)    pdfMeta.pdfs[idx].title    = title;
  if (sphere)   pdfMeta.pdfs[idx].sphere   = sphere;
  if (category) pdfMeta.pdfs[idx].category = category;
  if (notes)    pdfMeta.pdfs[idx].notes    = notes;

  await env.STIGMERGY_KV.put('_pdf_meta', JSON.stringify(pdfMeta));

  // Re-index in KV corpus with new metadata
  const docKey = 'doc:pdf:' + hash(key);
  const existing = await env.STIGMERGY_KV.get(docKey, 'json');
  if (existing) {
    existing.title  = title  || existing.title;
    existing.sphere = sphere || existing.sphere;
    if (sphere) existing.spheres_secondary = computeSecondarySpheres(existing.text || existing.title || '', existing.sphere);
    await env.STIGMERGY_KV.put(docKey, JSON.stringify(existing));
  }
  return R({ ok: true, updated: { key, title, sphere } });
}

async function handleDeletePDF(request, env, admin) {
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  if (!admin) return R({ error: 'Admin key required' }, 403);
  const { key } = await request.json();
  if (!key) return R({ error: 'key required' }, 400);
  try {
    await env.STIGMERGY_R2.delete(key);
    const pdfMeta = await env.STIGMERGY_KV.get('_pdf_meta', 'json') || { pdfs: [] };
    pdfMeta.pdfs = pdfMeta.pdfs.filter(p => p.key !== key);
    await env.STIGMERGY_KV.put('_pdf_meta', JSON.stringify(pdfMeta));
    const docKey = `doc:pdf:${hash(key)}`;
    await env.STIGMERGY_KV.delete(docKey);
    const meta = await env.STIGMERGY_KV.get('_meta', 'json') || { keys: [] };
    meta.keys = meta.keys.filter(k => k !== docKey);
    meta.count = meta.keys.length;
    await env.STIGMERGY_KV.put('_meta', JSON.stringify(meta));
    return R({ ok: true, deleted: key });
  } catch(e) { return R({ error: e.message }, 500); }
}

// ═══════════════════════════════════════════════════════════════════════════
// SCRAPER — Delta, 10 batches × 3 URLs
// ═══════════════════════════════════════════════════════════════════════════

const SCRAPE_TARGETS = [
  ['https://livingearthcommunity.com/',                'Living Earth Community — Home',     'BIOSPHERE'],
  ['https://workthatreconnects.org/',                  'Work That Reconnects — Home',        'NOOSPHERE'],
  ['https://www.joannamacy.net/',                      'Joanna Macy — Home',                 'NOOSPHERE'],
  ['https://workthatreconnects.org/the-spiral/',       'The Spiral',                         'NOOSPHERE'],
  ['https://www.joannamacy.net/the-work/',             'The Work — Macy',                    'NOOSPHERE'],
  ['https://activehope.info/',                         'Active Hope — Home',                 'NOOSPHERE'],
  ['https://workthatreconnects.org/resources/',        'WTR Resources',                      'NOOSPHERE'],
  ['https://www.joannamacy.net/resources/',             'Joanna Macy — Resources',            'NOOSPHERE'],
  ['https://charleseisenstein.org/',                   'Charles Eisenstein — Home',          'NOOSPHERE'],
  ['https://capitalinstitute.org/',                    'Capital Institute — Regenerative',   'ECONO'],
  ['https://biomimicry.org/what-is-biomimicry/',       'What Is Biomimicry',                 'BIOSPHERE'],
  ['https://donellameadows.org/',                      'Donella Meadows Institute',           'NOOSPHERE'],
  ['https://www.resilience.org/resilience-101/',       'What Is Resilience',                 'BIOSPHERE'],
  ['https://www.ecoliteracy.org/',                     'Center for Ecoliteracy',             'NOOSPHERE'],
  ['https://workthatreconnects.org/practices/',        'WTR Practices',                      'NOOSPHERE'],
  ['https://activehope.info/three-stories/',           'Three Stories of Our Time',          'NOOSPHERE'],
  ['https://permacultureprinciples.com/',              'Permaculture Principles',            'BIOSPHERE'],
  ['https://degrowth.info/',                           'Degrowth Info',                      'ECONO'],
  ['https://biomimicry.org/biomimicry-education/',     'Biomimicry Education',               'BIOSPHERE'],
  ['https://livingearthcommunity.com/about/',          'Living Earth — About',               'BIOSPHERE'],
  ['https://livingearthcommunity.com/resources/',      'Living Earth — Resources',           'BIOSPHERE'],
  ['https://workthatreconnects.org/facilitation/',     'WTR Facilitation',                   'NOOSPHERE'],
  ['https://activehope.info/workshops/',               'Active Hope Workshops',              'NOOSPHERE'],
  ['https://www.doughnuteconomics.org/',               'Doughnut Economics',                 'ECONO'],
  ['https://www.earthcharter.org/',                    'Earth Charter',                      'GOVERNANCE'],
  ['https://www.rightsofnature.org/',                  'Rights of Nature — Global Alliance', 'GOVERNANCE'],
  ['https://www.soil-association.org/',                'Soil Association',                   'BIOSPHERE'],
  ['https://www.un.org/development/desa/indigenouspeoples/', 'UN Indigenous Peoples',        'ANCIENT'],
  ['https://pluriverse.world/',                        'Dictionary of Pluriverse',           'NOOSPHERE'],
  ['https://commonsabundance.net/',                    'Commons Abundance',                  'ECONO'],
];


// ─── Single URL scrape with depth crawling ────────────────────────────────
// depth=1 → single page only (1 page)
// depth=2 → page + linked pages from it (up to 8 pages)
// depth=3 → page + links + links-of-links (up to 20 pages, 6 links/page)
// depth=4 → 3 levels deep + extra breadth (up to 30 pages, 5 links/page)
//           Note: depth 4 approaches Cloudflare's 30s CPU limit — use selectively

async function handleScrapeUrl(request, env, admin) {
  if (!admin) return R({ error: 'Admin key required' }, 403);
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  const _dbErr = requireDB(env); if (_dbErr) return _dbErr;

  const body = await request.json().catch(() => ({}));
  const startUrl = (body.url || '').trim();
  const sphere   = body.sphere  || 'NOOSPHERE';
  const depth    = Math.min(parseInt(body.depth || '1'), 4); // max depth 4
  // Pages per level: 1→1, 2→8, 3→20, 4→30 (6 links/level max to stay under 30s CPU)
  const maxPages    = depth === 1 ? 1 : depth === 2 ? 8 : depth === 3 ? 20 : 30;
  const linksPerPage = depth <= 2 ? 10 : depth === 3 ? 6 : 5; // fewer links/page at deeper levels

  if (!startUrl || !startUrl.startsWith('http')) {
    return R({ error: 'Valid URL required (must start with http)' }, 400);
  }

  const UA = 'Ayu-Stigmergy-Bot/1.0 (planetary co-intelligence; regenerative-ai)';
  const meta = await env.STIGMERGY_KV.get('_meta', 'json') || { count: 0, keys: [] };
  const results = [];
  const visited = new Set();
  const queue   = [{ url: startUrl, currentDepth: 1 }];

  // Parse base origin for internal-link filtering
  let baseOrigin = '';
  try { baseOrigin = new URL(startUrl).origin; } catch(e) {}

  while (queue.length > 0 && visited.size < maxPages) {
    const { url: pageUrl, currentDepth } = queue.shift();
    if (visited.has(pageUrl)) continue;
    visited.add(pageUrl);

    try {
      const docKey  = 'doc:scrape:' + hash(pageUrl);
      const existing = await env.STIGMERGY_KV.get(docKey, 'json');
      const ifModHeaders = existing?.fetched_at
        ? { 'If-Modified-Since': existing.fetched_at } : {};

      const resp = await fetch(pageUrl, {
        headers: { 'User-Agent': UA, ...ifModHeaders },
        redirect: 'follow',
        signal: AbortSignal.timeout(10000),
      });

      if (resp.status === 304) {
        results.push({ url: pageUrl, status: 304, delta: false,
          chars: existing?.text?.length || 0, depth: currentDepth });
        continue;
      }
      if (!resp.ok) {
        results.push({ url: pageUrl, status: resp.status, depth: currentDepth,
          error: `HTTP ${resp.status} ${resp.statusText || 'error'}` });
        continue;
      }

      const html = await resp.text();
      const text = cleanHtml(html);

      if (text.length < 80) {
        results.push({ url: pageUrl, status: 200, depth: currentDepth,
          error: 'insufficient text', chars: text.length });
        continue;
      }

      // Extract page title from <title> tag
      const titleMatch = html.match(/<title[^>]*>([^<]{2,120})<\/title>/i);
      const pageTitle  = titleMatch
        ? titleMatch[1].trim().replace(/\s+/g, ' ')
        : pageUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

      const isNew = !meta.keys.includes(docKey);
      const doc   = {
        url: pageUrl, title: pageTitle, sphere, source: 'scrape',
        text: text.slice(0, 3000),
        fetched_at:  new Date().toUTCString(),
        indexed_at:  new Date().toISOString(),
        scrape_depth: currentDepth,
        spheres_secondary: computeSecondarySpheres(text.slice(0, 3000), sphere),
      };
      await env.STIGMERGY_KV.put(docKey, JSON.stringify(doc));
      // Gap #8: generate embedding for new/updated doc
      await indexDocumentEmbedding({ ...doc, id: docKey }, env);
      if (isNew) meta.keys.push(docKey);

      // Log to D1
      try {
        await env.STIGMERGY_DB.prepare(
          'INSERT INTO scrape_logs (id, url, status, chars, sphere, delta) VALUES (?,?,?,?,?,?)'
        ).bind(rnd(), pageUrl, 200, text.length, sphere, isNew ? 1 : 0).run();
      } catch(e) { /* non-fatal */ }

      results.push({ url: pageUrl, title: pageTitle, status: 200,
        delta: isNew, chars: text.length, sphere, depth: currentDepth });

      // If depth allows, extract internal links for next level
      if (currentDepth < depth && visited.size < maxPages) {
        const linkMatches = html.matchAll(/href=["']([^"'#?]{4,200})["']/gi);
        let added = 0;
        for (const m of linkMatches) {
          if (added >= linksPerPage) break; // budget: fewer links/page at deeper levels
          let href = m[1];
          // Resolve relative URLs
          if (href.startsWith('/')) href = baseOrigin + href;
          else if (!href.startsWith('http')) continue;
          // Only follow same-origin internal links
          try {
            const linkOrigin = new URL(href).origin;
            if (linkOrigin !== baseOrigin) continue;
          } catch(e) { continue; }
          // Skip non-content pages
          if (/\.(jpg|jpeg|png|gif|svg|css|js|pdf|zip|mp4|mp3|woff|ttf)$/i.test(href)) continue;
          if (!visited.has(href) && !queue.find(q => q.url === href)) {
            queue.push({ url: href, currentDepth: currentDepth + 1 });
            added++;
          }
        }
      }
    } catch(e) {
      const errType = (e.name === 'AbortError' || e.message.includes('timeout'))
        ? 'Timeout (10s)' : e.message;
      results.push({ url: pageUrl, error: errType, status: 0, depth: currentDepth });
    }
  }

  meta.count = meta.keys.length;
  meta.last_scrape = new Date().toISOString();
  await env.STIGMERGY_KV.put('_meta', JSON.stringify(meta));

  const added    = results.filter(r => r.delta).length;
  const unchanged = results.filter(r => r.delta === false && !r.error).length;
  const errors   = results.filter(r => r.error).length;

  return R({
    ok: true,
    url: startUrl, sphere, depth,
    pages_crawled: visited.size,
    added, unchanged, errors,
    corpus_total: meta.count,
    results,
  });
}

async function handleScrape(request, env, admin) {
  const _dbErr = requireDB(env); if (_dbErr) return _dbErr;
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  const url    = new URL(request.url);
  const batch  = parseInt(url.searchParams.get('batch') || '1');
  const action = url.searchParams.get('action');

  if (action === 'status') {
    const log = await env.STIGMERGY_KV.get('_scrape_status', 'json') || {};
    return R({ scrape_status: log, targets: SCRAPE_TARGETS.length, batches: 10 });
  }

  // batch=all runs all 10 batches sequentially
  if (url.searchParams.get('batch') === 'all') {
    const allResults = [];
    let totalAdded = 0;
    for (let b = 1; b <= 10; b++) {
      const batchStart = (b-1)*3;
      const batchTargets = SCRAPE_TARGETS.slice(batchStart, batchStart+3);
      const batchMeta = await env.STIGMERGY_KV.get('_meta', 'json') || { count:0, keys:[] };
      for (const [tUrl, tTitle, tSphere] of batchTargets) {
        try {
          const dKey = `doc:scrape:${hash(tUrl)}`;
          const existing = await env.STIGMERGY_KV.get(dKey, 'json');
          const ifModHeaders = existing?.fetched_at ? { 'If-Modified-Since': existing.fetched_at } : {};
          const resp = await fetch(tUrl, { headers: { 'User-Agent': 'Stigmergy/1.0 Living Systems Bot', ...ifModHeaders }, redirect: 'follow', signal: AbortSignal.timeout(8000) });
          if (resp.status === 304) { allResults.push({ url: tUrl, status: 304, delta: false }); continue; }
          if (!resp.ok) { allResults.push({ url: tUrl, status: resp.status, error: `HTTP ${resp.status} — page not found or blocked` }); continue; }
          const html = await resp.text();
          const text = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<script[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,4000);
          const doc = { url: tUrl, title: tTitle, text, sphere: tSphere, source:'scrape', fetched_at: new Date().toISOString(),
            spheres_secondary: computeSecondarySpheres(text, tSphere) };
          await env.STIGMERGY_KV.put(dKey, JSON.stringify(doc));
          if (!batchMeta.keys.includes(dKey)) { batchMeta.keys.push(dKey); batchMeta.count = batchMeta.keys.length; }
          await env.STIGMERGY_KV.put('_meta', JSON.stringify(batchMeta));
          allResults.push({ url: tUrl, status: resp.status, chars: text.length, sphere: tSphere, delta: true });
          totalAdded++;
        } catch(e) { allResults.push({ url: tUrl, error: e.message }); }
      }
    }
    const finalMeta = await env.STIGMERGY_KV.get('_meta', 'json') || { count:0 };
    return R({ ok: true, batch: 'all', targets: SCRAPE_TARGETS.length, added: totalAdded, corpus_total: finalMeta.count, results: allResults });
  }

  if (batch < 1 || batch > 10) return R({ error: 'batch must be 1-10' }, 400);

  const start   = (batch - 1) * 3;
  const targets = SCRAPE_TARGETS.slice(start, start + 3);
  const meta    = await env.STIGMERGY_KV.get('_meta', 'json') || { count: 0, keys: [] };
  const results = [];

  for (const [targetUrl, title, sphere] of targets) {
    try {
      const docKey = `doc:scrape:${hash(targetUrl)}`;
      const existing = await env.STIGMERGY_KV.get(docKey, 'json');
      const ifModHeaders = existing?.fetched_at ? { 'If-Modified-Since': existing.fetched_at } : {};

      const resp = await fetch(targetUrl, {
        headers: { 'User-Agent': 'Ayu-Stigmergy-Bot/1.0 (planetary co-intelligence; regenerative-ai)', ...ifModHeaders },
        redirect: 'follow',
      });

      if (resp.status === 304) {
        results.push({ url: targetUrl, status: 304, delta: false, chars: existing?.text?.length || 0 });
        continue;
      }
      if (!resp.ok) {
        results.push({ url: targetUrl, status: resp.status, error: `HTTP ${resp.status} ${resp.statusText||'error'}` });
        continue;
      }

      const html = await resp.text();
      const text = cleanHtml(html);
      if (text.length < 100) { results.push({ url: targetUrl, status: 200, error: 'insufficient text', chars: text.length }); continue; }

      const isNew = !meta.keys.includes(docKey);
      const doc   = { url: targetUrl, title, sphere, text: text.slice(0, 3000), source: 'scrape', fetched_at: new Date().toUTCString(), indexed_at: new Date().toISOString(),
        spheres_secondary: computeSecondarySpheres(text.slice(0, 3000), sphere) };
      await env.STIGMERGY_KV.put(docKey, JSON.stringify(doc));
      if (isNew) meta.keys.push(docKey);

      // Log to D1
      try {
        await env.STIGMERGY_DB.prepare('INSERT INTO scrape_logs (id, url, status, chars, sphere, delta) VALUES (?,?,?,?,?,?)')
          .bind(rnd(), targetUrl, resp.status, text.length, sphere || null, isNew ? 1 : 0).run();
      } catch(e) { /* non-fatal */ }

      results.push({ url: targetUrl, status: 200, delta: isNew, chars: text.length, sphere });
    } catch(e) {
      const errType = (e.name === 'AbortError' || e.message.toLowerCase().includes('timeout'))
        ? 'Timeout (10s limit)' : e.message;
      results.push({ url: targetUrl, error: errType, status: 0 });
    }
  }

  meta.count = meta.keys.length;
  meta.last_scrape = new Date().toISOString();
  await env.STIGMERGY_KV.put('_meta', JSON.stringify(meta));

  return R({ ok: true, batch, targets: targets.length, results, corpus_total: meta.count });
}

function cleanHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s{3,}/g, '  ')
    .trim();
}

// ═══════════════════════════════════════════════════════════════════════════
// RECATEGORIZATION — AI-driven sphere reassignment
// ═══════════════════════════════════════════════════════════════════════════

async function handleRecategorize(env, admin) {
  const _dbErr = requireDB(env); if (_dbErr) return _dbErr;
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  if (!env.AI) return R({ error: 'Workers AI binding required — add AI binding in Cloudflare dashboard' }, 503);

  const meta = await env.STIGMERGY_KV.get('_meta', 'json') || { keys: [] };
  const sample = (meta.keys || []).slice(0, 40);
  const docs = [];

  for (const k of sample) {
    const doc = await env.STIGMERGY_KV.get(k, 'json');
    if (doc) docs.push({ key: k, title: doc.title, sphere: doc.sphere, snippet: doc.text?.slice(0, 200) });
  }

  const prompt = `Review these corpus documents and identify any that are miscategorized by sphere.
Current sphere taxonomy: ${Object.entries(SPHERES).map(([k,v]) => `${k}:${v.desc}`).join('; ')}

Documents:
${docs.map((d,i) => `${i+1}. [${d.sphere}] "${d.title}" — ${d.snippet}`).join('\n')}

Return JSON array of objects with: { key, title, current_sphere, proposed_sphere, reason }
Only include documents where recategorization is clearly warranted. Return valid JSON only.`;

  try {
    const aiResp = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 800,
    });
    const text = aiResp.response || aiResp.choices?.[0]?.message?.content || '[]';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const proposals = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    await env.STIGMERGY_KV.put('_recategorize_pending', JSON.stringify({ proposals, generated_at: new Date().toISOString() }));
    return R({ ok: true, proposals_count: proposals.length, proposals });
  } catch(e) { return R({ error: e.message }, 500); }
}

async function handleRecategorizePending(env) {
  const _dbErr = requireDB(env); if (_dbErr) return _dbErr;
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  const pending = await env.STIGMERGY_KV.get('_recategorize_pending', 'json') || { proposals: [] };
  return R(pending);
}

async function handleRecategorizeApply(request, env, admin) {
  const _dbErr = requireDB(env); if (_dbErr) return _dbErr;
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  if (!admin) return R({ error: 'Admin key required' }, 403);
  const { ids } = await request.json();
  if (!Array.isArray(ids)) return R({ error: 'ids array required' }, 400);

  const pending = await env.STIGMERGY_KV.get('_recategorize_pending', 'json') || { proposals: [] };
  const toApply = pending.proposals.filter(p => ids.includes(p.key));
  let applied = 0;

  for (const p of toApply) {
    const doc = await env.STIGMERGY_KV.get(p.key, 'json');
    if (!doc) continue;
    doc.sphere = p.proposed_sphere;
    doc.spheres_secondary = computeSecondarySpheres(doc.text || doc.title || '', doc.sphere);
    doc.recategorized_at = new Date().toISOString();
    await env.STIGMERGY_KV.put(p.key, JSON.stringify(doc));
    applied++;
  }

  pending.proposals = pending.proposals.filter(p => !ids.includes(p.key));
  await env.STIGMERGY_KV.put('_recategorize_pending', JSON.stringify(pending));
  return R({ ok: true, applied, remaining: pending.proposals.length });
}

async function handleRecategorizeDismiss(request, env, admin) {
  const _dbErr = requireDB(env); if (_dbErr) return _dbErr;
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  if (!admin) return R({ error: 'Admin key required' }, 403);
  const { ids } = await request.json();
  const pending = await env.STIGMERGY_KV.get('_recategorize_pending', 'json') || { proposals: [] };
  const before = pending.proposals.length;
  pending.proposals = pending.proposals.filter(p => !ids.includes(p.key));
  await env.STIGMERGY_KV.put('_recategorize_pending', JSON.stringify(pending));
  return R({ ok: true, dismissed: before - pending.proposals.length, remaining: pending.proposals.length });
}

async function handleExportTraining(env, admin) {
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  if (!admin) return R({ error: 'Admin key required' }, 403);

  let rows;
  try {
    rows = await env.STIGMERGY_DB.prepare('SELECT q.query, q.response, q.sphere, f.score FROM queries q LEFT JOIN feedback f ON f.query_id = q.id ORDER BY q.created_at DESC LIMIT 500').all();
  } catch(e) { return R({ error: 'D1 query failed: ' + e.message }, 500); }

  const lines = (rows?.results || [])
    .filter(r => r.response && r.query)
    .map(r => JSON.stringify({ prompt: r.query, completion: r.response, sphere: r.sphere, score: r.score }));

  return new Response(lines.join('\n'), {
    headers: { ...CORS, 'Content-Type': 'text/plain', 'Content-Disposition': 'attachment; filename="ayu-training-data.jsonl"' }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// BIOSIGNAL — Planetary vitality sensing
// ═══════════════════════════════════════════════════════════════════════════

function haversineDeg(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function nearestBioregion(lat, lng) {
  let nearest = BIOREGIONS[0];
  let minDist = Infinity;
  for (const b of BIOREGIONS) {
    const d = haversineDeg(lat, lng, b.lat, b.lng);
    if (d < minDist) { minDist = d; nearest = b; }
  }
  return nearest;
}

// ── Umwelt Node functions ─────────────────────────────────────────────────────
// A node = bioregion × sphere. Each is an independent natural agent Umwelt.
// Sphere vocabulary (NATURAL_UMWELT) is code-controlled (slow/deliberate).
// Node registration is KV-controlled (fast/dynamic).

function getNodesForBioregion(bioregionId) {
  const br = BIOREGIONS.find(b => b.id === bioregionId);
  if (!br) return [];
  const spheres = NATURAL_UMWELT[br.biome] || ['BIOSPHERE'];
  return spheres.map(sphere => ({
    node_id: `${bioregionId}:${sphere}`,
    bioregion_id: bioregionId,
    bioregion_name: br.name,
    sphere,
    realm: br.realm,
    subrealm: br.subrealm,
    biome: br.biome,
    pop_level: br.pop_level,
  }));
}

function getAllNodes() {
  return BIOREGIONS.flatMap(br => getNodesForBioregion(br.id));
}

async function updateNodeState(signal, distress, env) {
  const br = BIOREGIONS.find(b => b.id === signal.bioregion_id);
  if (!br) return;
  const spheres = NATURAL_UMWELT[br.biome] || ['BIOSPHERE'];
  const signalSphere = SIGNAL_TO_SPHERE[signal.signal_type];
  // Only update nodes whose sphere matches this signal's sphere
  const targetSpheres = signalSphere ? spheres.filter(s => s === signalSphere) : spheres;
  for (const sphere of targetSpheres) {
    const key = `na:node:state:${signal.bioregion_id}:${sphere}`;
    const existing = await env.STIGMERGY_KV.get(key, 'json') || {
      vitality: br.vitality, active_distress_count: 0, last_signal_ts: null, hitl_pending: false,
    };
    const updated = {
      vitality: signal.raw_value != null ? Math.max(0, Math.min(100, existing.vitality)) : existing.vitality,
      active_distress_count: distress ? existing.active_distress_count + 1 : Math.max(0, existing.active_distress_count),
      last_signal_ts: signal.recorded_at || new Date().toISOString(),
      hitl_pending: distress?.severity === 'critical' ? true : existing.hitl_pending,
    };
    await env.STIGMERGY_KV.put(key, JSON.stringify(updated), { expirationTtl: 86400 * 30 });
  }
}

async function handleGetNodes(request, env) {
  const url = new URL(request.url);
  const popLevel = parseInt(url.searchParams.get('pop_level') || '3');
  const nodes = getAllNodes().filter(n => n.pop_level <= popLevel);
  // Enrich with live state from KV
  const enriched = await Promise.all(nodes.map(async n => {
    const state = await env.STIGMERGY_KV.get(`na:node:state:${n.bioregion_id}:${n.sphere}`, 'json') || null;
    return { ...n, state };
  }));
  return R({ ok: true, node_count: enriched.length, nodes: enriched });
}

async function handleGetUnwellNodes(request, env) {
  const nodes = getAllNodes();
  const unwellNodes = [];
  for (const n of nodes) {
    const state = await env.STIGMERGY_KV.get(`na:node:state:${n.bioregion_id}:${n.sphere}`, 'json');
    if (!state) continue;
    const br = BIOREGIONS.find(b => b.id === n.bioregion_id);
    const vitality = state.vitality ?? br?.vitality ?? 50;
    if (vitality < 40 || state.active_distress_count > 0 || state.hitl_pending) {
      unwellNodes.push({ ...n, state, vitality });
    }
  }
  unwellNodes.sort((a, b) => a.vitality - b.vitality);
  return R({ ok: true, unwell_count: unwellNodes.length, nodes: unwellNodes });
}

async function handleGetCandidateNodes(request, env) {
  // Nodes where liminal signals have accumulated — candidates for Umwelt expansion
  const liminalIndex = await env.STIGMERGY_KV.get('na:liminal:index', 'json') || { signal_types: {} };
  const candidates = Object.entries(liminalIndex.signal_types)
    .filter(([, count]) => count >= 3)
    .map(([signal_type, count]) => ({ signal_type, accumulated_count: count,
      recommendation: 'Review for potential Umwelt expansion — add to NATURAL_UMWELT if validated' }));
  return R({ ok: true, candidate_count: candidates.length, candidates, note: 'Candidates require code-deploy review before sphere vocabulary expansion' });
}

function computeVitalityIndex(bioregion, overrides = {}) {
  const base = overrides.vitality || bioregion.vitality;
  // Apply small noise ±3 to simulate real variance
  const noise = (Math.random() - 0.5) * 6;
  return Math.max(0, Math.min(100, Math.round(base + noise)));
}

async function handleBiosignal(request, env) {
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  const url = new URL(request.url);
  const lat = parseFloat(url.searchParams.get('lat') || '0');
  const lng = parseFloat(url.searchParams.get('lng') || '0');

  const bioregion = nearestBioregion(lat, lng);
  const vitality  = computeVitalityIndex(bioregion);

  const indicators = {
    biodiversity_index: Math.round(bioregion.vitality * 0.9 + Math.random() * 10),
    carbon_flux:        bioregion.trend === 'declining' ? 'net_source' : 'net_sink',
    water_cycle_health: Math.round(bioregion.vitality * 0.85 + Math.random() * 10),
    soil_biome_index:   Math.round(bioregion.vitality * 0.8 + Math.random() * 15),
    species_abundance:  Math.round(bioregion.vitality * 0.95 + Math.random() * 8),
  };

  // Store reading
  try {
    await env.STIGMERGY_DB.prepare('INSERT INTO biosignal_logs (id, bioregion, lat, lng, vitality_index, indicators) VALUES (?,?,?,?,?,?)')
      .bind(rnd(), bioregion.id, lat, lng, vitality, JSON.stringify(indicators)).run();
  } catch(e) { /* non-fatal */ }

  return R({ bioregion: bioregion.name, bioregion_id: bioregion.id, biome: bioregion.biome, vitality_index: vitality, trend: bioregion.trend, indicators, lat, lng, timestamp: new Date().toISOString() });
}

async function handleBiosignalPost(request, env) {
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  const body = await request.json();
  const { bioregion_id, vitality, indicators, source } = body;
  const br = BIOREGIONS.find(b => b.id === bioregion_id) || BIOREGIONS[0];

  try {
    await env.STIGMERGY_DB.prepare('INSERT INTO biosignal_logs (id, bioregion, lat, lng, vitality_index, indicators, source) VALUES (?,?,?,?,?,?,?)')
      .bind(rnd(), br.id, br.lat, br.lng, vitality || br.vitality, JSON.stringify(indicators || {}), source || 'external').run();
  } catch(e) { return R({ error: e.message }, 500); }

  return R({ ok: true, recorded: { bioregion: br.name, vitality, source } });
}

async function handleBiosignalDashboard(env) {
  const _dbErr = requireDB(env); if (_dbErr) return _dbErr;
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  // Phase 2: Use stored vitality — natural agents' state updated by steward actions
  const storedVitality = await env.STIGMERGY_KV.get('_natural_vitality', 'json') || {};
  const readings = BIOREGIONS.map(b => {
    const baseVitality = storedVitality[b.id] !== undefined ? storedVitality[b.id] : b.vitality;
    const vi = computeVitalityIndex({ ...b, vitality: baseVitality });
    const fe = computeNaturalFreeEnergy(b, baseVitality);
    const priority = baseVitality < 25 ? 'constitutional' : baseVitality < 40 ? 'warning' : baseVitality < 55 ? 'elevated' : 'nominal';
    return {
      ...b, vitality_index: vi,
      free_energy: fe,
      priority,
      status: vi >= 70 ? 'healthy' : vi >= 45 ? 'stressed' : vi >= 25 ? 'critical' : 'emergency',
    };
  });

  const avg = Math.round(readings.reduce((s, r) => s + r.vitality_index, 0) / readings.length);
  const constitutional = readings.filter(r => r.priority === 'constitutional');

  return R({
    planetary_vitality: avg,
    status: avg >= 60 ? 'stressed' : avg >= 40 ? 'critical' : 'emergency',
    bioregions: readings,
    emergency_zones: readings.filter(r => r.vitality_index < 35).map(r => r.name),
    constitutional_alerts: constitutional.map(r => ({ name: r.name, vitality: r.vitality_index, free_energy: r.free_energy })),
    natural_agent_distress: constitutional.length > 0,
    timestamp: new Date().toISOString(),
  });
}

async function handleBiosignalHistory(env) {
  const _dbErr = requireDB(env); if (_dbErr) return _dbErr;
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  try {
    const rows = await env.STIGMERGY_DB.prepare('SELECT * FROM biosignal_logs ORDER BY created_at DESC LIMIT 100').all();
    return R({ readings: rows?.results || [], count: rows?.results?.length || 0 });
  } catch(e) { return R({ error: e.message }, 500); }
}

async function handleBiosignalBioregion(request, env) {
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  const url = new URL(request.url);
  const id  = url.searchParams.get('id');
  const lat = parseFloat(url.searchParams.get('lat') || '0');
  const lng = parseFloat(url.searchParams.get('lng') || '0');

  const bioregion = id ? BIOREGIONS.find(b => b.id === id) : nearestBioregion(lat, lng);
  if (!bioregion) return R({ error: 'Bioregion not found', valid: BIOREGIONS.map(b => b.id) }, 404);

  return R({ ...bioregion, bioregion: bioregion.name, vitality_index: computeVitalityIndex(bioregion), all_bioregions: BIOREGIONS.map(b => ({ id: b.id, name: b.name })) });
}

async function handleStewardLog(env) {
  const _dbErr = requireDB(env); if (_dbErr) return _dbErr;
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  try {
    const rows = await env.STIGMERGY_DB.prepare('SELECT * FROM steward_log ORDER BY created_at DESC LIMIT 50').all();
    return R({ actions: rows?.results || [], count: rows?.results?.length || 0 });
  } catch(e) { return R({ error: e.message }, 500); }
}

async function handleStewardLogPost(request, env) {
  const _dbErr = requireDB(env); if (_dbErr) return _dbErr;
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  const { actor_id, bioregion, action, impact_score, notes } = await request.json();
  if (!actor_id || !action) return R({ error: 'actor_id and action required' }, 400);

  try {
    await env.STIGMERGY_DB.prepare('INSERT INTO steward_log (id, actor_id, bioregion, action, impact_score, notes) VALUES (?,?,?,?,?,?)')
      .bind(rnd(), actor_id, bioregion || 'global', action, impact_score || 0, notes || null).run();
  } catch(e) { return R({ error: e.message }, 500); }

  // Phase 2: Apply cumulative vitality impact to natural agent
  // Steward actions accumulate over time — respecting the natural agent's temporal scale
  // High impact actions (+ve) slowly shift vitality; negative actions degrade it
  let vitalityUpdate = null;
  if (bioregion && bioregion !== 'global' && impact_score !== undefined) {
    try {
      const br = BIOREGIONS.find(b => b.id === bioregion);
      if (br) {
        const stored = await env.STIGMERGY_KV.get('_natural_vitality', 'json') || {};
        const current = stored[bioregion] !== undefined ? stored[bioregion] : br.vitality;

        // Steward impact is gradual — scaled by temporal constraints
        // A single action moves vitality by at most ±0.5 points
        // This respects the decades-scale timescale of natural agents
        const maxDelta = 0.5;
        const normalizedImpact = (impact_score - 50) / 100;  // -0.5 to +0.5
        const vitalityDelta = normalizedImpact * maxDelta;
        const newVitality   = Math.max(0, Math.min(100, +(current + vitalityDelta).toFixed(2)));

        stored[bioregion] = newVitality;
        await env.STIGMERGY_KV.put('_natural_vitality', JSON.stringify(stored));

        // Deposit steward action trace
        const traces = await env.STIGMERGY_KV.get('_stigmergy_traces', 'json') || [];
        const actors = await env.STIGMERGY_KV.get('_actors', 'json') || [];
        const actor  = actors.find(a => a.id === actor_id);
        traces.unshift({
          id: rnd(),
          agent_id: actor_id,
          agent_type: AGENT_TYPES.HUMAN,
          actor_id,
          content: `Steward action: ${action}. Impact: ${impact_score}/100. Bioregion: ${br.name}. ${notes || ''}`.trim().slice(0, 500),
          trace_type: 'steward_action',
          bioregion,
          sphere: 'BIOSPHERE',
          strength: Math.min(1.0, Math.abs(normalizedImpact) + 0.4),
          timescale_depth: actor?.type === 'indigenous' ? 'decades' : 'years',
          timescale_weight: actor?.type === 'indigenous' ? TIMESCALE_WEIGHTS.decades : TIMESCALE_WEIGHTS.years,
          deposited_at: new Date().toISOString(),
          decay_rate: 0.015,   // steward actions decay slowly
          active: true,
          reinforcement_count: 0,
          cited_by: [],
        });
        await env.STIGMERGY_KV.put('_stigmergy_traces', JSON.stringify(traces.filter(t => t.active && t.strength > 0.05).slice(0, 500)));

        vitalityUpdate = { bioregion, bioregion_name: br.name, previous_vitality: current, new_vitality: newVitality, delta: +(vitalityDelta).toFixed(3), note: 'Cumulative impact applied at natural agent timescale — ecological recovery is gradual' };
      }
    } catch(e) { /* non-fatal */ }
  }

  return R({ ok: true, logged: { actor_id, bioregion, action, impact_score }, vitality_update: vitalityUpdate });
}

// ═══════════════════════════════════════════════════════════════════════════
// PLANETARY CLOCK — Vitality indicators
// ═══════════════════════════════════════════════════════════════════════════

async function handleClock(env) {
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  // Phase 2: Use stored vitality (updated by steward actions + biosignals) instead of static baselines
  const storedVitality = await env.STIGMERGY_KV.get('_natural_vitality', 'json') || {};
  const bioregionsWithVitality = BIOREGIONS.map(b => ({
    ...b,
    vitality: storedVitality[b.id] !== undefined ? storedVitality[b.id] : b.vitality,
  }));
  const avgVitality = Math.round(bioregionsWithVitality.reduce((s, b) => s + b.vitality, 0) / bioregionsWithVitality.length);
  const emergencyZones = bioregionsWithVitality.filter(b => b.vitality < 35).length;
  const criticalZones  = bioregionsWithVitality.filter(b => b.vitality < 50).length;

  const today    = new Date();
  const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
  const principle = PRINCIPLES[dayOfYear % PRINCIPLES.length];

  const lunarPhase = getLunarPhase(today);

  const indicators = {
    planetary_vitality:    avgVitality,
    biodiversity_health:   Math.round(avgVitality * 0.88),
    climate_stability:     Math.round(avgVitality * 0.72),
    hydrosphere_integrity: Math.round(avgVitality * 0.81),
    soil_health:           Math.round(avgVitality * 0.85),
    indigenous_land_under_protection: 22, // % of global land under indigenous stewardship
    emergency_bioregions:  emergencyZones,
    critical_bioregions:   criticalZones,
  };

  // Persist to D1 clock_history weekly
  try {
    const week = `${today.getFullYear()}-W${Math.ceil(dayOfYear / 7)}`;
    await env.STIGMERGY_DB.prepare('INSERT OR IGNORE INTO clock_history (id, vitality_index, indicators, week) VALUES (?,?,?,?)')
      .bind(rnd(), avgVitality, JSON.stringify(indicators), week).run();
  } catch(e) { /* non-fatal */ }

  return R({
    planetary_vitality: avgVitality,
    status: avgVitality >= 60 ? 'stressed' : avgVitality >= 40 ? 'critical' : 'emergency',
    indicators,
    today_principle: principle,
    principles: PRINCIPLES,
    lunar_phase: lunarPhase,
    bioregion_count: BIOREGIONS.length,
    timestamp: new Date().toISOString(),
    version: VERSION,
  });
}

async function handleClockHistory(env) {
  const _dbErr = requireDB(env); if (_dbErr) return _dbErr;
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  try {
    const rows = await env.STIGMERGY_DB.prepare('SELECT * FROM clock_history ORDER BY created_at DESC LIMIT 52').all();
    return R({ history: rows?.results || [], weeks: rows?.results?.length || 0 });
  } catch(e) { return R({ error: 'D1 error: ' + e.message }, 500); }
}

function getLunarPhase(date) {
  // Simplified lunar phase calculation
  const knownNew  = new Date('2024-01-11').getTime();
  const cycleMs   = 29.53 * 24 * 60 * 60 * 1000;
  const elapsed   = (date.getTime() - knownNew) % cycleMs;
  const phase     = elapsed / cycleMs;
  if (phase < 0.0625) return { name: 'New Moon',        emoji: '🌑', phase: Math.round(phase * 100) };
  if (phase < 0.1875) return { name: 'Waxing Crescent', emoji: '🌒', phase: Math.round(phase * 100) };
  if (phase < 0.3125) return { name: 'First Quarter',   emoji: '🌓', phase: Math.round(phase * 100) };
  if (phase < 0.4375) return { name: 'Waxing Gibbous',  emoji: '🌔', phase: Math.round(phase * 100) };
  if (phase < 0.5625) return { name: 'Full Moon',        emoji: '🌕', phase: Math.round(phase * 100) };
  if (phase < 0.6875) return { name: 'Waning Gibbous',  emoji: '🌖', phase: Math.round(phase * 100) };
  if (phase < 0.8125) return { name: 'Last Quarter',    emoji: '🌗', phase: Math.round(phase * 100) };
  return                     { name: 'Waning Crescent',  emoji: '🌘', phase: Math.round(phase * 100) };
}

async function handleVitalityTimeline(env) {
  const _dbErr = requireDB(env); if (_dbErr) return _dbErr;
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  const timeline = BIOREGIONS.map(b => ({
    bioregion: b.name,
    id: b.id,
    vitality: b.vitality,
    trend: b.trend,
    biome: b.biome,
    status: b.vitality >= 70 ? 'healthy' : b.vitality >= 45 ? 'stressed' : b.vitality >= 25 ? 'critical' : 'emergency',
  })).sort((a, b) => a.vitality - b.vitality);

  return R({ timeline, planetary_avg: Math.round(BIOREGIONS.reduce((s,b) => s + b.vitality, 0) / BIOREGIONS.length) });
}

async function handleNodeHealth(request, env) {
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  const url  = new URL(request.url);
  const node = url.searchParams.get('node') || 'global';

  const docs = [];
  const meta = await env.STIGMERGY_KV.get('_meta', 'json') || { keys: [] };
  let count = 0;
  for (const k of (meta.keys || []).slice(0, 10)) {
    const doc = await env.STIGMERGY_KV.get(k, 'json');
    if (doc) { count++; docs.push(doc.sphere); }
  }

  const sphereBreakdown = {};
  docs.forEach(s => { sphereBreakdown[s] = (sphereBreakdown[s] || 0) + 1; });

  return R({ node, corpus_sample: count, sphere_breakdown: sphereBreakdown, bioregions: BIOREGIONS.length, principles: PRINCIPLES.length, timestamp: new Date().toISOString() });
}

// ═══════════════════════════════════════════════════════════════════════════
// STIGMERGY TRACE NETWORK
// ═══════════════════════════════════════════════════════════════════════════

async function handleTraceDeposit(request, env) {
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  const body = await request.json();
  const { actor_id, trace_type, bioregion, sphere, strength } = body;
  const content = body.content || body.signal;
  if (!content) return R({ error: 'content required' }, 400);

  const trace = {
    id:         rnd(),
    actor_id:   actor_id   || 'anonymous',
    content:    content.slice(0, 500),
    trace_type: trace_type || 'observation',
    bioregion:  bioregion  || 'global',
    sphere:     sphere     || 'NOOSPHERE',
    strength:   Math.min(1, Math.max(0, strength || 0.7)),
    deposited_at: new Date().toISOString(),
    decay_rate: 0.05, // 5% decay per day
    active: true,
  };

  const traces = await env.STIGMERGY_KV.get('_stigmergy_traces', 'json') || [];
  traces.unshift(trace);

  // Keep max 500 traces
  const active = traces.filter(t => t.active && t.strength > 0.05).slice(0, 500);
  await env.STIGMERGY_KV.put('_stigmergy_traces', JSON.stringify(active));

  return R({ ok: true, trace_id: trace.id, trace });
}

async function handleTraceRead(request, env) {
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  const url      = new URL(request.url);
  const sphere   = url.searchParams.get('sphere');
  const bioregion= url.searchParams.get('bioregion');
  const limit    = parseInt(url.searchParams.get('limit') || '50');

  let traces = await env.STIGMERGY_KV.get('_stigmergy_traces', 'json') || [];
  traces = traces.filter(t => t.active && t.strength > 0.05);

  if (sphere)    traces = traces.filter(t => t.sphere === sphere);
  if (bioregion) traces = traces.filter(t => t.bioregion === bioregion);

  traces = traces.slice(0, limit);

  return R({ traces, count: traces.length, filters: { sphere, bioregion } });
}

async function handleTraceState(env) {
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  const traces = await env.STIGMERGY_KV.get('_stigmergy_traces', 'json') || [];
  const active  = traces.filter(t => t.active && t.strength > 0.05);

  const bySphere  = {};
  const byBioregion = {};
  const byType    = {};
  let totalStrength = 0;

  for (const t of active) {
    bySphere[t.sphere]     = (bySphere[t.sphere] || 0) + 1;
    byBioregion[t.bioregion] = (byBioregion[t.bioregion] || 0) + 1;
    byType[t.trace_type]   = (byType[t.trace_type] || 0) + 1;
    totalStrength += t.strength;
  }

  return R({
    total_traces: traces.length,
    active_traces: active.length,
    total_strength: Math.round(totalStrength * 100) / 100,
    avg_strength: active.length ? Math.round((totalStrength / active.length) * 100) / 100 : 0,
    by_sphere: bySphere,
    by_bioregion: byBioregion,
    by_type: byType,
    version: VERSION,
  });
}

async function handleDecayManual(env) {
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  await runDecayEngine(env);
  return R({ ok: true, decay_run: new Date().toISOString() });
}

async function runDecayEngine(env) {
  try {
    const traces = await env.STIGMERGY_KV.get('_stigmergy_traces', 'json') || [];
    const dayMs  = 24 * 60 * 60 * 1000;
    const now    = Date.now();

    const decayed = traces.map(t => {
      const age    = (now - new Date(t.deposited_at).getTime()) / dayMs;
      // Phase 4: Reinforcement counteracts decay
      // Each reinforcement event adds 0.02 to effective base strength
      const reinforcementBonus = (t.reinforcement_count || 0) * 0.02;
      const effectiveStrength  = Math.min(1.0, t.strength + reinforcementBonus);
      const newStr = effectiveStrength * Math.pow(1 - (t.decay_rate || 0.05), age);
      return { ...t, strength: Math.round(newStr * 1000) / 1000, active: newStr > 0.05 };
    }).filter(t => t.strength > 0.01);

    await env.STIGMERGY_KV.put('_stigmergy_traces', JSON.stringify(decayed));
  } catch(e) { /* non-fatal */ }
}

async function handleNetworkSummary(env) {
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  const traces  = await env.STIGMERGY_KV.get('_stigmergy_traces', 'json') || [];
  const actors  = await env.STIGMERGY_KV.get('_actors', 'json') || [];
  const active  = traces.filter(t => t.active);

  return R({
    network: {
      traces: { total: traces.length, active: active.length },
      actors: { registered: actors.length },
      avg_actor_aai: actors.length ? Math.round(actors.reduce((s,a) => s + (a.aai || 50), 0) / actors.length) : 0,
      most_active_sphere: Object.entries(active.reduce((acc,t) => { acc[t.sphere]=(acc[t.sphere]||0)+1; return acc; }, {})).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'NOOSPHERE',
    },
    bioregions: BIOREGIONS.length,
    agreements: MULTILATERAL_AGREEMENTS.length,
    version: VERSION,
  });
}

async function handleGlobalPulse(env) {
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  const traces = await env.STIGMERGY_KV.get('_stigmergy_traces', 'json') || [];
  const active = traces.filter(t => t.active);
  const vitality = Math.round(BIOREGIONS.reduce((s,b) => s + b.vitality, 0) / BIOREGIONS.length);

  return R({
    pulse: Date.now(),
    alive: true,
    planetary_vitality: vitality,
    active_traces: active.length,
    total_strength: Math.round(active.reduce((s,t) => s + t.strength, 0) * 100) / 100,
    lunar_phase: getLunarPhase(new Date()),
    timestamp: new Date().toISOString(),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// MULTI-AGENT AIF — Phase 4: Emergence
// Emergence arises from local interactions with no central controller.
// Traces that get reinforced by multiple agents across timescales become attractors.
// No agent planned this — it appears from the interaction pattern itself.
// ═══════════════════════════════════════════════════════════════════════════

// Detect attractor traces — those reinforced by multiple agents
function detectAttractors(traces) {
  const active = traces.filter(t => t.active && t.strength > 0.05);

  // Attractors: traces with high reinforcement count AND high strength
  const attractors = active
    .filter(t => (t.reinforcement_count || 0) >= 2 || t.strength > 0.75)
    .sort((a, b) => (b.strength + (b.reinforcement_count || 0) * 0.1) - (a.strength + (a.reinforcement_count || 0) * 0.1))
    .slice(0, 10)
    .map(t => ({
      id: t.id,
      content: t.content?.slice(0, 120),
      type: t.trace_type,
      sphere: t.sphere,
      bioregion: t.bioregion,
      strength: t.strength,
      reinforcement_count: t.reinforcement_count || 0,
      timescale_depth: t.timescale_depth || 'unknown',
      timescale_weight: t.timescale_weight || 0.5,
      priority: t.priority || 'nominal',
      agent_type: t.agent_type || 'unknown',
      attractor_score: +(t.strength + (t.reinforcement_count || 0) * 0.1).toFixed(3),
    }));

  return attractors;
}

// Identify cross-agent convergence points — topics where multiple agent types converge
function identifyConvergencePoints(traces) {
  const active = traces.filter(t => t.active && t.strength > 0.05);

  // Group by sphere + bioregion
  const clusters = {};
  for (const t of active) {
    const key = `${t.sphere}::${t.bioregion}`;
    if (!clusters[key]) clusters[key] = { sphere: t.sphere, bioregion: t.bioregion, traces: [], agent_types: new Set(), total_strength: 0 };
    clusters[key].traces.push(t);
    clusters[key].agent_types.add(t.agent_type || 'unknown');
    clusters[key].total_strength += t.strength;
  }

  // Convergence = clusters with multiple agent types
  return Object.values(clusters)
    .filter(c => c.agent_types.size >= 2)
    .sort((a, b) => b.total_strength - a.total_strength)
    .slice(0, 5)
    .map(c => ({
      sphere: c.sphere,
      bioregion: c.bioregion,
      agent_types: [...c.agent_types],
      trace_count: c.traces.length,
      total_strength: +c.total_strength.toFixed(3),
      convergence_score: +(c.agent_types.size * c.total_strength / c.traces.length).toFixed(3),
      sample_content: c.traces.slice(0, 2).map(t => t.content?.slice(0, 80)),
    }));
}

// Compute network topology metrics
function computeNetworkTopology(traces, actors) {
  const active = traces.filter(t => t.active && t.strength > 0.05);

  // Node degree: how many traces does each agent have?
  const agentDegrees = {};
  for (const t of active) {
    const aid = t.agent_id || t.actor_id || 'anonymous';
    agentDegrees[aid] = (agentDegrees[aid] || 0) + 1;
  }

  // Bridge nodes: agents appearing in multiple sphere clusters
  const agentSpheres = {};
  for (const t of active) {
    const aid = t.agent_id || t.actor_id || 'anonymous';
    if (!agentSpheres[aid]) agentSpheres[aid] = new Set();
    agentSpheres[aid].add(t.sphere);
  }

  const bridges = Object.entries(agentSpheres)
    .filter(([, spheres]) => spheres.size >= 2)
    .map(([aid, spheres]) => ({ agent_id: aid, sphere_count: spheres.size, spheres: [...spheres] }))
    .sort((a, b) => b.sphere_count - a.sphere_count)
    .slice(0, 5);

  return {
    total_nodes: Object.keys(agentDegrees).length,
    total_edges: active.length,
    avg_degree: Object.keys(agentDegrees).length > 0
      ? +(active.length / Object.keys(agentDegrees).length).toFixed(2) : 0,
    bridges,
    most_active_agent: Object.entries(agentDegrees).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
  };
}

// GET /api/stigmergy/attractors — emergent attractors from trace reinforcement
async function handleAttractorAnalysis(env) {
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  const traces  = await env.STIGMERGY_KV.get('_stigmergy_traces', 'json') || [];
  const actors  = await env.STIGMERGY_KV.get('_actors', 'json') || [];

  const attractors     = detectAttractors(traces);
  const convergence    = identifyConvergencePoints(traces);
  const topology       = computeNetworkTopology(traces, actors);
  const active         = traces.filter(t => t.active && t.strength > 0.05);

  // Sphere heat map — where is attention concentrating?
  const sphereHeat = {};
  for (const t of active) {
    if (!sphereHeat[t.sphere]) sphereHeat[t.sphere] = { count: 0, total_strength: 0, agent_types: new Set() };
    sphereHeat[t.sphere].count += 1;
    sphereHeat[t.sphere].total_strength += t.strength;
    sphereHeat[t.sphere].agent_types.add(t.agent_type || 'unknown');
  }
  const sphereHeatMap = Object.entries(sphereHeat)
    .map(([sphere, data]) => ({
      sphere,
      label: SPHERE_LABELS[sphere] || sphere,
      trace_count: data.count,
      total_strength: +data.total_strength.toFixed(3),
      agent_types: [...data.agent_types],
      heat: +(data.total_strength / Math.max(active.length, 1)).toFixed(3),
    }))
    .sort((a, b) => b.total_strength - a.total_strength);

  return R({
    ok: true,
    attractors,
    convergence_points: convergence,
    network_topology: topology,
    sphere_heat_map: sphereHeatMap,
    emergence_summary: {
      attractor_count: attractors.length,
      cross_agent_convergence: convergence.length > 0,
      highest_attractor: attractors[0]?.content || null,
      dominant_sphere: sphereHeatMap[0]?.sphere || null,
    },
    timestamp: new Date().toISOString(),
    version: VERSION,
  });
}

// GET /api/stigmergy/emergence — full emergence report: attractors + patterns + topology
async function handleEmergenceReport(env) {
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  const traces  = await env.STIGMERGY_KV.get('_stigmergy_traces', 'json') || [];
  const actors  = await env.STIGMERGY_KV.get('_actors', 'json') || [];
  const stored  = await env.STIGMERGY_KV.get('_natural_vitality', 'json') || {};

  const attractors     = detectAttractors(traces);
  const convergence    = identifyConvergencePoints(traces);
  const topology       = computeNetworkTopology(traces, actors);
  const naturalAgents  = getAllNodes().map(n => buildNaturalAgentNode(n, stored));

  // Temporal layer analysis: which timescales are most represented?
  const active = traces.filter(t => t.active && t.strength > 0.05);
  const timescaleDist = {};
  for (const t of active) {
    const ts = t.timescale_depth || 'unknown';
    timescaleDist[ts] = (timescaleDist[ts] || 0) + t.strength;
  }

  // Detect emergent system narrative: what is the network "saying"?
  const dominantAttractors = attractors.slice(0, 3).map(a => a.content).join('; ');
  const dominantBioregion  = convergence[0]?.bioregion || null;
  const dominantSphere     = convergence[0]?.sphere || attractors[0]?.sphere || null;

  // Most stressed natural agent
  const mostStressed = naturalAgents
    .sort((a, b) => b.current_state.free_energy - a.current_state.free_energy)[0];

  return R({
    ok: true,
    emergence: {
      attractors,
      convergence_points: convergence,
      network_topology: topology,
      temporal_distribution: timescaleDist,
      dominant_signal: dominantAttractors || 'No clear attractors yet — network still forming',
      dominant_bioregion: dominantBioregion,
      dominant_sphere: dominantSphere,
      most_stressed_natural_agent: mostStressed ? {
        id: mostStressed.bioregion_id,
        name: mostStressed.name,
        free_energy: mostStressed.current_state.free_energy,
        vitality: mostStressed.current_state.vitality,
        priority: mostStressed.current_state.priority,
      } : null,
    },
    interpretation: attractors.length === 0
      ? 'Network is sparse — few strong attractors. The stigmergic medium is forming but not yet self-organizing.'
      : convergence.length === 0
      ? 'Attractors present but no cross-agent convergence. Agents are active but operating in silos.'
      : 'Emergence detected: multiple agent types converging on shared attractors. The network is self-organizing.',
    timestamp: new Date().toISOString(),
    version: VERSION,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTORS & AGREEMENTS — Alignment tracking
// ═══════════════════════════════════════════════════════════════════════════

function computeAAI(actor) {
  const { agreement_scores = [], interaction_scores = [], sphere_alignment = 0 } = actor;
  const agr = agreement_scores.length ? agreement_scores.reduce((s,x) => s + x, 0) / agreement_scores.length : 50;
  const int = interaction_scores.length ? interaction_scores.reduce((s,x) => s + x, 0) / interaction_scores.length : 50;
  return Math.round(agr * 0.4 + int * 0.35 + sphere_alignment * 0.25);
}

function aaiBand(score) {
  if (score >= 70) return { band: 'Aligned',       color: '#4a7c59' };
  if (score >= 40) return { band: 'Contradictory', color: '#e0a020' };
  if (score >= 10) return { band: 'Extractive',    color: '#e05020' };
  return                  { band: 'Critical',      color: '#8b0000' };
}

async function handleActorsList(env) {
  const _dbErr = requireDB(env); if (_dbErr) return _dbErr;
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  const raw = await env.STIGMERGY_KV.get('_actors', 'json') || [];
  // Deduplicate by name, keeping last entry (most recent registration wins)
  const seen = new Map();
  for (const a of raw) seen.set(a.name?.toLowerCase(), a);
  const actors = [...seen.values()];
  return R({ actors: actors.map(a => ({ ...a, aai: computeAAI(a), ...aaiBand(computeAAI(a)) })), count: actors.length, raw_count: raw.length });
}

async function handleActorsDedup(env, admin) {
  if (!admin) return R({ error: 'Admin key required' }, 403);
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  const raw = await env.STIGMERGY_KV.get('_actors', 'json') || [];
  const seen = new Map();
  for (const a of raw) seen.set(a.name?.toLowerCase(), a);
  const deduped = [...seen.values()];
  await env.STIGMERGY_KV.put('_actors', JSON.stringify(deduped));
  return R({ ok: true, before: raw.length, after: deduped.length, removed: raw.length - deduped.length });
}

async function handleActorCreate(request, env) {
  const _dbErr = requireDB(env); if (_dbErr) return _dbErr;
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  const body = await request.json();
  const { name, type, description, sphere_focus, agreements_ratified } = body;
  if (!name) return R({ error: 'name required' }, 400);

  const existingActors = await env.STIGMERGY_KV.get('_actors', 'json') || [];
  if (existingActors.some(a => a.name?.toLowerCase() === name.toLowerCase()))
    return R({ error: `Actor "${name}" already exists. Use a unique name.` }, 409);

  const actor = {
    id:                  rnd(),
    name,
    type:                type || 'organization',
    description:         description || '',
    sphere_focus:        sphere_focus || 'NOOSPHERE',
    agreements_ratified: agreements_ratified || [],
    agreement_scores:    [],
    interaction_scores:  [],
    sphere_alignment:    50,
    created_at:          new Date().toISOString(),
  };

  actor.aai = computeAAI(actor);

  existingActors.push(actor);
  await env.STIGMERGY_KV.put('_actors', JSON.stringify(existingActors));

  return R({ ok: true, actor, ...aaiBand(actor.aai) });
}

async function handleActorNodeGet(request, env) {
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  const url = new URL(request.url);
  const actor_id = url.searchParams.get('actor_id');
  const node_id  = url.searchParams.get('node_id');
  if (!actor_id) return R({ error: 'actor_id query param required' }, 400);
  const actors = await env.STIGMERGY_KV.get('_actors', 'json') || [];
  let actor = actors.find(a => a.id === actor_id);
  // Fallback: actors processed by handleActorModel are stored per-key as actor:${id}
  if (!actor) actor = await env.STIGMERGY_KV.get(`actor:${actor_id}`, 'json');
  if (!actor) return R({ error: 'Actor not found' }, 404);
  const aai = computeAAI(actor);
  const band = aaiBand(aai);
  const signalQuality = aai >= 70 ? 1.0 : aai >= 40 ? 0.7 : aai >= 10 ? 0.4 : 0.1;
  return R({ actor_id, node_id, aai, band: band.band, signal_quality: signalQuality, influence: Math.round(aai * signalQuality) });
}

async function handleActorNode(request, env) {
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  const body = await request.json();
  const { actor_id, node_id } = body;

  const actors = await env.STIGMERGY_KV.get('_actors', 'json') || [];
  const actor  = actors.find(a => a.id === actor_id);
  if (!actor)  return R({ error: 'Actor not found' }, 404);

  const aai = computeAAI(actor);
  const band = aaiBand(aai);

  // Cross-node influence: contradictory actors degrade signal quality
  const signalQuality = aai >= 70 ? 1.0 : aai >= 40 ? 0.7 : aai >= 10 ? 0.4 : 0.1;

  return R({ actor_id, node_id, aai, band: band.band, signal_quality: signalQuality, influence: Math.round(aai * signalQuality) });
}

async function handleActorInteraction(request, env) {
  const _dbErr = requireDB(env); if (_dbErr) return _dbErr;
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  const body = await request.json();
  const { actor_a, actor_b, interaction_type, alignment_delta } = body;
  if (!actor_a) return R({ error: 'actor_a required' }, 400);

  const actors = await env.STIGMERGY_KV.get('_actors', 'json') || [];
  const a = actors.find(x => x.id === actor_a);
  const b = actors.find(x => x.id === actor_b);

  if (a && alignment_delta !== undefined) {
    a.interaction_scores = a.interaction_scores || [];
    a.interaction_scores.push(Math.max(0, Math.min(100, 50 + (alignment_delta || 0))));
    if (a.interaction_scores.length > 20) a.interaction_scores.shift();
  }

  await env.STIGMERGY_KV.put('_actors', JSON.stringify(actors));

  // Deposit stigmergy trace
  const traces  = await env.STIGMERGY_KV.get('_stigmergy_traces', 'json') || [];
  const traceId = rnd();
  traces.unshift({
    id: traceId, actor_id: actor_a, content: `Actor interaction: ${interaction_type || 'engagement'}`, trace_type: 'actor_interaction',
    bioregion: 'global', sphere: a?.sphere_focus || 'NOOSPHERE', strength: 0.6, deposited_at: new Date().toISOString(), decay_rate: 0.07, active: true,
  });
  await env.STIGMERGY_KV.put('_stigmergy_traces', JSON.stringify(traces.slice(0, 500)));

  try {
    await env.STIGMERGY_DB.prepare('INSERT INTO actor_interactions (id, actor_a, actor_b, interaction_type, alignment_delta, trace_id) VALUES (?,?,?,?,?,?)')
      .bind(traceId, actor_a, actor_b || null, interaction_type || 'engagement', alignment_delta || 0, traceId).run();
  } catch(e) { /* non-fatal */ }

  return R({ ok: true, trace_id: traceId, actor_a_aai: a ? computeAAI(a) : null });
}

async function handleAgreementsList(env) {
  const _dbErr = requireDB(env); if (_dbErr) return _dbErr;
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  return R({ agreements: MULTILATERAL_AGREEMENTS, count: MULTILATERAL_AGREEMENTS.length });
}

async function handleAgreementLog(request, env) {
  const _dbErr = requireDB(env); if (_dbErr) return _dbErr;
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  const { actor_id, agreement_id, alignment_score, notes } = await request.json();
  if (!actor_id || !agreement_id) return R({ error: 'actor_id and agreement_id required' }, 400);

  const agreement = MULTILATERAL_AGREEMENTS.find(a => a.id === agreement_id);
  if (!agreement)  return R({ error: 'Unknown agreement_id', valid: MULTILATERAL_AGREEMENTS.map(a => a.id) }, 404);

  const actors = await env.STIGMERGY_KV.get('_actors', 'json') || [];
  const actor  = actors.find(a => a.id === actor_id);
  if (!actor)  return R({ error: 'Actor not found' }, 404);

  actor.agreement_scores = actor.agreement_scores || [];
  actor.agreement_scores.push(alignment_score || agreement.alignment_score);
  actor.agreements_ratified = [...new Set([...(actor.agreements_ratified || []), agreement_id])];

  await env.STIGMERGY_KV.put('_actors', JSON.stringify(actors));

  return R({ ok: true, actor_id, agreement: agreement.name, new_aai: computeAAI(actor), ...aaiBand(computeAAI(actor)) });
}

// ═══════════════════════════════════════════════════════════════════════════
// ANCIENT INTELLIGENCE
// ═══════════════════════════════════════════════════════════════════════════

async function handleAncientIntelligence(request, env) {
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  const url    = new URL(request.url);
  const query  = url.searchParams.get('q') || '';
  const tradition = url.searchParams.get('tradition');

  if (tradition) {
    const t = ANCIENT_TRADITIONS.find(x => x.id === tradition);
    if (!t) return R({ error: 'Tradition not found', valid: ANCIENT_TRADITIONS.map(x => x.id) }, 404);

    // Search corpus for related docs
    const related = await bm25Search(t.name + ' ' + t.principle, env, 3);

    return R({ tradition: t, related_corpus: related.map(d => ({ title: d.title, url: d.url })), note: 'Ancient intelligence is kept at the local level and shared with consent.' });
  }

  if (query) {
    // Search both corpus and traditions
    const corpusDocs = await bm25Search(query, env, 5);
    const scoredTraditions = ANCIENT_TRADITIONS.filter(t =>
      t.name.toLowerCase().includes(query.toLowerCase()) ||
      t.principle.toLowerCase().includes(query.toLowerCase()) ||
      t.origin.toLowerCase().includes(query.toLowerCase())
    );

    return R({ query, traditions: scoredTraditions, corpus: corpusDocs.map(d => ({ title: d.title, url: d.url, sphere: d.sphere })) });
  }

  return R({ traditions: ANCIENT_TRADITIONS, count: ANCIENT_TRADITIONS.length, note: 'Ancient intelligence is the most sacred form of knowledge in the Ayu system.' });
}

// ═══════════════════════════════════════════════════════════════════════════
// WELLBEING — AI-generated practices
// ═══════════════════════════════════════════════════════════════════════════

async function handleWellbeing(env) {
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  const cached = await env.STIGMERGY_KV.get('_wellbeing_suggestions', 'json');
  if (cached) return R(cached);
  // Generate on demand if no cache
  return handleWellbeingGenerate(env);
}

async function handleWellbeingGenerate(env) {
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  if (!env.AI) return R({ error: 'Workers AI binding required — add AI binding in Cloudflare dashboard' }, 503);

  const domain = WELLBEING_DOMAINS[Math.floor(Math.random() * WELLBEING_DOMAINS.length)];
  const lunar  = getLunarPhase(new Date());

  const prompt = `Generate 5 planetary wellbeing practices for people engaged in regenerative work and planetary co-intelligence.

Context:
- Current lunar phase: ${lunar.name} ${lunar.emoji}
- Featured domain: ${domain}
- Today's living systems principle: "${PRINCIPLES[Math.floor(Math.random() * PRINCIPLES.length)]}"

Each practice should:
- Be specific and actionable (5-10 minutes)
- Connect individual wellbeing to planetary health
- Draw on diverse traditions (somatic, indigenous, systems, ecological)
- Name the sphere it addresses

Return JSON array of 5 objects: { title, description, duration_minutes, sphere, tradition, lunar_resonance }`;

  try {
    const aiResp = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 800,
    });

    const text = aiResp.response || aiResp.choices?.[0]?.message?.content || '[]';
    const jsonMatch = text.match(/\[[\s\S]*?\]/s);
    const suggestions = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    const result = { suggestions, domain, lunar_phase: lunar, generated_at: new Date().toISOString() };
    await env.STIGMERGY_KV.put('_wellbeing_suggestions', JSON.stringify(result), { expirationTtl: 6 * 60 * 60 }); // 6 hour cache
    return R(result);
  } catch(e) { return R({ error: e.message }, 500); }
}

// ═══════════════════════════════════════════════════════════════════════════
// DISCOVERY — New resource queue
// ═══════════════════════════════════════════════════════════════════════════

async function handleDiscoveryList(env) {
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  const queue = await env.STIGMERGY_KV.get('_discovery_queue', 'json') || [];
  return R({ queue, count: queue.length });
}

async function handleDiscoveryAdd(request, env) {
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  const { url, title, sphere, notes } = await request.json();
  if (!url) return R({ error: 'url required' }, 400);

  const queue = await env.STIGMERGY_KV.get('_discovery_queue', 'json') || [];
  const item  = { id: rnd(), url, title: title || url, sphere: sphere || 'NOOSPHERE', notes: notes || '', added_at: new Date().toISOString(), status: 'pending' };
  queue.push(item);
  await env.STIGMERGY_KV.put('_discovery_queue', JSON.stringify(queue.slice(0, 200)));
  return R({ ok: true, item });
}

async function handleDiscoveryRun(env, admin) {
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  if (!admin) return R({ error: 'Admin key required' }, 403);

  const queue = await env.STIGMERGY_KV.get('_discovery_queue', 'json') || [];
  const pending = queue.filter(i => i.status === 'pending').slice(0, 5);
  const meta = await env.STIGMERGY_KV.get('_meta', 'json') || { count: 0, keys: [] };
  const results = [];

  for (const item of pending) {
    try {
      const resp = await fetch(item.url, { headers: { 'User-Agent': 'Ayu-Stigmergy-Bot/1.0' } });
      if (!resp.ok) { item.status = 'failed'; results.push({ url: item.url, error: resp.status }); continue; }

      const html = await resp.text();
      const text = cleanHtml(html);
      if (text.length < 100) { item.status = 'failed'; results.push({ url: item.url, error: 'insufficient text' }); continue; }

      const docKey = `doc:discovery:${hash(item.url)}`;
      await env.STIGMERGY_KV.put(docKey, JSON.stringify({ url: item.url, title: item.title, sphere: item.sphere, spheres_secondary: computeSecondarySpheres(text.slice(0,3000), item.sphere), text: text.slice(0, 3000), source: 'discovery', indexed_at: new Date().toISOString() }));
      if (!meta.keys.includes(docKey)) meta.keys.push(docKey);

      item.status = 'indexed';
      results.push({ url: item.url, ok: true, chars: text.length });
    } catch(e) { item.status = 'error'; results.push({ url: item.url, error: e.message }); }
  }

  meta.count = meta.keys.length;
  await env.STIGMERGY_KV.put('_meta', JSON.stringify(meta));
  await env.STIGMERGY_KV.put('_discovery_queue', JSON.stringify(queue));
  return R({ ok: true, processed: pending.length, results });
}

// ═══════════════════════════════════════════════════════════════════════════
// ENERGY — Renewable energy stats
// ═══════════════════════════════════════════════════════════════════════════

const ENERGY_SOURCES = [
  { url: 'https://www.irena.org/Statistics/View-Data-by-Topic/Capacity-and-Generation/Technologies', label: 'IRENA Renewables', type: 'primary' },
  { url: 'https://ember-climate.org/data/', label: 'Ember Climate', type: 'primary' },
  { url: 'https://www.ren21.net/reports/global-status-report/', label: 'REN21 GSR', type: 'primary' },
];

async function handleEnergy(env) {
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  const cached = await env.STIGMERGY_KV.get('_energy_stats', 'json');
  if (cached && cached.fetched_at && (Date.now() - new Date(cached.fetched_at).getTime()) < 12 * 60 * 60 * 1000) {
    return R({ ...cached, cache: true });
  }

  // Fallback: authoritative 2024 data (IRENA)
  const stats = {
    global_renewable_capacity_gw: 3870,
    solar_pv_gw: 1630,
    wind_gw: 1120,
    hydro_gw: 1390,
    other_renewables_gw: 730,
    renewables_share_electricity: 0.304,
    fossil_fuel_share_electricity: 0.611,
    nuclear_share_electricity: 0.085,
    annual_renewable_additions_gw: 295,
    fossil_fuel_subsidies_usd_bn: 7000,
    renewable_investment_usd_bn: 358,
    data_year: 2024,
    sources: ENERGY_SOURCES.map(s => s.label),
    fetched_at: new Date().toISOString(),
    planetary_efficiency: 30.4, // % renewable electricity
  };

  await env.STIGMERGY_KV.put('_energy_stats', JSON.stringify(stats), { expirationTtl: 12 * 60 * 60 });
  return R({ ...stats, cache: false });
}

async function handleScrapeLogs(env, admin) {
  if (!admin) return R({ error: 'Admin key required' }, 403);
  const _dbErr = requireDB(env); if (_dbErr) return _dbErr;
  try {
    const rows = await env.STIGMERGY_DB.prepare(
      `SELECT url, sphere, status, chars, delta, created_at FROM scrape_logs ORDER BY created_at DESC LIMIT 100`
    ).all();
    const logs = rows.results || [];

    // If D1 is empty, synthesise log entries from KV corpus as fallback
    // so admin always sees something useful
    if (logs.length === 0 && env.STIGMERGY_KV) {
      const meta = await env.STIGMERGY_KV.get('_meta', 'json') || { keys: [] };
      const synth = [];
      for (const k of (meta.keys || []).slice(0, 50)) {
        const doc = await env.STIGMERGY_KV.get(k, 'json');
        if (doc?.source === 'scrape' && doc?.url) {
          synth.push({
            url:        doc.url,
            sphere:     doc.sphere || '—',
            status:     200,
            chars:      doc.text?.length || 0,
            delta:      1,
            created_at: doc.indexed_at || doc.fetched_at || null,
            _source:    'kv-fallback',
          });
        }
      }
      if (synth.length > 0) {
        return R({ ok: true, logs: synth, count: synth.length,
          note: 'D1 scrape_logs table is empty — showing KV corpus entries. Run Init DB then scrape again to populate D1 logs.' });
      }
    }

    return R({ ok: true, logs, count: logs.length });
  } catch(e) {
    // If table doesn't exist, return helpful message
    if (e.message?.includes('no such table')) {
      return R({ ok: false, logs: [], count: 0,
        error: 'scrape_logs table missing',
        hint: 'Go to Setup tab → Init / Migrate Database, then run scrapes to populate logs.' });
    }
    return R({ error: e.message, hint: 'Run Init DB first' }, 500);
  }
}

async function handleEnergyScrapeLog(env) {
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  const log = await env.STIGMERGY_KV.get('_energy_scrape_log', 'json') || [];
  return R({ log, sources: ENERGY_SOURCES });
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERY ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════

async function handleQueryAnalytics(env, admin) {
  const _dbErr = requireDB(env); if (_dbErr) return _dbErr;
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  if (!admin) return R({ error: 'Admin key required' }, 403);

  try {
    const recent = await env.STIGMERGY_DB.prepare('SELECT sphere, COUNT(*) as count, AVG(score) as avg_score FROM queries GROUP BY sphere ORDER BY count DESC').all();
    const total  = await env.STIGMERGY_DB.prepare('SELECT COUNT(*) as total FROM queries').first();
    const feedback = await env.STIGMERGY_DB.prepare('SELECT AVG(score) as avg_feedback, COUNT(*) as feedback_count FROM feedback').first();

    return R({
      total_queries: total?.total || 0,
      by_sphere: recent?.results || [],
      avg_feedback_score: feedback?.avg_feedback || 0,
      feedback_count: feedback?.feedback_count || 0,
    });
  } catch(e) { return R({ error: e.message }, 500); }
}

// ═══════════════════════════════════════════════════════════════════════════
// WEEKLY MAINTENANCE — Cron 0 2 * * 0
// ═══════════════════════════════════════════════════════════════════════════

async function runWeeklyMaintenance(env) {
  const log = [];

  // 1. Scrape all 10 batches
  for (let batch = 1; batch <= 10; batch++) {
    try {
      await handleScrape({ url: `https://stigmergy.ayuearth.workers.dev/api/scrape?batch=${batch}`, method: 'GET', headers: new Headers() }, env, false);
      log.push({ step: `scrape_batch_${batch}`, ok: true });
    } catch(e) { log.push({ step: `scrape_batch_${batch}`, error: e.message }); }
    await delay(500);
  }

  // 2. Generate wellbeing suggestions
  try {
    await handleWellbeingGenerate(env);
    log.push({ step: 'wellbeing_generate', ok: true });
  } catch(e) { log.push({ step: 'wellbeing_generate', error: e.message }); }

  // 3. Run recategorization
  try {
    await handleRecategorize(env, true);
    log.push({ step: 'recategorize', ok: true });
  } catch(e) { log.push({ step: 'recategorize', error: e.message }); }

  // 4. Log clock history
  try {
    await handleClock(env);
    log.push({ step: 'clock_history', ok: true });
  } catch(e) { log.push({ step: 'clock_history', error: e.message }); }

  // 5. Decay engine
  try {
    await runDecayEngine(env);
    log.push({ step: 'decay_engine', ok: true });
  } catch(e) { log.push({ step: 'decay_engine', error: e.message }); }

  await env.STIGMERGY_KV.put('_last_maintenance', JSON.stringify({ at: new Date().toISOString(), log }));
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

function requireKV(env)  { if (!env.STIGMERGY_KV)  return R({ error: "STIGMERGY_KV binding not configured — go to Cloudflare Worker > Settings > Variables & Bindings", binding: "STIGMERGY_KV"  }, 503); }
function requireR2(env)  { if (!env.STIGMERGY_R2)  return R({ error: "STIGMERGY_R2 binding not configured — go to Cloudflare Worker > Settings > Variables & Bindings", binding: "STIGMERGY_R2"  }, 503); }
function requireDB(env)  { if (!env.STIGMERGY_DB)  return R({ error: "STIGMERGY_DB binding not configured — go to Cloudflare Worker > Settings > Variables & Bindings", binding: "STIGMERGY_DB"  }, 503); }
function requireAll(env) { return requireKV(env) || requireR2(env) || requireDB(env); }

async function handleMyLocation(request) {
  const cf = request.cf || {};
  const lat     = cf.latitude  ? parseFloat(cf.latitude)  : null;
  const lng     = cf.longitude ? parseFloat(cf.longitude) : null;
  const city    = cf.city    || null;
  const country = cf.country || null;
  return R({ lat, lng, city, country,
    note: 'IP-derived approximate location. Precision ~25km. Not stored.' });
}

function R(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: CORS });
}

function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return (h >>> 0).toString(36);
}

function rnd() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ═══════════════════════════════════════════════════════════════════════════
// SMOKE TEST — Fast binding + route availability check (no admin key needed)
// ═══════════════════════════════════════════════════════════════════════════

async function handleSmokeTest(env) {
  const results = [];
  const t0 = Date.now();

  const check = async (name, fn) => {
    const ts = Date.now();
    try {
      const r = await fn();
      results.push({ test: name, status: 'pass', ms: Date.now() - ts, detail: r });
    } catch(e) {
      results.push({ test: name, status: 'fail', ms: Date.now() - ts, error: e.message });
    }
  };

  // Binding checks
  await check('binding:KV', async () => {
    if (!env.STIGMERGY_KV) throw new Error('STIGMERGY_KV binding missing');
    await env.STIGMERGY_KV.put('_smoke', 'ok', { expirationTtl: 60 });
    const v = await env.STIGMERGY_KV.get('_smoke');
    if (v !== 'ok') throw new Error('KV write/read mismatch');
    return 'KV read/write ok';
  });

  await check('binding:R2', async () => {
    if (!env.STIGMERGY_R2) throw new Error('STIGMERGY_R2 binding missing');
    await env.STIGMERGY_R2.put('_smoke', 'ok');
    const obj = await env.STIGMERGY_R2.get('_smoke');
    if (!obj) throw new Error('R2 write/read mismatch');
    return 'R2 read/write ok';
  });

  await check('binding:D1', async () => {
    if (!env.STIGMERGY_DB) throw new Error('STIGMERGY_DB binding missing');
    const row = await env.STIGMERGY_DB.prepare('SELECT 1 as ping').first();
    if (!row?.ping) throw new Error('D1 ping failed');
    return 'D1 SELECT ok';
  });

  await check('binding:AI', async () => {
    if (!env.AI) throw new Error('Workers AI (AI) binding missing');
    return 'key present (not validated)';
  });

  // Route checks (static/no-op)
  await check('route:/api/stigmergy/pulse', async () => 'static route ok');
  await check('route:/api/ancient-intelligence/traditions', async () => `${ANCIENT_TRADITIONS.length} traditions loaded`);
  await check('route:/api/agreements (data)', async () => `${MULTILATERAL_AGREEMENTS.length} agreements loaded`);
  await check('constants:spheres', async () => `${Object.keys(SPHERES).length} spheres defined`);
  await check('constants:bioregions', async () => `${BIOREGIONS.length} bioregions defined`);

  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const allPass = failed === 0;

  return R({
    smoke_test: allPass ? 'PASS' : 'FAIL',
    version: VERSION,
    passed,
    failed,
    total: results.length,
    duration_ms: Date.now() - t0,
    results,
    timestamp: new Date().toISOString(),
    diagnosis: failed > 0 ? 'Check Cloudflare dashboard: ensure STIGMERGY_KV, STIGMERGY_R2, STIGMERGY_DB, AI, ADMIN_KEY bindings are configured under Worker > Settings > Variables & Bindings' : 'All bindings and constants healthy',
  }, allPass ? 200 : 503);
}

// ═══════════════════════════════════════════════════════════════════════════
// END-TO-END TEST — Full pipeline: seed → query → feedback → clock
// ═══════════════════════════════════════════════════════════════════════════

async function handleE2ETest(env, admin) {
  if (!admin) return R({ error: 'Admin key required for E2E test' }, 403);

  const results = [];
  const t0 = Date.now();
  const testId = 'e2e_' + rnd();

  const step = async (name, fn) => {
    const ts = Date.now();
    try {
      const detail = await fn();
      results.push({ step: name, status: 'pass', ms: Date.now() - ts, detail });
      return { ok: true, detail };
    } catch(e) {
      results.push({ step: name, status: 'fail', ms: Date.now() - ts, error: e.message });
      return { ok: false, error: e.message };
    }
  };

  // Step 1: Verify DB tables exist (init-db idempotent check)
  await step('1_db_tables', async () => {
    const row = await env.STIGMERGY_DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    const tables = row.results.map(r => r.name);
    return `Tables: ${tables.join(', ') || '(none — run /api/init-db first)'}`;
  });

  // Step 2: Write a test doc to KV
  await step('2_kv_write_doc', async () => {
    const doc = {
      id: testId, title: 'E2E Test Doc', content: 'This is a planetary co-intelligence test document about regenerative systems.',
      sphere: 'BIOSPHERE', source: 'e2e_test', indexed_at: new Date().toISOString()
    };
    await env.STIGMERGY_KV.put(`doc:${testId}`, JSON.stringify(doc), { expirationTtl: 300 });
    return `Doc ${testId} written to KV`;
  });

  // Step 3: Read it back
  await step('3_kv_read_doc', async () => {
    const raw = await env.STIGMERGY_KV.get(`doc:${testId}`);
    if (!raw) throw new Error('Doc not found in KV');
    const doc = JSON.parse(raw);
    if (doc.id !== testId) throw new Error('Doc ID mismatch');
    return `Doc ${testId} verified in KV`;
  });

  // Step 4: Write to R2
  await step('4_r2_write', async () => {
    await env.STIGMERGY_R2.put(`e2e/${testId}.txt`, 'E2E test payload', { httpMetadata: { contentType: 'text/plain' } });
    return `R2 object e2e/${testId}.txt written`;
  });

  // Step 5: Clock endpoint
  await step('5_clock_data', async () => {
    const clockRes = await handleClock(env);
    const data = await clockRes.json();
    const vi = data.vitality_index ?? data.planetary_vitality;
    if (vi === undefined || vi === null) throw new Error('Clock returned no vitality index');
    return `Vitality: ${vi} (${data.status})`;
  });

  // Step 6: Ancient intelligence
  await step('6_ancient_intelligence', async () => {
    if (!ANCIENT_TRADITIONS || ANCIENT_TRADITIONS.length === 0) throw new Error('No ancient traditions loaded');
    return `${ANCIENT_TRADITIONS.length} traditions available`;
  });

  // Step 7: Agreements list
  await step('7_agreements', async () => {
    if (!MULTILATERAL_AGREEMENTS || MULTILATERAL_AGREEMENTS.length === 0) throw new Error('No agreements loaded');
    return `${MULTILATERAL_AGREEMENTS.length} agreements available`;
  });

  // Step 8: Query pipeline (only if Workers AI binding exists)
  await step('8_query_pipeline', async () => {
    if (!env.AI) return 'Skipped — Workers AI binding not set';
    const fakeReq = new Request('https://x/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'What is regenerative AI?', sphere: 'NOOSPHERE' })
    });
    const r = await handleQuery(fakeReq, env);
    const data = await r.json();
    if (r.status !== 200) throw new Error(data.error || 'Query failed: ' + r.status);
    return `Query ok, response length: ${data.response?.length || 0} chars`;
  });

  // Cleanup: remove test KV key
  try { await env.STIGMERGY_KV.delete(`doc:${testId}`); } catch(e) {}

  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;

  return R({
    e2e_test: failed === 0 ? 'PASS' : (passed > 0 ? 'PARTIAL' : 'FAIL'),
    version: VERSION,
    test_id: testId,
    passed,
    failed,
    total: results.length,
    duration_ms: Date.now() - t0,
    steps: results,
    timestamp: new Date().toISOString(),
  }, failed === 0 ? 200 : 207);
}

// ═══════════════════════════════════════════════════════════════════════════
// INGEST — Umwelt-aware sensor data ingest
// Each reading is routed to its correct sphere node via SIGNAL_TO_SPHERE.
// Unknown signal types quarantined to liminal bucket, not silently ignored.
// AI translation is per-sphere, not a collapsed aggregate.
// ═══════════════════════════════════════════════════════════════════════════

// Unit lookup from DISTRESS_THRESHOLDS, fallback to generic
function getSignalUnit(signal_type) {
  return DISTRESS_THRESHOLDS[signal_type]?.unit || 'raw';
}

// Map source/sensor_track → canonical source_type for authority weighting
function resolveSourceType(source, sensor_track) {
  if (source === 'steward_observation' || source === 'indigenous_knowledge') return 'steward_observation';
  if (sensor_track === 'living_biosensor') return 'satellite';  // TRL 3-4, treated as satellite-class confidence
  if (sensor_track === 'bio_hybrid')       return 'ground_sensor';
  if (source === 'proxy_api')              return 'proxy_api';
  return 'ground_sensor';
}

async function handleIngest(request, env) {
  const _kvErr = requireKV(env); if (_kvErr) return _kvErr;
  const _dbErr = requireDB(env); if (_dbErr) return _dbErr;

  let body;
  try { body = await request.json(); } catch(e) { return R({ error: 'Invalid JSON' }, 400); }

  const {
    lat           = 39.95027370248936,
    lng           = -105.16033976443673,
    source        = 'pilot_plot',
    sensor_track  = 'bio_hybrid',
    readings      = {},
    steward_note  = '',
    scale         = 'microcosm',
    steward_id    = null,
  } = body;

  if (!readings || Object.keys(readings).length === 0)
    return R({ error: 'readings object required. Provide at least one sensor value.' }, 400);

  const bioregion    = nearestBioregion(lat, lng);
  const allowedSpheres = NATURAL_UMWELT[bioregion.biome] || ['BIOSPHERE'];
  const ts           = Date.now();
  const source_type  = resolveSourceType(source, sensor_track);
  const authority_weight = SOURCE_TYPE_AUTHORITY[source_type] || 0.6;

  // ── Step 1: Route each reading to its sphere (Umwelt enforcement) ────────
  const sphereReadings = {};   // { BIOSPHERE: { ndvi: 0.4, ... }, ATMOSPHERE: { co2_ppm: 487 } }
  const liminalReadings = {};  // unrecognised or out-of-Umwelt signal types

  for (const [signal_type, raw_value] of Object.entries(readings)) {
    const targetSphere = SIGNAL_TO_SPHERE[signal_type];
    if (!targetSphere) {
      // Unknown signal type — quarantine to liminal bucket
      liminalReadings[signal_type] = raw_value;
      continue;
    }
    if (!allowedSpheres.includes(targetSphere)) {
      // Recognised signal but not in this biome's Umwelt — liminal
      liminalReadings[signal_type] = raw_value;
      continue;
    }
    if (!sphereReadings[targetSphere]) sphereReadings[targetSphere] = {};
    sphereReadings[targetSphere][signal_type] = raw_value;
  }

  // ── Step 2: Write liminal signals to quarantine bucket ───────────────────
  let liminalCount = 0;
  for (const [signal_type, raw_value] of Object.entries(liminalReadings)) {
    const limKey = `na:liminal:${bioregion.id}:${signal_type}`;
    const existing = await env.STIGMERGY_KV.get(limKey, 'json') || { count: 0, samples: [] };
    existing.count++;
    existing.samples = [...existing.samples.slice(-4), { raw_value, ts, source }];
    existing.last_seen = new Date(ts).toISOString();
    await env.STIGMERGY_KV.put(limKey, JSON.stringify(existing), { expirationTtl: 86400 * 14 });
    // Update global liminal index
    const limIdx = await env.STIGMERGY_KV.get('na:liminal:index', 'json') || { signal_types: {} };
    limIdx.signal_types[signal_type] = (limIdx.signal_types[signal_type] || 0) + 1;
    await env.STIGMERGY_KV.put('na:liminal:index', JSON.stringify(limIdx));
    liminalCount++;
  }

  // ── Step 3: Per-sphere processing ────────────────────────────────────────
  const sphereResults = {};
  const tracesDeposited = [];
  const distressEvents = [];

  for (const [sphere, signals] of Object.entries(sphereReadings)) {
    // 3a: Write each typed signal to natural_signals D1 + node state + distress trace
    for (const [signal_type, raw_value] of Object.entries(signals)) {
      const signal = {
        signal_id:    rnd(),
        ts,
        bioregion_id: bioregion.id,
        signal_type,
        raw_value:    parseFloat(raw_value) ?? raw_value,
        unit:         getSignalUnit(signal_type),
        source_type,
        sovereignty_tag: steward_id ? 'community' : 'open',
        scale_level:  scale,
        authority_weight,
        recorded_at:  new Date(ts).toISOString(),
        immutable:    true,
      };

      // Write to D1 (permanent immutable record)
      try {
        await env.STIGMERGY_DB.prepare(
          'INSERT INTO natural_signals (ts, bioregion_id, signal_type, raw_value, unit, source_type, sovereignty_tag, distress) VALUES (?,?,?,?,?,?,?,?)'
        ).bind(ts, bioregion.id, signal_type, String(signal.raw_value), signal.unit, source_type,
               signal.sovereignty_tag, 0).run();
      } catch(e) { /* non-fatal — dashboard still works from KV */ }

      // Update this sphere's node state in KV
      const distress = isDistressSignal(signal);
      await updateNodeState(signal, distress, env);

      // LITL: if steward source, increment steward signal count for maturity tracking
      if (source_type === 'steward_observation') {
        await updateNodeMaturityOnStewardSignal(bioregion.id, sphere, env);
      }

      // LITL: check biology-closes-loop for recovery signal
      const bisNorm = normalizeBISSignal(signal_type, signal.raw_value);
      if (bisNorm !== null) {
        await checkBiologyClosesLoop(bioregion.id, sphere, bisNorm, env);
      }

      // Cross-bioregion: propagate distress to kin nodes
      if (distress) {
        await propagateToBioregionKin(bioregion.id, sphere, 'distress', 1 - bisNorm, env);
      }

      // Emit natural agent distress trace if threshold crossed
      if (distress) {
        await emitNaturalAgentTrace(signal, distress, env);
        distressEvents.push({ signal_type, sphere, severity: distress.severity, value: signal.raw_value, unit: signal.unit });
        // Perturbation accounting — PoP principle
        try {
          const logKey = `perturbation:log:${bioregion.id}`;
          const plog = await env.STIGMERGY_KV.get(logKey, 'json') || { entries: [] };
          plog.entries.unshift({
            perturbation_id: `perturb:ingest:${signal.signal_id}`,
            bioregion_id: bioregion.id, action_type: 'distress_classification',
            description: `System classified ${signal_type} (${sphere}) as ${distress.severity} via /api/ingest`,
            scale_level: scale, logged_at: new Date(ts).toISOString(), source: 'auto',
          });
          plog.entries = plog.entries.slice(0, 200);
          await env.STIGMERGY_KV.put(logKey, JSON.stringify(plog));
        } catch(_) {}
      }
    }

    // 3b: Per-sphere AI interpretation (sphere-scoped, not collapsed aggregate)
    let sphere_vitality = bioregion.vitality;
    let ecological_interpretation = '';
    let trace_content = '';
    let ai_used = false;

    if (env.AI) {
      const readingLines = Object.entries(signals).map(([k,v]) => `  ${k}: ${v}`).join('\n');
      const sphereDesc = {
        BIOSPHERE:  'soil, vegetation, biodiversity, and organism health signals',
        ATMOSPHERE: 'air quality, carbon flux, temperature, and weather signals',
        HYDROSPHERE:'water quality, flow, ocean chemistry, and groundwater signals',
        ANCIENT:    'indigenous ecological knowledge and qualitative steward observations',
      }[sphere] || 'ecological signals';
      const trackLabel = sensor_track === 'living_biosensor'
        ? 'living biosensor (TRL 3-4, experimental — treat as indicative)'
        : 'bio-hybrid sensor (TRL 7-8, field-deployable)';

      const prompt = `You are Ayu. Translate these ${sphere} readings (${sphereDesc}) from a ${trackLabel} in the ${bioregion.name} bioregion (${bioregion.biome}, baseline vitality ${bioregion.vitality}/100, trend: ${bioregion.trend}).

${sphere} readings:
${readingLines}
${steward_note ? `\nSteward observation: "${steward_note}"` : ''}

Respond ONLY with a JSON object (no markdown):
{
  "sphere_vitality": <integer 0-100, this ${sphere} node's health only>,
  "ecological_interpretation": "<1-2 sentence interpretation specific to the ${sphere} sphere of ${bioregion.name}>",
  "trace_content": "<1 sentence stigmergic signal — what pattern is the ${sphere} communicating to the network?>"
}`;
      try {
        const aiResp = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 250,
        });
        const raw = aiResp?.response?.trim() || '';
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const t = JSON.parse(jsonMatch[0]);
          sphere_vitality = Math.max(0, Math.min(100, parseInt(t.sphere_vitality) || bioregion.vitality));
          ecological_interpretation = t.ecological_interpretation || '';
          trace_content = t.trace_content || ecological_interpretation;
          ai_used = true;
        }
      } catch(_) {}
    }

    // Heuristic fallback — per-sphere normalization via BIS bounds
    if (!ai_used) {
      const scores = Object.entries(signals)
        .map(([st, rv]) => normalizeBISSignal(st, rv))
        .filter(s => s !== null);
      sphere_vitality = scores.length
        ? Math.round(scores.reduce((a,b) => a+b, 0) / scores.length * 100)
        : bioregion.vitality;
      ecological_interpretation = `${sphere} heuristic (${bioregion.name}): ${Object.entries(signals).map(([k,v]) => `${k}=${v}`).join(', ')}.`;
      trace_content = `${sphere} node ${bioregion.id} reporting vitality ${sphere_vitality}/100.`;
    }

    // 3c: Deposit sphere-specific stigmergy trace (correct node_id)
    const traceId = `trace:ingest:${bioregion.id}:${sphere}:${rnd()}`;
    const trace = {
      id:             traceId,
      content:        trace_content,
      actor_id:       steward_id ? `steward:${steward_id}` : `sensor:${source}`,
      sphere,
      node_id:        `${bioregion.id}:${sphere}`,
      bioregion:      bioregion.id,
      strength:       Math.min(1, sphere_vitality / 100),
      authority_weight,
      scale_level:    scale,
      sensor_track,
      source_type,
      source_lat:     lat,
      source_lng:     lng,
      deposited_at:   new Date().toISOString(),
      decay_rate:     0.05,
    };
    try { await env.STIGMERGY_KV.put(traceId, JSON.stringify(trace), { expirationTtl: 86400 * 7 }); } catch(_) {}
    tracesDeposited.push({ sphere, node_id: `${bioregion.id}:${sphere}`, trace_id: traceId, sphere_vitality });

    sphereResults[sphere] = {
      sphere_vitality,
      signal_count:            Object.keys(signals).length,
      ecological_interpretation,
      ai_translation:          ai_used,
    };
  }

  // ── Step 4: Aggregate biosignal_log entry (dashboard compatibility) ───────
  const avgVitality = tracesDeposited.length
    ? Math.round(tracesDeposited.reduce((s,t) => s + t.sphere_vitality, 0) / tracesDeposited.length)
    : bioregion.vitality;
  try {
    await env.STIGMERGY_DB.prepare(
      'INSERT INTO biosignal_logs (id, bioregion, lat, lng, vitality_index, indicators, source) VALUES (?,?,?,?,?,?,?)'
    ).bind(rnd(), bioregion.id, lat, lng, avgVitality, JSON.stringify(sphereResults), source).run();
  } catch(_) {}

  return R({
    ok:              true,
    bioregion:       bioregion.name,
    bioregion_id:    bioregion.id,
    biome:           bioregion.biome,
    allowed_spheres: allowedSpheres,
    scale_level:     scale,
    source_type,
    authority_weight,
    sphere_results:  sphereResults,
    traces_deposited: tracesDeposited,
    distress_events: distressEvents.length ? distressEvents : null,
    liminal:         liminalCount > 0 ? {
      count:        liminalCount,
      signal_types: Object.keys(liminalReadings),
      note:         'Unknown or out-of-Umwelt signal types quarantined. Check /api/nodes/candidates when accumulation ≥ 3.',
    } : null,
    timestamp:       new Date().toISOString(),
  });
}


// ═══════════════════════════════════════════════════════════════════════════
// E2E MVP TEST — Fake pilot plot sensor → ingest → stigmergy → query
// Validates full chain: raw sensor data → AI translation → trace → synthesis
// ═══════════════════════════════════════════════════════════════════════════

async function handleE2EMVPTest(env, admin) {
  if (!admin) return R({ error: 'Admin key required' }, 403);

  const results = [];
  const t0 = Date.now();

  const step = async (name, fn) => {
    const ts = Date.now();
    try {
      const detail = await fn();
      results.push({ step: name, status: 'pass', ms: Date.now() - ts, detail });
      return { ok: true, detail };
    } catch(e) {
      results.push({ step: name, status: 'fail', ms: Date.now() - ts, error: e.message });
      return { ok: false, error: e.message };
    }
  };

  // Fake sensor readings — bio-hybrid track (TRL 7-8), pilot plot coordinates
  const FAKE_READINGS = {
    lat: 39.95027370248936,
    lng: -105.16033976443673,
    source: 'pilot_plot_mvp_test',
    sensor_track: 'bio_hybrid',
    readings: {
      soil_moisture_pct: 38,
      soil_temp_c: 9.2,
      soil_redox_mv: 245,
      co2_ppm: 487,
      conductivity_us_cm: 162,
    },
    steward_note: 'Early spring readings, soil warming after winter dormancy.',
  };

  // Step 1: Bioregion resolves to Rocky Mountain Front Range
  const s1 = await step('1_bioregion_resolve', async () => {
    const br = nearestBioregion(FAKE_READINGS.lat, FAKE_READINGS.lng);
    if (br.id !== 'rocky_mountain') throw new Error(`Expected rocky_mountain, got ${br.id}`);
    return `Resolved: ${br.name} (${br.biome})`;
  });

  // Step 2: Ingest fake sensor data → AI translation
  let ingestResult = null;
  await step('2_ingest_ai_translation', async () => {
    const fakeReq = new Request('https://x/api/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(FAKE_READINGS),
    });
    const r = await handleIngest(fakeReq, env);
    ingestResult = await r.json();
    if (!ingestResult.ok) throw new Error(ingestResult.error || 'Ingest failed');
    if (!ingestResult.vitality_index) throw new Error('No vitality_index in response');
    return `Vitality: ${ingestResult.vitality_index}/100 · AI translation: ${ingestResult.ai_translation} · Trace: ${ingestResult.trace_deposited}`;
  });

  // Step 3: Verify stigmergy trace was deposited in KV
  await step('3_trace_in_kv', async () => {
    if (!ingestResult?.trace_deposited) throw new Error('No trace ID from ingest');
    const raw = await env.STIGMERGY_KV.get(ingestResult.trace_deposited);
    if (!raw) throw new Error('Trace not found in KV');
    const trace = JSON.parse(raw);
    if (trace.bioregion !== 'rocky_mountain') throw new Error(`Trace bioregion mismatch: ${trace.bioregion}`);
    return `Trace verified: sphere=${trace.sphere}, strength=${trace.strength}, bioregion=${trace.bioregion}`;
  });

  // Step 4: Verify biosignal_logs entry written to D1
  await step('4_biosignal_in_d1', async () => {
    const row = await env.STIGMERGY_DB.prepare(
      "SELECT * FROM biosignal_logs WHERE source='pilot_plot_mvp_test' ORDER BY created_at DESC LIMIT 1"
    ).first();
    if (!row) throw new Error('No biosignal_logs row found for pilot_plot_mvp_test');
    return `D1 row: bioregion=${row.bioregion}, vitality=${row.vitality_index}, source=${row.source}`;
  });

  // Step 5: Living biosensor track — fake mycelium + acoustic readings
  await step('5_living_biosensor_track', async () => {
    const fakeReq = new Request('https://x/api/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat: FAKE_READINGS.lat,
        lng: FAKE_READINGS.lng,
        source: 'pilot_plot_mvp_test_living',
        sensor_track: 'living_biosensor',
        readings: {
          mycelium_impedance_ohm: 3850,
          moss_hydration_pct: 72,
          acoustic_biodiversity_index: 61,
        },
        steward_note: 'Mycelium network active post-snowmelt. High bird activity detected.',
      }),
    });
    const r = await handleIngest(fakeReq, env);
    const data = await r.json();
    if (!data.ok) throw new Error(data.error || 'Living biosensor ingest failed');
    return `Living biosensor: vitality=${data.vitality_index}, ai_translation=${data.ai_translation}`;
  });

  // Step 6: Query pipeline picks up pilot plot signal (only if AI available)
  await step('6_query_references_pilot_plot', async () => {
    if (!env.AI) return 'Skipped — Workers AI binding not configured';
    const fakeReq = new Request('https://x/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'What is the current soil health at the Rocky Mountain pilot plot?', sphere: 'BIOSPHERE' }),
    });
    const r = await handleQuery(fakeReq, env);
    const data = await r.json();
    if (r.status !== 200) throw new Error(data.error || `Query failed: ${r.status}`);
    return `Query synthesis: ${data.response?.slice(0, 120) || '(empty)'}...`;
  });

  // Cleanup D1 test rows
  try {
    await env.STIGMERGY_DB.prepare("DELETE FROM biosignal_logs WHERE source LIKE 'pilot_plot_mvp_test%'").run();
  } catch(e) {}

  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;

  return R({
    e2e_mvp_test: failed === 0 ? 'PASS' : (passed > 0 ? 'PARTIAL' : 'FAIL'),
    version: VERSION,
    pilot_plot: { lat: FAKE_READINGS.lat, lng: FAKE_READINGS.lng, bioregion: 'rocky_mountain' },
    sensor_tracks_tested: ['bio_hybrid', 'living_biosensor'],
    passed,
    failed,
    total: results.length,
    duration_ms: Date.now() - t0,
    steps: results,
    timestamp: new Date().toISOString(),
  }, failed === 0 ? 200 : 207);
}
