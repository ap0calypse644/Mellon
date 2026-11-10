package main

import (
    "fmt"
    "math"
    "sort"
)

func rotated(p Point, theta float64) Point {
    c,s := math.Cos(theta), math.Sin(theta)
    return Point{p[0]*c-p[1]*s, p[0]*s+p[1]*c}
}
func fitSimilarity(reference, actual []Point) (Point, float64, float64, []Point, bool) {
    if len(reference) != len(actual) || len(reference) < 2 { return Point{},0,0,nil,false }
    var meanP,meanQ Point
    n := float64(len(reference))
    for i := range reference {
        meanP = meanP.Add(reference[i])
        meanQ = meanQ.Add(actual[i])
    }
    meanP,meanQ = meanP.Mul(1/n),meanQ.Mul(1/n)
    var dot,cross,den float64
    for i := range reference {
        a,b := reference[i].Sub(meanP),actual[i].Sub(meanQ)
        dot += a[0]*b[0] + a[1]*b[1]
        cross += a[0]*b[1] - a[1]*b[0]
        den += a[0]*a[0] + a[1]*a[1]
    }
    if den <= 1e-15 { return Point{},0,0,nil,false }
    theta := math.Atan2(cross,dot)
    scale := math.Hypot(dot,cross)/den
    if !finite(scale) || scale <= 0 { return Point{},0,0,nil,false }
    center := meanQ.Sub(rotated(meanP,theta).Mul(scale))
    target := make([]Point,len(reference))
    for i,p := range reference { target[i] = center.Add(rotated(p,theta).Mul(scale)) }
    return center,scale,theta,target,true
}

// Brightness-biased minimum-cost UNIQUE star assignment.
// Hungarian solver is rectangular (template vertices <= candidate source stars)
// and preserves true one-to-one source star identities.
func assignBright(c *Catalog, targets []Point, k int, biasPX float64) ([]int, bool) {
    n := len(targets)
    if n > len(c.Stars) { return nil,false }
    choices := make([][]neighbor,n)
    avail := make(map[int]bool,n*k)
    scratch := make([]neighbor,0,k)
    for i,p := range targets {
        list := c.Tree.NearestK(p,k,scratch)
        choices[i] = append([]neighbor(nil),list...)
        for _,x := range list { avail[x.Index] = true }
    }
    if len(avail) < n { return nil,false }
    ids := make([]int,0,len(avail))
    for id := range avail { ids = append(ids,id) }
    sort.Ints(ids)
    columns := make(map[int]int,len(ids))
    for j,id := range ids { columns[id] = j }
    m := len(ids)
    const inf = 1e12
    costs := make([][]float64,n+1)
    for i := 1;i<=n;i++ {
        row := make([]float64,m+1)
        for j:=1;j<=m;j++ { row[j] = inf }
        for _,x := range choices[i-1] {
            j := columns[x.Index]+1
            row[j] = x.D2 + biasPX*biasPX*(1-c.Stars[x.Index].Score)
        }
        costs[i] = row
    }
    // Standard O(n^2*m) min-cost rectangular Hungarian algorithm.
    u,v := make([]float64,n+1),make([]float64,m+1)
    p,way := make([]int,m+1),make([]int,m+1)
    for i:=1;i<=n;i++ {
        p[0] = i
        j0 := 0
        minv := make([]float64,m+1)
        used := make([]bool,m+1)
        for j:=1;j<=m;j++ { minv[j] = math.Inf(1) }
        for {
            used[j0] = true
            i0 := p[j0]
            delta := math.Inf(1)
            j1 := 0
            for j:=1;j<=m;j++ {
                if used[j] { continue }
                cur := costs[i0][j]-u[i0]-v[j]
                if cur < minv[j] {
                    minv[j] = cur
                    way[j] = j0
                }
                if minv[j] < delta {
                    delta = minv[j]
                    j1 = j
                }
            }
            if !finite(delta) || delta >= inf/2 { return nil,false }
            for j:=0;j<=m;j++ {
                if used[j] { u[p[j]] += delta; v[j] -= delta } else if j>0 { minv[j] -= delta }
            }
            j0 = j1
            if p[j0] == 0 { break }
        }
        for {
            j1 := way[j0]
            p[j0] = p[j1]
            j0 = j1
            if j0 == 0 { break }
        }
    }
    selected := make([]int,n)
    for j:=1;j<=m;j++ {
        if p[j] == 0 { continue }
        i := p[j]
        if costs[i][j] >= inf/2 { return nil,false }
        selected[i-1] = ids[j-1]
    }
    return selected,true
}

