package main

import (
    "math"
    "sort"
)

type neighbor struct { Index int; D2 float64 }
type kdNode struct {
    Index, Axis int
    Left, Right *kdNode
}
type KDTree struct {
    Stars []Star
    Root *kdNode
}

func NewKDTree(stars []Star) *KDTree {
    tree := &KDTree{Stars: stars}
    indexes := make([]int, len(stars))
    for i := range indexes { indexes[i] = i }
    var build func([]int, int) *kdNode
    build = func(ids []int, depth int) *kdNode {
        if len(ids) == 0 { return nil }
        axis := depth % 2
        sort.Slice(ids, func(i, j int) bool {
            x, y := stars[ids[i]].P[axis], stars[ids[j]].P[axis]
            if x == y { return ids[i] < ids[j] }
            return x < y
        })
        mid := len(ids) / 2
        return &kdNode{
            Index: ids[mid], Axis: axis,
            Left: build(ids[:mid], depth+1),
            Right: build(ids[mid+1:], depth+1),
        }
    }
    tree.Root = build(indexes, 0)
    return tree
}

type kdSearch struct {
    tree *KDTree
    target Point
    limit int
    out []neighbor
}

func (q *kdSearch) consider(index int) {
    d2 := q.target.Dist2(q.tree.Stars[index].P)
    n := len(q.out)
    if n >= q.limit {
        last := q.out[n-1]
        if d2 > last.D2 || (d2 == last.D2 && index >= last.Index) { return }
    }
    if n < q.limit {
        q.out = append(q.out, neighbor{})
        n++
    }
    insert := n-1
    for insert > 0 {
        prev := q.out[insert-1]
        if prev.D2 < d2 || (prev.D2 == d2 && prev.Index < index) { break }
        q.out[insert] = prev
        insert--
    }
    q.out[insert] = neighbor{Index:index, D2:d2}
}

func (q *kdSearch) walk(node *kdNode) {
    if node == nil { return }
    axis := node.Axis
    diff := q.target[axis] - q.tree.Stars[node.Index].P[axis]
    near, far := node.Left, node.Right
    if diff > 0 { near, far = node.Right, node.Left }
    q.walk(near)
    q.consider(node.Index)
    if len(q.out) < q.limit || diff*diff <= q.out[len(q.out)-1].D2 {
        q.walk(far)
    }
}

// NearestK returns exact nearest detected source stars, sorted by distance.
// Caller reuses scratch memory across millions of proposals to reduce GC.
func (tree *KDTree) NearestK(p Point, k int, scratch []neighbor) []neighbor {
    if k > len(tree.Stars) { k = len(tree.Stars) }
    if k < 1 { return scratch[:0] }
    q := kdSearch{tree:tree, target:p, limit:k, out:scratch[:0]}
    q.walk(tree.Root)
    return q.out
}

func (tree *KDTree) NearestOne(p Point) neighbor {
    // Exact distance nearest lookup; deterministic tie breaker.
    best := neighbor{Index:-1, D2:math.Inf(1)}
    var visit func(*kdNode)
    visit = func(n *kdNode) {
        if n == nil { return }
        diff := p[n.Axis] - tree.Stars[n.Index].P[n.Axis]
        near, far := n.Left, n.Right
        if diff > 0 { near, far = n.Right, n.Left }
        visit(near)
        d := p.Dist2(tree.Stars[n.Index].P)
        if d < best.D2 || (d == best.D2 && n.Index < best.Index) {
            best = neighbor{Index:n.Index, D2:d}
        }
        if diff*diff <= best.D2 { visit(far) }
    }
    visit(tree.Root)
    return best
}
