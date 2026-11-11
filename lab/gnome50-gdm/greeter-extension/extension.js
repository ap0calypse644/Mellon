import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {validateLibrary, pickScene} from './scene-data.js';
import {hudMetadata} from './hud-state.js';
import {ObservatoryHUD} from './observatory-hud.js';
import {GreeterStarfield} from './greeter-starfield.js';
import {GreeterLengthObserver} from './greeter-length-observer.js';
import {GreeterPasswordCover} from './greeter-password-cover.js';
import {GreeterAccountChooser} from './greeter-account-chooser.js';

// Mellon G1.6B: Astronomical GDM account selection + M8 password.
// Account choice goes through GNOME's existing native UserListItem
// activation signal. Session choice and authentication remain GNOME-owned.
// The PASSWORD prompt alone gets the photo, source stars and Observatory
// foreground above LoginDialog; the real password entry retains focus.
// SHOW LOGIN manually reveals native GDM, just like the lock screen.
// All G1.5 bounded lifecycle recovery and visual-only length observation
// remain intact. No PAM, text, keystroke or authentication changes.
const GREETER_POLL_MS = 350;
const GREETER_LENGTH_SYNC_MS = 250;
const GREETER_MAX_ATTEMPTS = 90;
// Bound reattachment after GNOME replaces/disposes the live LoginDialog.
const GREETER_MAX_REBIND_TICKS = 120;

function readJSON(path) {
    const [ok, bytes] = GLib.file_get_contents(path);
    if (!ok)
        throw new Error('Greeter scene configuration unavailable');
    return JSON.parse(new TextDecoder().decode(bytes));
}

