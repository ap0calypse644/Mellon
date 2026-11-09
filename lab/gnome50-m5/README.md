# Mellon M5 — visual-only hidden-chrome MVP

**VM-only prototype.** User-confirmed on GNOME 50.1: visual cover, hidden input with successful native unlock, manual `SHOW LOGIN` recovery, and the M5.2 failed-attempt observer. M5.3's centered glowing alert and M5.4's manual-only recovery behavior still need guest verification. M4 remains a known-good fallback.

## Scope

M4's actual background, nine star IDs and image coordinates, constellation edges, low-power drawing engine, native password-length observation, and password verification are preserved unchanged. M5 draws the same image/stars *above* GNOME's original clock, avatar and password-field visuals. These are **not removed or hidden**—they remain in the unlock dialog under a non-reactive visual cover. No raw keystrokes, plaintext passwords, PAM changes, or success-animation hooks are introduced.

**Safety mechanisms:** the visible `SHOW LOGIN` button at top left manually reveals the untouched GNOME login screen and asks GNOME to focus its native password entry. **Wrong-password attempts never automatically reveal native login** (M5.4). Every detected failed attempt instead shows the large centered blinking red **UNAUTHORIZED ACCESS** warning for about 1.5 seconds. Separately, on an extension error or missing verifier API, Mellon fails open toward the native prompt so the guest cannot be stranded behind an inoperable cover. Emergency recovery also remains available via guest SSH and the M4 backup. Never install this version on the host.

## Deploy on BlackPearl, targeting only the test VM

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    git -c core.hooksPath=/dev/null pull --ff-only origin main
    bash lab/gnome50-m5/deploy-from-blackpearl.sh
)
```

The script requires the verified VM baseline, original v6 match report, GNOME 50.1 guest identity, and matching image/scene checksums. It **does not** install on the host or reboot the VM. Restart the *guest* GNOME session or reboot only `mellon-gnome50-lab` after staging.

To lock the guest, from the host:

```bash
(
    virsh -c qemu:///system send-key mellon-gnome50-lab KEY_LEFTMETA KEY_L
)
```

**Test sequence:** (1) Lock guest and confirm clock/avatar/password chrome is covered, while `SHOW LOGIN` is visible. (2) Without clicking, type 3 characters and verify exactly 3 stars illuminate; Backspace dims one. (3) Enter an incorrect password and verify GNOME denies it while the scene shows failure feedback. (4) Click `SHOW LOGIN` and ensure the native GNOME field is visible, focused and usable. (5) Unlock, relock and verify reset. (6) Test two consecutive wrong passwords to trigger automatic recovery. (7) Test 9+ chars, Escape and scaling changes.

**If anything is inaccessible:** The test VM is reachable by SSH. To restore the already-working M4 code, run `bash lab/gnome50-m4/deploy-from-blackpearl.sh` from BlackPearl and restart the **guest**. To disable Mellon in the guest, use `ssh mellon 'gnome-extensions disable mellon-lab@local'`. If locked, the existing emergency removal of the guest extension metadata followed by a guest-only reboot is another recovery route. Do not change host GNOME.

**Not yet validated:** actual M5 UI occlusion, click handler, native focus preservation, wrong-password feedback after multiple attempts, accessibility/IME, multimonitor, or GNOME lifecycle. M4 screenshot and authentication success do not establish M5 success.

## M5.2: read-only per-attempt failure counter observer (2026-11-09)

**Why:** The original M5 `AuthPrompt.failed` event reports terminal resets,
not ordinary retries. M5.1 subscribed to the verifier's
`verification-failed` EventEmitter signal, but user testing confirmed it
still produced neither first-failure feedback nor second-failure recovery.
The host/VM source hashes matched, and the extension was enabled, so this
was not a deployment mismatch. The runtime reason that the M5.1 listener
didn't fire remains unconfirmed.

GNOME 50's `ShellUserVerifier._onConversationStopped()` increments
`_failCounter` for each failed foreground authentication conversation, even
when more attempts are allowed. M5.2 **only reads** that count in the existing
250ms UI poll. It never modifies GNOME's counter, the authentication service,
password widgets, focus, PAM, or success path.

- `failure-tracker.js` is a pure, testable observer. It tracks the identity
  of GNOME's verifier and its last observed failure count. It emits at most
  the difference in *new* failures; repeated polls aren't counted twice.
  A GNOME counter reset isn't treated as a new failure.
- The per-lock `MVPScene` still owns the two-strikes recovery threshold; its
  count survives prompt/buffer recreation and resets on a new lock.
- If GNOME stops exposing an integer `_failCounter`, the extension reveals
  native login rather than rendering an inaccessible hidden prompt.
- **No failure counts, password lengths, input timing, text, or user-provided
  credentials are logged or persisted.**
- This intentionally depends on a GNOME **private** API and must be tested
  on the exact 50.1 guest; it is not ready for BlackPearl host installation.

### Regression tests (host-only, no VM changes)

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    node lab/gnome50-m5/test-failure-tracker.mjs
)
```

