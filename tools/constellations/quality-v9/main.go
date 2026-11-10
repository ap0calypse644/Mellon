package main

import (
    "context"
    "encoding/json"
    "errors"
    "flag"
    "fmt"
    "os"
    "path/filepath"
    "runtime"
    "sort"
    "strings"
    "sync"
    "time"
)

type workItem struct { Catalog *Catalog; Key string; Template Template }
type workResult struct {
    Background,Key string
    Matches []Match
    Stats SearchStats
    Cached bool
    Duration time.Duration
    Err error
}

func defaults() Config {
    home,_:=os.UserHomeDir()
    workers:=runtime.NumCPU()-2
    if workers<1 { workers=1 }
    if workers>12 { workers=12 }
    return Config{
        Corpus:"assets/starfield/corpus-v1/catalogs",
        Templates:"tools/constellations/templates-v4-orion-bow.json",
        Output:filepath.Join(home,"VMs/Mellon/constellation-quality-v9"),
        Backgrounds:"all",Only:"all",
        Attempts:500_000,Refine:2500,
        CoarseK:4,AssignmentK:8,
        Workers:workers,PerBackground:8,PerTemplate:5,Seed:20261109,
        BrightnessAssignmentPX:8, BrightnessProposalBonus:6,
        BrightnessRankWeight:.34,
        FrameMargin:.05,FigureRoomX:.09,FigureRoomY:.09,
        CenterToleranceX:.13,CenterToleranceY:.13,MinSpan:.55,
        MinScale:350,MaxScale:3200,MinScaleRatio:.58,
        RotationLimitDeg:35,ThresholdPX:13,MaxVertexErrorPX:24,
        EnhanceScale:1.55,EnhanceGain:1.30,LineOpacity:.38,
    }
}

