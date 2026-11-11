import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {FailureTracker} from './failure-tracker.js';
import {validateLibrary, pickScene, activationCount, coverTransform,
    updateActiveStars, activeEdges} from './scene-data.js';
import {StellarEffects, completionWave, completionLevel,
    starLightProfile, connectionLightProfile} from './stellar-effects.js';

/**
 * Mellon M7: bounded transient effects on M6.4's verified photographic stars.
 * Native authentication, password entry, focus, retries and locking remain
 * entirely GNOME-owned. We inspect only buffer length, never text or keys.
 * SHOW LOGIN manually reveals native UI. Each failed password shows an alert;
 * no failure count automatically reveals the native password field.
 * Read-only GNOME verifier polling does not modify authentication.
 * VM ONLY. Never install Mellon M7 on the BlackPearl host.
 */
const POLL_MS = 250;
// ~16 fps *only while visual state is changing*. No idle render loop.
const FRAME_MS = 62;
const clamp = (v, low, high) => Math.max(low, Math.min(high, v));

function readJSON(path) {
    const [ok, bytes] = GLib.file_get_contents(path);
    if (!ok)
        throw new Error('M7 scene data unavailable');
    return JSON.parse(new TextDecoder().decode(bytes));
}

function loadM7Library(root) {
    const library = validateLibrary(readJSON(
        GLib.build_filenamev([root, 'library.json'])));
    // Fail open if ANY of the twelve scenes is incomplete, never hide native
    // authentication under a partially installed asset pack.
    for (const scene of library.scenes) {
        for (const rel of [scene.image, ...scene.sprites]) {
            const file = Gio.File.new_for_path(GLib.build_filenamev([root, rel]));
            if (!file.query_exists(null))
                throw new Error('M7 scene asset unavailable');
        }
    }
    return library;
}

