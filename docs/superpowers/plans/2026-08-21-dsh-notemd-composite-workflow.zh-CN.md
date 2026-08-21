# Cordis Composite Workflow å®žæ–½è®¡åˆ’

> æœ¬ä»“åº“è¦æ±‚ inline executionï¼Œä¸æ´¾å‘ subagentã€‚æ¯ä¸ªä»»åŠ¡ä½¿ç”¨ checkboxï¼Œå¹¶åœ¨ä»»åŠ¡æœ«å°¾è®¾ç½®å¯ç‹¬ç«‹éªŒè¯çš„ gateã€‚

**ç›®æ ‡ï¼š** ä¸ºç‹¬ç«‹è¿è¡Œçš„ dsh-NotEMD bundle å®žçŽ° source-faithfulã€approval-safe çš„ one-click-extract@1 composite workflowï¼›ä¸è¿å…¥ Obsidian å®¿ä¸»è¡Œä¸ºï¼Œä¹Ÿä¸åˆ›å»ºç¬¬äºŒä¸ª mutation æˆ– job authorityã€‚

**æž¶æž„ï¼š** æ–°å¢žçº¯ @notemd-harness/composites åŒ…ï¼Œåœ¨ virtual workspace overlay ä¸Šè§„åˆ’ï¼ŒæŠŠå‡€å˜æ›´èšåˆä¸ºä¸€ä¸ªæ—¢æœ‰ WorkspaceMutationPlanï¼Œå¹¶å›ºå®š fail-fast definitionã€‚å¢žåŠ è–„ Cordis serviceã€å…·å plan/job Tool å’Œæ˜¾å¼ durable executor entryï¼ŒåŒæ—¶ä¿ç•™çŽ°æœ‰ vaultã€approval ledgerã€journaled executorã€FileJobStore ä¸Ž DSH æ‰€æœ‰çš„ ctx.llm/ctx.web seamã€‚

**æŠ€æœ¯æ ˆï¼š** TypeScript ESMã€pnpm workspaceã€DeepSeek Harness Cordis Serviceã€Vitestã€çŽ°æœ‰ WorkspaceMutationPlan v1ã€FileJobStoreã€ç¡®å®šæ€§ migration fixture å’Œ Jacobinwwey/slidev fork lockã€‚

## Global Constraints / å…¨å±€çº¦æŸ

- source observation ä¸º ref/obsidian-NotEMD@07c629c6f99a1171a6a63eaf50ddb0dce0f5fed5ï¼›åŽ†å²è¡Œä¸º oracle ä¸º obsidian-NoteMD_new@4168a51cd19ad8c3d1e05f604b50936255461a31ã€‚
- target release ä¸º dsh-NotEMD main@3169964ï¼Œnpm åŒ…ä¸º dsh-notemd@0.1.1ã€‚
- Obsidian UIã€editorã€commandã€modalã€settings å’Œ host lifecycle ä¸åœ¨èŒƒå›´å†…ã€‚
- Provider selectionã€credentialsã€endpointã€LLM transportã€Web transport å’Œ optional native capability selection å‡ç”± DSH æ‰€æœ‰ã€‚
- ç¦æ­¢ generic notemd_run(type, options)ã€raw custom-workflow DSL executionï¼Œä»¥åŠ public continueOnError flagã€‚
- WorkspaceMutationPlan.version ä¿æŒ 1ï¼›æ—  composite lineage çš„æ—§ plan ä¿æŒåŽŸ canonical digestã€‚
- planning æ°¸ä¸å†™ç‰©ç† workspaceï¼›åªæœ‰çŽ°æœ‰ approval receipt ä¸Ž journaled local executor èƒ½ apply mutationã€‚
- composite v1 å›ºå®š fail-fastï¼Œåªè¯» text/Markdown virtual dependencyï¼›æœªæ¥ best-effort æˆ– binary workflow å¿…é¡»æ–°å»º workflow id/version ä¸Ž fixtureã€‚
- æ–° public Tool å¿…é¡»ä½¿ç”¨çŽ°æœ‰ closed DSH author schema ä¸Žæ˜¾å¼ outcome variantã€‚
- æ¯ä¸ªæ–°å¢žæˆ–ä¿®æ”¹çš„ Task/Plan/Walkthrough æ–‡æ¡£éƒ½å¿…é¡»æœ‰ docs/ ä¸‹åˆ†ç¦»çš„ä¸­æ–‡å¯¹åº”ç‰ˆæœ¬ã€‚
- release gate ä½¿ç”¨ Node v22.19.0 ä¸Ž pnpm 10.7.1ï¼›ä¸‹åˆ—å‘½ä»¤ç»Ÿä¸€å¸¦ rtk å‰ç¼€ã€‚

---

