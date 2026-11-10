package main

import (
    "crypto/sha256"
    "encoding/hex"
    "encoding/json"
    "fmt"
    "math"
    "os"
    "path/filepath"
    "sort"
)

const version = "mellon-quality-v9-1"

type Point [2]float64

func (p Point) Add(q Point) Point { return Point{p[0] + q[0], p[1] + q[1]} }
func (p Point) Sub(q Point) Point { return Point{p[0] - q[0], p[1] - q[1]} }
func (p Point) Mul(s float64) Point { return Point{p[0] * s, p[1] * s} }
func (p Point) Dist2(q Point) float64 {
    dx, dy := p[0]-q[0], p[1]-q[1]
    return dx*dx + dy*dy
}

type Template struct {
    Name string `json:"name"`
    Points []Point `json:"points"`
    Edges [][2]int `json:"edges"`
}
type TemplateFile struct {
    Schema string `json:"schema"`
    Templates map[string]Template `json:"templates"`
}

type SourceStar struct {
    ID string `json:"id"`
    PX float64 `json:"px"`
    PY float64 `json:"py"`
    Brightness float64 `json:"brightness"`
    Prominence float64 `json:"prominence"`
    RadiusPX float64 `json:"radius_px"`
    RGB [3]float64 `json:"rgb"`
}
type sourceCatalog struct { Stars []SourceStar `json:"stars"` }

type sourceMetadata struct {
    DimmedBackgroundSHA256 string `json:"dimmed_background_sha256"`
    SourceWidth int `json:"source_width"`
    SourceHeight int `json:"source_height"`
    Transform struct {
        ClockwiseDegrees int `json:"clockwise_degrees"`
        CropBoxRotated [4]float64 `json:"crop_box_rotated"`
        OutputSize [2]int `json:"output_size"`
    } `json:"transform"`
}

type Star struct {
    ID string
    P Point
    Brightness float64
    Prominence float64
    Score float64
    Radius float64
}

type Catalog struct {
    Slug string
    W, H int
    Stars []Star
    ByID map[string]int
    Tree *KDTree
    Fingerprint string
    Image string
    ImageHash string
}

type Config struct {
    Corpus string
    Templates string
    Output string
    Backgrounds string
    Only string
    Attempts int
    Refine int
    CoarseK int
    AssignmentK int
    Workers int
    PerBackground int
    PerTemplate int
    Seed int64
    BrightnessAssignmentPX float64
    BrightnessProposalBonus float64
    BrightnessRankWeight float64
    FrameMargin float64
    FigureRoomX float64
    FigureRoomY float64
    CenterToleranceX float64
    CenterToleranceY float64
    MinSpan float64
    MinScale float64
    MaxScale float64
    MinScaleRatio float64
    RotationLimitDeg float64
    ThresholdPX float64
    MaxVertexErrorPX float64
    Force bool
    VerifyOnly bool
    EnhanceScale float64
    EnhanceGain float64
    LineOpacity float64
}

