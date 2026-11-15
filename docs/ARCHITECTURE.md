# How Mellon works

**M9:** A single GNOME authentication session now owns **independent clipped visual viewports on each monitor**. See [Multi-monitor internals](MULTI_MONITOR.md) for actor trees, mixed scaling and the compositor scan.

Mellon is **two GNOME Shell extensions sharing one visual language**. It does not replace the display manager, the system password entry, or the authentication service.

## The two GNOME sessions

| | Lock screen (M9) | GDM greeter (M9) |
| --- | --- | --- |
| GNOME session mode | `unlock-dialog` | `gdm` |
| Extension UUID | `mellon-lab@local` | `mellon-greeter@local` |
| Typical installed path | `~/.local/share/gnome-shell/extensions/` | `/usr/share/gnome-shell/extensions/` |
| GNOME owns | PasswordEntry, unlock flow, session | LoginDialog, user/session selection, AuthPrompt, verifier |
| Mellon owns | One photo/canvas/stars/HUD per GNOME logical monitor | One `GreeterVisuals` group with one clipped viewport per monitor; primary-only account selector |
| Exit hatch | SHOW LOGIN reveals native unlock | SHOW LOGIN reveals native account/password controls |
| Error handling | Fall back to native UI | Bounded init/rebind, fail-open to native GDM |

The GDM extension must be installed system-wide because it runs in the special `gdm` session; copying the user extension into a system directory is **not** a substitute. The lock and greeter are distinct actor trees with different private GNOME internals.

## Data flow: password input is not authentication

```text
                 ┌──────────────────────────────────────────────┐
                 │ GNOME native PasswordEntry / AuthPrompt       │
                 │ password text & verification remain here       │
                 └─────────────────────────┬────────────────────┘
                                           │ read ONLY get_length()
                                           ▼
                            scene-data.activationCount()
                                           │ target # of source stars
                                           ▼
                            scene-data.updateActiveStars()
                                           │ Uint8Array 0/1 visual mask
                ┌──────────────────────────┼──────────────────────────┐
                ▼                          ▼                          ▼
      source-colored sprites      activeEdges()              mappingStage()
      and glow envelopes          (both endpoints lit)       → mappingReadout()
                │                          │                          │
                └──────────────────────────┴───────────────┬──────────┘
                                                           ▼
                                                  ObservatoryHUD
                                                  + animation engine
```

**Never cross this boundary:** input **length** is enough to drive a decoration. Neither extension should request password content, intercept global key events, reproduce key codes, implement PAM, or decide whether authentication succeeded. A visual `CONSTELLATION MAPPED` means all eight *visual stages* are lit—not that GNOME approved the password.

On a wrong password, `failure-tracker.js` observes GNOME's private verifier failure **counter** to trigger `UNAUTHORIZED ACCESS`. It does not inspect the secret or attempt count history outside the session. GNOME still controls retries.

## Actor/layer model

### Unlock-dialog

`extension.js` mounts a photographic `St.Widget`, a `St.DrawingArea` for lines, and photographic 26×26 star sprites over the native GNOME lock-dialog actors. The visible entry is covered, **not removed**; GNOME retains focus and authentication ownership. A separately reactive `SHOW LOGIN` button can reveal native UI.

The `ObservatoryHUD` creates four corner instruments. `ObservatoryIntro` paints the transparent scanning grid. Optional panels are suppressed below the safe viewport threshold; the recovery button should remain reachable.

### GDM

`greeter-extension/extension.js` finds `Main.screenShield._dialog` and `_lockDialogGroup` under the GNOME 50 `gdm` session. It mounts a photo, `GreeterStarfield`, and `ObservatoryHUD` into the group.

- **Early account initialization:** `GreeterAccountChooser` brings Mellon's photo/HUD above the native dialog while waiting for user records, with an eight-second fallback.
- **One user:** the chooser emits GNOME's own `UserListItem` `activate` signal after a short stable-list interval. It is **account selection**, never autologin.
- **Multiple users:** reactive Mellon `St.Button` tiles activate the corresponding GNOME items. Unsupported or oversized lists fall back to native selection.
- **Password entry:** `GreeterPasswordCover` masks GNOME's visible password prompt while the native entry keeps focus; SHOW LOGIN unmasks it. Username, OTP, and unexpected challenges fail open.

## Scene model

A deployed `library.json` uses `mellon-m6-scene-library-v1` with **exactly 12 scenes across six backgrounds**. Every scene describes a real background image, original-source luminous feature IDs, 8–24 normalized vertex coordinates, edges, and per-vertex RGB-preserving sprites. The compiled scene pack is **not included as a ready-to-install directory in Git**. The source corpus and offline tooling are; the vetted pack is assembled locally.

`coverTransform(w, h, W, H)` aligns image features with CSS `background-size: cover`. Re-cropping without recomputing coordinates produces visible star/line drift. See [Scenes & assets](SCENES_AND_ASSETS.md).

## Time and lifecycle

| Subsystem | Scheduling and cleanup |
| --- | --- |
| Lock input observer | 250 ms controller poll; `notify::length` disconnection and epoch invalidation when prompt changes |
| GDM length observer | Buffer signal plus 250 ms bounded lifecycle poll, null/alternate prompt resets |
| GDM initial dialog search | 350 ms retry, max 90 attempts; rebind limited to 120 ticks |
| Star/effect frames | 62 ms only while ignition, edge animation, completion or warning needs frames |
| Stage pulse | 560 ms envelope driven by existing frame updates, **no new timer** |
| Observatory grid | Repeats every 5,000 ms; 50 ms temporary repaint source for each 1.85-second sweep |
| HUD clock | 60-second update and clean teardown |
| Access-denied text | Bounded flashing state; no permanent animated loop |

On `destroy()` or reattachment, timers must be removed, signals disconnected (where safe), actors destroyed, and references invalidated. Backspace and failure resets must not leave scaled HUD segments or lit lines behind.

## Shared vs intentionally different modules

The lock and GDM builds are separate because GNOME's session trees differ. `scene-data.js`, `stellar-effects.js`, `failure-tracker.js`, `hud-state.js`, `hud-progress.js`, and `hud-intro-state.js` are **identical source copies** and protected by parity tests.

`hud-layout.js`, `observatory-hud.js`, `observatory-intro.js`, `stylesheet.css`, and the entrypoint adapters have intentional context differences (GDM recovery/control placement and startup). Do **not** force-copy them to achieve parity.

## The trust boundary for development

An extension runs *inside* GNOME Shell. A broken visual actor can affect login availability even if it never touches PAM. All changes should go: **pure tests → VM → failure/recovery test → explicit host installation**. See [Security](SECURITY.md) and [Deployment](DEPLOYMENT.md).
