/**
 * Mellon M5.2: GNOME 50 internal failed-authentication counter observer.
 *
 * This observes only the verifier's attempt-failure count, never password
 * text, raw keys, entered character counts, or PAM data. Counts remain in
 * memory and are never logged or serialized. Experimental GNOME 50 VM ONLY.
 *
 * GNOME's ShellUserVerifier increments _failCounter when the foreground
 * authentication service reports a failed conversation. Unlike the
 * AuthPrompt 'failed' signal, it increments on retryable failures too.
 */
export class FailureTracker {
    constructor() {
        this.reset();
    }

    reset() {
        this._verifier = null;
        this._seen = 0;
    }

    observe(verifier) {
        if (!verifier)
            return {supported: true, failures: 0};

        const count = verifier._failCounter;
        if (!Number.isSafeInteger(count) || count < 0)
            return {supported: false, failures: 0};

        if (this._verifier !== verifier) {
            this._verifier = verifier;
            this._seen = 0;
        }
        if (count < this._seen) {
            // GNOME can reset its internal counter when restarting auth.
            // This is NOT a new failed authentication attempt.
            this._seen = count;
            return {supported: true, failures: 0};
        }

        const failures = Math.min(count - this._seen, 2);
        this._seen = count; // Idempotent across 250ms polling ticks.
        return {supported: true, failures};
    }
}