### Task 1ï¼šé”å®šæºè¯­ä¹‰å¹¶å¢žåŠ  composite fixture

**Filesï¼š**
- Create: fixtures/migration/composite-source-lock.json
- Create: fixtures/migration/one-click-extract/notes/source.md
- Create: fixtures/migration/one-click-extract/concepts/alpha.md
- Create: fixtures/migration/one-click-extract/concepts/beta.md
- Create: fixtures/migration/one-click-extract/mermaid/alpha.md
- Create: packages/notemd-workflows/test/composite-source-contracts.test.ts
- Modify: fixtures/migration/source-operation-matrix.jsonï¼Œä»…é“¾æŽ¥ composite observationï¼Œä¸æ”¹å˜ operation æ•°é‡å’Œ included/excluded è®¡æ•°ã€‚

**Interfacesï¼š**
- äº§å‡º CompositeSourceObservationï¼ŒåŒ…å« sourceCommitã€defaultActionIdsã€inputPathsã€expectedOutputPathsã€collisionCases ä¸Ž failureCasesã€‚
- fixture å¿…é¡»ç¼–ç  process-current-add-links -> batch-generate-from-titles -> batch-mermaid-fixï¼Œä»¥åŠ sourceFolderPath åˆ° completeFolderPath çš„ hand-offã€‚

- [ ] **Step 1ï¼šå…ˆå†™å¤±è´¥ fixture assertion**

~~~ts
it('records the three source actions in order', async () => {
  const observation = await readCompositeSourceObservation()
  expect(observation.defaultActionIds).toEqual([
    'process-current-add-links',
    'batch-generate-from-titles',
    'batch-mermaid-fix',
  ])
})
~~~

- [ ] **Step 2ï¼šè¿è¡Œ focused testï¼Œç¡®è®¤ç¼º observation æ—¶å¤±è´¥**

Run: rtk pnpm exec vitest run --config vitest.config.ts packages/notemd-workflows/test/composite-source-contracts.test.ts

Expected: FAILï¼Œå› ä¸º composite lock å’Œ source fixture å°šæœªæ³¨å†Œã€‚

- [ ] **Step 3ï¼šå†™å…¥ pinned observation ä¸Žç¡®å®šæ€§ Markdown è¾“å…¥**

åœ¨ composite-source-lock.json ä¿å­˜ source commitã€action é¡ºåºã€output pathã€å·²å­˜åœ¨ destination collisionã€æœªè§£å†³ Mermaid case ä¸Žç²¾ç¡® SHA-256ã€‚ç”Ÿæˆæ–‡æœ¬ä¿æŒçŸ­ä¸”ç¡®å®šï¼›ä¸è¦ snapshot provider response æˆ– credentialã€‚

- [ ] **Step 4ï¼šè¿è¡Œ focused ä¸ŽçŽ°æœ‰ source contract gate**

Run: rtk pnpm exec vitest run --config vitest.config.ts packages/notemd-workflows/test/composite-source-contracts.test.ts packages/notemd-workflows/test/source-contracts.test.ts

Expected: PASSï¼ŒçŽ°æœ‰ 29-operation matrix ä¸å˜ã€‚

- [ ] **Step 5ï¼šæäº¤ fixture contract**

Run: rtk git add fixtures/migration packages/notemd-workflows/test/composite-source-contracts.test.ts; rtk git commit -m "test: lock one-click extract source semantics"

---

### Task 2ï¼šå¢žåŠ å¯é€‰ composite mutation lineageï¼Œä¿æŒ Plan v1 å…¼å®¹

**Filesï¼š**
- Create: packages/notemd-mutation/src/composite-lineage.ts
- Modify: packages/notemd-mutation/src/mutation-plan.ts
- Modify: packages/notemd-mutation/src/index.ts
- Modify: packages/notemd-mutation/test/mutation-plan.test.ts
- Create: packages/notemd-mutation/test/composite-lineage.test.ts

**Interfacesï¼š**
- åˆ›å»º CompositeMutationLineageï¼Œå­—æ®µä¸º workflowIdã€workflowVersionã€definitionDigestã€stepIdã€ordinalã€‚
- MutationProvenanceDraft ä¸Ž MutationProvenance å¢žåŠ  optional compositeã€‚
- ä»…åœ¨å­˜åœ¨ lineage æ—¶æŠŠå®ƒåŠ å…¥ canonicalï¼›æ²¡æœ‰ lineage çš„æ—§ plan digest å¿…é¡»å®Œå…¨ä¸å˜ã€‚

- [ ] **Step 1ï¼šå†™ digest compatibility ä¸Ž validation test**

~~~ts
it('keeps the legacy digest when composite lineage is absent', () => {
  expect(createWorkspaceMutationPlan(legacyDraft()).digest).toBe(knownLegacyDigest)
})
~~~

