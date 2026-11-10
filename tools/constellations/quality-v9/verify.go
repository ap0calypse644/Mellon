package main

import (
    "fmt"
    "image/png"
    "os"
    "path/filepath"
)

func verifySaved(cfg Config) error {
    file:=filepath.Join(cfg.Output,"matches-v9.json")
    var report Report
    if _,err:=readJSON(file,&report);err!=nil{return err}
    if report.Schema!="mellon-quality-constellation-matches-v9" ||
        report.Version!=version {
        return fmt.Errorf("unexpected v9 database schema/version")
    }
    templates,templateHash,err:=loadTemplates(cfg.Templates)
    if err!=nil{return err}
    if report.Settings["template_sha256"]!=templateHash {
        return fmt.Errorf("template bytes changed since database generation")
    }
    // Honor the original settings from the saved database, NOT the local
    // CLI defaults, when independently checking each hard constraint.
    fields:=map[string]*float64{
        "threshold_px":&cfg.ThresholdPX,
        "max_vertex_error_px":&cfg.MaxVertexErrorPX,
        "frame_margin":&cfg.FrameMargin,
        "figure_room_x":&cfg.FigureRoomX,
        "figure_room_y":&cfg.FigureRoomY,
        "center_tolerance_x":&cfg.CenterToleranceX,
        "center_tolerance_y":&cfg.CenterToleranceY,
        "min_span":&cfg.MinSpan,
    }
    for name,ptr:=range fields {
        value,ok:=report.Settings[name].(float64)
        if !ok || !finite(value) {return fmt.Errorf("invalid stored hard constraint %s",name)}
        *ptr=value
    }
    count:=0
    for _,slug:=range sortedKeys(report.Images) {
        record:=report.Images[slug]
        c,err:=loadCatalog(cfg.Corpus,slug)
        if err!=nil{return err}
        if record.SourceFingerprint!=c.Fingerprint || record.BackgroundSHA256!=c.ImageHash {
            return fmt.Errorf("original source data/image changed: %s",slug)
        }
        if record.ImageSize != [2]int{c.W,c.H} ||
            record.SourceStars != len(c.Stars) {
            return fmt.Errorf("catalog dimensions/source count changed: %s",slug)
        }
        if len(record.SelectionOrder)!=len(record.Matches) {
            return fmt.Errorf("selection order does not match the saved images: %s",slug)
        }
        seen:=make(map[string]bool)
        for i,key:=range record.SelectionOrder {
            if seen[key] {return fmt.Errorf("duplicate constellation in %s: %s",slug,key)}
            seen[key]=true
            t,ok:=templates[key]
            if !ok {return fmt.Errorf("unknown original template %s",key)}
            matches:=record.Matches[key]
            if len(matches)!=1 {
                return fmt.Errorf("expected one distinct candidate per constellation %s/%s",slug,key)
            }
            m:=matches[0]
            if err:=validateMatch(c,key,t,m,cfg);err!=nil {
                return fmt.Errorf("invalid source-aligned candidate %s/%s: %w",slug,key,err)
            }
            // A broken/incomplete image render must never be mistaken for
            // a fully verified visual shortlist.
            preview:=filepath.Join(cfg.Output,"qa",slug,fmt.Sprintf("%02d-%s.png",i+1,key))
            f,err:=os.Open(preview)
            if err!=nil{return fmt.Errorf("missing lossless QA file %s: %w",preview,err)}
            imageInfo,err:=png.DecodeConfig(f)
            f.Close()
            if err!=nil {return fmt.Errorf("invalid QA PNG %s: %w",preview,err)}
            if imageInfo.Width!=c.W || imageInfo.Height!=c.H {
                return fmt.Errorf("QA is not aligned to original pixels: %s",preview)
            }
            count++
        }
        fmt.Printf("PASS %-20s %d source-verified selected scenes and original-color PNG previews\n",
            slug,len(record.SelectionOrder))
    }
    if count==0 {return fmt.Errorf("no selected scenes in v9 database")}
    fmt.Printf("PASS %d curated matches: source image hashes, source star IDs, photometry, rigid fit, geometry, artwork clearance and QA dimensions\n",count)
    return nil
}
