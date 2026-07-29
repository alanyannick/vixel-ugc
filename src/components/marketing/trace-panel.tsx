const trace = [
  { label: "Source", value: "Product page · pH-balanced formula" },
  { label: "Claim", value: "Made for a gentle daily cleanse" },
  { label: "Hook", value: "The 10-second night routine reset" },
  { label: "Approval", value: "Input hash 8fd2…c91a" },
  { label: "Candidate", value: "Portrait video · take 02" },
  { label: "Receipt", value: "Adopted by campaign owner" },
] as const;

export function TracePanel() {
  return (
    <div className="trace-panel">
      <div className="trace-panel-top">
        <div>
          <span className="status-dot" aria-hidden="true" />
          Campaign trace
        </div>
        <span>REV 04</span>
      </div>
      <div className="trace-panel-product">
        <span>Glowstate / Daily Cleanser</span>
        <strong>Source-backed route</strong>
      </div>
      <ol className="trace-list">
        {trace.map((item, index) => (
          <li key={item.label}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div>
              <small>{item.label}</small>
              <p>{item.value}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="trace-panel-foot">
        <span>Paid input changed?</span>
        <strong>Approval resets automatically.</strong>
      </div>
    </div>
  );
}
