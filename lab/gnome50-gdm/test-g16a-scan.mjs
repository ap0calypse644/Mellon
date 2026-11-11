#!/usr/bin/env node
// G1.6A.1: mocked GNOME timers verify 5-second cadence and cancellation.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const state = await readFile(new URL('./greeter-extension/hud-intro-state.js', import.meta.url),'utf8');
const pure = await import('data:text/javascript;base64,' +
    Buffer.from(state).toString('base64'));

const raw = await readFile(new URL('./greeter-extension/observatory-intro.js', import.meta.url),'utf8');
const imports = [
    "import Clutter from 'gi://Clutter';\n",
    "import GLib from 'gi://GLib';\n",
    "import St from 'gi://St';\n",
    "import {INTRO_TICK_MS, INTRO_REPEAT_MS,\n" +
        "    introFrame, gridGeometry, gridCellStrength}\n" +
        "    from './hud-intro-state.js';\n",
];
let implementation = raw;
for (const line of imports) {
    assert.ok(implementation.includes(line),'Unexpected GNOME import shape');
    implementation = implementation.replace(line,'');
}
implementation = implementation.replace(
    'export class ObservatoryIntro', 'class ObservatoryIntro');
assert.ok(!/^import /m.test(implementation));

function harness() {
    let now = 0, next = 1, repaints = 0;
    const tasks = new Map();
    const GLib = {
        PRIORITY_DEFAULT: 0,
        SOURCE_REMOVE: false,
        SOURCE_CONTINUE: true,
        get_monotonic_time: () => now * 1000,
        timeout_add: (_priority, interval, callback) => {
            const id = next++;
            tasks.set(id, {due: now + interval, interval, callback});
            return id;
        },
        source_remove: id => tasks.delete(id),
    };
    class DrawingArea {
        constructor(options) {
            assert.equal(options.reactive,false);
            assert.equal(options.can_focus,false);
            this.visible=false;
            this.destroyed=false;
        }
        add_constraint() {}
        connect(signal, handler) {
            assert.equal(signal,'repaint');
            this.repaintHandler=handler;
        }
        show() { this.visible=true; }
        hide() { this.visible=false; }
        queue_repaint() { repaints++; }
        destroy() { this.destroyed=true; }
    }
    class BindConstraint {}
    const Clutter = {BindConstraint, BindCoordinate: {SIZE:1}};
    const St = {DrawingArea};
    const Factory = new Function(
        'Clutter','GLib','St','INTRO_TICK_MS','INTRO_REPEAT_MS',
        'introFrame','gridGeometry','gridCellStrength',
        implementation+'\nreturn ObservatoryIntro;');
    const Intro = Factory(Clutter,GLib,St,pure.INTRO_TICK_MS,
        pure.INTRO_REPEAT_MS,pure.introFrame,pure.gridGeometry,
        pure.gridCellStrength);
    const panels = Object.fromEntries(['topLeft','topRight',
        'bottomLeft','bottomRight'].map(key=>[key,{opacity:255}]));
    const root = {
        insert_child_below(grid, panel) {
            assert.ok(grid instanceof DrawingArea);
            assert.equal(panel,panels.topLeft);
        },
    };
    const intro = new Intro(root,panels);
    function advance(target) {
        assert.ok(target>=now);
        let steps=0;
        while(true) {
            const due=[...tasks.entries()].sort((a,b)=>
                a[1].due-b[1].due || a[0]-b[0])[0];
            if(!due || due[1].due>target)break;
            if(++steps>1000)throw new Error('Potential runaway loop');
            const [id,task]=due;
            now=task.due;
            const cont=task.callback();
            if(tasks.get(id)!==task)continue;
            if(cont===GLib.SOURCE_CONTINUE)
                task.due+=task.interval;
            else tasks.delete(id);
        }
        now=target;
    }
    const intervals=()=>[...tasks.values()].map(t=>t.interval).sort((a,b)=>a-b);
    return {intro,panels,advance,intervals,get repaints(){return repaints;},
        get activeSources(){return tasks.size;}};
}

{
    const h=harness();
    h.intro.onLayout({},1920,1080);
    assert.deepEqual(h.intervals(),[50,5000]);
    assert.equal(h.intro._grid.visible,true);
    assert.equal(h.panels.topLeft.opacity,0,'First sweep fades HUD');

    h.advance(1850);
    assert.equal(h.intro._grid.visible,false,'Sweep stops after 1.85s');
    assert.deepEqual(h.intervals(),[5000],'No 50ms idle repaint source');
    assert.equal(h.panels.topLeft.opacity,255);
    const idleRepaints=h.repaints;
    h.advance(4999);
    assert.equal(h.repaints,idleRepaints,'No drawing between sweeps');

    h.advance(5000);
    assert.deepEqual(h.intervals(),[50,5000]);
    assert.equal(h.intro._grid.visible,true,'Sweep repeats at 5 seconds');
    assert.equal(h.panels.topLeft.opacity,255,
        'Repeated sweeps must not fade approved Observatory panels');
    h.advance(6850);
    assert.equal(h.intro._grid.visible,false);
    assert.deepEqual(h.intervals(),[5000]);
    h.advance(10000);
    assert.equal(h.intro._grid.visible,true,'Third sweep starts at 10 seconds');
    h.intro.stop();
    assert.equal(h.activeSources,0,'stop cancels both sources');
    assert.equal(h.intro._grid.visible,false);
    const paused=h.repaints;
    h.advance(20000);
    assert.equal(h.repaints,paused,'No work after stop');
}
{
    const h=harness();
    h.intro.onLayout({},1920,1080);
    h.advance(300);
    h.intro.onLayout({},1280,720);
    assert.deepEqual(h.intervals(),[50,5000],
        'Resize must reschedule a NEW sweep, not kill the 5s cadence');
    assert.equal(h.intro._grid.visible,true);
    assert.equal(h.panels.topLeft.opacity,255,
        'Resize must not re-fade the already displayed HUD');
    h.advance(2150);
    assert.deepEqual(h.intervals(),[5000],
        'Resized sweep stops its 50ms timer after 1.85s');
    h.advance(5300);
    assert.deepEqual(h.intervals(),[50,5000],
        'Repeat scan must resume five seconds AFTER resize');
    h.intro.stop();
    assert.equal(h.activeSources,0);
}
{
    const h=harness();
    h.intro.onLayout({},1920,1080);
    h.advance(2000);
    h.intro.stop();
    assert.equal(h.activeSources,0,'Idle repeat timer cancelled');
    h.intro.destroy();
    assert.equal(h.intro._grid,null);
    h.advance(12000);
    assert.equal(h.activeSources,0);
}
{
    const h=harness();
    h.intro.onLayout({},1920,1080);
    h.intro.destroy();
    assert.equal(h.activeSources,0,'Destroy while active cancels both');
}
{
    const h=harness();
    h.intro.onLayout({},1280,720);
    h.advance(30);
    for(const [w,height] of [[1600,900],[1484,928],[1920,1080]]) {
        h.intro.onLayout({},w,height);
        assert.deepEqual(h.intervals(),[50,5000],
            'Repeated GNOME allocation changes must leave exactly two timers');
    }
    h.advance(1930);
    assert.deepEqual(h.intervals(),[5000]);
    h.advance(5030);
    assert.deepEqual(h.intervals(),[50,5000]);
    h.intro.destroy();
    assert.equal(h.activeSources,0,'No timer leaks after GDM teardown');
}
console.log('PASS G1.6A.1: sweep at 0/5/10s, resize re-arms 5s cadence, timer cleanup');
