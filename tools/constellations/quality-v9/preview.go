package main

import (
    "fmt"
    "image"
    "image/color"
    "image/jpeg"
    "image/png"
    "math"
    "os"
    "path/filepath"
)

func rgbaSource(path string) (*image.RGBA,error) {
    file,err:=os.Open(path)
    if err!=nil { return nil,err }
    defer file.Close()
    decoded,err:=jpeg.Decode(file)
    if err!=nil { return nil,err }
    b:=decoded.Bounds()
    out:=image.NewRGBA(image.Rect(0,0,b.Dx(),b.Dy()))
    for y:=0;y<b.Dy();y++ {
        for x:=0;x<b.Dx();x++ {
            r,g,bl,_:=decoded.At(x+b.Min.X,y+b.Min.Y).RGBA()
            out.SetRGBA(x,y,color.RGBA{uint8(r>>8),uint8(g>>8),uint8(bl>>8),255})
        }
    }
    return out,nil
}

func copyRGBA(src *image.RGBA) *image.RGBA {
    c:=image.NewRGBA(src.Bounds())
    copy(c.Pix,src.Pix)
    return c
}

func pixelRGB(im *image.RGBA,x,y int) [3]float64 {
    b:=im.Bounds()
    x=int(clamp(float64(x),0,float64(b.Dx()-1)))
    y=int(clamp(float64(y),0,float64(b.Dy()-1)))
    p:=im.RGBAAt(x,y)
    return [3]float64{float64(p.R),float64(p.G),float64(p.B)}
}
func bilinearRGB(im *image.RGBA,x,y float64) [3]float64 {
    x=clamp(x,0,float64(im.Bounds().Dx()-1))
    y=clamp(y,0,float64(im.Bounds().Dy()-1))
    ix,iy:=int(math.Floor(x)),int(math.Floor(y))
    fx,fy:=x-float64(ix),y-float64(iy)
    a,b,c,d:=pixelRGB(im,ix,iy),pixelRGB(im,ix+1,iy),pixelRGB(im,ix,iy+1),pixelRGB(im,ix+1,iy+1)
    var rgb [3]float64
    for z:=0;z<3;z++ {
        rgb[z]=(1-fy)*((1-fx)*a[z]+fx*b[z])+fy*((1-fx)*c[z]+fx*d[z])
    }
    return rgb
}

// A robust annulus estimate isolates the star's ORIGINAL local emission.
// Nebula/background colors stay in the base and are never recolored.
func localBase(im *image.RGBA,center Point) [3]float64 {
    samples:=[16][3]float64{}
    for i:=0;i<16;i++ {
        theta:=float64(i)*2*math.Pi/16
        radius:=7.5+float64(i%3)
        samples[i]=bilinearRGB(im,center[0]+radius*math.Cos(theta),
                                  center[1]+radius*math.Sin(theta))
    }
    var base [3]float64
    for channel:=0;channel<3;channel++ {
        v:=make([]float64,16)
        for i:=range samples { v[i]=samples[i][channel] }
        // Insertion sort for 16 elements: no dependency / no heap growth.
        for i:=1;i<len(v);i++ {
            item,j:=v[i],i
            for j>0 && v[j-1]>item { v[j]=v[j-1];j-- }
            v[j]=item
        }
        base[channel]=.5*(v[7]+v[8])
    }
    return base
}

