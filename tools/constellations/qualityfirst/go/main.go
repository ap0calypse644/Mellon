package main

import (
    "encoding/json"
    "errors"
    "flag"
    "fmt"
    "hash/fnv"
    "math"
    "math/rand"
    "os"
    "runtime"
    "sort"
    "strings"
    "sync"
    "time"
)

const (
    frameMargin = .05
    figureRoom = .09
    centerTolerance = .13
    minSpan = .55
    maxRMS = 13.0
    maxVertexError = 24.0
    rotationLimit = 35.0
    minScale = 350.0
    maxScale = 3200.0
    minScaleRatio = .58
    gridCellSize = 24.0
    maxQueryRadius = 34.0
    brightnessBiasPx = 9.0
)

type Point struct { X, Y float64 }
type Star struct {
    ID string `json:"id"`
    X float64 `json:"x"`
    Y float64 `json:"y"`
    Score float64 `json:"score"`
    Brightness float64 `json:"brightness"`
    Prominence float64 `json:"prominence"`
}
type Template struct {
    Name string `json:"name"`
    Points [][]float64 `json:"points"`
    Edges [][]int `json:"edges"`
}
type ImageInput struct {
    Name string `json:"name"`
    Width int `json:"width"`
    Height int `json:"height"`
    Background string `json:"background"`
    Stars []Star `json:"stars"`
}
type Input struct {
    Schema string `json:"schema"`
    Templates map[string]Template `json:"templates"`
    Images []ImageInput `json:"images"`
}
type Brightness struct {
    Mean float64 `json:"score_mean"`
    P20 float64 `json:"score_p20"`
    Min float64 `json:"score_min"`
    BrightFraction float64 `json:"fraction_top_quartile"`
    StarScores []float64 `json:"star_scores"`
    RawMean float64 `json:"pixel_brightness_mean"`
}
type Coverage struct {
    WidthFraction float64 `json:"width_fraction"`
    HeightFraction float64 `json:"height_fraction"`
    MaxSpan float64 `json:"max_span_fraction"`
    Area float64 `json:"bounding_area_fraction"`
    BBox [4]float64 `json:"bbox_px"`
}
type Transform struct {
    Center [2]float64 `json:"center_px"`
    Rotation float64 `json:"rotation_deg"`
    Scale float64 `json:"scale_px"`
}
type Match struct {
    Constellation string `json:"constellation"`
    Name string `json:"name"`
    StarIDs []string `json:"star_ids"`
    Vertices [][]float64 `json:"vertices"`
    Edges [][]int `json:"edges"`
    Rank float64 `json:"rank_score"`
    Brightness Brightness `json:"brightness"`
    Coverage Coverage `json:"coverage"`
    CenterOffset [2]float64 `json:"center_offset_fraction"`
    FigureRoom [2]float64 `json:"figure_room_px"`
    FigureEnvelope [4]float64 `json:"figure_envelope_bbox_px"`
    RMS float64 `json:"rms_error_px"`
    Worst float64 `json:"max_error_px"`
    Transform Transform `json:"transform"`
    Status string `json:"status"`
    indices []int
}
type ImageResult struct {
    Size [2]int `json:"image_size"`
    SourceStars int `json:"source_stars"`
    Evaluated uint64 `json:"evaluated_proposals"`
    Refined uint64 `json:"refined_proposals"`
    Valid uint64 `json:"valid_candidates_before_dedup"`
    Matches []Match `json:"matches"`
}
type Output struct {
    Schema string `json:"schema"`
    Settings map[string]any `json:"settings"`
    Images map[string]ImageResult `json:"images"`
}

type config struct {
    attempts int
    shortlist int
    perTemplate int
    perImage int
    workers int
    seed int64
}
type work struct {
    image *ImageInput
    templateID string
    template Template
    grid *Grid
}
type workResult struct {
    imageName, templateID string
    candidates []Match
    attempted, refined, valid uint64
    err error
}

