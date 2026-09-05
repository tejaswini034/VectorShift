// VectorShift — Leaflet visualization only
// app.js owns data loading, replay, currentIndex and dashboard metrics.
// app.js calls window.updateMap(sample, trajectoryData, currentIndex).

let map = null;
let estimateGnssPreLine = null;
let estimateGnssPostLine = null;
let estimateDrLine = null;
let groundTruthLine = null;
let currentMarker = null;
let uncertaintyCircle = null;
let mapInitialized = false;
let hasFittedBounds = false;

const COLORS = {
    estimateGnss: "#58a6ff",
    estimateDr: "#ff6b6b",
    groundTruth: "#3fb950"
};

function initializeMap() {
    if (mapInitialized) return;
    const mapContainer = document.getElementById("map");
    if (!mapContainer) return;
    if (typeof L === "undefined") {
        mapContainer.innerHTML = '<div style="padding:20px;color:#888;">Leaflet failed to load.</div>';
        return;
    }

    map = L.map("map", { zoomControl: true, attributionControl: true });
    L.tileLayer("osm_tiles/{z}/{x}/{y}.png", {
        minZoom: 15, maxZoom: 17, attribution: "© OpenStreetMap contributors"
    }).addTo(map);

    // Blue = navigation estimate while GNSS is available.
    estimateGnssPreLine = L.polyline([], {
        color: COLORS.estimateGnss,
        weight: 4,
        opacity: 0.95
    }).addTo(map);

    estimateGnssPostLine = L.polyline([], {
        color: COLORS.estimateGnss,
        weight: 4,
        opacity: 0.95
    }).addTo(map);

    // Red = navigation estimate during GNSS denial / dead reckoning.
    estimateDrLine = L.polyline([], {
        color: COLORS.estimateDr,
        weight: 4,
        opacity: 0.95
    }).addTo(map);

    // Green = ground truth.
    groundTruthLine = L.polyline([], {
        color: COLORS.groundTruth,
        weight: 3,
        opacity: 0.9,
        dashArray: "8 5"
    }).addTo(map);

    currentMarker = L.circleMarker([52.42, -1.50], {
        radius: 7,
        color: "#ffffff",
        weight: 2,
        fillColor: COLORS.estimateGnss,
        fillOpacity: 1
    }).addTo(map);

    uncertaintyCircle = L.circle([52.42, -1.50], {
        radius: 1,
        color: COLORS.estimateGnss,
        fillColor: COLORS.estimateGnss,
        fillOpacity: 0.12,
        weight: 1
    }).addTo(map);

    map.setView([52.42, -1.50], 15);
    mapInitialized = true;
}

window.updateMap = function(sample, trajectoryData, currentIndex) {
    if (!mapInitialized) initializeMap();
    if (
        !map ||
        !sample ||
        !trajectoryData ||
        !Array.isArray(trajectoryData.samples)
    ) return;

    const visibleSamples =
        trajectoryData.samples.slice(0, currentIndex + 1);

    const gnssPreCoords = [];
    const gnssPostCoords = [];
    const drEstimateCoords = [];
    const groundTruthCoords = [];

    let outageSeen = false;

    for (const s of visibleSamples) {

        if (
            s.ukf_estimate &&
            s.ukf_estimate.latitude != null &&
            s.ukf_estimate.longitude != null
        ) {
            const coord = [
                Number(s.ukf_estimate.latitude),
                Number(s.ukf_estimate.longitude)
            ];

            if (s.gnss_available) {

                if (outageSeen)
                    gnssPostCoords.push(coord);
                else
                    gnssPreCoords.push(coord);

            } else {

                outageSeen = true;
                drEstimateCoords.push(coord);
            }
        }

        if (
            s.ground_truth &&
            s.ground_truth.latitude != null &&
            s.ground_truth.longitude != null
        ) {
            groundTruthCoords.push([
                Number(s.ground_truth.latitude),
                Number(s.ground_truth.longitude)
            ]);
        }
    }

    estimateGnssPreLine.setLatLngs(gnssPreCoords);
    estimateGnssPostLine.setLatLngs(gnssPostCoords);
    estimateDrLine.setLatLngs(drEstimateCoords);
    groundTruthLine.setLatLngs(groundTruthCoords);

    if (
        sample.ukf_estimate &&
        sample.ukf_estimate.latitude != null &&
        sample.ukf_estimate.longitude != null
    ) {
        const currentLatLng = [
            Number(sample.ukf_estimate.latitude),
            Number(sample.ukf_estimate.longitude)
        ];

        const markerColor =
            sample.gnss_available
                ? COLORS.estimateGnss
                : COLORS.estimateDr;

        currentMarker.setLatLng(currentLatLng);

        currentMarker.setStyle({
            fillColor: markerColor,
            color: "#ffffff"
        });

        const uncertainty =
            Number(sample.ukf_estimate.uncertainty_m);

        if (Number.isFinite(uncertainty)) {

            uncertaintyCircle.setLatLng(
                currentLatLng
            );

            uncertaintyCircle.setRadius(
                Math.max(uncertainty, 1)
            );

            uncertaintyCircle.setStyle({
                color: markerColor,
                fillColor: markerColor
            });
        }

        map.panTo(
            currentLatLng,
            { animate: false }
        );
    }

    if (
        !hasFittedBounds &&
        groundTruthCoords.length > 0
    ) {
        map.fitBounds(
            L.latLngBounds(groundTruthCoords),
            { padding: [30, 30] }
        );

        hasFittedBounds = true;
    }

    setTimeout(() => {
        if (map) map.invalidateSize(false);
    }, 0);
};

window.resetMap = function() {
    if (!map) return;

    estimateGnssPreLine.setLatLngs([]);
    estimateGnssPostLine.setLatLngs([]);
    estimateDrLine.setLatLngs([]);
    groundTruthLine.setLatLngs([]);

    hasFittedBounds = false;
};

document.addEventListener(
    "DOMContentLoaded",
    initializeMap
);