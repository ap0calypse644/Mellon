# MELLON / BLACKPEARL — COMPLETE PROJECT HANDOVER
**Date:** 2026-11-09, India (Asia/Kolkata)  
**Project repository:** https://github.com/ap0calypse644/Mellon  
**Verified source HEAD before this handover:** `dfab47f09759fd5f17947aba1327bab3364f0816`  
**Present stage:** v6 constellation matching completed and validated; **v7 professional Orion-character artwork** is the next milestone.  
**Target environment:** BlackPearl (host development) / `mellon-gnome50-lab` (isolated GNOME Shell integration test VM).

> **Critical rule:** Do not install or test the Mellon GNOME lock-screen extension on the BlackPearl host. Offline data analysis/artwork/code runs on BlackPearl; extension behavior is tested ONLY in the isolated GNOME 50 VM. Do not rerun the 18.6-million-attempt search by default: 36,349 v6 matches already exist.

This document intentionally captures the complete history, final design decisions, exact successful benchmark results, security boundaries, useful commands, historical mistakes, current code layout, and what v7 needs to accomplish. It is a persistent handover for the next ChatGPT conversation, not a release announcement. Some older repo READMEs still describe experiments as “not tested”; later user screenshots established that M1, M2.2 and M3 did render inside the VM.

---

## 0. QUICK BRIEF — WHERE TO PICK UP

The next task is **Mellon v7 — illustrated Orion constellation**. The vision is to show a professionally designed mythological Orion figure progressively DRAWN AROUND an existing, accurately detected, large, centered Orion star pattern—e.g. after correct password and Enter, subject to GNOME's secure unlock lifecycle.

The right first task is **offline artwork fitting and preview**, not VM deployment or more infrastructure work:
1. Read the actual v6 Orion match data, and existing `templates-v3.json` Orion anatomy/edges.
2. Select several appealing, centered Orion placements across the real cosmic images; each star must be physically present in its image.
3. Create or license **professionally executed, editable Orion character artwork** (prefer layered SVG/vector paths) and map its head, shoulders, three-star belt, legs, sword to the true constellation vertices.
4. Fit the illustration so its *full* transformed paths/strokes/glow remain in the reserved character-art envelope; reject bad matches instead of visibly warping Orion.
5. Produce multiple **full-resolution clean image previews**, plus technical QA overlays and an independent geometric validator.
6. Get visual quality feedback before animation or VM integration.
7. Push the code/assets/docs directly to the user's GitHub Mellon repository; user prefers pulling changes from GitHub, not copying source files manually.

**Do not assume the uploaded benchmark archive is accessible in a new chat.** The fully verified v6 report exists on BlackPearl at:

`$HOME/VMs/Mellon/constellation-benchmark-v6-centered/matches-v6.json`

The six-image source and generated coordinate catalogues are committed under:

`assets/starfield/corpus-v1/`

The user previously uploaded `constellation-benchmark-v6-centered.zip` plus the full v6 terminal log. If this isn't available in the new conversation, retrieve only the necessary subset of the v6 Orion output; do not pretend it was committed to GitHub.

### Non-negotiable product requirements

- Only **ONE** constellation visible on a lock screen, selected from approved candidates.
- Constellations **may overlap** as separate stored candidates—never simultaneously displayed, so collision checking/packing is NOT a product requirement.
- Target is **large but centered**, not touching the screen edges; must reserve space for full character illustration.
- Reference template shapes are **real recognizable astronomical constellation geometries**; their selected image stars are **random existing stars** from the background, not the actual astronomical members of those named constellations.
- Actual illuminated vertices must match exact measured pixels from the displayed image. Do not invent or move star positions.
- Faint and dim stars count; **no brightness preference** during constellation matching.
- Background can be a real cosmic photo **or professional digital artwork** found online, with appropriate reuse rights. User previously emphatically rejected using generated cosmic wallpapers in place of good existing art.
- Backgrounds can be cropped/rotated/resized/dimmed, with star coordinates transformed identically.
- User ultimately wants **NO visible native GNOME clock/avatar/password field** on the lock screen. Only the image, constellation, and perhaps figure reveal are visible, while GNOME **retains native password entry/focus/authentication**. This invisible-UI task remains unfinished.
- Success-only figure animation is a goal, **not a proven safe feature**; GNOME may destroy the unlock dialogue as soon as authentication succeeds. Never alter authentication or intercept plaintext passwords merely to force this animation.
- High quality is essential: no childish stickman, arbitrary constellation zigzag, low-grade neon HUD or toy vector art.
- User wants GitHub commits and short `git pull` commands, not pages of pasted code.

---

## 1. HOST HARDWARE, OS, WORKFLOW AND SECURITY

**BlackPearl** is the user's ASUS ROG Strix Scar developer laptop.

- Clean Ubuntu **26.04.1 LTS**, GNOME **50.1**, Wayland. Kernel at VM setup: `7.0.0-43-generic`, may update.
- Unix username `ap0calypse`, host `BlackPearl`.
- Intel Core i9-12900H (20 logical CPUs), NVIDIA RTX 3070 Ti Laptop GPU, ~30 GiB RAM.
- 1 TB NVMe, Windows dual boot preserved; Ubuntu root about 100 GB, separate /home about 498 GB. Keep big VMs/datasets/caches in /home.
- Zsh 5.9 interactive shell. Ghostty default terminal, Tilix secondary. Whole desktop has tailored Violet Horizon / futuristic cockpit styling, GNOME widgets, theme, GRUB, and Zellij setup. **Do not disturb unrelated system customizations.**
- Mellon working Git checkout: `/home/ap0calypse/go/src/ap0calypse644/Mellon`.
- Offline constellation Python venv: `/home/ap0calypse/.local/share/mellon-constellations-venv/bin/python` (numpy, scipy, pillow).
- User prefers manual locking; do not silently enable automatic lock or change host GNOME lock settings.

**VERY IMPORTANT shell requirement:** For any paste-ready multi-line terminal script, wrap EVERYTHING in a subshell:

~~~bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    git -c core.hooksPath=/dev/null pull --ff-only origin main
)
~~~

