package main

import (
    "container/heap"
    "context"
    "fmt"
    "hash/fnv"
    "math"
    "math/rand"
    "sort"
)

type proposal struct {
    Center Point
    Scale, Theta, Prescore float64
    Index int
}

// The root is the WORST retained proposal, so a multi-million-attempt
// search holds only a fixed refinement budget in memory.
type proposalHeap []proposal
func (h proposalHeap) Len() int { return len(h) }
func (h proposalHeap) Less(i,j int) bool {
    if h[i].Prescore == h[j].Prescore { return h[i].Index > h[j].Index }
    return h[i].Prescore > h[j].Prescore
}
func (h proposalHeap) Swap(i,j int) { h[i],h[j] = h[j],h[i] }
func (h *proposalHeap) Push(x any) { *h = append(*h,x.(proposal)) }
func (h *proposalHeap) Pop() any {
    old:=*h
    last:=old[len(old)-1]
    *h=old[:len(old)-1]
    return last
}
func betterProposal(a,b proposal) bool {
    return a.Prescore < b.Prescore || (a.Prescore==b.Prescore && a.Index<b.Index)
}
func searchSeed(master int64,background,key string) int64 {
    h:=fnv.New64a()
    _,_ = h.Write([]byte(fmt.Sprintf("%d/%s/%s",master,background,key)))
    return int64(h.Sum64())
}

