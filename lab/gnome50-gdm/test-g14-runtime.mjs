#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const get=async name=>readFile(new URL('./greeter-extension/'+name,import.meta.url),'utf8');
const source=await get('greeter-starfield.js');
const nativeScene=await import('data:text/javascript;base64,'+
    Buffer.from(await get('scene-data.js')).toString('base64'));
const nativeFx=await import('data:text/javascript;base64,'+
    Buffer.from(await get('stellar-effects.js')).toString('base64'));

const withoutImports=source
    .replace(/^import[\s\S]*?from '[^']+';\s*$/gm,'')
    .replace('export class GreeterStarfield','class GreeterStarfield');
assert.ok(!/^import\s/m.test(withoutImports));
let now=10_000_000, nextTimer=1;
const timers=new Map();
const GLib={
    PRIORITY_DEFAULT:0,
    SOURCE_REMOVE:false,
    SOURCE_CONTINUE:true,
    timeout_add:(_priority,ms,fn)=>{
        assert.equal(ms,62);
        const id=nextTimer++;timers.set(id,fn);return id;
    },
    source_remove:id=>timers.delete(id),
    get_monotonic_time:()=>now,
};
class Widget {
    constructor(params={}){
        assert.equal(params.reactive,false);
        assert.equal(params.can_focus,false);
        this.params=params;
        this.children=[];this.events=new Map();this.opacity=0;
        this.destroyed=false;
    }
    add_constraint(){}
    add_child(actor){this.children.push(actor);}
    connect(name,fn){this.events.set(name,fn);return this.events.size;}
    set_style(str){this.style=str;}
    set_pivot_point(){}
    set_position(x,y){this.x=x;this.y=y;}
    set_size(w,h){this.width=w;this.height=h;}
    set_scale(x,y){this.scale=[x,y];}
    destroy(){this.destroyed=true;for(const c of this.children)c.destroy?.();}
}
class DrawingArea extends Widget {
    queue_repaint(){this.repaints=(this.repaints??0)+1;}
}
const Clutter={
    FixedLayout:class{},BindConstraint:class{},BindCoordinate:{SIZE:1},
};
const Gio={File:{new_for_path:p=>({
    query_exists:()=>!p.includes('MISSING'),
    get_uri:()=> 'file://'+p,
})}};
const St={Widget,DrawingArea};
const ctor=new Function('Clutter','Gio','GLib','St',
    'activationCount','updateActiveStars','activeEdges',
    'coverTransform','StellarEffects','completionWave',
    'completionLevel','starLightProfile','connectionLightProfile',
    withoutImports+'\nreturn GreeterStarfield;');
const GreeterStarfield=ctor(Clutter,Gio,GLib,St,
    nativeScene.activationCount,nativeScene.updateActiveStars,
    nativeScene.activeEdges,nativeScene.coverTransform,
    nativeFx.StellarEffects,nativeFx.completionWave,
    nativeFx.completionLevel,nativeFx.starLightProfile,
    nativeFx.connectionLightProfile);
const vertices=Array.from({length:13},(_,i)=>[
    .18+.58*(i/12),
    .22+.51*(Math.sin(i/12*Math.PI)*.85),
]);
const scene={
    vertices,edges:Array.from({length:12},(_,i)=>[i,i+1]),
    image_size:[1920,1080],sprite_size:[26,26],
};
const paths=vertices.map((_,i)=>'/scene/star-'+i+'.png');
const parent=new Widget({reactive:false,can_focus:false});
const mappings=[],completion=[];
const hud={setMapping:m=>mappings.push([...m]),
    setCompletion:f=>completion.push(f)};
const stars=new GreeterStarfield(parent,scene,paths,hud);
assert.ok(stars.actor.params.layout_manager instanceof Clutter.FixedLayout);
assert.equal(stars.actor.children.length,1+26,'one canvas, 13 halos and 13 original photographic cores');
assert.equal(stars._active.reduce((a,b)=>a+b,0),0);
assert.equal(timers.size,0,'no continuous idle renderer');
assert.equal(stars.actor.children[0].repaints,1);

function frames(n){
    for(let i=0;i<n;i++){
        now+=62_000;
        for(const [id,callback] of [...timers])
            if(callback()===GLib.SOURCE_REMOVE)timers.delete(id);
    }
}
stars.setLength(1);
assert.equal(stars._active.reduce((a,b)=>a+b,0),2,
    'one password-length increment lights two of the 13 real photo stars');
assert.equal(timers.size,1);
frames(5);
assert.ok(stars._sprites.some(a=>a.opacity>0));
assert.ok(stars._halos.some(a=>a.opacity>0));
assert.equal(mappings.at(-1).reduce((a,b)=>a+b,0),2);
const before=Uint8Array.from(stars._active);
stars.setLength(3);
assert.equal(stars._active.reduce((a,b)=>a+b,0),5);
assert.ok(before.every((v,i)=>!v||stars._active[i]),
    'additions keep previously selected real stars');
const after=Uint8Array.from(stars._active);
stars.setLength(2);
assert.equal(stars._active.reduce((a,b)=>a+b,0),4);
assert.equal(after.reduce((n,v,i)=>n+(v&&!stars._active[i]?1:0),0),1,
    'backspace removes a real illuminated star');
stars.setLength(8);
assert.equal(stars._active.reduce((a,b)=>a+b,0),13);
frames(35);
assert.ok(completion.length>0,'completion effect sent to existing HUD');

const drawn=[];
const cr={
    setSourceRGBA(){},setLineWidth(){},moveTo(...p){drawn.push(p);},
    lineTo(...p){drawn.push(p);},stroke(){},
};
stars._paint(cr,1484,928);
assert.ok(drawn.length>0,'true scene edges are drawn');
assert.ok(stars._sprites.every(s=>Number.isFinite(s.x)&&Number.isFinite(s.y)),
    'original source star coordinates mapped to GDM photo cover geometry');
stars.clear();
assert.equal(stars._active.reduce((a,b)=>a+b,0),0);
frames(35);
const oldActor=stars.actor;
stars.destroy();
assert.ok(oldActor.destroyed);
assert.equal(timers.size,0,'no lingering GNOME Shell timer');
assert.doesNotThrow(()=>stars.destroy());
assert.doesNotThrow(()=>stars.setLength(3));

assert.throws(()=>new GreeterStarfield(parent,scene,
    paths.map((p,i)=>i===3?'MISSING':p),hud),/unavailable/);
console.log('PASS G1.4 runtime: photographed sprites, random mapping, backspace, authentic edges, completion, resize geometry, cleanup');
