# Pulse Lab: public-data training sprint

**3 October 2026 · model ppgbp-generalized-v0.1 · experimental research baseline**

## Result

A reproducible signal-only random forest is trained and exported for browser inference. The previous hand-written intensity-to-BP formula has been removed. Phone-camera accuracy remains unknown. The model performs poorly at the low and high ends of the source BP range.

| Model | SBP MAE | DBP MAE | SBP bias | DBP bias |
|---|---:|---:|---:|---:|
| Training median | 16.55 | 9.27 | +0.55 | -0.05 |
| Age + sex + BMI | 12.28 | 8.96 | +0.75 | +0.75 |
| PPG only | 13.45 | 9.12 | +1.73 | +1.16 |
| PPG + profile | 12.04 | 8.93 | -0.05 | +0.93 |

All errors are mmHg on the same 44 held-out participants. Each participant's prediction averages their 2–3 unique clips. Segment-level metrics are in metrics.json; there is one reference label per participant. Bias = estimate minus reference. These results do not quantify accuracy of a 30-second phone scan.

The signal-only model has SBP MAE 13.45 (95% bootstrap CI 9.91–17.59) and DBP MAE 9.12 (7.38–11.00). Error SD is 18.62 / 11.24 mmHg. The app reports no invented confidence percentage.

Adding PPG to age/sex/BMI improves MAE by only 0.25 / 0.03 mmHg. The paired 95% bootstrap intervals include zero for both targets (SBP −1.82 to +2.32; DBP −1.12 to +1.20). This experiment does not establish incremental value beyond demographics. Signal-only SBP beats the training median by 3.09 mmHg (CI 0.47–5.57); the DBP gain is uncertain.

For reference SBP <120, the signal-only model overestimates by 17.18 mmHg on average (16 people). For SBP ≥140 it underestimates by 19.93 mmHg (11 people). This regression toward the middle is a major limitation, not a usable screening result.

## Data obtained and audited

- Official PPG-BP Figshare version 5; 219 participants and 657 waveforms; CC0 dataset listing. Source: https://figshare.com/articles/dataset/PPG-BP_Database_zip/5459299
- Original files downloaded and MD5-verified against the provider metadata. Source archives and metadata are retained in research/data.
- Infrared transmission PPG (905 nm), 1,000 Hz; normally 2.1 seconds per clip. One brachial cuff reference shared by each participant's three recordings. No longitudinal BP labels and no camera video.
- Seven pairs of exactly identical waveforms found. Participants 23 and 24 share a waveform under different IDs: both excluded before partitioning because ownership is ambiguous. Six within-person repeats collapsed to one copy each.
- Two files for participant 231 contain 4,200 samples; the first 2,100 samples were used to maintain the fixed window. Full audit is preserved.
- Final analysis: 217 participants / 645 unique clips. No waveform duplicates cross partitions.

Dataset paper: Liang Y, Chen Z, Liu G, Elgendi M. A new, short-recorded photoplethysmogram dataset for blood pressure monitoring in China. Scientific Data 5, 180020 (2018). https://doi.org/10.1038/sdata.2018.20

## Frozen development procedure

Seed 20261003. Partitioned people into 129 training / 44 validation / 44 test, stratified by source systolic BP bands. All clips from each person remain together. The test labels are never features or selection inputs.

Shared JavaScript preprocessing bins the waveform to 30 Hz, detrends, smooths, normalizes amplitude/polarity, and extracts 25 morphology/spectral features. Resampling sensor PPG does not recreate phone camera optics. Four candidates per feature set were compared on validation MAE: ridge alpha 10 or 100; 200-tree random forests with depth 6 and minimum leaf sizes 5 or 12. Every participant has equal total training weight.

The signal-only forest with minimum leaf size 12 won its validation comparison. It was refitted on 173 development participants, then evaluated on the 44 held-out participants. The exported artifact preserves that model; the test set was not folded back into fitting. Profile-only and combined models selected ridge alpha 10. No neural network, public-data personalization, EMR fusion, or KKH training has been claimed.

Excluded predictors include the BP-derived hypertension category, subject ID, reference heart rate, uncertain-time diagnosis fields, current cuff BP and future data. The deployed model uses waveform features only. Demographic models are research comparators, because the consumer app has no verified complete profile feed yet.

