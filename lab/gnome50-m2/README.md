# Mellon 2.0 / M2 — Nightwatch

Experimental GNOME Shell 50.1 / Ubuntu 26.04 VM-only constellation display. The verified M1 implementation remains in `../gnome50-m1/`.

## Features

- Full-screen violet/cyan starfield, 240 ambient stars, navigation grid and nebula glow.
- Up to 24 constellation nodes brighten and connect as characters enter the native GNOME password field; deletion removes them.
- Verification ripple on Enter and a brief failure tint when authentication fails.
- Non-interactive canvas behind the native GNOME authentication prompt.
- No global keyboard hooks, no password text reads, no authentication patching, and no host GNOME installation.
- Animated canvas limited to 8 frames per second to moderate VM load.

Password character count and typing timing remain sensitive metadata, but neither is logged. GNOME private API compatibility is unverified until tested inside the VM.

## Deploy from BlackPearl

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    git -c core.hooksPath=/dev/null pull --ff-only origin main
    bash lab/gnome50-m2/deploy-from-blackpearl.sh
    virsh -c qemu:///system reboot mellon-gnome50-lab
)
```

Log into the guest desktop, then lock it from BlackPearl with:

```bash
(
    virsh -c qemu:///system send-key mellon-gnome50-lab KEY_LEFTMETA KEY_L
)
```

## Emergency disable

```bash
(
    ssh mellon 'rm -f ~/.local/share/gnome-shell/extensions/mellon-lab@local/metadata.json'
    virsh -c qemu:///system reboot mellon-gnome50-lab
)
```

The clean guest backup is at `~/VMs/Mellon/checkpoints/MELLON-BASELINE-001/` on BlackPearl. The M1 code is preserved in Git.
