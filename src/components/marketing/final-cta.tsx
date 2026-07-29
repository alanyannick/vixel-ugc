import Link from "next/link";
import { ArrowRight } from "lucide-react";

type FinalCtaProps = {
  eyebrow?: string;
  title?: string;
  body?: string;
};

export function FinalCta({
  eyebrow = "A better first cut starts before generation.",
  title = "Build the route. Approve the input. Keep the receipt.",
  body = "Open the studio with a demo campaign ready, or start from your own product facts.",
}: FinalCtaProps) {
  return (
    <section className="final-cta">
      <span className="section-label">{eyebrow}</span>
      <h2>{title}</h2>
      <p>{body}</p>
      <div className="button-row">
        <Link className="button button--citron" href="/studio">
          Open Vixel Studio
          <ArrowRight aria-hidden="true" size={18} />
        </Link>
        <Link className="text-link text-link--light" href="/workflows/koc-video">
          Read the workflow
          <span aria-hidden="true">↗</span>
        </Link>
      </div>
    </section>
  );
}
