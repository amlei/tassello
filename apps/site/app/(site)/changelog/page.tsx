import type { Metadata } from "next";
import fs from "node:fs/promises";
import path from "node:path";
import React from "react";

type ChangelogSection = { title: string; items: string[] };
type ChangelogEntry = { anchor: string; date: string; dateText: string; title: string; sections: ChangelogSection[] };

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, "-").replace(/^-+|-+$/g, "");
}

async function readChangelog(): Promise<{ intro: string; entries: ChangelogEntry[] }> {
  const file = path.join(process.cwd(), "..", "web", "content", "changelog.md");
  const source = await fs.readFile(file, "utf8");
  const lines = source.split(/\r?\n/);
  const introLines: string[] = [];
  const entries: ChangelogEntry[] = [];
  let entry: ChangelogEntry | null = null;
  let section: ChangelogSection | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("# ")) continue;
    if (line.startsWith("## ")) {
      const heading = line.slice(3).trim();
      const [dateText, ...titleParts] = heading.split(/\s*·\s*/);
      entry = {
        anchor: slugify(heading),
        dateText,
        date: dateText,
        title: titleParts.join(" · ") || "更新",
        sections: [],
      };
      entries.push(entry);
      section = null;
      continue;
    }
    if (!entry) {
      introLines.push(line.replace(/^>\s?/, ""));
      continue;
    }
    if (line.startsWith("### ")) {
      section = { title: line.slice(4).trim(), items: [] };
      entry.sections.push(section);
      continue;
    }
    if (line.startsWith("- ") && section) section.items.push(line.slice(2).trim());
  }

  return { intro: introLines.join(" "), entries };
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "更新日志",
    description: "九漾 Onda 桌面工作台的产品更新、功能发布、体验改进和问题修复记录。",
  };
}

export default async function ChangelogPage() {
  const { intro, entries } = await readChangelog();

  return (
    <article className="section changelog-page" aria-labelledby="changelog-title">
      <div className="shell changelog-shell">
        <header className="changelog-header">
          <p className="section-kicker">Changelog</p>
          <h1 id="changelog-title">更新日志</h1>
          {intro ? <p className="section-copy">{intro}</p> : null}
          <p className="changelog-feed-note">订阅产品变化，可收藏本页或关注 GitHub Releases。</p>
        </header>

        {entries.map((entry) => (
          <article key={entry.anchor} className="changelog-entry" aria-labelledby={`entry-${entry.anchor}`}>
            <div className="changelog-entry-head">
              <time className="changelog-date" dateTime={entry.date}>{entry.dateText}</time>
              <h2 id={`entry-${entry.anchor}`}>{entry.title}</h2>
            </div>
            {entry.sections.map((section) => (
              <section key={section.title} className="changelog-section">
                <h3>{section.title}</h3>
                <ul>
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            ))}
          </article>
        ))}
      </div>
    </article>
  );
}
