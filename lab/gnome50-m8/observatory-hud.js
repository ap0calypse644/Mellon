import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import {hudLayout} from './hud-layout.js';

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
            segments.add_child(segment);
        }
        bottomRight.add_child(segments);
        bottomRight.add_child(label(info.mapping, 'mellon-m8-status'));
        this._bottomRight = bottomRight;

        this._panels = {topLeft: left, topRight: right,
            bottomLeft, bottomRight};
        for (const child of Object.values(this._panels))
            this.actor.add_child(child);

        this._allocationSignal = this.actor.connect(
            'allocation-changed', () => this._reflow());
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
    }

    hide() {
        if (this._destroyed)
            return;
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
        if (this._allocationSignal) {
            this.actor.disconnect(this._allocationSignal);
            this._allocationSignal = 0;
        }
        this.actor.destroy();
        this.actor = null;
        this._panels = null;
        this._time = null;
        this._date = null;
    }
}
