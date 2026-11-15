# Multi-monitor rendering (M9)

Mellon draws **one complete observatory per physical/logical monitor**, not one
photo stretched over the entire desktop. GNOME still owns **one** password
prompt and **one** authentication session. This is the current design tested on
BlackPearl, Ubuntu 26.04.1, GNOME Shell 50.1, Wayland.

## What M9 does

The original implementation bound its artwork to GNOME's combined
`ScreenShield` / `LoginDialog` allocation. On mixed-scale desktops, that
virtual rectangle is **not** a single display. It may also include unoccupied
areas. Background `cover` cropping, pixel-positioned source stars, edge
instruments and the sweep cannot use that rectangle as one camera viewport.

M9 reads `Main.layoutManager.monitors` and constructs separate, clipped
fixed-layout actor trees from each monitor's **logical** `x/y/width/height`.

For the original BlackPearl layout:

| Display | Physical output | Scale | Logical rectangle |
| --- | --- | --- | --- |
| External ultrawide (primary) | 3440 × 1440 | 100% | `(0, 0, 3440, 1440)` |
| Laptop panel | 2560 × 1440 | ~133% | `(3440, 0, 1920, 1080)` |

**Never infer these rectangles from `xrandr --listmonitors` under Wayland.**
Xwayland can report very different transformed dimensions. The monitor
coordinates above are examples, not constants embedded in the code.

### User lock screen

`lab/gnome50-m8/extension.js`:

```text
GNOME Main.screenShield._dialog (GNOME owns prompt and focus)
└── MellonMonitorViews (one controller per lock dialog)
    ├── viewport at GNOME monitor[0]'s logical rect, clipped
    │   ├── source photo/background (cover)
    │   ├── Cairo connector canvas + source-colored star sprites
    │   ├── ObservatoryHUD
    │   └── SHOW LOGIN / UNAUTHORIZED ACCESS
    └── viewport at GNOME monitor[1]'s logical rect, clipped
        └── same independent visual components
```

One `notify::length` observer, one failure tracker and GNOME's existing
password entry drive all visual views. All visual views share the chosen
constellation **scene**; their visual instances handle their own screen
dimensions and cleanup. A single **SHOW LOGIN** action reveals native
authentication everywhere. The 250 ms lifecycle observer also checks logical
monitor geometry, rebuilding the decorative viewports on hotplug without
replacing GNOME's dialog. A freshly opened lock uses the scene picker again.

### GDM greeter

`lab/gnome50-gdm/greeter-extension/extension.js` and
`greeter-visuals.js`:

```text
GNOME Main.screenShield._lockDialogGroup
├── native LoginDialog (unchanged native account/password/session flow)
├── GreeterVisuals.actor (a SINGLE orderable group, above or below native)
│   ├── root[0] clipped to monitor[0] → photo + GreeterStarfield + HUD
│   └── root[1] clipped to monitor[1] → photo + GreeterStarfield + HUD
├── GreeterPasswordCover recovery button (primary monitor only)
└── GreeterAccountChooser.layer (primary monitor only)
```

The GDM controller creates **one** `GreeterLengthObserver`,
`GreeterPasswordCover`, and `GreeterAccountChooser`; there is no
per-monitor login widget or separate account activation. The special
`GreeterVisuals.actor` is a single sibling of `LoginDialog`, so the
password and account flows can raise/lower all Mellon's artwork atomically.
This avoids accidentally moving or covering GNOME-owned actors out of order.

GDM reads its **own** live `Main.layoutManager.monitors`. GDM can use a
different monitor order, scale or primary than the logged-in user session.
`Main.layoutManager.primaryIndex` chooses the one interactive primary
monitor. The account picker is centered **within that monitor**, not the
virtual bounding rectangle. `SHOW LOGIN` on the primary monitor exposes
native GDM, and the native-recovery state survives a monitor layout rebuild.

`GreeterVisuals` owns only decorative actors. It accepts a bounded
number of star-mask updates via its `setLength()` and `clear()` methods.
The GDM observer never forwards input text or key symbols.

## The smooth, compositor-driven scanner

The old scanner did a full-screen Cairo repaint on a 50 ms GLib timer,
calculating the scan position on each repaint. This appeared to freeze around
the middle of an ultrawide viewport and cost CPU on dual monitors.

M9's `observatory-intro.js` does something simpler:

1. Paint a **static** lattice once at first display/resize.
2. Create a translucent gradient wake and narrow bright beam inside a
   non-reactive `St.Widget` scanner.
3. Move the scanner with `Clutter.Actor.ease({x: width, duration: 1850,
   mode: Clutter.AnimationMode.LINEAR})`.
4. Clip the moving actor to **its own** monitor viewport.
5. Hide the cosmetic scan when complete, then wake it after a 5-second
   start-to-start interval. A bounded timeout is a cleanup safeguard, **not**
   a frame/update loop.

Mutter interpolates the actor's position at the actual compositor refresh
rate, rather than Mellon's JavaScript forcing 20/40 FPS. This enables 60 Hz+
motion on displays that run at those refresh rates; actual smoothness is
limited by display refresh and compositor load.

The static pure module `hud-intro-state.js` still defines grid geometry,
legacy scan math and duration/cadence. The live M9 scanner no longer imports
`INTRO_TICK_MS`, `introFrame()` or `gridCellStrength()` for movement.
Those helpers are retained for reproducibility and older milestone tests.

