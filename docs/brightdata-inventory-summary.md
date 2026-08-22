# Bright Data inventory summary for Mend

Inventory inspected: 2026-08-22 read-only account inventory from the adjacent project workspace. No credentials were copied, and no dataset, collector, healing action, approval, or schedule was triggered during this inspection.

## Relevant assets

| Need | Existing asset | Decision |
|---|---|---|
| Public biotech pipeline | Scraper Studio collector `c_mt4r97wsmxt9an0ap`, currently scoped to `arrowheadpharma.com` | Reuse only for that approved public domain; pass disease/target terms dynamically after selection. |
| Company information | Crunchbase marketplace dataset `gd_l1vijqt9jfj7olije` plus other account variants | Reuse an appropriate existing dataset; do not build a duplicate Crunchbase collector. |
| PubMed / bioRxiv | No exact asset returned | Prefer authoritative publication APIs. |
| ClinicalTrials.gov | No exact asset returned | Prefer the authoritative ClinicalTrials.gov API. |
| DNDi / MMV / GARDP | No exact asset returned | Treat each as a reviewed source gap; use an accessible authoritative API if present before considering a collector. |
| Patents | No exact asset returned | Prefer authoritative patent sources already used by Mend. |
| Protein structures | No exact asset returned | Prefer RCSB and AlphaFold APIs. |

## Inventory limitations

- The account API returned 1,743 marketplace dataset IDs and metadata for 923 at inventory time.
- Five repository-known custom collectors were verified, but Bright Data exposes no documented endpoint that proves an exhaustive account-wide custom-collector list.
- The account returned no saved dataset views/schedules and no active proxy/API zones at inventory time.
- Asset availability is a point-in-time fact and must be rechecked before a live release run.

The full inventory remains in the adjacent workspace because its machine-readable file is approximately 8 MB. This repository retains only the reviewed Mend-relevant decision summary.