Do not issue bare top-level `set -euo pipefail` in Zsh (can terminate the user's interactive shell on failure). Avoid Bash-only variable expansion in Zsh; if required, explicitly run a Bash script in a subshell.

**Security background:** A malicious Git `post-checkout` hook in a purported Uniswap hiring assignment executed on 2026-11-02; the user rebuilt Ubuntu from scratch, disabled persistence and rotated/revoked exposed credentials. Do not instruct restoring compromised executables or keys. Prefer safe Git pulls with `-c core.hooksPath=/dev/null`. Do not execute unreviewed third-party repos or downloaded scripts.

**Repo workflow agreed with user:** Develop and **push directly to GitHub** whenever possible, verify files/HEAD, then user pulls on BlackPearl. Never claim a GitHub commit automatically updates the user's local checkout. Offline algorithms need no VM involvement.

---

## 2. ISOLATED GNOME 50 VM — COMPLETE SETUP

The user has already established a real secure test environment using KVM/QEMU, libvirt, virt-manager. Avoid repeating setup.

- Persistent domain: `mellon-gnome50-lab`.
- Libvirt URI: `qemu:///system`.
- Domain UUID: `e77ffbb1-d4ce-4816-bbae-679dfc8187b8`.
- Guest: Ubuntu **26.04.1 LTS** GNOME 50.1 on Wayland.
- Guest user: `test1`; guest hostname `test1-Standard-PC-Q35-ICH9-2009`.
- Four vCPUs, 8192 MiB memory, 64 GiB sparse qcow2 virtual disk, Q35/KVM, virtio disk, libvirt default NAT network, OVMF 4M UEFI pflash, Secure Boot off, AppArmor enforcing.
- Guest root mounted from `/dev/vda2` (a truly installed OS, not live media).
- VM autostart was **originally OFF**. Assistant later suggested enabling it; user's execution was not confirmed, so check rather than assume.
- GitHub SSH alias on BlackPearl: `ssh mellon`, mapping to user `test1` and previously to guest NAT IP **192.168.122.230**. IP can change with DHCP.
- Host account belongs to `libvirt` group; `virsh -c qemu:///system` works without sudo.
- ISO: `~/VMs/Mellon/iso/ubuntu-26.04.1-desktop-amd64.iso`.
- Live guest disk: `~/VMs/Mellon/images/mellon-gnome50-lab.qcow2`.

**Verified immutable reference backup**, created while guest powered off:

~~~text
~/VMs/Mellon/checkpoints/MELLON-BASELINE-001/
├── disk.qcow2        # 64 GiB virtual, originally ~9.86 GiB allocated
├── domain.xml        # validated libvirt domain XML
├── uefi-vars.fd      # UEFI NVRAM
└── SHA256SUMS        # hashes verified against all three files
~~~

The user verified SHA256 checks, `qemu-img check` (no corruption), image metadata and XML validation, and confirmed the original domain still ran. Do not replace the verified baseline casually. NEVER attempt risky disk operations on the actively running VM. Keep AppArmor enabled; old OVMF `amdsev` firmware selection was fixed by explicit OVMF CODE/VARS, not by weakening host confinement.

### 2.1 Using guest from BlackPearl

Get VM state/SSH:

~~~bash
(
    virsh -c qemu:///system domstate mellon-gnome50-lab
    virsh -c qemu:///system net-dhcp-leases default
    ssh -G mellon | grep -E '^(hostname|user|port) '
)
~~~

If shut off:

~~~bash
(
    set -euo pipefail
    VM="mellon-gnome50-lab"
    STATE="$(virsh -c qemu:///system domstate "$VM")"
    if [[ "$STATE" == "shut off" ]]; then
        virsh -c qemu:///system start "$VM"
    elif [[ "$STATE" != "running" ]]; then
        echo "Unexpected VM state: $STATE"
        exit 1
    fi
    for (( i=1; i<=60; i++ )); do
        if ssh -o BatchMode=yes -o ConnectTimeout=2 mellon true 2>/dev/null; then
            echo "SSH ready"
            break
        fi
        sleep 2
    done
)
~~~

**Lock the VM without locking BlackPearl** (typing Super+L on host locks HOST, not VM):

~~~bash
(
    virsh -c qemu:///system send-key \
        mellon-gnome50-lab KEY_LEFTMETA KEY_L
)
~~~

Check guest errors over SSH:

~~~bash
(
    ssh mellon 'journalctl --user -b --no-pager -o cat | grep -Ei "Mellon|JS ERROR|extension" | tail -n 80'
)
~~~

Emergency disable if guest lock screen becomes unusable; this modifies ONLY the guest:

~~~bash
(
    ssh mellon 'rm -f ~/.local/share/gnome-shell/extensions/mellon-lab@local/metadata.json'
    virsh -c qemu:///system reboot mellon-gnome50-lab
)
~~~

This is a quick disable, not a full uninstall. A known working VM build is preserved under `lab/gnome50-m2/`. A complete restorable VM baseline exists above.

When a host reboot stopped the VM, `ssh mellon` gave “No route to host”; fix was simply starting the domain and waiting for SSH, not changing Mellon code.

### 2.2 VM installation lessons

- First VM creation selected wrong OVMF `OVMF.amdsev.fd` and triggered AppArmor denial. Explicit `/usr/share/OVMF/OVMF_CODE_4M.fd` and `/usr/share/OVMF/OVMF_VARS_4M.fd` worked. Never disable AppArmor.
- The ISO was initially not attached to `sda`; `virsh change-media` and VM reset fixed boot into installer. Installed guest and confirmed filesystem on `/dev/vda2`.
- `qemu-img info` may fail locking an actively used qcow2 file; do not interpret that as corruption.
- A VM can be `paused (user)` after particular operations; check `virsh domstate --reason` and resume only if appropriate.
- The SSH alias initially used wrong user `mellon`; actual guest account is `test1`. Correcting identity fixed authentication.
- The test VM can be managed entirely from BlackPearl, apart from visual screenshots/guest GUI interaction.

---

## 3. GNOME LOCK SCREEN EXPERIMENTS (ORIGINAL, M1, M2, M3)

### 3.1 Original pre-lab extension

The root `extension.js` is a Tolkien-inspired experiment (“Speak, friend, and enter”) created in spring 2026. Original implementation relied on a Clutter Canvas with ~420 stars, global `global.stage` captured-event keypress listeners, hidden native auth widgets, and patches/hooking of private GNOME authentication/finish methods. It was built in a substantially older GNOME/Ubuntu X11 VM. Root `install.sh` must **never be run on host during development**. This original approach is NOT a verified secure GNOME 50 production implementation.

The modern M1+ approach uses **only native password character count**, not raw keyboard events or password text. Length and timing still constitute potentially sensitive metadata, so don't log either. Leave GNOME Shell/GDM/PAM in control of authentication.

### 3.2 M1 — proof of native GNOME length observation

Repo: `lab/gnome50-m1/`, first commit `ff4bbc4`. VM-only extension UUID: `mellon-lab@local`; GNOME metadata uses `session-modes`: [`unlock-dialog`].

GNOME 50 private Shell access:

~~~javascript
const dialog = Main.screenShield?._dialog;
const prompt = dialog?._authPrompt;
const buffer = prompt?._passwordEntry?.clutter_text?.get_buffer?.();
buffer.connect('notify::length', () => {
    // Use only buffer.get_length(); never read password text.
});
~~~

M1 displayed a simple violet/cyan HUD. User's screenshots actually showed stars responding to password-length changes (eight characters → eight indicators); native GNOME password prompt remained intact. M1 succeeded in the VM.

Initial deployment said it enabled extension but `enabled-extensions` remained `[]`. Root cause: `Gio.Settings.set_strv` async write not synced, and immediate same-process read was misleading. Fixed in commit `86a53df75637f8b814b6adbcf94c81cff3a2f628` using `Gio.Settings.sync()` and independent SSH-session persistence check. Later output proved the enabled state persisted.

`gnome-extensions info` may show INITIALIZED / INACTIVE in ordinary desktop session even when enabled; only `unlock-dialog` loads it. Consider actual session mode.

### 3.3 M2 Nightwatch — GNOME 50 painting compatibility

Repo: `lab/gnome50-m2/`. Proposed full-screen violet/cyan starfield, 240 ambient stars, up to 24 constellation nodes, feedback effects and debug HUD.

Three concrete bugs:
1. `Clutter.Actor({can_focus:false})` invalid property (belongs to `St.Widget`, not Clutter.Actor).
2. `new Clutter.Canvas()` failed on GNOME 50 with **“Canvas is not a constructor.”**
3. Cleanup called `disconnect()` on already disposed GNOME `AuthPrompt` GObject, causing warnings.

Repairs:
- Remove invalid `can_focus` from Clutter.Actor.
- Switch to GNOME 50 **`St.DrawingArea`**, connect `repaint`, trigger `queue_repaint()`, release Cairo `cr.$dispose()`. This was the breakthrough in M2.2.
- Use lifecycle epoch guards for stale callbacks and avoid disconnecting disposed auth objects.
- Keep all visual actors non-reactive, behind native auth widgets. No keypress capture.
- Cap rendering at about 8 FPS to avoid excessive VM load.

**M2.2 was visually confirmed working** in actual VM screenshots: full-screen starfield + password-count constellation.

Relevant commits: `e525e52` (initial M2), `958be99` (invalid property/cleanup), `4e4fc64` (St.DrawingArea compatibility).

### 3.4 M3 — The Observatory

Repo: `lab/gnome50-m3/`, commit `b21b8cc89e37d3d01987d4848f606cff92a37f58`.

- ~426 stars in three depth layers, subtle twinkling/parallax, violet/cyan nebula fields.
- Schematic Orion on left, Cygnus on right, Cassiopeia at top.
- Smooth star illumination and fading; subtle cockpit typography/frame.
- Native GNOME clock/avatar/password interface still visible.
- Animations at about eight frames/sec.
- GNOME password buffer only; GNOME owns authentication.

**M3 was deployed and visually shown in screenshots**, despite old README text that says “not tested.” The user felt it still looked like a proof of concept, so work pivoted to a professionally sourced background with pixel-accurate star catalogues. M3 is not the final product.

Outstanding GNOME testing: successful unlock and teardown, repeated relocks, wrong password feedback, length decreases via Backspace, focus/IME/keyboard layout behavior, multi-monitor/screenscale, actual hidden-auth-widget UX, accessibility, backup/recovery, performance. Do not assert these are all complete merely because screenshots showed rendering.

### 3.5 Future GNOME integration constraints

User eventually wants no visible default GNOME auth UI. Hide its visual presentation ONLY while keeping native password input and focus, verification and lock security. Safe, visible recovery method needs design. Never patch GNOME verification, inspect plaintext password, or use global key logging.

**Success-animation lifecycle obstacle:** GNOME may destroy unlock dialog immediately after verified authentication. “Draw Orion for N seconds before unlocking” has NOT been demonstrated. First design offline character reveal; later investigate VM-only whether a safe GNOME-owned transition hook permits a brief animation. Do not weaken security or falsely promise a pre-unlock delay.

---

## 4. REPOSITORY, GIT AND TRUSTED DOCUMENTS

**Canonical repo:** https://github.com/ap0calypse644/Mellon  
**Verified v6 source commit as of 2026-11-09:** `dfab47f09759fd5f17947aba1327bab3364f0816`. The handover commit itself is newer.

Main organization:

~~~text
Mellon/
├── README.md                 # old original-extension docs, partly stale
├── extension.js              # original experimental implementation
├── install.sh                # DO NOT RUN on host
├── lab/
│   ├── gnome50-m1/           # length-detection HUD; verified
│   ├── gnome50-m2/           # St.DrawingArea GNOME 50 full-screen proof; verified
│   └── gnome50-m3/           # Observatory; visually verified
├── assets/
│   └── starfield/
│       ├── m24-original.jpg  # dense BENCHMARK image
│       ├── stars.json
│       ├── graph.json
│       └── corpus-v1/
│           ├── source/       # exact six user's Unsplash image originals
│           ├── catalogs/     # per-image star arrays and dimmed image
│           ├── summary.json
│           └── README.md
├── tools/
│   ├── starfield/            # image detection, coordinate transform & QA
│   └── constellations/       # v1–v6 algorithms, templates, docs
└── .github/workflows/        # source validation/build workflows
~~~

Key authoritative source documents:
- `tools/constellations/CENTERED_CONSTELLATIONS_V6.md` — current centered matching.
- `tools/constellations/SINGLE_CONSTELLATION_V5.md` — single-constellation large search.
- `tools/constellations/COMPOSITION_V4.md` — deprecated-for-product multi-scene packing.
- `tools/constellations/MATCHER_V3.md` — 31 geometric templates.
- `tools/constellations/README.md` — geometry license and original matching.
- `tools/starfield/README.md` — M24 benchmark provenance.
- `assets/starfield/corpus-v1/README.md` — exact six-image corpus and coordinate transforms.
- `lab/gnome50-m1/README.md`, `lab/gnome50-m2/README.md`, `lab/gnome50-m3/README.md` — VM prototype history.

Principal commits:
- `ff4bbc4` M1;
- `86a53df` GSettings deploy persistence;
- `e525e52` M2 initial;
- `958be99` M2 initialization/cleanup;
- `4e4fc64` GNOME 50 St.DrawingArea fix;
- `b21b8cc` M3 Observatory;
- `8c83854` M24 starfield atlas;
- `c9e8859` six-image corpus validation;
- `5a138ec` astronomical matcher v1;
- `ecea53d` brute-force multiple-match v2;
- `67c673f` 31 constellation v3;
- `af01e63` multi-constellation composition v4 (superseded);
- `c5ef90d` larger single-constellation v5;
- `dfab47f` centered, artwork-safe v6.

Links:
- https://github.com/ap0calypse644/Mellon/tree/main/tools/constellations
- https://github.com/ap0calypse644/Mellon/tree/main/assets/starfield/corpus-v1
- https://github.com/ap0calypse644/Mellon/tree/main/lab/gnome50-m3

**GitHub preference:** future assistant should make code and docs changes directly in repo, verify commit and file content, then provide a short user terminal `git pull --ff-only` command. No VM interaction for offline work.


---

## 5. STARFIELD IMAGES, DETECTION, TRANSFORMS AND LICENSING

### 5.1 NASA Messier 24 — huge benchmark, rejected for final visuals

The first online-selected background was NASA/ESA's **Hubble Messier 24 (Small Sagittarius Star Cloud)**:
https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-24/

Original extraction approximately:
- Source image 3775×2020.
- **20,491** detected luminous image features.
- **92,734** candidate local graph edges.
- Source image, SHA256, marked detection preview, star IDs/coordinates, graph, tooling, metadata in GitHub under `assets/starfield/` and `tools/starfield/`.
- Source image may be licensable under NASA/ESA media policy with appropriate attribution; document the exact selected asset and origin, never imply NASA endorses the project.

**User strongly rejected it as the final lock-screen image:** too bright, far too many stars, visually too busy. Retain only as detector stress/algorithm benchmark. The user explicitly clarified **internet images need not be real astronomical photos; professional digital art is equally acceptable.**

### 5.2 Six user-supplied Unsplash cosmic images — current benchmark corpus

The user uploaded six photographs and requested **all six be used** for wider sample coverage, even if only one or a few are later selected for production.

Source photographer descriptions and catalogue slug:

| Slug | Photographer / visual |
|---|---|
| `rosy-rosette` | Scott Lord, Rosette nebula |
| `blue-gold-nebula` | Beat Schuler, blue-gold / orange-blue nebula |
| `dust-cloud` | Arnaud Girault |
| `chromatic-nebula` | Aldebaran S |
| `veiled-ring` | Scott Lord, Veil nebula |
| `cosmic-wings` | Wallace Henry |

The Beat Schuler image was the first aesthetic favorite; the Veiled Ring often produced stronger geometric matching metrics, but **no final product background was locked in**.

All six sources are in the GitHub repo's `assets/starfield/corpus-v1/source/`, with processed data in `assets/starfield/corpus-v1/catalogs/`. Existence of both directories was checked from the GitHub Contents API on 2026-11-09.

### 5.3 Image-processing steps and quality rules

Pipeline:
1. Preserve exact source JPEG bytes and SHA256. The star catalogue is defined relative to this exact image, not a new web-resized copy.
2. Detect local luminous points in the untouched image. These are *candidate stars*; some could be bright nebula edges, noise, double stars, or image artifacts. Claim **measured image features**, not verified astronomical stars.
3. Record unique IDs, original pixel coordinates, confidence/quality characteristics and relevant source hash.
4. Rotate portrait image when necessary, crop to 16:9 center region, resample to **1920×1080** without distortive stretching.
5. Apply the **exact same transform** to every detected star coordinate, clipping those outside the final image.
6. Produce dimmed variant (initially **44% brightness**, a visual preference, not permanent). Dimming doesn't change coordinates.
7. Build normalized coordinates (x/width, y/height) linked to transformed image dimensions, and validate source pixel alignment.
8. Produce individual detection-marking QA images. Star coordinates should remain correct even if background is later tinted/dimmed.

Reported corpus totals:
- **70,136** isolated luminous point candidates across the six originals.
- **4,324** curated, widely distributed usable candidates across transformed images.
- **19,778** optional candidate graph connections.
- Approximate curated counts by source: Scott Lord Rosette 719; Beat Schuler 720; Arnaud Girault 716; Aldebaran S 733; Scott Lord Veil 712; Wallace Henry 724.
- These are **not** the limits on v2+ matching: modern search uses `stars-all.json` (all detected points aligned to the image crop), not just the ~700 curated points per image.

Directory contents expected for each catalogue:
~~~text
assets/starfield/corpus-v1/catalogs/<slug>/
├── stars-all.json
├── stars-curated.json
├── background-dim-16x9.jpg
├── metadata.json
└── [diagnostic image(s) and optional other derived files]
~~~

Actual metadata includes image dimensions, original source hash and transform fields such as rotation and source crop rectangle. Read actual JSON schema before consuming.

**Absolute invariant:** every selected constellation vertex must align to a real luminous feature in the exact 1920×1080 background displayed at runtime. Different screen aspect ratios/scaling/cropping require ONE consistent explicit image-to-display mapping applied to both background and vertex positions. Do not assume coordinates directly carry over to a newly cropped background.

Licensing: images by Scott Lord (two), Beat Schuler, Arnaud Girault, Aldebaran S, Wallace Henry, originally sourced via Unsplash. Before public release, verify exact photo page, photographer credit and current licensing terms at https://unsplash.com/license. Preserve attribution per source; do not indiscriminately treat every online image or artwork as CC0.

---

## 6. ASTRONOMICAL TEMPLATES — 31 RECOGNIZABLE CONSTELLATIONS

The user rejected early test images of arbitrary crown, spacecraft and five-point-star polygons as potential final content. For production matching, use reference geometries recognizable as real named constellations, even when composed of unrelated source-image stars.

**Source geometry:** d3-celestial / Olaf Frohn, `data/constellations.lines.json`, © 2015, **BSD-3-Clause**:
https://github.com/ofrohn/d3-celestial/blob/master/data/constellations.lines.json

License and copyright/disclaimer preserved in `tools/constellations/README.md`. The source celestial linework was locally projected into planar x/y reference points, normalized by its largest span; original shape topology retained. Not a real astronomical sky plate solution. A derived match merely selects new image pixels that resemble the constellation.

Important: original Orion reference contained awkward bow and club linework; user objected specifically. v2 introduced a nine-vertex *core Orion without bow/club*, and v3 preserved it. For the later illustrated Orion hunter, avoid blindly resurrecting rejected weird bow.

### Full template list

| ID | Shape | Reference vertices |
|---|---|---:|
| `Ori` | Orion core, no bow | 9 |
| `Cas` | Cassiopeia W | 5 |
| `UMa` | Ursa Major Big Dipper | 7 |
| `Cyg` | Cygnus | 9 |
| `Sco` | Scorpius | 14 |
| `And` | Andromeda | 17 |
| `Aqr` | Aquarius | 15 |
| `Aur` | Auriga | 9 |
| `Boo` | Boötes | 12 |
| `CMa` | Canis Major | 11 |
| `Cap` | Capricornus | 10 |
| `Car` | Carina | 17 |
| `Cen` | Centaurus | 16 |
| `Cep` | Cepheus | 10 |
| `Cet` | Cetus | 14 |
| `Crt` | Crater | 9 |
| `Dra` | Draco | 15 |
| `Eri` | Eridanus | 27 |
| `Gem` | Gemini | 12 |
| `Her` | Hercules | 17 |
| `Hya` | Hydra | 18 |
| `Leo` | Leo | 9 |
| `Lep` | Lepus | 11 |
| `Oph` | Ophiuchus | 16 |
| `Peg` | Pegasus | 14 |
| `Per` | Perseus | 23 |
| `Psc` | Pisces | 22 |
| `Sgr` | Sagittarius | 25 |
| `Tau` | Taurus | 12 |
| `Vir` | Virgo | 13 |
| `UMaF` | Full Ursa Major figure | 20 |

**29 of 31** have ≥9 vertices. `Cas` and `UMa` (the little dipper-shaped asterism familiar as Big Dipper) are preserved as iconic shorter exceptions. `UMaF` is distinct from seven-star `UMa`.

Reference template files:
- `tools/constellations/templates.json` — early small group.
- `tools/constellations/templates-v2.json` — five cleaned patterns including nine-vertex Orion.
- **`tools/constellations/templates-v3.json` — current 31-template source for v3–v6**.
- `tools/constellations/reference/constellations.lines.json` — credited original linework.
- `tools/constellations/template_gallery_v3.py` — reference-only pattern atlas.

Templates store normalized vertex coordinates and explicit edges. Edges must remain connected correctly, never assign one source-image star to two reference vertices.

---

## 7. CONSTELLATION MATCHING HISTORY — v1 THROUGH v6

### 7.1 v1: initial five-template matcher

File: `tools/constellations/match_constellations.py`  
First astronomy matcher commit: `5a138ece0134b49b63dc9d4ca6850b4a9e330f30`.

Tried randomized similarity transforms (translation, rotation and **uniform scaling only**), nearest star candidates from KD-tree, Hungarian/min-cost unique assignment, geometric RMS threshold. Mostly used smaller curated catalogues, kept one result per constellation/background. Early results ~10–24 px RMS, some poor orientation; Orion's weird bow looked wrong. Useful proof but not visually ready.

### 7.2 v2: multiple matches; more brute-force; no brightness preference

File: `tools/constellations/match_constellations_v2.py`  
Commit: `ecea53de8e051dc4bd20511be9fb92287ea85a97`.

- Switch to full catalogue `stars-all.json` with exact image crop transform.
- Batched KD-tree nearest searches across many randomized transformations.
- Correct unique-star assignment using Hungarian algorithm.
- Iterative rigid similarity / Procrustes refinement.
- Return multiple spatially distinct matches per constellation/image.
- Search geometry only: **star brightness deliberately ignored**.
- `--attempts N` = explore N sampled placements per constellation per image, not necessarily N expensive full Hungarian refinements.
- `--instances K` = keep at most K distinct matches per constellation/image, not number of images/stars.
- Typical smaller benchmark: 20,000 attempts and up to 12 instances found ~360 matches across 5×6 combinations; best RMS ~0.8–3.7 px.
- User executed **100,000 attempts, 20 instances** in full five-template benchmark; output 600/600 possible stored matches.

### 7.3 v3: 31-template catalogue

Files: `tools/constellations/match_constellations_v3.py`, `templates-v3.json`  
Commit: `67c673f7090303b08a8a4727261f105157182bdb`.

31 templates, 29 ≥9 stars; retains shorter Cassiopeia & Big Dipper. Added `--only`, `--min-stars`, `--list-templates`. Same full catalogue / brightness-independent match geometry.

User ran full **31 templates × 6 images × 100,000 attempts = 18.6 million proposal placements**, keeping up to 20 instances each.

**Actual result:** 3,653 matches / 3,720 theoretical (98.2%) across all 186 image/template combinations; median geometric RMS ~3.22 px; all structurally checked. Several combinations on Chromatic Nebula returned fewer than 20, not an algorithm failure.

Produced `~/VMs/Mellon/constellation-benchmark-v3-full/matches-v3.json` and QA overlays. Multiple constellations rendered together as an overview looked cluttered; the user later clarified that this wasn't a production concern.

### 7.4 v4: multi-constellation composition experiment — not production direction

Files: `tools/constellations/compose_constellations_v4.py` and `COMPOSITION_V4.md`.  
Commit: `af01e6368001fc570860fb88c2c2db61c23c95ef`.

Used v3 candidate matches to pack non-overlapping groups, e.g. 3 per scene. Generated 36 scenes / 108 placements; essentially no bounding-box overlaps. However, the user corrected the target: **ONE constellation per actual lock screen**. Therefore there is **no benefit** to rejecting overlapping **candidate** constellations. v4 is retained for QA/experiments only. Do not build future product selection around v4's packing/anti-overlap rule.

### 7.5 v5: big single-constellation search

Files: `tools/constellations/match_large_constellations_v5.py` and `SINGLE_CONSTELLATION_V5.md`.  
Commit: `c5ef90d5b7a3bb6d54425f162bcf9dfd564138b8`.

Changes:
- Exactly one displayed constellation per event; overlap among separately stored candidates allowed.
- Screen-aware maximum scale, rather than v3 fixed scale cap (around 620 px).
- Aggressive sampling favoring large patterns.
- No fixed output count: `--limit 0` retains all accepted unique candidates **within finite attempts/refinements**. There is still a dedup check to suppress near-identical transforms.
- No star brightness weighting.
- Individual QA images `<background>/qa/<constellation>/match-XXX.jpg` instead of tangled combined view.
- Screen-coverage score rewards large spans and bbox area after strict geometric fit.
- Orientation penalty to avoid ridiculous sideways Orion.
- Early smoke test with 3 templates over six images found approximately **1,997** distinct candidates; some near **95%** of one display dimension. User then explained why *nearly touching edges is bad*: needs room for character artwork.

### 7.6 v6: CENTERED MATCHES + CHARACTER-ART SAFE ENVELOPE — CURRENT

**Authoritative files:**
- `tools/constellations/match_centered_constellations_v6.py`
- `tools/constellations/verify_centered_matches_v6.py`
- `tools/constellations/CENTERED_CONSTELLATIONS_V6.md`

Commit: **`dfab47f09759fd5f17947aba1327bab3364f0816`**.

The v6 algorithm is a superset of v5's large single-instance matching with **two nested safety regions and measured bbox centering**:

- `--frame-margin 0.05`: an outer **5% fraction of width or height on every screen edge**, reserved even after illustration.
- `--figure-room-x 0.09`, `--figure-room-y 0.09`: extra **9% of each image dimension per side around the constellation bbox**, reserved for later character/figure artwork.
- Together these create a *star-safe rectangle*: all actual matched constellation stars must lie within **14%–86%** along both image dimensions.
- `--center-tolerance-x 0.13`, `--center-tolerance-y 0.13`: measured centroid of the **actual star bbox**, not arbitrary template origin, must be within ±13% screen width/height of midpoint.
- `--min-span 0.55`: selected constellation must span at least **55% of one** image dimension. This is max(widthFraction,heightFraction), **not screen area**.
- Theoretical maximum single-axis span with default margins: **72%**.
- `--rotation-limit-deg 35`: modest tilt allowed by default so a recognized constellation stays roughly conventionally oriented. Higher limits possible intentionally.
- `--attempts 100000` proposed transformations per constellation/image.
- `--refinements 1200` expensive unique-star assignment / Procrustes optimization on up to 1200 promising proposals per constellation/image.
- `--limit 0`: save all unique accepted placements from finite search, no arbitrary fixed N.
- `--qa-per-template 3`: render top three **separate** individual constellation previews per combination, without limiting stored JSON results.
- Brightness entirely ignored as a selection factor. All source detections eligible.

**Crucial fix:** after optimizing each proposal, the matcher checks the **ACTUAL assigned star positions** still satisfy the 14%..86% safe rectangle and center tolerance. Refinement can move candidates a little; do not accept mere template-bbox checks.

QA overlays:
- Cyan rectangle = star-safe region.
- Amber rectangle = *matched star bbox plus figure room*, a potential character-art bounding envelope.
- Small amber cross = actual matched bbox center.
- Cyan lines/nodes = measured image-star coordinates connected via known astronomical template edges.
- These debug guides must NOT appear in the final lock screen.

v6 JSON records source `star_ids`, normalized `vertices`, original `edges`, `rms_error_px`, `max_error_px`, `coverage.bbox_px` and spans, `center_offset_fraction`, `figure_room_px`, `figure_envelope_bbox_px`, a transform (angle/scale/center), rank score, status and run settings.

**The v6 envelope is only geometrical planning space.** It is not proof that an anatomically correct Orion illustration fits. The actual final SVG/path stroke extent and glow must be checked after fitting.

### 7.7 Full v6 benchmark — USER VERIFIED, DO NOT RERUN BY DEFAULT

Full command already executed on BlackPearl:

~~~bash
(
    set -euo pipefail

    cd "$HOME/go/src/ap0calypse644/Mellon"
    git -c core.hooksPath=/dev/null pull --ff-only origin main

    PYTHON="$HOME/.local/share/mellon-constellations-venv/bin/python"
    OUTPUT="$HOME/VMs/Mellon/constellation-benchmark-v6-centered"

    "$PYTHON" tools/constellations/match_centered_constellations_v6.py \
        --catalog all \
        --attempts 100000 \
        --refinements 1200 \
        --limit 0 \
        --min-span 0.55 \
        --frame-margin 0.05 \
        --figure-room-x 0.09 \
        --figure-room-y 0.09 \
        --center-tolerance-x 0.13 \
        --center-tolerance-y 0.13 \
        --rotation-limit-deg 35 \
        --qa-per-template 3 \
        --output "$OUTPUT"

    "$PYTHON" tools/constellations/verify_centered_matches_v6.py \
        --report "$OUTPUT/matches-v6.json"
)
~~~

The actual terminal run ended:

~~~text
Wrote /home/ap0calypse/VMs/Mellon/constellation-benchmark-v6-centered/matches-v6.json
PASS: 36349 candidate placements across 186 constellation/image combinations
PASS: Every selected star ID, coordinate, center and artwork clearance verified
~~~

**36,349 candidate matches!** 31×6 combinations, 18.6M transforms; average ~195 distinct valid placements for each template/image pair. Smallest count 73, largest 281. Best match per combination spans approximately **69.2%–71.9%** along its largest screen dimension, nearly the 72% upper bound. Reported median of best-match RMS errors ~**4.69 px**, slightly higher than v3 because v6 optimizes large centered placements rather than absolute minimum error alone.

Reported per-image distribution:

| Background | v6 valid placements | Median best RMS |
|---|---:|---:|
| blue-gold-nebula | 6,475 | 5.32 px |
| chromatic-nebula | 5,105 | 6.06 px |
| cosmic-wings | 6,106 | 4.58 px |
| dust-cloud | 6,382 | 4.40 px |
| rosy-rosette | 6,334 | 4.74 px |
| veiled-ring | 5,947 | 3.74 px |

The independent validator confirmed source star IDs, exact normalized coordinates, actual center offsets and safe figure envelopes. These numbers are **engineering/structural results**, NOT evidence that all 36,349 would be approved by a professional illustrator. The assistant previously couldn't inspect individual image previews from the uploaded v6 ZIP; **do not falsely claim full human visual approval**.

User supplied full run output as `Pasted text(20261109-104856).txt` and archive `constellation-benchmark-v6-centered.zip`. In the new conversation, if that ZIP cannot be retrieved, the original report remains on BlackPearl at `~/VMs/Mellon/constellation-benchmark-v6-centered/matches-v6.json`.

### 7.8 Computational and output interpretation

- `--attempts` is *per template per image*, so 100,000 × 31 × 6 = 18.6 million proposals. Not 18.6M full Hungarian assignments.
- `--refinements` budgets the expensive final minimizations.
- `--limit 0` removes a fixed *output count* cap; not an infinite search and not literally all mathematically possible star patterns.
- A detected luminous feature is not automatically a real astronomical star, and an RMS match of 2 pixels is not automatically an aesthetically beautiful constellation.
- Dedicated inspection of **the character's silhouette anchored to the constellation** is still required for v7.
- No need to prefer bright stars; close, dim detections work fine if their source-image coordinates validate.

---

## 8. WHAT HAS BEEN VALIDATED VS WHAT HAS NOT

**Proven from actual user screenshots/logs/commands:**
- Separate GNOME 50.1 VM is bootable, SSH accessible from BlackPearl, and has a verified baseline backup.
- M1: character count triggers star count without reading password plaintext.
- M2.2: GNOME 50 full-screen rendering works via `St.DrawingArea` and Cairo.
- M3: cosmic custom lock-screen render works in the VM (though aesthetically still POC).
- Source/crop/rotation/brightness pipeline exists in repo for all six images.
- 31 astronomical template geometries are available.
- Full v2, v3 and v6 matcher runs were reported by the user.
- v6 output validator passed **36,349** placements and **186** combinations.

**Not proven / still outstanding:**
- Professional artwork for Orion or any other constellation.
- Artwork SVG paths, anatomical anchor mapping, fitting validator, character stroke animation.
- Visual signoff of any individual matched constellation+character scene.
- Final lock-screen image or chosen licensing treatment for distribution.
- Runtime bundle with background, matched star IDs, figure paths and animation controls.
- Hiding all native GNOME unlock visual widgets safely while retaining underlying auth.
- Success-only pre-unlock character animation that doesn't bypass/delay native authentication unsafely.
- User-approved full host deployment (STRICTLY forbidden during current phase).
- Full password retry/failure/re-lock/idle/backspace focus accessibility and multi-monitor QA.
- Long-run memory/performance tests of the final asset pipeline in VM.

**When planning v7, do not mistake a report saying “36k structurally valid” for approved vector artwork. The next milestone is artistic visual excellence.**


---

## 9. V7 — PROFESSIONAL ORION CHARACTER ARTWORK (THE IMMEDIATE NEXT TASK)

### 9.1 Why v7 exists

We already have a huge, robust inventory of constellation candidates. More brute-force proposals do not address the user's highest priority: **make the lock-screen look professionally designed, not like a proof of concept**.

The intended transition is: a beautiful cosmic background; on password entry, existing faint stars light up and form a recognizable Orion pattern; on *confirmed* successful authentication, a refined mythological drawing of **Orion the Hunter** appears around and anatomically connected to that constellation. Eventually the native GNOME authentication widgets won't be visible, but GNOME must remain the actual verifier.

A proper character silhouette is more difficult than a constellation's simple lines. We must solve **fit, identity, anatomy, scene balance and animation**, not just pixel-nearest star matching.

### 9.2 Recommended first v7 deliverable (offline ONLY)

Deliver an **Orion artwork prototype** with:
- Professionally styled, editable vector illustration / layered linework (ideally SVG) of Orion, designed to be revealed by strokes.
- Mapping from the nine Orion core constellation vertices to meaningful anatomy/gear anchors.
- At least three candidate placements of this artwork on existing v6 Orion matches, preferably across two differing backgrounds.
- For each candidate: full-resolution clean 1920×1080 preview, technical QA preview with anchor labels and v6 safe-envelope boundaries, and a machine-readable art-fit record.
- An explicit automated **geometry validator** for all placed art paths/stroke bounding boxes and anchor residuals.
- Original-source / license information for any imported graphics and reproducible build scripts.
- A short, carefully designed animation storyboard or offline frame sequence after art quality is approved.
- GitHub code commit and a concise pull/render command. No need to deploy anything to VM for this milestone.

Do not render an ugly placeholder figure as though it were finished. The user previously rejected poor AI-looking wallpaper results and asked for professional-looking astronomy/space design. If external reference imagery is used, confirm it is reusable and honestly identify it. If an illustration is newly drawn, provide genuinely editable vector source where possible rather than claiming an image preview is editable SVG.

### 9.3 Start by checking v6 Orion matches

The existing candidates are in:

`~/VMs/Mellon/constellation-benchmark-v6-centered/matches-v6.json`

and stored separately in JSON per background/template. V6 usage is fully explained in `tools/constellations/CENTERED_CONSTELLATIONS_V6.md`.

Before writing selection code:
1. Inspect the actual output keys and v6 `images[slug]` / `matches["Ori"]` shape; don't guess nested JSON structure.
2. Load `tools/constellations/templates-v3.json` and study **`templates["Ori"]["points"]` and `edges`**, ensuring the exact nine-star reference and identifying visual landmarks.
3. For each image's v6 Orion candidates, compute screen span, bbox center offset, RMS and max residual, source star IDs, transformation angle, illustrated head/shoulder/belt/leg clearance, and nebula contrast near linework.
4. Pick a small diverse shortlist; the highest coverage ranking may NOT have the best anatomical art-fitting shape.
5. Verify each selected star ID is physically in `stars-all.json` after correct image transform; reject false positives when visually obvious.
6. Produce **one constellation per output image**. Do not combine all different constellations into a cluttered QA image.
7. Preserve original normalized image coords and pixels. The illustration is fitted to the stars, **never vice versa**.

Potential starting backgrounds: `blue-gold-nebula` (aesthetic favorite) and `veiled-ring` (often best geometric matching). Neither is permanently selected; try another image if visually superior.

### 9.4 Character art design considerations

**Orion anatomy and anchor concept (must verify exact indices in JSON):**
- Head above torso.
- Left/right shoulder with confident proportional silhouette.
- Three-star belt clearly defines waist orientation.
- Sword below belt if composition allows.
- Two feet/legs anchored in appropriate directions.
- Cloak/armor/tunic/weapon details can extend into reserved envelope, but do not create the weird/unrecognizable giant bow from the rejected first template.
- Astronomical dotted figure remains discoverable beneath the art; linework need not literalize every star as a joint.
- Familiar historical celestial atlases, tasteful ink engravings, restrained glowing etchings and cinematic line art are relevant stylistic directions. **Source art must have permission** (public domain, documented license, or original work).

**Do not simply stretch an SVG to fit an arbitrary template.** Good options:
- Rigid similarity fit (uniform scale, rotate, translate) of art anchors to star anchors; reject badly fitting matches.
- Anchor-assisted layout using a small number of controlled, semantic local path adjustments (only if anatomy retains natural proportions).
- Precompute a handful of approved “art-to-template variants” so multiple candidate matches can be used without stretching the body.
- A vector map with stable path ordering and named layers gives a much better basis for a future stroke reveal.

**Rendering hierarchy suggestion:**
1. Dimmed real/digital cosmic background (source image, exact aligned crop).
2. Very subtle native image stars.
3. Illuminated actual constellation stars and selected thin topology edges.
4. Character outline revealed as refined lines, with selective brighter accents.
5. Minimal soft glow and particles, preferably concentrated along drawing strokes; avoid filling the whole screen with neon.

### 9.5 Specific fit and safety measurements for v7

At 1920×1080 using v6 defaults:
- Outer permanent frame margin: **5% each edge** = 96 px horizontally / 54 px vertically.
- Reserve for figure beyond constellation bbox: **9% each side** = 172.8 px horizontally / 97.2 px vertically.
- Star-safe inner region: 14%–86% = x between **268.8 and 1651.2 px**, y between **151.2 and 928.8 px**.
- Constellation bbox center ±13% of screen dimensions: horizontal ±249.6 px from x=960; vertical ±140.4 px from y=540.
- Max possible **single-axis star span** at these settings: 72% of that axis.

**Caveat:** These calculations are width/height fractions, not equal radial distances in physical pixels. The planned figure envelope is an axis-aligned star bbox expanded separately in X and Y. It does not guarantee correct figure anatomy. Make the art fit actual vector bounds INCLUDING stroke width, glow/bloom and blur padding; verify no off-screen clipping. If an attractive figure cannot fit, choose another of the many v6 Orion candidates instead of relaxing all constraints without asking.

### 9.6 Suggested v7 data contract (proposal, not built)

Possible repository additions:

~~~text
assets/constellation-art/
    orion/
        orion-figure.svg                 # editable original vector
        anatomical-anchors.json          # named constellation-to-art anchors
        stroke-sequence.json             # path groups and order for animation
        PROVENANCE.md                    # license and attribution

tools/constellations/
    select_orion_art_candidates_v7.py    # choose viable source-star matches
    fit_orion_figure_v7.py               # fit artwork, reject distorted candidates
    render_orion_art_v7.py               # full-res clean previews + QA overlays
    verify_orion_figure_v7.py            # exact star IDs / anchor fit / bounds
    render_orion_strokes_v7.py           # optional later offline animation

Local output (not automatically committed):
~/VMs/Mellon/orion-artwork-v7/
    selected-placements.json
    fit-results.json
    previews/
    qa/
    animation-frames/
~~~

Example target records should keep:
- `background_slug`, source-image hash, precise transformed image dimensions.
- `constellation_id` = `Ori`.
- Stable candidate ID derived from actual source star IDs plus background identity (don't assume v6 already provides one).
- Original nine star IDs and actual normalized coordinates.
- Exact reference edges and reference/template version.
- Artwork SVG path and SHA256/creator/license.
- Art anchor names and mapping to constellation vertices.
- Fitted rigid transform (translation/rotation/uniform scale).
- Per-anchor residual errors, overall anchor RMS, candidate-quality score.
- Fitted art-path bounds (including stroke/glow), and invariant that figure is contained in v6 reserved envelope.
- Human QA status, with explicit pending/approved/rejected rather than treating all generated results as approved.

### 9.7 Offline animation plan — AFTER STILL ART LOOKS EXCELLENT

Potential success-only animation:
1. Last constellation star becomes fully illuminated as user finishes entering password.
2. Enter tells GNOME to verify **normally**; no “success” assertion before GNOME reports it.
3. On confirmed successful authentication, begin an elegant trace: glowing navigational lines / selected stars pulse, then head/shoulder/chest outlines, then arms/weapon, torso/cloak, legs, concluding with a subtle combined pulse.
4. Do not make the animation long or intrusive. Consider ~0.5–1.5 seconds as an aesthetic target, not a promise until technical lifecycle is solved.
5. Wrong password: brief dim/reversion, no character art/success reveal.
6. On relock: select anew, reset all count/timing/art states.

Develop **offline frames/GIF/video** first. A static single image is not evidence that stroke animation paths or timing are correct. The user should be able to inspect high-quality example animations without touching the VM.

### 9.8 GNOME success lifecycle — research required before promising

M1/M2/M3 have **not** established a mechanism for a guaranteed successful-login hold. GNOME 50's unlock dialog may be destroyed immediately upon auth success. Consider:
- Whether GNOME has a supported extension-safe way to show a noninteractive transition on screen after auth, without touching auth verification or allowing early desktop exposure.
- Whether a post-unlock, visually seamless fade overlay is safer than delaying the actual lock/unlock lifecycle.
- Whether a successful auth notification is exposed at the right moment in a non-secret interface.
- Whether a time-limited transition is acceptable to user even if it occurs *after* the secure unlock handoff rather than literally “before login.”
- Regression/recovery handling if animations fail, host sleeps, video mode changes, or Shell restarts.
- Do not hijack PAM, password submission, login session internals, or capture keystrokes for an animation.

This must be investigated inside `mellon-gnome50-lab` **after** offline artwork and animation approvals. Do not install experimental extension on the host.

### 9.9 Acceptance criteria for v7

v7 artwork is not complete unless:
- The Orion figure is actually recognizable without a label, with believable anatomy.
- Constellation belt/shoulders/head/legs line up to actual image stars.
- Individual star IDs, normalized coordinates and transformed background hashes all validate.
- Character illustration is high quality, not just a stickman, crude contour, or disconnected glyph.
- The entire finished art including glow has safe margins and no clipping.
- Multiple distinct Orion placement previews exist, each with ONE constellation.
- An author/credit/license is recorded for all source art.
- Artwork is editable enough to animate (prefer SVG path groups).
- Output includes clean presentation images and separate diagnostic QA, reproducible from GitHub code.
- User gets to see/approve the designs before VM work.
- No host/VM GNOME settings changed during v7 offline stage.

---

## 10. EVENTUAL v8+ PRODUCT INTEGRATION ROADMAP

### Phase A — art library expansion

Once Orion is good, apply framework to other recognizable templates—e.g. Scorpius, Cygnus, Leo, Sagittarius, Pegasus, Gemini, Taurus. Each mythological figure has different geometry and may require handcrafted illustration/anchor constraints. Avoid trying to auto-generate arbitrary humanoid art for every shape before Orion is solved.

### Phase B — candidate curation and runtime bundle

- The entire 36,349-candidate v6 dataset is ideal for offline search and QA, but a GNOME extension doesn't need to carry all candidates.
- Curate a small set of vetted matches per background/template and corresponding artwork assets. User requested **quality over quantity** at visual stage.
- Prepare compact runtime JSON or binary assets with file hashes, normalized coordinates, IDs/edges, timing, and authored artwork paths.
- Render background and illuminated image-aligned star positions using GNOME 50 `St.DrawingArea`, or a suitable proven efficient renderer.
- Respect aspect ratio changes (letterbox/cover/crop), UI scale, monitors, and the user-selected lock background; use single consistent image transform.

### Phase C — visible native auth UI removal (only in VM)

- On guest lock screen, hide visual GNOME clock/user avatar/password field if possible while leaving the native password widget alive, in focus, and safely handling all input.
- Do **not** read actual password string. Use `notify::length` on native buffer to drive the star progression.
- Reassess UI when auth prompt is lazily created or re-created, and on failure or session mode changes.
- Provide an emergency/escape mechanism that reveals the native password prompt if a renderer/input issue happens.
- Preserve accessibility, language/keyboard/IME compatibility as far as practical; test focus retention and screen readers.
- Make extension fail-open toward GNOME native secure prompt, not fail-locked into a broken UI.

### Phase D — actual character stroke animations + secure unlock timing

- Integrate offline-approved vector path sequence.
- Trigger only on confirmed native auth success, not merely Enter.
- Carefully test shell teardown/transition, no auth bypass, no leaking plaintext.
- Avoid expensive image processing while the screen is locked; matching is fully offline/precomputed.
- Measure CPU/memory/frames in the VM; avoid animations that cause fans to run constantly or introduce unnecessary login latency.

### Phase E — production readiness, host deployment (explicit future consent required)

Before touching BlackPearl lock screen, test in VM:
- Login success/failure, Backspace and replacement, Esc, empty password, repeated locks and unlocks.
- Keyboard focus retention, different layouts, paste/IME behavior as appropriate to GNOME.
- Incorrect passwords and delayed auth, sleep/resume, screen rotation, monitor disconnect, fractional scale.
- GNOME Shell crashes, extension disable/enable, guest reboot, GDM interactions.
- Security: never log password text, never intercept raw keystrokes, never modify PAM/credential flow.
- Failure recovery through guest SSH/TTY and restore baseline.
- User-approved production appearance, path license, maintainable source tree and a host recovery strategy.
- Host installation and auto-lock policy only after user asks explicitly. **Current instruction: do not install on BlackPearl.**

---

## 11. RESUME COMMANDS, LOCATION AND TROUBLESHOOTING

### 11.1 Update local repository

~~~bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    git -c core.hooksPath=/dev/null pull --ff-only origin main
    git log -1 --oneline
)
~~~

### 11.2 Inspect available v6 results and Orion template, without re-running search

~~~bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    PYTHON="$HOME/.local/share/mellon-constellations-venv/bin/python"
    V6="$HOME/VMs/Mellon/constellation-benchmark-v6-centered/matches-v6.json"
    test -f "$V6"
    "$PYTHON" - "$V6" <<'PY'
import json, sys
from pathlib import Path

data = json.loads(Path(sys.argv[1]).read_text())
print("Schema:", data.get("schema"))
for image, block in data["images"].items():
    ori = block["matches"].get("Ori", [])
    print(f"{image:<22} Orion candidate count: {len(ori)}")
    if ori:
        print("  best match:", json.dumps({
            k: ori[0].get(k) for k in
            ["rms_error_px", "max_error_px", "coverage",
             "center_offset_fraction", "figure_envelope_bbox_px"]
        }, indent=2))
templates = json.loads(Path("tools/constellations/templates-v3.json").read_text())
print("Orion reference:", json.dumps(templates["templates"]["Ori"], indent=2))
PY
)
~~~

