"use client"

import React from "react"

export interface AunCriterionScore {
    id: string
    name: string
    score: number // 1 to 5
}

interface AunRadarChartProps {
    scores: AunCriterionScore[]
    size?: number
}

// Axis labels used to be painted at radius 5.7 with `overflow-visible`, so
// long end/start-anchored labels spilled outside the SVG box and were clipped
// by the surrounding card on narrow screens. We now pull labels closer
// (5.35), wrap long names onto a second line, and grow the viewBox by the
// exact padding each label needs — labels stay inside the SVG box at any
// width, while the chart geometry itself is unchanged (still rendered 1:1).
const LABEL_RADIUS_VALUE = 5.35
const LABEL_FONT_SIZE = 9.5
const LABEL_LINE_HEIGHT = 11.5
const LABEL_MAX_CHARS = 15
const LABEL_PAD_EXTRA = 6
// Rough average glyph width for the 9.5px sans labels (incl. diacritics).
const CHAR_WIDTH_RATIO = 0.58

function wrapLabel(text: string): string[] {
    if (text.length <= LABEL_MAX_CHARS) return [text]
    const words = text.split(" ")
    const lines: string[] = []
    let current = ""
    for (const word of words) {
        const next = current ? `${current} ${word}` : word
        if (next.length <= LABEL_MAX_CHARS) {
            current = next
        } else {
            if (current) lines.push(current)
            current = word
        }
    }
    if (current) lines.push(current)
    // Cap at 2 lines: anything beyond is merged back into the second line —
    // padding is computed from real line lengths so it still cannot clip.
    if (lines.length > 2) return [lines[0], lines.slice(1).join(" ")]
    return lines
}

