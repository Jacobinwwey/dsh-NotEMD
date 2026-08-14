import { createWritePlan, type WritePlan } from '@notemd-harness/vault'

import { isRecord, requiredObject, ToolInputError } from './tool-contract.js'

export function writePlanFrom(args: unknown): WritePlan {
  const plan = requiredObject(args, 'plan')
  const id = stringField(plan, 'id')
  const digest = stringField(plan, 'digest')
  const writesValue = plan.writes
  if (!Array.isArray(writesValue)) {
    throw new ToolInputError('Tool parameter "plan.writes" must be an array.')
  }

  const writes = writesValue.map((write) => {
    if (!isRecord(write)) {
      throw new ToolInputError('Every plan write must be an object.')
    }
    const expectedRevision = write.expectedRevision
    if (expectedRevision !== 'absent' && typeof expectedRevision !== 'string') {
      throw new ToolInputError('Every plan write requires an expected revision or "absent".')
    }
    return {
      path: stringField(write, 'path'),
      content: stringField(write, 'content'),
      expectedRevision,
    }
  })
  const canonical = createWritePlan(writes)
  if (canonical.id !== id || canonical.digest !== digest) {
    throw new ToolInputError('Write plan id or digest does not match its writes.')
  }
  return canonical
}

function stringField(value: Record<string, unknown>, key: string): string {
  const field = value[key]
  if (typeof field !== 'string') {
    throw new ToolInputError(`Tool parameter "${key}" must be a string.`)
  }
  return field
}