This command is intended as a quick read-only first inspect. No secrets. The future assistant can inspect individual actual stars and image files once available.

### 11.3 Re-run independent validator (read-only; generated files unchanged)

~~~bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    PYTHON="$HOME/.local/share/mellon-constellations-venv/bin/python"
    "$PYTHON" tools/constellations/verify_centered_matches_v6.py \
        --report "$HOME/VMs/Mellon/constellation-benchmark-v6-centered/matches-v6.json"
)
~~~

Expected based on last executed full run:

~~~text
PASS: 36349 candidate placements across 186 constellation/image combinations
PASS: Every selected star ID, coordinate, center and artwork clearance verified
~~~

If output differs, inspect actual dataset or new code changes before assuming previous values remain valid.

### 11.4 Trouble patterns already encountered

- Git pull error after host reboot? VM status irrelevant to offline work; don't start VM for matcher/illustration tasks.
- `ssh mellon: No route to host` → VM shut off or DHCP IP changed; check `virsh domstate` and leases.
- `ssh: Permission denied` → guest Unix account is `test1`, not `mellon`.
- Guest extension shows INITIALIZED during desktop → it may be unlock-session-only; lock VM and check errors.
- `enabled-extensions = []` after deploy → use fixed GSettings sync/independent session verification.
- `Clutter.Canvas is not a constructor` → use GNOME 50 `St.DrawingArea` and Cairo.
- disposed auth object warning → avoid GObject signal disconnect after disposal; epoch guards.
- Looking at constellation sets together yields spaghetti lines → test **single constellation per image**.
- User sees weird Orion bow → use v2/v3 nine-point Orion core, not older elaborate atlas polygon.
- Big constellation almost clips screen → use v6 centered / reserved art envelope, not v5 maximum-edge preview.
- Very faint stars should still be usable → `--catalog all`, no brightness ranking.

