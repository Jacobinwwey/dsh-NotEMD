import { createWritePlan, type VaultDocument, type WritePlan } from '@notemd-harness/vault'

export function replaceDocumentPlan(document: VaultDocument, content: string): WritePlan {
  return createWritePlan([
    {
      path: document.path,
      content,
      expectedRevision: document.revision,
    },
  ])
}

export function createDocumentPlan(path: string, content: string): WritePlan {
  return createWritePlan([
    {
      path,
      content,
      expectedRevision: 'absent',
    },
  ])
}

export function translationTargetPath(sourcePath: string, language: string): string {
  const normalizedLanguage = language.trim()
  if (!/^[a-z]{2,3}(?:-[A-Z]{2})?$/u.test(normalizedLanguage)) {
    throw new RangeError(`Translation language must be a BCP 47 language tag: ${language}`)
  }
  return `translations/${normalizedLanguage}/${sourcePath}`
}
