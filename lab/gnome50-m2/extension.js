import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// VM-only, non-reactive visuals. Native GNOME authentication stays intact.
const FRAME_MS = 125;
const POLL_MS = 250;
const MAX = 24;
const PATH = [
    [0.18,0.56], [0.24,0.45], [0.31,0.49], [0.37,0.36],
    [0.44,0.43], [0.50,0.28], [0.56,0.43], [0.63,0.36],
    [0.69,0.49], [0.76,0.45], [0.82,0.56], [0.74,0.66],
    [0.65,0.60], [0.60,0.75], [0.50,0.68], [0.40,0.75],
    [0.35,0.60], [0.26,0.66], [0.31,0.78], [0.42,0.86],
    [0.50,0.80], [0.58,0.86], [0.69,0.78], [0.50,0.54],
];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

class NightwatchSky {
    constructor(dialog) {
        this.count = 0;
        this.state = 'idle';
        this.stateAt = 0;
        this.stars = Array.from({length: 240}, () => ({
            x: Math.random(), y: Math.random(),
            radius: 0.4 + Math.random(),
            light: 0.15 + Math.random() * 0.42,
            phase: Math.random() * Math.PI * 2,
            speed: 0.4 + Math.random() * 1.3,
        }));

        // Clutter.Actor has no 'can-focus' property (that belongs to St.Widget).
        this.actor = new Clutter.Actor({reactive: false});
        this.actor.add_constraint(new Clutter.BindConstraint({
            source: dialog, coordinate: Clutter.BindCoordinate.SIZE,
        }));
        this.canvas = new Clutter.Canvas();
        this.actor.set_content(this.canvas);
        this.drawId = this.canvas.connect('draw', (_canvas, cr, w, h) =>
            this._draw(cr, w, h));
        this.allocationId = this.actor.connect('notify::allocation', () =>
            this._syncSize());

        // GNOME 50 dialog child order: background, then native login widgets.
        dialog.insert_child_above(this.actor, dialog._backgroundGroup);
        this.width = 0;
        this.height = 0;
        this._syncSize();
        this.timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, FRAME_MS, () => {
            this._syncSize();
            this.canvas.invalidate();
            return GLib.SOURCE_CONTINUE;
        });
    }

    setCount(value) {
        this.count = clamp(value, 0, MAX);
        if (this.state === 'denied' && value > 0)
            this.state = 'idle';
        this.canvas.invalidate();
    }

    setState(state) {
        this.state = state;
        this.stateAt = GLib.get_monotonic_time() / 1000000;
        this.canvas.invalidate();
    }

    _syncSize() {
        const [w, h] = this.actor.get_size();
        const width = Math.round(w);
        const height = Math.round(h);
        if (width < 1 || height < 1 ||
            (width === this.width && height === this.height))
            return;
        this.width = width;
        this.height = height;
        this.canvas.set_size(width, height);
        this.canvas.invalidate();
    }

    destroy() {
        if (this.timer) {
            GLib.source_remove(this.timer);
            this.timer = 0;
        }
        if (this.allocationId)
            this.actor.disconnect(this.allocationId);
        if (this.drawId)
            this.canvas.disconnect(this.drawId);
        this.actor.destroy();
    }

    _glow(cr, cx, cy, radius, color, opacity) {
        for (let i = 12; i >= 1; i--) {
            const f = i / 12;
            cr.setSourceRGBA(...color, opacity * (1 - f) / 12);
            cr.arc(cx, cy, radius * f, 0, Math.PI * 2);
            cr.fill();
        }
    }

    _draw(cr, width, height) {
        if (width < 1 || height < 1)
            return true;
        const time = GLib.get_monotonic_time() / 1000000;
        const scale = Math.min(width, height) / 900;

        cr.setSourceRGB(0.014, 0.012, 0.040);
        cr.paint();
        this._glow(cr, width * 0.25, height * 0.40,
            Math.max(width, height) * 0.47, [0.20,0.065,0.43], 0.19);
        this._glow(cr, width * 0.79, height * 0.64,
            Math.max(width, height) * 0.38, [0.025,0.22,0.38], 0.16);

        cr.setLineWidth(0.6);
        cr.setSourceRGBA(0.38, 0.45, 0.71, 0.055);
        for (let x = 0; x < width; x += 100) {
            cr.moveTo(x, 0);
            cr.lineTo(x, height);
        }
        for (let y = 0; y < height; y += 100) {
            cr.moveTo(0, y);
            cr.lineTo(width, y);
        }
        cr.stroke();

        for (const star of this.stars) {
            const flicker = 0.84 +
                0.16 * Math.sin(time * star.speed + star.phase);
            cr.setSourceRGBA(0.76, 0.86, 1.0, star.light * flicker);
            cr.arc(star.x * width, star.y * height,
                Math.max(0.45, star.radius * scale), 0, Math.PI * 2);
            cr.fill();
        }

        if (this.count > 1) {
            cr.setSourceRGBA(0.28, 0.73, 1.0,
                this.state === 'denied' ? 0.12 : 0.44);
            cr.setLineWidth(Math.max(0.8, scale * 1.25));
            for (let i = 1; i < this.count; i++) {
                const [x0, y0] = PATH[i - 1];
                const [x1, y1] = PATH[i];
                cr.moveTo(x0 * width, y0 * height);
                cr.lineTo(x1 * width, y1 * height);
            }
            cr.stroke();
        }

        for (let i = 0; i < this.count; i++) {
            const [x, y] = PATH[i];
            const px = x * width, py = y * height;
            const flicker = 0.85 +
                0.15 * Math.sin(time * 2 + i * 1.3);
            const color = this.state === 'denied'
                ? [1.0, 0.25, 0.46] : [0.22, 0.78, 1.0];
            cr.setSourceRGBA(...color, 0.15 * flicker);
            cr.arc(px, py, Math.max(7, 13 * scale), 0, Math.PI * 2);
            cr.fill();
            cr.setSourceRGBA(...color, 0.98 * flicker);
            cr.arc(px, py, Math.max(1.6, 2.2 * scale), 0, Math.PI * 2);
            cr.fill();
        }

        if (this.state === 'verifying') {
            const progress = ((time - this.stateAt) % 1.5) / 1.5;
            cr.setSourceRGBA(0.27, 0.72, 0.98, 0.14);
            cr.setLineWidth(1.2);
            cr.arc(width * 0.5, height * 0.53,
                (0.15 + progress * 0.65) * Math.max(width, height),
                0, Math.PI * 2);
            cr.stroke();
        } else if (this.state === 'denied') {
            const alpha = 0.18 * Math.max(0, 1 -
                (time - this.stateAt) / 0.9);
            if (alpha > 0) {
                cr.setSourceRGBA(0.48, 0.02, 0.11, alpha);
                cr.paint();
            }
        }
        return true;
    }
}

