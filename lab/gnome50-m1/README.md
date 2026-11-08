# Mellon 2.0 — M1 (GNOME 50 lab)

This milestone is an **experimental, VM-only** integration probe. It does not replace the original `mellon@nibir.local` implementation at repository root.

## Behavior

- Displays a compact violet/cyan star HUD in the native GNOME 50 unlock dialog.
- Observes **only changes in character count** on GNOME's existing password text buffer (`notify::length`).
- A character added illuminates a star; deletion extinguishes a star (24-star visual cap).
- Shows anonymous submit/failure status through GNOME auth prompt signals.
- Does **not** intercept keypresses, read password contents, hide the password prompt, authenticate, or patch unlock methods.
- Works only in extension session mode `unlock-dialog`.

Password length and timing are still sensitive metadata. The extension never logs these values. GNOME private API compatibility is **not verified until tested inside the VM**.

## Environment

BlackPearl host runs Ubuntu 26.04.1 GNOME 50.1 Wayland. Lab guest is `mellon-gnome50-lab`, user `test1`, reachable through the host's `ssh mellon` alias. A verified offline baseline exists at `~/VMs/Mellon/checkpoints/MELLON-BASELINE-001/`.

## Deploy (BlackPearl terminal)

```bash
git pull --ff-only
bash lab/gnome50-m1/deploy-from-blackpearl.sh
virsh -c qemu:///system reboot mellon-gnome50-lab
```

Run the commands from the Mellon repository root. On the guest, log in and lock with `Super+L`; type into the native password prompt. The HUD should reflect added and removed characters without compromising native authentication.

## Recover without touching BlackPearl GNOME

```bash
ssh mellon 'rm -f ~/.local/share/gnome-shell/extensions/mellon-lab@local/metadata.json'
virsh -c qemu:///system reboot mellon-gnome50-lab
```

This is an emergency disable, not the final uninstaller; it intentionally leaves the guest copy and configuration for later diagnosis. Restore the verified VM baseline if guest GNOME becomes unusable.

## Next after M1 passes

Replace the static stars with the Violet Horizon cockpit starfield, design animations, and keep security and GNOME lifecycle testing in the VM.