func parseConfig() (Config,error) {
    cfg:=defaults()
    flag.StringVar(&cfg.Corpus,"corpus",cfg.Corpus,"Input directory containing the unchanged six starfield catalogs")
    flag.StringVar(&cfg.Templates,"templates",cfg.Templates,"Full 31-template atlas with 18-star Orion bow")
    flag.StringVar(&cfg.Output,"out",cfg.Output,"Output directory (only derived database and QA; source images untouched)")
    flag.StringVar(&cfg.Backgrounds,"backgrounds","all","Comma-separated background slugs, or all")
    flag.StringVar(&cfg.Only,"only","all","Comma-separated constellation keys, or all")
    flag.IntVar(&cfg.Attempts,"attempts",cfg.Attempts,"Brute-force random placements per background/template")
    flag.IntVar(&cfg.Refine,"refine",cfg.Refine,"Top proposals per background/template sent to unique-star rigid refinement")
    flag.IntVar(&cfg.CoarseK,"coarse-neighbors",cfg.CoarseK,"Nearby stars considered per projected vertex during proposal screening")
    flag.IntVar(&cfg.AssignmentK,"assignment-neighbors",cfg.AssignmentK,"Nearby source stars per vertex during Hungarian assignment")
    flag.IntVar(&cfg.Workers,"workers",cfg.Workers,"Concurrent Go workers (use 1 for lowest resource use)")
    flag.IntVar(&cfg.PerBackground,"per-background",cfg.PerBackground,"Maximum DIFFERENT constellations saved per background")
    flag.IntVar(&cfg.PerTemplate,"candidates-per-template",cfg.PerTemplate,"Best distinct intermediate candidates kept per template")
    flag.Int64Var(&cfg.Seed,"seed",cfg.Seed,"Master deterministic random seed (independent of worker count)")
    flag.Float64Var(&cfg.BrightnessAssignmentPX,"brightness-assignment-px",cfg.BrightnessAssignmentPX,"Brightness preference within 1:1 star assignment, in squared pixel-cost")
    flag.Float64Var(&cfg.BrightnessProposalBonus,"brightness-proposal-bonus",cfg.BrightnessProposalBonus,"Brightness bonus in coarse placement shortlist")
    flag.Float64Var(&cfg.BrightnessRankWeight,"brightness-rank-weight",cfg.BrightnessRankWeight,"Brightness preference in final quality ranking (v8 was .08)")
    flag.Float64Var(&cfg.FrameMargin,"frame-margin",cfg.FrameMargin,"Outer illustration-free margin, fraction of each side")
    flag.Float64Var(&cfg.FigureRoomX,"figure-room-x",cfg.FigureRoomX,"Reserved artwork width, fraction of screen width on each side")
    flag.Float64Var(&cfg.FigureRoomY,"figure-room-y",cfg.FigureRoomY,"Reserved artwork height, fraction of screen height on each side")
    flag.Float64Var(&cfg.CenterToleranceX,"center-tolerance-x",cfg.CenterToleranceX,"Maximum bbox midpoint offset from center in screen-width units")
    flag.Float64Var(&cfg.CenterToleranceY,"center-tolerance-y",cfg.CenterToleranceY,"Maximum bbox midpoint offset from center in screen-height units")
    flag.Float64Var(&cfg.MinSpan,"min-span",cfg.MinSpan,"Minimum span as fraction of either screen dimension")
    flag.Float64Var(&cfg.MinScale,"min-scale",cfg.MinScale,"Minimum allowed projected scale")
    flag.Float64Var(&cfg.MaxScale,"max-scale",cfg.MaxScale,"Maximum projected scale")
    flag.Float64Var(&cfg.MinScaleRatio,"min-scale-ratio",cfg.MinScaleRatio,"Lowest sampled scale as fraction of maximum feasible scale")
    flag.Float64Var(&cfg.RotationLimitDeg,"rotation-limit-deg",cfg.RotationLimitDeg,"Maximum placement rotation in degrees")
    flag.Float64Var(&cfg.ThresholdPX,"threshold-px",cfg.ThresholdPX,"Maximum final RMS point error in pixels")
    flag.Float64Var(&cfg.MaxVertexErrorPX,"max-vertex-error-px",cfg.MaxVertexErrorPX,"Maximum final individual point error")
    flag.Float64Var(&cfg.EnhanceScale,"enhance-scale",cfg.EnhanceScale,"Scale original source star's luminous pixels on QA copy")
    flag.Float64Var(&cfg.EnhanceGain,"enhance-gain",cfg.EnhanceGain,"Shared RGB gain on original luminous residuals")
    flag.Float64Var(&cfg.LineOpacity,"line-opacity",cfg.LineOpacity,"Thin antialiased connector opacity on QA preview")
    flag.BoolVar(&cfg.Force,"force",false,"Ignore previous resumable checkpoints and recompute selected jobs")
    flag.Parse()
    if cfg.Attempts<1 || cfg.Refine<1 || cfg.CoarseK<1 || cfg.AssignmentK<1 ||
       cfg.Workers<1 || cfg.Workers>256 || cfg.PerBackground<1 || cfg.PerTemplate<1 {
        return cfg,fmt.Errorf("attempts/refine/neighbors/workers/output limits must be positive; workers <=256")
    }
    positives:=[]float64{cfg.BrightnessAssignmentPX,cfg.BrightnessProposalBonus,cfg.BrightnessRankWeight,
        cfg.MinSpan,cfg.FrameMargin,cfg.FigureRoomX,cfg.FigureRoomY,
        cfg.CenterToleranceX,cfg.CenterToleranceY,cfg.MinScale,cfg.MaxScale,
        cfg.RotationLimitDeg,cfg.ThresholdPX,cfg.MaxVertexErrorPX}
    for _,v:=range positives { if !finite(v) || v<0 {return cfg,fmt.Errorf("nonfinite/negative search configuration")} }
    if cfg.MinSpan<=0 || cfg.MinSpan>1 || cfg.MinScale>=cfg.MaxScale ||
       cfg.MinScaleRatio<=0 || cfg.MinScaleRatio>=1 ||
       cfg.FrameMargin+cfg.FigureRoomX>=.5 ||
       cfg.FrameMargin+cfg.FigureRoomY>=.5 ||
       cfg.CenterToleranceX<=0 || cfg.CenterToleranceX>.5 ||
       cfg.CenterToleranceY<=0 || cfg.CenterToleranceY>.5 ||
       cfg.EnhanceScale<1 || cfg.EnhanceScale>3 || cfg.EnhanceGain<1 ||
       cfg.EnhanceGain>2 || cfg.LineOpacity<0 || cfg.LineOpacity>1 {
        return cfg,fmt.Errorf("invalid geometric, enhancement, or margin parameters")
    }
    return cfg,nil
}

