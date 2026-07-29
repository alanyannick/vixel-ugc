import type { ReactNode } from "react";

type PageHeroProps = {
  eyebrow: string;
  title: ReactNode;
  body: string;
  aside?: ReactNode;
  tone?: "dark" | "paper";
};

export function PageHero({
  eyebrow,
  title,
  body,
  aside,
  tone = "dark",
}: PageHeroProps) {
  return (
    <section className={`page-hero page-hero--${tone}`}>
      <div className="page-hero-main">
        <span className="section-label">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{body}</p>
      </div>
      {aside ? <div className="page-hero-aside">{aside}</div> : null}
    </section>
  );
}
