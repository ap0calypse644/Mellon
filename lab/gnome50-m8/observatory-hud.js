import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import {hudLayout} from './hud-layout.js';
import {ObservatoryIntro} from './observatory-intro.js';
import {mappingStage, mappingReadout, segmentWaveStrength,
    stagePulseStrength, STAGE_PULSE_SEC}
    from './hud-progress.js';

// Actor-only presentation. No password buffer, verifier, key signals,
// sensor polling, or invented coordinates. SHOW LOGIN is handled by M7.
function label(text, css) {
    return new St.Label({
        text, reactive: false, can_focus: false,
        style_class: css,
    });
}
function panel(extraClass) {
    return new St.BoxLayout({
        vertical: true, reactive: false, can_focus: false,
        style_class: 'mellon-m8-panel ' + extraClass,
    });
}
function row() {
    return new St.BoxLayout({
        vertical: false, reactive: false, can_focus: false,
        style_class: 'mellon-m8-segment-row',
    });
}
function localClock() {
    const now = GLib.DateTime.new_now_local();
    return {
        time: now.format('%H:%M'),
        date: now.format('%a, %d %b %Y'),
    };
}

export class ObservatoryHUD {
    constructor(dialog, info) {
        this._destroyed = false;
        this._clockTimer = 0;
        this._lastSize = null;
        this._totalStars = info.sourceStars;
        this._stageCapacity = info.stageCapacity;
        this._mappedStage = 0;
        this._settled = false;
        this._pulseFrom = 0;
        this._pulseTo = 0;
        this._pulseStartedAt = 0;
        this._segmentModes = [];
        this._segments = [];
        this.actor = new St.Widget({
            reactive: false, can_focus: false,
            layout_manager: new Clutter.FixedLayout(),
        });
        this.actor.add_constraint(new Clutter.BindConstraint({
            source: dialog, coordinate: Clutter.BindCoordinate.SIZE,
        }));

        const left = panel('mellon-m8-top-left');
        left.add_child(label('MELLON  /  OBSERVATION DECK',
            'mellon-m8-eyebrow'));
        left.add_child(label('CELESTIAL OBSERVATORY',
            'mellon-m8-brand'));
        this._topLeft = left;

        const right = panel('mellon-m8-top-right');
        this._rightEyebrow = label('SELECTED CONSTELLATION',
            'mellon-m8-eyebrow');
        right.add_child(this._rightEyebrow);
        right.add_child(label(info.constellation, 'mellon-m8-primary'));
        right.add_child(label(
            `${info.sourceStars} SOURCE STARS  /  ${info.connections} CONNECTIONS`,
            'mellon-m8-data'));
        right.add_child(label(info.status, 'mellon-m8-status'));
        this._topRight = right;

        const bottomLeft = panel('mellon-m8-bottom-left');
        this._clockEyebrow = label('LOCAL / SYSTEM CLOCK',
            'mellon-m8-eyebrow');
        bottomLeft.add_child(this._clockEyebrow);
        this._time = label('', 'mellon-m8-clock');
        this._date = label('', 'mellon-m8-data');
        bottomLeft.add_child(this._time);
        bottomLeft.add_child(this._date);
        bottomLeft.add_child(label('OBSERVATORY ONLINE',
            'mellon-m8-status'));
        this._bottomLeft = bottomLeft;

        const bottomRight = panel('mellon-m8-bottom-right');
        bottomRight.add_child(label('MAPPING SEQUENCE  /  08',
            'mellon-m8-eyebrow'));
        const segments = row();
        for (let i = 0; i < info.stageCapacity; i++) {
            const segment = new St.Widget({
                reactive: false, can_focus: false,
                style_class: 'mellon-m8-unlit-segment',
            });
            segment.set_size(23, 5);
            this._segments.push(segment);
            segments.add_child(segment);
        }
        bottomRight.add_child(segments);
        this._mappingLabel = label(info.mapping, 'mellon-m8-status');
        bottomRight.add_child(this._mappingLabel);
        this._bottomRight = bottomRight;

        this._panels = {topLeft: left, topRight: right,
            bottomLeft, bottomRight};
        for (const child of Object.values(this._panels))
            this.actor.add_child(child);
        this._renderMapping();
        this._intro = new ObservatoryIntro(this.actor, this._panels);

        // GNOME 50's St.Widget has no 'allocation-changed' signal.
        // These are real Clutter.Actor GObject properties; watch only
        // dimension changes, never use animation-frame or polling updates.
        this._sizeSignals = [
            this.actor.connect('notify::width', () => this._reflow()),
            this.actor.connect('notify::height', () => this._reflow()),
        ];
        // The HUD is parented *after* construction by the M7.1 scene.
        // One idle callback handles the first settled allocation even
        // when no subsequent size notification is emitted.
        this._firstLayoutId = GLib.idle_add(
            GLib.PRIORITY_DEFAULT_IDLE, () => {
                this._firstLayoutId = 0;
                if (!this._destroyed)
                    this._reflow();
                return GLib.SOURCE_REMOVE;
            });
        this._updateClock();
        // Only one clock update per minute, never a perpetual rendering loop.
        this._clockTimer = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT, 60, () => {
                if (this._destroyed) {
                    this._clockTimer = 0;
                    return GLib.SOURCE_REMOVE;
                }
                this._updateClock();
                return GLib.SOURCE_CONTINUE;
            });
        this._reflow();
    }

    // Called ONLY by M7's existing visual controller with a mask of already
    // illuminated photographic vertices. No raw password state enters HUD.
    setMapping(mask) {
        if (this._destroyed)
            return;
        if (!(mask instanceof Uint8Array) || mask.length !== this._totalStars)
            throw new Error('HUD/scene geometry mismatch');
        const stage = mappingStage(mask, this._stageCapacity);
        if (stage === this._mappedStage)
            return;  // No restyle on unchanged-stage random star changes.
        const previous = this._mappedStage;
        this._mappedStage = stage;
        this._settled = false;
        // Pulse ONLY newly activated stages. Backspace/failure instantly
        // removes the progress without leaving orphaned effects.
        this._pulseFrom = previous;
        this._pulseTo = stage > previous && stage < this._stageCapacity
            ? stage : 0;
        this._pulseStartedAt = this._pulseTo
            ? GLib.get_monotonic_time() / 1000000 : 0;
        this._renderMapping();
    }

    // Reuse the ALREADY RUNNING M7 completion frames; never install a second
    // fast timer. The completed segments settle into a static bright style.
    setCompletion(frame) {
        if (this._destroyed)
            return;
        if (this._mappedStage !== this._stageCapacity) {
            // Reuse the already-running star ignition frames to pulse
            // newly reached segments; nothing redraws while idle.
            if (!this._pulseTo)
                return;
            const elapsed = GLib.get_monotonic_time() / 1000000 -
                this._pulseStartedAt;
            const strength = stagePulseStrength(elapsed);
            for (let i = this._pulseFrom; i < this._pulseTo; i++) {
                const segment = this._segments[i];
                segment.set_scale(1 + .82 * strength,
                    1 + .56 * strength);
                segment.opacity = 255;
            }
            if (elapsed >= STAGE_PULSE_SEC) {
                for (let i = this._pulseFrom; i < this._pulseTo; i++)
                    this._segments[i].set_scale(1, 1);
                this._pulseTo = 0;
            }
            return;
        }
        if (frame?.settled === true) {
            if (!this._settled) {
                this._settled = true;
                this._renderMapping();
            }
            return;
        }
        const progress = frame?.completion;
        if (progress === null || progress === undefined)
            return;
        for (let i = 0; i < this._stageCapacity; i++) {
            const glow = segmentWaveStrength(progress, i, this._stageCapacity);
            this._segments[i].set_scale(1 + .52 * glow, 1 + .32 * glow);
            this._segments[i].opacity = Math.round(225 + 30 * glow);
        }
    }

    _renderMapping() {
        this._mappingLabel.set_text(mappingReadout(
            this._mappedStage, this._stageCapacity));
        for (let i = 0; i < this._stageCapacity; i++) {
            const segment = this._segments[i];
            const mode = i >= this._mappedStage ? 'unlit' :
                this._settled ? 'mapped' : 'lit';
            if (this._segmentModes[i] !== mode) {
                segment.set_style_class_name(`mellon-m8-${mode}-segment`);
                this._segmentModes[i] = mode;
            }
            // Backspace or failure cancels transient glints immediately.
            // Final visual completion is bright without a running loop.
            segment.set_scale(1, 1);
            segment.opacity = 255;
        }
    }

    _updateClock() {
        const value = localClock();
        this._time.set_text(value.time);
        this._date.set_text(value.date);
    }

    _reflow() {
        if (this._destroyed || !this.actor)
            return;
        const width = Math.floor(this.actor.get_width());
        const height = Math.floor(this.actor.get_height());
        if (this._lastSize && this._lastSize[0] === width &&
            this._lastSize[1] === height)
            return;
        this._lastSize = [width, height];
        const boxes = hudLayout(width, height);
        for (const [key, actor] of Object.entries(this._panels)) {
            const r = boxes[key];
            if (!r) {
                actor.hide();
                continue;
            }
            actor.set_position(r.x, r.y);
            actor.set_size(r.width, r.height);
            if (r.compact)
                actor.add_style_class_name('mellon-m8-compact');
            else
                actor.remove_style_class_name('mellon-m8-compact');
            actor.show();
        }
        this._intro?.onLayout(boxes, width, height);
    }

    cancelIntro() {
        this._intro?.stop();
    }

    hide() {
        if (this._destroyed)
            return;
        this.cancelIntro();
        this.actor.hide();
        this._stopClock();
    }

    _stopClock() {
        if (this._clockTimer) {
            GLib.source_remove(this._clockTimer);
            this._clockTimer = 0;
        }
    }

    destroy() {
        if (this._destroyed)
            return;
        this._destroyed = true;
        this._stopClock();
        this._intro?.destroy();
        this._intro = null;
        if (this._firstLayoutId) {
            GLib.source_remove(this._firstLayoutId);
            this._firstLayoutId = 0;
        }
        for (const signalId of this._sizeSignals ?? [])
            this.actor.disconnect(signalId);
        this._sizeSignals = [];
        this.actor.destroy();
        this.actor = null;
        this._panels = null;
        this._time = null;
        this._date = null;
        this._mappingLabel = null;
        this._segments = null;
        this._segmentModes = null;
        this._pulseTo = 0;
    }
}
