package main

import (
    "math"
    "math/rand"
    "sort"
)

// The spatial grid is immutable, shared between all Go workers, and uses
// actual photo-detector coordinates. No synthetic sources are inserted.
type Grid struct {
    im *ImageInput
    cols,rows int
    cells [][]int
}
type neighbor struct {idx int; cost float64}
func makeGrid(im *ImageInput) *Grid {
    c:=int(math.Ceil(float64(im.Width)/gridCellSize))
    r:=int(math.Ceil(float64(im.Height)/gridCellSize))
    g:=&Grid{im:im,cols:c,rows:r,cells:make([][]int,c*r)}
    for i,s:=range im.Stars {
        x,y:=int(s.X/gridCellSize),int(s.Y/gridCellSize)
        if x>=0&&x<c&&y>=0&&y<r {g.cells[y*c+x]=append(g.cells[y*c+x],i)}
    }
    return g
}
func (g *Grid) neighbors(p Point, radius float64, maxN int) ([8]neighbor,int) {
    var best [8]neighbor
    if maxN>8 {maxN=8}
    count:=0
    xmin:=max(0,int(math.Floor((p.X-radius)/gridCellSize)))
    xmax:=min(g.cols-1,int(math.Floor((p.X+radius)/gridCellSize)))
    ymin:=max(0,int(math.Floor((p.Y-radius)/gridCellSize)))
    ymax:=min(g.rows-1,int(math.Floor((p.Y+radius)/gridCellSize)))
    r2:=radius*radius
    for y:=ymin;y<=ymax;y++ {
        for x:=xmin;x<=xmax;x++ {
            for _,idx:=range g.cells[y*g.cols+x] {
                s:=g.im.Stars[idx]
                dx,dy:=p.X-s.X,p.Y-s.Y
                distance:=dx*dx+dy*dy
                if distance>r2 {continue}
                cost:=distance+brightnessBiasPx*brightnessBiasPx*(1.0-s.Score)
                if count==maxN&&cost>=best[count-1].cost{continue}
                pos:=count
                if pos==maxN {pos=maxN-1} else {count++}
                for pos>0&&cost<best[pos-1].cost{
                    best[pos]=best[pos-1]
                    pos--
                }
                best[pos]=neighbor{idx,cost}
            }
        }
    }
    return best,count
}

