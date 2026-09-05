// VectorShift - Navigation Replay Demo
// -----------------------------------------------------------
// DATA FLOW:
// trajectory_scn_X.json
//      -> replay position / UKF estimate / GNSS state
// metrics.json
//      -> precomputed evaluation / ablation results
// map.js
//      -> later consumes the current trajectory sample

// GLOBAL STATE
let trajectoryData = null;
let metricsData = null;

let currentIndex = 0;
let isPlaying = false;
let playbackTimer = null;
let playbackMultiplier = 1;

// SCENARIO CONFIGURATION
// A = hard corner, B = highway, C = urban/mixed, LONG = 300 s outage
const DEFAULT_SCENARIO = "B";
const SCENARIO_FILES = {
    A: "trajectory_scn_A.json",
    B: "trajectory_scn_B.json",
    C: "trajectory_scn_C.json",
    LONG: "trajectory_scn_LONG.json"
};

const SCENARIO_LABELS = {
    A: "Scenario A — Hard Turn",
    B: "Scenario B — Highway",
    C: "Scenario C — Urban / Mixed",
    LONG: "Scenario LONG — Extended Outage"
};

let currentScenario = DEFAULT_SCENARIO;


// LOAD SELECTED SCENARIO
async function loadData(scenario = DEFAULT_SCENARIO) {
    pauseReplay();

    if (!SCENARIO_FILES[scenario]) scenario = DEFAULT_SCENARIO;
    currentScenario = scenario;

    const trajectoryFile = SCENARIO_FILES[scenario];

    console.log("Loading scenario:", scenario);
    console.log("Trajectory file:", trajectoryFile);

    try {
        const [trajectoryResponse, metricsResponse] = await Promise.all([
            fetch(`data/${trajectoryFile}`),
            fetch("data/metrics.json")
        ]);

        if (!trajectoryResponse.ok) throw new Error(`Could not load ${trajectoryFile}`);
        if (!metricsResponse.ok) throw new Error("Could not load data/metrics.json");

        trajectoryData = await trajectoryResponse.json();
        metricsData = await metricsResponse.json();
        currentIndex = 0;

        const select = document.getElementById("scenarioSelect");
        if (select) select.value = currentScenario;

        const label = document.getElementById("scenarioLabel");
        if (label) {
            label.textContent = trajectoryData.metadata?.label || SCENARIO_LABELS[currentScenario];
        }

        initializeReplay();
        updateAblationMetrics();

        if (typeof window.resetMap === "function") window.resetMap();
        updateDashboard();
    } catch (error) {
        console.error("Failed to load demo data:", error);
        const mapContainer = document.getElementById("map");
        if (mapContainer) mapContainer.textContent = "Failed to load demo data.";
    }
}

// INITIALIZE REPLAY
function initializeReplay() {
    if (!trajectoryData ||
        !Array.isArray(trajectoryData.samples) ||
        trajectoryData.samples.length === 0
    ) {
        console.error("Trajectory contains no samples.");
        return;
    }
    currentIndex = 0;

    // TIMELINE SLIDER
    const slider = document.getElementById("timelineSlider");

    if (slider) {
        slider.min = 0;
        slider.max = trajectoryData.samples.length - 1;
        slider.value = 0;
    }

    // OUTAGE DURATION SELECTOR
    const outageSelector = document.getElementById("outageDuration");

    if (outageSelector && trajectoryData.metadata) {
        const duration =Number(
                trajectoryData.metadata
                    .outage_duration_s
            );
        const matchingOption =
            Array.from(outageSelector.options).find(option =>Number(option.value) ===duration);

        if (matchingOption) {
            outageSelector.value =matchingOption.value;
        }
    }
    updateDashboard();
}

// HAVERSINE DISTANCE
function haversineDistance(lat1,lon1,lat2,lon2) 
{
    const R = 6371000;

    const toRad =degrees =>degrees *Math.PI /180;
    const dLat =toRad(lat2 - lat1);
    const dLon =toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a),Math.sqrt(1 - a));
    return R * c;
}

// CURRENT POSITION ERROR
function calculateCurrentError(sample) {
    if (
        !sample ||
        !sample.ukf_estimate ||
        !sample.ground_truth
    ) {
        return 0;
    }

    return haversineDistance(
        sample.ukf_estimate.latitude,
        sample.ukf_estimate.longitude,

        sample.ground_truth.latitude,
        sample.ground_truth.longitude
    );
}

