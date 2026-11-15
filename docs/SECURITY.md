# Security & privacy model

Mellon is **not an authentication mechanism**. It is a visual layer inside GNOME Shell. This distinction is the most important architectural rule in the repo.

## What Mellon can observe

| Data | Lock screen | GDM | Why |
| --- | --- | --- | --- |
| Current native password-buffer **length** | Yes | Yes, only on recognized PasswordEntry | Illuminate a matching number of source stars |
| Currently active *visual* star mask | Yes | Yes | Draw lines, HUD segments, completion |
| Scene metadata / original photographic coordinates | Yes | Yes | Render the correct photo and sprites |
| Native verifier's failed-attempt **counter** | Yes | Yes | Show `UNAUTHORIZED ACCESS` feedback |
| GNOME native user-list items | Not applicable | Yes | Show account choices and emit GNOME's native `activate` event |
| Actual password text / passphrase / key identity | **No** | **No** | Never needed |
| PAM replies or verification result | **No** | **No** | GNOME owns authentication |
| System-wide keyboard events | **No** | **No** | Not needed |
| Submitted passwords or input timing history in logs | **No** | **No** | Avoid credential exposure |

All input-driven effects are derived from a transient scalar **length** and a visual mask of already-detected stars. A length change doesn't reveal which key was typed. It **can** reveal approximate password length to someone physically watching the screen. The design does **not** claim to hide the number of entered characters from shoulder surfing. GNOME's native password-entry visuals can also reveal length differently; using Mellon is a personal UI preference, not enhanced credential secrecy.

The eight-stage visual completion is **not proof of successful authentication**. The user can still have an incorrect password when the full constellation glows.

## Trusted component boundaries

**GNOME Shell / GDM / PAM** handle secrets, focus, sessions and unlock. Mellon only displays an overlay and, on GDM, triggers the *same native account activation* a direct account click would trigger.

**SHOW LOGIN** reveals the native underlying account/password UI. It is not a bypass, emergency account, or alternative credential path; it simply exposes GNOME controls that were never removed.

**FailureTracker** reads the private GNOME Shell `_failCounter` field. It does not inspect entered text. If GNOME changes the verifier internals, the right response is to **fail open** rather than fake a failure signal or trap the user behind a decorative screen.

## The real risk: login availability

GNOME extensions run inside GNOME Shell, a privileged part of the UX even when they don't run as root. An invalid import, crashed paint callback, unavailable asset, or reactive fullscreen actor can still prevent a user from accessing the graphical login.

This repository therefore uses:
- VM tests before host installation;
- bounded initialization and native-dialog rebind timers;
- non-reactive photo/canvas/HUD actors (except deliberate buttons);
- explicit native fallback for unknown prompts/user roster state;
- asset validation (12 scenes, 8–24 stars, expected image/sprite paths);
- separate user unlock and system GDM extension directories;
- independent, boot/TTY-accessible rollback scripts;
- original GDM config preservation / refusal to overwrite unknown admin state;
- no automatic display-manager restart in the installer.

**These protections reduce risk but don't certify the extension safe on other GNOME versions.** Even the validated BlackPearl configuration could be affected by future GNOME updates or distro changes.

## Rules for any code contribution

1. **Never** access `PasswordEntry.text`, `get_text()`, PAM secrets, raw keycodes or global input event streams.
2. Do not modify GNOME's verifier state to "force" a visual success or failure.
3. Do not remove SHOW LOGIN or make an unrecognized native challenge permanently invisible.
4. Keep the username/OTP/password distinction in the GDM observer.
5. Keep GDM account selection on GNOME's native `activate` signal.
6. Balance every timer and GObject signal with a safe destroy/disconnect path.
7. Verify on GNOME 50.1 in a VM and demonstrate a working rollback from outside the graphical shell.
8. Don't attach real credentials, SSH keys, private logs, or sensitive account screenshots to issues.

## Dependency and repository hygiene

The original project contains downloaded/third-party images, a Go matcher, Python image tools, and GJS. Treat all scripts and new dependencies as code execution. Inspect Git hooks when cloning third-party repositories; prefer secure, reviewed sources. Do not restore credentials or executable state from an untrusted VM snapshot.

If you find a sensitive issue, follow [the vulnerability reporting instructions](../SECURITY.md) instead of opening a public exploit report.

## What Mellon deliberately doesn't do

- Strengthen, weaken or replace your password authentication.
- Claim the visual pattern is a cryptographic proof of access.
- Read secret key material to build the constellation.
- Offer network accounts, remote unlock, or a second password database.
- Guarantee portability across GNOME Shell releases.