- [ ] **Step 2ï¼šè¿è¡Œ mutation testï¼Œè®°å½• red state**

Run: rtk pnpm exec vitest run --config vitest.config.ts packages/notemd-mutation/test/mutation-plan.test.ts packages/notemd-mutation/test/composite-lineage.test.ts

Expected: FAILï¼Œå› ä¸º optional lineage type å’Œ canonicalization ä¸å­˜åœ¨ã€‚

- [ ] **Step 3ï¼šå®žçŽ°çª„åŒ– optional extension**

åœ¨ç‹¬ç«‹ composite-lineage.ts ä¸­éªŒè¯ non-empty workflow/step idã€version 1ã€64 å­—ç¬¦ SHA-256 definition digest å’Œ non-negative safe ordinalã€‚åªæœ‰ draft.composite å­˜åœ¨æ—¶æ‰æŠŠ normalized record åŠ å…¥ canonicalProvenanceï¼›ä¸æ”¹ versionã€id formatã€conflict policy æˆ– staged-asset ruleã€‚

- [ ] **Step 4ï¼šè¿è¡Œ focused ä¸Ž package gate**

Run: rtk pnpm exec vitest run --config vitest.config.ts packages/notemd-mutation/test/mutation-plan.test.ts packages/notemd-mutation/test/composite-lineage.test.ts; rtk pnpm --filter @notemd-harness/mutation typecheck; rtk pnpm --filter @notemd-harness/mutation build

Expected: PASSï¼›legacy fixture digest ä¿æŒä¸å˜ã€‚

- [ ] **Step 5ï¼šæäº¤ mutation contract**

Run: rtk git add packages/notemd-mutation; rtk git commit -m "feat: add optional composite mutation lineage"

---

### Task 3ï¼šæž„å»º virtual workspace overlay ä¸Ž deterministic accumulator

**Filesï¼š**
- Create: packages/notemd-composites/package.json
- Create: packages/notemd-composites/tsconfig.json
- Create: packages/notemd-composites/src/diagnostics.ts
- Create: packages/notemd-composites/src/workspace-overlay.ts
- Create: packages/notemd-composites/src/mutation-accumulator.ts
- Create: packages/notemd-composites/test/workspace-overlay.test.ts
- Create: packages/notemd-composites/test/mutation-accumulator.test.ts
- Modify: pnpm-workspace.yaml ä¸Ž tsconfig.jsonï¼Œå°†æ–° package çº³å…¥ workspace/build graphã€‚

**Interfacesï¼š**
- CompositeWorkspaceView å®žçŽ° NotemdVaultï¼Œå¹¶å¢žåŠ  applyPlannedPlan(plan, lineage) ä¸Ž finalize()ã€‚
- MutationAccumulator ä¿å­˜ base stateã€virtual state ä¸Ž step lineageï¼Œç”Ÿæˆä¸€ä¸ªå‡€ WorkspaceMutationPlanã€‚
- diagnostic ä½¿ç”¨ closed unionï¼šcomposite-path-invalidã€composite-virtual-revision-conflictã€composite-destination-collisionã€composite-binary-dependency-unsupportedã€composite-budget-exceededã€composite-no-opã€‚

- [ ] **Step 1ï¼šå†™ read-after-plan ä¸Ž delete visibility æµ‹è¯•**

~~~ts
it('makes a planned Markdown write visible to the next step', async () => {
  const overlay = await createOverlay({ 'notes/source.md': 'old' })
  overlay.applyPlannedPlan(writePlan('notes/source.md', 'new'), lineage('add-links'))
  await expect(overlay.read('notes/source.md')).resolves.toMatchObject({ content: 'new' })
})
~~~

- [ ] **Step 2ï¼šå†™ accumulator collision ä¸Ž net-transition test**

~~~ts
it('coalesces sequential text writes into one base-revision write', () => {
  const plan = finalizeAfter(write('notes/a.md', 'one'), write('notes/a.md', 'two'))
  expect(plan.mutations).toHaveLength(1)
})
~~~

- [ ] **Step 3ï¼šè¿è¡Œæ–°æµ‹è¯•ï¼Œç¡®è®¤ red state**

Run: rtk pnpm exec vitest run --config vitest.config.ts packages/notemd-composites/test/workspace-overlay.test.ts packages/notemd-composites/test/mutation-accumulator.test.ts

Expected: FAILï¼Œå› ä¸º package ä¸Ž overlay ä¸å­˜åœ¨ã€‚

- [ ] **Step 4ï¼šå®žçŽ° lazy base readã€virtual revisionã€æœ‰ç•Œ state ä¸Žå‡€èšåˆ**

