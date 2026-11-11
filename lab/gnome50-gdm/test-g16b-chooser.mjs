#!/usr/bin/env node
// Mellon G1.6B — GNOME 50 account-selection orchestration using mock actors.
// No password, user-name guessing or custom auth; native item.emit('activate').
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
let src=await readFile(
    new URL('./greeter-extension/greeter-account-chooser.js',import.meta.url),
    'utf8');
for(const line of ["import Clutter from 'gi://Clutter';",
                   "import St from 'gi://St';"]){
    assert.ok(src.includes(line));
    src=src.replace(line,'');
}
src=src.replace('export class GreeterAccountChooser',
                'class GreeterAccountChooser');
const Clutter={BindCoordinate:{SIZE:1},AlignAxis:{BOTH:2},
    FixedLayout:class{},BindConstraint:class{},AlignConstraint:class{}};
class Actor{
    constructor(opts={}){
        this.opts=opts;this.visible=opts.visible??true;
        this.destroyed=false;this.children=[];this.focused=false;
    }
    show(){this.visible=true;}
    hide(){this.visible=false;}
    add_constraint(){}
    add_child(c){this.children.push(c);}
    get_children(){return this.children;}
    set_child(c){this.children=[c];}
    connect(name,fn){assert.equal(name,'clicked');this.click=fn;}
    grab_key_focus(){this.focused=true;}
    set_position(x,y){this.position=[x,y];}
    destroy(){this.destroyed=true;for(const c of this.children)c.destroy();
        this.children=[];}
}
class Widget extends Actor {}
class BoxLayout extends Actor {}
class Button extends Actor {}
class Label extends Actor {}
const St={Widget,BoxLayout,Button,Label};
const Chooser=new Function('St','Clutter',src+
    '\nreturn GreeterAccountChooser;')(St,Clutter);
