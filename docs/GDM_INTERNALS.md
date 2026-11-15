# The GNOME 50 GDM adapter

This is Mellon's riskiest code. **GNOME GDM has private implementation details, not a stable external theme API.** G1.8 was tested against GNOME Shell 50.1; a newer version requires a source and runtime audit.

## Entry-point lifecycle

`lab/gnome50-gdm/greeter-extension/extension.js` runs only when `Main.sessionMode.currentMode === 'gdm'`.

1. Loads and validates the full scene library and every source-image/sprite file.
2. Waits for `Main.screenShield._dialog` and `_lockDialogGroup` with bounded 350 ms / 90-attempt search.
3. Inserts **non-reactive** photo, `GreeterStarfield`, and `ObservatoryHUD` actors into the existing GNOME group, initially below native `LoginDialog`.
4. Constructs `GreeterPasswordCover`, `GreeterLengthObserver`, and `GreeterAccountChooser`.
5. Synchronizes native state every 250 ms, with bounded reattachment if GNOME replaces the dialog (120 ticks).
6. Removes GLib sources, signals and Mellon actors in `_unmount()`; native auth remains GNOME-owned.

The background scene is retained through normal GDM dialog recreation; it should not visibly jump to another photo at each prompt transition.

## Account selection vs password entry

`GreeterAccountChooser` reads GNOME's already-loaded `_userList._items` Map—not `/etc/passwd` or a separate account backend. Its **ESTABLISHING UPLINK** curtain covers initial GDM loading (max 32×250 ms ≈8 s). One eligible account is selected through GNOME's own `item.emit('activate')` after five stable ticks (~1.25 s). Two to eight users get themed buttons emitting those same native signals. Unsupported, empty, disabled or oversized rosters fall back to native GDM. This is **account selection, never automatic login**.

`GreeterPasswordCover` masks only an identifiable native password prompt:

- the `LoginDialog` still has the expected parent;
- the native user-selection box is hidden;
- `AuthPrompt` is visible;
- `_passwordEntry` exists;
- the active `_entry` is exactly the password entry.

Username or OTP prompts must be exposed natively. A known password prompt is displayed with this actor stack:

```text
FRONT
  UNAUTHORIZED ACCESS (only when GNOME reports failed auth)
  SHOW LOGIN (interactive)
  Observatory HUD (non-reactive)
  Source-star sprites / connections (non-reactive)
  Photographic background (non-reactive)
  GNOME native LoginDialog (still holds password focus and verification)
BACK
```

`SHOW LOGIN` immediately reveals the native entry and keeps it exposed for the remainder of that prompt; Mellon must not automatically hide a recovered interface again.

## Credential boundary

`GreeterLengthObserver` uses `clutter_text.get_buffer().get_length()` only when `AuthPrompt._entry === AuthPrompt._passwordEntry`. It subscribes to `notify::length`, disconnects old signal IDs, and never requests password text or key symbols.

`GreeterPasswordCover.observeFailure()` reads the verifier's `_failCounter` through `FailureTracker`, flashes a 1.5-second **UNAUTHORIZED ACCESS** label, then permits retries. It never sends a PAM response, claims a successful password, or changes the verifier.

## If you're porting to a different GNOME

Read **that version's** upstream `js/ui/screenShield.js`, `js/gdm/loginDialog.js`, `js/gdm/authPrompt.js` and native password-entry implementation. Then verify in a disposable VM:

- GDM special session modes and system-extension discovery;
- parent/child actor ordering methods;
- user list/activation events;
- username vs password vs alternate challenge detection;
- native password focus under the non-reactive cover;
- recovery-button visibility and keyboard accessibility;
- verifier failure counter meaning;
- timer/signal disposal on logout, reparent and exceptions.

If any assumption changes, **fail open to native GDM** instead of guessing. Never restart the real display manager just to test a speculative fix.

## Tests

```bash
(
    set -euo pipefail
    node lab/gnome50-gdm/test-g14-length.mjs
    node lab/gnome50-gdm/test-g16a-cover.mjs
    node lab/gnome50-gdm/test-g16b-chooser.mjs
    node lab/gnome50-gdm/test-g1-runtime.mjs
)
```

These are synthetic GNOME actor tests; actual GDM UX requires an isolated VM.
