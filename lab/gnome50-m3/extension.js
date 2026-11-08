import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

/**
 * Mellon M3 / The Observatory — GNOME Shell 50 VM-only prototype.
 *
 * The graphics are drawn behind GNOME's existing auth interface. We observe
 * only the native password buffer's character *count*, never its contents,
 * keystrokes, cursor position, clipboard, or authentication credentials.
 *
 * All coordinates are normalized; the native user avatar and password field
 * live in the intentionally quieter central corridor.
 */

const FRAME_MS = 125;   // 8 FPS: restrained CPU/GPU load inside virt-manager.
const POLL_MS = 250;    // GNOME lazily creates/destroys its auth prompt.
const MAX_LIGHTS = 24;
const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const now = () => GLib.get_monotonic_time() / 1_000_000;

// A recognizable *schematic* celestial chart, not astronomical sky coordinates.
// Orion (left) -> Cygnus / Northern Cross (right) -> Cassiopeia (top).
// Edges are explicit. There are never any accidental lines across GNOME's UI.
const NODES = [
    // ORION: head, shoulders, three belt stars, legs, sword and left arm.
    {x: .255, y: .315}, // 0  Meissa
    {x: .181, y: .385}, // 1  Betelgeuse
    {x: .326, y: .410}, // 2  Bellatrix
    {x: .208, y: .525}, // 3  Alnitak
    {x: .247, y: .535}, // 4  Alnilam
    {x: .287, y: .545}, // 5  Mintaka
    {x: .191, y: .708}, // 6  Saiph
    {x: .320, y: .720}, // 7  Rigel
    {x: .254, y: .613}, // 8  Sword
    {x: .121, y: .464}, // 9  Arm

    // CYGNUS: Deneb to Albireo (spine), with spread wings.
    {x: .776, y: .307}, // 10 Deneb
    {x: .778, y: .438}, // 11 Sadr
    {x: .778, y: .567}, // 12 spine
    {x: .775, y: .739}, // 13 Albireo
    {x: .695, y: .478}, // 14 left wing
    {x: .864, y: .474}, // 15 right wing
    {x: .657, y: .409}, // 16 left tip
    {x: .908, y: .390}, // 17 right tip

    // CASSIOPEIA: the unmistakable W, safely above the native avatar.
    {x: .382, y: .195}, // 18
    {x: .436, y: .112}, // 19
    {x: .508, y: .200}, // 20
    {x: .586, y: .110}, // 21
    {x: .652, y: .196}, // 22
    {x: .704, y: .145}, // 23
];

const EDGES = [
    [0, 1], [0, 2], [1, 3], [2, 5], [3, 4], [4, 5],
    [3, 6], [5, 7], [4, 8], [1, 9],
    [10, 11], [11, 12], [12, 13], [11, 14], [11, 15],
    [14, 16], [15, 17],
    [18, 19], [19, 20], [20, 21], [21, 22], [22, 23],
];

