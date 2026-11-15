# Development and testing

Mellon was built in small milestones with a **VM-first, recoverable** workflow. The repository still contains those milestone sources and many narrowly targeted tests. For new changes, use this page to keep the system testable instead of accumulating another chain of ad-hoc fixes.

## Working in the repo

The current code is **G1.8 GDM** and **M8.4 unlock-dialog**.

```text
README.md                            newcomer entry point
docs/                                current guides
lab/gnome50-m8/                      current lock screen
lab/gnome50-gdm/greeter-extension/    current GDM greeter
lab/blackpearl-host/                 machine-specific first-install scripts
lab/gnome50-m{1..7}/                historical lock milestones
lab/gnome50-gdm/G1*.md               historical greeter milestone notes
tools/                                offline image, matching, QA pipelines
assets/                               photographic/catalog data and art experiments
.github/workflows/                    synthetic tests and offline asset workflows
```

**Don't modify the root `extension.js` expecting to change the live GDM.** That's the old experimental `mellon@nibir.local` build. See [History](HISTORY.md).

## Prerequisites

- A recent Node.js with ESM support for pure JS and synthetic GNOME mocks.
- Python 3 and Pillow/NumPy for image generation and validation.
- Go for `tools/constellations/quality-v9/`.
- Git, Bash, `sha256sum`; `jq` helps inspect JSON.
- GNOME Shell 50.1 plus GDM 50.x in an **isolated VM** for integration tests.

The CI jobs run pure helpers with Node; they **cannot reproduce GDM focus, GTK/GJS allocation or a real display manager**. A green check is a starting point, not a guarantee the login screen remains usable.

## Fast local test loop

From repository root:

```bash
(
    set -euo pipefail

    echo '== M8.4 visuals and lifecycle =='
    node lab/gnome50-m8/test-mapping.mjs
    node lab/gnome50-m8/test-stellar-effects.mjs
    node lab/gnome50-m8/test-hud.mjs
    node lab/gnome50-m8/test-intro.mjs
    node lab/gnome50-m8/test-intro-runtime.mjs
    node lab/gnome50-m8/test-m8-regression.mjs

    echo '== GDM account / password adapters =='
    node lab/gnome50-gdm/test-g14-length.mjs
    node lab/gnome50-gdm/test-g16a-cover.mjs
    node lab/gnome50-gdm/test-g16b-chooser.mjs

    echo '== Shared parity / latest HUD / deployment guards =='
    node lab/gnome50-gdm/test-g17-parity-performance.mjs
    node lab/gnome50-gdm/test-g18-hud-runtime.mjs
    node lab/gnome50-gdm/test-g18-deploy.mjs
    node lab/blackpearl-host/test-host-deployment.mjs
)
```

To check GJS module syntax without requiring GNOME:

```bash
(
    set -euo pipefail
    for dir in lab/gnome50-m8 lab/gnome50-gdm/greeter-extension; do
        for script in "$dir"/*.js; do
            node --input-type=module --check < "$script"
        done
    done
)
```

**Node can parse these files but cannot execute `gi://` imports.** Runtime behavior must be tested in GJS/GNOME.

The CI workflows include additional legacy milestone tests; when changing a shared helper, run them too. See the files under [`.github/workflows/`](../.github/workflows/mellon-gdm-audit-checks.yml) and [M8 workflow](../.github/workflows/mellon-m8-checks.yml).

## Pure logic is your friend

Keep behavior that does not require GNOME in pure modules:

- Scene/activation functions in `scene-data.js`.
- Ignition/completion envelopes in `stellar-effects.js`.
- Stage computation and pulse in `hud-progress.js`.
- HUD layout in `hud-layout.js`.
- Grid timing and geometry in `hud-intro-state.js`.

These can be imported into Node or a data URL and exercised without exposing anyone's login UI. GNOME-specific files should be thin adapters for lifecycle, actor placement, signal subscription, and updates.

### The shared-copy rule

The pure modules `scene-data.js`, `stellar-effects.js`, `failure-tracker.js`, `hud-state.js`, `hud-progress.js`, and `hud-intro-state.js` are intentionally **the same code** under M8 and GDM. They are copied rather than linked because each installed extension must be self-contained.

When editing one of those modules, update the matching copy in the other extension, then run:

```bash
(
    set -euo pipefail
    node lab/gnome50-gdm/test-g17-parity-performance.mjs
)
```

`hud-layout.js`, `observatory-intro.js` and `observatory-hud.js` are **not required to be identical**; their GNOME mode/fallback differences are intentional.

## GNOME-specific changes: review checklist

If your change touches `extension.js`, `GreeterPasswordCover` or the account chooser, answer these before deploying:

1. Is GNOME still holding its own native password buffer and verifier?
2. Does the code read **length only**, not secret text or raw key events?
3. Does the widget stay non-reactive except deliberate recovery/account buttons?
4. Can SHOW LOGIN reveal an actually usable native prompt?
5. What happens on username prompts, OTP, disabled lists and more than eight accounts?
6. What if GNOME replaces, reparents or disposes the native dialog mid-animation?
7. Are GLib sources and GObject signals canceled/disconnected in every teardown path?
8. Does any failure keep a hidden/fullscreen actor on top of GDM forever?
9. Is there a working TTY fallback and complete previous-version backup?

A login screen is not the place to discover that a mock `St.Widget` differs from the real GNOME implementation.

## Test with a real VM

For every runtime-facing change:

1. Commit your source and run local + CI tests.
2. Build checksum-verified **complete** extension bundles; scripts for the original lab are in `lab/gnome50-gdm/` and `lab/gnome50-m8/`.
3. Verify your VM identity/version and take a powered-off snapshot.
4. Make a rollback available **before** swapping extension directories.
5. Test the GDM state, account selection, password cover, failure/SHOW LOGIN, and successful desktop session.
6. Lock/unlock at least three times and resize the VM while the five-second scan is active.
7. Reboot the VM and test all of the above again.
8. Exercise the rollback at least once before proposing a physical-host rollout.

Never push a new visual system to your only working login manager without an out-of-band recovery route.

## How to add a test

For a pure function: import the module via Node, use `assert`, cover happy paths, bounds, malformed input, and numeric stability.

For GJS actors/timers: follow the mocked `GLib`/actor harnesses in `test-intro-runtime.mjs` and `test-g18-hud-runtime.mjs`. Simulate time, destruction, repeated input, scene changes, and actor reparenting. Make assertions about **zero remaining timer sources** after teardown.

For deployment: assertions should verify rollback *precedes* mutation, backups are retained, and scripts **never** restart host GDM automatically. Do not weaken hard-coded identity checks to make a test pass; adapt the test to a safer generalization.

## Code style and pull requests

Prefer small changes, descriptive method names, comments around private GNOME APIs, and a test for each bug. Preserve the working code path when experimenting with a new visual layer. A useful PR includes: GNOME/GDM version, affected session mode, before/after behavior, tests run, VM result, failure/recovery behavior, and any visual screenshots (with private details removed).

Don't ship downloaded executables, SSH keys, account credentials, VM disks, or user-specific paths as part of a PR. See [Contributing](../CONTRIBUTING.md).