overlay å¿…é¡»æ¯ä¸ª path åªè¯» base vault ä¸€æ¬¡ï¼ŒæŒ‰ virtual state æ ¡éªŒæ¯ä¸ª expectedRevisionï¼Œæš´éœ²æŽ’åºåŽçš„ Markdown pathï¼Œå¹¶ä¿æŒç‰©ç† workspace ä¸å˜ã€‚accumulator æŠŠ final state æŠ˜å æˆæ¯ä¸ª destination ä¸€ä¸ª mutationï¼Œå†è°ƒç”¨ createWorkspaceMutationPlanã€‚ä¸‹ä¸€ step å‰å¼ºåˆ¶ file-count ä¸Ž UTF-8 byte budgetã€‚

- [ ] **Step 5ï¼šè¿è¡Œ focused package gate**

Run: rtk pnpm exec vitest run --config vitest.config.ts packages/notemd-composites/test/workspace-overlay.test.ts packages/notemd-composites/test/mutation-accumulator.test.ts; rtk pnpm --filter @notemd-harness/composites typecheck; rtk pnpm --filter @notemd-harness/composites build

Expected: PASSï¼Œç‰©ç† workspace æ²¡æœ‰å†™å…¥ã€‚

- [ ] **Step 6ï¼šæäº¤ overlay boundary**

Run: rtk git add pnpm-workspace.yaml tsconfig.json packages/notemd-composites; rtk git commit -m "feat: add composite workspace overlay"

---

### Task 4ï¼šå¢žåŠ  source-faithful atomic batch planner ä¸Ž one-click definition

**Filesï¼š**
- Modify: packages/notemd-workflows/src/index.ts
- Modify: packages/notemd-workflows/src/plan-factory.ts
- Create: packages/notemd-workflows/test/source-faithful-batch-planners.test.ts
- Create: packages/notemd-composites/src/one-click-extract.ts
- Create: packages/notemd-composites/src/index.ts
- Create: packages/notemd-composites/test/one-click-extract.test.ts
- Modify: packages/notemd-composites/package.json

**Interfacesï¼š**
- å¢žåŠ  SourceFaithfulBatchPlannerï¼Œæä¾› planBatchTitleGeneration(sourceFolderPath, completedFolderPath, signal?) ä¸Ž planBatchMermaidRepair(folderPath, errorFolderPath, signal?)ã€‚
- åˆæ³•ç©º batch è¿”å›ž undefinedï¼›invalid pathã€collisionã€stale revision æˆ– malformed generated content æŠ›å‡º typed errorã€‚
- å¯¼å‡º createOneClickExtractDefinition() ä¸Ž planOneClickExtract(request, dependencies, signal?)ã€‚

- [ ] **Step 1ï¼šå†™ source-faithful planner test**

~~~ts
it('writes generated title output to completedFolderPath and removes the source copy', async () => {
  const plan = await planner.planBatchTitleGeneration('concepts', 'completed')
  expect(destinations(plan)).toEqual(['completed/alpha.md', 'completed/beta.md', 'concepts/alpha.md', 'concepts/beta.md'])
})
~~~

- [ ] **Step 2ï¼šå®žçŽ°å‰å…ˆå†™ definition test**

~~~ts
it('has a stable ordered definition digest and fixed fail-fast policy', () => {
  const definition = createOneClickExtractDefinition()
  expect(definition.id).toBe('one-click-extract')
  expect(definition.version).toBe(1)
  expect(definition.failurePolicy).toBe('fail-fast')
})
~~~

- [ ] **Step 3ï¼šè¿è¡Œ focused testsï¼Œç¡®è®¤è¯­ä¹‰ç¼ºå£**

Run: rtk pnpm exec vitest run --config vitest.config.ts packages/notemd-workflows/test/source-faithful-batch-planners.test.ts packages/notemd-composites/test/one-click-extract.test.ts

Expected: FAILï¼Œå› ä¸ºçŽ°æœ‰ folder planner æ²¡æœ‰ source move/report è¯­ä¹‰ï¼Œdefinition ä¹Ÿä¸å­˜åœ¨ã€‚

- [ ] **Step 4ï¼šå®žçŽ°å…·å planner ä¸Ž definition**

ä¿æŒçŽ°æœ‰ planTitlesInFolderã€planMermaidRepairsInFolder çš„æ—¢æœ‰ Tool è¯­ä¹‰ä¸å˜ã€‚å¢žåŠ  source-faithful operationï¼šä½¿ç”¨ç¡®å®šæ€§çš„ lexical snapshotã€explicit output folderã€content-addressed generated writeã€delete/write moveã€report path å’Œ closed collision diagnosticã€‚one-click-extract åªèƒ½è°ƒç”¨è¿™äº›å…·å operationï¼Œå¹¶å°†ç»“æžœä¾æ¬¡ apply åˆ° CompositeWorkspaceViewã€‚

- [ ] **Step 5ï¼šè¿è¡Œ workflow/composite focused gate**