func finite(v float64) bool { return !math.IsNaN(v) && !math.IsInf(v, 0) }
func clamp(v, lo, hi float64) float64 {
    if v < lo {return lo}; if v > hi {return hi}; return v
}
func round(v float64, places float64) float64 { return math.Round(v*places)/places }
func hypot(a,b float64) float64 { return math.Hypot(a,b) }
func seedFor(seed int64, name, id string) int64 {
    h:=fnv.New64a()
    _,_ = h.Write([]byte(fmt.Sprintf("%d/%s/%s", seed,name,id)))
    return int64(h.Sum64() & (1<<63-1))
}
func loadInput(path string) (Input, error) {
    var in Input
    f, err:=os.Open(path); if err!=nil{return in,err}; defer f.Close()
    dec:=json.NewDecoder(f)
    if err=dec.Decode(&in);err!=nil{return in,err}
    if in.Schema!="mellon-quality-input-v1" {return in,errors.New("unexpected catalog schema")}
    if len(in.Images)==0 || len(in.Templates)==0 {return in,errors.New("no images or templates")}
    seenImages:=map[string]bool{}
    for i:=range in.Images {
        im:=&in.Images[i]
        if im.Name=="" || seenImages[im.Name] {return in,fmt.Errorf("missing/duplicate image name %q",im.Name)}
        seenImages[im.Name]=true
        if im.Width<=0||im.Height<=0||len(im.Stars)<100 {return in,fmt.Errorf("invalid star catalog %s",im.Name)}
        seenIDs:=make(map[string]bool,len(im.Stars))
        for _,s:=range im.Stars {
            if s.ID==""||seenIDs[s.ID]||!finite(s.X)||!finite(s.Y)||!finite(s.Score)||
               s.X<0||s.X>=float64(im.Width)||s.Y<0||s.Y>=float64(im.Height)||
               s.Score<0||s.Score>1 {return in,fmt.Errorf("invalid or duplicate feature in %s",im.Name)}
            seenIDs[s.ID]=true
        }
    }
    for id,t:=range in.Templates {
        if len(t.Points)<3||len(t.Points)>96||len(t.Edges)==0 {return in,fmt.Errorf("invalid template %s",id)}
        for _,p:=range t.Points {
            if len(p)!=2||!finite(p[0])||!finite(p[1]){return in,fmt.Errorf("invalid template coordinate %s",id)}
        }
        for _,e:=range t.Edges {
            if len(e)!=2||e[0]<0||e[0]>=len(t.Points)||e[1]<0||e[1]>=len(t.Points)||e[0]==e[1] {
                return in,fmt.Errorf("invalid topology %s",id)
            }
        }
    }
    return in,nil
}
func better(a,b Match) bool {
    if a.Rank!=b.Rank{return a.Rank>b.Rank}
    if a.RMS!=b.RMS{return a.RMS<b.RMS}
    if a.Constellation!=b.Constellation{return a.Constellation<b.Constellation}
    return strings.Join(a.StarIDs,",")<strings.Join(b.StarIDs,",")
}
func nearDuplicate(a,b Match) bool {
    if a.Constellation!=b.Constellation{return false}
    if math.Hypot(a.Transform.Center[0]-b.Transform.Center[0],
                  a.Transform.Center[1]-b.Transform.Center[1])>42{return false}
    if math.Abs(a.Transform.Scale-b.Transform.Scale)/math.Max(a.Transform.Scale,b.Transform.Scale)>.085{return false}
    if math.Abs(a.Transform.Rotation-b.Transform.Rotation)>9{return false}
    return true
}
func sharedFraction(a,b Match) float64 {
    ids:=make(map[string]bool,len(a.StarIDs))
    for _,v:=range a.StarIDs {ids[v]=true}
    shared:=0
    for _,v:=range b.StarIDs {if ids[v] {shared++}}
    return float64(shared)/float64(min(len(a.StarIDs),len(b.StarIDs)))
}
func selectBest(all []Match, maxN int) []Match {
    sort.Slice(all,func(i,j int)bool{return better(all[i],all[j])})
    selected:=make([]Match,0,maxN)
    templatesUsed:=map[string]int{}
    for pass:=0;pass<2;pass++ {
        for _,m:=range all {
            if len(selected)>=maxN {break}
            if pass==0&&templatesUsed[m.Constellation]>0{continue}
            if templatesUsed[m.Constellation]>=2{continue}
            duplicate:=false
            for _,v:=range selected {
                if nearDuplicate(m,v)||sharedFraction(m,v)>.48 {duplicate=true;break}
            }
            if duplicate{continue}
            selected=append(selected,m)
            templatesUsed[m.Constellation]++
        }
    }
    return selected
}
func main() {
    inputPath:=flag.String("input","","Prepared JSON containing six unchanged photographic catalogues")
    outputPath:=flag.String("output","","Output quality-first JSON (separate from v6/v8)")
    attempts:=flag.Int("attempts-per-template",1000000,"Millions of deterministic candidate transforms per image/template")
    shortlist:=flag.Int("shortlist-per-batch",10,"Expensive rigid refinements per 2048 proposals")
    templateKeep:=flag.Int("candidates-per-template",24,"Bounded temporary top candidates per template")
    perImage:=flag.Int("scenes-per-background",6,"Final diverse matches per background")
    workers:=flag.Int("workers",max(1,min(16,runtime.NumCPU()-2)),"Parallel image/template jobs")
    seed:=flag.Int64("seed",20261110,"Reproducible deterministic seed independent of Go worker scheduling")
    only:=flag.String("only","","Optional comma-separated constellation IDs")
    flag.Parse()
    if *inputPath==""||*outputPath==""||*attempts<1||*shortlist<1||*shortlist>100||
        *templateKeep<1||*perImage<1||*workers<1 {
        fmt.Fprintln(os.Stderr,"usage: mellon-quality -input prepared.json -output matches.json [-attempts-per-template 1000000] [-workers 12]")
        os.Exit(2)
    }
    in,err:=loadInput(*inputPath)
    if err!=nil{fmt.Fprintln(os.Stderr,err);os.Exit(1)}
    cfg:=config{*attempts,*shortlist,*templateKeep,*perImage,*workers,*seed}
    ids:=make([]string,0,len(in.Templates))
    filter:=map[string]bool{}
    if *only!="" {for _,v:=range strings.Split(*only,","){filter[strings.TrimSpace(v)]=true}}
    for id:=range in.Templates{if len(filter)==0||filter[id] {ids=append(ids,id)}}
    sort.Strings(ids)
    if len(ids)==0{fmt.Fprintln(os.Stderr,"no matching constellation IDs");os.Exit(2)}
    for id:=range filter{if _,ok:=in.Templates[id];!ok{fmt.Fprintln(os.Stderr,"unknown template:",id);os.Exit(2)}}
    grids:=make(map[string]*Grid,len(in.Images))
    for i:=range in.Images{im:=&in.Images[i]; grids[im.Name]=makeGrid(im)}
    jobs:=make(chan work)
    results:=make(chan workResult,*workers)
    var wg sync.WaitGroup
    start:=time.Now()
    for i:=0;i<cfg.workers;i++{
        wg.Add(1)
        go func(){
            defer wg.Done()
            for task:=range jobs{
                m,attempted,refined,valid:=solve(task,cfg)
                results<-workResult{task.image.Name,task.templateID,m,attempted,refined,valid,nil}
            }
        }()
    }
    go func(){
        for i:=range in.Images {
            im:=&in.Images[i]
            for _,id:=range ids {
                jobs<-work{im,id,in.Templates[id],grids[im.Name]}
            }
        }
        close(jobs);wg.Wait();close(results)
    }()
    output:=Output{
        Schema:"mellon-quality-results-v1",
        Settings:map[string]any{
            "attempts_per_template":cfg.attempts,"shortlist_per_batch":cfg.shortlist,
            "candidates_per_template":cfg.perTemplate,"scenes_per_background":cfg.perImage,
            "seed":cfg.seed,"worker_count":cfg.workers,
            "template_ids":ids,"catalog_schema":in.Schema,
            "frame_margin":frameMargin,"figure_room_x":figureRoom,"figure_room_y":figureRoom,
            "center_tolerance_x":centerTolerance,"center_tolerance_y":centerTolerance,
            "min_span":minSpan,"threshold_px":maxRMS,"max_vertex_error_px":maxVertexError,
            "rotation_limit_deg":rotationLimit,"brightness_scoring":"0.75 raw brightness percentile + 0.25 local prominence percentile",
        },
        Images:make(map[string]ImageResult,len(in.Images)),
    }
    all:=make(map[string][]Match,len(in.Images))
    for _,im:=range in.Images {
        output.Images[im.Name]=ImageResult{Size:[2]int{im.Width,im.Height},SourceStars:len(im.Stars)}
    }
    done:=0
    for result:=range results {
        if result.err!=nil{fmt.Fprintln(os.Stderr,result.err);os.Exit(1)}
        a:=output.Images[result.imageName]
        a.Evaluated+=result.attempted
        a.Refined+=result.refined
        a.Valid+=result.valid
        output.Images[result.imageName]=a
        all[result.imageName]=append(all[result.imageName],result.candidates...)
        done++
        fmt.Printf("[%d/%d] %-20s %-5s retained=%d qualified=%d elapsed=%s\n",
            done,len(ids)*len(in.Images),result.imageName,result.templateID,
            len(result.candidates),result.valid,time.Since(start).Truncate(time.Second))
    }
    total:=0
    for _,im:=range in.Images {
        a:=output.Images[im.Name]
        a.Matches=selectBest(all[im.Name],cfg.perImage)
        for k:=range a.Matches {a.Matches[k].indices=nil}
        output.Images[im.Name]=a
        total+=len(a.Matches)
        fmt.Printf("FINAL %s: %d quality-selected scenes from %d valid refinements\n",
            im.Name,len(a.Matches),a.Valid)
    }
    f,err:=os.Create(*outputPath);if err!=nil{fmt.Fprintln(os.Stderr,err);os.Exit(1)}
    enc:=json.NewEncoder(f);enc.SetIndent("","  ")
    err=enc.Encode(output);closeErr:=f.Close()
    if err!=nil||closeErr!=nil{fmt.Fprintln(os.Stderr,err,closeErr);os.Exit(1)}
    fmt.Printf("SAVED %d quality-selected scenes -> %s; elapsed %s\n",total,*outputPath,time.Since(start))
}
