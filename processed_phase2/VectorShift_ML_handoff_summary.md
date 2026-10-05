# VectorShift Phase 2 ML data handoff

## Verified output

- Contract: version 2.0.0
- Sampling: 10 Hz
- Window: 20 timesteps
- Features: 5, stored as float32 in physical SI units
- Target: synchronized V GNSS velocity converted from km/h to m/s
- Split: driver-disjoint
- Verification: passed with zero failures and zero rejected sessions

| Split | Drivers | Sessions | Windows |
|---|---|---:|---:|
| Train | A, E | 70 | 843,727 |
| Validation | B | 1 | 61,741 |
| Test | D | 1 | 64,333 |

The synchronized categorized dataset is the canonical baseline. Synchronized uncategorized copies are excluded as duplicate/variant representations. Unsynchronized files are inventoried but quarantined until they are paired, aligned, deduplicated, and assigned verified driver IDs.

## ML arrays in every session shard

```text
X_imu                 [N,20,5] float32
entry_speed_ms        [N,1]    float32
entry_heading_rad     [N,1]    float32
t_since_blackout_s    [N,1]    float32
y_speed_ms            [N,1]    float32
timestamp_ns          [N]      int64
event_weight          [N,1]    float32
```

Feature order:

```text
gyro_yaw_rate_enu_rad_s
lin_acc_E_mps2
lin_acc_N_mps2
lin_acc_U_mps2
mag_heading_valid
```

## ML team instructions

1. Load the supplied train, validation, and test folders without resplitting.
2. Use `ml_dataset.py` to stream normalized batches. The loader applies only the scaler fitted on the training split.
3. Train a compact CNN+LSTM global model. Recommended path: Conv1D(32) -> Conv1D(32) -> LSTM(32), concatenate entry speed, heading sine/cosine, and elapsed blackout time, then use speed and uncertainty output heads.
4. Predict nonnegative absolute speed in m/s and positive one-sigma speed uncertainty in m/s.
5. Use a Gaussian negative-log-likelihood loss plus a small weighted MAE term. Apply the supplied event weights to emphasize acceleration and braking.
6. Compare against constant entry-speed hold. Do not accept the model unless it improves the frozen validation results.
7. Evaluate one-step speed MAE/RMSE and sequential 10-, 30-, and 60-second outage rollouts.
8. Export the accepted global model to trainable TFLite with normalization embedded or version-locked alongside it.
9. Keep driver and session IDs as metadata. Never pass them as model inputs.
10. Keep the test split locked until architecture and hyperparameters are frozen.

## Federated-learning integration after the global model

1. Freeze and version `W_global` after centralized training passes validation.
2. Treat only training drivers/sessions as simulated FL clients during development.
3. Each client starts from the same global model and fine-tunes locally on accurate-GNSS `(IMU window, speed)` pairs.
4. Upload only `weight_delta`, `n_local_samples`, and `base_model_version`.
5. Aggregate compatible deltas with sample-weighted FedAvg.
6. Score the candidate aggregated model on the frozen validation split.
7. Promote it only when it does not regress against the current global model and speed-hold baseline.
8. Never include validation or test sessions in FedAvg training.

## Known limitation

The canonical synchronized subset contains four verified labelled drivers, not all eight drivers described by the full IO-VNBD publication. This dataset is suitable for the baseline and mechanism demonstration, but results must not be described as eight-driver generalization. Unsynchronized data can expand coverage only after its driver mapping and temporal alignment are verified.
