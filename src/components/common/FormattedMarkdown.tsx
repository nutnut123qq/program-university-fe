"use client";

import React from "react";

interface FormattedMarkdownProps {
    content: string;
    className?: string;
}

/**
 * Custom lightweight React Markdown parser component.
 * Converts raw Markdown string (bold, italic, headings, lists, checklists, tables, code) into styled React elements.
 */
export const FormattedMarkdown: React.FC<FormattedMarkdownProps> = ({ content, className = "" }) => {
    if (!content) return null;

    const renderFormattedText = (text: string): React.ReactNode[] => {
        // Split by code backticks first to avoid parsing markdown inside inline code
        const parts = text.split(/(`[^`]+`)/g);

        return parts.map((part, index) => {
            if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
                return (
                    <code
                        key={index}
                        className="px-1.5 py-0.5 rounded bg-muted/80 font-mono text-[11px] text-indigo-400 dark:text-indigo-300 border border-border/40"
                    >
                        {part.slice(1, -1)}
                    </code>
                );
            }

            // Parse **bold**, *italic*, and [link](url) inside normal text
            return parseInlineMarkdown(part, index);
        });
    };

    const parseInlineMarkdown = (text: string, keyPrefix: number | string): React.ReactNode => {
        // Simple regex parser for **bold** and *italic*
        const tokenRegex = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
        const tokens = text.split(tokenRegex);

        return (
            <React.Fragment key={keyPrefix}>
                {tokens.map((token, i) => {
                    if (token.startsWith("**") && token.endsWith("**") && token.length > 4) {
                        return (
                            <strong key={i} className="font-semibold text-foreground">
                                {token.slice(2, -2)}
                            </strong>
                        );
                    }
                    if (token.startsWith("*") && token.endsWith("*") && token.length > 2) {
                        return (
                            <em key={i} className="italic text-foreground/90">
                                {token.slice(1, -1)}
                            </em>
                        );
                    }
                    if (token.startsWith("[") && token.includes("](") && token.endsWith(")")) {
                        const match = token.match(/\[([^\]]+)\]\(([^)]+)\)/);
                        if (match) {
                            return (
                                <a
                                    key={i}
                                    href={match[2]}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-blue-500 hover:underline font-medium"
                                >
                                    {match[1]}
                                </a>
                            );
                        }
                    }
                    return token;
                })}
            </React.Fragment>
        );
    };

    // Process blocks (lines / paragraphs / tables / code blocks)
    const lines = content.split("\n");
    const blocks: React.ReactNode[] = [];

    let inTable = false;
    let tableRows: string[][] = [];
    let inList = false;
    let listItems: React.ReactNode[] = [];
    let listType: "ul" | "ol" = "ul";
    let inCodeBlock = false;
    let codeBuffer: string[] = [];

    const flushList = (key: string | number) => {
        if (listItems.length > 0) {
            if (listType === "ol") {
                blocks.push(
                    <ol key={key} className="list-decimal pl-5 space-y-1 my-1.5 text-foreground/90">
                        {listItems}
                    </ol>
                );
            } else {
                blocks.push(
                    <ul key={key} className="list-disc pl-5 space-y-1 my-1.5 text-foreground/90">
                        {listItems}
                    </ul>
                );
            }
            listItems = [];
            inList = false;
        }
    };

    const flushTable = (key: string | number) => {
        if (tableRows.length > 0) {
            const header = tableRows[0];
            const body = tableRows.slice(1).filter((row) => !row.every((cell) => cell.trim().match(/^:?-+:?$/)));

            blocks.push(
                <div key={key} className="my-2.5 overflow-x-auto rounded-lg border border-border/60">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="bg-muted/80 border-b border-border/60">
                                {header.map((col, cIdx) => (
                                    <th key={cIdx} className="p-2 font-semibold text-foreground">
                                        {renderFormattedText(col.trim())}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40 bg-card/40">
                            {body.map((row, rIdx) => (
                                <tr key={rIdx} className="hover:bg-muted/40 transition-colors">
                                    {row.map((cell, cIdx) => (
                                        <td key={cIdx} className="p-2 align-top">
                                            {renderFormattedText(cell.trim())}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
            tableRows = [];
            inTable = false;
        }
    };

    lines.forEach((line, index) => {
        const trimmed = line.trim();

        // 1. Code Block (```)
        if (trimmed.startsWith("```")) {
            if (inCodeBlock) {
                // End code block
                blocks.push(
                    <pre
                        key={`code-${index}`}
                        className="my-2 p-3 rounded-xl bg-slate-900 text-slate-100 font-mono text-[11px] overflow-x-auto border border-slate-800"
                    >
                        <code>{codeBuffer.join("\n")}</code>
                    </pre>
                );
                codeBuffer = [];
                inCodeBlock = false;
            } else {
                flushList(`list-before-code-${index}`);
                flushTable(`table-before-code-${index}`);
                inCodeBlock = true;
            }
            return;
        }

        if (inCodeBlock) {
            codeBuffer.push(line);
            return;
        }

        // 2. Table (| Col | Col |)
        if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
            flushList(`list-before-table-${index}`);
            if (!inTable) inTable = true;
            const cells = trimmed.split("|").slice(1, -1);
            tableRows.push(cells);
            return;
        } else if (inTable) {
            flushTable(`table-${index}`);
        }

        // 3. Horizontal Rule (--- or ***)
        if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
            flushList(`list-before-hr-${index}`);
            blocks.push(<hr key={`hr-${index}`} className="my-2.5 border-t border-border/50" />);
            return;
        }

        // 4. Headings (# ## ###)
        if (trimmed.startsWith("#")) {
            flushList(`list-before-h-${index}`);
            if (trimmed.startsWith("### ")) {
                blocks.push(
                    <h3 key={`h3-${index}`} className="font-bold text-sm text-foreground mt-2 mb-1">
                        {renderFormattedText(trimmed.slice(4))}
                    </h3>
                );
                return;
            }
            if (trimmed.startsWith("## ")) {
                blocks.push(
                    <h2 key={`h2-${index}`} className="font-bold text-base text-foreground mt-2.5 mb-1 pb-0.5 border-b border-border/40">
                        {renderFormattedText(trimmed.slice(3))}
                    </h2>
                );
                return;
            }
            if (trimmed.startsWith("# ")) {
                blocks.push(
                    <h1 key={`h1-${index}`} className="font-extrabold text-lg text-foreground mt-3 mb-1.5">
                        {renderFormattedText(trimmed.slice(2))}
                    </h1>
                );
                return;
            }
        }

        // 5. Checklist items (- [ ] or - [x])
        if (trimmed.match(/^[-*]\s*\[([ xX])\]\s+/)) {
            if (!inList) {
                inList = true;
                listType = "ul";
            }
            const isChecked = trimmed.match(/^[-*]\s*\[([xX])\]\s+/);
            const textContent = trimmed.replace(/^[-*]\s*\[([ xX])\]\s+/, "");

            listItems.push(
                <li key={`check-${index}`} className="flex items-start gap-2 list-none -ml-4 my-0.5">
                    <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] mt-0.5 shrink-0 ${isChecked ? "bg-emerald-500 text-white border-emerald-600" : "border-border bg-background"}`}>
                        {isChecked ? "✓" : ""}
                    </span>
                    <span className={isChecked ? "line-through text-muted-foreground" : ""}>
                        {renderFormattedText(textContent)}
                    </span>
                </li>
            );
            return;
        }

        // 6. Bullet lists (* or -)
        if (trimmed.match(/^[-*]\s+/)) {
            if (!inList || listType !== "ul") {
                flushList(`list-switch-${index}`);
                inList = true;
                listType = "ul";
            }
            const textContent = trimmed.replace(/^[-*]\s+/, "");
            listItems.push(<li key={`li-${index}`}>{renderFormattedText(textContent)}</li>);
            return;
        }

        // 7. Numbered lists (1. 2.)
        if (trimmed.match(/^\d+\.\s+/)) {
            if (!inList || listType !== "ol") {
                flushList(`list-switch-ol-${index}`);
                inList = true;
                listType = "ol";
            }
            const textContent = trimmed.replace(/^\d+\.\s+/, "");
            listItems.push(<li key={`oli-${index}`}>{renderFormattedText(textContent)}</li>);
            return;
        }

        // End list if empty line or normal paragraph
        if (inList) {
            flushList(`list-end-${index}`);
        }

        // 8. Blockquote (> quote)
        if (trimmed.startsWith("> ")) {
            blocks.push(
                <blockquote
                    key={`quote-${index}`}
                    className="my-2 pl-3 py-1 border-l-2 border-indigo-500 bg-muted/30 text-muted-foreground italic rounded-r-md text-[11px]"
                >
                    {renderFormattedText(trimmed.slice(2))}
                </blockquote>
            );
            return;
        }

        // 9. Standard Paragraphs
        if (trimmed.length > 0) {
            blocks.push(
                <p key={`p-${index}`} className="my-1 leading-relaxed">
                    {renderFormattedText(trimmed)}
                </p>
            );
        }
    });

    // Final flushes
    flushList("list-final");
    flushTable("table-final");

    return <div className={`space-y-1 ${className}`}>{blocks}</div>;
};
