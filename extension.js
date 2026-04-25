/*
 * Mellon — experimental GNOME unlock-dialog visual overhaul.
 *
 * Security model:
 * - This extension does NOT authenticate the user.
 * - This extension does NOT read, store, log, compare, or submit passwords.
 * - GNOME Shell/GDM/PAM remain the authentication authority.
 * - Keyboard events are observed only as anonymous activity pulses; printable
 *   key symbols are never logged or stored, and events are always propagated
 *   back to GNOME Shell.
 *
 * This is intended for personal/local experimentation. GNOME extension review
 * guidelines are stricter for unlock-dialog extensions, especially around
 * keyboard signals.
 */

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const UUID = 'mellon@nibir.local';
const STAR_COUNT = 420;
const FRAME_MS = 16;
const SUCCESS_ANIMATION_MS = 850;
const FAILURE_FLASH_MS = 650;

function logDebug(message) {
    // Keep logging intentionally quiet; uncomment while developing.
    // console.log(`[${UUID}] ${message}`);
}

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

function easeInOutCubic(t) {
    if (t < 0.5)
        return 4 * t * t * t;
    return 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function randomRange(min, max) {
    return min + Math.random() * (max - min);
}

class MellonOverlay {
    constructor() {
        this.actor = new St.Widget({
            style_class: 'mellon-root',
            x_expand: true,
            y_expand: true,
            reactive: false,
            can_focus: false,
            track_hover: false,
        });

        this._canvas = new Clutter.Canvas();
        this.actor.set_content(this._canvas);

        this._width = 1;
        this._height = 1;
        this._stars = [];
        this._activeStarIndexes = [];
        this._timerId = 0;
        this._drawSignalId = this._canvas.connect('draw', this._draw.bind(this));
        this._allocationSignalId = this.actor.connect('notify::allocation', () => this._syncSize());

        this._mode = 'idle';
        this._modeStartMs = 0;
        this._failureStartMs = 0;
        this._submitPulseStartMs = 0;

        this._createStars();
        this._syncSize();
        this.start();
    }

    destroy() {
        if (this._timerId) {
            GLib.source_remove(this._timerId);
            this._timerId = 0;
        }

        if (this._drawSignalId) {
            this._canvas.disconnect(this._drawSignalId);
            this._drawSignalId = 0;
        }

        if (this._allocationSignalId) {
            this.actor.disconnect(this._allocationSignalId);
            this._allocationSignalId = 0;
        }

        this.actor.destroy();
    }

    start() {
        if (this._timerId)
            return;

        this._timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, FRAME_MS, () => {
            this._tick();
            return GLib.SOURCE_CONTINUE;
        });
    }

    registerInputPulse() {
        if (this._mode === 'success')
            return;

        this._mode = 'idle';
        const inactive = [];
        for (let i = 0; i < this._stars.length; i++) {
            if (!this._stars[i].activated)
                inactive.push(i);
        }

        const index = inactive.length > 0
            ? inactive[Math.floor(Math.random() * inactive.length)]
            : Math.floor(Math.random() * this._stars.length);

        const star = this._stars[index];
        star.activated = true;
        star.targetBrightness = randomRange(0.82, 1.0);
        star.targetRadius = randomRange(1.9, 3.2);
        star.twinkleSpeed = randomRange(0.0015, 0.004);

        if (!this._activeStarIndexes.includes(index))
            this._activeStarIndexes.push(index);
    }

    registerBackspacePulse() {
        if (this._mode === 'success')
            return;

        const index = this._activeStarIndexes.pop();
        if (index === undefined) {
            this._softRipple();
            return;
        }

        const star = this._stars[index];
        star.activated = false;
        star.targetBrightness = star.baseBrightness;
        star.targetRadius = star.baseRadius;
    }

    registerSubmitPulse() {
        if (this._mode === 'success')
            return;

        this._submitPulseStartMs = GLib.get_monotonic_time() / 1000;
        this._prepareConstellationTargets();
        this._mode = 'submit';
        this._modeStartMs = this._submitPulseStartMs;
    }

    registerFailure() {
        if (this._mode === 'success')
            return;

        this._mode = 'failure';
        this._failureStartMs = GLib.get_monotonic_time() / 1000;
        this._modeStartMs = this._failureStartMs;

        for (const index of this._activeStarIndexes) {
            const star = this._stars[index];
            star.targetBrightness = 0.18;
            star.targetRadius = star.baseRadius;
        }
    }

    registerReset() {
        if (this._mode === 'success')
            return;

        this._mode = 'idle';
        this._activeStarIndexes = [];
        for (const star of this._stars) {
            star.activated = false;
            star.targetBrightness = star.baseBrightness;
            star.targetRadius = star.baseRadius;
            star.tx = star.x;
            star.ty = star.y;
            star.sx = star.x;
            star.sy = star.y;
        }
    }

    registerSuccess() {
        this._prepareConstellationTargets();
        this._mode = 'success';
        this._modeStartMs = GLib.get_monotonic_time() / 1000;
    }

    _createStars() {
        this._stars = [];
        this._activeStarIndexes = [];

        for (let i = 0; i < STAR_COUNT; i++) {
            const baseBrightness = randomRange(0.15, 0.55);
            const baseRadius = randomRange(0.55, 1.45);
            this._stars.push({
                x: Math.random(),
                y: Math.random(),
                sx: 0,
                sy: 0,
                tx: 0,
                ty: 0,
                baseBrightness,
                brightness: baseBrightness,
                targetBrightness: baseBrightness,
                baseRadius,
                radius: baseRadius,
                targetRadius: baseRadius,
                twinklePhase: randomRange(0, Math.PI * 2),
                twinkleSpeed: randomRange(0.0004, 0.0015),
                activated: false,
            });
        }
    }

    _syncSize() {
        const width = Math.max(1, Math.floor(this.actor.get_width()));
        const height = Math.max(1, Math.floor(this.actor.get_height()));

        if (width === this._width && height === this._height)
            return;

        this._width = width;
        this._height = height;
        this._canvas.set_size(width, height);
        this._canvas.invalidate();
    }

    _tick() {
        this._syncSize();
        const nowMs = GLib.get_monotonic_time() / 1000;

        for (const star of this._stars) {
            star.twinklePhase += star.twinkleSpeed * FRAME_MS;
            star.brightness += (star.targetBrightness - star.brightness) * 0.09;
            star.radius += (star.targetRadius - star.radius) * 0.10;

            if (this._mode === 'success' || this._mode === 'submit') {
                const elapsed = nowMs - this._modeStartMs;
                const duration = this._mode === 'success' ? SUCCESS_ANIMATION_MS : 460;
                const t = clamp(elapsed / duration, 0, 1);
                const eased = easeInOutCubic(t);

                if (star.activated) {
                    star.x = star.sx + (star.tx - star.sx) * eased;
                    star.y = star.sy + (star.ty - star.sy) * eased;
                    star.targetBrightness = this._mode === 'success' ? 1.0 : 0.88;
                    star.targetRadius = this._mode === 'success' ? 3.2 : 2.4;
                }
            }

            if (this._mode === 'failure') {
                const t = clamp((nowMs - this._failureStartMs) / FAILURE_FLASH_MS, 0, 1);
                if (t >= 1)
                    this.registerReset();
            }
        }

        this._canvas.invalidate();
    }

    _draw(canvas, cr, width, height) {
        // Background: deep sky gradient-ish bands, drawn manually with translucent fills.
        cr.setSourceRGBA(0.005, 0.012, 0.045, 1.0);
        cr.rectangle(0, 0, width, height);
        cr.fill();

        const nowMs = GLib.get_monotonic_time() / 1000;
        this._drawNebula(cr, width, height, nowMs);
        this._drawStars(cr, width, height, nowMs);
        this._drawConstellationLines(cr, width, height, nowMs);
        this._drawSubmitPulse(cr, width, height, nowMs);
        this._drawFailureFlash(cr, width, height, nowMs);

        return true;
    }

    _drawNebula(cr, width, height, nowMs) {
        const cx1 = width * 0.28 + Math.sin(nowMs * 0.00012) * width * 0.04;
        const cy1 = height * 0.36 + Math.cos(nowMs * 0.00009) * height * 0.04;
        const cx2 = width * 0.72 + Math.cos(nowMs * 0.0001) * width * 0.04;
        const cy2 = height * 0.62 + Math.sin(nowMs * 0.00011) * height * 0.04;

        this._drawGlow(cr, cx1, cy1, Math.max(width, height) * 0.45, 0.02, 0.06, 0.16, 0.18);
        this._drawGlow(cr, cx2, cy2, Math.max(width, height) * 0.36, 0.07, 0.02, 0.13, 0.16);
    }

    _drawGlow(cr, cx, cy, radius, r, g, b, alpha) {
        const steps = 16;
        for (let i = steps; i > 0; i--) {
            const t = i / steps;
            cr.setSourceRGBA(r, g, b, alpha * Math.pow(t, 2) * 0.12);
            cr.arc(cx, cy, radius * t, 0, Math.PI * 2);
            cr.fill();
        }
    }

    _drawStars(cr, width, height, nowMs) {
        for (const star of this._stars) {
            const x = star.x * width;
            const y = star.y * height;
            const twinkle = 0.85 + Math.sin(star.twinklePhase + nowMs * 0.0006) * 0.15;
            const brightness = clamp(star.brightness * twinkle, 0, 1);
            const radius = star.radius;

            if (star.activated) {
                cr.setSourceRGBA(0.62, 0.80, 1.0, brightness * 0.17);
                cr.arc(x, y, radius * 4.6, 0, Math.PI * 2);
                cr.fill();
            }

            cr.setSourceRGBA(0.82, 0.91, 1.0, brightness);
            cr.arc(x, y, radius, 0, Math.PI * 2);
            cr.fill();
        }
    }

    _drawConstellationLines(cr, width, height, nowMs) {
        if (this._mode !== 'success' && this._mode !== 'submit')
            return;

        const elapsed = nowMs - this._modeStartMs;
        const t = clamp(elapsed / (this._mode === 'success' ? SUCCESS_ANIMATION_MS : 460), 0, 1);
        const alpha = easeOutCubic(t) * (this._mode === 'success' ? 0.75 : 0.35);
        const active = this._activeStarIndexes.slice(0, Math.min(32, this._activeStarIndexes.length));

        if (active.length < 2)
            return;

        cr.setLineWidth(1.2);
        cr.setSourceRGBA(0.55, 0.76, 1.0, alpha);
        for (let i = 0; i < active.length - 1; i++) {
            const a = this._stars[active[i]];
            const b = this._stars[active[i + 1]];
            cr.moveTo(a.x * width, a.y * height);
            cr.lineTo(b.x * width, b.y * height);
            cr.stroke();
        }
    }

    _drawSubmitPulse(cr, width, height, nowMs) {
        if (!this._submitPulseStartMs)
            return;

        const t = clamp((nowMs - this._submitPulseStartMs) / 500, 0, 1);
        if (t >= 1)
            return;

        const radius = Math.max(width, height) * (0.18 + t * 0.62);
        cr.setLineWidth(2.0);
        cr.setSourceRGBA(0.45, 0.70, 1.0, (1 - t) * 0.18);
        cr.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
        cr.stroke();
    }

    _drawFailureFlash(cr, width, height, nowMs) {
        if (this._mode !== 'failure')
            return;

        const t = clamp((nowMs - this._failureStartMs) / FAILURE_FLASH_MS, 0, 1);
        const alpha = Math.sin(t * Math.PI) * 0.22;
        cr.setSourceRGBA(0.55, 0.02, 0.06, alpha);
        cr.rectangle(0, 0, width, height);
        cr.fill();
    }

    _prepareConstellationTargets() {
        const active = this._activeStarIndexes.length >= 5
            ? this._activeStarIndexes.slice(0, Math.min(32, this._activeStarIndexes.length))
            : this._promoteFallbackStars(12);

        this._activeStarIndexes = active;
        const pattern = this._patternPoints(active.length);

        for (let i = 0; i < active.length; i++) {
            const star = this._stars[active[i]];
            star.activated = true;
            star.sx = star.x;
            star.sy = star.y;
            star.tx = pattern[i].x;
            star.ty = pattern[i].y;
            star.targetBrightness = 0.94;
            star.targetRadius = 2.6;
        }
    }

    _promoteFallbackStars(count) {
        const indexes = [];
        while (indexes.length < count) {
            const index = Math.floor(Math.random() * this._stars.length);
            if (!indexes.includes(index))
                indexes.push(index);
        }
        return indexes;
    }

    _patternPoints(count) {
        // A compact rune-like constellation. Coordinates are normalized.
        const base = [
            [0.50, 0.24], [0.42, 0.34], [0.36, 0.48], [0.40, 0.63],
            [0.50, 0.76], [0.60, 0.63], [0.64, 0.48], [0.58, 0.34],
            [0.50, 0.24], [0.50, 0.76], [0.36, 0.48], [0.64, 0.48],
            [0.42, 0.34], [0.58, 0.34], [0.40, 0.63], [0.60, 0.63],
            [0.31, 0.56], [0.69, 0.56], [0.34, 0.41], [0.66, 0.41],
            [0.46, 0.18], [0.54, 0.18], [0.45, 0.82], [0.55, 0.82],
            [0.27, 0.50], [0.73, 0.50], [0.38, 0.72], [0.62, 0.72],
            [0.38, 0.28], [0.62, 0.28], [0.50, 0.50], [0.50, 0.50],
        ];

        const points = [];
        for (let i = 0; i < count; i++) {
            const p = base[i % base.length];
            points.push({x: p[0], y: p[1]});
        }
        return points;
    }

    _softRipple() {
        this._submitPulseStartMs = GLib.get_monotonic_time() / 1000;
    }
}