**Customize:** `BEAM_WIDTH` and gradient/edge CSS are in
`observatory-intro.js` for each extension. Keep lock and GDM scanners
visually consistent. `INTRO_DURATION_MS` and `INTRO_REPEAT_MS` are in
`hud-intro-state.js` (update both copies). Changing brightness/width affects
art only; it must not make actors reactive or interfere with SHOW LOGIN.

## Updating and actually loading changed code

**Wayland detail:** disabling/re-enabling the extension does not reliably
reload its imported JavaScript modules in the *same* GNOME Shell process.
After changing JS on disk, begin a **new GNOME session**:

- **Lock extension:** save work, log out and back in, then press Super+L.
- **GDM extension:** install/update while the current session is running;
  perform a normal logout or reboot after securing rollback. Never restart
  `gdm.service` from an active desktop session.

This distinction resolved a misleading debugging cycle: changes were copied,
but the old renderer was still executing. Verify with current-session logs.

### M9 GDM update on the original BlackPearl

The old `lab/blackpearl-host/install.sh` is **first-install only**. It will
refuse to run again, by design. For the already-installed system use:

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    for f in extension.js greeter-visuals.js greeter-password-cover.js \
        greeter-account-chooser.js observatory-intro.js; do
        node --input-type=module --check \
            < "lab/gnome50-gdm/greeter-extension/$f"
    done
    node lab/gnome50-gdm/test-m9-gdm-multimonitor.mjs
    node lab/gnome50-gdm/test-m9-gdm-ui.mjs
    sudo bash lab/gnome50-gdm/m9-upgrade-blackpearl.sh
)
```

The updater:

- runs only on the pinned **BlackPearl / GNOME 50.1** host;
- refuses an unexpected original extension or second M9 upgrade;
- checks the **installed original** `SHA256SUMS` before modifying anything;
- copies the full original GDM extension to a protected backup;
- stages all existing files/assets, replaces only the five M9 source files,
  computes new checksums, and atomically swaps the extension directory;
- does **not** write dconf, touch PAM, alter monitor configuration, restart
  the display manager or reboot.

Run the Node checks as your **normal user** before sudo. A user-installed
`node` may be absent from `sudo`'s secure PATH; running that user's Node
binary as root is not the right fix.

After the script reports PASS, start a fresh greeter session. Do not rerun the
one-time updater on an already-upgraded installation.

### Recovery if GDM does not load

From a working session or a text console (`Ctrl+Alt+F3`):

```bash
(
    set -euo pipefail
    cd "$HOME/go/src/ap0calypse644/Mellon"
    sudo bash lab/gnome50-gdm/m9-rollback-blackpearl.sh
)
```

This restores the **previous complete GDM extension** from its saved copy,
leaving the M9 candidate quarantined. Reboot normally to load the original.
The user's lock-screen extension is unaffected. Keep the original
`/usr/local/sbin/mellon-blackpearl-rollback` as an additional rescue path;
that older script removes Mellon entirely, so use the M9-specific rollback
first.

On other machines, *adapt the script and re-audit the private GNOME APIs*.
Do not blindly copy a host-specific installer.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Grid/beam still freezes halfway after editing JS | Was the GNOME process actually restarted? Confirm a fresh session; don't repeatedly change animation curves. |
| Both monitors show one cropped/oversized photo | `Main.layoutManager.monitors` geometry, and `GreeterVisuals` / `MellonMonitorViews` per-monitor viewports. |
| GDM controls appear on the wrong screen | GDM's `Main.layoutManager.primaryIndex`, **not** the user's saved primary. |
| One monitor has fractional scaling | Use GNOME logical rectangles only; do not multiply all positions by physical scale or Xwayland factors. |
| GDM native controls covered in unsupported auth state | `GreeterPasswordCover._passwordPromptActive()` and `GreeterAccountChooser.nativeRoster()`; fail open. |
| `sudo: node: command not found` | Run `node --check` under your normal user account; the patched installer doesn't invoke Node as root. |
| Ubuntu ultrawide edge-snap places windows off-screen | Check the Ubuntu Enhanced Tiling extension separately. Mellon never changes Mutter's edge-tiling settings; disabling the buggy tiler and enabling native edge tiling is a separate workaround, not a Mellon deployment step. |

**Acceptance checklist:** both screens covered correctly; scanner reaches both
right edges; star activation and Backspace match on each screen; native
account selection remains operational; SHOW LOGIN exposes native controls;
unlock/login works; original user display arrangement and desktop tiling
remain intact; a TTY rescue and checksummed GDM backup exist.

## Relevant source/tests

- Lock controller: `lab/gnome50-m8/extension.js`
- GDM controller: `lab/gnome50-gdm/greeter-extension/extension.js`
- GDM display owner: `lab/gnome50-gdm/greeter-extension/greeter-visuals.js`
- Password/account adapters: `greeter-password-cover.js`,
  `greeter-account-chooser.js`
- Shared effect: both `observatory-intro.js` files
- Geometry, controller, recovery tests:
  `lab/gnome50-gdm/test-m9-gdm-multimonitor.mjs`,
  `lab/gnome50-gdm/test-m9-gdm-ui.mjs`,
  `lab/gnome50-m8/test-intro-runtime.mjs`,
  `lab/gnome50-gdm/test-g17-parity-performance.mjs`

The Node tests cover logic and lifecycle assumptions. They **cannot** prove
live GDM allocation, keyboard focus, account activation or display refresh.
Those require an attended VM/hardware login test with a known-good rollback.
