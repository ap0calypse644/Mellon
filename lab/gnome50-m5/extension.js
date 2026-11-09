import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {FailureTracker} from './failure-tracker.js';

/**
 * Mellon M5: a NON-REACTIVE visual cover above GNOME's native unlock UI.
 * Native authentication, password entry, focus, retries and locking remain
 * entirely GNOME-owned. We inspect only buffer length, never text or keys.
 * SHOW LOGIN manually reveals native UI. Each failed password shows an alert;
 * no failure count automatically reveals the native password field.
 * Read-only GNOME verifier polling does not modify authentication.
 * VM ONLY. Never install M5 on the BlackPearl host.
 */
const POLL_MS = 250;
const FRAME_MS = 125;
const TAU = Math.PI * 2;
const clamp = (v, low, high) => Math.max(low, Math.min(high, v));

function readScene(path) {
    const [ok, bytes] = GLib.file_get_contents(path);
    if (!ok)
        throw new Error('MVP scene unavailable');
    const scene = JSON.parse(new TextDecoder().decode(bytes));
    if (scene.schema !== 'mellon-mvp-scene-v1' || scene.constellation !== 'Ori' ||
        scene.image_size?.[0] !== 1920 || scene.image_size?.[1] !== 1080 ||
        scene.vertices?.length !== 9 || scene.star_ids?.length !== 9 ||
        new Set(scene.star_ids).size !== 9 || !Array.isArray(scene.edges))
        throw new Error('Invalid MVP scene schema');
    if (!scene.vertices.every(p => Array.isArray(p) && p.length === 2 &&
        p.every(v => Number.isFinite(v) && v > 0 && v < 1)) ||
        !scene.edges.every(p => Array.isArray(p) && p.length === 2 &&
        p.every(i => Number.isInteger(i) && i >= 0 && i < 9)))
        throw new Error('Invalid constellation geometry');
    return scene;
}

class MVPScene {
    constructor(dialog, scene, imagePath) {
        this._dialog = dialog;
        this._scene = scene;
        this._destroyed = false;
        this._target = 0;
        this._energy = new Float32Array(9);
        this._frameTimer = 0;
        this._deniedUntil = 0;
        this._deniedStartedAt = 0;
        this._nativeRevealed = false;

        const file = Gio.File.new_for_path(imagePath);
        if (!file.query_exists(null))
            throw new Error('MVP background unavailable');

        // The image is drawn unchanged, with CSS cover/center. The Cairo
        // positions below use the EXACT same cover transform on 1920x1080.
        this._background = new St.Widget({reactive: false});
        this._background.add_constraint(new Clutter.BindConstraint({
            source: dialog, coordinate: Clutter.BindCoordinate.SIZE,
        }));
        this._background.set_style(
            `background-image: url("${file.get_uri()}"); ` +
            'background-size: cover; background-position: center; ' +
            'background-repeat: no-repeat;');

        this._canvas = new St.DrawingArea({reactive: false});
        this._canvas.add_constraint(new Clutter.BindConstraint({
            source: dialog, coordinate: Clutter.BindCoordinate.SIZE,
        }));
        this._canvas.connect('repaint', area => {
            if (this._destroyed)
                return;
            const [w, h] = area.get_surface_size();
            const cr = area.get_context();
            try {
                this._paint(cr, w, h);
            } finally {
                cr.$dispose();
            }
        });

        // The untouched GNOME clock and auth actors remain behind these
        // non-reactive actors. A null sibling places our background on top.
        dialog.insert_child_above(this._background, null);
        dialog.insert_child_above(this._canvas, this._background);

        // The only interactive Mellon actor. It never accepts keyboard focus.
        this._recovery = new St.Button({
            label: 'SHOW LOGIN',
            reactive: true,
            can_focus: false,
            track_hover: true,
            style_class: 'mellon-m5-recovery',
        });
        this._recovery.set_position(26, 22);
        this._recovery.connect('clicked', () => this.revealNative());
        dialog.insert_child_above(this._recovery, this._canvas);

        // GNOME 50 Clutter alignment keeps the alert exactly centered even
        // when the guest display resolution changes. This remains an entirely
        // non-reactive visual: GNOME owns keyboard focus and authentication.
        this._feedback = new St.Label({
            text: 'UNAUTHORIZED ACCESS',
            reactive: false,
            can_focus: false,
            style_class: 'mellon-m5-failure',
        });
        this._feedback.add_constraint(new Clutter.AlignConstraint({
            source: dialog,
            align_axis: Clutter.AlignAxis.BOTH,
            factor: 0.5,
        }));
        this._feedback.hide();
        dialog.insert_child_above(this._feedback, this._recovery);
    }

