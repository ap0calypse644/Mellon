import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import {INTRO_DURATION_MS, INTRO_REPEAT_MS, gridGeometry}
    from './hud-intro-state.js';

// M9.2: the head travels on Clutter's refresh-synchronized animation clock.
// No per-frame GLib timer, Cairo repaint, or JS updates compete with the
// two monitors. Native authentication and its input actors stay untouched.
const BEAM_WIDTH = 240;

export class ObservatoryIntro {
    constructor(root, panels) {
        this._root = root;
        this._panels = panels;
        // A moving scanner must never spill into the adjacent monitor.
        root.set_clip_to_allocation(true);
        this._started = false;
        this._everStarted = false;
        this._stopped = false;
        this._sweeping = false;
        this._destroyed = false;
        this._finishId = 0;
        this._repeatTimerId = 0;
        this._firstLayoutId = 0;
        this._screenSize = null;

        // A static texture: paint once, not 60+ times a second.
        this._grid = new St.DrawingArea({
            reactive: false, can_focus: false,
        });
        this._grid.add_constraint(new Clutter.BindConstraint({
            source: root, coordinate: Clutter.BindCoordinate.SIZE,
        }));
        this._grid.connect('repaint', area => {
            if (this._destroyed || this._stopped)
                return;
            const [width, height] = area.get_surface_size();
            if (width < 320 || height < 240)
                return;
            const cr = area.get_context();
            try {
                this._paintGrid(cr, gridGeometry(width, height));
            } catch (error) {
                // Decorative errors must never interfere with GNOME login.
                console.warn('[Mellon scan] grid rendering disabled: ' +
                    String(error));
                this.stop();
            } finally {
                cr.$dispose();
            }
        });
        root.insert_child_below(this._grid, panels.topLeft);
        this._grid.hide();

        // One animated parent moves the wake and luminous leading edge.
        // GNOME/Mutter interpolates its x-position at the display's refresh
        // rate, including when the external and internal monitors differ.
        this._scanner = new St.Widget({
            reactive: false, can_focus: false,
            layout_manager: new Clutter.FixedLayout(),
        });
        this._wake = new St.Widget({
            reactive: false, can_focus: false,
        });
        this._wake.set_style(
            'background-gradient-direction: horizontal; ' +
            'background-gradient-start: rgba(21, 123, 192, 0); ' +
            'background-gradient-end: rgba(95, 217, 255, 0.26);');
        this._edge = new St.Widget({
            reactive: false, can_focus: false,
        });
        this._edge.set_style(
            'background-color: rgba(185, 245, 255, 0.9); ' +
            'box-shadow: 0 0 14px rgba(78, 205, 255, 0.8);');
        this._scanner.add_child(this._wake);
        this._scanner.add_child(this._edge);
        root.insert_child_above(this._scanner, this._grid);
        this._scanner.hide();
    }

