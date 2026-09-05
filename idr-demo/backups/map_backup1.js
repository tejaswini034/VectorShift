// map.js ONLY owns the Leaflet map.
//
// app.js owns:
//   - JSON loading
//   - replay
//   - currentIndex
//   - controls
//   - dashboard metrics
//
// app.js calls:
//   window.updateMap(sample, trajectoryData, currentIndex)
//
// map.js renders that state.
// ============================================================

let map = null;

let rawGnssLine = null;
let estimateLine = null;
let groundTruthLine = null;

let currentMarker = null;
let uncertaintyCircle = null;

let mapInitialized = false;
let hasFittedBounds = false;


// INITIALIZE MAP
function initializeMap() {
    if (mapInitialized) {
        return;
    }

    const mapContainer = document.getElementById("map");

    if (!mapContainer) {
        console.error("Map container #map not found.");
        return;
    }

    if (typeof L === "undefined") {
        console.error("Leaflet is not loaded.");
        mapContainer.innerHTML = '<div style="padding:20px;color:#888;">Leaflet failed to load.</div>';
        return;
    }

    map = L.map("map", {
        zoomControl: true,
        attributionControl: true
    });


    L.tileLayer("osm_tiles/{z}/{x}/{y}.png", {
        minZoom: 15,
        maxZoom: 17,
        attribution:
            "© OpenStreetMap contributors"
    }).addTo(map);

    // TRAJECTORY LAYERS

    rawGnssLine = L.polyline([], {
        color: "#e74c3c",
        weight: 2.5,
        opacity: 0.65
    }).addTo(map);

    estimateLine = L.polyline([], {
        color: "#2980b9",
        weight: 4,
        opacity: 0.95
    }).addTo(map);

    groundTruthLine = L.polyline([], {
        color: "#2ecc71",
        weight: 3,
        opacity: 0.9,
        dashArray: "8 5"
    }).addTo(map);


    // CURRENT POSITION
    currentMarker = L.circleMarker(
        [52.42, -1.50],
        {
            radius: 7,
            color: "#ffffff",
            weight: 2,
            fillColor: "#2980b9",
            fillOpacity: 1
        }
    ).addTo(map);

    // UNCERTAINTY CIRCLE
    uncertaintyCircle = L.circle(
        [52.42, -1.50],
        {
            radius: 1,
            color: "#2980b9",
            fillColor: "#2980b9",
            fillOpacity: 0.12,
            weight: 1
        }
    ).addTo(map);

    map.setView([52.42, -1.50], 15);

    mapInitialized = true;
}

// UPDATE MAP
window.updateMap = function(sample, trajectoryData, currentIndex) {
    if (!mapInitialized) {
        initializeMap();
    }
    if (
        !map ||
        !sample ||
        !trajectoryData ||
        !Array.isArray(trajectoryData.samples)
    ) {
        return;
    }

    const samples = trajectoryData.samples;

    // TRAJECTORY DATA UP TO CURRENT FRAME

    const visibleSamples =
        samples.slice(0, currentIndex + 1);

    // RAW GNSS
    const rawGnssCoords = visibleSamples
    .filter(s =>
        s.gnss_available &&
        s.raw_gnss &&
        s.raw_gnss.latitude != null &&
        s.raw_gnss.longitude != null
    )
    .map(s => [
        Number(s.raw_gnss.latitude),
        Number(s.raw_gnss.longitude)
    ]);


    // UKF / NAVIGATION ESTIMATE
    const estimateCoords = visibleSamples
        .filter(s =>
            s.ukf_estimate &&
            s.ukf_estimate.latitude != null &&
            s.ukf_estimate.longitude != null
        )
        .map(s => [
            Number(s.ukf_estimate.latitude),
            Number(s.ukf_estimate.longitude)
        ]);

    // GROUND TRUTH
    const groundTruthCoords = visibleSamples
        .filter(s =>
            s.ground_truth &&
            s.ground_truth.latitude != null &&
            s.ground_truth.longitude != null
        )
        .map(s => [
            Number(s.ground_truth.latitude),
            Number(s.ground_truth.longitude)
        ]);

    // DRAW LINES
    rawGnssLine.setLatLngs(rawGnssCoords);

    estimateLine.setLatLngs(estimateCoords);

    groundTruthLine.setLatLngs(groundTruthCoords);

    // CURRENT UKF POSITION
    if (
        sample.ukf_estimate &&
        sample.ukf_estimate.latitude != null &&
        sample.ukf_estimate.longitude != null
    ) {

        const lat =
            Number(sample.ukf_estimate.latitude);

        const lon =
            Number(sample.ukf_estimate.longitude);

        const currentLatLng = [lat, lon];


        // Current marker
        currentMarker.setLatLng(currentLatLng);

        // Uncertainty
        const uncertainty = Number(sample.ukf_estimate.uncertainty_m);

        if (Number.isFinite(uncertainty)) {
            uncertaintyCircle.setLatLng(currentLatLng);
            uncertaintyCircle.setRadius(Math.max(uncertainty, 1));
        }

        // Keep vehicle centered
        map.panTo(currentLatLng,{animate: false});
    }

    // GNSS / DEAD-RECKONING VISUAL STATE
    if (sample.gnss_available) {

        currentMarker.setStyle({
            fillColor: "#2980b9",
            color: "#ffffff"
        });

        estimateLine.setStyle({
            color: "#2980b9"
        });

    } else {

        currentMarker.setStyle({
            fillColor: "#e74c3c",
            color: "#ffffff"
        });

        estimateLine.setStyle({
            //color: "#e74c3c"
            color: "#2980b9"
        });
    }

    // INITIAL FIT
    if (!hasFittedBounds && groundTruthCoords.length > 0) {
        const bounds =
            L.latLngBounds(groundTruthCoords);

        map.fitBounds(bounds,{padding: [30, 30]});
        hasFittedBounds = true;
    }


    // FORCE LEAFLET TO RECALCULATE SIZE
    setTimeout(() => {
        if (map) {
            map.invalidateSize(false);
        }
    }, 0);
};


// RESET MAP
window.resetMap = function() {
    if (!map) {
        return;
    }
    rawGnssLine.setLatLngs([]);
    estimateLine.setLatLngs([]);
    groundTruthLine.setLatLngs([]);

    hasFittedBounds = false;
};

// START
document.addEventListener("DOMContentLoaded", () => {initializeMap();});