    revealNative() {
        if (this._destroyed || this._nativeRevealed)
            return;
        this._nativeRevealed = true;
        if (this._frameTimer) {
            GLib.source_remove(this._frameTimer);
            this._frameTimer = 0;
        }
        // Hiding our cover immediately exposes the original GNOME interface.
        this._background?.hide();
        this._canvas?.hide();
        this._recovery?.hide();
        this._feedback?.hide();
        try {
            this._dialog?.activate();
            this._dialog?._authPrompt?._passwordEntry?.grab_key_focus();
        } catch (_) {
            // Do not re-cover native GNOME even if focusing fails.
        }
    }

    setLength(length) {
        if (this._destroyed || this._nativeRevealed)
            return;
        this._target = clamp(length, 0, 9);
        if (length > 0) {
            this._deniedUntil = 0;
            this._feedback?.hide();
        }
        this._startFrames();
    }

    onFailed() {
        if (this._destroyed || this._nativeRevealed)
            return;
        // Every incorrect password shows the warning, including repeated
        // attempts. Never reveal GNOME's native prompt due to an attempt count;
        // the visible SHOW LOGIN control is the user's manual recovery path.
        this._target = 0;
        this._deniedStartedAt = GLib.get_monotonic_time() / 1000000;
        this._deniedUntil = this._deniedStartedAt + 1.5;
        this._feedback.opacity = 255;
        this._feedback.show();
        this._startFrames();
    }

    _startFrames() {
        if (this._destroyed || this._nativeRevealed)
            return;
        this._canvas.queue_repaint();
        if (this._frameTimer)
            return;
        this._frameTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
            FRAME_MS, () => {
                if (this._destroyed || !this._canvas) {
                    this._frameTimer = 0;
                    return GLib.SOURCE_REMOVE;
                }
                let changing = false;
                for (let i = 0; i < 9; i++) {
                    const target = i < this._target ? 1 : 0;
                    const v = this._energy[i];
                    const next = v + (target - v) * (target > v ? 0.38 : 0.28);
                    this._energy[i] = Math.abs(target - next) < .012 ? target : next;
                    changing ||= this._energy[i] !== target;
                }
                this._canvas.queue_repaint();
                const now = GLib.get_monotonic_time() / 1000000;
                if (now < this._deniedUntil) {
                    // Bold red beacon: flash around 2.3 times/sec for 1.5s.
                    // Uses the existing 8fps drawing timer, not a new loop.
                    const phase = Math.floor((now - this._deniedStartedAt) / 0.22);
                    this._feedback.opacity = phase % 2 === 0 ? 255 : 55;
                } else {
                    this._feedback?.hide();
                }
                if (!changing && now >= this._deniedUntil) {
                    this._frameTimer = 0;
                    return GLib.SOURCE_REMOVE;
                }
                return GLib.SOURCE_CONTINUE;
            });
    }

    _paint(cr, width, height) {
        if (width <= 1 || height <= 1)
            return;
        const [iw, ih] = this._scene.image_size;
        const scale = Math.max(width / iw, height / ih);
        const dx = (width - iw * scale) / 2;
        const dy = (height - ih * scale) / 2;
        const points = this._scene.vertices.map(([x, y]) => [
            dx + x * iw * scale, dy + y * ih * scale,
        ]);
        const strokeScale = clamp(Math.min(width / 1920, height / 1080), .6, 2.5);
        const denied = GLib.get_monotonic_time() / 1000000 < this._deniedUntil;
        const rgb = denied ? [1, .37, .48] : [.53, .83, 1];
        for (const [a, b] of this._scene.edges) {
            const intensity = Math.min(this._energy[a], this._energy[b]);
            if (intensity < .01)
                continue;
            cr.setSourceRGBA(...rgb, .64 * intensity);
            cr.setLineWidth(Math.max(.8, 1.4 * strokeScale));
            cr.moveTo(...points[a]);
            cr.lineTo(...points[b]);
            cr.stroke();
        }
        for (let i = 0; i < 9; i++) {
            const intensity = this._energy[i];
            if (intensity < .01)
                continue;
            const [x, y] = points[i];
            cr.setSourceRGBA(...rgb, .09 * intensity);
            cr.arc(x, y, 13 * strokeScale, 0, TAU);
            cr.fill();
            cr.setSourceRGBA(...rgb, .38 * intensity);
            cr.arc(x, y, 5.5 * strokeScale, 0, TAU);
            cr.fill();
            cr.setSourceRGBA(1, 1, 1, .94 * intensity);
            cr.arc(x, y, 2.0 * strokeScale, 0, TAU);
            cr.fill();
        }
    }

    destroy() {
        if (this._destroyed)
            return;
        this._destroyed = true;
        if (this._frameTimer) {
            GLib.source_remove(this._frameTimer);
            this._frameTimer = 0;
        }
        this._feedback?.destroy();
        this._recovery?.destroy();
        this._canvas?.destroy();
        this._background?.destroy();
        this._feedback = null;
        this._recovery = null;
        this._canvas = null;
        this._background = null;
        this._dialog = null;
    }
}

