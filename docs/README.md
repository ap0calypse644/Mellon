# Documentation map

Mellon has a **working system** and a **long experimental history**. These pages describe the current G1.8/M8.4 system first; the milestone journals under `lab/` are historical design records and may contain warnings or commands that were accurate *at the time*, not for today's install.

## Learn the system

1. [Getting started](GETTING_STARTED.md) — hardware, GNOME compatibility, prerequisites, building a VM, missing external assets, first tests.
2. [Architecture](ARCHITECTURE.md) — extension ownership, event/data flow, security boundaries, actors, timer lifecycle.
3. [Component map](COMPONENTS.md) — responsibilities and interaction of each current source file.
4. [Customization](CUSTOMIZATION.md) — scene selection, photo matching, 8-stage HUD, glow, animations, account selection, troubleshooting your changes.
5. [Scenes & assets](SCENES_AND_ASSETS.md) — offline pipeline, manifest validation, sprite generation, coordinates, provenance.
6. [Development](DEVELOPMENT.md) — safe iterative workflow, tests, exact CI commands, contribution standards.
7. [Deployment](DEPLOYMENT.md) — why existing scripts are pinned to one machine, porting them, staged installation, rollback, and TTY recovery.
8. [Troubleshooting](TROUBLESHOOTING.md) — diagnosed failures, read-only commands, safe fallbacks, what not to do.
9. [Security & privacy](SECURITY.md) — threat model, private GNOME APIs, invariant checklist.
10. [Assets & licenses](ASSETS_AND_LICENSES.md) — what is MIT, what is *not*, photographers and image/model provenance.
11. [History](HISTORY.md) — version map, original prototype versus current implementation, milestone documentation.

## Where to look in the code

| Concern | Current code |
| --- | --- |
| Native lock integration | `lab/gnome50-m8/extension.js` |
| Native GDM integration | `lab/gnome50-gdm/greeter-extension/extension.js` |
| Password-length observation (GDM) | `lab/gnome50-gdm/greeter-extension/greeter-length-observer.js` |
| GDM native recovery and wrong-password warning | `lab/gnome50-gdm/greeter-extension/greeter-password-cover.js` |
| GDM user selection / early curtain | `lab/gnome50-gdm/greeter-extension/greeter-account-chooser.js` |
| Scene loading & visual mask | `lab/gnome50-m8/scene-data.js` |
| Effects | `lab/gnome50-m8/stellar-effects.js` |
| Observatory HUD | `lab/gnome50-m8/observatory-hud.js` |
| 5-second grid | `lab/gnome50-m8/observatory-intro.js`, `hud-intro-state.js` |
| Eight-stage mapping | `lab/gnome50-m8/hud-progress.js` |
| Offline image matcher | `tools/constellations/` |
| Host deployment | `lab/blackpearl-host/` |

The GDM extension contains copies of shared pure modules. The parity CI guards their identical content. See [Components](COMPONENTS.md) before changing one side.

## Legacy design material

- `lab/gnome50-m1/` through `m8/`: incremental lock-screen experiments.
- `lab/gnome50-gdm/G1*.md`: GDM milestones, including historical VM-only installers.
- `docs/handover/`: chronological research notes and handovers.
- `assets/constellation-art/orion/`: experimental art/provenance, not part of the installed G1.8/M8.4 scene library.

**You do not need to read the old milestones to get started.** Follow the current guides above.