// Stable pseudorandom stars across re-locks, independent of user input.
function generator(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

function makeDust() {
    const random = generator(0xACCE5503);
    const all = [];
    const layers = [
        {count: 280, depth: .15, radius: .38, alpha: .16},
        {count: 118, depth: .40, radius: .68, alpha: .30},
        {count: 28, depth: .85, radius: 1.14, alpha: .51},
    ];
    for (const layer of layers) {
        for (let i = 0; i < layer.count; i++) {
            const x = random();
            const y = random();
            // Keep the native authentication corridor quiet and readable.
            const centered = x > .36 && x < .65 && y > .27 && y < .75;
            all.push({
                x, y,
                depth: layer.depth,
                radius: layer.radius * (.72 + random() * .9),
                alpha: layer.alpha * (.52 + random() * .75) *
                    (centered ? .28 : 1),
                phase: random() * TAU,
                speed: .3 + random() * 1.0,
                tint: random(),
            });
        }
    }
    return all;
}

class ObservatorySky {
    constructor(dialog) {
        this._destroyed = false;
        this._target = 0;
        this._energies = new Float32Array(MAX_LIGHTS);
        this._mode = 'idle';
        this._modeAt = 0;
        this._dust = makeDust();
        this._startAt = now();

        // This is the GNOME 50 rendering API validated by the working M2.2.
        this.area = new St.DrawingArea({reactive: false});
        this.area.add_constraint(new Clutter.BindConstraint({
            source: dialog,
            coordinate: Clutter.BindCoordinate.SIZE,
        }));
        this.area.connect('repaint', area => {
            if (this._destroyed)
                return;
            const [width, height] = area.get_surface_size();
            const cr = area.get_context();
            try {
                this._draw(cr, width, height);
            } finally {
                cr.$dispose();
            }
        });

        // Behind the GNOME avatar/password field; not reactive to mouse/keys.
        dialog.insert_child_above(this.area, dialog._backgroundGroup);

        this._timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, FRAME_MS, () => {
            if (this._destroyed || !this.area)
                return GLib.SOURCE_REMOVE;
            this._animate();
            this.area.queue_repaint();
            return GLib.SOURCE_CONTINUE;
        });
    }

    setCount(length) {
        this._target = clamp(length, 0, MAX_LIGHTS);
        if (this._mode === 'denied' && length > 0)
            this._mode = 'idle';
        this.area?.queue_repaint();
    }

    setMode(mode) {
        this._mode = mode;
        this._modeAt = now();
        this.area?.queue_repaint();
    }

    _animate() {
        for (let i = 0; i < MAX_LIGHTS; i++) {
            const target = i < this._target ? 1 : 0;
            // Brighten decisively; fall away slowly when Backspace removes a star.
            const rate = target > this._energies[i] ? .32 : .14;
            const value = this._energies[i] + (target - this._energies[i]) * rate;
            this._energies[i] = Math.abs(value - target) < .008 ? target : value;
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
        if (this.area) {
            this.area.destroy();
            this.area = null;
        }
    }

    _ellipse(cr, x, y, radiusX, radiusY, color, opacity) {
        cr.save();
        cr.translate(x, y);
        cr.scale(radiusX, radiusY);
        cr.setSourceRGBA(...color, opacity);
        cr.arc(0, 0, 1, 0, TAU);
        cr.fill();
        cr.restore();
    }

    _cloud(cr, width, height, time, config) {
        const [x, y, rx, ry, color, opacity, drift] = config;
        const cx = width * (x + Math.sin(time * .026 + drift) * .018);
        const cy = height * (y + Math.cos(time * .018 + drift) * .015);
        for (let layer = 13; layer >= 1; layer--) {
            const fraction = layer / 13;
            this._ellipse(cr, cx, cy, width * rx * fraction,
                height * ry * fraction, color,
                opacity * (1 - fraction) * .21);
        }
    }

    _background(cr, width, height, time) {
        cr.setSourceRGB(.007, .010, .027);
        cr.paint();

        // Faint volumetric nebulae: asymmetry gives the sky depth.
        this._cloud(cr, width, height, time,
            [.17, .39, .37, .50, [.31, .08, .47], .105, 0.4]);
        this._cloud(cr, width, height, time,
            [.88, .63, .38, .46, [.025, .22, .35], .093, 2.7]);
        this._cloud(cr, width, height, time,
            [.47, .06, .31, .30, [.19, .09, .43], .065, 1.6]);
        this._cloud(cr, width, height, time,
            [.64, .92, .35, .28, [.08, .11, .33], .048, 4.1]);

        // A very restrained navigation dial either side of the real prompt.
        const dialRadius = Math.min(width, height) * .30;
        cr.setLineWidth(.7);
        cr.setSourceRGBA(.41, .61, .85, .048);
        for (const x of [width * .24, width * .78]) {
            for (const radius of [dialRadius * .5, dialRadius * .86]) {
                cr.arc(x, height * .53, radius, 0, TAU);
                cr.stroke();
            }
        }
    }

    _starfield(cr, width, height, time) {
        const unit = Math.max(.70, Math.min(width, height) / 920);
        for (const star of this._dust) {
            // Tiny parallax; no jitter and no abrupt wrap within ordinary use.
            const travel = (time - this._startAt) * star.depth * .000003;
            const x = (star.x + travel) % 1;
            const y = star.y;
            const shimmer = .84 + .16 * Math.sin(time * star.speed + star.phase);
            const color = star.tint > .84
                ? [.72, .68, 1.0]
                : star.tint > .58
                    ? [.64, .87, 1.0]
                    : [.83, .88, 1.0];
            cr.setSourceRGBA(...color, star.alpha * shimmer);
            cr.arc(x * width, y * height,
                Math.max(.36, star.radius * unit), 0, TAU);
            cr.fill();
            if (star.depth > .8 && star.tint > .88) {
                cr.setSourceRGBA(...color, star.alpha * shimmer * .045);
                cr.arc(x * width, y * height,
                    Math.max(3, star.radius * unit * 4), 0, TAU);
                cr.fill();
            }
        }
    }

    _constellations(cr, width, height, time) {
        const unit = Math.max(.78, Math.min(width, height) / 930);

        // Inactive guide-lines are almost imperceptible; active lines emerge
        // ONLY within Orion, Cygnus and Cassiopeia (never across the avatar).
        for (const [start, end] of EDGES) {
            const a = NODES[start];
            const b = NODES[end];
            const energy = Math.min(this._energies[start], this._energies[end]);
            const failure = this._mode === 'denied';
            cr.setSourceRGBA(failure ? .87 : .38,
                failure ? .22 : .77,
                failure ? .39 : 1.0,
                .027 + energy * (failure ? .21 : .55));
            cr.setLineWidth((.55 + energy * .85) * unit);
            cr.moveTo(a.x * width, a.y * height);
            cr.lineTo(b.x * width, b.y * height);
            cr.stroke();
        }

        for (let i = 0; i < MAX_LIGHTS; i++) {
            const point = NODES[i];
            const energy = this._energies[i];
            const px = point.x * width;
            const py = point.y * height;
            const pulse = .92 + .08 * Math.sin(time * 1.8 + i * .72);
            const failure = this._mode === 'denied';
            const color = failure ? [1, .31, .49] : [.40, .82, 1.0];
            const ambient = .08;

            // Larger, diffuse light appears only after this star is activated.
            if (energy > .015) {
                cr.setSourceRGBA(...color, energy * .11 * pulse);
                cr.arc(px, py, (6 + energy * 10) * unit, 0, TAU);
                cr.fill();
                cr.setSourceRGBA(...color, energy * .19 * pulse);
                cr.arc(px, py, (2.5 + energy * 3.5) * unit, 0, TAU);
                cr.fill();
            }
            cr.setSourceRGBA(...color, ambient + energy * .90 * pulse);
            cr.arc(px, py, (1.0 + energy * 1.3) * unit, 0, TAU);
            cr.fill();
        }
    }

    _cockpit(cr, width, height) {
        // Frame only at the edges: not a rectangular debug panel.
        const pad = Math.max(22, Math.min(width, height) * .038);
        const arm = Math.max(22, Math.min(width, height) * .036);
        cr.setLineWidth(1.0);
        cr.setSourceRGBA(.38, .67, .92, .28);
        const corners = [
            [pad, pad, 1, 1],
            [width - pad, pad, -1, 1],
            [pad, height - pad, 1, -1],
            [width - pad, height - pad, -1, -1],
        ];
        for (const [x, y, dx, dy] of corners) {
            cr.moveTo(x, y + arm * dy);
            cr.lineTo(x, y);
            cr.lineTo(x + arm * dx, y);
            cr.stroke();
        }
        cr.setSourceRGBA(.52, .73, .99, .07);
        cr.moveTo(pad + arm + 14, pad);
        cr.lineTo(width - pad - arm - 14, pad);
        cr.moveTo(pad + arm + 14, height - pad);
        cr.lineTo(width - pad - arm - 14, height - pad);
        cr.stroke();
    }

    _feedback(cr, width, height, time) {
        const elapsed = time - this._modeAt;
        if (this._mode === 'verifying') {
            // This is a submit effect, NOT a promise that login succeeded.
            // GNOME may destroy the dialog immediately upon successful auth.
            const t = (elapsed % 1.65) / 1.65;
            cr.setLineWidth(1.35);
            cr.setSourceRGBA(.34, .78, 1, .24 * (1 - t));
            cr.arc(width * .5, height * .52,
                Math.min(width, height) * (.06 + .52 * t), 0, TAU);
            cr.stroke();
        } else if (this._mode === 'denied' && elapsed < 1.2) {
            cr.setSourceRGBA(.61, .075, .16,
                Math.max(0, 1 - elapsed / 1.2) * .15);
            cr.paint();
        }
    }

    _draw(cr, width, height) {
        if (width < 1 || height < 1)
            return;
        const t = now();
        this._background(cr, width, height, t);
        this._starfield(cr, width, height, t);
        this._constellations(cr, width, height, t);
        this._cockpit(cr, width, height);
        this._feedback(cr, width, height, t);
    }
}

export default class MellonObservatory extends Extension {
    enable() {
        this._epoch = 0;
        this._dialog = null;
        this._sky = null;
        this._hud = null;
        this._status = null;
        this._prompt = null;
        this._buffer = null;
        this._errorKey = null;
        this._timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, POLL_MS, () => {
            this._safelyTick();
            return GLib.SOURCE_CONTINUE;
        });
        this._safelyTick();
    }

    disable() {
        if (this._timer) {
            GLib.source_remove(this._timer);
            this._timer = 0;
        }
        this._unmount();
    }

    _warnOnce(error) {
        // Never log buffer length, password text, key events or prompt state.
        const key = `${error?.name ?? 'Error'}:${error?.message ?? 'unknown'}`;
        if (key === this._errorKey)
            return;
        this._errorKey = key;
        console.warn(`[Mellon M3] ${key}`);
    }

    _safelyTick() {
        try {
            this._tick();
        } catch (error) {
            this._warnOnce(error);
        }
    }

    _invalidateSignals() {
        // GObject removes handlers when it is destroyed. Do not disconnect
        // a possibly-disposed GNOME auth prompt (M2 already exposed that bug).
        // Epoch guards make all obsolete callbacks inert.
        this._epoch++;
        this._prompt = null;
        this._buffer = null;
    }

    _unmount() {
        this._invalidateSignals();
        try {
            this._hud?.destroy();
        } catch (_) {
        }
        try {
            this._sky?.destroy();
        } catch (_) {
        }
        this._hud = null;
        this._sky = null;
        this._dialog = null;
        this._status = null;
    }

    _mount(dialog) {
        // A failed construction must not mark a dialog as mounted.
        const sky = new ObservatorySky(dialog);
        this._sky = sky;
        this._dialog = dialog;

        const hud = new St.BoxLayout({
            style_class: 'mellon-m3-hud',
            orientation: Clutter.Orientation.VERTICAL,
            reactive: false,
            can_focus: false,
        });
        hud.set_position(44, 46);
        hud.add_child(new St.Label({
            text: 'M E L L O N   /   O B S E R V A T O R Y',
            style_class: 'mellon-m3-title',
        }));
        this._status = new St.Label({
            text: '✧  AWAITING STELLAR ALIGNMENT',
            style_class: 'mellon-m3-status',
        });
        hud.add_child(this._status);
        dialog.add_child(hud);
        this._hud = hud;
    }

    _setStatus(text) {
        if (this._status)
            this._status.text = text;
    }

    _render(length) {
        this._sky?.setCount(length);
        this._setStatus(length > 0
            ? '✦  CONSTELLATION IN PROGRESS'
            : '✧  AWAITING STELLAR ALIGNMENT');
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

        // GNOME 50 creates its auth prompt only once the password UI is shown.
        const prompt = dialog._authPrompt;
        const buffer = prompt?._passwordEntry?.clutter_text?.get_buffer?.();
        if (prompt === this._prompt && buffer === this._buffer)
            return;

        this._invalidateSignals();
        if (!prompt || !buffer) {
            this._render(0);
            return;
        }

        this._prompt = prompt;
        this._buffer = buffer;
        const epoch = this._epoch;
        const current = () => epoch === this._epoch && this._sky !== null;

        buffer.connect('notify::length', () => {
            if (current())
                this._render(buffer.get_length());
        });
        prompt.connect('next', () => {
            if (!current())
                return;
            this._sky?.setMode('verifying');
            this._setStatus('◈  AUTHENTICATING  /  PLEASE WAIT');
        });
        prompt.connect('failed', () => {
            if (!current())
                return;
            this._sky?.setMode('denied');
            this._setStatus('✕  ACCESS DENIED  /  RETRY');
        });
        this._render(buffer.get_length());
    }
}
