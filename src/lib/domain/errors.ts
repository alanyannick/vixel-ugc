export class RevisionConflictError extends Error {
  readonly resource: string;
  readonly expectedRevision: number;
  readonly actualRevision: number;

  constructor(resource: string, expectedRevision: number, actualRevision: number) {
    super(
      `Stale ${resource} revision: expected ${expectedRevision}, current revision is ${actualRevision}.`,
    );
    this.name = "RevisionConflictError";
    this.resource = resource;
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}

export class InvalidTransitionError extends Error {
  readonly from: string;
  readonly to: string;

  constructor(resource: string, from: string, to: string) {
    super(`Cannot transition ${resource} from ${from} to ${to}.`);
    this.name = "InvalidTransitionError";
    this.from = from;
    this.to = to;
  }
}

export class ApprovalRequiredError extends Error {
  constructor(message = "The current exact input must be approved first.") {
    super(message);
    this.name = "ApprovalRequiredError";
  }
}

