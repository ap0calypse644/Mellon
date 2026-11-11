import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {validateLibrary, pickScene} from './scene-data.js';

// Mellon G1.1/G1.2: VISIBLE PHOTO BACKDROP ONLY, GNOME 50.1 test VM.
// We never cover GDM's native user list or password entry: the photo
// becomes a CHILD OF THE EXISTING BACKGROUND GROUP, not of the dialog.
// No input listeners, password-buffer inspection, verifier or authentication-backend access.
const GREETER_POLL_MS = 350;
const GREETER_MAX_ATTEMPTS = 90;

function readJSON(path) {
    const [ok, bytes] = GLib.file_get_contents(path);
    if (!ok)
        throw new Error('Greeter scene configuration unavailable');
    return JSON.parse(new TextDecoder().decode(bytes));
}

export default class MellonGreeter extends Extension {
    enable() {
        this._background = null;
        this._pollId = 0;
        this._attempts = 0;
        this._stopped = false;
        this._lastError = null;
        if (Main.sessionMode.currentMode !== 'gdm')
            return;

        // GDM's dynamically allocated account must read a separate,
        // system-installed immutable pack. No $HOME or user-specific paths.
        try {
            this._library = validateLibrary(readJSON(GLib.build_filenamev([
                this.path, 'library.json',
            ])));
            // Validate *all* source photos before changing GDM visuals.
            // A missing asset leaves the native greeter completely intact.
            for (const scene of this._library.scenes) {
                const image = Gio.File.new_for_path(
                    GLib.build_filenamev([this.path, scene.image]));
                if (!image.query_exists(null))
                    throw new Error('Missing greeter photo in approved pack');
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
        const container = dialog?._backgroundGroup;
        if (!dialog || !container ||
            typeof container.add_child !== 'function')
            return;

        let photo = null;
        try {
            // The original 12-scene curated library is read-only. GDM
            // selects one scene at startup; future G1.3 will draw original
            // star sprites and validated connectors over this same photo.
            const scene = pickScene(this._library, {mode: 'random-on-lock'});
            const file = Gio.File.new_for_path(
                GLib.build_filenamev([this.path, scene.image]));
            if (!file.query_exists(null))
                return;
            photo = new St.Widget({
                reactive: false, can_focus: false,
            });
            photo.add_constraint(new Clutter.BindConstraint({
                source: dialog, coordinate: Clutter.BindCoordinate.SIZE,
            }));
            photo.set_style(
                `background-image: url("${file.get_uri()}"); ` +
                'background-size: cover; background-position: center; ' +
                'background-repeat: no-repeat;');
            // Add ONLY to the backdrop group, never the LoginDialog root:
            // native username/password actors remain above the photograph.
            container.add_child(photo);
            this._background = photo;
            this._sceneId = scene.id;
        } catch (error) {
            photo?.destroy();
            this._warn(error);
        }
    }

    _warn(error) {
        // Do not print identity, credentials, paths, input or secrets.
        const key = `${error?.name ?? 'Error'}:${error?.message ?? 'unknown'}`;
        if (key !== this._lastError) {
            console.warn(`[Mellon Greeter G1] ${key}`);
            this._lastError = key;
        }
    }

    disable() {
        this._stopped = true;
        if (this._pollId) {
            GLib.source_remove(this._pollId);
            this._pollId = 0;
        }
        this._background?.destroy();
        this._background = null;
        this._library = null;
        this._sceneId = null;
    }
}