export default class MellonLab extends Extension {
    enable() {
        this._dialog = null;
        this._panel = null;
        this._sky = null;
        this._prompt = null;
        this._buffer = null;
        this._signals = [];
        this._epoch = 0;
        this._reportedError = false;
        this._timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, POLL_MS, () => {
            try {
                this._tick();
            } catch (error) {
                if (!this._reportedError) {
                    console.warn('[Mellon M2] Probe error: ' +
                        (error?.name ?? 'unknown') + ': ' +
                        (error?.message ?? 'no details'));
                    this._reportedError = true;
                }
            }
            return GLib.SOURCE_CONTINUE;
        });
        try {
            this._tick();
        } catch (error) {
            console.warn('[Mellon M2] Initial probe error: ' +
                (error?.name ?? 'unknown') + ': ' +
                (error?.message ?? 'no details'));
        }
    }

    disable() {
        if (this._timer) {
            GLib.source_remove(this._timer);
            this._timer = 0;
        }
        this._unmount();
    }

    _disconnect() {
        // GNOME may have already disposed the prompt between polling ticks.
        // Calling disconnect() on a disposed GObject prints critical warnings
        // even inside try/catch. Old callbacks become inert via this epoch;
        // GObject automatically clears its signals when destroyed.
        this._epoch++;
        this._signals = [];
        this._prompt = null;
        this._buffer = null;
    }

    _unmount() {
        this._disconnect();
        try {
            this._panel?.destroy();
        } catch (_) {
        }
        try {
            this._sky?.destroy();
        } catch (_) {
        }
        this._panel = null;
        this._sky = null;
        this._dialog = null;
        this._starsLabel = null;
        this._status = null;
    }

    _mount(dialog) {
        // Only mark the dialog mounted once its scenery was created.
        // A failed constructor must not permanently block subsequent retries.
        this._sky = new NightwatchSky(dialog);
        this._dialog = dialog;
        this._panel = new St.BoxLayout({
            style_class: 'mellon-m2-panel',
            orientation: Clutter.Orientation.VERTICAL,
            reactive: false,
            can_focus: false,
        });
        this._panel.set_position(32, 32);
        this._panel.add_child(new St.Label({
            text: 'BLACKPEARL  /  MELLON 02',
            style_class: 'mellon-m2-header',
        }));
        this._starsLabel = new St.Label({
            text: '· '.repeat(MAX),
            style_class: 'mellon-m2-stars',
        });
        this._status = new St.Label({
            text: 'NATIVE AUTHENTICATION  //  STANDBY',
            style_class: 'mellon-m2-status',
        });
        this._panel.add_child(this._starsLabel);
        this._panel.add_child(this._status);
        dialog.add_child(this._panel);
    }

    _render(length) {
        if (!this._starsLabel || !this._status)
            return;
        const n = clamp(length, 0, MAX);
        this._sky?.setCount(length);
        this._starsLabel.text = '✦ '.repeat(n) + '· '.repeat(MAX - n);
        this._status.text = length > 0
            ? 'CONSTELLATION ACTIVE  //  NATIVE AUTH'
            : 'AWAITING INPUT  //  NATIVE AUTH';
    }

    _tick() {
        if (Main.sessionMode.currentMode !== 'unlock-dialog')
            return;
        const dialog = Main.screenShield?._dialog;
        if (!dialog)
            return;
        if (dialog !== this._dialog) {
            this._unmount();
            this._mount(dialog);
        }

        const prompt = dialog._authPrompt;
        const buffer = prompt?._passwordEntry?.clutter_text?.get_buffer?.();
        if (prompt === this._prompt && buffer === this._buffer)
            return;
        this._disconnect();
        if (!prompt || !buffer) {
            this._render(0);
            return;
        }

        this._prompt = prompt;
        this._buffer = buffer;
        const epoch = this._epoch;
        const current = () => epoch === this._epoch && this._panel !== null;
        this._signals.push([buffer, buffer.connect('notify::length', () => {
            if (!current())
                return;
            // Character count only. Do not read or log password contents.
            this._render(buffer.get_length());
        })]);
        this._signals.push([prompt, prompt.connect('next', () => {
            if (!current())
                return;
            this._sky?.setState('verifying');
            if (this._status)
                this._status.text = 'AUTHENTICATION  //  VERIFYING';
        })]);
        this._signals.push([prompt, prompt.connect('failed', () => {
            if (!current())
                return;
            this._sky?.setState('denied');
            if (this._status)
                this._status.text = 'ACCESS DENIED  //  RETRY';
        })]);
        this._render(buffer.get_length());
    }
}
