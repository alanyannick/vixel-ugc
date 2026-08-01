const points = [
  {
    label: "Input",
    value: "Approved facts + visual references",
  },
  {
    label: "Direction",
    value: "5 hooks + 3 creator personas",
  },
  {
    label: "Media",
    value: "9:16 · 4 / 6 / 8-second video",
  },
  {
    label: "Control",
    value: "Exact approval before paid generation",
  },
] as const;

export function PositioningBand() {
  return (
    <section
      className="positioning-band"
      aria-label="Vixel UGC workflow at a glance"
    >
      <p>
        <strong>AI UGC campaign studio</strong>
        <span>for product marketers, creative teams, and ecommerce brands</span>
      </p>
      <dl>
        {points.map((point) => (
          <div key={point.label}>
            <dt>{point.label}</dt>
            <dd>{point.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
