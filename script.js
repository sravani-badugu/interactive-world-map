// State
let map;
let geojsonLayer;
let countryData = [];
let geojsonData = null;
let currentCountry = null;

// DOM Elements
const themeToggle = document.getElementById('themeToggle');
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const infoPanel = document.getElementById('infoPanel');
const closePanelBtn = document.getElementById('closePanel');
const compareSelect = document.getElementById('compareSelect');
const comparisonResult = document.getElementById('comparisonResult');

// Format Numbers
const formatNumber = (num) => {
    if (num === undefined || num === null) return 'N/A';
    return new Intl.NumberFormat().format(num);
};

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    initMap();
    setupEventListeners();
    await loadData();
});

// Theme Management
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
    
    // Update map tiles based on theme
    if (map) {
        updateMapTiles(newTheme);
    }
}

function updateThemeIcon(theme) {
    themeToggle.innerHTML = theme === 'dark' 
        ? '<i class="fa-solid fa-sun"></i>' 
        : '<i class="fa-solid fa-moon"></i>';
}

// Map Tile Layers
const darkTilesUrl = 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png';
const lightTilesUrl = 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png';
let currentTileLayer = null;

function initMap() {
    // Initialize Leaflet map
    map = L.map('map', {
        center: [20, 0],
        zoom: 2,
        minZoom: 2,
        maxBounds: [[-90, -180], [90, 180]],
        maxBoundsViscosity: 1.0,
        zoomControl: false
    });
    
    // Add custom zoom control position
    L.control.zoom({
        position: 'topleft'
    }).addTo(map);

    const initialTheme = document.documentElement.getAttribute('data-theme');
    updateMapTiles(initialTheme);
}

function updateMapTiles(theme) {
    if (currentTileLayer) {
        map.removeLayer(currentTileLayer);
    }
    
    const tileUrl = theme === 'dark' ? darkTilesUrl : lightTilesUrl;
    
    currentTileLayer = L.tileLayer(tileUrl, {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);
    
    // Refresh geojson layer styles if it exists
    if (geojsonLayer) {
        geojsonLayer.setStyle(styleFeature);
    }
}

// Data Loading
async function loadData() {
    try {
        // Load custom country data
        const dataRes = await fetch('data.json');
        const data = await dataRes.json();
        countryData = data.countries;
        
        // Load GeoJSON for boundaries
        const geoRes = await fetch('https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json');
        geojsonData = await geoRes.json();
        
        // Merge data into geojson properties
        geojsonData.features.forEach(feature => {
            const countryId = feature.id; // ISO3
            const countryName = feature.properties.name;
            
            // Find matching country in our JSON
            const match = countryData.find(c => c.code === countryId || c.name === countryName);
            
            if (match) {
                feature.properties = { ...feature.properties, ...match };
                // Calculate density
                feature.properties.density = Math.round(match.population / match.area);
            }
        });
        
        renderMap();
        populateCompareSelect();
        
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

// Map Rendering & Styling
// Heatmap colors based on population
function getColor(population) {
    return population > 1000000000 ? '#800026' :
           population > 500000000  ? '#bd0026' :
           population > 200000000  ? '#e31a1c' :
           population > 100000000  ? '#fc4e2a' :
           population > 50000000   ? '#fd8d3c' :
           population > 20000000   ? '#feb24c' :
           population > 10000000   ? '#fed976' :
           population > 0          ? '#ffeda0' :
                                     '#333333'; // No data
}

function styleFeature(feature) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const defaultColor = isDark ? '#1e293b' : '#cbd5e1';
    
    return {
        fillColor: feature.properties.population ? getColor(feature.properties.population) : defaultColor,
        weight: 1,
        opacity: 1,
        color: isDark ? '#0f172a' : '#ffffff',
        fillOpacity: 0.7
    };
}

function renderMap() {
    if (geojsonLayer) {
        map.removeLayer(geojsonLayer);
    }
    
    geojsonLayer = L.geoJSON(geojsonData, {
        style: styleFeature,
        onEachFeature: onEachFeature
    }).addTo(map);
}

function onEachFeature(feature, layer) {
    // Tooltip
    if (feature.properties.population) {
        const tooltipContent = `
            <div class="custom-tooltip">
                <h4>${feature.properties.flag || ''} ${feature.properties.name}</h4>
                <p><strong>Population:</strong> ${formatNumber(feature.properties.population)}</p>
                <p><strong>Density:</strong> ${formatNumber(feature.properties.density)} / km²</p>
            </div>
        `;
        layer.bindTooltip(tooltipContent, {
            direction: 'auto',
            className: 'glass-panel',
            offset: [0, -5]
        });
    }

    // Events
    layer.on({
        mouseover: highlightFeature,
        mouseout: resetHighlight,
        click: zoomToFeature
    });
}

function highlightFeature(e) {
    const layer = e.target;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    layer.setStyle({
        weight: 2,
        color: isDark ? '#ffffff' : '#000000',
        dashArray: '',
        fillOpacity: 0.9
    });

    if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
        layer.bringToFront();
    }
}

function resetHighlight(e) {
    geojsonLayer.resetStyle(e.target);
}

function zoomToFeature(e) {
    const layer = e.target;
    map.fitBounds(layer.getBounds(), { padding: [50, 50], maxZoom: 5 });
    showCountryDetails(layer.feature.properties);
}

// Side Panel & Details
function showCountryDetails(props) {
    if (!props.population) return; // Ignore countries without data
    
    currentCountry = props;
    
    document.getElementById('countryName').textContent = props.name;
    document.getElementById('countryFlag').textContent = props.flag || '🏳️';
    document.getElementById('statPopulation').textContent = formatNumber(props.population);
    document.getElementById('statArea').textContent = formatNumber(props.area);
    document.getElementById('statCapital').textContent = props.capital || 'N/A';
    document.getElementById('statDensity').textContent = formatNumber(props.density);
    
    // Reset comparison
    compareSelect.value = '';
    comparisonResult.classList.add('hidden');
    
    infoPanel.classList.remove('hidden');
}

// Event Listeners
function setupEventListeners() {
    themeToggle.addEventListener('click', toggleTheme);
    
    closePanelBtn.addEventListener('click', () => {
        infoPanel.classList.add('hidden');
        currentCountry = null;
    });
    
    // Search functionality
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        if (query.length < 2) {
            searchResults.classList.add('hidden');
            return;
        }
        
        const matches = countryData.filter(c => 
            c.name.toLowerCase().includes(query) || 
            (c.capital && c.capital.toLowerCase().includes(query))
        );
        
        renderSearchResults(matches);
    });
    
    // Hide search results on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            searchResults.classList.add('hidden');
        }
    });
    
    // Comparison feature
    compareSelect.addEventListener('change', handleComparison);
}

