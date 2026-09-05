// ============================================================
// VectorShift - Navigation Replay
// Frontend replay layer for the final UKF trajectory output
// ============================================================

// ------------------------------------------------------------
// GLOBAL STATE
// ------------------------------------------------------------

let trajectoryData = null;

let currentIndex = 0;
let isPlaying = false;
let playbackTimer = null;
let playbackMultiplier = 1;


// ------------------------------------------------------------
// DATA LOADING
// ------------------------------------------------------------

async function loadTrajectoryData() {

    try {

        // Scenario B for now.
        // Later we can switch this dynamically between:
        // trajectory_scn_A.json
        // trajectory_scn_B.json
        // trajectory_scn_C.json
        // trajectory_scn_LONG.json

        const response = await fetch(
            "data/trajectory_scn_B_1.json"
        );

        if (!response.ok) {
            throw new Error(
                `HTTP ${response.status} - ${response.statusText}`
            );
        }

        trajectoryData = await response.json();

        console.log(
            "Trajectory data loaded:",
            trajectoryData
        );

        initializeReplay();

    } catch (error) {

        console.error(
            "Failed to load trajectory data:",
            error
        );

        // Show an error in the map area if possible
        const mapContainer =
            document.getElementById("map");

        if (mapContainer) {
            mapContainer.textContent =
                "Failed to load trajectory data.";
        }
    }
}


// ------------------------------------------------------------
// INITIALIZE REPLAY
// ------------------------------------------------------------

function initializeReplay() {

    if (
        !trajectoryData ||
        !trajectoryData.samples ||
        trajectoryData.samples.length === 0
    ) {
        console.error(
            "Trajectory data contains no samples."
        );

        return;
    }

    const slider =
        document.getElementById(
            "timelineSlider"
        );

    if (slider) {

        slider.min = 0;

        slider.max =
            trajectoryData.samples.length - 1;

        slider.value = 0;
    }

    currentIndex = 0;

    updateDashboard();

}


// ------------------------------------------------------------
// HAVERSINE DISTANCE
// ------------------------------------------------------------

function haversineDistance(
    lat1,
    lon1,
    lat2,
    lon2
) {

    const R = 6371000; // Earth radius in metres

    const toRad =
        (deg) => deg * Math.PI / 180;

    const dLat =
        toRad(lat2 - lat1);

    const dLon =
        toRad(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) ** 2 +

        Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;

    const c =
        2 * Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );

    return R * c;
}


// ------------------------------------------------------------
// DISTANCE TRAVELLED DURING GNSS OUTAGE
// ------------------------------------------------------------

function calculateDistanceTravelled(index) {

    if (
        !trajectoryData ||
        !trajectoryData.samples ||
        index <= 0
    ) {
        return 0;
    }

    let distance = 0;

    const samples =
        trajectoryData.samples;

    const outageStart =
        trajectoryData.metadata
            .outage_start_s;

    const outageEnd =
        trajectoryData.metadata
            .outage_end_s;


    for (let i = 1; i <= index; i++) {

        const previous =
            samples[i - 1];

        const current =
            samples[i];


        // Only accumulate distance
        // while the GNSS outage is active.

        if (
            current.timestamp_s >= outageStart &&
            current.timestamp_s <= outageEnd
        ) {

            const previousTruth =
                previous.ground_truth;

            const currentTruth =
                current.ground_truth;


            if (
                previousTruth &&
                currentTruth
            ) {

                distance +=
                    haversineDistance(
                        previousTruth.latitude,
                        previousTruth.longitude,

                        currentTruth.latitude,
                        currentTruth.longitude
                    );
            }
        }
    }

    return distance;
}


// ------------------------------------------------------------
// CURRENT POSITION ERROR
// ------------------------------------------------------------

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


// ------------------------------------------------------------
// UPDATE METRICS
// ------------------------------------------------------------

