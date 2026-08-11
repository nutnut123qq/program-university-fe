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

    return (
        <div className="relative flex flex-col items-center justify-center p-2">
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
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
                {scores.map((item, i) => {
                    const { x, y } = getCoordinates(i, 5.7)
                    const isRight = x > center + 10
                    const isLeft = x < center - 10
                    const textAnchor = isRight ? "start" : isLeft ? "end" : "middle"

                    return (
                        <text
                            key={`label-${i}`}
                            x={x}
                            y={y + 4}
                            textAnchor={textAnchor}
                            className="text-[10px] font-medium fill-foreground font-sans drop-shadow-sm"
                        >
                            {item.name} ({item.score})
                        </text>
                    )
                })}
            </svg>
        </div>
    )
}
