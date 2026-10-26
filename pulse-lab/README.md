# Pulse Lab on Jovey

Live path: https://jovey.co/pulse-lab/

This is the exported S15 phone-camera PPG scanner, ported to Jovey's static
GitHub Pages site on 26 October 2026. It retains continuous synchronized RGB
collection, accepted-snippet retention, compatible acquisition groups, and the
existing browser-side BP, pulse and experimental SpO₂ models. No model was
retrained or recalibrated by this port.

## Run or reuse

- Hosted app: keep this entire `pulse-lab/` directory together under an HTTPS
  origin. The page loads its local modules and model files with relative URLs.
- Single-file export: `Pulse_Lab_S15_Jovey.html` embeds all 16 JavaScript modules
  and the five model/benchmark/example JSON assets. No network model loading is
  required. Documentation links point to the public Jovey copies.
- Phone camera access requires a supported browser and secure context. For
  desktop development, serve the directory on localhost; use HTTPS on a phone.
  Merely opening an HTML attachment may not grant camera/flash access.
- Camera frames and scan results are held in the current tab. Saving reports
  or exporting JSON downloads files explicitly. This port has no hospital EMR,
  patient-ID collection, automatic upload, analytics, or personalization service.

## Build and check

From the Jovey repository root:

```sh
python3 scripts/export_pulse_lab.py
node scripts/check_pulse_lab.mjs --standalone
node scripts/check_pulse_lab.mjs
node scripts/check_pulse_lab.mjs --no-model
node scripts/check_pulse_lab.mjs --no-oxygen
python3 scripts/gen_sitemap.py
python3 scripts/check_seo.py
python3 scripts/check_mindspend.py
```

Edit the release modules and regenerate the standalone export together. The
small exporter accepts only the named-import/declaration-export syntax used by
these modules; it rejects unknown import forms and cycles. `export-manifest.json`
records the upstream source commit and asset hashes for comparison.

## Evidence and limitations

Source: Pulse Lab S15, commit `4e171d16dfc4c52e8dd178729d134f82f80b467d`.
Model weights are unchanged. BP uses a public infrared-probe baseline; the
SpO₂ model uses the public UW Ubicomp smartphone dataset. See `report.html` and
`spo2/report.html` for the existing source-data evaluation and limitations.
The UW MIT attribution is retained in `spo2/S2-20261005/hoffman-LICENSE.txt` and
embedded in the single-file export. The BP source dataset is CC0 as documented
in its evaluation report. The small RGB test fixture derives from the same
licensed public dataset; it is not a new clinical recording.

The checks above validate packaging and software behavior, not the accuracy
of BP, pulse or SpO₂ on a user's phone. Outputs remain research estimates.
