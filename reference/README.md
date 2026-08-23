# Reference implementations

This folder contains UI implementations retained for comparison, not the canonical Mend product surface.

- `frontend/discovery-ui.mjs` is the disease-research renderer as it existed when the polished dossier became the canonical `/mend` view.
- The live research workflow remains available at `/mend/research`.
- `/reference/mend-discovery` renders the current research screen for side-by-side verification only.

The canonical product entry point is `/mend`: before a target handoff it opens research; after a target run exists it opens the polished, evidence-backed target dossier.
