export interface WorkspaceRootConfig {
  readonly workspaceRoot: string
}

export function workspaceRootFrom(config: WorkspaceRootConfig): string {
  if (typeof config.workspaceRoot !== 'string' || config.workspaceRoot.trim().length === 0) {
    throw new TypeError('Notemd bundle configuration requires a non-empty workspaceRoot.')
  }
  return config.workspaceRoot
}