function mock(names,opts={}){
    const activated=[];
    const items=new Map();
    function add(name){
        const user={
            is_loaded:true,locked:false,
            get_user_name:()=>name,
            get_real_name:()=>name==='test1'?'Test Pilot':name,
            is_system_account:()=>false,
        };
        const item={user,emit(signal){
            assert.equal(signal,'activate');activated.push(name);
            dialog._userSelectionBox.visible=false;
            dialog._authPrompt.visible=true;
        }};
        items.set(name,item);return item;
    }
    const photo=new Widget(),stars={actor:new Widget()},
        layout=[],hud={actor:new Widget(),
        setRecoveryLayout:v=>layout.push(v)};
    const ordered=[photo,stars.actor,hud.actor];
    const container={
        insert_child_above(actor,sibling){
            assert.ok(!ordered.includes(actor));const idx=ordered.indexOf(sibling);
            assert.ok(idx>=0);ordered.splice(idx+1,0,actor);
        },
        set_child_above_sibling(actor,sibling){
            const idx=ordered.indexOf(actor);assert.ok(idx>=0);
            ordered.splice(idx,1);
            const at=ordered.indexOf(sibling);assert.ok(at>=0);
            ordered.splice(at+1,0,actor);
        },
        set_child_below_sibling(actor,sibling){
            const idx=ordered.indexOf(actor);assert.ok(idx>=0);
            ordered.splice(idx,1);
            const at=ordered.indexOf(sibling);assert.ok(at>=0);
            ordered.splice(at,0,actor);
        },
    };
    const list={_items:items,numItems:()=>items.size,
        grab_key_focus(){this.focused=true;}};
    const dialog={
        _userList:list,_userListLoaded:opts.loaded??true,
        _disableUserList:opts.disabled??false,
        _userManager:{is_loaded:opts.managerLoaded??true},
        _userSelectionBox:{visible:true},
        _authPrompt:{visible:false},
        _timedLoginUserListHold:null,
        get_parent:()=>container,
    };
    ordered.push(dialog);
    for(const n of names)add(n);
    const chooser=new Chooser(container,dialog,photo,stars,hud);
    return {chooser,activated,items,dialog,list,photo,stars,hud,
        layout,add,order:()=>ordered};
}
{
    const h=mock(['test1']);
    h.chooser.sync();
    assert.equal(h.chooser.isVisible,true);
    assert.equal(h.activated.length,0,'Initial list settling must not auth');
    assert.equal(h.chooser._panel.children[1].opts.text,'IDENTIFYING OPERATOR');
    assert.deepEqual(h.layout,[true]);
    for(let i=0;i<4;i++)h.chooser.sync();
    assert.equal(h.activated.length,0);
    h.chooser.sync();
    assert.deepEqual(h.activated,['test1'],
        'After 5 stable ticks, native activate exactly once');
    assert.equal(h.chooser.isVisible,false);
    h.dialog._authPrompt.visible=false;
    h.dialog._userSelectionBox.visible=true;
    for(let i=0;i<10;i++)h.chooser.sync();
    assert.deepEqual(h.activated,['test1'],
        'No infinite reauto-selection after user cancels');
    assert.equal(h.chooser.isVisible,true);
    assert.equal(h.chooser._panel.children.length,3,
        'Canceled single-user prompt offers a Mellon selection button');
    h.chooser.destroy();
    assert.equal(h.chooser._destroyed,true);
}
{
    const h=mock(['bob','alice','carol']);
    for(let i=0;i<12;i++)h.chooser.sync();
    assert.equal(h.activated.length,0,'Multiple users never auto-selected');
    assert.equal(h.chooser.isVisible,true);
    const buttons=h.chooser._panel.children.filter(x=>x instanceof Button);
    assert.equal(buttons.length,3,'All native users represented');
    assert.equal(buttons[0].focused,true,'First tile keyboard-focusable');
    buttons[1].click();
    assert.deepEqual(h.activated,['bob'],
        'Custom tile sends native UserListItem activation signal');
    assert.equal(h.chooser.isVisible,false);
    h.chooser.destroy();
}
{
    const h=mock(['test1'],{disabled:true});
    for(let i=0;i<15;i++)h.chooser.sync();
    assert.equal(h.chooser.isVisible,false);
    assert.equal(h.activated.length,0);
    h.chooser.destroy();
}
{
    const h=mock([], {managerLoaded:false});
    h.chooser.sync();
    assert.equal(h.chooser.isVisible,false);
    h.add('test1');
    h.dialog._userManager.is_loaded=true;
    h.chooser.sync();
    assert.equal(h.chooser.isVisible,true);
    // A late-arriving second user prevents the pending auto-selection.
    h.add('second');
    h.chooser.sync();
    for(let i=0;i<9;i++)h.chooser.sync();
    assert.equal(h.activated.length,0);
    assert.equal(h.chooser._panel.children.filter(x=>x instanceof Button).length,2);
    h.chooser.destroy();
}
{
    const h=mock(Array.from({length:9},(_,i)=>'account'+i));
    h.chooser.sync();
    assert.equal(h.chooser.isVisible,false,
        'Roster too large to represent: native UI must remain accessible');
    h.chooser.destroy();
}
{
    const h=mock(['test1','bob']);
    h.chooser.sync();
    const recovery=h.chooser._recovery;
    assert.deepEqual(recovery.position,[26,22]);
    recovery.click();
    assert.equal(h.chooser.isVisible,false);
    assert.equal(h.list.focused,true,
        'SHOW LOGIN restores native user list keyboard focus');
    assert.equal(h.order().indexOf(h.photo) <
        h.order().indexOf(h.dialog),true,'Artwork returned below native');
    for(let i=0;i<10;i++)h.chooser.sync();
    assert.equal(h.chooser.isVisible,false,'Native recovery latched');
    h.chooser.destroy();
}
{
    const h=mock(['test1']);
    h.chooser.sync();
    h.dialog._authPrompt.visible=true;
    h.dialog._userSelectionBox.visible=false;
    h.chooser.sync();
    assert.equal(h.chooser.isVisible,false,
        'Native alternate/password prompt cannot be covered by account picker');
    h.chooser.destroy();
}
console.log('PASS G1.6B: one-user deferred native selection, multi-user tiles, roster changes, SHOW LOGIN, fail open');