class MVPScene {
    constructor(dialog, scene, imagePath, spritePaths, stages) {
        this._dialog = dialog;
        this._scene = scene;
        this._destroyed = false;
        this._target = 0;
        this._energy = new Float32Array(scene.vertices.length);
        this._active = new Uint8Array(scene.vertices.length);
        this._effects = new StellarEffects(scene.vertices.length, scene.edges);
        const center = scene.vertices.reduce(([x, y], p) =>
            [x + p[0] / scene.vertices.length, y + p[1] / scene.vertices.length],
        [0, 0]);
        const radii = scene.vertices.map(([x, y]) => Math.hypot(
            (x - center[0]) * scene.image_size[0],
            (y - center[1]) * scene.image_size[1]));
        const maxRadius = Math.max(...radii, 1);
        this._radialFractions = radii.map(r => r / maxRadius);
        this._stages = stages;
        this._spriteViewport = null;
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

        // Transparent photo-derived star-light patches. These small
        // sprites contain only the ORIGINAL selected star pixels, enlarged
        // and brightened without painting arbitrary colored nodes.
        this._sprites = spritePaths.map(path => {
            const spriteFile = Gio.File.new_for_path(path);
            if (!spriteFile.query_exists(null))
                throw new Error('M7 source-colored star pixels missing');
            const sprite = new St.Widget({reactive: false, can_focus: false});
            sprite.set_style(
                `background-image: url("${spriteFile.get_uri()}"); ` +
                'background-size: contain; background-repeat: no-repeat;');
            sprite.opacity = 0;
            // Ignition and completion waves enlarge only the original
            // source-photography pixels; no new artificial stars are drawn.
            sprite.set_pivot_point(0.5, 0.5);
            return sprite;
        });
        // A second copy of each ORIGINAL photographic sprite provides
        // the ignition burst and permanent post-completion bloom. The
        // texture is identical; no synthetic dots, disks or colors.
        this._halos = spritePaths.map(path => {
            const spriteFile = Gio.File.new_for_path(path);
            const halo = new St.Widget({reactive: false, can_focus: false});
            halo.set_style(
                `background-image: url("${spriteFile.get_uri()}"); ` +
                'background-size: contain; background-repeat: no-repeat;');
            halo.opacity = 0;
            halo.set_pivot_point(0.5, 0.5);
            return halo;
        });
        let previous = this._canvas;
        for (let i = 0; i < this._sprites.length; i++) {
            dialog.insert_child_above(this._halos[i], previous);
            dialog.insert_child_above(this._sprites[i], this._halos[i]);
            previous = this._sprites[i];
        }

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
        dialog.insert_child_above(this._recovery,
            this._sprites.at(-1) ?? this._canvas);

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
        this._sprites?.forEach(sprite => sprite.hide());
        this._halos?.forEach(halo => halo.hide());
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
        const desired = activationCount(length, this._energy.length, this._stages);
        // Visually choose from currently unlit/lit REAL photo stars.
        // Different stars are chosen independently for each character
        // insertion or deletion, never in fixed template-index order.
        this._active = updateActiveStars(this._active, desired);
        this._effects.transition(this._active,
            GLib.get_monotonic_time() / 1000000);
        this._target = desired;
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
        this._active.fill(0);
        // A failed authentication cancels ALL pending light effects.
        this._effects.reset();
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
                const now = GLib.get_monotonic_time() / 1000000;
                const fx = this._effects.sample(now);
                // Latch sustained brightness only AFTER the entire
                // constellation has completed its spectacular wave.
                // Backspace/reset clears it through StellarEffects.
                const persistent = completionLevel(fx);
                let changing = fx.busy;
                // Keep the original M6 125ms fade time constant despite
                // increasing transient animation frequency to ~16fps.
                const dt = FRAME_MS / 125;
                for (let i = 0; i < this._energy.length; i++) {
                    const target = this._active[i] === 1 ? 1 : 0;
                    const v = this._energy[i];
                    const rate = target > v ? 0.38 : 0.28;
                    const step = 1 - Math.pow(1 - rate, dt);
                    const next = v + (target - v) * step;
                    this._energy[i] = Math.abs(target - next) < .012 ? target : next;
                    this._sprites[i].opacity = Math.round(255 * this._energy[i]);
                    const wave = fx.completion === null ? 0 :
                        completionWave(fx.completion, this._radialFractions[i]);
                    const flare = fx.ignition[i];
                    // Strong flash: the *photographed* star expands and a
                    // wide translucent copy of the same source pixels
                    // blooms behind it, without adding a drawn star marker.
                    const profile = starLightProfile(flare, wave, persistent);
                    this._sprites[i].set_scale(profile.coreScale,
                        profile.coreScale);
                    this._halos[i].set_scale(profile.haloScale,
                        profile.haloScale);
                    // Ignition starts before the base star reaches maximum
                    // opacity. Post-completion bloom is continuously visible
                    // but uses no timer once the animation finishes.
                    this._halos[i].opacity = Math.round(
                        255 * profile.haloStrength *
                        (this._active[i] ? 1 : this._energy[i]));
                    changing ||= this._energy[i] !== target;
                }
                this._canvas.queue_repaint();
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
        const {scale, dx, dy} = coverTransform(width, height, iw, ih);
        const points = this._scene.vertices.map(([x, y]) => [
            dx + x * iw * scale, dy + y * ih * scale,
        ]);
        // Position the 26px photo sprites only when the screen geometry
        // changes, never on every 125ms animation frame.
        if (!this._spriteViewport ||
            this._spriteViewport.width !== width ||
            this._spriteViewport.height !== height) {
            const [spriteW, spriteH] = this._scene.sprite_size;
            for (let i = 0; i < points.length; i++) {
                this._sprites[i].set_position(
                    points[i][0] - spriteW * scale / 2,
                    points[i][1] - spriteH * scale / 2);
                this._sprites[i].set_size(spriteW * scale, spriteH * scale);
                this._halos[i].set_position(
                    points[i][0] - spriteW * scale / 2,
                    points[i][1] - spriteH * scale / 2);
                this._halos[i].set_size(spriteW * scale, spriteH * scale);
            }
            this._spriteViewport = {width, height};
        }

        const strokeScale = clamp(Math.min(width / 1920, height / 1080), .6, 2.5);
        const denied = GLib.get_monotonic_time() / 1000000 < this._deniedUntil;
        const rgb = denied ? [1, .37, .48] : [.53, .83, 1];
        const fx = this._effects.sample(GLib.get_monotonic_time() / 1000000);
        const persistent = completionLevel(fx);
        for (const [a, b] of activeEdges(this._scene.edges, this._active)) {
            const intensity = Math.min(this._energy[a], this._energy[b]);
            if (intensity < .01)
                continue;
            // The photo-based star sprite is drawn by St, not by Cairo.
            // Only the thin connector is rendered on this canvas.
            const wave = fx.completion === null ? 0 :
                .5 * (completionWave(fx.completion, this._radialFractions[a]) +
                      completionWave(fx.completion, this._radialFractions[b]));
            // Completion wave: dramatic broad luminous underlay + strong
            // concentrated line, using only genuine constellation edges.
            // After settling, keep both strokes bright and stationary.
            const profile = connectionLightProfile(wave, persistent);
            if (profile.glowAlpha > .01) {
                cr.setSourceRGBA(...rgb, profile.glowAlpha * intensity);
                cr.setLineWidth(Math.max(2.4,
                    profile.glowWidth * strokeScale));
                cr.moveTo(...points[a]);
                cr.lineTo(...points[b]);
                cr.stroke();
            }
            cr.setSourceRGBA(...rgb, profile.lineAlpha * intensity);
            cr.setLineWidth(Math.max(.65,
                profile.lineWidth * strokeScale));
            cr.moveTo(...points[a]);
            cr.lineTo(...points[b]);
            cr.stroke();
        }
        // A compact directional energy packet runs ONLY along an edge
        // whose two original source stars are currently illuminated.
        for (const pulse of fx.pulses) {
            if (!this._active[pulse.from] || !this._active[pulse.to])
                continue;
            const a = points[pulse.from];
            const b = points[pulse.to];
            const start = Math.max(0, pulse.progress - .19);
            const end = pulse.progress;
            cr.setSourceRGBA(.79, .94, 1, .88 * pulse.strength);
            cr.setLineWidth(Math.max(1.2, 2.5 * strokeScale));
            cr.moveTo(a[0] + (b[0]-a[0])*start,
                      a[1] + (b[1]-a[1])*start);
            cr.lineTo(a[0] + (b[0]-a[0])*end,
                      a[1] + (b[1]-a[1])*end);
            cr.stroke();
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
        this._sprites?.forEach(sprite => sprite.destroy());
        this._halos?.forEach(halo => halo.destroy());
        this._background?.destroy();
        this._feedback = null;
        this._recovery = null;
        this._canvas = null;
        this._sprites = null;
        this._halos = null;
        this._active = null;
        this._effects?.reset();
        this._effects = null;
        this._radialFractions = null;
        this._spriteViewport = null;
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
        this._lastSceneId = null;
        try {
            this._library = loadM7Library(this.path);
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
        console.warn(`[Mellon M7] ${key}`);
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
            // Config is reloaded at EACH lock; the twelve scenes remain
            // switched manually without needing a new extension install.
            const config = readJSON(GLib.build_filenamev([
                this.path, 'scene-config.json']));
            const scene = pickScene(this._library, config, this._lastSceneId);
            const root = this.path;
            const image = GLib.build_filenamev([root, scene.image]);
            const sprites = scene.sprites.map(rel =>
                GLib.build_filenamev([root, rel]));
            const view = new MVPScene(dialog, scene, image, sprites,
                config.stages ?? 8);
            this._view = view;
            this._dialog = dialog;
            this._lastSceneId = scene.id;
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
