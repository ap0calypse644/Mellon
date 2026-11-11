import GLib from 'gi://GLib';
import St from 'gi://St';
import {INTRO_TICK_MS, introFrame, introScanBounds}
    from './hud-intro-state.js';

// Brief one-time instrument calibration: ONLY existing corner panels.
// No keyboard, password, authentication, timers after one second, or shaders.
const CORNERS = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];
export class ObservatoryIntro {
    constructor(root, panels) {
        this._root = root;
        this._panels = panels;
        this._started = false;
        this._finished = false;
        this._destroyed = false;
        this._timerId = 0;
        this._screenSize = null;
        this._rects = null;
        this._startedAt = 0;
        this._scans = {};
        for (const corner of CORNERS) {
            const scan = new St.Widget({
                reactive: false, can_focus: false,
                style_class: 'mellon-m8-intro-scan',
            });
            scan.hide();
            root.add_child(scan);
            this._scans[corner] = scan;
        }
    }

    onLayout(rects, width, height) {
        if (this._finished || this._destroyed ||
            !Number.isFinite(width) || !Number.isFinite(height) ||
            width <= 1 || height <= 1)
            return;
        if (this._started) {
            // Resizing cancels rather than sliding a beam over the center.
            if (width !== this._screenSize[0] ||
                height !== this._screenSize[1])
                this.stop();
            return;
        }
        this._started = true;
        this._screenSize = [width, height];
        this._rects = rects;
        if (!CORNERS.some(corner => rects[corner])) {
            this.stop(); // Small-screen intro is skipped for this lock.
            return;
        }
        this._startedAt = GLib.get_monotonic_time() / 1000;
        this._draw(introFrame(0));
        this._timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
            INTRO_TICK_MS, () => {
                if (this._finished || this._destroyed) {
                    this._timerId = 0;
                    return GLib.SOURCE_REMOVE;
                }
                try {
                    const elapsed = GLib.get_monotonic_time() / 1000 -
                        this._startedAt;
                    const frame = introFrame(elapsed);
                    if (frame.done) {
                        this._finish(true);
                        return GLib.SOURCE_REMOVE;
                    }
                    this._draw(frame);
                    return GLib.SOURCE_CONTINUE;
                } catch (_) {
                    // A decorative failure cannot keep the HUD hidden.
                    this._finish(true);
                    return GLib.SOURCE_REMOVE;
                }
            });
    }

    _draw(frame) {
        for (const corner of CORNERS) {
            const panel = this._panels[corner];
            const scan = this._scans[corner];
            const box = this._rects[corner];
            if (!box) {
                panel.opacity = 255;
                scan.hide();
                continue;
            }
            panel.opacity = frame.panelOpacity;
            const r = introScanBounds(box, frame.progress);
            scan.set_position(r.x, r.y);
            scan.set_size(r.width, r.height);
            scan.opacity = frame.scanOpacity;
            if (frame.scanOpacity > 0)
                scan.show();
            else
                scan.hide();
        }
    }

    _finish(inCallback) {
        if (this._finished)
            return;
        this._finished = true;
        if (this._timerId) {
            if (!inCallback)
                GLib.source_remove(this._timerId);
            this._timerId = 0;
        }
        for (const panel of Object.values(this._panels))
            panel.opacity = 255;
        for (const scan of Object.values(this._scans))
            scan.hide();
        this._rects = null;
    }

    stop() {
        this._finish(false);
    }

    destroy() {
        if (this._destroyed)
            return;
        this.stop();
        this._destroyed = true;
        for (const scan of Object.values(this._scans))
            scan.destroy();
        this._scans = null;
        this._panels = null;
        this._root = null;
    }
}
