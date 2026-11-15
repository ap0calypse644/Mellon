import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {hudMetadata} from './hud-state.js';
import {ObservatoryHUD} from './observatory-hud.js';
import {GreeterStarfield} from './greeter-starfield.js';

// GNOME Shell and GDM use their own logical monitor geometry. Never
// interpret Xrandr/Xwayland's virtual pixels as Clutter coordinates.
export function currentMonitorGeometry() {
    const monitors = Main.layoutManager.monitors;
    if (!Array.isArray(monitors) || !monitors.length ||
        monitors.some(m => !Number.isFinite(m.x) ||
            !Number.isFinite(m.y) || !Number.isFinite(m.width) ||
            !Number.isFinite(m.height) || m.width < 320 || m.height < 240))
        throw new Error('GDM monitor geometry is unavailable');

    const primary = Main.layoutManager.primaryIndex;
    const primaryIndex = Number.isInteger(primary) &&
        primary >= 0 && primary < monitors.length ? primary : 0;
    return {
        primaryIndex,
        monitors: monitors.map(({x, y, width, height}) =>
            ({x, y, width, height})),
    };
}

// Single ordering unit: GNOME's native LoginDialog stays in its original
// parent, while Mellon reorders only this one group above/below it.
// Each child viewport independently clips and scales its astronomical art.
// There is still ONE real account chooser, native password entry and observer.
export class GreeterVisuals {
    constructor(container, dialog, scene, extensionRoot, geometry) {
        this._views = [];
        this.actor = null;
        this.primaryRoot = null;
        this.primary = geometry.monitors[geometry.primaryIndex];
        this._destroyed = false;

        try {
            const file = Gio.File.new_for_path(GLib.build_filenamev([
                extensionRoot, scene.image,
            ]));
            if (!file.query_exists(null))
                throw new Error('Missing source photograph');
            const sprites = scene.sprites.map(rel =>
                GLib.build_filenamev([extensionRoot, rel]));
            this.actor = new St.Widget({
                reactive: false, can_focus: false,
                layout_manager: new Clutter.FixedLayout(),
            });
            this.actor.add_constraint(new Clutter.BindConstraint({
                source: container, coordinate: Clutter.BindCoordinate.SIZE,
            }));
            // Keep native GDM's account list fully accessible until Mellon
            // explicitly covers only supported selection/password phases.
            container.insert_child_below(this.actor, dialog);

            for (const [index, monitor] of geometry.monitors.entries()) {
                const root = new St.Widget({
                    reactive: false, can_focus: false,
                    layout_manager: new Clutter.FixedLayout(),
                });
                root.set_position(monitor.x, monitor.y);
                root.set_size(monitor.width, monitor.height);
                root.set_clip_to_allocation(true);
                this.actor.add_child(root);
                const view = {root, photo: null, starfield: null, hud: null};
                this._views.push(view);

                view.photo = new St.Widget({
                    reactive: false, can_focus: false,
                });
                view.photo.add_constraint(new Clutter.BindConstraint({
                    source: root, coordinate: Clutter.BindCoordinate.SIZE,
                }));
                view.photo.set_style(
                    `background-image: url("${file.get_uri()}"); ` +
                    'background-size: cover; background-position: center; ' +
                    'background-repeat: no-repeat;');
                root.add_child(view.photo);

                view.hud = new ObservatoryHUD(root, hudMetadata(scene));
                view.starfield = new GreeterStarfield(
                    root, scene, sprites, view.hud);
                root.add_child(view.starfield.actor);
                root.add_child(view.hud.actor);
                if (index === geometry.primaryIndex)
                    this.primaryRoot = root;
            }
            if (!this.primaryRoot)
                throw new Error('Primary GDM monitor missing');
            console.log('[Mellon GDM M9] viewports=' +
                geometry.monitors.map(m => m.width + 'x' + m.height).join(',') +
                ' primary=' + geometry.primaryIndex);
        } catch (error) {
            this.destroy();
            throw error;
        }
    }

    setLength(length) {
        for (const view of this._views)
            view.starfield?.setLength(length);
    }

    clear() {
        for (const view of this._views)
            view.starfield?.clear();
    }

    setRecoveryLayout(enabled) {
        for (const view of this._views)
            view.hud?.setRecoveryLayout(enabled);
    }

    show() {
        this.actor?.show();
    }

    hide() {
        this.actor?.hide();
    }

    destroy() {
        if (this._destroyed)
            return;
        this._destroyed = true;
        for (const view of this._views) {
            view.starfield?.destroy();
            view.hud?.destroy();
        }
        this.actor?.destroy();
        this.actor = null;
        this._views = [];
        this.primaryRoot = null;
    }
}