function updateMetrics(sample) {

    if (!trajectoryData || !sample) {
        return;
    }


    const outageStart =
        trajectoryData.metadata
            .outage_start_s;

    const outageEnd =
        trajectoryData.metadata
            .outage_end_s;

    const timestamp =
        sample.timestamp_s;


    // --------------------------------------------------------
    // CURRENT POSITION ERROR
    // --------------------------------------------------------

    const currentError =
        calculateCurrentError(sample);


    const driftElement =
        document.getElementById(
            "driftValue"
        );

    if (driftElement) {

        driftElement.textContent =
            currentError.toFixed(1);
    }


    // --------------------------------------------------------
    // OUTAGE ELAPSED TIME
    // --------------------------------------------------------

    let outageTime = 0;


    if (
        timestamp >= outageStart &&
        timestamp <= outageEnd
    ) {

        outageTime =
            timestamp - outageStart;

    } else if (
        timestamp > outageEnd
    ) {

        // Once GNSS has returned,
        // display the complete outage duration.

        outageTime =
            outageEnd - outageStart;
    }


    const outageElement =
        document.getElementById(
            "outageTime"
        );

    if (outageElement) {

        outageElement.textContent =
            outageTime.toFixed(1);
    }


    // --------------------------------------------------------
    // DISTANCE TRAVELLED DURING OUTAGE
    // --------------------------------------------------------

    const distanceTravelled =
        calculateDistanceTravelled(
            currentIndex
        );


    const distanceElement =
        document.getElementById(
            "distanceValue"
        );

    if (distanceElement) {

        distanceElement.textContent =
            distanceTravelled.toFixed(1);
    }


    // --------------------------------------------------------
    // DRIFT PERCENTAGE
    //
    // drift % =
    // position error / distance travelled × 100
    // --------------------------------------------------------

    let driftPercent = 0;


    if (
        timestamp >= outageStart &&
        distanceTravelled > 0
    ) {

        driftPercent =
            (
                currentError /
                distanceTravelled
            ) * 100;
    }


    const driftPercentElement =
        document.getElementById(
            "driftPercent"
        );

    if (driftPercentElement) {

        driftPercentElement.textContent =
            driftPercent.toFixed(2);
    }
}


// ------------------------------------------------------------
// UPDATE DASHBOARD
// ------------------------------------------------------------

function updateDashboard() {

    if (
        !trajectoryData ||
        !trajectoryData.samples ||
        !trajectoryData.samples[currentIndex]
    ) {
        return;
    }


    const sample =
        trajectoryData.samples[currentIndex];


    // --------------------------------------------------------
    // CURRENT TIME
    // --------------------------------------------------------

    const currentTimeElement =
        document.getElementById(
            "currentTime"
        );

    if (currentTimeElement) {

        currentTimeElement.textContent =
            sample.timestamp_s.toFixed(1) + " s";
    }


    // --------------------------------------------------------
    // SPEED
    //
    // The displayed speed comes from the UKF estimate.
    //
    // IMPORTANT:
    // After ML is integrated into the UKF, this field should
    // represent the fused UKF result, not raw ML output.
    // --------------------------------------------------------

    const speedElement =
        document.getElementById(
            "speedValue"
        );


    if (
        speedElement &&
        sample.ukf_estimate &&
        typeof sample.ukf_estimate.speed_ms === "number"
    ) {

        speedElement.textContent =
            (
                sample.ukf_estimate.speed_ms * 3.6
            ).toFixed(1);
    }


    // --------------------------------------------------------
    // POSITION UNCERTAINTY
    // --------------------------------------------------------

    const uncertaintyElement =
        document.getElementById(
            "uncertaintyValue"
        );


    if (
        uncertaintyElement &&
        sample.ukf_estimate &&
        typeof sample.ukf_estimate.uncertainty_m === "number"
    ) {

        uncertaintyElement.textContent =
            sample.ukf_estimate
                .uncertainty_m
                .toFixed(1);
    }


    // --------------------------------------------------------
    // UPDATE EVERYTHING ELSE
    // --------------------------------------------------------

    updateMetrics(sample);

    updateNavigationMode(sample);


    // --------------------------------------------------------
    // UPDATE SLIDER
    // --------------------------------------------------------

    const slider =
        document.getElementById(
            "timelineSlider"
        );


    if (slider) {

        slider.value =
            currentIndex;
    }
}


// ------------------------------------------------------------
// GNSS / DEAD RECKONING MODE
// ------------------------------------------------------------

