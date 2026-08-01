import Link from "next/link";
import { ArrowRight } from "lucide-react";

type FinalCtaProps = {
  eyebrow?: string;
  title?: string;
  body?: string;
};

export function FinalCta({
  eyebrow = "A better UGC ad starts before generation.",
  title = "Ground the product. Choose the route. Keep the receipt.",
  body = "Apply with one product and a real campaign goal. Approved accounts can plan, save, review, and generate only when every release gate is ready.",
}: FinalCtaProps) {
  return (
    <section className="final-cta">
      <span className="section-label">{eyebrow}</span>
      <h2>{title}</h2>
      <p>{body}</p>
      <div className="button-row">
        <Link className="button button--citron" href="/waitlist">
          Apply for private beta
          <ArrowRight aria-hidden="true" size={18} />
        </Link>
        <Link className="text-link text-link--light" href="/workflows/ugc-video">
          Read the workflow
          <span aria-hidden="true">↗</span>
        </Link>
      </div>
    </section>
  );
}