export default class MellonGreeter extends Extension {
    enable() {
        this._background = null;
        this._hud = null;
        this._starfield = null;
        this._observer = null;
        this._cover = null;
        this._accounts = null;
        this._dialog = null;
        this._syncId = 0;
        this._pollId = 0;
        this._attempts = 0;
        this._rebindTicks = 0;
        this._selectedScene = null;
        this._stopped = false;
        this._lastError = null;
        if (Main.sessionMode.currentMode !== 'gdm')
            return;
        console.log('[Mellon Greeter G1.6B] enabled in gdm mode');

        // GDM's dynamically allocated account must read a separate,
        // system-installed immutable pack. No $HOME or user-specific paths.
        try {
            this._library = validateLibrary(readJSON(GLib.build_filenamev([
                this.path, 'library.json',
            ])));
            // Verify all twelve photographs AND every original star sprite.
            // A single missing source asset fails open to native GDM.
            for (const scene of this._library.scenes) {
                for (const rel of [scene.image, ...scene.sprites]) {
                    const asset = Gio.File.new_for_path(
                        GLib.build_filenamev([this.path, rel]));
                    if (!asset.query_exists(null))
                        throw new Error('Missing G1.4 source photograph or sprite');
                }
            }
        } catch (error) {
            this._warn(error);
            return;
        }

        this._tryMount();
        if (!this._background && !this._stopped) {
            this._pollId = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
                GREETER_POLL_MS, () => {
                    if (this._stopped) {
                        this._pollId = 0;
                        return GLib.SOURCE_REMOVE;
                    }
                    if (++this._attempts >= GREETER_MAX_ATTEMPTS) {
                        this._pollId = 0;
                        this._warn(new Error('Native GDM dialog not mounted after bounded retry'));
                        return GLib.SOURCE_REMOVE; // No endless polling.
                    }
                    this._tryMount();
                    if (this._background) {
                        this._pollId = 0;
                        return GLib.SOURCE_REMOVE;
                    }
                    return GLib.SOURCE_CONTINUE;
                });
        }
    }

    _tryMount() {
        if (this._stopped || this._background ||
            Main.sessionMode.currentMode !== 'gdm')
            return;
        const dialog = Main.screenShield?._dialog;
        const container = Main.screenShield?._lockDialogGroup;
        // GNOME 50 native screenShield.js creates LoginDialog as a CHILD
        // of _lockDialogGroup. Attach below it instead of trying to use
        // the nonexistent LoginDialog._backgroundGroup.
        if (!dialog || !container ||
            typeof container.insert_child_below !== 'function' ||
            typeof dialog.get_parent !== 'function' ||
            dialog.get_parent() !== container)
            return;

        let photo = null;
        let hud = null;
        let starfield = null;
        let observer = null;
        let cover = null;
        let accounts = null;
        try {
            // Retain the single approved photo and actual selected scene.
            // Source-derived star sprites use this identical cover transform.
            const scene = this._selectedScene ??
                pickScene(this._library, {mode: 'random-on-lock'});
            const file = Gio.File.new_for_path(
                GLib.build_filenamev([this.path, scene.image]));
            if (!file.query_exists(null))
                return;
            photo = new St.Widget({
                reactive: false, can_focus: false,
            });
            photo.add_constraint(new Clutter.BindConstraint({
                source: container, coordinate: Clutter.BindCoordinate.SIZE,
            }));
            photo.set_style(
                `background-image: url("${file.get_uri()}"); ` +
                'background-size: cover; background-position: center; ' +
                'background-repeat: no-repeat;');
            // A sibling BELOW the native LoginDialog. No auth actor moves,
            // no changes to its custom vfunc_allocate(), and no focus grab.
            container.insert_child_below(photo, dialog);
            // Visual-only HUD: same approved M8.3.2 instrument cluster.
            hud = new ObservatoryHUD(container, hudMetadata(scene));
            const sprites = scene.sprites.map(rel =>
                GLib.build_filenamev([this.path, rel]));
            starfield = new GreeterStarfield(container, scene, sprites, hud);
            // During native user selection, photo < source stars < HUD
            // remain BELOW LoginDialog, preserving GDM's account/session UI.
            container.insert_child_below(starfield.actor, dialog);
            container.insert_child_below(hud.actor, dialog);
            // The cover reorders ONLY Mellon's three already-parented actors
            // above the native password form while it is actually active.
            // SHOW LOGIN is the only interactive Mellon actor.
            cover = new GreeterPasswordCover(
                container, dialog, photo, starfield, hud);
            observer = new GreeterLengthObserver(length => {
                starfield.setLength(length);
                cover.onLength(length);
            });
            accounts = new GreeterAccountChooser(
                container, dialog, photo, starfield, hud);
            this._hud = hud;
            this._starfield = starfield;
            this._cover = cover;
            this._accounts = accounts;
            this._observer = observer;
            this._background = photo;
            this._dialog = dialog;
            this._sceneId = scene.id;
            this._selectedScene = scene;
            this._rebindTicks = 0;
            this._syncInput();
            if (!this._syncId) {
                this._syncId = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
                    GREETER_LENGTH_SYNC_MS, () => {
                        if (this._stopped ||
                            Main.sessionMode.currentMode !== 'gdm') {
                            this._syncId = 0;
                            this._unmount();
                            return GLib.SOURCE_REMOVE;
                        }
                        // GNOME can replace, dispose or reparent LoginDialog.
                        // Keep ONE observer timer while recovering, but stop
                        // after a bounded grace period: native GDM stays alive.
                        const container = Main.screenShield?._lockDialogGroup;
                        if (Main.screenShield?._dialog !== this._dialog ||
                            this._dialog?.get_parent?.() !== container ||
                            !this._background) {
                            this._unmount();
                            if (++this._rebindTicks >=
                                GREETER_MAX_REBIND_TICKS) {
                                this._syncId = 0;
                                this._warn(new Error('Native dialog reattachment timed out'));
                                return GLib.SOURCE_REMOVE;
                            }
                            this._tryMount();
                            return GLib.SOURCE_CONTINUE;
                        }
                        try {
                            this._syncInput();
                        } catch (_) {
                            // Never rethrow from the GNOME main-loop callback.
                            // Disable only input-driven decoration and leave
                            // the photograph, HUD and native login accessible.
                            this._syncId = 0;
                            // Observer not healthy: reveal native controls
                            // rather than leaving unknown GNOME UI masked.
                            try {
                                this._cover?.revealNative();
                            } catch (_) {
                                // Native GDM remains unaffected.
                            }
                            try {
                                this._observer?.destroy();
                            } catch (_) {
                                // A disposed GObject must not kill the shell.
                            }
                            this._observer = null;
                            try {
                                this._starfield?.clear();
                            } catch (_) {
                                // The visual layer may already be disposed.
                            }
                            this._warn(new Error('Read-only visual observer disabled'));
                            return GLib.SOURCE_REMOVE;
                        }
                        return GLib.SOURCE_CONTINUE;
                    });
            }
            console.log('[Mellon Greeter G1.6B] Mellon account selection and covered password mode ready');
        } catch (error) {
            // A failed source-star mount cannot strand native authentication.
            observer?.destroy();
            accounts?.destroy();
            cover?.destroy();
            starfield?.destroy();
            hud?.destroy();
            photo?.destroy();
            this._background = null;
            this._hud = null;
            this._starfield = null;
            this._observer = null;
            this._cover = null;
            this._accounts = null;
            this._dialog = null;
            this._warn(error);
        }
    }

    _syncInput() {
        // Never cover account selection, username entry or alternative
        // authentication challenges. SHOW LOGIN also disables the cosmetic
        // password observer until a new native password prompt starts.
        this._cover?.sync();
        this._accounts?.sync();
        this._observer?.sync(this._dialog,
            Main.sessionMode.currentMode === 'gdm' &&
            this._cover?.isMasked === true);
        this._cover?.observeFailure();
    }

    _unmount() {
        this._observer?.destroy();
        this._observer = null;
        this._accounts?.destroy();
        this._accounts = null;
        this._cover?.destroy();
        this._cover = null;
        this._starfield?.destroy();
        this._starfield = null;
        this._hud?.destroy();
        this._hud = null;
        this._background?.destroy();
        this._background = null;
        this._dialog = null;
    }

    _warn(error) {
        // Do not print identity, credentials, paths, input or secrets.
        const key = `${error?.name ?? 'Error'}:${error?.message ?? 'unknown'}`;
        if (key !== this._lastError) {
            console.warn(`[Mellon Greeter G1.6B] ${key}`);
            this._lastError = key;
        }
    }

    disable() {
        this._stopped = true;
        if (this._pollId) {
            GLib.source_remove(this._pollId);
            this._pollId = 0;
        }
        if (this._syncId) {
            GLib.source_remove(this._syncId);
            this._syncId = 0;
        }
        this._unmount();
        this._library = null;
        this._sceneId = null;
        this._selectedScene = null;
        this._rebindTicks = 0;
    }
}
