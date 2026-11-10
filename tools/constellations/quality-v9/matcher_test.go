package main

import (
    "image"
    "image/color"
    "math"
    "math/rand"
    "os"
    "path/filepath"
    "reflect"
    "sort"
    "testing"
)

func TestNearestKExactlyMatchesBruteForce(t *testing.T) {
    rng:=rand.New(rand.NewSource(1001))
    stars:=make([]Star,250)
    for i:=range stars {
        stars[i]=Star{ID:"S",P:Point{rng.Float64()*1000,rng.Float64()*800}}
    }
    tree:=NewKDTree(stars)
    scratch:=make([]neighbor,0,8)
    for run:=0;run<160;run++ {
        target:=Point{rng.Float64()*1100-50,rng.Float64()*900-50}
        for _,k:=range []int{1,3,8} {
            got:=tree.NearestK(target,k,scratch)
            expected:=make([]neighbor,0,len(stars))
            for i,s:=range stars {expected=append(expected,neighbor{Index:i,D2:target.Dist2(s.P)})}
            sort.Slice(expected,func(i,j int)bool{
                if expected[i].D2==expected[j].D2 {return expected[i].Index<expected[j].Index}
                return expected[i].D2<expected[j].D2
            })
            if !reflect.DeepEqual(got,expected[:k]) {
                t.Fatalf("nearest %d query %d is not exact: %v vs %v",k,run,got,expected[:k])
            }
        }
    }
}

func TestBrighterRealStarBeatsNearbyDimOne(t *testing.T) {
    c:=&Catalog{Stars:[]Star{
        {ID:"dim",P:Point{0,0},Score:0},
        {ID:"bright",P:Point{5,0},Score:1},
    }}
    c.Tree=NewKDTree(c.Stars)
    target:=[]Point{{.1,0}}
    without,ok:=assignBright(c,target,2,0)
    if !ok || without[0]!=0 {t.Fatalf("unweighted mapping: %v",without)}
    with,ok:=assignBright(c,target,2,8)
    if !ok || with[0]!=1 {t.Fatalf("brightness preference not effective: %v",with)}
    // The preference must not allow repeated assignment of a single star.
    second:=[]Point{{.1,0},{.2,0}}
    unique,ok:=assignBright(c,second,2,8)
    if !ok || unique[0]==unique[1] {t.Fatalf("duplicate stars: %v",unique)}
}

func TestSimilarityFitRigidTransform(t *testing.T) {
    reference:=[]Point{{-.5,-.3},{.5,-.3},{0,.2},{.2,.5}}
    theta:=.3
    actual:=make([]Point,len(reference))
    for i,p:=range reference {
        actual[i]=Point{860,430}.Add(rotated(p,theta).Mul(900))
    }
    center,scale,angle,pred,ok:=fitSimilarity(reference,actual)
    if !ok || math.Abs(center[0]-860)>1e-7 || math.Abs(center[1]-430)>1e-7 ||
        math.Abs(scale-900)>1e-7 || math.Abs(angle-theta)>1e-7 {
        t.Fatalf("unexpected rigid fit: center=%v scale=%f angle=%f",center,scale,angle)
    }
    for i:=range actual {
        if math.Sqrt(actual[i].Dist2(pred[i]))>1e-7 {t.Fatal("rigid fit moved source star")}
    }
}

func TestExistingOrionAndAllOtherTemplatesPreserved(t *testing.T) {
    updated,_,err:=loadTemplates(filepath.Join("..","templates-v4-orion-bow.json"))
    if err!=nil {t.Fatal(err)}
    old,_,err:=readJSON(filepath.Join("..","templates-v3.json"),&TemplateFile{})
    _=old
    if err!=nil {t.Fatal(err)}
    var file TemplateFile
    if _,err:=readJSON(filepath.Join("..","templates-v3.json"),&file);err!=nil {t.Fatal(err)}
    if len(updated)!=len(file.Templates) {t.Fatal("changed number of templates")}
    for key,previous:=range file.Templates {
        if key=="Ori" {continue}
        if !reflect.DeepEqual(previous,updated[key]) {t.Fatalf("unrelated %s template changed",key)}
    }
    if len(updated["Ori"].Points)!=18 || len(updated["Ori"].Edges)!=18 {
        t.Fatal("Orion's historical bow not present")
    }
}

