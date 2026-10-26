# Pulse Lab on Jovey

Live path: https://jovey.co/pulse-lab/

This is the S16 phone-camera PPG scanner, based on the exported S15 acquisition code, ported to Jovey's static
GitHub Pages site on 26 October 2026. It retains continuous synchronized RGB
collection, accepted-snippet retention, compatible acquisition groups, and the
existing browser-side BP and pulse models. Oxygen saturation is under development; its weights are not loaded and no oxygen estimate is reported. BP finishes as soon as its existing signal and model gates pass. No model was
retrained or recalibrated by this port.

## Run

- Hosted app: keep this entire `pulse-lab/` directory together under an HTTPS
  origin. The page loads its local modules and model files with relative URLs.
- Phone camera access requires a supported browser and secure context. For
  desktop development, serve the directory on localhost; use HTTPS on a phone.
- Camera frames and scan results are held in the current tab. Saving reports
  or exporting JSON downloads files explicitly. This port has no hospital EMR,
  patient-ID collection, automatic upload, analytics, or personalization service.

The standalone app download has been retired. Personal scan reports and JSON
exports remain available. The hosted app's browser code is still accessible;
removing the download does not provide copy protection. The header's Jovey link
returns to the homepage at https://jovey.co/.

## Build and check

From the Jovey repository root:

```sh
node scripts/check_pulse_lab.mjs
node scripts/check_pulse_lab.mjs --no-model
python3 scripts/gen_sitemap.py
python3 scripts/check_seo.py
python3 scripts/check_mindspend.py
```

Edit the hosted page and its release modules directly. The checks exercise
the hosted scanner, including its personal scan-report exports.

## Evidence and limitations

Source: Pulse Lab S15, commit `4e171d16dfc4c52e8dd178729d134f82f80b467d`.
Model weights are unchanged. BP uses a public infrared-probe baseline; the
SpO₂ model uses the public UW Ubicomp smartphone dataset. See `report.html` and
`spo2/report.html` for the existing source-data evaluation and limitations.
The UW MIT attribution is retained in `spo2/S2-20261005/hoffman-LICENSE.txt`.
The BP source dataset is CC0 as documented
in its evaluation report. The small RGB test fixture derives from the same
licensed public dataset; it is not a new clinical recording.

The checks above validate packaging and software behavior, not the accuracy
of BP, pulse or SpO₂ on a user's phone. Outputs remain research estimates.

## S16 reporting rule

Automatic completion requires the loaded BP model, at least 12 accepted beat
intervals, two BP-eligible nonoverlapping snippets, morphology convergence and
the existing timing, clipping and training-domain gates. These provisional
engineering checks do not quantify the probability that BP is correct.
A failed gate keeps scanning; a manually requested partial report contains no
BP number when those checks fail. RGB collection and export remain available
for development, but oxygen status is always `under_development` with a null
prediction in scan reports. Historical oxygen research files remain accessible.