---

## 12. REFERENCES, PROVENANCE AND LINKS

**Project:** https://github.com/ap0calypse644/Mellon  
**v6 source commit:** https://github.com/ap0calypse644/Mellon/commit/dfab47f09759fd5f17947aba1327bab3364f0816  
**v6 matcher:** https://github.com/ap0calypse644/Mellon/blob/main/tools/constellations/match_centered_constellations_v6.py  
**v6 verifier:** https://github.com/ap0calypse644/Mellon/blob/main/tools/constellations/verify_centered_matches_v6.py  
**v6 notes:** https://github.com/ap0calypse644/Mellon/blob/main/tools/constellations/CENTERED_CONSTELLATIONS_V6.md  
**v3 template collection:** https://github.com/ap0calypse644/Mellon/blob/main/tools/constellations/templates-v3.json  
**d3-celestial source linework:** https://github.com/ofrohn/d3-celestial/blob/master/data/constellations.lines.json  
**Six-image source and catalogue:** https://github.com/ap0calypse644/Mellon/tree/main/assets/starfield/corpus-v1  
**Six-image corpus notes:** https://github.com/ap0calypse644/Mellon/blob/main/assets/starfield/corpus-v1/README.md  
**Last VM Observatory prototype:** https://github.com/ap0calypse644/Mellon/tree/main/lab/gnome50-m3  
**Working GNOME 50 Cairo path:** https://github.com/ap0calypse644/Mellon/tree/main/lab/gnome50-m2  
**NASA M24:** https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-24/  
**Unsplash licensing:** https://unsplash.com/license

