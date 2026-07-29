const routes = [
  {
    number: "01",
    name: "The friction",
    line: "Start with the tiny problem your audience already recognizes.",
    format: "POV",
  },
  {
    number: "02",
    name: "The proof",
    line: "Show the product action before making the promise.",
    format: "Demo",
  },
  {
    number: "03",
    name: "The switch",
    line: "Contrast the old ritual with the new one—without a fake claim.",
    format: "Routine",
  },
  {
    number: "04",
    name: "The objection",
    line: "Let a skeptical creator answer the reason people hesitate.",
    format: "Talk-to-camera",
  },
  {
    number: "05",
    name: "The discovery",
    line: "Frame the product as a credible find, not a scripted endorsement.",
    format: "Unbox",
  },
] as const;

export function RouteProof() {
  return (
    <div className="route-proof">
      <div className="route-proof-intro">
        <p className="route-proof-count">5</p>
        <div>
          <span>creative routes</span>
          <p>
            Different openings, creator energies, and product actions—not five
            rewrites of the same ad.
          </p>
        </div>
      </div>

      <div className="route-list" role="list" aria-label="Example creative routes">
        {routes.map((route) => (
          <div className="route-row" role="listitem" key={route.number}>
            <span className="route-number">{route.number}</span>
            <strong>{route.name}</strong>
            <p>{route.line}</p>
            <span className="route-format">{route.format}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