## Prototype changes

- Real browser inference from the exported model; no synthetic or heuristic BP fallback.
- Actual unique video-frame timing, separate R/G/B traces, camera settings, and motion observations.
- Left index finger, supported hand at heart level guidance. Height is not automatically verified.
- Engineering rejection of flat, clipped, slow/interrupted or unstable signals; out-of-training-range check. These thresholds are unvalidated engineering heuristics and do not prove BP validity.
- Held-out source examples can run without a camera. Reference values are shown only after model inference and do not enter the feature vector.
- Prediction frozen before user cuff entry. User references include measurement time and optional device; self-report is not treated as verified study ground truth.
- Export of the ordered RGB trace, prediction/model version, camera metadata and reference as JSON. The current app retains one scan in tab memory; download it before another scan or closing the tab. No server persistence is connected.
- Reference pairing is retained for data collection. Automated personal correction is disabled because this dataset cannot validate it; no change is made to the current estimate.

## KKH transition

1. Freeze the phone acquisition and reference SOP: supported cameras, exposure/torch behavior, finger and hand position, rest period, cuff sequence, source verification and acceptable time interval. The UI's 10-minute window is provisional and not a validated pairing protocol.
2. Collect an initial feasibility cohort with repeated phone/cuff pairs, independent participant IDs, camera versions, timestamped eligible EMR and failed attempts. Keep failed captures in the denominator.
3. Evaluate this frozen public model on KKH scans before any local fitting. This is the first direct domain-transfer test; report source model failure and coverage honestly.
4. Create participant-disjoint KKH development and validation cohorts. Adapt preprocessing and model only with development data; evaluate a locked version on untouched local participants and phones.
5. Compare profile-only, last-prior-cuff, phone-only and fused models. Test personalization using earlier eligible pairs and later test visits, with separate cold-start and calibrated results.
6. Retain higher- and lower-BP ranges and measure within-person BP change; a model clustered near average BP must not pass on overall MAE alone.

## Files and reproduction

Run `python3 research/download_data.py research/data/ppg-bp`, then `python3 research/train.py --data research/data/ppg-bp`, then `node research/verify.mjs`. The download is pinned to dataset version 5. Python dependencies and versions are in research/requirements.txt and metrics.json. Feature extraction runs in Node using the exact browser module. The original source ZIP and provider checksums are retained so data preparation can be reproduced.

`research/results/split.json` fixes participant IDs. `data_audit.json` records exclusions. `heldout_predictions.csv` permits independent metric recomputation. `parity.json` checks Python-to-JavaScript inference. `dist/model.json` contains the fitted signal model; `dist/benchmark.json` contains all benchmark results. `dist/benchmark.png` shows the comparison and systolic regression toward the mean.

The model is research infrastructure for the next sprint. It is not an accurate phone BP product or evidence of medical-device performance.


## Adaptive scan report update — 3 October 2026

The phone app now uses selection policy `stable-capture-v1`. It excludes 4.2 seconds for camera settling, evaluates 2.1-second windows across RGB channels and requires five consecutive usable windows (10.5 seconds). Acquisition features select the best qualifying interval among the data captured so far, before BP predictions are computed. Capture auto-finishes when a qualifying interval exists after at least 15 seconds; it can continue to 60 seconds before withholding output and requesting a retry.

Window checks cover timing, clipping, pulse repeatability, frequency content, brightness/contact jumps, available motion and feature ranges from training data. Missing motion remains unknown. Thresholds and the composite ranking are engineering heuristics, not calibrated probabilities or validation of BP error. No cuff reference or model BP value determines selection.

The BP scan report shows the interval, waveform, acquisition evidence, and spread of predictions across selected windows. The spread is explicitly not an accuracy or confidence interval. Download BP report saves a printable HTML report; raw scan JSON also records all window decisions and the policy version. The current BP estimate remains frozen after cuff entry.

Model weights and the original public-data test results are unchanged. Those source-data scores do not evaluate this new phone selection policy. Dedicated software checks cover automatic completion, recovery after a poor interval, abstention, prediction-independent selection and report generation. Physical phone/cuff testing remains outstanding.