func searchTemplate(ctx context.Context,c *Catalog,key string,t Template,cfg Config) ([]Match,SearchStats,error) {
    if len(t.Points)>len(c.Stars) { return nil,SearchStats{},nil }
    rng := rand.New(rand.NewSource(searchSeed(cfg.Seed,c.Slug,key)))
    w,h := float64(c.W),float64(c.H)
    safeX,safeY := w*(cfg.FrameMargin+cfg.FigureRoomX),h*(cfg.FrameMargin+cfg.FigureRoomY)
    var stats SearchStats
    keep := &proposalHeap{}
    heap.Init(keep)
    rotBounds:=make([]Point,len(t.Points))
    centerLoX,centerHiX:=w*(.5-cfg.CenterToleranceX),w*(.5+cfg.CenterToleranceX)
    centerLoY,centerHiY:=h*(.5-cfg.CenterToleranceY),h*(.5+cfg.CenterToleranceY)
    scratch:=make([]neighbor,0,cfg.CoarseK)
    // Reuse the duplicate tracker for millions of proposals: no map
    // allocations in the throughput-critical search loop.
    seenIDs:=make([]int,0,len(t.Points))
    for iter:=0;iter<cfg.Attempts;iter++ {
        if iter % 8192==0 {
            select { case <-ctx.Done(): return nil,stats,ctx.Err(); default: }
        }
        stats.Attempted++
        theta:=(rng.Float64()*2-1)*cfg.RotationLimitDeg*math.Pi/180
        cosine,sine:=math.Cos(theta),math.Sin(theta)
        xmin,xmax,ymin,ymax:=math.Inf(1),math.Inf(-1),math.Inf(1),math.Inf(-1)
        for i,p:=range t.Points {
            x:=p[0]*cosine-p[1]*sine
            y:=p[0]*sine+p[1]*cosine
            rotBounds[i]=Point{x,y}
            xmin=math.Min(xmin,x);xmax=math.Max(xmax,x)
            ymin=math.Min(ymin,y);ymax=math.Max(ymax,y)
        }
        spanX,spanY:=xmax-xmin,ymax-ymin
        if spanX<1e-12 || spanY<1e-12 { continue }
        possible:=math.Min(cfg.MaxScale,math.Min((w-2*safeX)/spanX,(h-2*safeY)/spanY))
        if possible<=cfg.MinScale { continue }
        minScale:=math.Max(cfg.MinScale,possible*cfg.MinScaleRatio)
        maxScale:=possible*.992
        if maxScale<=minScale { continue }
        // Favor near-maximal spans while still exploring smaller fits.
        scale:=minScale+(maxScale-minScale)*math.Pow(rng.Float64(),.42)
        if math.Max(scale*spanX/w,scale*spanY/h)<cfg.MinSpan { continue }
        midX,midY:=(xmin+xmax)*.5,(ymin+ymax)*.5
        lowX:=math.Max(safeX-scale*xmin,centerLoX-scale*midX)
        highX:=math.Min(w-safeX-scale*xmax,centerHiX-scale*midX)
        lowY:=math.Max(safeY-scale*ymin,centerLoY-scale*midY)
        highY:=math.Min(h-safeY-scale*ymax,centerHiY-scale*midY)
        if highX<lowX || highY<lowY { continue }
        center:=Point{lowX+rng.Float64()*(highX-lowX),lowY+rng.Float64()*(highY-lowY)}
        stats.Feasible++
        var totalDistance,meanScore float64
        seenIDs=seenIDs[:0]
        dup:=0
        for _,p:=range rotBounds {
            target:=center.Add(p.Mul(scale))
            list:=c.Tree.NearestK(target,cfg.CoarseK,scratch)
            if len(list)==0 { return nil,stats,fmt.Errorf("KD-tree returned no source stars") }
            bestIdx:=list[0].Index
            bestCost:=list[0].D2+cfg.BrightnessAssignmentPX*cfg.BrightnessAssignmentPX*(1-c.Stars[bestIdx].Score)
            bestDistance:=list[0].D2
            for _,candidate:=range list[1:] {
                cost:=candidate.D2+cfg.BrightnessAssignmentPX*cfg.BrightnessAssignmentPX*(1-c.Stars[candidate.Index].Score)
                if cost<bestCost || (cost==bestCost && candidate.Index<bestIdx) {
                    bestIdx,bestCost,bestDistance=candidate.Index,cost,candidate.D2
                }
            }
            repeated:=false
            for _,existing:=range seenIDs { if existing==bestIdx { repeated=true; break } }
            if repeated { dup++ }
            seenIDs=append(seenIDs,bestIdx)
            meanScore+=c.Stars[bestIdx].Score
            totalDistance+=bestDistance
        }
        rms:=math.Sqrt(totalDistance/float64(len(t.Points)))
        bright:=meanScore/float64(len(t.Points))
        displacement:=math.Hypot(((center[0]+scale*midX)/w-.5)/cfg.CenterToleranceX,
                                 ((center[1]+scale*midY)/h-.5)/cfg.CenterToleranceY)
        span:=math.Max(scale*spanX/w,scale*spanY/h)
        prescore:=rms+float64(dup)*8-span*3+displacement*.8-
            cfg.BrightnessProposalBonus*bright
        p:=proposal{Center:center,Scale:scale,Theta:theta,Prescore:prescore,Index:iter}
        if keep.Len()<cfg.Refine {
            heap.Push(keep,p)
        } else if betterProposal(p,(*keep)[0]) {
            (*keep)[0]=p
            heap.Fix(keep,0)
        }
    }
    shortlisted:=append([]proposal(nil),(*keep)...)
    sort.Slice(shortlisted,func(i,j int)bool{return betterProposal(shortlisted[i],shortlisted[j])})
    stats.Shortlisted=len(shortlisted)
    matches:=make([]Match,0,len(shortlisted))
    for _,p:=range shortlisted {
        if stats.Refined%64==0 {
            select { case <-ctx.Done():return nil,stats,ctx.Err();default: }
        }
        stats.Refined++
        fit,ok:=refineProposal(c,t,p,cfg)
        if !ok { continue }
        m,ok:=makeMatch(c,key,t,fit,cfg)
        if !ok { continue }
        stats.Accepted++
        matches=append(matches,m)
    }
    sort.SliceStable(matches,func(i,j int)bool{
        if matches[i].RankScore==matches[j].RankScore {
            if matches[i].RMSErrorPX==matches[j].RMSErrorPX {
                return fmt.Sprint(matches[i].StarIDs)<fmt.Sprint(matches[j].StarIDs)
            }
            return matches[i].RMSErrorPX<matches[j].RMSErrorPX
        }
        return matches[i].RankScore>matches[j].RankScore
    })
    unique:=make([]Match,0,cfg.PerTemplate)
    signatures:=make(map[string]bool,cfg.PerTemplate)
    for _,m:=range matches {
        signature:=fmt.Sprint(m.StarIDs)
        if signatures[signature] { continue }
        duplicated:=false
        for _,previous:=range unique {
            if nearDuplicate(m,previous) { duplicated=true;break }
        }
        if duplicated { continue }
        signatures[signature]=true
        unique=append(unique,m)
        if len(unique)>=cfg.PerTemplate { break }
    }
    stats.UniqueKept=len(unique)
    return unique,stats,nil
}
