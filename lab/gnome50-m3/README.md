# Mellon M3 — The Observatory

**Status: source complete; needs runtime testing on the Mellon GNOME 50.1 VM.**

The Observatory is the first cinematic iteration of Mellon's GNOME lock-screen visuals. The host BlackPearl GNOME installation is **never** modified. The prior M2 rendering implementation remains in `lab/gnome50-m2/`.

## Visual direction

- Deep-indigo observatory backdrop with four subtly drifting violet/cyan nebula fields.
- Three layers of tiny stars (426 total), with gentle parallax, color variation and twinkling. The center is deliberately quieter to protect GNOME's avatar, clock, and password prompt.
- **Three schematic recognizable star patterns:** Orion (left), Cygnus / Northern Cross (right), Cassiopeia (top). They light up in that order as native password character count grows, capped at 24 nodes. Constellation edges never span the central password field.
- Illumination ramps up quickly; Backspace causes a gradual fade. No global key listeners.
- A thin flight-deck corner frame and minimal typographic status text replace M2's debug panel.
- Submit pulses and brief failure tint. Native GNOME controls, validation, success timing and authentication remain entirely owned by GNOME.

The patterns are illustrative constellation silhouettes, **not an astronomically accurate star chart**. Neither password characters nor length/timing metadata are logged, but character count remains sensitive metadata internally. Each lock-session visual state is destroyed on GNOME session teardown.

Rendering uses **`St.DrawingArea` and Cairo**, validated by M2.2 on GNOME 50.1. The paint loop is limited to 8 FPS to control VM CPU usage. No image assets or other software dependencies.

## Deploy from BlackPearl

Run from the checked-out Mellon repository on **BlackPearl**:

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    git -c core.hooksPath=/dev/null pull --ff-only origin main
    bash lab/gnome50-m3/deploy-from-blackpearl.sh
    virsh -c qemu:///system reboot mellon-gnome50-lab
)
```

Log into the guest's desktop after the reboot, then lock it from BlackPearl:

```bash
(
    virsh -c qemu:///system send-key \
        mellon-gnome50-lab KEY_LEFTMETA KEY_L
)
```

The guest SSH alias `mellon` refers to the VM's `test1` user. `Super+L` typed on the *host* can lock BlackPearl, so use libvirt `send-key` instead.

## Guest-only rollback

If M3 errors or fails visually, pull no other code. From the repository root on BlackPearl:

```bash
(
    set -euo pipefail
    bash lab/gnome50-m2/deploy-from-blackpearl.sh
    virsh -c qemu:///system reboot mellon-gnome50-lab
)
```

**SSH emergency disable** (if GNOME's guest lock screen becomes unusable):

```bash
(
    ssh mellon 'rm -f ~/.local/share/gnome-shell/extensions/mellon-lab@local/metadata.json'
    virsh -c qemu:///system reboot mellon-gnome50-lab
)
```

A verified powered-off baseline is stored on BlackPearl under `~/VMs/Mellon/checkpoints/MELLON-BASELINE-001/`. Do not deploy this extension on the host until stability and recovery testing are complete.

## Architecture notes

- `session-modes` is strictly `unlock-dialog`; normal desktop sessions don't run this extension.
- Auth prompt is created lazily. The extension observes `Main.screenShield._dialog._authPrompt._passwordEntry.clutter_text.get_buffer()` only while available.
- `notify::length` is the only input-derived signal. `next`/`failed` are GNOME prompt status signals.
- GObject signal callbacks carry a lifecycle epoch guard; the extension never disconnects an already-disposed auth actor.
- We intentionally do **not** delay successful unlock, patch authentication methods, read password text, or trap keystrokes.

## Quick test

Check: (1) starfield + typography on clock screen, (2) Orion nodes illuminate one by one when typing, (3) Backspace fades nodes, (4) native password still unlocks, (5) no `[Mellon M3]` errors in the guest GNOME journal.