// The Hungarian solver provides minimum-cost unique assignment over the
// actual nearby source stars. It does not use greedy reuse of one star.
func assign(g *Grid, targets []Point) ([]int,bool) {
    n:=len(targets)
    neighbors:=make([][8]neighbor,n)
    counts:=make([]int,n)
    availableMap:=map[int]bool{}
    for i,p:=range targets {
        opts,count:=g.neighbors(p,maxQueryRadius,8)
        if count==0{return nil,false}
        neighbors[i],counts[i]=opts,count
        for k:=0;k<count;k++{availableMap[opts[k].idx]=true}
    }
    if len(availableMap)<n{return nil,false}
    available:=make([]int,0,len(availableMap))
    for idx:=range availableMap {available=append(available,idx)}
    sort.Ints(available)
    lookup:=make(map[int]int,len(available))
    for j,id:=range available{lookup[id]=j}
    m:=len(available)
    const inf=1e10
    cost:=make([]float64,n*m)
    for i:=range cost{cost[i]=inf}
    for i:=0;i<n;i++ {
        for k:=0;k<counts[i];k++ {
            o:=neighbors[i][k]
            cost[i*m+lookup[o.idx]]=o.cost
        }
    }
    assignment,ok:=hungarian(cost,n,m)
    if !ok {return nil,false}
    for i,j:=range assignment{assignment[i]=available[j]}
    return assignment,true
}
func hungarian(cost []float64,n,m int)([]int,bool){
    if n<1||m<n||len(cost)!=n*m{return nil,false}
    const inf=1e10
    u,v:=make([]float64,n+1),make([]float64,m+1)
    p,way:=make([]int,m+1),make([]int,m+1)
    for i:=1;i<=n;i++ {
        p[0]=i
        minv:=make([]float64,m+1)
        used:=make([]bool,m+1)
        for j:=range minv{minv[j]=inf}
        j0:=0
        for {
            used[j0]=true
            i0:=p[j0]
            delta:=inf
            j1:=0
            for j:=1;j<=m;j++ {
                if used[j]{continue}
                cur:=cost[(i0-1)*m+j-1]-u[i0]-v[j]
                if cur<minv[j]{minv[j]=cur;way[j]=j0}
                if minv[j]<delta{delta=minv[j];j1=j}
            }
            if delta>=inf/4{return nil,false}
            for j:=0;j<=m;j++ {
                if used[j] {u[p[j]]+=delta;v[j]-=delta}
                else if j>0 {minv[j]-=delta}
            }
            j0=j1
            if p[j0]==0{break}
        }
        for {
            j1:=way[j0]
            p[j0]=p[j1]
            j0=j1
            if j0==0{break}
        }
    }
    result:=make([]int,n)
    for j:=1;j<=m;j++ {
        if p[j]>0 {result[p[j]-1]=j-1}
    }
    for i,j:=range result{if cost[i*m+j]>=inf/4 {return nil,false}}
    return result,true
}
type placement struct {
    center Point
    radius,angle,score float64
}
type rigid struct {
    center Point
    scale,angle,rms,worst float64
    indices []int
}
func transform(pts []Point,c Point,scale,angle float64,target []Point) {
    cs,sn:=math.Cos(angle),math.Sin(angle)
    for i,p:=range pts {
        target[i]=Point{
            X:c.X+scale*(p.X*cs-p.Y*sn),
            Y:c.Y+scale*(p.X*sn+p.Y*cs),
        }
    }
}
// Proper similarity fit: translation + rotation + uniform scale, NO reflection.
func fit(pts,actual []Point)(Point,float64,float64) {
    var mp,mq Point
    for i:=range pts{mp.X+=pts[i].X;mp.Y+=pts[i].Y;mq.X+=actual[i].X;mq.Y+=actual[i].Y}
    n:=float64(len(pts))
    mp.X/=n;mp.Y/=n;mq.X/=n;mq.Y/=n
    var dot,cross,denom float64
    for i,p:=range pts{
        a,b:=p.X-mp.X,p.Y-mp.Y
        c,d:=actual[i].X-mq.X,actual[i].Y-mq.Y
        dot+=a*c+b*d
        cross+=a*d-b*c
        denom+=a*a+b*b
    }
    if denom<1e-15{return Point{},0,0}
    scale:=math.Hypot(dot,cross)/denom
    angle:=math.Atan2(cross,dot)
    c,s:=math.Cos(angle),math.Sin(angle)
    center:=Point{X:mq.X-scale*(c*mp.X-s*mp.Y),
                  Y:mq.Y-scale*(s*mp.X+c*mp.Y)}
    return center,scale,angle
}
func refine(g *Grid,pts []Point,p placement) (rigid,bool) {
    n:=len(pts)
    predicted:=make([]Point,n)
    actual:=make([]Point,n)
    center,scale,angle:=p.center,p.radius,p.angle
    var ids []int
    for i:=0;i<4;i++ {
        transform(pts,center,scale,angle,predicted)
        next,ok:=assign(g,predicted)
        if !ok{return rigid{},false}
        ids=next
        for j,idx:=range ids {s:=g.im.Stars[idx];actual[j]=Point{s.X,s.Y}}
        center,scale,angle=fit(pts,actual)
        if scale<minScale*.88||scale>maxScale*1.12{return rigid{},false}
    }
    transform(pts,center,scale,angle,predicted)
    next,ok:=assign(g,predicted)
    if !ok {return rigid{},false}
    ids=next
    for j,idx:=range ids {s:=g.im.Stars[idx];actual[j]=Point{s.X,s.Y}}
    center,scale,angle=fit(pts,actual)
    transform(pts,center,scale,angle,predicted)
    var sum,worst float64
    for j:=range actual {
        d:=math.Hypot(actual[j].X-predicted[j].X,actual[j].Y-predicted[j].Y)
        sum+=d*d
        if d>worst{worst=d}
    }
    rms:=math.Sqrt(sum/float64(n))
    if rms>maxRMS||worst>maxVertexError{return rigid{},false}
    for _,pt:=range predicted {
        if pt.X<0||pt.X>float64(g.im.Width)||pt.Y<0||pt.Y>float64(g.im.Height){
            return rigid{},false
        }
    }
    return rigid{center,scale,angle,rms,worst,ids},true
}
func makeMatch(g *Grid,id string,t Template,r rigid) (Match,bool) {
    im:=g.im
    n:=len(r.indices)
    safeX,safeY:=float64(im.Width)*(frameMargin+figureRoom),float64(im.Height)*(frameMargin+figureRoom)
    left,top,right,bottom:=math.Inf(1),math.Inf(1),math.Inf(-1),math.Inf(-1)
    vertices:=make([][]float64,n)
    starIDs:=make([]string,n)
    values:=make([]float64,n)
    rawSum,meanSum:=0.,0.
    for i,idx:=range r.indices {
        s:=im.Stars[idx]
        left=math.Min(left,s.X);top=math.Min(top,s.Y)
        right=math.Max(right,s.X);bottom=math.Max(bottom,s.Y)
        vertices[i]=[]float64{round(s.X/float64(im.Width),1e8),round(s.Y/float64(im.Height),1e8)}
        starIDs[i]=s.ID;values[i]=s.Score
        meanSum+=s.Score;rawSum+=s.Brightness
    }
    w,h:=float64(im.Width),float64(im.Height)
    if left<safeX-1e-5||right>w-safeX+1e-5||
        top<safeY-1e-5||bottom>h-safeY+1e-5 {return Match{},false}
    dx,dy:=(left+right)/(2*w)-.5,(top+bottom)/(2*h)-.5
    if math.Abs(dx)>centerTolerance+1e-5||math.Abs(dy)>centerTolerance+1e-5 {return Match{},false}
    widthFraction,heightFraction:=(right-left)/w,(bottom-top)/h
    span:=math.Max(widthFraction,heightFraction)
    if span<minSpan{return Match{},false}
    area:=widthFraction*heightFraction
    sorted:=append([]float64(nil),values...)
    sort.Float64s(sorted)
    p20:=sorted[int(math.Floor(.2*float64(len(sorted)-1)))]
    topQuartile:=0
    for _,score:=range values{if score>=.75{topQuartile++}}
    mean:=meanSum/float64(n)
    centerPenalty:=math.Hypot(dx/centerTolerance,dy/centerTolerance)
    // Quality-first: 68% max brightness preference plus geometric quality.
    // One dim star does not invalidate the whole constellation.
    rank:=(.36*mean+.20*p20+.12*float64(topQuartile)/float64(n)+
           .24*span+.08*math.Sqrt(area)-
           .10*r.rms/maxRMS-.06*centerPenalty-
           .01*math.Abs(r.angle)/(rotationLimit*math.Pi/180))
    m:=Match{
        Constellation:id,Name:t.Name,StarIDs:starIDs,Vertices:vertices,Edges:t.Edges,
        Rank:round(rank,1e7),
        Brightness:Brightness{
            Mean:round(mean,1e6),P20:round(p20,1e6),Min:round(sorted[0],1e6),
            BrightFraction:round(float64(topQuartile)/float64(n),1e6),
            StarScores:values,RawMean:round(rawSum/float64(n),1e6),
        },
        Coverage:Coverage{
            WidthFraction:round(widthFraction,1e6),HeightFraction:round(heightFraction,1e6),
            MaxSpan:round(span,1e6),Area:round(area,1e6),
            BBox:[4]float64{round(left,1e4),round(top,1e4),round(right,1e4),round(bottom,1e4)},
        },
        CenterOffset:[2]float64{round(dx,1e6),round(dy,1e6)},
        FigureRoom:[2]float64{round(w*figureRoom,1e4),round(h*figureRoom,1e4)},
        FigureEnvelope:[4]float64{
            round(left-w*figureRoom,1e4),round(top-h*figureRoom,1e4),
            round(right+w*figureRoom,1e4),round(bottom+h*figureRoom,1e4)},
        RMS:round(r.rms,1e5),Worst:round(r.worst,1e5),
        Transform:Transform{
            Center:[2]float64{round(r.center.X,1e4),round(r.center.Y,1e4)},
            Rotation:round(r.angle*180/math.Pi,1e4),Scale:round(r.scale,1e4),
        },Status:"candidate-needs-visual-review",indices:r.indices,
    }
    return m,true
}
func pointsOf(t Template) []Point {
    points:=make([]Point,len(t.Points))
    for i,p:=range t.Points{points[i]=Point{p[0],p[1]}}
    return points
}
// Random placement obeys the exact v6 central placement and artwork bounds
// before any KD-tree query, saving work on impossible transformations.
func sample(rng *rand.Rand,pts []Point,w,h float64)(placement,bool) {
    angle:=(rng.Float64()*2-1)*rotationLimit*math.Pi/180
    c,s:=math.Cos(angle),math.Sin(angle)
    minX,minY,maxX,maxY:=math.Inf(1),math.Inf(1),math.Inf(-1),math.Inf(-1)
    for _,p:=range pts {
        x,y:=p.X*c-p.Y*s,p.X*s+p.Y*c
        minX=math.Min(minX,x);minY=math.Min(minY,y)
        maxX=math.Max(maxX,x);maxY=math.Max(maxY,y)
    }
    spanX,spanY:=maxX-minX,maxY-minY
    safeX,safeY:=w*(frameMargin+figureRoom),h*(frameMargin+figureRoom)
    availableX,availableY:=w-2*safeX,h-2*safeY
    feasible:=math.Min(maxScale,math.Min(availableX/math.Max(spanX,1e-9),
        availableY/math.Max(spanY,1e-9)))
    if feasible<=minScale {return placement{},false}
    lo:=math.Max(minScale,feasible*minScaleRatio)
    hi:=feasible*.992
    if lo>=hi{return placement{},false}
    // Bias toward large figures, but retain smaller viable placements.
    radius:=lo+(hi-lo)*math.Pow(rng.Float64(),.64)
    if math.Max(spanX*radius/w,spanY*radius/h)<minSpan*.93{return placement{},false}
    midX,midY:=(maxX+minX)/2,(maxY+minY)/2
    xLo:=math.Max(safeX-radius*minX,w*(.5-centerTolerance)-radius*midX)
    xHi:=math.Min(w-safeX-radius*maxX,w*(.5+centerTolerance)-radius*midX)
    yLo:=math.Max(safeY-radius*minY,h*(.5-centerTolerance)-radius*midY)
    yHi:=math.Min(h-safeY-radius*maxY,h*(.5+centerTolerance)-radius*midY)
    if xLo>xHi||yLo>yHi{return placement{},false}
    center:=Point{xLo+rng.Float64()*(xHi-xLo),yLo+rng.Float64()*(yHi-yLo)}
    return placement{center:center,radius:radius,angle:angle},true
}
func scorePlacement(g *Grid,pts []Point,p placement,target []Point)(float64,bool) {
    transform(pts,p.center,p.radius,p.angle,target)
    var sq,brightness float64
    dup:=0
    var indices [96]int
    for i,pos:=range target {
        neighbors,n:=g.neighbors(pos,maxQueryRadius,8)
        if n==0{return 0,false}
        best:=neighbors[0]
        st:=g.im.Stars[best.idx]
        dx,dy:=pos.X-st.X,pos.Y-st.Y
        sq+=dx*dx+dy*dy
        brightness+=st.Score
        for j:=0;j<i;j++{if indices[j]==best.idx{dup++;break}}
        if dup>3{return 0,false}
        indices[i]=best.idx
    }
    rms:=math.Sqrt(sq/float64(len(target)))
    if rms>21{return 0,false}
    return rms+9*float64(dup)-8*brightness/float64(len(target)),true
}
func pushProposal(top []placement,p placement,limit int) []placement {
    if len(top)>=limit&&p.score>=top[len(top)-1].score{return top}
    pos:=sort.Search(len(top),func(i int)bool{return top[i].score>p.score})
    top=append(top,placement{})
    copy(top[pos+1:],top[pos:])
    top[pos]=p
    if len(top)>limit{top=top[:limit]}
    return top
}
func keepCandidate(top []Match,m Match,limit int) []Match {
    for i,prev:=range top {
        if nearDuplicate(m,prev) {
            if better(m,prev){top[i]=m}
            sort.Slice(top,func(i,j int)bool{return better(top[i],top[j])})
            return top
        }
    }
    top=append(top,m)
    sort.Slice(top,func(i,j int)bool{return better(top[i],top[j])})
    if len(top)>limit{top=top[:limit]}
    return top
}
func solve(task work,cfg config)([]Match,uint64,uint64,uint64) {
    points:=pointsOf(task.template)
    rng:=rand.New(rand.NewSource(seedFor(cfg.seed,task.image.Name,task.templateID)))
    top:=make([]Match,0,cfg.perTemplate)
    target:=make([]Point,len(points))
    const batch=2048
    attempted,refined,valid:=uint64(0),uint64(0),uint64(0)
    for offset:=0;offset<cfg.attempts;offset+=batch {
        remaining:=min(batch,cfg.attempts-offset)
        shortlist:=make([]placement,0,cfg.shortlist)
        for i:=0;i<remaining;i++ {
            attempted++
            p,ok:=sample(rng,points,float64(task.image.Width),float64(task.image.Height))
            if !ok{continue}
            score,ok:=scorePlacement(task.grid,points,p,target)
            if !ok{continue}
            p.score=score
            shortlist=pushProposal(shortlist,p,cfg.shortlist)
        }
        for _,p:=range shortlist {
            refined++
            fit,ok:=refine(task.grid,points,p)
            if !ok{continue}
            match,ok:=makeMatch(task.grid,task.templateID,task.template,fit)
            if !ok{continue}
            valid++
            top=keepCandidate(top,match,cfg.perTemplate)
        }
    }
    return top,attempted,refined,valid
}
