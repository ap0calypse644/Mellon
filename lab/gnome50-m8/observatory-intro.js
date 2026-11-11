import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import {INTRO_TICK_MS, introFrame, gridGeometry, gridCellStrength}
    from './hud-intro-state.js';

// One GNOME DrawingArea renders the entire grid: no cell actors, no shaders,
// no repeating idle animation, and no access to the password or key events.
// The overlay is non-reactive; native SHOW LOGIN remains fully clickable.
export class ObservatoryIntro {
    constructor(root, panels) {
        this._root = root;
        this._panels = panels;
        this._started = false;
        this._finished = false;
        this._destroyed = false;
        this._timerId = 0;
        this._startedAt = 0;
        this._screenSize = null;
        this._frame = introFrame(0);
        this._grid = new St.DrawingArea({reactive: false, can_focus: false});
        this._grid.add_constraint(new Clutter.BindConstraint({
            source: root, coordinate: Clutter.BindCoordinate.SIZE,
        }));
        this._grid.connect('repaint', area => {
            if (this._destroyed || this._finished)
                return;
            const [width, height] = area.get_surface_size();
            if (width < 320 || height < 240)
                return;
            const cr = area.get_context();
            try {
                this._paint(cr, gridGeometry(width, height), this._frame);
            } catch (_) {
                // An optional visual failing must never break GNOME login.
                this.stop();
            } finally {
                cr.$dispose();
            }
        });
        // Under all HUD labels, stages and metadata. This actor and its
        // parent are non-reactive; GNOME keeps native keyboard and focus.
        root.insert_child_below(this._grid, panels.topLeft);
        this._grid.hide();
    }

    onLayout(_rects, width, height) {
        if (this._destroyed || this._finished ||
            !Number.isFinite(width) || !Number.isFinite(height) ||
            width < 320 || height < 240)
            return;
        if (this._started) {
            if (width !== this._screenSize[0] ||
                height !== this._screenSize[1])
                this.stop(); // Cancel on resize rather than distort the grid.
            return;
        }
        this._started = true;
        this._screenSize = [width, height];
        this._startedAt = GLib.get_monotonic_time() / 1000;
        this._frame = introFrame(0);
        // Begin the instrument fade in the same frame as the grid start;
        // avoid briefly flashing fully opaque panels before the first tick.
        for (const panel of Object.values(this._panels))
            panel.opacity = 0;
        this._grid.show();
        this._grid.queue_repaint();
        this._timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
            INTRO_TICK_MS, () => {
                if (this._finished || this._destroyed) {
                    this._timerId = 0;
                    return GLib.SOURCE_REMOVE;
                }
                try {
                    const elapsed = GLib.get_monotonic_time() / 1000 -
                        this._startedAt;
                    const next = introFrame(elapsed);
                    if (next.done) {
                        this._finish(true);
                        return GLib.SOURCE_REMOVE;
                    }
                    this._frame = next;
                    for (const panel of Object.values(this._panels))
                        panel.opacity = next.panelOpacity;
                    this._grid.queue_repaint();
                    return GLib.SOURCE_CONTINUE;
                } catch (_) {
                    this._finish(true);
                    return GLib.SOURCE_REMOVE;
                }
            });
    }

    _paint(cr, geometry, frame) {
        const {width, height, columns, rows, cellWidth, cellHeight} = geometry;
        const globalAlpha = frame.gridOpacity;
        if (globalAlpha <= .001)
            return;

        // Preserve the ALWAYS-visible native SHOW LOGIN recovery area.
        // Clip out a generous rectangle, without reducing grid coverage
        // over the actual center of the nebula and constellation.
        const rx = 12, ry = 10, rw = 230, rh = 86;
        cr.save();
        cr.newPath();
        cr.rectangle(0, 0, width, ry);
        cr.rectangle(0, ry + rh, width, Math.max(0, height - ry - rh));
        cr.rectangle(0, ry, rx, rh);
        cr.rectangle(rx + rw, ry, Math.max(0, width - rx - rw), rh);
        cr.clip();

        // Muted full-screen lattice, always underneath the photographic
        // stars (visually) and under the prominent HUD panels.
        cr.setSourceRGBA(.36, .76, 1, .095 * globalAlpha);
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

        // Columns wake from left to right. A slightly staggered mosaic
        // within each column provides texture without changing direction.
        for (let col = 0; col < columns; col++) {
            const x = col * cellWidth;
            for (let row = 0; row < rows; row++) {
                const intensity = gridCellStrength(frame,col,row,geometry);
                if (intensity < .01)
                    continue;
                const y = row * cellHeight;
                const alpha = intensity * globalAlpha;
                cr.rectangle(x + 1.5, y + 1.5,
                    Math.max(0, cellWidth - 3),
                    Math.max(0, cellHeight - 3));
                cr.setSourceRGBA(.24, .72, 1, .12 * alpha);
                cr.fill();
                cr.rectangle(x + .5, y + .5,
                    Math.max(0, cellWidth - 1),
                    Math.max(0, cellHeight - 1));
                cr.setSourceRGBA(.52, .92, 1, .25 * alpha);
                cr.setLineWidth(1);
                cr.stroke();
            }
        }

        // Soft vertical leading wave, explicitly bounded to the display.
        const lead = frame.sweep * width;
        cr.rectangle(Math.max(0, lead - 10), 0, 20, height);
        cr.setSourceRGBA(.24, .8, 1, .07 * globalAlpha);
        cr.fill();
        cr.rectangle(Math.max(0, lead - 1), 0, 2, height);
        cr.setSourceRGBA(.75, .96, 1, .32 * globalAlpha);
        cr.fill();
        cr.restore();
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
        if (this._grid)
            this._grid.hide();
        for (const panel of Object.values(this._panels))
            panel.opacity = 255;
        this._frame = introFrame(0);
    }

    stop() {
        this._finish(false);
    }

    destroy() {
        if (this._destroyed)
            return;
        this.stop();
        this._destroyed = true;
        this._grid?.destroy();
        this._grid = null;
        this._root = null;
        this._panels = null;
    }
}
