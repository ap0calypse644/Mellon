# Mellon Greeter G0 — GNOME 50.1 login-screen feasibility

**Goal:** bring the approved Mellon Observatory to GDM's *pre-login*
greeter, as well as the existing GNOME `unlock-dialog` scene.

GNOME GDM is **not** the same process or account as the logged-in user's
lock-screen GNOME Shell. Merely adding `gdm` to the existing user's
`metadata.json` does not install/enable it as a greeter extension.

## Immediate step (READ ONLY)

From BlackPearl's shell:

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    git -c core.hooksPath=/dev/null pull --ff-only origin main
    bash lab/gnome50-gdm/audit-guest-greeter.sh
)
```

Paste the output into the conversation. The audit checks only the test VM's
OS/GDM/GNOME versions, greeter process/account, session modes, service state,
system-extension locations, and *non-secret* greeter settings. It does NOT
run sudo, restart GDM, modify dconf, create a snapshot, enable an extension,
write to either OS, or touch BlackPearl's login/lock screen.

## Proposed phases

- **G0:** Verify actual Ubuntu 26.04.1 / GNOME 50.1 greeter environment,
  account, mode and extension activation mechanism; preserve an isolated VM
  checkpoint before any greeter modification.
- **G1:** Separate system-scoped `mellon-greeter@local` plugin with a
  `gdm` session mode, **backdrop + static constellation + HUD**. Reuse
  common rendering modules only. Mount visuals behind the ORIGINAL GNOME
  login user-selector and password fields, not on top of a hidden prompt.
- **G2:** Reuse existing M7/M8 visual state with an audited greeter-specific
  read-only signal adapter. Never capture password strings, inject keys,
  replace GDM's verifier, handle PAM, or simulate successful login.
- **G3:** Reuse M8.3.2's translucent 5-second sweep, accessibility/contrast
  and predictable actor/timer cleanup; no synchronous photo work on login.
- **G4:** Test boot/log-out/switch-user/reboot, display-scale changes,
  missing assets, unsupported GDM APIs, corrupted config and recovery
  from console or VM snapshot. Only then consider release packaging.

## Non-negotiable constraints

- **Only the `mellon-gnome50-lab` VM may be changed**, after a fresh,
  restorable checkpoint and a verified SSH/TUI recovery path.
- Do not patch `gnome-shell` source, GDM executables or theme gresources.
  Prefer an isolated greeter system extension (if confirmed workable).
- Do not touch PAM, GDM authentication, user lists, keyboard focus or
  password entries; native GDM must stay immediately usable.
- The greeter runs in a different security context. Assets must be
  separately installed under a system-owned, read-only location, without
  exposing private user files or requiring access to a user's home.
- The approved **M8.3.2 user lock screen remains unchanged** during GDM
  development. BlackPearl host installation is NOT authorized.
