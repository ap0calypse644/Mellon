# Mellon

Experimental GNOME Shell unlock-dialog extension that replaces the visible unlock UI with a starfield.

## What it does

- Draws a full-screen starfield on the GNOME unlock screen.
- Hides the native password prompt visually without removing GNOME authentication.
- Brightens one random star for anonymous keypress activity.
- Shows a submit pulse on Enter.
- Shows a failure pulse when GNOME reports auth failure.
- Attempts to delay unlock teardown briefly and form a constellation on success if the current GNOME Shell version exposes a known finish method.

## Security model

Mellon does not authenticate. GNOME Shell/GDM/PAM still owns authentication.

Mellon does not intentionally log or store passwords. It reacts to anonymous keypress activity and always propagates the event back to GNOME. It does not inspect the password-entry text.

This is for personal experimentation. Do not publish it to extensions.gnome.org without reworking it to match GNOME's unlock-dialog review rules.

## Install

```bash
./install.sh
```

Then log out and log back in. Lock with `Super+L`.

## Disable from normal session

```bash
gnome-extensions disable mellon@nibir.local
```

## Emergency disable from TTY

Press `Ctrl+Alt+F3`, log in, then run:

```bash
gnome-extensions disable mellon@nibir.local
rm -rf ~/.local/share/gnome-shell/extensions/mellon@nibir.local
```

Then return to the GUI with `Ctrl+Alt+F2` or reboot.

## Debug

```bash
./dev-logs.sh
```

Useful version check:

```bash
gnome-shell --version
```

## Known rough edges

GNOME Shell's lock screen internals are private APIs. The `_authPrompt`, `_stack`, and unlock finish method names may shift across GNOME versions. This is why the extension has fallbacks and why the first target should be your exact Ubuntu/GNOME version.

## Mellon 2.0 / GNOME 50 lab

An isolated, VM-only prototype lives in [`lab/gnome50-m1/`](lab/gnome50-m1/README.md). It observes changes to GNOME's native password buffer **length**, without global key event capture or replacing authentication. The original extension above is preserved unchanged. The lab README has deployment and rollback commands.

### M3: The Observatory (GNOME 50 VM lab)

The first cinematic milestone is under [`lab/gnome50-m3/`](lab/gnome50-m3/README.md): layered deep-space scenery, Orion/Cygnus/Cassiopeia constellation formation and a subtle cockpit readout. It uses GNOME 50's `St.DrawingArea` and the native password buffer's **character count**; GNOME authentication and the original extension stay untouched. **VM-only; runtime validation still required.**