export default class MellonExtension extends Extension {
    enable() {
        this._overlay = null;
        this._dialog = null;
        this._hiddenActors = [];
        this._signalConnections = [];
        this._patched = [];
        this._readyTimerId = 0;

        this._installWhenReady();
    }

    // unlock-dialog is required because this extension changes the visual layer
    // of the active unlock screen. Cleanup is still performed for local safety.
    disable() {
        this._restorePatchedMethods();
        this._disconnectSignals();
        this._restoreHiddenActors();

        if (this._overlay) {
            this._overlay.destroy();
            this._overlay = null;
        }

        this._dialog = null;
    }

    _installWhenReady() {
        const dialog = Main.screenShield?._dialog;
        if (!dialog) {
            this._readyTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
                this._readyTimerId = 0;
                this._installWhenReady();
                return GLib.SOURCE_REMOVE;
            });
            return;
        }

        this._dialog = dialog;
        this._installOverlay(dialog);
        this._hideNativeUnlockUi(dialog);
        this._connectInputSignals(dialog);
        this._connectAuthSignals(dialog);
        this._patchFinishUnlock(dialog);
    }

    _installOverlay(dialog) {
        this._overlay = new MellonOverlay();

        const parent = dialog._stack ?? dialog;
        parent.add_child(this._overlay.actor);
        this._overlay.actor.set_x_align(Clutter.ActorAlign.FILL);
        this._overlay.actor.set_y_align(Clutter.ActorAlign.FILL);
        this._overlay.actor.set_x_expand(true);
        this._overlay.actor.set_y_expand(true);

        if (this._overlay.actor.raise_top)
            this._overlay.actor.raise_top();
    }

    _hideNativeUnlockUi(dialog) {
        // Keep the real auth widgets alive/focused, only make them invisible.
        // Password input still goes through GNOME Shell/GDM/PAM.
        const candidates = [
            dialog._clock,
            dialog._notificationsBox,
            dialog._mediaControls,
            dialog._promptBox,
            dialog._authPrompt,
        ].filter(actor => actor && actor.opacity !== undefined);

        for (const actor of candidates) {
            this._hiddenActors.push({actor, opacity: actor.opacity, visible: actor.visible});
            actor.opacity = 0;
        }
    }

    _restoreHiddenActors() {
        for (const item of this._hiddenActors) {
            try {
                if (item.actor) {
                    item.actor.opacity = item.opacity;
                    item.actor.visible = item.visible;
                }
            } catch (e) {
                // Actor may already be destroyed during session-mode transition.
            }
        }
        this._hiddenActors = [];
    }

    _connectInputSignals(_dialog) {
        // Observe anonymous key activity only. We intentionally do not inspect
        // the password entry text. The event is always propagated to GNOME.
        this._connect(global.stage, 'captured-event', (_actor, event) => {
            if (event.type() !== Clutter.EventType.KEY_PRESS)
                return Clutter.EVENT_PROPAGATE;

            const keySymbol = event.get_key_symbol();
            switch (keySymbol) {
            case Clutter.KEY_BackSpace:
                this._overlay?.registerBackspacePulse();
                break;
            case Clutter.KEY_Return:
            case Clutter.KEY_KP_Enter:
                this._overlay?.registerSubmitPulse();
                break;
            case Clutter.KEY_Escape:
                this._overlay?.registerReset();
                break;
            case Clutter.KEY_Shift_L:
            case Clutter.KEY_Shift_R:
            case Clutter.KEY_Control_L:
            case Clutter.KEY_Control_R:
            case Clutter.KEY_Alt_L:
            case Clutter.KEY_Alt_R:
            case Clutter.KEY_Super_L:
            case Clutter.KEY_Super_R:
            case Clutter.KEY_Caps_Lock:
                break;
            default:
                this._overlay?.registerInputPulse();
                break;
            }

            return Clutter.EVENT_PROPAGATE;
        });
        logDebug('connected to anonymous captured-event input pulses');
    }

    _connectAuthSignals(dialog) {
        const prompt = dialog._authPrompt;
        if (!prompt)
            return;

        this._tryConnect(prompt, 'failed', () => this._overlay?.registerFailure());
        this._tryConnect(prompt, 'reset', () => this._overlay?.registerReset());
        this._tryConnect(prompt, 'cancelled', () => this._overlay?.registerReset());

        // This is not a guaranteed success signal across GNOME versions, but it
        // gives a nice pulse on submit for versions where it fires in the flow.
        this._tryConnect(prompt, 'next', () => this._overlay?.registerSubmitPulse());
    }

    _patchFinishUnlock(dialog) {
        // GNOME internals move around. Patch only if a known finish method exists.
        // The patch does not change auth: it only delays the final visual teardown
        // briefly so the constellation can form after successful verification.
        const candidates = ['_finishUnlock', '_completeUnlock', '_onUnlockComplete'];
        for (const name of candidates) {
            if (typeof dialog[name] !== 'function')
                continue;

            const original = dialog[name];
            let delaying = false;
            dialog[name] = (...args) => {
                if (delaying)
                    return original.apply(dialog, args);

                delaying = true;
                this._overlay?.registerSuccess();
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, SUCCESS_ANIMATION_MS, () => {
                    try {
                        original.apply(dialog, args);
                    } finally {
                        delaying = false;
                    }
                    return GLib.SOURCE_REMOVE;
                });
            };

            this._patched.push({object: dialog, name, original});
            logDebug(`patched ${name}`);
            return;
        }
    }

    _restorePatchedMethods() {
        for (const patch of this._patched) {
            try {
                patch.object[patch.name] = patch.original;
            } catch (e) {
                // Object may already be gone.
            }
        }
        this._patched = [];
    }

    _tryConnect(object, signal, callback) {
        try {
            this._connect(object, signal, callback);
        } catch (e) {
            logDebug(`signal not available: ${signal}`);
        }
    }

    _connect(object, signal, callback) {
        const id = object.connect(signal, callback);
        this._signalConnections.push({object, id});
        return id;
    }

    _disconnectSignals() {
        for (const connection of this._signalConnections) {
            try {
                connection.object.disconnect(connection.id);
            } catch (e) {
                // Object may already be destroyed during unlock.
            }
        }
        this._signalConnections = [];

        if (this._readyTimerId) {
            GLib.source_remove(this._readyTimerId);
            this._readyTimerId = 0;
        }
    }
}
