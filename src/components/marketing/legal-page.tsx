import type { ReactNode } from "react";

export type LegalSection = {
  id: string;
  title: string;
  content: ReactNode;
};

type LegalPageProps = {
  label: string;
  title: string;
  introduction: string;
  updated: string;
  updatedIso: string;
  sections: LegalSection[];
};

export function LegalPage({
  label,
  title,
  introduction,
  updated,
  updatedIso,
  sections,
}: LegalPageProps) {
  return (
    <article className="legal-page">
      <header className="legal-header">
        <span className="section-label section-label--ink">{label}</span>
        <h1>{title}</h1>
        <p>{introduction}</p>
        <time dateTime={updatedIso}>Last updated {updated}</time>
      </header>
      <div className="legal-layout">
        <nav aria-label={`${title} sections`}>
          <span>On this page</span>
          {sections.map((section, index) => (
            <a href={`#${section.id}`} key={section.id}>
              {String(index + 1).padStart(2, "0")} {section.title}
            </a>
          ))}
        </nav>
        <div className="legal-content">
          {sections.map((section) => (
            <section id={section.id} key={section.id}>
              <h2>{section.title}</h2>
              {section.content}
            </section>
          ))}
        </div>
      </div>
    </article>
  );
}
