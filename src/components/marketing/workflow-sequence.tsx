const stages = [
  {
    number: "01",
    name: "Brief",
    status: "Required",
    title: "Ground the idea.",
    description:
      "Add visible product facts, audience, platform, goal, and reference roles. Unsupported claims are marked before they become copy.",
    output: "5 hooks · 3 personas · 1 review gate",
  },
  {
    number: "02",
    name: "Assets",
    status: "Conditional",
    title: "Anchor the creator.",
    description:
      "When the project lacks a trustworthy product-in-context or creator reference, generate candidates and accept one before production.",
    output: "Creator anchor · Product anchor",
  },
  {
    number: "03",
    name: "Production",
    status: "Required",
    title: "Make the actual media.",
    description:
      "Write the first three seconds, dialogue, product action, shot direction, and audio path. Short ideas stay one continuous clip when suitable.",
    output: "Provider job · Immutable candidates",
  },
  {
    number: "04",
    name: "Post",
    status: "Conditional",
    title: "Finish with intent.",
    description:
      "Trim, combine, subtitle, add a CTA, or mix music only when the approved route calls for it.",
    output: "Final candidate · Adoption receipt",
  },
] as const;

export function WorkflowSequence() {
  return (
    <div className="workflow-sequence">
      <div className="workflow-line" aria-hidden="true">
        <span />
      </div>
      {stages.map((stage) => (
        <article className="workflow-stage" key={stage.number}>
          <div className="workflow-stage-index">
            <span>{stage.number}</span>
            <strong>{stage.name}</strong>
            <em>{stage.status}</em>
          </div>
          <div className="workflow-stage-copy">
            <h3>{stage.title}</h3>
            <p>{stage.description}</p>
          </div>
          <p className="workflow-stage-output">{stage.output}</p>
        </article>
      ))}
    </div>
  );
}