export function AunRadarChart({ scores, size = 340 }: AunRadarChartProps) {
    if (!scores || scores.length === 0) return null

    const center = size / 2
    const radius = size * 0.38
    const numAxes = scores.length
    const angleSlice = (Math.PI * 2) / numAxes

    // Ring levels (scores 1 to 5)
    const levels = [1, 2, 3, 4, 5]

    // Calculate (x,y) coordinates for a given index and score (1-5)
    const getCoordinates = (index: number, val: number) => {
        const angle = index * angleSlice - Math.PI / 2
        const r = (val / 5) * radius
        return {
            x: center + r * Math.cos(angle),
            y: center + r * Math.sin(angle),
        }
    }

    // Polygon points string for score data
    const polygonPoints = scores
        .map((item, i) => {
            const { x, y } = getCoordinates(i, item.score)
            return `${x},${y}`
        })
        .join(" ")

    // Resolve label geometry first so the viewBox can be padded to contain them.
    const labels = scores.map((item, i) => {
        const { x, y } = getCoordinates(i, LABEL_RADIUS_VALUE)
        const isRight = x > center + 10
        const isLeft = x < center - 10
        const textAnchor: "start" | "end" | "middle" = isRight ? "start" : isLeft ? "end" : "middle"
        const lines = wrapLabel(`${item.name} (${item.score})`)
        const estWidth = Math.max(...lines.map((l) => l.length)) * LABEL_FONT_SIZE * CHAR_WIDTH_RATIO
        const blockHeight = lines.length * LABEL_LINE_HEIGHT
        const isTop = y < center - 10
        const isBottom = y > center + 10
        return { item, x, y, textAnchor, lines, estWidth, blockHeight, isTop, isBottom }
    })

    let padLeft = 0
    let padRight = 0
    let padTop = 0
    let padBottom = 0
    labels.forEach((l) => {
        if (l.textAnchor === "end") padLeft = Math.max(padLeft, l.estWidth - l.x)
        else if (l.textAnchor === "start") padRight = Math.max(padRight, l.x + l.estWidth - size)
        else {
            padLeft = Math.max(padLeft, l.estWidth / 2 - l.x)
            padRight = Math.max(padRight, l.x + l.estWidth / 2 - size)
        }
        // Baseline sits at y + 4. Top labels stack upward, bottom labels
        // downward, side labels are roughly centered on the anchor point.
        let top: number
        let bottom: number
        if (l.isTop) {
            bottom = l.y + 4 + LABEL_FONT_SIZE * 0.25
            top = bottom - l.blockHeight
        } else if (l.isBottom) {
            top = l.y + 4 - LABEL_FONT_SIZE * 0.8
            bottom = top + l.blockHeight
        } else {
            const mid = l.y + 4 - LABEL_FONT_SIZE * 0.3
            top = mid - l.blockHeight / 2
            bottom = mid + l.blockHeight / 2
        }
        padTop = Math.max(padTop, -top)
        padBottom = Math.max(padBottom, bottom - size)
    })
    // Symmetric horizontal padding keeps the chart centered in the wider box.
    const padX = Math.ceil(Math.max(padLeft, padRight)) + LABEL_PAD_EXTRA
    const padYTop = Math.ceil(padTop) + LABEL_PAD_EXTRA
    const padYBottom = Math.ceil(padBottom) + LABEL_PAD_EXTRA
    const svgWidth = size + padX * 2
    const svgHeight = size + padYTop + padYBottom

    return (
        <div className="relative flex flex-col items-center justify-center p-2 max-w-full">
            <svg
                width={svgWidth}
                height={svgHeight}
                viewBox={`${-padX} ${-padYTop} ${svgWidth} ${svgHeight}`}
                className="max-w-full h-auto"
            >
                <defs>
                    <linearGradient id="radarGradient" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity="0.55" />
                        <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.25" />
                    </linearGradient>
                </defs>

                {/* Grid Concentric Rings */}
                {levels.map((level) => {
                    const levelPoints = scores
                        .map((_, i) => {
                            const { x, y } = getCoordinates(i, level)
                            return `${x},${y}`
                        })
                        .join(" ")
                    return (
                        <polygon
                            key={`ring-${level}`}
                            points={levelPoints}
                            fill="none"
                            stroke="currentColor"
                            strokeOpacity={level === 5 ? "0.3" : "0.15"}
                            strokeDasharray={level < 5 ? "3 3" : undefined}
                            className="text-muted-foreground"
                        />
                    )
                })}

                {/* Axis Lines from Center to Outer Edge */}
                {scores.map((_, i) => {
                    const { x, y } = getCoordinates(i, 5)
                    return (
                        <line
                            key={`axis-${i}`}
                            x1={center}
                            y1={center}
                            x2={x}
                            y2={y}
                            stroke="currentColor"
                            strokeOpacity="0.2"
                            className="text-muted-foreground"
                        />
                    )
                })}

                {/* Data Polygon Fill */}
                <polygon
                    points={polygonPoints}
                    fill="url(#radarGradient)"
                    stroke="#10b981"
                    strokeWidth="2.5"
                    className="transition-all duration-300 ease-out"
                />

                {/* Data Point Circles */}
                {scores.map((item, i) => {
                    const { x, y } = getCoordinates(i, item.score)
                    return (
                        <circle
                            key={`point-${i}`}
                            cx={x}
                            cy={y}
                            r="4.5"
                            fill="#10b981"
                            stroke="#ffffff"
                            strokeWidth="2"
                            className="transition-all duration-200 hover:scale-125"
                        />
                    )
                })}

                {/* Axis Labels */}
                {labels.map((l, i) => (
                    <text
                        key={`label-${i}`}
                        x={l.x}
                        y={l.y + 4}
                        textAnchor={l.textAnchor}
                        fontSize={LABEL_FONT_SIZE}
                        className="font-medium fill-foreground font-sans drop-shadow-sm"
                    >
                        {l.lines.map((line, li) => (
                            <tspan
                                key={li}
                                x={l.x}
                                dy={
                                    li === 0
                                        ? l.isTop
                                            ? -(l.lines.length - 1) * LABEL_LINE_HEIGHT
                                            : l.isBottom
                                              ? 0
                                              : -((l.lines.length - 1) * LABEL_LINE_HEIGHT) / 2
                                        : LABEL_LINE_HEIGHT
                                }
                            >
                                {line}
                            </tspan>
                        ))}
                    </text>
                ))}
            </svg>
        </div>
    )
}