type refined struct {
    Indices []int
    Actual []Point
    Center Point
    Scale,Theta,RMS,Worst float64
}

func refineProposal(c *Catalog, template Template, proposal proposal, cfg Config) (refined,bool) {
    points := template.Points
    center,scale,theta := proposal.Center,proposal.Scale,proposal.Theta
    var targets []Point
    for attempt:=0;attempt<4;attempt++ {
        targets = make([]Point,len(points))
        for i,pt := range points { targets[i] = center.Add(rotated(pt,theta).Mul(scale)) }
        chosen, ok := assignBright(c,targets,cfg.AssignmentK,cfg.BrightnessAssignmentPX)
        if !ok { return refined{},false }
        actual := make([]Point,len(points))
        for i,j := range chosen { actual[i] = c.Stars[j].P }
        center,scale,theta,targets,ok = fitSimilarity(points,actual)
        if !ok || scale < cfg.MinScale*.88 || scale > cfg.MaxScale*1.12 {
            return refined{},false
        }
    }
    chosen,ok := assignBright(c,targets,cfg.AssignmentK,cfg.BrightnessAssignmentPX)
    if !ok { return refined{},false }
    actual := make([]Point,len(points))
    for i,j := range chosen { actual[i] = c.Stars[j].P }
    center,scale,theta,targets,ok = fitSimilarity(points,actual)
    if !ok { return refined{},false }
    var total,worst float64
    for i,pt := range targets {
        errorPX := math.Sqrt(pt.Dist2(actual[i]))
        total += errorPX*errorPX
        worst = math.Max(worst,errorPX)
        if pt[0] < 0 || pt[0] > float64(c.W) || pt[1] < 0 || pt[1] > float64(c.H) {
            return refined{},false
        }
    }
    rms := math.Sqrt(total/float64(len(points)))
    if rms > cfg.ThresholdPX || worst > cfg.MaxVertexErrorPX { return refined{},false }
    return refined{chosen,actual,center,scale,theta,rms,worst},true
}

func makeMatch(c *Catalog, key string, t Template, fit refined, cfg Config) (Match,bool) {
    lowX,lowY := math.Inf(1),math.Inf(1)
    highX,highY := math.Inf(-1),math.Inf(-1)
    ids := make([]string,len(fit.Indices))
    points := make([]Point,len(fit.Indices))
    brightness := make([]float64,len(fit.Indices))
    var pixelSum,promSum,mean float64
    for i,index := range fit.Indices {
        star := c.Stars[index]
        lowX,lowY = math.Min(lowX,star.P[0]),math.Min(lowY,star.P[1])
        highX,highY = math.Max(highX,star.P[0]),math.Max(highY,star.P[1])
        ids[i] = star.ID
        points[i] = Point{rounded(star.P[0]/float64(c.W),8),rounded(star.P[1]/float64(c.H),8)}
        brightness[i] = star.Score
        mean += star.Score
        pixelSum += star.Brightness
        promSum += star.Prominence
    }
    n := float64(len(ids))
    if len(ids) != len(t.Points) { return Match{},false }
    w,h := float64(c.W),float64(c.H)
    safeX := w*(cfg.FrameMargin+cfg.FigureRoomX)
    safeY := h*(cfg.FrameMargin+cfg.FigureRoomY)
    tolerance := 1e-5
    if lowX < safeX-tolerance || highX > w-safeX+tolerance ||
       lowY < safeY-tolerance || highY > h-safeY+tolerance { return Match{},false }
    dx,dy := (lowX+highX)/(2*w)-.5,(lowY+highY)/(2*h)-.5
    if math.Abs(dx)>cfg.CenterToleranceX+tolerance || math.Abs(dy)>cfg.CenterToleranceY+tolerance {
        return Match{},false
    }
    fw,fh := (highX-lowX)/w,(highY-lowY)/h
    span := math.Max(fw,fh)
    if span < cfg.MinSpan { return Match{},false }
    area := fw*fh
    scoresSorted := append([]float64(nil),brightness...)
    sort.Float64s(scoresSorted)
    mean /= n
    p25 := scoresSorted[int(math.Floor(.25*float64(len(scoresSorted)-1)))]
    minScore := scoresSorted[0]
    // Strong quality-first photometry preference: average alone is not
    // sufficient if several constellation vertices are barely visible.
    composite := .45*mean + .35*p25 + .20*minScore
    shape := .64*span+.36*math.Sqrt(area)
    geomPenalty := .05*fit.RMS/cfg.ThresholdPX
    rotation := math.Abs(math.Mod(fit.Theta*180/math.Pi+180+360,360)-180)
    orientationPenalty := .016*rotation/180
    centerPenalty := .12*math.Hypot(dx/cfg.CenterToleranceX,dy/cfg.CenterToleranceY)
    rank := shape-geomPenalty-orientationPenalty-centerPenalty+
        cfg.BrightnessRankWeight*composite
    m := Match{
        StarIDs:ids,Vertices:points,Edges:t.Edges,
        Coverage:ShapeCoverage{
            WidthFraction:rounded(fw,5),HeightFraction:rounded(fh,5),
            MaxSpanFraction:rounded(span,5),BoundingAreaFraction:rounded(area,5),
            BBoxPX:[4]float64{rounded(lowX,2),rounded(lowY,2),rounded(highX,2),rounded(highY,2)},
        },
        CenterOffsetFraction:Point{rounded(dx,5),rounded(dy,5)},
        FigureRoomPX:Point{rounded(w*cfg.FigureRoomX,2),rounded(h*cfg.FigureRoomY,2)},
        FigureEnvelopeBBoxPX:[4]float64{
            rounded(lowX-w*cfg.FigureRoomX,2),rounded(lowY-h*cfg.FigureRoomY,2),
            rounded(highX+w*cfg.FigureRoomX,2),rounded(highY+h*cfg.FigureRoomY,2),
        },
        RMSErrorPX:rounded(fit.RMS,4),MaxErrorPX:rounded(fit.Worst,4),
        Transform:Transform{
            CenterPX:Point{rounded(fit.Center[0],2),rounded(fit.Center[1],2)},
            RotationDeg:rounded(fit.Theta*180/math.Pi,2),ScalePX:rounded(fit.Scale,2),
        },
        RankScore:rounded(rank,8),
        Brightness:Photometry{
            ScoreMean:rounded(mean,6),ScoreP25:rounded(p25,6),
            ScoreMin:rounded(minScore,6),Composite:rounded(composite,6),
            PixelBrightnessMean:rounded(pixelSum/n,6),
            ProminenceMean:rounded(promSum/n,4),
            StarScores:make([]float64,len(brightness)),
        },
        Status:"candidate-needs-visual-review",Constellation:key,
        ConstellationName:t.Name,
    }
    for i,v := range brightness { m.Brightness.StarScores[i] = rounded(v,6) }
    return m,true
}

