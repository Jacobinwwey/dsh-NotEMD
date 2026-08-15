import {
  createWorkspaceMutationPlan,
  type MutationProvenanceDraft,
  type WorkspaceMutationDraft,
  type WorkspaceMutationPlan,
} from '@notemd-harness/mutation'

import { isRecord, requiredObject, ToolInputError } from './tool-contract.js'

export function mutationPlanFrom(args: unknown): WorkspaceMutationPlan {
  const plan = requiredObject(args, 'plan')
  if (plan.version !== 1) {
    throw new ToolInputError('Tool parameter "plan.version" must be 1.')
  }
  const id = stringField(plan, 'id')
  const digest = stringField(plan, 'digest')
  const mutationsValue = plan.mutations
  if (!Array.isArray(mutationsValue)) {
    throw new ToolInputError('Tool parameter "plan.mutations" must be an array.')
  }

  let canonical: WorkspaceMutationPlan
  try {
    canonical = createWorkspaceMutationPlan({
      provenance: provenanceFrom(objectField(plan, 'provenance'), 'plan.provenance'),
      mutations: mutationsValue.map((mutation, index) => mutationFrom(objectValue(mutation, `plan.mutations[${index}]`), index)),
    })
  } catch (error) {
    throw new ToolInputError(`Tool parameter "plan" is not a canonical workspace mutation plan: ${diagnostic(error)}`)
  }
  if (canonical.id !== id || canonical.digest !== digest) {
    throw new ToolInputError('Workspace mutation plan id or digest does not match its content.')
  }
  return canonical
}

function mutationFrom(value: Record<string, unknown>, index: number): WorkspaceMutationDraft {
  const kind = stringField(value, 'kind')
  const base = {
    destination: stringField(value, 'destination'),
    expectedRevision: expectedRevisionField(value, 'expectedRevision'),
    provenance: provenanceFrom(objectField(value, 'provenance'), `plan.mutations[${index}].provenance`),
    conflictPolicy: conflictPolicyField(value),
  }
  switch (kind) {
    case 'write-text':
      return {
        ...base,
        kind,
        mediaType: stringField(value, 'mediaType'),
        content: stringField(value, 'content'),
        contentSha256: stringField(value, 'contentSha256'),
      }
    case 'write-bytes':
      return {
        ...base,
        kind,
        mediaType: stringField(value, 'mediaType'),
        contentSha256: stringField(value, 'contentSha256'),
        stagedAsset: stagedAssetFrom(objectField(value, 'stagedAsset')),
      }
    case 'delete':
      return {
        ...base,
        kind,
        expectedContentSha256: stringField(value, 'expectedContentSha256'),
      }
    default:
      throw new ToolInputError(`Tool parameter "plan.mutations[${index}].kind" is unsupported.`)
  }
}

function provenanceFrom(value: Record<string, unknown>, field: string): MutationProvenanceDraft {
  return {
    operationId: stringField(value, 'operationId'),
    sourceRefs: stringListField(value, 'sourceRefs', field),
    evidenceRefs: stringListField(value, 'evidenceRefs', field),
  }
}

function stagedAssetFrom(value: Record<string, unknown>) {
  return {
    id: stringField(value, 'id'),
    byteLength: integerField(value, 'byteLength'),
    mediaType: stringField(value, 'mediaType'),
    sha256: stringField(value, 'sha256'),
  }
}

function expectedRevisionField(value: Record<string, unknown>, key: string): string | 'absent' {
  const field = value[key]
  if (field === 'absent' || typeof field === 'string') {
    return field
  }
  throw new ToolInputError(`Tool parameter "${key}" must be a revision or "absent".`)
}

function conflictPolicyField(value: Record<string, unknown>): 'reject' {
  if (value.conflictPolicy !== 'reject') {
    throw new ToolInputError('Tool parameter "conflictPolicy" must be "reject".')
  }
  return 'reject'
}

function objectField(value: Record<string, unknown>, key: string): Record<string, unknown> {
  return objectValue(value[key], key)
}

function objectValue(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new ToolInputError(`Tool parameter "${field}" must be an object.`)
  }
  return value
}

function stringField(value: Record<string, unknown>, key: string): string {
  const field = value[key]
  if (typeof field !== 'string') {
    throw new ToolInputError(`Tool parameter "${key}" must be a string.`)
  }
  return field
}

function integerField(value: Record<string, unknown>, key: string): number {
  const field = value[key]
  if (!Number.isSafeInteger(field) || typeof field !== 'number') {
    throw new ToolInputError(`Tool parameter "${key}" must be an integer.`)
  }
  return field
}

function stringListField(value: Record<string, unknown>, key: string, field: string): readonly string[] {
  const list = value[key]
  if (!Array.isArray(list) || list.some((item) => typeof item !== 'string')) {
    throw new ToolInputError(`Tool parameter "${field}.${key}" must be an array of strings.`)
  }
  return list
}

function diagnostic(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