Run: rtk pnpm exec vitest run --config vitest.config.ts packages/notemd-workflows/test/source-faithful-batch-planners.test.ts packages/notemd-composites/test/one-click-extract.test.ts packages/notemd-workflows/test/composite-source-contracts.test.ts; rtk pnpm --filter @notemd-harness/workflows typecheck; rtk pnpm --filter @notemd-harness/composites typecheck

Expected: PASSï¼Œfixture output path ä¸Ž definition digest å›ºå®šã€‚

- [ ] **Step 6ï¼šæäº¤ atomic ä¸Ž definition behavior**

Run: rtk git add packages/notemd-workflows packages/notemd-composites; rtk git commit -m "feat: define one-click extract semantics"

---

### Task 5ï¼šé€šè¿‡ Cordis é›†æˆ composite service

**Filesï¼š**
- Modify: packages/notemd-bundle/src/workflows.ts
- Create: packages/notemd-bundle/src/composites.ts
- Modify: packages/notemd-bundle/src/index.ts
- Modify: packages/notemd-bundle/package.json
- Modify: packages/notemd-bundle/cordis.patch.yml
- Create: packages/notemd-bundle/test/composites.contract.test.ts
- Modify: packages/notemd-bundle/test/runtime-boundary.test.ts

**Interfacesï¼š**
- NotemdWorkflowsService é€šè¿‡ createScopedPlanner(vault) å®žçŽ° ScopedWorkflowPlannerFactoryã€‚
- NotemdCompositeWorkflowService extends Cordis Serviceï¼Œå£°æ˜Ž static inject = ['notemdVault', 'notemdWorkflows'] as constã€‚
- service method planOneClickExtract(request, signal?) å§”æ‰˜ @notemd-harness/compositesï¼Œè¿”å›žä¸€ä¸ª WorkspaceMutationPlanã€‚

- [ ] **Step 1ï¼šå†™ Cordis boundary test**

~~~ts
it('declares static injection and does not own a second vault or transformer', () => {
  expect(NotemdCompositeWorkflowService.inject).toEqual(['notemdVault', 'notemdWorkflows'])
})
~~~

- [ ] **Step 2ï¼šè¿è¡Œ boundary testï¼Œè®°å½• red state**

Run: rtk pnpm exec vitest run --config vitest.config.ts packages/notemd-bundle/test/composites.contract.test.ts packages/notemd-bundle/test/runtime-boundary.test.ts

Expected: FAILï¼Œå› ä¸º service ä¸Ž patch row ä¸å­˜åœ¨ã€‚

- [ ] **Step 3ï¼šå¢žåŠ  scoped factory ä¸Žè–„ Cordis adapter**

ä¿æŒ NotemdWorkflowsService ä¸º transformer ownerã€‚composite service åªè´Ÿè´£ç”Ÿå‘½å‘¨æœŸçŠ¶æ€ã€è°ƒç”¨çº¯ plannerï¼Œå¹¶ç”± Cordis ç®¡ç†æœªæ¥ effectã€‚å®ƒä¸èƒ½è¯»å–çŽ¯å¢ƒå˜é‡ã€åˆ›å»º providerã€è®¿é—® Obsidian API æˆ–å†™ workspaceã€‚

- [ ] **Step 4ï¼šå®Œæˆ bundle registration**

æŠŠ composite package åŠ å…¥ dependencies å’Œ bundledDependenciesã€‚å‘ cordis.patch.yml å¢žåŠ å®Œæ•´ replacement rowï¼Œä½¿ clean-profile loading èƒ½å®‰è£…å…·å serviceï¼Œæˆ–æ˜Žç¡®è¿”å›ž optional DSH dependency outcomeã€‚

- [ ] **Step 5ï¼šè¿è¡Œ bundle typecheck/build ä¸Ž boundary test**

Run: rtk pnpm exec vitest run --config vitest.config.ts packages/notemd-bundle/test/composites.contract.test.ts packages/notemd-bundle/test/runtime-boundary.test.ts; rtk pnpm --filter dsh-notemd typecheck; rtk pnpm --filter dsh-notemd build

Expected: PASSï¼Œåªæœ‰ä¸€ä¸ª composition rootï¼Œä¸”æ²¡æœ‰ import cycleã€‚

- [ ] **Step 6ï¼šæäº¤ Cordis integration**

Run: rtk git add packages/notemd-bundle; rtk git commit -m "feat: register composite workflow service"

---

### Task 6ï¼šæš´éœ²å…·å Tool ä¸Ž durable composite job