func TestCenterAndArtworkBoundsAreHard(t *testing.T) {
    cfg:=defaults()
    template:=Template{Name:"synthetic",Points:[]Point{{-.5,-.3},{.5,-.3},{0,.3}},
        Edges:[][2]int{{0,1},{1,2}}}
    center:=Point{960,540}
    coords:=make([]Point,3)
    for i,p:=range template.Points {coords[i]=center.Add(p.Mul(1450))}
    c:=&Catalog{W:1920,H:1080,ByID:map[string]int{}}
    for i,p:=range coords {
        id:=string(rune('A'+i))
        c.ByID[id]=i
        c.Stars=append(c.Stars,Star{ID:id,P:p,Brightness:.9,
            Prominence:90,Score:.88})
    }
    f:=refined{Indices:[]int{0,1,2},Actual:coords,Center:center,
        Scale:1450,Theta:0,RMS:1,Worst:2}
    _,ok:=makeMatch(c,"Toy",template,f,cfg)
    if ok {t.Fatal("artwork-safe bounds must reject excessively tall constellation")}
    // Smaller scale passes with the same hard margin; no brightness override.
    f.Scale=1200
    for i,p:=range template.Points {
        f.Actual[i]=center.Add(p.Mul(f.Scale))
        c.Stars[i].P=f.Actual[i]
    }
    m,ok:=makeMatch(c,"Toy",template,f,cfg)
    if !ok {t.Fatal("valid constellation rejected")}
    if m.Brightness.ScoreMean<.85 {t.Fatal("photometric metadata incorrect")}
    if err:=validateMatch(c,"Toy",template,m,cfg);err!=nil {t.Fatal(err)}
    c.Stars[0].P[0]=100 // Original image star placed outside safe region.
    if err:=validateMatch(c,"Toy",template,m,cfg);err==nil {
        t.Fatal("source coordinate/safe-region mutation not detected")
    }
}

func TestQAEnhancesOnlyExistingColoredPixels(t *testing.T) {
    src:=image.NewRGBA(image.Rect(0,0,72,36))
    bg:=color.RGBA{R:6,G:9,B:18,A:255}
    for y:=0;y<36;y++ {for x:=0;x<72;x++ {src.SetRGBA(x,y,bg)}}
    src.SetRGBA(16,18,color.RGBA{R:180,G:22,B:26,A:255})
    src.SetRGBA(55,18,color.RGBA{R:20,G:55,B:195,A:255})
    preview:=copyRGBA(src)
    enhanceOriginalStar(preview,src,Star{ID:"red",P:Point{16,18},Radius:1.4},1.65,1.35)
    enhanceOriginalStar(preview,src,Star{ID:"blue",P:Point{55,18},Radius:1.4},1.65,1.35)
    red:=preview.RGBAAt(16,18)
    blue:=preview.RGBAAt(55,18)
    if red.R<=red.G*2 || red.R<=red.B*2 {t.Fatalf("red changed hue: %v",red)}
    if blue.B<=blue.R*2 || blue.B<=blue.G*2 {t.Fatalf("blue changed hue: %v",blue)}
    if preview.RGBAAt(2,2)!=bg {t.Fatal("rendered artificial pixels far from source star")}
    // Expanded nearby pixels must gain light, without drawing a circle.
    if preview.RGBAAt(17,18)==bg || preview.RGBAAt(54,18)==bg {
        t.Fatal("original star core did not expand in its original RGB")
    }
}

func TestResumeSignatureIndependentOfParallelism(t *testing.T) {
    cfg:=defaults()
    first:=searchSignature(cfg,"templates","stars","Ori","blue-gold-nebula")
    cfg.Workers=1
    cfg.PerBackground=3
    cfg.EnhanceGain=1.1
    same:=searchSignature(cfg,"templates","stars","Ori","blue-gold-nebula")
    if first!=same {t.Fatal("worker count/preview changed expensive search signature")}
    cfg.BrightnessRankWeight+=.01
    if first==searchSignature(cfg,"templates","stars","Ori","blue-gold-nebula") {
        t.Fatal("brightness changes must invalidate resume checkpoints")
    }
}

func TestAtomicJSONIsValidAndReplaceable(t *testing.T) {
    file:=filepath.Join(t.TempDir(),"checkpoints","foo.json")
    for i:=0;i<3;i++ {
        if err:=atomicJSON(file,map[string]int{"value":i});err!=nil {t.Fatal(err)}
    }
    raw,err:=os.ReadFile(file)
    if err!=nil || len(raw)==0 {t.Fatal("atomic checkpoint wasn't saved")}
}
