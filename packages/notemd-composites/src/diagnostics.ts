export type CompositeDiagnosticCode =
  | 'composite-path-invalid'
  | 'composite-virtual-revision-conflict'
  | 'composite-destination-collision'
  | 'composite-binary-dependency-unsupported'
  | 'composite-budget-exceeded'
  | 'composite-no-op'
  | 'composite-document-not-found'
  | 'composite-cancelled'

export class CompositeWorkflowError extends Error {
  constructor(
    readonly code: CompositeDiagnosticCode,
    message: string,
  ) {
    super(message)
    this.name = 'CompositeWorkflowError'
  }
}
