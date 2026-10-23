const map = L.map('map', { preferCanvas: true });

const streets = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

const PLAYGROUND_TYPE = 'Aire de jeu - enfant';
const status = document.getElementById('status');
const boroughFilter = document.getElementById('borough-filter');

function loadGeoJSON(path) {
  return fetch(path).then(function (response) {
    if (!response.ok) {
      throw new Error('HTTP ' + response.status + ' loading ' + path);
    }
    return response.json();
  }).then(function (data) {
    if (!Array.isArray(data.features)) {
      throw new Error(path + ' does not contain a GeoJSON features array');
    }
    return data;
  });
}

function colourForCanopy(value) {
  if (value === 0) { return '#f7fcf5'; }
  if (value < 10) { return '#e5f5e0'; }
  if (value < 20) { return '#a1d99b'; }
  if (value < 40) { return '#31a354'; }
  return '#006d2c';
}

Promise.all([
  loadGeoJSON('../data/playgrounds_canopy.geojson'),
  loadGeoJSON('../data/canopy_grid.geojson')
])
  .then(function (datasets) {
    const playgroundData = datasets[0];
    const canopyGridData = datasets[1];
    const playgrounds = playgroundData.features.filter(function (feature) {
      return feature.properties && feature.properties.TYPE === PLAYGROUND_TYPE;
    });
    const canopyValues = playgrounds.map(function (feature) {
      return Number(feature.properties.canopy_pct_250m);
    });
    if (playgrounds.length !== 1008 || canopyValues.some(function (value) {
      return !Number.isFinite(value) || value < 0 || value > 100;
    })) {
      throw new Error('playgrounds_canopy.geojson must contain 1,008 valid canopy percentages');
    }
    const boroughs = Array.from(new Set(playgrounds.map(function (feature) {
      return feature.properties.ARROND;
    }).filter(Boolean))).sort();

    boroughs.forEach(function (borough) {
      const option = document.createElement('option');
      option.value = borough;
      option.textContent = borough;
      boroughFilter.appendChild(option);
    });

    map.createPane('canopyGridPane');
    map.getPane('canopyGridPane').style.zIndex = 350;

    const canopyGridLayer = L.geoJSON(canopyGridData, {
      pane: 'canopyGridPane',
      style: function (feature) {
        return {
          color: '#385442',
          weight: 0.45,
          opacity: 0.55,
          fillColor: colourForCanopy(feature.properties.canopy_pct),
          fillOpacity: 0.42
        };
      },
      onEachFeature: function (feature, layer) {
        layer.bindPopup(
          'Tree canopy in this 1 km square: ' +
          Number(feature.properties.canopy_pct).toFixed(1) + '%'
        );
      }
    }).addTo(map);

    const playgroundLayer = L.geoJSON([], {
      pointToLayer: function (feature, latlng) {
        return L.circleMarker(latlng, {
          radius: 5,
          color: '#ffffff',
          weight: 1,
          fillOpacity: 0.95,
          fillColor: colourForCanopy(feature.properties.canopy_pct_250m)
        });
      },
      onEachFeature: function (feature, layer) {
        const p = feature.properties;
        const popup = document.createElement('div');

        [
          ['Borough', p.ARROND],
          ['Type', p.TYPE],
          ['Tree canopy within 250 m', Number(p.canopy_pct_250m).toFixed(1) + '%']
        ].forEach(function (item) {
          const line = document.createElement('div');
          line.textContent = item[0] + ': ' + (item[1] || 'Not recorded');
          popup.appendChild(line);
        });

        layer.bindPopup(popup);
      }
    }).addTo(map);

    const overlayLayers = {
      'Playground locations': playgroundLayer,
      'Tree canopy (2019)': canopyGridLayer
    };
    L.control.layers({ 'OpenStreetMap': streets }, overlayLayers, {
      collapsed: false
    }).addTo(map);

    const legend = L.control({ position: 'bottomright' });
    legend.onAdd = function () {
      const div = L.DomUtil.create('div', 'legend');
      const title = L.DomUtil.create('div', 'legend-title', div);
      title.textContent = 'Tree canopy coverage per 1 km square (%)';

      [
        { label: '0%', value: 0 },
        { label: '>0–<10%', value: 5 },
        { label: '10–<20%', value: 15 },
        { label: '20–<40%', value: 30 },
        { label: '40%+', value: 40 }
      ].forEach(function (range) {
        const row = L.DomUtil.create('div', 'legend-row', div);
        const swatch = L.DomUtil.create('span', 'legend-swatch', row);
        swatch.style.backgroundColor = colourForCanopy(range.value);
        const label = L.DomUtil.create('span', '', row);
        label.textContent = range.label;
      });

      return div;
    };
    legend.addTo(map);

    function updateMap() {
      const selectedBorough = boroughFilter.value;
      const visiblePlaygrounds = playgrounds.filter(function (feature) {
        return !selectedBorough || feature.properties.ARROND === selectedBorough;
      });

      playgroundLayer.clearLayers();
      playgroundLayer.addData(visiblePlaygrounds);
      status.textContent = selectedBorough
        ? visiblePlaygrounds.length + ' playgrounds shown in ' + selectedBorough
        : visiblePlaygrounds.length + ' playgrounds shown across Montreal';

      if (visiblePlaygrounds.length > 0) {
        map.fitBounds(playgroundLayer.getBounds(), { padding: [20, 20] });
      } else {
        map.setView([45.5019, -73.5674], 11);
      }
    }

    boroughFilter.disabled = false;
    boroughFilter.addEventListener('change', updateMap);
    updateMap();
  })
  .catch(function (err) {
    status.textContent =
      'Could not load map data. Open the console (F12) for details.';
    console.error(err);
  });