**Filesï¼š**
- Modify: packages/notemd-tools/src/notemd-services.ts
- Modify: packages/notemd-tools/src/plan-tools.ts
- Modify: packages/notemd-tools/src/job-tools.ts
- Modify: packages/notemd-tools/package.json
- Modify: packages/notemd-bundle/src/tools.ts
- Modify: packages/notemd-bundle/src/jobs.ts
- Modify: packages/notemd-bundle/src/index.ts
- Create: packages/notemd-tools/test/composite-tools.contract.test.ts
- Modify: packages/notemd-tools/test/tools.contract.test.ts
- Modify: packages/notemd-jobs/test/durable-workflow-runner.test.ts

**Interfacesï¼š**
- å¢žåŠ  NotemdCompositeWorkflowsï¼Œæä¾› planOneClickExtract(request, signal?) ä¸Ž definition()ã€‚
- å¢žåŠ  NotemdJobs.startOneClickExtract(request): Promise<JobRecord>ã€‚
- å¢žåŠ  OneClickExtractJobRequestï¼Œå­—æ®µä¸º idempotencyKeyã€sourcePathã€conceptFolderPathã€completedFolderPathã€mermaidFolderPathã€å¯é€‰ mermaidErrorFolderPathã€‚
- ç²¾ç¡®æ³¨å†Œ notemd_plan_one_click_extract ä¸Ž notemd_job_start_one_click_extractï¼›resume/status/cancel ä¸å˜ã€‚

- [ ] **Step 1ï¼šå†™ closed Tool/job contract test**

~~~ts
it('rejects unknown composite request fields at the Tool edge', async () => {
  const result = await invoke('notemd_plan_one_click_extract', {
    sourcePath: 'notes/source.md',
    conceptFolderPath: 'concepts',
    completedFolderPath: 'completed',
    mermaidFolderPath: 'completed',
    unexpected: true,
  })
  expect(result).toMatchObject({ status: 'invalid-input' })
})
~~~

- [ ] **Step 2ï¼šè¿è¡Œ focused contract testï¼Œç¡®è®¤ red state**

Run: rtk pnpm exec vitest run --config vitest.config.ts packages/notemd-tools/test/composite-tools.contract.test.ts packages/notemd-tools/test/tools.contract.test.ts packages/notemd-jobs/test/durable-workflow-runner.test.ts

Expected: FAILï¼Œå› ä¸º service interfaceã€Tool registration å’Œ executor entry å°šæœªå­˜åœ¨ã€‚

- [ ] **Step 3ï¼šå®žçŽ° edge validation ä¸Ž named registration**

å¤ç”¨ existing requiredString/path normalization helper ä¸Ž closed author schemaã€‚ä¸æŽ¥å— actions arrayã€raw DSLã€provider field æˆ– failure-policy selectorã€‚plan Tool è¿”å›žæ—¢æœ‰ workspaceMutationPlan schemaï¼›job Tool è¿”å›žæ—¢æœ‰ jobRecord schemaã€‚

- [ ] **Step 4ï¼šæ‰©å±•çŽ°æœ‰ job runnerï¼Œä¸æ–°å»º store**

æ³¨å†Œ key ä¸º one-click-extract@1 çš„ executorã€‚åªæŒä¹…åŒ– request pathã€idempotency keyã€definition digest ä¸Ž step checkpoint metadataã€‚composite service åœ¨æ‰§è¡Œæ—¶è§£æžï¼›ä¿ç•™æ˜¾å¼ resumeã€cancel å’Œ terminal stateã€‚

- [ ] **Step 5ï¼šè¿è¡Œ Tool/job focused gate ä¸Ž package check**

Run: rtk pnpm exec vitest run --config vitest.config.ts packages/notemd-tools/test/composite-tools.contract.test.ts packages/notemd-tools/test/tools.contract.test.ts packages/notemd-jobs/test/durable-workflow-runner.test.ts; rtk pnpm --filter @notemd-harness/tools typecheck; rtk pnpm --filter @notemd-harness/jobs typecheck

Expected: PASSï¼Œæ²¡æœ‰ç¬¬äºŒ approval æˆ– mutation pathã€‚

- [ ] **Step 6ï¼šæäº¤ Tool/job surface**

Run: rtk git add packages/notemd-tools packages/notemd-bundle/src/tools.ts packages/notemd-bundle/src/jobs.ts packages/notemd-jobs; rtk git commit -m "feat: expose one-click extract tools and jobs"

---

### Task 7ï¼šè¯æ˜Ž aggregate approvalã€cancel ä¸Ž clean-profile è¡Œä¸º

**Filesï¼š**
- Create: packages/notemd-composites/test/one-click-extract.integration.test.ts
- Create: packages/notemd-bundle/test/composite-approval.test.ts
- Modify: packages/notemd-tools/test/tools.contract.test.ts
- Modify: scripts/accept-dsh-profile.ts
- Modify: packages/notemd-bundle/test/acceptance-fixture.test.tsï¼ˆè‹¥çŽ°æœ‰ acceptance fixture æ˜¯æ­£ç¡® ownerï¼‰ã€‚