// DISTANCE TRAVELLED DURING OUTAGE
function calculateDistanceTravelled(index) {
    if (
        !trajectoryData ||
        !Array.isArray(
            trajectoryData.samples
        ) ||
        index <= 0
    ) {
        return 0;
    }

    const samples =trajectoryData.samples;
    const outageStart =Number(trajectoryData.metadata.outage_start_s);
    const outageEnd =Number(trajectoryData.metadata.outage_end_s);
    let distance = 0;

    for (let i = 1;i <= index && i < samples.length;i++) {
        const previous =samples[i - 1];
        const current =samples[i];
        if (current.timestamp_s > outageStart
            &&
            current.timestamp_s <= outageEnd
        ) {
            if (previous.ground_truth && current.ground_truth) {
                distance +=
                    haversineDistance(
                        previous.ground_truth.latitude,
                        previous.ground_truth.longitude,

                        current.ground_truth.latitude,
                        current.ground_truth.longitude
                    );
            }
        }
    }
    return distance;
}

// LIVE REPLAY METRICS
function updateMetrics(sample) {
    if (!trajectoryData || !trajectoryData.metadata) {
        return;
    }

    const outageStart = Number(
            trajectoryData.metadata
                .outage_start_s
        );
    const outageEnd = Number(
            trajectoryData.metadata
                .outage_end_s
        );
    const timestamp = Number(
            sample.timestamp_s
        );

    // CURRENT POSITION ERROR
    const currentError =calculateCurrentError(sample);
    const driftElement =document.getElementById("driftValue");

    if (driftElement) {
        driftElement.textContent =currentError.toFixed(1);
    }

    // OUTAGE ELAPSED TIME
    let outageTime = 0;
    if (timestamp >= outageStart && timestamp <= outageEnd) {
        outageTime = timestamp - outageStart;
    }
    else if (timestamp > outageEnd) {
        outageTime = outageEnd - outageStart;
    }

    const outageElement =document.getElementById("outageTime");
    if (outageElement) {
        outageElement.textContent = outageTime.toFixed(1);
    }

    // DISTANCE TRAVELLED
    let distanceTravelled = calculateDistanceTravelled(currentIndex);

    // If the outage has completed, prefer the authoritative exported value.

    if (
        timestamp >= outageEnd &&
        trajectoryData.metadata.distance_travelled_during_outage_m != null
    ) {
        distanceTravelled = Number(
                trajectoryData.metadata
                    .distance_travelled_during_outage_m
            );
    }

    const distanceElement = document.getElementById("distanceValue");

    if (distanceElement) {
        distanceElement.textContent = distanceTravelled.toFixed(1);
    }

    const driftPercent = sample.drift_pct;
    const driftPercentElement =document.getElementById("driftPercent");
    if (driftPercentElement) {
        driftPercentElement.textContent = driftPercent == null? "—": Number(driftPercent).toFixed(2);
    }
}

// MAIN DASHBOARD UPDATE
function updateDashboard() {
    if (
        !trajectoryData ||
        !trajectoryData.samples ||
        !trajectoryData.samples[currentIndex]
    ) {
        return;
    }
    const sample =trajectoryData.samples[currentIndex];

    // CURRENT TIMESTAMP
    const currentTime =document.getElementById("currentTime");
    if (currentTime) {
        currentTime.textContent = Number(sample.timestamp_s).toFixed(1) + " s";
    }

    // UKF SPEED
    /*
    const speedElement = document.getElementById("speedValue");
    if (
        speedElement &&
        sample.ukf_estimate &&
        sample.ukf_estimate.speed_ms
            != null
    ) {
        const speedKmh = Number(sample.ukf_estimate.speed_ms) * 3.6;
        speedElement.textContent = speedKmh.toFixed(1);
    }
        */

    // UKF UNCERTAINTY
    const uncertaintyElement =document.getElementById("uncertaintyValue");

    if (
        uncertaintyElement &&
        sample.ukf_estimate &&
        sample.ukf_estimate
            .uncertainty_m != null
    ) {
        uncertaintyElement.textContent = Number(sample.ukf_estimate.uncertainty_m).toFixed(1);
    }

    updateMetrics(sample);

    updateNavigationMode(sample);

    // SLIDER
    const slider =document.getElementById("timelineSlider");
    if (slider) {
        slider.value =currentIndex;
    }

    // --------------------------------------------------------
    // MAP HOOK
    // --------------------------------------------------------
    //
    // map.js will eventually provide:
    //
    // window.updateMap(...)
    //
    // Until map.js exists, this safely does nothing.
    //
    // --------------------------------------------------------

    if (typeof window.updateMap === "function") {
        window.updateMap(sample, trajectoryData, currentIndex);
    }
}

// GNSS / DEAD RECKONING MODE
function updateNavigationMode(sample) {
    const badge =document.getElementById("modeBadge");
    if (!badge) {
        return;
    }

    if (sample.gnss_available) {
        badge.textContent ="GNSS ACTIVE";
        badge.classList.remove("outage-mode");
        badge.classList.add("gnss-mode");
    }
    else {
        badge.textContent ="DEAD RECKONING ACTIVE";
        badge.classList.remove("gnss-mode");
        badge.classList.add("outage-mode");
    }
}