export default class MellonMVP extends Extension {
    enable() {
        this._epoch = 0;
        this._dialog = null;
        this._view = null;
        this._prompt = null;
        this._buffer = null;
        this._lastWarning = null;
        this._failureTracker = new FailureTracker();
        try {
            this._scene = readScene(GLib.build_filenamev([this.path, 'scene.json']));
            this._imagePath = GLib.build_filenamev([this.path, 'background.jpg']);
        } catch (error) {
            this._warn(error);
            return;  // Fail-safe: leave GNOME's native prompt fully functional.
        }
        this._timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, POLL_MS, () => {
            this._safeTick();
            return GLib.SOURCE_CONTINUE;
        });
        this._safeTick();
    }

    disable() {
        if (this._timer) {
            GLib.source_remove(this._timer);
            this._timer = 0;
        }
        this._unmount();
    }

    _warn(error) {
        // Do not log buffer lengths, keystrokes, texts or authentication state.
        const key = `${error?.name ?? 'Error'}:${error?.message ?? 'unknown'}`;
        if (key === this._lastWarning)
            return;
        this._lastWarning = key;
        console.warn(`[Mellon M5] ${key}`);
    }

    _safeTick() {
        try {
            this._tick();
        } catch (error) {
            this._warn(error);
            this._unmount();
        }
    }

    _invalidateSignals() {
        // GNOME may dispose prompt objects between ticks. Never disconnect
        // an already disposed GObject; epoch guards invalidate callbacks.
        this._epoch++;
        this._prompt = null;
        this._buffer = null;
    }

    _unmount() {
        this._invalidateSignals();
        this._failureTracker?.reset();
        this._view?.destroy();
        this._view = null;
        this._dialog = null;
    }

    _observeFailures(prompt) {
        if (!prompt || !this._view)
            return;
        const result = this._failureTracker.observe(prompt._userVerifier);
        if (!result.supported) {
            // On an unknown GNOME implementation, fail open to native UI.
            this._view.revealNative();
            return;
        }
        for (let i = 0; i < result.failures; i++)
            this._view?.onFailed();
    }

    _tick() {
        if (Main.sessionMode.currentMode !== 'unlock-dialog') {
            if (this._dialog)
                this._unmount();
            return;
        }
        const dialog = Main.screenShield?._dialog;
        if (!dialog || !dialog._backgroundGroup)
            return;
        if (dialog !== this._dialog) {
            this._unmount();
            const view = new MVPScene(dialog, this._scene, this._imagePath);
            this._view = view;
            this._dialog = dialog;
        }
        const prompt = dialog._authPrompt;
        const buffer = prompt?._passwordEntry?.clutter_text?.get_buffer?.();
        // Count retryable failures even when the prompt and buffer are stable.
        this._observeFailures(prompt);
        if (prompt === this._prompt && buffer === this._buffer)
            return;
        this._invalidateSignals();
        this._view?.setLength(0);
        if (!prompt || !buffer)
            return;
        this._prompt = prompt;
        this._buffer = buffer;
        const epoch = this._epoch;
        const current = () => epoch === this._epoch && this._view !== null;
        buffer.connect('notify::length', () => {
            if (current())
                this._view.setLength(buffer.get_length());
        });
        this._view.setLength(buffer.get_length());
    }
}