If Node is not installed, this optional check can be skipped; the functional
test is in the VM, not on BlackPearl.

### Historical M5.2 VM verification (superseded by M5.4 for native-UI reveal)

1. Deploy using `bash lab/gnome50-m5/deploy-from-blackpearl.sh`. This checks
   `failure-tracker.js` too. Restart **only the guest** GNOME session.
2. Lock the guest, enter a wrong password and press Enter. Confirm the
   scene dims and the first-failure message appears.
3. After GNOME accepts input again, enter a second wrong password. Confirm
   native login automatically appears without clicking SHOW LOGIN.
4. Unlock correctly, relock and check that the original hidden interface
   and independent two-attempt counter are restored.
5. Confirm SHOW LOGIN still works manually.

If any check fails, use SHOW LOGIN. The VM remains accessible via SSH and
the M4 fallback is unchanged. Do not install this prototype on the host.
**M5.2 automatic recovery was subsequently confirmed working by the user in the GNOME 50.1 VM.**

No artistic Orion figure or post-authentication animation is included.

## M5.3: centered glowing alert (2026-11-09)

This is a **visual-only follow-up** to the user-verified M5.2 authentication flow.

- Replaces the small top-left failure message with the exact text
  **UNAUTHORIZED ACCESS**, positioned at the **center of the lock screen**
  through a GNOME 50 `Clutter.AlignConstraint` with `AlignAxis.BOTH`.
- Styles the message as a large vivid-red title with soft red
  `text-shadow`, a restrained dark translucent panel, border and glow.
- On *each* failed password (M5.4), blinks for approximately 1.5 seconds
  using the existing eight-frame-per-second animation timer; does not
  start any new timer or idle animation loop.
- M5.4 removes the earlier two-strikes automatic recovery. **Every** failed attempt
  keeps the themed lock screen visible until SHOW LOGIN is clicked.
- The alert actor remains non-reactive, never takes keyboard focus and
  is hidden immediately when Mellon reveals the native login.
- No background, star coordinates, GNOME authentication, failure-count
  observer, password tracking, or recovery logic changes.

**Guest QA:** Lock the VM; enter one wrong password, inspect the
large center-screen blinking red message (not the top left); verify the
alert disappears; enter a second wrong password and confirm that the
native login **does not appear**. Then click SHOW LOGIN, unlock correctly
and relock.
If any native login difficulty occurs, click SHOW LOGIN or roll back to
M4. Do not install on the BlackPearl host.

**M5.3 source/syntax verified; live guest visual behavior awaits testing.**

## M5.4: manual-only native login reveal (2026-11-09)

**Requested behavior:** incorrect passwords must **never** trigger the native
login reveal solely because of how many incorrect attempts have occurred.
The visually hidden GNOME password entry continues accepting retries under
the cosmic background, and the centered `UNAUTHORIZED ACCESS` alert flashes
after **every** failed attempt, including the second and third.

The change removes `MVPScene._failures` and the `>= 2` call to
`revealNative()`. It **does not change** the working M5.2 read-only
`FailureTracker`, the M5.3 centered alert, the non-reactive visual cover,
the visible `SHOW LOGIN` button, native focus or GNOME's own authentication
failure policy.

**Intentional safety distinction:** user-triggered SHOW LOGIN is the normal
way to expose the native interface. An extension failure or unsupported
GNOME verifier API still fails open and can reveal the underlying login UI,
independent of failed-password counts. This safeguards access when a GNOME
update breaks the private failure observer.

**VM acceptance check:** lock VM, submit three incorrect passwords, confirm
the large red alert appears after each and native GNOME UI never appears
automatically. Click SHOW LOGIN and verify native entry becomes available;
unlock correctly, relock and confirm the clean cover is restored. Do not
install on BlackPearl until a future explicit release approval.

**M5.4 syntax/source verified; live guest behavior awaits testing.**