    onLayout(_rects, width, height) {
        if (this._destroyed || this._stopped ||
            !Number.isFinite(width) || !Number.isFinite(height) ||
            width < 320 || height < 240)
            return;
        if (this._started) {
            if (width === this._screenSize[0] &&
                height === this._screenSize[1])
                return;
            if (this._repeatTimerId) {
                GLib.source_remove(this._repeatTimerId);
                this._repeatTimerId = 0;
            }
            if (this._firstLayoutId) {
                GLib.source_remove(this._firstLayoutId);
                this._firstLayoutId = 0;
            }
            this._finishSweep(false);
        }

        this._started = true;
        this._screenSize = [width, height];
        this._scanner.set_size(BEAM_WIDTH, height);
        this._wake.set_position(0, 0);
        this._wake.set_size(BEAM_WIDTH - 3, height);
        this._edge.set_position(BEAM_WIDTH - 3, 0);
        this._edge.set_size(3, height);
        this._grid.queue_repaint();

        // The HUD's first reflow runs before it is parented to the lock
        // dialog. Start on the next idle, after the actor joins the stage.
        const firstSweep = !this._everStarted;
        this._everStarted = true;
        this._firstLayoutId = GLib.idle_add(
            GLib.PRIORITY_DEFAULT_IDLE, () => {
                this._firstLayoutId = 0;
                if (!this._destroyed && !this._stopped)
                    this._startSweep(firstSweep);
                return GLib.SOURCE_REMOVE;
            });

        this._repeatTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
            INTRO_REPEAT_MS, () => {
                if (this._destroyed || this._stopped) {
                    this._repeatTimerId = 0;
                    return GLib.SOURCE_REMOVE;
                }
                try {
                    if (!this._sweeping)
                        this._startSweep(false);
                } catch (error) {
                    console.warn('[Mellon scan] animation disabled: ' +
                        String(error));
                    this.stop();
                    this._repeatTimerId = 0;
                    return GLib.SOURCE_REMOVE;
                }
                return GLib.SOURCE_CONTINUE;
            });
    }

    _startSweep(firstSweep) {
        if (this._destroyed || this._stopped || this._sweeping ||
            !this._screenSize)
            return;
        this._sweeping = true;
        const width = this._screenSize[0];
        if (firstSweep)
            console.log('[Mellon GDM M9 compositor scanner] viewport=' +
                width + 'x' + this._screenSize[1] +
                ', duration=' + INTRO_DURATION_MS + 'ms');
        this._scanner.remove_all_transitions();
        this._scanner.set_position(-BEAM_WIDTH, 0);
        this._scanner.opacity = 255;

        if (firstSweep) {
            for (const panel of Object.values(this._panels)) {
                panel.remove_all_transitions();
                panel.opacity = 0;
                panel.ease({
                    opacity: 255, duration: 900,
                    mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                });
            }
        }

        this._grid.show();
        this._scanner.show();

        // Linear motion until the leading edge has left the right border.
        // Unlike the old frame math, there is NO mid-sweep hold or early
        // stop. No 16/25/50ms JS timeout is involved.
        this._scanner.ease({
            x: width,
            duration: INTRO_DURATION_MS,
            mode: Clutter.AnimationMode.LINEAR,
            onComplete: () => this._finishSweep(false),
        });

        // Bounded cleanup if the compositor cancels an animation (e.g.
        // monitor hot-unplug), independent of the onComplete callback.
        this._finishId = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
            INTRO_DURATION_MS + 100, () => {
                this._finishId = 0;
                this._finishSweep(false);
                return GLib.SOURCE_REMOVE;
            });
    }

    _paintGrid(cr, {width, height, columns, rows, cellWidth, cellHeight}) {
        // A subtle stationary lattice, painted only on resize/first show.
        // The moving gradient provides the scan, while the artwork stays
        // crisp at ultrawide and fractional-scaled laptop resolutions.
        cr.save();
        const rx = 12, ry = 10, rw = 230, rh = 86;
        cr.newPath();
        cr.rectangle(0, 0, width, ry);
        cr.rectangle(0, ry + rh, width, Math.max(0, height - ry - rh));
        cr.rectangle(0, ry, rx, rh);
        cr.rectangle(rx + rw, ry, Math.max(0, width - rx - rw), rh);
        cr.clip();

        cr.setSourceRGBA(.36, .76, 1, .095);
        cr.setLineWidth(.75);
        for (let col = 0; col <= columns; col++) {
            const x = col * cellWidth;
            cr.moveTo(x, 0);
            cr.lineTo(x, height);
        }
        for (let row = 0; row <= rows; row++) {
            const y = row * cellHeight;
            cr.moveTo(0, y);
            cr.lineTo(width, y);
        }
        cr.stroke();

        // A sparse cell texture remains still while the gradient crosses.
        cr.setSourceRGBA(.32, .78, 1, .035);
        for (let col = 0; col < columns; col++)
            for (let row = 0; row < rows; row++) {
                if ((col * 7 + row * 11) % 5 !== 0)
                    continue;
                cr.rectangle(col * cellWidth + 2, row * cellHeight + 2,
                    Math.max(0, cellWidth - 4),
                    Math.max(0, cellHeight - 4));
            }
        cr.fill();
        cr.restore();
    }

    _finishSweep(_fromCallback) {
        if (!this._sweeping)
            return;
        this._sweeping = false;
        if (this._finishId) {
            GLib.source_remove(this._finishId);
            this._finishId = 0;
        }
        this._scanner?.remove_all_transitions();
        this._scanner?.hide();
        this._grid?.hide();
        for (const panel of Object.values(this._panels)) {
            panel.remove_all_transitions();
            panel.opacity = 255;
        }
    }

    stop() {
        if (this._stopped)
            return;
        this._stopped = true;
        if (this._repeatTimerId) {
            GLib.source_remove(this._repeatTimerId);
            this._repeatTimerId = 0;
        }
        if (this._firstLayoutId) {
            GLib.source_remove(this._firstLayoutId);
            this._firstLayoutId = 0;
        }
        this._finishSweep(false);
        this._scanner?.hide();
        this._grid?.hide();
    }

    destroy() {
        if (this._destroyed)
            return;
        this.stop();
        this._destroyed = true;
        this._scanner?.destroy();
        this._grid?.destroy();
        this._scanner = null;
        this._grid = null;
        this._wake = null;
        this._edge = null;
        this._root = null;
        this._panels = null;
    }
}
