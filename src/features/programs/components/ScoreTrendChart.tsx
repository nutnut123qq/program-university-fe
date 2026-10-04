"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import { Badge } from "@/components/ui/badge"
import { buildTrendSeries } from "@/lib/admissionTrend"
import { AdmissionScore } from "../types"

/**
 * Hand-rolled SVG line/scatter chart of cutoff scores over years for ONE
 * program (v1.3 "trend 3-năm"). Points are joined only inside a single
 * (scale, method) series from buildTrendSeries — a program that switched
 * scale between years renders as separate lines, never one fake joined line.
 * Every series is drawn normalized to its own scale (score/scale on a shared
 * 0–100% grid) while point labels always show the RAW score, so the chart
 * never implies cross-scale comparability.
 */
const SERIES_COLORS = ["#10b981", "#0ea5e9", "#f59e0b", "#8b5cf6", "#ef4444", "#ec4899"]

const WIDTH = 360
const HEIGHT = 216
const PAD_LEFT = 36
const PAD_RIGHT = 12
const PAD_TOP = 16
const PAD_BOTTOM = 24
const PLOT_W = WIDTH - PAD_LEFT - PAD_RIGHT
const PLOT_H = HEIGHT - PAD_TOP - PAD_BOTTOM
const GRID_RATIOS = [0, 0.25, 0.5, 0.75, 1]

function formatScore(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

/** Drop a trailing "(thang N)"/"(scale N)" from the raw label — the legend
 *  shows the scale as a separate badge instead. */
function legendLabel(methodLabel: string | null, method: string): string {
    return (methodLabel || method).replace(/\s*\((?:thang|scale)[^)]*\)/gi, "").trim()
}

export function ScoreTrendChart({ scores }: { scores: AdmissionScore[] }) {
    const t = useTranslations("programs")
    const series = useMemo(() => buildTrendSeries(scores ?? []), [scores])
    const years = useMemo(
        () => [...new Set(series.flatMap((s) => s.points.map((p) => p.year)))].sort((a, b) => a - b),
        [series]
    )

    if (series.length === 0 || years.length === 0) return null

    const xFor = (year: number): number => {
        if (years.length === 1) return PAD_LEFT + PLOT_W / 2
        return PAD_LEFT + (years.indexOf(year) / (years.length - 1)) * PLOT_W
    }
    const yFor = (score: number, scale: number): number => {
        const ratio = Math.min(Math.max(score / scale, 0), 1.05)
        return PAD_TOP + (1 - ratio) * PLOT_H
    }

    return (
        <div className="max-w-full" data-testid="score-trend-chart">
            <svg
                width={WIDTH}
                height={HEIGHT}
                viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                className="max-w-full h-auto"
                role="img"
            >
                {/* Shared 0–100%-of-scale grid (percent axis, not raw scores) */}
                {GRID_RATIOS.map((r) => {
                    const y = PAD_TOP + (1 - r) * PLOT_H
                    return (
                        <g key={r}>
                            <line
                                x1={PAD_LEFT}
                                y1={y}
                                x2={WIDTH - PAD_RIGHT}
                                y2={y}
                                stroke="currentColor"
                                strokeOpacity={r === 0 ? 0.35 : 0.15}
                                strokeDasharray={r === 0 ? undefined : "3 3"}
                                className="text-muted-foreground"
                            />
                            <text
                                x={PAD_LEFT - 4}
                                y={y + 2.5}
                                textAnchor="end"
                                fontSize={7.5}
                                className="fill-muted-foreground font-mono"
                            >
                                {Math.round(r * 100)}%
                            </text>
                        </g>
                    )
                })}

                {/* X axis = admission year */}
                {years.map((year) => (
                    <text
                        key={year}
                        x={xFor(year)}
                        y={HEIGHT - 6}
                        textAnchor="middle"
                        fontSize={9}
                        className="fill-muted-foreground font-semibold"
                    >
                        {year}
                    </text>
                ))}

                {series.map((sr, si) => {
                    const color = SERIES_COLORS[si % SERIES_COLORS.length]
                    const pts = sr.points.map((p) => ({ ...p, x: xFor(p.year), y: yFor(p.score, sr.scale) }))
                    // Alternate label sides per series to reduce collisions when
                    // two series share a year slot with close ratios.
                    const labelAbove = si % 2 === 0
                    return (
                        <g key={sr.key}>
                            {pts.length >= 2 && (
                                <polyline
                                    points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                                    fill="none"
                                    stroke={color}
                                    strokeWidth={2}
                                    strokeLinejoin="round"
                                    strokeLinecap="round"
                                />
                            )}
                            {pts.map((p) => (
                                <g key={p.year}>
                                    <circle
                                        cx={p.x}
                                        cy={p.y}
                                        r={3.5}
                                        fill={color}
                                        strokeWidth={1.5}
                                        className="stroke-card"
                                    />
                                    <text
                                        x={p.x}
                                        y={labelAbove ? p.y - 7 : p.y + 15}
                                        textAnchor="middle"
                                        fontSize={8.5}
                                        className="fill-foreground font-mono font-bold"
                                    >
                                        {formatScore(p.score)}
                                    </text>
                                </g>
                            ))}
                            {/* "Chưa đủ năm" — a lone dot is honest, no fake line. */}
                            {pts.length === 1 &&
                                (() => {
                                    const p = pts[0]
                                    const noteY = labelAbove
                                        ? p.y + 16 <= HEIGHT - PAD_BOTTOM - 2
                                            ? p.y + 16
                                            : p.y - 14
                                        : p.y - 12 >= PAD_TOP - 4
                                          ? p.y - 12
                                          : p.y + 22
                                    return (
                                        <text
                                            x={p.x}
                                            y={noteY}
                                            textAnchor="middle"
                                            fontSize={7.5}
                                            className="fill-muted-foreground italic"
                                        >
                                            {t("trendOnlyYear", { year: p.year })}
                                        </text>
                                    )
                                })()}
                        </g>
                    )
                })}
            </svg>

            {/* Legend: color swatch + method label + scale badge */}
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 pt-1">
                {series.map((sr, si) => (
                    <li
                        key={sr.key}
                        className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
                    >
                        <span
                            className="h-0.5 w-4 rounded-full shrink-0"
                            style={{ backgroundColor: SERIES_COLORS[si % SERIES_COLORS.length] }}
                        />
                        <span className="font-medium">{legendLabel(sr.methodLabel, sr.method)}</span>
                        <Badge variant="outline" className="text-[9px] font-mono px-1.5 py-0">
                            {t("trendScaleBadge", { scale: formatScore(sr.scale) })}
                        </Badge>
                    </li>
                ))}
            </ul>
            <p className="text-[10px] text-muted-foreground italic px-1 pt-1">
                {t("trendScaleNote")}
            </p>
        </div>
    )
}