func searchSignature(cfg Config,templateHash,starHash,key,slug string) string {
    // Preview settings, worker count, per-background limit and output path
    // intentionally excluded: they don't change per-template SEARCH results.
    fields:=[]any{version,templateHash,starHash,slug,key,cfg.Attempts,
        cfg.Refine,cfg.CoarseK,cfg.AssignmentK,cfg.PerTemplate,cfg.Seed,
        cfg.BrightnessAssignmentPX,cfg.BrightnessProposalBonus,
        cfg.BrightnessRankWeight,cfg.FrameMargin,cfg.FigureRoomX,
        cfg.FigureRoomY,cfg.CenterToleranceX,cfg.CenterToleranceY,
        cfg.MinSpan,cfg.MinScale,cfg.MaxScale,cfg.MinScaleRatio,
        cfg.RotationLimitDeg,cfg.ThresholdPX,cfg.MaxVertexErrorPX}
    data,_:=json.Marshal(fields)
    return hashBytes(data)
}

func runJob(ctx context.Context,item workItem,cfg Config,templateHash string) workResult {
    started:=time.Now()
    c,key:=item.Catalog,item.Key
    result:=workResult{Background:c.Slug,Key:key}
    path:=filepath.Join(cfg.Output,"checkpoints",c.Slug,key+".json")
    signature:=searchSignature(cfg,templateHash,c.Fingerprint,key,c.Slug)
    if !cfg.Force {
        var saved CachedResult
        if _,err:=readJSON(path,&saved);err==nil && saved.Schema==version &&
            saved.Signature==signature && saved.Background==c.Slug && saved.Constellation==key {
            valid:=true
            for _,m:=range saved.Candidates {
                if err:=validateMatch(c,key,item.Template,m,cfg);err!=nil {valid=false;break}
            }
            if valid {
                result.Matches,result.Stats,result.Cached=saved.Candidates,saved.Stats,true
                result.Duration=time.Since(started)
                return result
            }
        }
    }
    matches,stats,err:=searchTemplate(ctx,c,key,item.Template,cfg)
    result.Matches,result.Stats,result.Err=matches,stats,err
    if err!=nil { return result }
    for _,m:=range matches {
        if e:=validateMatch(c,key,item.Template,m,cfg);e!=nil {
            result.Err=fmt.Errorf("matcher self-verification %s/%s: %w",c.Slug,key,e)
            return result
        }
    }
    saved:=CachedResult{Schema:version,Signature:signature,
        Background:c.Slug,Constellation:key,Candidates:matches,Stats:stats}
    result.Err=atomicJSON(path,saved)
    result.Duration=time.Since(started)
    return result
}

func selectBest(matches map[string][]Match,count int) []Match {
    candidates:=make([]Match,0,len(matches))
    for _,all:=range matches {
        if len(all)>0 { candidates=append(candidates,all[0]) }
    }
    sort.SliceStable(candidates,func(i,j int)bool{
        if candidates[i].RankScore==candidates[j].RankScore {
            return candidates[i].Constellation<candidates[j].Constellation
        }
        return candidates[i].RankScore>candidates[j].RankScore
    })
    if len(candidates)>count { candidates=candidates[:count] }
    return candidates
}

