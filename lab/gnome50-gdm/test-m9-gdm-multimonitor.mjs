#!/usr/bin/env node
// M9 focused safety check: multi-monitor coordinates and shared GDM controller.
// No GNOME/GDM process, passwords, shell restart or filesystem mutation.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root = new URL('./greeter-extension/', import.meta.url);
const source = await readFile(new URL('greeter-visuals.js',root),'utf8');
const code = source.replace(/^import [\s\S]*?;\s*$/gm,'')
    .replace(/\bexport class /g,'class ')
    .replace(/\bexport function /g,'function ');
assert.ok(!/^import /m.test(code));
class Widget {
    constructor() {this.children=[];this.visible=true;}
    add_constraint() {}
    set_style() {}
    set_position(x,y) {this.x=x;this.y=y;}
    set_size(width,height) {this.width=width;this.height=height;}
    set_clip_to_allocation(clip) {this.clipped=clip;}
    add_child(child) {this.children.push(child);}
    show() {this.visible=true;}
    hide() {this.visible=false;}
    destroy() {this.destroyed=true;}
}
class HUD {
    constructor() {this.actor=new Widget();this.layouts=[];}
    setRecoveryLayout(enabled) {this.layouts.push(enabled);}
    destroy() {this.destroyed=true;}
}
class Stars {
    constructor() {this.actor=new Widget();this.lengths=[];this.clears=0;}
    setLength(length) {this.lengths.push(length);}
    clear() {this.clears++;}
    destroy() {this.destroyed=true;}
}
const Main={layoutManager:{
    monitors:[
        {x:0,y:0,width:3440,height:1440},
        {x:3440,y:0,width:1920,height:1080},
    ],
    primaryIndex:0,
}};
const Clutter={
    FixedLayout: class {},
    BindConstraint: class {},
    BindCoordinate:{SIZE:0},
};
const Gio={File:{new_for_path:path=>({
    query_exists:()=>true,get_uri:()=>`file://${path}`,
})}};
const GLib={build_filenamev:parts=>parts.join('/')};
const St={Widget};
const factory=new Function('Clutter','Gio','GLib','St','Main',
    'hudMetadata','ObservatoryHUD','GreeterStarfield',
    code+'\nreturn {GreeterVisuals,currentMonitorGeometry};');
const {GreeterVisuals,currentMonitorGeometry}=factory(
    Clutter,Gio,GLib,St,Main,()=>({}),HUD,Stars);
const scene={image:'assets/photo.jpg',sprites:['assets/star.png']};
const dialog=new Widget();
const container=new Widget();
container.insert_child_below=(actor,sibling)=>{
    assert.equal(sibling,dialog);container.add_child(actor);
};
const geometry=currentMonitorGeometry();
assert.equal(geometry.primaryIndex,0);
const visuals=new GreeterVisuals(container,dialog,scene,'/gdm',geometry);
assert.equal(visuals._views.length,2);
assert.equal(visuals._views[0].root.width,3440);
assert.equal(visuals._views[1].root.x,3440);
assert.equal(visuals._views[1].root.width,1920);
assert.equal(visuals._views[1].root.height,1080);
assert.ok(visuals._views.every(view=>view.root.clipped));
assert.equal(visuals.primaryRoot,visuals._views[0].root);
visuals.setLength(5);
assert.ok(visuals._views.every(view=>view.starfield.lengths[0]===5));
visuals.setRecoveryLayout(true);
assert.ok(visuals._views.every(view=>view.hud.layouts[0]===true));
visuals.clear();
assert.ok(visuals._views.every(view=>view.starfield.clears===1));
visuals.hide();
assert.equal(visuals.actor.visible,false);
visuals.show();
assert.equal(visuals.actor.visible,true);
visuals.destroy();
assert.equal(visuals.actor,null);

Main.layoutManager.monitors=[{x:0,y:0,width:1920,height:1080}];
Main.layoutManager.primaryIndex=0;
assert.equal(currentMonitorGeometry().monitors.length,1);
Main.layoutManager.monitors=[{x:0,y:0,width:200,height:100}];
assert.throws(()=>currentMonitorGeometry());
for(const path of ['extension.js','greeter-password-cover.js',
    'greeter-account-chooser.js','observatory-intro.js']) {
    const text=await readFile(new URL(path,root),'utf8');
    const bare=text.replace(/^import [\s\S]*?;\s*$/gm,'')
        .replace(/\bexport default class /g,'class ')
        .replace(/\bexport class /g,'class ');
    assert.doesNotThrow(()=>new Function(bare),'Invalid JS: '+path);
}
console.log('PASS M9 GDM: 2 monitors, primary, resize, native-safe visual group, compositor source syntax');
