package main

import (
    "crypto/sha256"
    "encoding/hex"
    "fmt"
    "math"
    "os"
    "path/filepath"
    "sort"
    "strings"
)

func splitCSV(s string) []string {
    items := strings.Split(s, ",")
    output := make([]string, 0, len(items))
    for _, item := range items {
        item = strings.TrimSpace(item)
        if item != "" { output = append(output, item) }
    }
    return output
}

func loadTemplates(path string) (map[string]Template, string, error) {
    var file TemplateFile
    data, err := readJSON(path, &file)
    if err != nil { return nil, "", err }
    if len(file.Templates) == 0 { return nil, "", fmt.Errorf("empty template library") }
    for name, t := range file.Templates {
        if len(t.Points) < 3 { return nil, "", fmt.Errorf("invalid template %s: fewer than 3 stars", name) }
        for _, p := range t.Points {
            if !finite(p[0]) || !finite(p[1]) { return nil, "", fmt.Errorf("non-finite template coordinate: %s", name) }
        }
        if len(t.Edges) == 0 { return nil, "", fmt.Errorf("template has no edges: %s", name) }
        for _, e := range t.Edges {
            if e[0] < 0 || e[1] < 0 || e[0] >= len(t.Points) || e[1] >= len(t.Points) || e[0] == e[1] {
                return nil, "", fmt.Errorf("invalid edge in template %s", name)
            }
        }
    }
    // For v9, the bow-inclusive Orion is mandatory. Don't accidentally
    // regenerate the old nine-star Orion under a new database schema.
    ori, ok := file.Templates["Ori"]
    if !ok || len(ori.Points) != 18 || len(ori.Edges) != 18 {
        return nil, "", fmt.Errorf("expected 18-star Orion with bow; use templates-v4-orion-bow.json")
    }
    return file.Templates, hashBytes(data), nil
}

func catalogFolders(root string) ([]string, error) {
    entries, err := os.ReadDir(root)
    if err != nil { return nil, err }
    var folders []string
    for _, e := range entries {
        if !e.IsDir() || e.Type() & os.ModeSymlink != 0 { continue }
        name := e.Name()
        folder := filepath.Join(root, name)
        if _, err := os.Stat(filepath.Join(folder, "stars-all.json")); err != nil { continue }
        if _, err := os.Stat(filepath.Join(folder, "metadata.json")); err != nil { continue }
        folders = append(folders, name)
    }
    sort.Strings(folders)
    if len(folders) == 0 { return nil, fmt.Errorf("no star catalogs found in %s", root) }
    return folders, nil
}

func loadCatalog(root, slug string) (*Catalog, error) {
    folder := filepath.Join(root, slug)
    var meta sourceMetadata
    metaBytes, err := readJSON(filepath.Join(folder, "metadata.json"), &meta)
    if err != nil { return nil, err }
    var input sourceCatalog
    rawBytes, err := readJSON(filepath.Join(folder, "stars-all.json"), &input)
    if err != nil { return nil, err }
    t := meta.Transform
    width, height := t.OutputSize[0], t.OutputSize[1]
    l, top, right, bottom := t.CropBoxRotated[0],t.CropBoxRotated[1],t.CropBoxRotated[2],t.CropBoxRotated[3]
    if width <= 0 || height <= 0 || right <= l || bottom <= top {
        return nil, fmt.Errorf("invalid metadata image transform: %s", slug)
    }
    if t.ClockwiseDegrees != 0 && t.ClockwiseDegrees != 90 && t.ClockwiseDegrees != 180 && t.ClockwiseDegrees != 270 {
        return nil, fmt.Errorf("unsupported image rotation: %d", t.ClockwiseDegrees)
    }
    c := &Catalog{
        Slug: slug, W: width, H: height,
        ByID: make(map[string]int, len(input.Stars)),
        Image: filepath.Join(folder, "background-dim-16x9.jpg"),
    }
    // Preserve the exact v3/v6/v8 source-image mapping and 1-pixel inset.
    for _, raw := range input.Stars {
        if raw.ID == "" || !finite(raw.PX) || !finite(raw.PY) ||
            !finite(raw.Brightness) || !finite(raw.Prominence) ||
            raw.Brightness < 0 || raw.Prominence < 0 {
            return nil, fmt.Errorf("invalid detection in %s: %q", slug, raw.ID)
        }
        x, y := raw.PX, raw.PY
        switch t.ClockwiseDegrees {
        case 90:
            x, y = float64(meta.SourceHeight-1)-y, x
        case 180:
            x, y = float64(meta.SourceWidth-1)-x, float64(meta.SourceHeight-1)-y
        case 270:
            x, y = y, float64(meta.SourceWidth-1)-x
        }
        px := (x-l)*float64(width)/(right-l)
        py := (y-top)*float64(height)/(bottom-top)
        if px < 1 || px >= float64(width-1) || py < 1 || py >= float64(height-1) { continue }
        if _, exists := c.ByID[raw.ID]; exists {
            return nil, fmt.Errorf("duplicate image star ID: %s/%s", slug, raw.ID)
        }
        c.ByID[raw.ID] = len(c.Stars)
        radius := raw.RadiusPX * math.Sqrt(float64(width)/(right-l)*float64(height)/(bottom-top))
        c.Stars = append(c.Stars, Star{
            ID: raw.ID, P: Point{rounded(px, 4), rounded(py, 4)},
            Brightness: raw.Brightness, Prominence: raw.Prominence, Radius: radius,
        })
    }
    if len(c.Stars) < 20 { return nil, fmt.Errorf("too few image detections for %s", slug) }
    // Equal raw brightness measurements share the same relative rank. V8's
    // original 75/25 brightness/prominence preference is retained.
    brightness := make([]float64, len(c.Stars))
    prominence := make([]float64, len(c.Stars))
    for i,s := range c.Stars { brightness[i] = s.Brightness; prominence[i] = s.Prominence }
    sort.Float64s(brightness)
    sort.Float64s(prominence)
    for i := range c.Stars {
        s := &c.Stars[i]
        b := sort.Search(len(brightness), func(j int) bool { return brightness[j] > s.Brightness })
        p := sort.Search(len(prominence), func(j int) bool { return prominence[j] > s.Prominence })
        s.Score = .75*float64(b)/float64(len(brightness)) +
            .25*float64(p)/float64(len(prominence))
    }
    c.Tree = NewKDTree(c.Stars)
    // Invalidate resume checkpoint if original measurements/transform change.
    h := sha256.New()
    h.Write(metaBytes)
    h.Write(rawBytes)
    c.Fingerprint = hex.EncodeToString(h.Sum(nil))
    if info, err := os.Stat(c.Image); err != nil || info.IsDir() {
        return nil, fmt.Errorf("missing original dimmed QA background for %s", slug)
    }
    return c, nil
}