func run(cfg Config) error {
    templates,templateHash,err:=loadTemplates(cfg.Templates)
    if err!=nil {return err}
    allFolders,err:=catalogFolders(cfg.Corpus)
    if err!=nil {return err}
    folders,err:=parseSelection(cfg.Backgrounds,allFolders)
    if err!=nil {return err}
    codes,err:=parseSelection(cfg.Only,sortedKeys(templates))
    if err!=nil {return err}
    if len(folders)==0 || len(codes)==0 {return fmt.Errorf("no selected backgrounds/templates")}
    // Avoid accidentally treating a source catalog or GNOME extension folder
    // as an output directory. The search only writes its own output tree.
    out,err:=filepath.Abs(cfg.Output)
    if err!=nil {return err}
    corpus,err:=filepath.Abs(cfg.Corpus)
    if err!=nil {return err}
    if out==corpus || strings.HasPrefix(out,corpus+string(os.PathSeparator)) ||
        out==filepath.Dir(corpus) {
        return fmt.Errorf("refusing to write generated QA into source corpus: %s",out)
    }
    cfg.Output=out
    if err:=os.MkdirAll(cfg.Output,0o755);err!=nil{return err}
    catalogues:=make(map[string]*Catalog,len(folders))
    for _,slug:=range folders {
        c,err:=loadCatalog(cfg.Corpus,slug)
        if err!=nil {return fmt.Errorf("load %s: %w",slug,err)}
        catalogues[slug]=c
        fmt.Printf("SOURCE %-20s %6d actual image features, %dx%d\n",
            slug,len(c.Stars),c.W,c.H)
    }
    jobs:=make(chan workItem,len(folders)*len(codes))
    results:=make(chan workResult,len(folders)*len(codes))
    ctx,cancel:=context.WithCancel(context.Background())
    defer cancel()
    var wg sync.WaitGroup
    for worker:=0;worker<cfg.Workers;worker++ {
        wg.Add(1)
        go func(){
            defer wg.Done()
            for item:=range jobs {
                if ctx.Err()!=nil {return}
                result:=runJob(ctx,item,cfg,templateHash)
                results<-result
                if result.Err!=nil {cancel();return}
            }
        }()
    }
    for _,slug:=range folders {
        for _,key:=range codes {
            jobs<-workItem{Catalog:catalogues[slug],Key:key,Template:templates[key]}
        }
    }
    close(jobs)
    go func(){wg.Wait();close(results)}()
    gathered:=make(map[string]map[string][]Match,len(folders))
    stats:=make(map[string]map[string]SearchStats,len(folders))
    for _,slug:=range folders {
        gathered[slug]=make(map[string][]Match)
        stats[slug]=make(map[string]SearchStats)
    }
    fmt.Printf("SEARCH %d backgrounds x %d templates = %d jobs; %d Go workers\n",
        len(folders),len(codes),len(folders)*len(codes),cfg.Workers)
    fmt.Printf("Each job: %,d random placements, up to %d geometric refinements\n",
        cfg.Attempts,cfg.Refine)
    done:=0
    var firstErr error
    for result:=range results {
        if result.Err!=nil {
            if firstErr==nil {firstErr=fmt.Errorf("%s/%s: %w",result.Background,result.Key,result.Err)}
            continue
        }
        gathered[result.Background][result.Key]=result.Matches
        stats[result.Background][result.Key]=result.Stats
        done++
        state:="computed"
        if result.Cached {state="resumed"}
        fmt.Printf("[%3d/%3d] %-20s %-5s %s %d candidates, %d refined / %d feasible, %s\n",
            done,len(folders)*len(codes),result.Background,result.Key,state,
            len(result.Matches),result.Stats.Refined,result.Stats.Feasible,
            result.Duration.Round(time.Millisecond))
    }
    if firstErr!=nil {return firstErr}
    if done!=len(folders)*len(codes) {
        return fmt.Errorf("incomplete search: %d/%d",done,len(folders)*len(codes))
    }

    report:=Report{
        Schema:"mellon-quality-constellation-matches-v9",
        Version:version,
        Note:"High-brightness quality shortlist from ORIGINAL detected source-image points. Rigid geometry, center and artwork margins are hard constraints. Human QA required; this is not astronomical magnitude data.",
        Settings:map[string]any{
            "attempts":cfg.Attempts,"refine":cfg.Refine,
            "coarse_neighbors":cfg.CoarseK,"assignment_neighbors":cfg.AssignmentK,
            "per_background":cfg.PerBackground,"per_template":cfg.PerTemplate,
            "seed":cfg.Seed,"brightness_assignment_px":cfg.BrightnessAssignmentPX,
            "brightness_proposal_bonus":cfg.BrightnessProposalBonus,
            "brightness_rank_weight":cfg.BrightnessRankWeight,
            "frame_margin":cfg.FrameMargin,"figure_room_x":cfg.FigureRoomX,
            "figure_room_y":cfg.FigureRoomY,"center_tolerance_x":cfg.CenterToleranceX,
            "center_tolerance_y":cfg.CenterToleranceY,"min_span":cfg.MinSpan,
            "min_scale":cfg.MinScale,"max_scale":cfg.MaxScale,"min_scale_ratio":cfg.MinScaleRatio,
            "rotation_limit_deg":cfg.RotationLimitDeg,
            "threshold_px":cfg.ThresholdPX,"max_vertex_error_px":cfg.MaxVertexErrorPX,
            "template_file":cfg.Templates,"template_sha256":templateHash,
            "enhance_scale":cfg.EnhanceScale,"enhance_gain":cfg.EnhanceGain,
            "line_opacity":cfg.LineOpacity,
        },
        Images:make(map[string]ImageReport),
    }
    previewIndex:=make(map[string][]map[string]any,len(folders))
    total:=0
    for _,slug:=range folders {
        c:=catalogues[slug]
        chosen:=selectBest(gathered[slug],cfg.PerBackground)
        record:=ImageReport{
            ImageSize:[2]int{c.W,c.H},SourceStars:len(c.Stars),
            Matches:make(map[string][]Match),Stats:stats[slug],
        }
        for i,m:=range chosen {
            key:=m.Constellation
            record.Matches[key]=[]Match{m}
            record.SelectionOrder=append(record.SelectionOrder,key)
            if err:=validateMatch(c,key,templates[key],m,cfg);err!=nil {return err}
            preview:=filepath.Join("qa",slug,fmt.Sprintf("%02d-%s.png",i+1,key))
            if err:=renderPreview(c,m,cfg,filepath.Join(cfg.Output,preview));err!=nil {
                return fmt.Errorf("render QA %s/%s: %w",slug,key,err)
            }
            previewIndex[slug]=append(previewIndex[slug],map[string]any{
                "rank":i+1,"constellation":key,"name":m.ConstellationName,
                "qa_image":filepath.ToSlash(preview),
                "brightness_mean":m.Brightness.ScoreMean,
                "brightness_p25":m.Brightness.ScoreP25,
                "brightness_min":m.Brightness.ScoreMin,
                "rms_px":m.RMSErrorPX,"span":m.Coverage.MaxSpanFraction,
                "star_ids":m.StarIDs,
            })
            total++
        }
        report.Images[slug]=record
        fmt.Printf("SHORTLIST %-20s %d scenes, best quality score %.5f\n",slug,len(chosen),
            func()float64{if len(chosen)>0{return chosen[0].RankScore};return 0}())
    }
    if total==0 {return errors.New("no verified matches; hard geometry must NOT be relaxed silently")}
    if err:=atomicJSON(filepath.Join(cfg.Output,"matches-v9.json"),report);err!=nil{return err}
    if err:=atomicJSON(filepath.Join(cfg.Output,"qa-index.json"),previewIndex);err!=nil{return err}
    fmt.Printf("PASS: %d brightness-prioritized scenes; all original star IDs and margins verified\n",total)
    fmt.Printf("DATABASE: %s\n",filepath.Join(cfg.Output,"matches-v9.json"))
    fmt.Printf("QA PREVIEWS: %s\n",filepath.Join(cfg.Output,"qa"))
    fmt.Println("Input stars/photos and the live GNOME lockscreen were NOT modified.")
    return nil
}

func main() {
    cfg,err:=parseConfig()
    if err==nil {err=run(cfg)}
    if err!=nil {fmt.Fprintln(os.Stderr,"ERROR:",err);os.Exit(1)}
}
