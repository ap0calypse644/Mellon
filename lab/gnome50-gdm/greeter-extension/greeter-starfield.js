import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import {activationCount, updateActiveStars, activeEdges, coverTransform}
    from './scene-data.js';
import {StellarEffects, completionWave, completionLevel,
    starLightProfile, connectionLightProfile} from './stellar-effects.js';

// G1.4 source-only visual module. NO auth APIs, no GDM dialog traversal,
// no password fields. It accepts *only* a bounded, numeric input length.
// Photo pixels, vertex geometry, edges, and effect envelopes are identical
// to the approved M8.3.2 user unlock-scene engine.
const FRAME_MS = 62;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class GreeterStarfield {
    constructor(parent, scene, spritePaths, hud) {
        this._destroyed = false;
        this._scene = scene;
        this._hud = hud;
        this._count = scene.vertices.length;
        this._active = new Uint8Array(this._count);
        this._energy = new Float32Array(this._count);
        this._fx = new StellarEffects(this._count, scene.edges);
        this._timer = 0;
        this._viewport = null;
        const center = scene.vertices.reduce(([x, y], p) =>
            [x + p[0] / this._count, y + p[1] / this._count], [0, 0]);
        const distances = scene.vertices.map(([x, y]) => Math.hypot(
            (x - center[0]) * scene.image_size[0],
            (y - center[1]) * scene.image_size[1]));
        const maxRadius = Math.max(...distances, 1);
        this._radial = distances.map(v => v / maxRadius);

        // A non-interactive, fixed-layout layer below the actual LoginDialog.
        // No layer intercepts focus or pointer/keyboard input.
        this.actor = new St.Widget({
            reactive: false, can_focus: false,
            layout_manager: new Clutter.FixedLayout(),
        });
        this.actor.add_constraint(new Clutter.BindConstraint({
            source: parent, coordinate: Clutter.BindCoordinate.SIZE,
        }));
        this._canvas = new St.DrawingArea({reactive: false});
        this._canvas.add_constraint(new Clutter.BindConstraint({
            source: this.actor, coordinate: Clutter.BindCoordinate.SIZE,
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
        this.actor.add_child(this._canvas);

        if (!Array.isArray(spritePaths) || spritePaths.length !== this._count)
            throw new Error('Invalid original source-star sprite pack');
        const makeSprite = path => {
            const file = Gio.File.new_for_path(path);
            if (!file.query_exists(null))
                throw new Error('Source-photographic star sprite unavailable');
            const widget = new St.Widget({reactive: false, can_focus: false});
            widget.set_style(
                `background-image: url("${file.get_uri()}"); ` +
                'background-size: contain; background-repeat: no-repeat;');
            widget.opacity = 0;
            widget.set_pivot_point(0.5, 0.5);
            return widget;
        };
        this._sprites = [];
        this._halos = [];
        try {
            for (const path of spritePaths) {
                // Both images display ONLY original source-photography
                // pixels, never synthetic constellation points.
                const halo = makeSprite(path);
                const core = makeSprite(path);
                this.actor.add_child(halo);
                this.actor.add_child(core);
                this._halos.push(halo);
                this._sprites.push(core);
            }
        } catch (error) {
            this.destroy();
            throw error;
        }
        this.actor.connect('notify::width', () => this._canvas?.queue_repaint());
        this.actor.connect('notify::height', () => this._canvas?.queue_repaint());
        this._canvas.queue_repaint();
    }

    setLength(length) {
        if (this._destroyed)
            return;
        // Never store the input length, text, key events, password state or
        // authentication result. Only update the anonymous visual star mask.
        const desired = activationCount(length, this._count, 8);
        const next = updateActiveStars(this._active, desired);
        this._active = next;
        this._fx.transition(next, GLib.get_monotonic_time() / 1000000);
        this._hud?.setMapping(next);
        this._startFrames();
    }

    clear() {
        if (this._destroyed)
            return;
        this._active.fill(0);
        this._fx.reset();
        this._hud?.setMapping(this._active);
        this._hud?.setCompletion(null);
        this._startFrames();
    }

    _startFrames() {
        if (this._destroyed)
            return;
        this._canvas.queue_repaint();
        if (this._timer)
            return;
        this._timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, FRAME_MS,
            () => {
                if (this._destroyed || !this._canvas) {
                    this._timer = 0;
                    return GLib.SOURCE_REMOVE;
                }
                const now = GLib.get_monotonic_time() / 1000000;
                const fx = this._fx.sample(now);
                this._hud?.setCompletion(fx);
                const persistent = completionLevel(fx);
                let busy = fx.busy;
                for (let i = 0; i < this._count; i++) {
                    const goal = this._active[i] ? 1 : 0;
                    const previous = this._energy[i];
                    const rate = goal > previous ? .38 : .28;
                    const step = 1 - Math.pow(1 - rate, FRAME_MS / 125);
                    const next = previous + (goal - previous) * step;
                    this._energy[i] = Math.abs(goal - next) < .012 ? goal : next;
                    this._sprites[i].opacity = Math.round(255 * this._energy[i]);
                    const wave = fx.completion === null ? 0 :
                        completionWave(fx.completion, this._radial[i]);
                    const profile = starLightProfile(fx.ignition[i],
                        wave, persistent);
                    this._sprites[i].set_scale(profile.coreScale,
                        profile.coreScale);
                    this._halos[i].set_scale(profile.haloScale,
                        profile.haloScale);
                    this._halos[i].opacity = Math.round(
                        255 * profile.haloStrength *
                        (this._active[i] ? 1 : this._energy[i]));
                    busy ||= this._energy[i] !== goal;
                }
                this._canvas.queue_repaint();
                if (!busy) {
                    this._timer = 0;
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
        const points = this._scene.vertices.map(([x, y]) =>
            [dx + x * iw * scale, dy + y * ih * scale]);
        if (!this._viewport || this._viewport.width !== width ||
            this._viewport.height !== height) {
            const [sw, sh] = this._scene.sprite_size;
            for (let i = 0; i < this._count; i++) {
                const x = points[i][0] - sw * scale / 2;
                const y = points[i][1] - sh * scale / 2;
                for (const sprite of [this._sprites[i], this._halos[i]]) {
                    sprite.set_position(x, y);
                    sprite.set_size(sw * scale, sh * scale);
                }
            }
            this._viewport = {width, height};
        }

        const now = GLib.get_monotonic_time() / 1000000;
        const fx = this._fx.sample(now);
        const persistent = completionLevel(fx);
        const strokeScale = clamp(Math.min(width / 1920, height / 1080), .6, 2.5);
        const rgb = [.53, .83, 1];
        for (const [a, b] of activeEdges(this._scene.edges, this._active)) {
            const intensity = Math.min(this._energy[a], this._energy[b]);
            if (intensity < .01)
                continue;
            const wave = fx.completion === null ? 0 :
                .5 * (completionWave(fx.completion, this._radial[a]) +
                completionWave(fx.completion, this._radial[b]));
            const profile = connectionLightProfile(wave, persistent);
            if (profile.glowAlpha > .01) {
                cr.setSourceRGBA(...rgb, profile.glowAlpha * intensity);
                cr.setLineWidth(Math.max(2.4, profile.glowWidth * strokeScale));
                cr.moveTo(...points[a]);
                cr.lineTo(...points[b]);
                cr.stroke();
            }
            cr.setSourceRGBA(...rgb, profile.lineAlpha * intensity);
            cr.setLineWidth(Math.max(.65, profile.lineWidth * strokeScale));
            cr.moveTo(...points[a]);
            cr.lineTo(...points[b]);
            cr.stroke();
        }
        for (const pulse of fx.pulses) {
            if (!this._active[pulse.from] || !this._active[pulse.to])
                continue;
            const a = points[pulse.from], b = points[pulse.to];
            const start = Math.max(0, pulse.progress - .19);
            cr.setSourceRGBA(.79, .94, 1, .88 * pulse.strength);
            cr.setLineWidth(Math.max(1.2, 2.5 * strokeScale));
            cr.moveTo(a[0] + (b[0] - a[0]) * start,
                a[1] + (b[1] - a[1]) * start);
            cr.lineTo(a[0] + (b[0] - a[0]) * pulse.progress,
                a[1] + (b[1] - a[1]) * pulse.progress);
            cr.stroke();
        }
    }

    destroy() {
        if (this._destroyed)
            return;
        this._destroyed = true;
        if (this._timer) {
            GLib.source_remove(this._timer);
            this._timer = 0;
        }
        this._fx?.reset();
        this.actor?.destroy();
        this.actor = null;
        this._sprites = null;
        this._halos = null;
        this._canvas = null;
        this._scene = null;
        this._hud = null;
        this._fx = null;
        this._active = null;
        this._energy = null;
    }
}