function updateNavigationMode(sample) {

    const badge =
        document.getElementById(
            "modeBadge"
        );


    if (!badge || !sample) {
        return;
    }


    if (sample.gnss_available) {

        // GNSS has a valid measurement

        badge.textContent =
            "GNSS ACTIVE";


        badge.classList.remove(
            "outage-mode"
        );


        badge.classList.add(
            "gnss-mode"
        );

    } else {

        // GNSS unavailable.
        // Navigation continues using the
        // dead-reckoning / UKF estimate.

        badge.textContent =
            "DEAD RECKONING ACTIVE";


        badge.classList.remove(
            "gnss-mode"
        );


        badge.classList.add(
            "outage-mode"
        );
    }
}


// ------------------------------------------------------------
// PLAY REPLAY
// ------------------------------------------------------------

function playReplay() {

    if (
        isPlaying ||
        !trajectoryData ||
        !trajectoryData.samples
    ) {
        return;
    }


    // If we are already at the end,
    // start again from the beginning.

    if (
        currentIndex >=
        trajectoryData.samples.length - 1
    ) {

        currentIndex = 0;

        updateDashboard();
    }


    isPlaying = true;


    const playButton =
        document.getElementById(
            "playButton"
        );


    if (playButton) {

        playButton.textContent =
            "⏸ Pause";
    }


    // --------------------------------------------------------
    // Dataset is sampled at approximately 10 Hz.
    //
    // Therefore:
    //
    // 1x  -> 100 ms per sample
    // 2x  -> 50 ms per sample
    //
    // --------------------------------------------------------

    playbackTimer =
        setInterval(

            () => {

                if (
                    currentIndex >=
                    trajectoryData.samples.length - 1
                ) {

                    pauseReplay();

                    return;
                }


                currentIndex++;

                updateDashboard();

            },

            100 / playbackMultiplier
        );
}


// ------------------------------------------------------------
// PAUSE REPLAY
// ------------------------------------------------------------

function pauseReplay() {

    isPlaying = false;


    if (playbackTimer !== null) {

        clearInterval(
            playbackTimer
        );

        playbackTimer = null;
    }


    const playButton =
        document.getElementById(
            "playButton"
        );


    if (playButton) {

        playButton.textContent =
            "▶ Play";
    }
}


// ------------------------------------------------------------
// RESTART REPLAY
// ------------------------------------------------------------

function restartReplay() {

    pauseReplay();

    currentIndex = 0;

    updateDashboard();
}


// ------------------------------------------------------------
// PLAY / PAUSE BUTTON
// ------------------------------------------------------------

const playButton =
    document.getElementById(
        "playButton"
    );


if (playButton) {

    playButton.addEventListener(
        "click",
        () => {

            if (isPlaying) {

                pauseReplay();

            } else {

                playReplay();
            }
        }
    );
}


// ------------------------------------------------------------
// RESTART BUTTON
// ------------------------------------------------------------

const restartButton =
    document.getElementById(
        "restartButton"
    );


if (restartButton) {

    restartButton.addEventListener(
        "click",
        restartReplay
    );
}


// ------------------------------------------------------------
// TIMELINE SLIDER
// ------------------------------------------------------------

const timelineSlider =
    document.getElementById(
        "timelineSlider"
    );


if (timelineSlider) {

    timelineSlider.addEventListener(
        "input",
        (event) => {

            currentIndex =
                Number(
                    event.target.value
                );


            updateDashboard();
        }
    );
}


// ------------------------------------------------------------
// PLAYBACK SPEED
// ------------------------------------------------------------

const playbackSpeed =
    document.getElementById(
        "playbackSpeed"
    );


if (playbackSpeed) {

    playbackSpeed.addEventListener(
        "change",
        (event) => {

            playbackMultiplier =
                Number(
                    event.target.value
                );


            // Restart the timer so the new
            // playback speed takes effect.

            if (isPlaying) {

                pauseReplay();

                playReplay();
            }
        }
    );
}


// ------------------------------------------------------------
// START APPLICATION
// ------------------------------------------------------------

loadTrajectoryData();