func nearDuplicate(a,b Match) bool {
    if a.Constellation != b.Constellation { return false }
    ca,cb := a.Transform,b.Transform
    dist := math.Hypot(ca.CenterPX[0]-cb.CenterPX[0],ca.CenterPX[1]-cb.CenterPX[1])
    if dist > 35 { return false }
    maxScale := math.Max(ca.ScalePX,cb.ScalePX)
    if maxScale <= 0 || math.Abs(ca.ScalePX-cb.ScalePX)/maxScale > .06 { return false }
    angle := math.Abs(math.Mod(ca.RotationDeg-cb.RotationDeg+180+360,360)-180)
    return angle < 7
}

func validateMatch(c *Catalog, key string, t Template, m Match, cfg Config) error {
    if m.Constellation != key || len(m.StarIDs) != len(t.Points) ||
        len(m.Edges) != len(t.Edges) || len(m.Vertices) != len(m.StarIDs) {
        return fmt.Errorf("invalid template fields: %s/%s",c.Slug,key)
    }
    if len(m.Brightness.StarScores)!=len(m.StarIDs) {
        return fmt.Errorf("incorrect per-star brightness count")
    }
    for i,e:=range t.Edges {
        if m.Edges[i]!=e { return fmt.Errorf("template topology changed") }
    }
    seen:=map[string]bool{}
    pts:=make([]Point,len(m.StarIDs))
    var pixelTotal,promTotal,scoreTotal float64
    for i,id := range m.StarIDs {
        idx,ok:=c.ByID[id]
        if !ok || seen[id] { return fmt.Errorf("unknown or repeated star: %s",id) }
        seen[id]=true
        s:=c.Stars[idx]
        p:=m.Vertices[i]
        if math.Abs(s.P[0]/float64(c.W)-p[0])>2e-7 ||
            math.Abs(s.P[1]/float64(c.H)-p[1])>2e-7 {
            return fmt.Errorf("altered original source coordinate: %s",id)
        }
        pts[i]=s.P
        if math.Abs(s.Score-m.Brightness.StarScores[i])>2e-6 {
            return fmt.Errorf("altered photometry: %s",id)
        }
        scoreTotal+=s.Score
        pixelTotal+=s.Brightness
        promTotal+=s.Prominence
    }
    count:=float64(len(pts))
    if math.Abs(scoreTotal/count-m.Brightness.ScoreMean)>2e-5 ||
        math.Abs(pixelTotal/count-m.Brightness.PixelBrightnessMean)>2e-5 ||
        math.Abs(promTotal/count-m.Brightness.ProminenceMean)>2e-4 {
        return fmt.Errorf("aggregate brightness measurements changed")
    }
    center,scale,theta,targets,fitOK:=fitSimilarity(t.Points,pts)
    if !fitOK { return fmt.Errorf("unable to fit real detected points") }
    var errorSquares,recomputedWorst float64
    for i,pt:=range targets {
        d:=math.Sqrt(pt.Dist2(pts[i]))
        errorSquares+=d*d
        recomputedWorst=math.Max(recomputedWorst,d)
    }
    recomputedRMS:=math.Sqrt(errorSquares/count)
    if math.Abs(recomputedRMS-m.RMSErrorPX)>2e-3 ||
        math.Abs(recomputedWorst-m.MaxErrorPX)>2e-3 {
        return fmt.Errorf("geometric fit measurements do not match source stars")
    }
    if math.Hypot(center[0]-m.Transform.CenterPX[0],
                  center[1]-m.Transform.CenterPX[1])>.02 ||
        math.Abs(scale-m.Transform.ScalePX)>.02 ||
        math.Abs(theta*180/math.Pi-m.Transform.RotationDeg)>.02 {
        return fmt.Errorf("recorded similarity transform does not match source")
    }
    fit:=refined{Actual:pts,RMS:m.RMSErrorPX,Worst:m.MaxErrorPX,
        Center:m.Transform.CenterPX,Scale:m.Transform.ScalePX,Theta:m.Transform.RotationDeg*math.Pi/180}
    // Validate hard bounds using original star points rather than rounded
    // saved bounding boxes; the producer runs these same constraints.
    if fit.RMS>cfg.ThresholdPX+1e-4 || fit.Worst>cfg.MaxVertexErrorPX+1e-4 {
        return fmt.Errorf("geometric threshold exceeded")
    }
    minX,minY,maxX,maxY:=math.Inf(1),math.Inf(1),math.Inf(-1),math.Inf(-1)
    for _,p:=range pts {
        minX=math.Min(minX,p[0]);maxX=math.Max(maxX,p[0])
        minY=math.Min(minY,p[1]);maxY=math.Max(maxY,p[1])
    }
    w,h:=float64(c.W),float64(c.H)
    sx,sy:=w*(cfg.FrameMargin+cfg.FigureRoomX),h*(cfg.FrameMargin+cfg.FigureRoomY)
    if minX<sx-1e-5 || maxX>w-sx+1e-5 || minY<sy-1e-5 || maxY>h-sy+1e-5 {
        return fmt.Errorf("star outside safe zone")
    }
    if math.Abs((minX+maxX)/(2*w)-.5)>cfg.CenterToleranceX+1e-5 ||
        math.Abs((minY+maxY)/(2*h)-.5)>cfg.CenterToleranceY+1e-5 {
        return fmt.Errorf("off-center star placement")
    }
    span:=math.Max((maxX-minX)/w,(maxY-minY)/h)
    if span<cfg.MinSpan { return fmt.Errorf("star shape too small") }
    expectedBBox:=[4]float64{minX,minY,maxX,maxY}
    for i,x:=range expectedBBox {
        if math.Abs(x-m.Coverage.BBoxPX[i])>.02 {
            return fmt.Errorf("recorded image-star bbox changed")
        }
    }
    if math.Abs(span-m.Coverage.MaxSpanFraction)>2e-5 ||
        math.Abs((minX+maxX)/(2*w)-.5-m.CenterOffsetFraction[0])>2e-5 ||
        math.Abs((minY+maxY)/(2*h)-.5-m.CenterOffsetFraction[1])>2e-5 {
        return fmt.Errorf("recorded coverage or center offset changed")
    }
    rx,ry:=cfg.FigureRoomX*w,cfg.FigureRoomY*h
    expectedEnvelope:=[4]float64{minX-rx,minY-ry,maxX+rx,maxY+ry}
    for i,x:=range expectedEnvelope {
        if math.Abs(x-m.FigureEnvelopeBBoxPX[i])>.02 {
            return fmt.Errorf("recorded illustration envelope changed")
        }
    }
    if minX-rx<cfg.FrameMargin*w-1e-5 ||
        maxX+rx>(1-cfg.FrameMargin)*w+1e-5 ||
        minY-ry<cfg.FrameMargin*h-1e-5 ||
        maxY+ry>(1-cfg.FrameMargin)*h+1e-5 {
        return fmt.Errorf("future artwork clearance violates outer frame")
    }
    return nil
}