**Interfacesï¼š**
- aggregate plan åªé€šè¿‡ notemd_request_plan_approval ä¸Ž notemd_apply_approved_plan approval/apply ä¸€æ¬¡ã€‚
- stale base revision è¿”å›žçŽ°æœ‰ conflict outcomeï¼Œä¸”ä¸å‘å¸ƒ workspace change eventã€‚
- cancel è¿”å›ž terminal cancelled job stateï¼Œä¸äº§ç”Ÿå¯å®¡æ‰¹ partial planã€‚
- optional DSH runtime unavailable æ—¶è¿”å›ž named capability-unavailableï¼Œä¸è½¬æ¢ä¸º successã€‚

- [ ] **Step 1ï¼šå†™ approval/lifecycle test**

~~~ts
it('uses one receipt for all three steps and applies once', async () => {
  const plan = await planOneClickExtract(validRequest())
  const receipt = await requestApproval(plan)
  expect(await applyApproved(receipt)).toMatchObject({ status: 'committed' })
  expect(await countMutationReceipts()).toBe(1)
})
~~~

- [ ] **Step 2ï¼šè¿è¡Œ focused lifecycle testï¼Œç¡®è®¤ç¼ºè¡Œä¸º**

Run: rtk pnpm exec vitest run --config vitest.config.ts packages/notemd-composites/test/one-click-extract.integration.test.ts packages/notemd-bundle/test/composite-approval.test.ts

Expected: FAILï¼Œç›´åˆ° aggregate receiptã€stale revision å’Œ cancellation path æŽ¥é€šã€‚

- [ ] **Step 3ï¼šå¤ç”¨çŽ°æœ‰ approval/event path**

ä¸å¢žåŠ  composite-specific executorã€‚aggregate WorkspaceMutationPlan è¿›å…¥çŽ°æœ‰ approval ledgerï¼Œè¢«çŽ°æœ‰ one-time receipt æ¶ˆè´¹ï¼Œå¹¶ç”± LocalMutationExecutor applyã€‚workspace event åªæ¥è‡ª committed receiptã€‚

- [ ] **Step 4ï¼šæ‰©å±• clean DSH profile acceptance**

å°† packed dsh-notemd tarball å®‰è£…åˆ°éš”ç¦» profileï¼Œç”¨ deterministic fixture è°ƒç”¨ notemd_plan_one_click_extractï¼ŒéªŒè¯ closed output schemaï¼Œå¹¶éªŒè¯ unavailable DSH capability ä»æ˜¾å¼è¿”å›žã€‚

- [ ] **Step 5ï¼šè¿è¡Œ focused ä¸Ž acceptance gate**

Run: rtk pnpm exec vitest run --config vitest.config.ts packages/notemd-composites/test/one-click-extract.integration.test.ts packages/notemd-bundle/test/composite-approval.test.ts; rtk pnpm accept:dsh

Expected: PASSï¼›approval å‰ä¸å‘ç”Ÿç‰©ç†æ–‡ä»¶å˜æ›´ã€‚

- [ ] **Step 6ï¼šæäº¤ acceptance evidence**

Run: rtk git add packages/notemd-composites packages/notemd-bundle scripts; rtk git commit -m "test: verify composite approval and acceptance"

---

### Task 8ï¼šæ›´æ–°åŒè¯­è¯æ®ï¼Œå®Œæ•´ gate åŽæ‰å‘å¸ƒ

**Filesï¼š**
- Modify: docs/specs/2026-08-21-dsh-notemd-composite-workflow-architecture.md
- Modify: docs/specs/2026-08-21-dsh-notemd-composite-workflow-architecture.zh-CN.md
- Modify: docs/superpowers/plans/2026-08-21-dsh-notemd-composite-workflow.md
- Modify: docs/superpowers/plans/2026-08-21-dsh-notemd-composite-workflow.zh-CN.md
- Modify: docs/walkthroughs/2026-08-15-dsh-notemd-migration-progress.md
- Modify: docs/walkthroughs/2026-08-15-dsh-notemd-migration-progress.zh-CN.md
- Modify: docs/specs/2026-08-17-dsh-notemd-current-state-architecture-audit.md
- Modify: docs/specs/2026-08-17-dsh-notemd-current-state-architecture-audit.zh-CN.md
- ä¸è¦ä¿®æ”¹ README.md æˆ– README.zh-CN.md æ¥åµŒå…¥æœ¬è®¡åˆ’ã€‚

**Interfacesï¼š**
- Phase record å¿…é¡»åŒºåˆ†å·²å®žçŽ°ä»£ç ã€å®žæµ‹è¯æ®å’Œ planned workã€‚
- ä¸­è‹±æ–‡æ–‡æ¡£å¿…é¡»åŒ…å«ç›¸åŒ source/target lockã€phase statusã€rejected alternative å’Œ exit criteriaã€‚