// Search
function renderSearchResults(matches) {
    searchResults.innerHTML = '';
    
    if (matches.length === 0) {
        searchResults.innerHTML = '<div class="search-item">No countries found</div>';
    } else {
        matches.forEach(match => {
            const div = document.createElement('div');
            div.className = 'search-item';
            div.innerHTML = `<span>${match.flag || ''}</span> <span>${match.name}</span>`;
            
            div.addEventListener('click', () => {
                searchInput.value = '';
                searchResults.classList.add('hidden');
                
                // Find feature on map
                let targetFeatureLayer = null;
                geojsonLayer.eachLayer(layer => {
                    if (layer.feature.properties.code === match.code) {
                        targetFeatureLayer = layer;
                    }
                });
                
                if (targetFeatureLayer) {
                    map.fitBounds(targetFeatureLayer.getBounds(), { padding: [50, 50], maxZoom: 5 });
                    showCountryDetails(targetFeatureLayer.feature.properties);
                }
            });
            
            searchResults.appendChild(div);
        });
    }
    
    searchResults.classList.remove('hidden');
}

// Comparison
function populateCompareSelect() {
    const sortedCountries = [...countryData].sort((a, b) => a.name.localeCompare(b.name));
    
    sortedCountries.forEach(country => {
        const option = document.createElement('option');
        option.value = country.code;
        option.textContent = `${country.flag || ''} ${country.name}`;
        compareSelect.appendChild(option);
    });
}

function handleComparison(e) {
    const compareCode = e.target.value;
    
    if (!compareCode || !currentCountry) {
        comparisonResult.classList.add('hidden');
        return;
    }
    
    const compareCountry = countryData.find(c => c.code === compareCode);
    if (!compareCountry) return;
    
    // Calculate density for compare country
    const compDensity = Math.round(compareCountry.population / compareCountry.area);
    
    const c1 = currentCountry;
    const c2 = compareCountry;
    
    let html = `
        <div class="compare-row" style="margin-bottom: 1rem; border-bottom: 1px solid var(--glass-border); padding-bottom: 0.5rem;">
            <div class="compare-val1" style="font-size: 1.1rem">${c1.name}</div>
            <div class="compare-val2" style="font-size: 1.1rem">${c2.name}</div>
        </div>
        
        <div class="compare-row">
            <div class="compare-val1 ${c1.population > c2.population ? 'winner' : ''}">${formatNumber(c1.population)}</div>
            <div class="compare-label">Population</div>
            <div class="compare-val2 ${c2.population > c1.population ? 'winner' : ''}">${formatNumber(c2.population)}</div>
        </div>
        
        <div class="compare-row">
            <div class="compare-val1 ${c1.area > c2.area ? 'winner' : ''}">${formatNumber(c1.area)}</div>
            <div class="compare-label">Area (km²)</div>
            <div class="compare-val2 ${c2.area > c1.area ? 'winner' : ''}">${formatNumber(c2.area)}</div>
        </div>
        
        <div class="compare-row">
            <div class="compare-val1 ${c1.density > compDensity ? 'winner' : ''}">${formatNumber(c1.density)}</div>
            <div class="compare-label">Density</div>
            <div class="compare-val2 ${compDensity > c1.density ? 'winner' : ''}">${formatNumber(compDensity)}</div>
        </div>
    `;
    
    comparisonResult.innerHTML = html;
    comparisonResult.classList.remove('hidden');
}