type ShapeCoverage struct {
    WidthFraction float64 `json:"width_fraction"`
    HeightFraction float64 `json:"height_fraction"`
    MaxSpanFraction float64 `json:"max_span_fraction"`
    BoundingAreaFraction float64 `json:"bounding_area_fraction"`
    BBoxPX [4]float64 `json:"bbox_px"`
}
type Transform struct {
    CenterPX Point `json:"center_px"`
    RotationDeg float64 `json:"rotation_deg"`
    ScalePX float64 `json:"scale_px"`
}
type Photometry struct {
    ScoreMean float64 `json:"score_mean"`
    ScoreP25 float64 `json:"score_p25"`
    ScoreMin float64 `json:"score_min"`
    Composite float64 `json:"composite"`
    StarScores []float64 `json:"star_scores"`
    PixelBrightnessMean float64 `json:"pixel_brightness_mean"`
    ProminenceMean float64 `json:"prominence_mean"`
}
type Match struct {
    StarIDs []string `json:"star_ids"`
    Vertices []Point `json:"vertices"`
    Edges [][2]int `json:"edges"`
    Coverage ShapeCoverage `json:"coverage"`
    CenterOffsetFraction Point `json:"center_offset_fraction"`
    FigureRoomPX Point `json:"figure_room_px"`
    FigureEnvelopeBBoxPX [4]float64 `json:"figure_envelope_bbox_px"`
    RMSErrorPX float64 `json:"rms_error_px"`
    MaxErrorPX float64 `json:"max_error_px"`
    Transform Transform `json:"transform"`
    RankScore float64 `json:"rank_score"`
    Brightness Photometry `json:"brightness"`
    Status string `json:"status"`
    Constellation string `json:"constellation"`
    ConstellationName string `json:"constellation_name"`
}
type SearchStats struct {
    Attempted int `json:"attempted"`
    Feasible int `json:"feasible"`
    Refined int `json:"refined"`
    Accepted int `json:"accepted"`
    Shortlisted int `json:"shortlisted"`
    UniqueKept int `json:"unique_kept"`
}
type CachedResult struct {
    Schema string `json:"schema"`
    Signature string `json:"signature"`
    Background string `json:"background"`
    Constellation string `json:"constellation"`
    Candidates []Match `json:"candidates"`
    Stats SearchStats `json:"stats"`
}
type ImageReport struct {
    ImageSize [2]int `json:"image_size"`
    SourceStars int `json:"source_stars"`
    SourceFingerprint string `json:"source_fingerprint"`
    BackgroundSHA256 string `json:"background_sha256"`
    Matches map[string][]Match `json:"matches"`
    SelectionOrder []string `json:"selection_order"`
    Stats map[string]SearchStats `json:"stats"`
}
type Report struct {
    Schema string `json:"schema"`
    Version string `json:"version"`
    Note string `json:"note"`
    Settings map[string]any `json:"settings"`
    Images map[string]ImageReport `json:"images"`
}

func rounded(x float64, digits int) float64 {
    scale := math.Pow10(digits)
    return math.Round(x*scale) / scale
}
func finite(x float64) bool { return !math.IsNaN(x) && !math.IsInf(x, 0) }
func clamp(x, low, high float64) float64 {
    return math.Max(low, math.Min(high, x))
}
func hashBytes(data []byte) string {
    sum := sha256.Sum256(data)
    return hex.EncodeToString(sum[:])
}
func readJSON(path string, into any) ([]byte, error) {
    data, err := os.ReadFile(path)
    if err != nil { return nil, err }
    if err := json.Unmarshal(data, into); err != nil {
        return nil, fmt.Errorf("parse %s: %w", path, err)
    }
    return data, nil
}
func atomicJSON(path string, value any) error {
    if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil { return err }
    data, err := json.MarshalIndent(value, "", "  ")
    if err != nil { return err }
    data = append(data, '\n')
    file, err := os.CreateTemp(filepath.Dir(path), ".mellon-tmp-*")
    if err != nil { return err }
    name := file.Name()
    defer os.Remove(name)
    if _, err := file.Write(data); err != nil { file.Close(); return err }
    if err := file.Sync(); err != nil { file.Close(); return err }
    if err := file.Close(); err != nil { return err }
    return os.Rename(name, path)
}
func sortedKeys[V any](items map[string]V) []string {
    keys := make([]string, 0, len(items))
    for k := range items { keys = append(keys, k) }
    sort.Strings(keys)
    return keys
}
func parseSelection(input string, available []string) ([]string, error) {
    if input == "" || input == "all" { return available, nil }
    ok := make(map[string]bool, len(available))
    for _, s := range available { ok[s] = true }
    chosen := map[string]bool{}
    for _, item := range splitCSV(input) {
        if !ok[item] { return nil, fmt.Errorf("unknown selection %q", item) }
        chosen[item] = true
    }
    if len(chosen) == 0 { return nil, fmt.Errorf("empty selection") }
    return sortedKeys(chosen), nil
}
