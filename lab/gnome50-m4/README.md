# Mellon M4 — real-star constellation MVP (GNOME 50 VM ONLY)

**Goal:** replace the M3 synthetic procedural sky and three schematic constellations with exactly **one real background and one real, pixel-matched Orion core**. Keep native GNOME authentication visible and fully operational during this safety-validation milestone. Illustrated mythological figures, invented stars, speculative success animations, and manual UI hiding are **not included**.

## What works in source / what is still untested

The included scene uses the **existing blue-gold nebula 1920x1080 dimmed image**, immutable detected source-star IDs and the 9-point Orion core from `templates-v3.json`. The original v6 candidate is index 6 (zero-based), rotation 1.12 degrees, geometric RMS 4.5622 px and about 70.8% of the screen height. All nine IDs are verified independently against the source's exact crop and resize coordinates.

Rendering: `St.Widget` shows the existing photo as a CSS cover/center image; `St.DrawingArea` paints only the nine activated stars and connections as the native password buffer length changes. Passwords >9 characters keep all nine lit. Backspace reverses progression. No continuous idle rendering loop: the ~8 FPS repaint timer runs only while energies are changing or a brief failure flash is active. The source follows M2/M3's native signal/lifecycle approach.

**Not yet validated in the GNOME VM:** installation, background-loading API/CSS behavior, native entry focus, repeat retries, actual unlock/relock, hidpi, monitor changes, and failure fallback. Do not call M4 a tested lock screen until the user captures and validates guest screenshots. **Never install on BlackPearl.**

## VM-only deploy, on BlackPearl

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    git -c core.hooksPath=/dev/null pull --ff-only origin main
    bash lab/gnome50-m4/deploy-from-blackpearl.sh
)
```

The deploy script validates the existing v6 report, source star IDs, image checksum, and VM identity/version; checks the verified VM baseline exists; copies files **only** into the guest through `ssh mellon` / `scp`; independently verifies guest file hashes; then enables `mellon-lab@local` in the **guest**. The GNOME session needs a guest-only reboot for the new extension code to load:

```bash
(
    virsh -c qemu:///system reboot mellon-gnome50-lab
)
```

Test in the guest: 0 / 3 / 6 / 9 typed characters, Backspace, wrong password, correct password unlock, re-lock. A native password field and GNOME clock/avatar may still be visible; this is **intentional** until the secure hidden-UI follow-up.

To render offline still previews (requires Pillow installed in the existing constellation Python venv):

```bash
(
    cd "$HOME/go/src/ap0calypse644/Mellon"
    "$HOME/.local/share/mellon-constellations-venv/bin/python" \
        tools/mvp/render_preview.py --output "$HOME/VMs/Mellon/m4-preview"
)
```

Guest journal: `ssh mellon 'journalctl --user -b --no-pager -o cat | grep -Ei "Mellon M4|JS ERROR" | tail -n 60'`.

### Emergency guest recovery

```bash
(
    ssh mellon 'rm -f ~/.local/share/gnome-shell/extensions/mellon-lab@local/metadata.json'
    virsh -c qemu:///system reboot mellon-gnome50-lab
)
```

This intentionally leaves the native prompt functional even if Mellon fails. Don't change or intercept authentication, do not access the actual password contents, and do not perform this deployment on the host.

### Next steps toward the true MVP

1. **Confirm live M4 guest rendering and reliable native authentication.**
2. Build *VM-only, fail-open visual suppression* of native clock/avatar/password chrome while preserving a hidden focused prompt, a visible recovery path, wrong-password messaging and accessibility. Never ship a hidden prompt until independently verified.
3. Curate a few tested constellation/background pairs and select one per new lock. Keep every illuminated node aligned using the same crop/cover transform.
4. Investigate secure auth-success transition only after the functional MVP. Character artwork/animation remains a **later version**.
