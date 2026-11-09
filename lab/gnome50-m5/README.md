# Mellon M5 — visual-only hidden-chrome MVP

**VM-only prototype.** User-confirmed on GNOME 50.1: visual cover, hidden input with successful native unlock, and manual `SHOW LOGIN` recovery. Automatic recovery after two incorrect passwords **failed in the initial M5 build** and has been patched in M5.1; the fix still requires guest confirmation. M4 remains the known-good fallback.

## Scope

M4's actual background, nine star IDs and image coordinates, constellation edges, low-power drawing engine, native password-length observation, and password verification are preserved unchanged. M5 draws the same image/stars *above* GNOME's original clock, avatar and password-field visuals. These are **not removed or hidden**—they remain in the unlock dialog under a non-reactive visual cover. No raw keystrokes, plaintext passwords, PAM changes, or success-animation hooks are introduced.

**Safety mechanisms:** a small visible `SHOW LOGIN` button at the top left reveals the untouched GNOME login screen and calls GNOME's own `UnlockDialog.activate()` to focus the real password entry. After two failed authentications in one lock cycle, the overlay automatically reveals GNOME. The first failure shows an explicit message and brief red constellation fade. On an extension error, M5 tears down the cover; the original prompt can remain usable. Recovery is also available via the guest's SSH, and the deploy script backs up the previous extension before copying files.

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

## M5.1: per-attempt failure detection fix (2026-11-09)

The original M5 connected to `AuthPrompt.failed`. In GNOME 50,
`AuthPrompt._onVerificationFailed(serviceName, canRetry)` keeps the prompt in
the verification flow when GNOME allows another try; `AuthPrompt.failed`
fires only during `reset()` after a **terminal** failure. Thus ordinary
incorrect passwords were not counted, and recovery did not occur.

M5.1 listens to the GNOME-owned `prompt._userVerifier` EventEmitter's
`verification-failed` signal, which fires on **each** authentication failure.
Only the `gdm-password` service is counted (not fingerprint/smartcard).
`connectObject(..., prompt)` ties the signal handler to the prompt lifetime;
the existing epoch guard ignores stale callbacks. The failure total remains
on the same per-lock `MVPScene`, even when GNOME recreates its auth prompt.
If the verifier API is unavailable, Mellon reveals native UI rather than
risking an unreachable login.

This change observes a success/failure event only; it **does not** read
passwords, intercept keys, log attempt counts, alter GNOME verification, or
change the well-tested rendering and manual recovery paths.

**Guest verification for M5.1:** after deploying and restarting only the VM's
GNOME session, lock the VM; enter one incorrect password and verify the brief
error message; enter a second incorrect password and confirm the native prompt
appears automatically. Then unlock correctly, relock, and confirm the counter
resets. If behavior differs, preserve access with `SHOW LOGIN` and investigate
GNOME's session journal without logging credential data.

No artistic Orion figure or post-authentication animation is included.
