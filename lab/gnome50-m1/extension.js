import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// Mellon M1: a small, non-interactive GNOME 50 unlock-dialog probe.
// No password text, key events, authentication methods, or global input hooks.
const MAX_STARS = 24;
const POLL_MS = 250;

export default class MellonLab extends Extension {
    enable() {
        this._dialog = null;
        this._panel = null;
        this._prompt = null;
        this._buffer = null;
        this._signals = [];
        this._timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, POLL_MS, () => {
            try {
                this._tick();
            } catch (error) {
                // Never print password contents, lengths, or full exception data.
                if (!this._reportedError) {
                    console.warn('[Mellon M1] Probe failed; error type: ' +
                        (error?.name ?? 'unknown'));
                    this._reportedError = true;
                }
            }
            return GLib.SOURCE_CONTINUE;
        });
        this._reportedError = false;
        try {
            this._tick();
        } catch (error) {
            console.warn('[Mellon M1] Initial probe failed; error type: ' +
                (error?.name ?? 'unknown'));
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
        for (const [object, id] of this._signals) {
            try {
                object.disconnect(id);
            } catch (_) {
                // GNOME may already have destroyed the prompt.
            }
        }
        this._signals = [];
        this._prompt = null;
        this._buffer = null;
    }

    _unmount() {
        this._disconnect();
        try {
            this._panel?.destroy();
        } catch (_) {
            // The parent dialog may already be gone.
        }
        this._panel = null;
        this._dialog = null;
        this._stars = null;
        this._status = null;
    }

    _mount(dialog) {
        this._dialog = dialog;
        this._panel = new St.BoxLayout({
            style_class: 'mellon-m1-panel',
            orientation: Clutter.Orientation.VERTICAL,
            reactive: false,
            can_focus: false,
        });
        this._panel.set_position(32, 32);
        this._panel.add_child(new St.Label({
            text: 'BLACKPEARL  //  MELLON AUTHENTICATION',
            style_class: 'mellon-m1-header',
        }));
        this._stars = new St.Label({
            text: '· '.repeat(MAX_STARS),
            style_class: 'mellon-m1-stars',
        });
        this._status = new St.Label({
            text: 'AWAITING NATIVE PASSWORD PROMPT',
            style_class: 'mellon-m1-status',
        });
        this._panel.add_child(this._stars);
        this._panel.add_child(this._status);
        // A read-only visual layer: the native GNOME password UI stays visible.
        dialog.add_child(this._panel);
    }

    _render(length) {
        if (!this._stars || !this._status)
            return;

        const n = Math.max(0, Math.min(MAX_STARS, length));
        this._stars.text = '✦ '.repeat(n) + '· '.repeat(MAX_STARS - n);
        this._status.text = n > 0
            ? 'INPUT DETECTED  //  NATIVE AUTH ACTIVE'
            : 'AWAITING INPUT  //  NATIVE AUTH ACTIVE';
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

        // GNOME 50 creates the auth prompt only when the unlock UI is revealed.
        const prompt = dialog._authPrompt;
        const textActor = prompt?._passwordEntry?.clutter_text;
        const buffer = textActor?.get_buffer?.();

        if (prompt === this._prompt && buffer === this._buffer)
            return;

        this._disconnect();

        if (!prompt || !buffer) {
            this._render(0);
            return;
        }

        this._prompt = prompt;
        this._buffer = buffer;

        this._signals.push([buffer, buffer.connect('notify::length', () => {
            // Read only the count, never the buffer's text.
            this._render(buffer.get_length());
        })]);

        this._signals.push([prompt, prompt.connect('failed', () => {
            if (this._stars && this._status) {
                this._stars.text = '· '.repeat(MAX_STARS);
                this._status.text = 'ACCESS DENIED  //  RETRY';
            }
        })]);

        this._signals.push([prompt, prompt.connect('next', () => {
            if (this._status)
                this._status.text = 'CREDENTIALS SUBMITTED  //  VERIFYING';
        })]);

        this._render(buffer.get_length());
    }
}