**Files user generated on BlackPearl:**
- `~/VMs/Mellon/constellation-benchmark-v2/` (v2)
- `~/VMs/Mellon/constellation-benchmark-v3-full/matches-v3.json` (v3)
- `~/VMs/Mellon/constellation-benchmark-v6-centered/matches-v6.json` (v6, current)
- `~/VMs/Mellon/checkpoints/MELLON-BASELINE-001/` (verified VM baseline)

**Previous chat uploads:** `constellation-benchmark-v2.zip`, `constellation-benchmark-v3-full.zip`, `constellation-benchmark-v6-centered.zip` and respective terminal logs. The current handover documents the useful numerical results so a new chat does not need the entire ZIP until it needs the actual Orion coordinates.

---

## 13. DECISIONS THAT MUST NOT BE LOST

1. One constellation per lock. No v4 collision packing for product.
2. Large, mostly centered, with meaningful space for full character art around stars.
3. The star IDs/coordinates must exist in the displayed source image; astronomical pattern shape is a separate template.
4. Star brightness never excludes a candidate. Screens can show very faint stellar points.
5. Six uploaded images are benchmark sources; not all need appear in final product. M24 remains a technical stress image, not production wallpaper.
6. Source backgrounds must be internet-sourced real photos or professional digital art with appropriate licensing; do not improvise low-quality generated wallpaper.
7. Current best matches already computed in v6, with 36,349 validated candidates.
8. Accuracy score alone doesn't guarantee recognized, beautiful illustration.
9. Orion nine-star core excludes previously disliked bow/club shape.
10. Professional mythological hunter illustration, not stickman, is the next big goal.
11. Illustration transform must not deform anatomy; reject bad candidates.
12. Reserve 5% permanent outer margin, 9% art allowance around star bbox, ±13% centering tolerance.
13. GNOME native auth verification remains intact; ultimately only its VISUAL UI should disappear.
14. Modern GNOME integration observes password buffer **length** only; never text or key events.
15. A guaranteed post-success/pre-unlock animation is **not yet proven**; don't promise until researched/tested.
16. Host GNOME must remain untouched until user specifically approves deployment.
17. User wants changes pushed to GitHub and pulled locally.
18. User terminal is Zsh; all paste-ready scripts wrapped `( ... )`; disable Git hooks on pulls where possible.
19. Work is **offline-first** at the v7 artistic stage; don't drag the user back into VM troubleshooting.
20. User was frustrated by multiple previous “analysis errored” attempts on this handover; preserve it as a persistent GitHub file and avoid repeat tool-dependent temporary artifacts.

---

## 14. EXACT NEW CHAT STARTING INSTRUCTION

The next assistant can begin with this framing:

> Continue Mellon from the project handover. We are starting v7. First design and fit **professional, aesthetically convincing Orion figure artwork** to the real star coordinates in selected v6 Orion matches. Work offline in the Mellon repository, prepare several clean 1920×1080 previews plus QA with art-safe margins, validate the geometry, and commit source assets/scripts directly to GitHub. **Do not run the 18.6M search again, do not touch the VM or host GNOME, and do not replace GNOME's actual authentication.**

**Project completion status at this handover:**
- Completed: isolated VM, baseline, M1/M2/M3 visual proofs, 6-image corpus, M24 stress test, 31 reference templates, v1–v6 matchers, v6 **36,349** validated candidates.
- Not completed: professional figure art, actual Orion fit, stroke animation, hidden native GNOME unlock UI, secure success transition, production runtime bundle, user-approved host deployment.

**End — Comprehensive Mellon handover, 2026-11-09.**
