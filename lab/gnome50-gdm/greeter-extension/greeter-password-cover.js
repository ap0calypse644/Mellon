import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import {FailureTracker} from './failure-tracker.js';

// G1.6A: M8-style visible GDM password cover. Native GDM LoginDialog,
// authentication, keyboard focus and user/session selection are UNCHANGED.
// This module only checks whether the native secret-password prompt is active;
// it never examines text, verifier state, user names, or typed characters.
//
// Nonreactive photo, starfield and HUD are raised ABOVE the native
// LoginDialog only for the active PASSWORD prompt. The only reactive widget
// is a mouse-click recovery button, matching the VM lock screen.
export class GreeterPasswordCover {
    constructor(container, dialog, photo, starfield, hud) {
        if (!container || !dialog ||
            typeof container.insert_child_above !== 'function' ||
            typeof container.set_child_above_sibling !== 'function' ||
            typeof container.set_child_below_sibling !== 'function' ||
            typeof dialog.get_parent !== 'function' ||
            dialog.get_parent() !== container)
            throw new Error('Unsupported GNOME 50 greeter actor ordering');
        this._container = container;
        this._dialog = dialog;
        this._photo = photo;
        this._starfield = starfield;
        this._hud = hud;
        this._masked = false;
        this._revealed = false;
        this._destroyed = false;
        this._tracker = new FailureTracker();
        this._deniedTimer = 0;
        this._deniedUntil = 0;
        this._deniedStartedAt = 0;

        this._recovery = new St.Button({
            label: 'SHOW LOGIN',
            reactive: true, can_focus: false, track_hover: true,
            style_class: 'mellon-m5-recovery',
        });
        this._recovery.set_position(26, 22);
        this._recovery.connect('clicked', () => this.revealNative());
        this._recovery.hide();
        // The button remains hidden over native user selection. No GDM
        // child is moved at construction time.
        container.insert_child_above(this._recovery, dialog);

        this._feedback = new St.Label({
            text: 'UNAUTHORIZED ACCESS',
            reactive: false, can_focus: false,
            style_class: 'mellon-m5-failure',
        });
        this._feedback.add_constraint(new Clutter.AlignConstraint({
            source: container, align_axis: Clutter.AlignAxis.BOTH, factor: 0.5,
        }));
        this._feedback.hide();
        container.insert_child_above(this._feedback, this._recovery);
    }

    get isMasked() {
        return this._masked && !this._revealed;
    }

    _passwordPromptActive() {
        const prompt = this._dialog?._authPrompt;
        // This is intentionally fail OPEN: an unknown/alternate challenge
        // or an active user list always exposes unmodified native GDM.
        return this._dialog?.get_parent?.() === this._container &&
            this._dialog?._userSelectionBox?.visible === false &&
            prompt?.visible === true &&
            prompt._passwordEntry != null &&
            prompt._entry === prompt._passwordEntry;
    }

    sync() {
        if (this._destroyed)
            return;
        if (!this._passwordPromptActive()) {
            // Reset SHOW LOGIN latch only after the secret prompt has
            // ended (user selection, username, OTP, native reset, etc.).
            this._showSelection();
        } else if (!this._revealed && !this._masked) {
            this._showPasswordCover();
        }
    }

    _showPasswordCover() {
        const c = this._container;
        // Exact visual order: native LoginDialog < PHOTO < SOURCE STARS
        // < OBSERVATORY HUD < SHOW LOGIN. All but the button are
        // nonreactive; the real native password entry keeps keyboard focus.
        c.set_child_above_sibling(this._photo, this._dialog);
        c.set_child_above_sibling(this._starfield.actor, this._photo);
        c.set_child_above_sibling(this._hud.actor, this._starfield.actor);
        c.set_child_above_sibling(this._recovery, this._hud.actor);
        c.set_child_above_sibling(this._feedback, this._recovery);
        this._photo.show();
        this._starfield.actor.show();
        this._hud.actor.show();
        this._hud.setRecoveryLayout(true);
        this._recovery.show();
        this._masked = true;
    }

    _showSelection() {
        if (!this._masked && !this._revealed)
            return;
        this._masked = false;
        this._revealed = false;
        this._recovery.hide();
        this._stopFeedback();
        this._tracker.reset();
        this._hud.setRecoveryLayout(false);
        this._photo.show();
        this._starfield.actor.show();
        this._hud.actor.show();
        // Photo/HUD return BELOW native GDM for account/session selection.
        const c = this._container;
        c.set_child_below_sibling(this._photo, this._dialog);
        c.set_child_above_sibling(this._starfield.actor, this._photo);
        c.set_child_above_sibling(this._hud.actor, this._starfield.actor);
    }

    // Identical read-only failure semantics to approved M8.3.2.
    // This does not query credentials, PAM, authentication answers or text.
    observeFailure() {
        if (this._destroyed || !this.isMasked)
            return;
        const prompt = this._dialog?._authPrompt;
        const result = this._tracker.observe(prompt?._userVerifier);
        if (!result.supported) {
            // Unknown GNOME implementation: reveal native errors/controls.
            this.revealNative();
            return;
        }
        if (result.failures === 0)
            return;
        this._starfield.clear();
        this._hud.cancelIntro();
        this._deniedStartedAt = GLib.get_monotonic_time() / 1000000;
        this._deniedUntil = this._deniedStartedAt + 1.5;
        this._feedback.opacity = 255;
        this._feedback.show();
        if (!this._deniedTimer) {
            this._deniedTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 62,
                () => {
                    if (this._destroyed) {
                        this._deniedTimer = 0;
                        return GLib.SOURCE_REMOVE;
                    }
                    const now = GLib.get_monotonic_time() / 1000000;
                    if (now >= this._deniedUntil) {
                        this._feedback.hide();
                        this._deniedTimer = 0;
                        return GLib.SOURCE_REMOVE;
                    }
                    const phase = Math.floor(
                        (now - this._deniedStartedAt) / 0.22);
                    this._feedback.opacity = phase % 2 === 0 ? 255 : 55;
                    return GLib.SOURCE_CONTINUE;
                });
        }
    }

    onLength(length) {
        if (this._destroyed || !this.isMasked)
            return;
        if (length > 0)
            this._stopFeedback();
    }

    _stopFeedback() {
        if (this._deniedTimer) {
            GLib.source_remove(this._deniedTimer);
            this._deniedTimer = 0;
        }
        this._feedback?.hide();
        this._deniedUntil = 0;
    }

    revealNative() {
        if (this._destroyed || this._revealed || !this._masked)
            return;
        // Like M8.3.2, SHOW LOGIN is a manual one-way recovery action
        // for this password prompt. Never automatically cover it again.
        this._revealed = true;
        this._masked = false;
        this._recovery.hide();
        this._stopFeedback();
        this._hud.setRecoveryLayout(false);
        this._photo.hide();
        this._starfield.actor.hide();
        this._hud.actor.hide();
        try {
            this._dialog?._authPrompt?._passwordEntry?.grab_key_focus();
        } catch (_) {
            // Even if the prompt was disposed, the native visual is free.
        }
    }

    destroy() {
        if (this._destroyed)
            return;
        this._destroyed = true;
        this._stopFeedback();
        this._feedback?.destroy();
        this._tracker?.reset();
        this._recovery?.destroy();
        this._recovery = null;
        this._feedback = null;
        this._tracker = null;
        // Existing Mellon actors are removed independently by the
        // extension's reverse-order _unmount(); no native actor is hidden.
        this._container = null;
        this._dialog = null;
        this._photo = null;
        this._starfield = null;
        this._hud = null;
    }
}
