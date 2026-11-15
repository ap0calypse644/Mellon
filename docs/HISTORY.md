# Project history and the current build

Mellon started as a small animated GNOME unlock experiment and became a paired GNOME 50 greeter/lock-screen experience. The older prototypes are preserved because they explain why certain technical choices exist; they are **not** the recommended installation path.

## Which version should I inspect?

| Milestone | Key idea | Current role |
| --- | --- | --- |
| Root `mellon@nibir.local` | Early synthetic starfield and anonymous keypress pulses | **Legacy prototype only** |
| M1–M2 | GNOME 50 native password length observer and early unlock experiments | Historical research |
| M3–M5 | Observatory UI, visual failure warning, recovery and starfield experiments | Design evolution |
| M6.4 | Twelve curated 8+ real-source-star scenes and randomized masks | Scene pack/pixel rendering foundation |
| M7.1 | Strong source-pixel ignition, bright completion wave, sustained stars/edges | Current stellar effects foundation |
| M8.1–M8.3.2 | Four-panel HUD, eight-stage readout engine, recurring five-second grid | Current Observatory foundation |
| **M8.4** | Numeric 01–08 stages, per-stage pulses, resilient grid scans and signal cleanup | Foundation of current lock extension |
| G1.4 | GDM photographic constellation and length observer | Historical implementation |
| G1.5 | Bounded GDM lifecycle / recovery | Current stability foundation |
| G1.6A/A.1 | Hide native password interface with SHOW LOGIN and fixed scan behavior | Current password-cover foundation |
| G1.6B | GNOME-native single-user activation and custom multi-user selector | Current account UI foundation |
| G1.7 | Early photographic curtain eliminates account-loading logo flash | Current GDM startup foundation |
| **G1.8** | Matches M8.4 eight-stage readout and progress pulse | Foundation of current GDM extension |
| **M9** | Per-monitor photo, constellation and HUD; primary-only native GDM controls; compositor-driven scan; reversible GDM upgrade | **Current accepted lock and GDM implementation** |

The current BlackPearl deployment uses **M9**, built on M8.4 + G1.8, and was confirmed working across mixed-scale dual monitors on GNOME Shell 50.1. Read [Multi-monitor implementation](MULTI_MONITOR.md) and [Changelog](../CHANGELOG.md). Newcomers should start with [Architecture](ARCHITECTURE.md) and [Getting started](GETTING_STARTED.md), not a handover or a milestone-specific VM installer.

## Historical notes you may still want

- The original M8 source and test rationale: [M8 README](../lab/gnome50-m8/README.md). **Historical caveat:** parts of this document predate M8.4, including behavior of scans after incorrect passwords/resizing.
- The GDM milestones and their VM-specific staging scripts: [GDM lab README](../lab/gnome50-gdm/README.md).
- G1.8/M8.4 unified mapping design: [G1.8 record](../lab/gnome50-gdm/G1.8-M8.4-UNIFIED-EIGHT-STAGES.md).
- Earlier design handovers: [full handover](handover/MELLON_FULL_HANDOVER_2026-11-09.md) and [master handover](handover/MELLON_MASTER_HANDOVER_2026-11-11_M7_1_TO_M8.md).
- The source-asset and star-matching research: [tools/starfield](../tools/starfield/README.md), [tools/constellations](../tools/constellations/README.md).

## What's next?

The planned mythological constellation **figure artwork** is intentionally postponed until the end. An early Orion art experiment exists in `assets/constellation-art/orion/`, but it is not wired into the current runtime. That work should stay decoupled from authentication and preserve the underlying source-photographic star positions.

Other open directions: configurable installers for more than one machine, tested GNOME versions beyond 50.1, portable asset packs with rights-cleared photography, multi-user GDM field tests, and more automated integration coverage. None of these are advertised as finished.