- [ ] **Step 1ï¼šå¦‚å®žè®°å½• implementation phase**

åªç”¨å®žæµ‹äº‹å®žæ›´æ–° Phase 19ã€‚è¿è¡Œæ—¶ä»£ç å°šæœªè½åœ°æ—¶ï¼ŒçŠ¶æ€å¿…é¡»æ˜¯ï¼šArchitecture and implementation plan recorded. Runtime implementation not started in this phaseã€‚åŽç»­æ¯ä¸ª task å®ŒæˆåŽè¿½åŠ ç²¾ç¡®æ–‡ä»¶ã€focused test countã€capability limit å’Œä¸‹ä¸€ gateã€‚

- [ ] **Step 2ï¼šæ‰§è¡Œæ–‡æ¡£æ£€æŸ¥**

Run: rtk git diff --check; rtk rg "one-click-extract|3169964|07c629c6|dsh-notemd@0.1.1" docs/specs docs/superpowers/plans docs/walkthroughs

Expectedï¼šä¸¤ç§è¯­è¨€åŒ…å«ç›¸åŒ identity å’Œ workflow termï¼Œä¸” README é¦–é¡µæ²¡æœ‰æ–°å¢ž plan linkã€‚

- [ ] **Step 3ï¼šæ‰§è¡Œå®Œæ•´ release gate**

Run: rtk pnpm typecheck; rtk pnpm lint; rtk pnpm test; rtk pnpm test:coverage; rtk pnpm build; rtk pnpm pack:bundle; rtk pnpm verify:bundle; rtk pnpm accept:dsh; rtk git diff --check

Expectedï¼šå…¨éƒ¨å‘½ä»¤é€€å‡ºç ä¸º 0ã€‚optional native capability å¯ä»¥ unavailableï¼Œä½†å¿…é¡»å¦‚å®žæŠ¥å‘Šã€‚

- [ ] **Step 4ï¼šæ£€æŸ¥ staged diff å¹¶æäº¤**

Run: rtk git status --short; rtk git diff --stat; rtk git add docs packages fixtures scripts pnpm-workspace.yaml tsconfig.json; rtk git commit -m "feat: add Cordis composite workflow architecture"

Expectedï¼šåª stage æœ¬è®¡åˆ’èŒƒå›´å†… implementationã€fixture ä¸ŽåŒè¯­æ–‡æ¡£ã€‚

- [ ] **Step 5ï¼šæŽ¨é€ main å¹¶éªŒè¯è¿œç«¯ä¸€è‡´æ€§**

Run: rtk proxy git -c core.sshCommand="ssh -o ControlMaster=no -o ControlPath=none" push origin main; rtk git fetch origin main; rtk git status --short --branch; rtk git log -1 --oneline; rtk gh api repos/Jacobinwwey/dsh-NotEMD/commits/main --jq .sha

Expectedï¼šnon-force push æˆåŠŸï¼Œlocal main ä¸Ž origin/main ä¸ºåŒä¸€ commitï¼Œå·¥ä½œåŒºåªæ˜¾ç¤º ## mainã€‚

## Exit criteria / å‡ºå£æ¡ä»¶

åªæœ‰åœ¨ä»¥ä¸‹æ¡ä»¶å…¨éƒ¨æ»¡è¶³åŽï¼Œimplementation phase æ‰èƒ½å®£ç§°å®Œæˆï¼š

- source fixture ä¸Ž current source lock å·²å›ºå®šï¼Œdirty Drawnix path ç»§ç»­æŽ’é™¤ã€‚
- source-faithful batch title/Mermaid planner é€šè¿‡ç¡®å®šæ€§æµ‹è¯•ã€‚
- overlay è¯æ˜Ž virtual read/listã€revision conflictã€budget ä¸Ž collision fail closedã€‚
- one-click-extract@1 æ‹¥æœ‰ç¨³å®š definition digest ä¸Žå›ºå®š fail-fast è¯­ä¹‰ã€‚
- è§‚å¯Ÿåˆ°æ°å¥½ä¸€ä¸ª aggregate planã€ä¸€ä¸ª approval receiptã€ä¸€ä¸ª committed mutation receiptã€‚
- named plan/job Tool é€šè¿‡ closed schema ä¸Ž durable resume æµ‹è¯•ã€‚
- packed tarball çš„ clean DSH profile acceptance é€šè¿‡ã€‚
- typecheckã€lintã€testã€coverageã€buildã€bundle verification å’Œ git diff å…¨éƒ¨é€šè¿‡ã€‚
- main å·² non-force push ä¸” worktree cleanã€‚\n