// Magnify a SMALL REGION OF THE ACTUAL DETECTED STAR in the original photo.
// Pixel channels are based on ORIGINAL sampled star residuals (not an
// overlaid dot or a fabricated fill). Apply a shared gain to RGB residuals
// to keep a blue point blue and a red point red.
func enhanceOriginalStar(dst,src *image.RGBA,star Star,scale,gain float64) {
    center:=star.P
    base:=localBase(src,center)
    // The original detector's source star radius, remapped to output pixels,
    // controls a conservative upper bound on the retouched area.
    originalRadius:=clamp(star.Radius,1.0,2.7)
    outer:=clamp(originalRadius*scale*2.1,3.0,8.5)
    inner:=originalRadius*scale*.75
    left,right:=int(math.Floor(center[0]-outer)),int(math.Ceil(center[0]+outer))
    top,bottom:=int(math.Floor(center[1]-outer)),int(math.Ceil(center[1]+outer))
    for y:=top;y<=bottom;y++ {
        if y<0 || y>=dst.Bounds().Dy() { continue }
        for x:=left;x<=right;x++ {
            if x<0 || x>=dst.Bounds().Dx() { continue }
            dx,dy:=float64(x)-center[0],float64(y)-center[1]
            radius:=math.Hypot(dx,dy)
            if radius>=outer { continue }
            original:=pixelRGB(src,x,y)
            sample:=bilinearRGB(src,center[0]+dx/scale,center[1]+dy/scale)
            var residual [3]float64
            peak:=0.
            for channel:=0;channel<3;channel++ {
                residual[channel]=math.Max(0,sample[channel]-base[channel])
                peak=math.Max(peak,residual[channel])
            }
            // No artificial star is drawn where the original photograph
            // contains no luminous point-like excess.
            if peak<1.5 { continue }
            maxBase:=math.Max(base[0],math.Max(base[1],base[2]))
            safeGain:=math.Min(gain,.98*(255-maxBase)/peak)
            safeGain=math.Max(1,safeGain)
            fade:=1.
            if radius>inner {
                t:=clamp((outer-radius)/(outer-inner),0,1)
                fade=t*t*(3-2*t)
            }
            var updated color.RGBA
            values:=[3]uint8{}
            for channel:=0;channel<3;channel++ {
                magnified:=base[channel]+residual[channel]*safeGain
                // Only brighten, never paint a darker disk over the source.
                candidate:=math.Max(original[channel],magnified)
                old:=dst.RGBAAt(x,y)
                current:=[3]uint8{old.R,old.G,old.B}
                value:=math.Max(float64(current[channel]),
                    original[channel]+.9*fade*(candidate-original[channel]))
                values[channel]=uint8(math.Round(clamp(value,0,255)))
            }
            updated=color.RGBA{values[0],values[1],values[2],255}
            dst.SetRGBA(x,y,updated)
        }
    }
}

// Subtle, 1-pixel antialiased cyan connector. NO node markers are drawn.
// Endpoint stars are magnified from their real source pixels afterwards.
func blendConnector(im *image.RGBA,x,y int,coverage,opacity float64) {
    if x<0 || y<0 || x>=im.Bounds().Dx() || y>=im.Bounds().Dy() { return }
    alpha:=clamp(coverage*opacity,0,1)
    if alpha<=0 { return }
    p:=im.RGBAAt(x,y)
    target:=[3]float64{137,216,243}
    channels:=[3]float64{float64(p.R),float64(p.G),float64(p.B)}
    for i:=0;i<3;i++ { channels[i]=channels[i]*(1-alpha)+target[i]*alpha }
    im.SetRGBA(x,y,color.RGBA{
        uint8(math.Round(channels[0])),
        uint8(math.Round(channels[1])),
        uint8(math.Round(channels[2])),255,
    })
}

func wuLine(im *image.RGBA,a,b Point,opacity float64) {
    x0,y0,x1,y1:=a[0],a[1],b[0],b[1]
    steep:=math.Abs(y1-y0)>math.Abs(x1-x0)
    if steep { x0,y0=y0,x0;x1,y1=y1,x1 }
    if x0>x1 { x0,x1=x1,x0;y0,y1=y1,y0 }
    dx,dy:=x1-x0,y1-y0
    if dx<1e-9 { return }
    gradient:=dy/dx
    plot:=func(x,y int,alpha float64) {
        if steep { blendConnector(im,y,x,alpha,opacity) } else { blendConnector(im,x,y,alpha,opacity) }
    }
    for x:=int(math.Ceil(x0));x<=int(math.Floor(x1));x++ {
        yf:=y0+(float64(x)-x0)*gradient
        y:=int(math.Floor(yf))
        fraction:=yf-float64(y)
        plot(x,y,1-fraction)
        plot(x,y+1,fraction)
    }
}

func renderPreview(c *Catalog,m Match,cfg Config,path string) error {
    src,err:=rgbaSource(c.Image)
    if err!=nil { return err }
    if src.Bounds().Dx()!=c.W || src.Bounds().Dy()!=c.H {
        return fmt.Errorf("preview image dimensions differ from original catalog: %s",c.Slug)
    }
    img:=copyRGBA(src)
    // Lines go under the enhanced source star pixels, not over them.
    for _,edge:=range m.Edges {
        a,b:=m.StarIDs[edge[0]],m.StarIDs[edge[1]]
        ia,oka:=c.ByID[a];ib,okb:=c.ByID[b]
        if !oka || !okb { return fmt.Errorf("unknown star on QA edge") }
        wuLine(img,c.Stars[ia].P,c.Stars[ib].P,cfg.LineOpacity)
    }
    for _,id:=range m.StarIDs {
        index,ok:=c.ByID[id]
        if !ok { return fmt.Errorf("unknown star in QA preview: %s",id) }
        enhanceOriginalStar(img,src,c.Stars[index],cfg.EnhanceScale,cfg.EnhanceGain)
    }
    if err:=os.MkdirAll(filepath.Dir(path),0o755);err!=nil{return err}
    out,err:=os.Create(path)
    if err!=nil{return err}
    defer out.Close()
    return png.Encode(out,img) // Lossless: tiny source-star colors survive.
}
