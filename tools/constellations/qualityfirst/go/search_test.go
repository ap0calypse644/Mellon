package main

import (
    "math"
    "math/rand"
    "testing"
)

func TestHungarianAssignment(t *testing.T) {
    costs:=[]float64{4,1,9, 2,8,5}
    ids,ok:=hungarian(costs,2,3)
    if !ok||ids[0]!=1||ids[1]!=0 {t.Fatalf("wrong optimal assignment: %v %v",ids,ok)}
    _,ok=hungarian([]float64{1,1e10,1e10,1e10},2,2)
    if ok {t.Fatal("forbidden assignment must fail")}
}
func TestRigidTransformNoReflection(t *testing.T) {
    pts:=[]Point{{-.5,-.35},{.5,-.35},{0,.35},{-.2,.5}}
    expected:=make([]Point,len(pts))
    center:=Point{X:960,Y:540}
    transform(pts,center,920,.33,expected)
    actualCenter,scale,angle:=fit(pts,expected)
    if math.Hypot(actualCenter.X-center.X,actualCenter.Y-center.Y)>1e-7||
       math.Abs(scale-920)>1e-7||math.Abs(angle-.33)>1e-7 {
        t.Fatalf("incorrect similarity fit: %+v %.9f %.9f",actualCenter,scale,angle)
    }
}
func TestAssignmentPrefersBrightButKeepsUniqueIDs(t *testing.T) {
    im:=&ImageInput{Width:1920,Height:1080,Stars:[]Star{
        {ID:"dim",X:500,Y:500,Score:0},
        {ID:"bright",X:505,Y:500,Score:1},
        {ID:"other",X:550,Y:500,Score:.8},
    }}
    ids,ok:=assign(makeGrid(im),[]Point{{X:500.1,Y:500},{X:550,Y:500}})
    if !ok||ids[0]!=1||ids[1]!=2 {t.Fatalf("brightness preference incorrect: %v %v",ids,ok)}
    if ids[0]==ids[1] {t.Fatal("reused one source star")}
}
func TestSampleKeepsHardMarginsAndCenter(t *testing.T) {
    pts:=[]Point{{-.5,-.3},{.5,-.3},{0,.3}}
    rng:=rand.New(rand.NewSource(43))
    valid:=0
    for i:=0;i<2000;i++{
        p,ok:=sample(rng,pts,1920,1080)
        if !ok {continue}
        valid++
        positions:=make([]Point,len(pts))
        transform(pts,p.center,p.radius,p.angle,positions)
        left,top,right,bottom:=math.Inf(1),math.Inf(1),math.Inf(-1),math.Inf(-1)
        for _,v:=range positions {
            left=math.Min(left,v.X);top=math.Min(top,v.Y)
            right=math.Max(right,v.X);bottom=math.Max(bottom,v.Y)
        }
        if left<.14*1920-.01||right>.86*1920+.01||
           top<.14*1080-.01||bottom>.86*1080+.01 {
           t.Fatal("violated original 14% inner safe zone")
        }
        if math.Abs((left+right)/(2*1920)-.5)>.13+.00001||
           math.Abs((top+bottom)/(2*1080)-.5)>.13+.00001 {
           t.Fatal("violated original center tolerance")
        }
    }
    if valid==0 {t.Fatal("no feasible placements")}
}
func TestBrightnessQualityRanking(t *testing.T) {
    im:=&ImageInput{Width:1920,Height:1080,Stars:[]Star{
        {ID:"a",X:440,Y:400,Score:.92,Brightness:.85},
        {ID:"b",X:1560,Y:400,Score:.95,Brightness:.88},
        {ID:"c",X:1000,Y:820,Score:.82,Brightness:.76},
    }}
    g:=makeGrid(im)
    template:=Template{Name:"Synthetic",Points:[][]float64{{-.5,-.3},{.5,-.3},{0,.3}},
        Edges:[][]int{{0,1},{1,2}}}
    fit:=rigid{center:Point{1000,540},scale:1100,rms:5,worst:7,indices:[]int{0,1,2}}
    bright,ok:=makeMatch(g,"S",template,fit)
    if !ok{t.Fatal("synthetic source points should pass hard constraints")}
    for i:=range im.Stars {im.Stars[i].Score=.2}
    dim,ok:=makeMatch(g,"S",template,fit)
    if !ok||bright.Rank<=dim.Rank {t.Fatal("brightest source should outrank dim source")}
}
func TestFinalTemplateDiversity(t *testing.T) {
    mk:=func(id string,score,x float64)Match{
        return Match{Constellation:id,Rank:score,RMS:2,
            StarIDs:[]string{id+"1",id+"2",id+"3"},
            Transform:Transform{Center:[2]float64{x,600},Scale:700}}
    }
    selected:=selectBest([]Match{
        mk("A",.99,200),mk("A",.98,600),mk("B",.92,300),mk("C",.90,700)},3)
    if len(selected)!=3 {t.Fatalf("expected three candidates, got %d",len(selected))}
    count:=map[string]int{}
    for _,m:=range selected {count[m.Constellation]++}
    if count["A"]!=1||count["B"]!=1||count["C"]!=1 {
        t.Fatalf("diversity did not prefer distinct patterns: %v",count)
    }
}
