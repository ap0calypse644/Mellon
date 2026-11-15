# Troubleshooting

**Priority order:** keep a usable native login, avoid destructive commands, read diagnostics, then change code. Mellon runs in GNOME Shell's login/lock process; a quick hack can strand the graphical session.

## Quick symptom guide

| Symptom | Likely cause | First safe action |
| --- | --- | --- |
| `Extension “mellon-lab@local” does not exist` immediately after copying files | Current Wayland GNOME Shell session hasn't discovered the new user extension yet | Check installed path/metadata; start a **new login session** when recovery is ready |
| Ubuntu logo or native account card flashes briefly | GDM startup/chooser may run before Mellon mounts, or GDM is on a different version | Check whether G1.8 is installed and active; do not edit vendor greeter assets |
| Native login UI stays visible on password entry | Cover did not activate, startup script is stale, or GNOME internals changed | Verify extension version, logs, and show native controls; debug in VM |
| `SHOW LOGIN` missing | Recovery actor wasn't mounted or another fullscreen widget is above it | Use native TTY fallback, inspect GNOME actor diagnostics in VM |
| 5-second grid stops after first scan / resize | Timer was canceled by an older build or unhandled allocation | Check installed M8.4/G1.8 source; don't restart host GDM |
| Stars don't align with photo | Background cropped/resized differently from vertices/sprites | Rebuild scene pack and validate `coverTransform` |
| Some scene is blank | Missing sprite/photo or malformed `library.json` | Verify manifest checksums and required asset paths |
| `UNAUTHORIZED ACCESS` doesn't show | GNOME private `_failCounter` has changed or no recognized verifier exists | Verify GNOME version and keep native auth, don't infer failure from submit |
| Initial single-user handoff loops / fails | Native user roster not stable or chooser private APIs changed | Fall back to native GDM and test chooser adapter in VM |
| GDM fails entirely after deployment | Incompatible GDM version/config, broken extension code or missing assets | **TTY → rollback → reboot** |

## Read-only checks

From a working desktop session, adapt paths as needed:

```bash
(
    set -euo pipefail
    echo '== Versions =='
    gnome-shell --version
    dpkg-query -W -f='${Package} ${Version}\n' gdm3 2>/dev/null || true

    echo '== User extension =='
    EXT="$HOME/.local/share/gnome-shell/extensions/mellon-lab@local"
    test -f "$EXT/metadata.json" && cat "$EXT/metadata.json"
    gnome-extensions list 2>/dev/null || true

    echo '== GDM extension =='
    SYS=/usr/share/gnome-shell/extensions/mellon-greeter@local
    test -f "$SYS/metadata.json" && cat "$SYS/metadata.json"

    echo '== Enabled user extensions =='
    gsettings get org.gnome.shell enabled-extensions

    echo '== GDM service =='
    systemctl is-active display-manager.service || true
)
```

These commands don't change the session. Avoid copying all `/proc/.../environ` or `journalctl` logs publicly without reviewing them: they may reveal local paths, user names or credentials.

### Look for extension errors

```bash
(
    journalctl --user -b --no-pager |
      grep -Ei 'mellon|gnome-shell|extension' |
      tail -n 100
)
```

For system GDM, system journal access may require `sudo`:

```bash
(
    sudo journalctl -b -u display-manager.service --no-pager -n 100
)
```

GDM-specific GNOME Shell exceptions may be logged separately from the service unit. Use `sudo journalctl -b --no-pager | grep -i mellon` if necessary; **redact before sharing**.

## New extension not found in Wayland session

Copying a user extension directory does not force an already-running GNOME Shell to rescan and load it. Don't use `Alt+F2 → r` as a Wayland restart workaround; it is not supported the same way as an X11 GNOME session. If metadata/UUID/path are correct, plan a normal log-out/log-in **only after verifying the TTY escape route**.

If a host-installed extension still doesn't appear in the enabled list, use GNOME's own settings to add the correct UUID; don't overwrite the full list of other extensions. The BlackPearl host setup may already include several unrelated enabled extensions that must be preserved.

## Stale/corrupt photo asset

Manifest verification for a staged pack:

```bash
(
    set -euo pipefail
    PACK="$HOME/VMs/Mellon/m6-curated-12-v1"
    .venv-mellon/bin/python lab/gnome50-m6/verify-pilot-pack.py \
      --pack "$PACK"
)
```

Use whichever Python environment actually contains Pillow/NumPy; the path above is only the **newcomer example**. The verifier checks image SHA256, scene count, sprites, 26×26 RGBA and provenance, not just JSON syntax.

## Broken GDM / no GUI login

**Do not troubleshoot through the broken GUI.** Switch to a text console (`Ctrl+Alt+F3`), log in, and use the rollback established by *your* installation.

On the original BlackPearl install:

```bash
(
    set -euo pipefail
    sudo /usr/local/sbin/mellon-blackpearl-rollback
    sudo reboot
)
```

The script only exists if the BlackPearl-specific installer completed far enough to publish it. On another machine or a manually installed fork, use your own reviewed backup/rollback procedure. If the TTY is unavailable, boot into a system recovery shell using your distro's documented procedure.

## Debugging with the VM

`lab/gnome50-gdm/test-g16b-chooser.mjs` exercises account roster changes, cancellations, the startup curtain, and fallback. `lab/gnome50-gdm/test-g16a-cover.mjs` checks native password cover behavior. `lab/gnome50-m8/test-intro-runtime.mjs` checks timer restarts and cleanup.

If your GNOME version is not 50.1, first audit the upstream definitions of `LoginDialog`, `AuthPrompt`, `PasswordEntry`, `screenShield`, and `_userVerifier` for that exact version; the source relies on private fields. Only then change code and test runtime behavior in a guest.

Need help making your version portable? Start with [Architecture](ARCHITECTURE.md), [Components](COMPONENTS.md), and [Deployment](DEPLOYMENT.md), not with replacing the production extension in place.
