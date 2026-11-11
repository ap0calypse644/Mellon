// Mellon G1.4 source-only: read-only visual adapter for GNOME 50 GDM.
// This code is NOT wired into extension.js yet. It never reads password
// characters, entry.text, key events, verifier state, or authentication
// results. Only ClutterTextBuffer's get_length() is called, and ONLY for
// the active native St.PasswordEntry, not the username prompt.
//
// GNOME gnome-50 sources:
// js/gdm/loginDialog.js: LoginDialog._authPrompt
// js/gdm/authPrompt.js: AuthPrompt._passwordEntry, AuthPrompt._entry
export class GreeterLengthObserver {
    constructor(onLength) {
        if (typeof onLength !== 'function')
            throw new TypeError('Expected visual length callback');
        this._onLength = onLength;
        this._prompt = null;
        this._buffer = null;
        this._signal = 0;
        this._epoch = 0;
        this._last = null;
        this._dead = false;
    }

    sync(dialog, inGreeterMode) {
        if (this._dead)
            return;
        if (!inGreeterMode) {
            this._reset();
            return;
        }
        const prompt = dialog?._authPrompt;
        // AuthPrompt can display Username/OTP/other challenges. Never
        // treat those fields as password entry or observe their buffers.
        if (!prompt || !prompt.visible ||
            !prompt._passwordEntry ||
            prompt._entry !== prompt._passwordEntry) {
            this._reset();
            return;
        }
        const buffer = prompt._passwordEntry.clutter_text?.get_buffer?.();
        if (!buffer || typeof buffer.get_length !== 'function') {
            this._reset();
            return;
        }
        if (this._prompt === prompt && this._buffer === buffer)
            return;
        this._reset();
        this._prompt = prompt;
        this._buffer = buffer;
        const epoch = this._epoch;
        this._signal = buffer.connect('notify::length', () => {
            if (this._dead || this._epoch !== epoch ||
                this._prompt !== prompt || this._buffer !== buffer ||
                !prompt.visible || prompt._entry !== prompt._passwordEntry)
                return;
            this._pushLength(buffer);
        });
        this._pushLength(buffer);
    }

    _pushLength(buffer) {
        // A scalar count is the ONLY information leaving this adapter.
        // Do not persist it after the visual mask is updated.
        const amount = buffer.get_length();
        if (!Number.isInteger(amount) || amount < 0 || amount > 4096)
            return;
        if (amount !== this._last) {
            this._last = amount;
            this._onLength(amount);
        }
    }

    _reset() {
        if (this._dead)
            return;
        if (!this._buffer && !this._prompt)
            return;
        this._epoch++;
        if (this._buffer && this._signal) {
            // GNOME can dispose a prompt during a greeter transition.
            // Ignore a disposed GObject during teardown; epoch guards
            // still make any residual callback harmless.
            try {
                this._buffer.disconnect(this._signal);
            } catch (_) {
                // Already disposed; no callback may mutate visual state.
            }
        }
        this._prompt = null;
        this._buffer = null;
        this._signal = 0;
        this._last = null;
        this._onLength(0);
    }

    destroy() {
        if (this._dead)
            return;
        this._reset();
        this._dead = true;
        this._onLength = null;
    }
}