// METRICS.JSON / ABLATION
function getCurrentScenarioMetrics() {
    if (!metricsData || !Array.isArray(metricsData.scenarios) || !trajectoryData) {
        return null;
    }

    const scenarioId = trajectoryData.metadata && trajectoryData.metadata.scenario_id;

    console.log(
        "Looking for metrics:",
        scenarioId
    );

    return metricsData.scenarios.find(scenario => scenario.scenario_id ===scenarioId) || null;
}

// FORMAT METRIC
function formatMetric(value) {
    if (value == null) {
        return "Pending";
    }
    return (
        Number(value).toFixed(2)
        + "%"
    );
}

// UPDATE ABLATION CARDS
function updateAblationMetrics() {
    const scenario = getCurrentScenarioMetrics();
    if (!scenario) {
        console.warn("No matching metrics found.");
        return;
    }
    console.log("Ablation metrics:",scenario);

    // BASELINE INS
    const baselineElement = document.getElementById("baselineDrift");
    if (baselineElement) {
        baselineElement.textContent = formatMetric(scenario.baseline_ins_open_loop?.drift_percent);
    }
    
    // FINAL SYSTEM
    const finalElement = document.getElementById("finalDrift");
    if (finalElement) {
        finalElement.textContent = formatMetric(scenario.ukf_full_snapped?.drift_percent);
    }
}

// PLAYBACK
function playReplay() {
    if (
        isPlaying ||
        !trajectoryData ||
        !trajectoryData.samples
    ) {
        return;
    }

    // If replay has reached the end,
    // restart from the beginning.
    if (currentIndex >= trajectoryData.samples.length - 1) {
        currentIndex = 0;
        updateDashboard();
    }

    isPlaying = true;

    const playButton =document.getElementById("playButton");
    if (playButton) {
        playButton.textContent = "⏸ Pause";
    }

    // --------------------------------------------------------
    // 10 Hz DATA
    // --------------------------------------------------------
    // One sample every ~100 ms.
    //
    // 1x = 100 ms
    // 2x = 50 ms
    //
    // --------------------------------------------------------

    // --------------------------------------------------------
    // SCN_LONG ONLY
    // --------------------------------------------------------
    // Same logic as teammate's map.js:
    // Find the last outage sample where:
    //   - drift is still < 10%
    //   - at least 50 m has been travelled
    //
    // Other scenarios are NOT affected.
    let playbackEndIndex = trajectoryData.samples.length - 1;

    if (currentScenario === "LONG") {
        const samples = trajectoryData.samples;
        const outageStart =
            Number(trajectoryData.metadata?.outage_start_s);

        let lastGoodIndex = null;

        for (let i = 0; i < samples.length; i++) {
            const s = samples[i];

            if (
                s.mode === 1 &&
                Number(s.timestamp_s) >= outageStart &&
                s.drift_pct !== null &&
                Number(s.drift_pct) < 10 &&
                Number(s.cumulative_distance_m || 0) >= 50
            ) {
                lastGoodIndex = i;
            }
        }

        if (lastGoodIndex !== null) {
            playbackEndIndex = lastGoodIndex;
        }
    }

    playbackTimer =
        setInterval(
            () => {
                if (currentIndex >= playbackEndIndex) {
                    pauseReplay();
                    return;
                }

                currentIndex++;
                updateDashboard();
            },
            100 /playbackMultiplier
        );
}

// PAUSE
function pauseReplay() {
    isPlaying = false;

    if (playbackTimer !== null) {
        clearInterval(playbackTimer);
        playbackTimer = null;
    }
    const playButton =document.getElementById("playButton");

    if (playButton) {
        playButton.textContent ="▶ Play";
    }
}

// RESTART
function restartReplay() {
    pauseReplay();
    currentIndex = 0;
    updateDashboard();
}

// SCENARIO SELECTOR
document.getElementById("scenarioSelect")?.addEventListener("change", event => {
    loadData(event.target.value);
});

// PLAY BUTTON
document.getElementById("playButton")?.addEventListener("click",() => {
            if (isPlaying) {
                pauseReplay();
            }
            else {
                playReplay();
            }
        }
    );

// RESTART BUTTON
document.getElementById("restartButton")?.addEventListener("click",restartReplay);

// TIMELINE SLIDER
document.getElementById("timelineSlider")?.addEventListener("input",event => {
            currentIndex =
                Number(
                    event.target.value
                );
            updateDashboard();
        }
    );

// PLAYBACK SPEED
document.getElementById("playbackSpeed")?.addEventListener("change",event => {
            playbackMultiplier =
                Number(event.target.value);
            if (isPlaying) {
                pauseReplay();
                playReplay();
            }
        }
    );

// START APPLICATION
document.addEventListener("DOMContentLoaded", () => {
    const select = document.getElementById("scenarioSelect");
    if (select) select.value = DEFAULT_SCENARIO;
    loadData(DEFAULT_SCENARIO);
});