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

