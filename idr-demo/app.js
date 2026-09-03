let trajectoryData = null;

let currentIndex = 0;

let isPlaying = false;

let playbackTimer = null;

let playbackMultiplier = 1;


async function loadTrajectoryData() {

    try {

        const response = await fetch(
            "data/trajectory.json"
        );

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

    }

}


function initializeReplay() {

    const slider =
        document.getElementById(
            "timelineSlider"
        );

    slider.max =
        trajectoryData.samples.length - 1;

    updateDashboard();

}

function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in metres

    const toRad = (deg) => deg * Math.PI / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;

    const c = 2 * Math.atan2(
        Math.sqrt(a),
        Math.sqrt(1 - a)
    );

    return R * c;
}

function calculateDistanceTravelled(index) {

    if (!trajectoryData || index <= 0) {
        return 0;
    }

    let distance = 0;

    const samples =
        trajectoryData.samples;

    const outageStart =
        trajectoryData.metadata.outage_start_s;

    const outageEnd =
        trajectoryData.metadata.outage_end_s;


    for (let i = 1; i <= index; i++) {

        const previous =
            samples[i - 1];

        const current =
            samples[i];


        // Only count distance travelled
        // during the GNSS outage.

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

function calculateCurrentError(sample) {

    if (
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

function updateMetrics(sample) {

    if (!trajectoryData) {
        return;
    }


    const outageStart =
        trajectoryData.metadata.outage_start_s;

    const outageEnd =
        trajectoryData.metadata.outage_end_s;


    const timestamp =
        sample.timestamp_s;


    /*
     * CURRENT POSITION ERROR
     */

    const currentError =
        calculateCurrentError(sample);


    document.getElementById(
        "driftValue"
    ).textContent =
        currentError.toFixed(1);


    /*
     * OUTAGE ELAPSED TIME
     */

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

        outageTime =
            outageEnd - outageStart;
    }


    document.getElementById(
        "outageTime"
    ).textContent =
        outageTime.toFixed(1);


    /*
     * DISTANCE TRAVELLED DURING OUTAGE
     */

    const distanceTravelled =
        calculateDistanceTravelled(
            currentIndex
        );


    document.getElementById(
        "distanceValue"
    ).textContent =
        distanceTravelled.toFixed(1);


    /*
     * DRIFT %
     *
     * error / distance travelled × 100
     */

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


    document.getElementById(
        "driftPercent"
    ).textContent =
        driftPercent.toFixed(2);
}



function updateDashboard() {

    if (!trajectoryData) {
        return;
    }

    const sample =
        trajectoryData.samples[currentIndex];

    document.getElementById(
        "currentTime"
    ).textContent =
        sample.timestamp_s.toFixed(1) + " s";


    document.getElementById(
        "speedValue"
    ).textContent =
        (
            sample.ukf_estimate.speed_ms * 3.6
        ).toFixed(1);


    document.getElementById(
        "uncertaintyValue"
    ).textContent =
        sample.ukf_estimate
            .uncertainty_m
            .toFixed(1);


    updateMetrics(sample);
    updateNavigationMode(sample);


    document.getElementById(
        "timelineSlider"
    ).value =
        currentIndex;

}


function updateNavigationMode(sample) {

    const badge =
        document.getElementById(
            "modeBadge"
        );

    if (sample.gnss_available) {

        badge.textContent =
            "GNSS ACTIVE";

        badge.classList.remove(
            "outage-mode"
        );

        badge.classList.add(
            "gnss-mode"
        );

    } else {

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


function playReplay() {

    if (isPlaying) {
        return;
    }

    isPlaying = true;


    playbackTimer =
        setInterval(() => {

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
        100 / playbackMultiplier);

}


function pauseReplay() {

    isPlaying = false;

    clearInterval(playbackTimer);

}


function restartReplay() {

    pauseReplay();

    currentIndex = 0;

    updateDashboard();

}


document
    .getElementById("playButton")
    .addEventListener(
        "click",
        () => {

            if (isPlaying) {

                pauseReplay();

                document
                    .getElementById(
                        "playButton"
                    ).textContent =
                    "▶ Play";

            } else {

                playReplay();

                document
                    .getElementById(
                        "playButton"
                    ).textContent =
                    "⏸ Pause";

            }

        }
    );


document
    .getElementById("restartButton")
    .addEventListener(
        "click",
        restartReplay
    );


document
    .getElementById("timelineSlider")
    .addEventListener(
        "input",
        (event) => {

            currentIndex =
                Number(
                    event.target.value
                );

            updateDashboard();

        }
    );


document
    .getElementById("playbackSpeed")
    .addEventListener(
        "change",
        (event) => {

            playbackMultiplier =
                Number(event.target.value);

            if (isPlaying) {

                pauseReplay();

                playReplay();

            }

        }
    );


loadTrajectoryData();