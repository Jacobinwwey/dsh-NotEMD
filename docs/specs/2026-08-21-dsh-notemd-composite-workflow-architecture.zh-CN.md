# DSH NoteMD Composite Workflow é¡¶å±‚æž¶æž„

> English version: 2026-08-21-dsh-notemd-composite-workflow-architecture.md

**å†³ç­–çŠ¶æ€ï¼š** æž¶æž„ä¸Žå®žæ–½è®¡åˆ’å·²è½ç›˜ã€‚æœ¬é˜¶æ®µå°šæœªå¼€å§‹è¿è¡Œæ—¶å®žçŽ°ã€‚

**èŒƒå›´é”å®šï¼š** ç›®æ ‡æ˜¯ç‹¬ç«‹è¿è¡Œçš„ DeepSeek Harness bundleã€‚Obsidian UIã€ç¼–è¾‘å™¨ã€å‘½ä»¤ã€Modalã€è®¾ç½®å’Œå®¿ä¸»ç”Ÿå‘½å‘¨æœŸç»§ç»­ç•™åœ¨ bundle è¾¹ç•Œä¹‹å¤–ã€‚LLMã€Webã€Provider é€‰æ‹©ã€å‡­æ®å’Œ transport å‡ç”± DSH æ‰€æœ‰ã€‚

**è¯æ®é”ï¼š**

- ç›®æ ‡ï¼šdsh-NotEMD main ä¸º 3169964ï¼›npm åŒ…ä¸º dsh-notemd@0.1.1ã€‚
- å½“å‰æºè§‚å¯Ÿç‚¹ï¼šref/obsidian-NotEMD ä¸º 07c629c6f99a1171a6a63eaf50ddb0dce0f5fed5ã€‚
- åŽ†å²è¡Œä¸º oracleï¼šobsidian-NoteMD_new ä¸º 4168a51cd19ad8c3d1e05f604b50936255461a31ã€‚
- Slidev å…¼å®¹æ€§ä»é”å®š github:Jacobinwwey/slidev@bbcb2efae709c2ebaa96bda522cd6c192476817cã€‚

## 1. æž¶æž„å†³ç­–

å¼•å…¥ä¸€ä¸ªå…·åã€ç±»åž‹åŒ–çš„ composite workflowï¼šone-click-extract@1ã€‚

å®ƒæ˜¯é¢†åŸŸåŒ…ï¼Œä¸æ˜¯é€šç”¨ action dispatcherã€‚å®šä¹‰åœ¨ bundle ä¸­ç¼–è¯‘å›ºåŒ–ï¼ŒåŒ…å«å›ºå®šæœ‰åºæ­¥éª¤ã€å›ºå®š fail-fast ç­–ç•¥ã€definition digest å’Œæ˜¾å¼ request schemaã€‚ç¬¬ä¸€ç‰ˆåªè§„åˆ’ä¸€ä¸ª aggregate ä¸å¯å˜ WorkspaceMutationPlanï¼›approval ä¸Ž apply ç»§ç»­å¤ç”¨çŽ°æœ‰ä¸€æ¬¡æ€§ receipt å’Œ journaled executorã€‚

æºæ’ä»¶é»˜è®¤æŒ‰é’®çš„è¯­ä¹‰æ˜¯ï¼š

~~~text
process-current-add-links
  -> batch-generate-from-titles
  -> batch-mermaid-fix
~~~

æºå®žçŽ°é€šè¿‡éšè—çš„ UI çŠ¶æ€åœ¨æ­¥éª¤é—´ä¼ é€’ preferred concept folder å’Œæœ€è¿‘ç”Ÿæˆçš„ complete folderã€‚ç‹¬ç«‹ DSH è¿è¡Œæ—¶æ— æ³•æŽ¨æ–­ active fileã€selected folderã€Obsidian settings æˆ– UI æ‰€æœ‰çš„ output folderï¼Œå› æ­¤ composite request å¿…é¡»æ˜¾å¼æä¾›è¿™äº›è·¯å¾„ï¼ŒåŽç»­æ­¥éª¤ä»Ž request ä¸Ž virtual workspace overlay æ´¾ç”Ÿè¾“å…¥ã€‚

è¿™ä¸æ˜¯æŠŠæº custom-workflow DSL ç›´æŽ¥æ¬è¿›æ¥ã€‚åŽŸå§‹ action-list dispatcher ä¼šæš´éœ²æ— ç•Œ Tool surfaceï¼Œä½¿ operation å…¼å®¹æ€§å˜æˆéšå¼è¡Œä¸ºï¼Œå¹¶å…è®¸è°ƒç”¨æ–¹ç»•è¿‡æ­¥éª¤ä¸å˜é‡ã€‚åŽç»­è‹¥éœ€è¦ç”¨æˆ·è‡ªå®šä¹‰ compositeï¼Œåº”é‡‡ç”¨å¸¦ capability declaration çš„ç‹¬ç«‹ç‰ˆæœ¬åŒ– definitionï¼›ä¸å±žäºŽ one-click-extract@1ã€‚

## 2. ç›¸å¯¹æºå¥‘çº¦çš„å½“å‰ç¼ºå£

| æºè¡Œä¸ºæˆ–å…ˆå‰è¦æ±‚ | å½“å‰ç›®æ ‡è¯æ® | å¾…è¡¥ç¼ºé™· |
| --- | --- | --- |
| é»˜è®¤ One-Click Extract æ˜¯ä¸‰æ­¥é“¾ï¼Œå¹¶ä¼ é€’ folder context | ref/obsidian-NotEMD/src/workflowButtons.ts ä¸Ž NotemdSidebarView.ts:927-1160 | æ²¡æœ‰ composite definitionã€context objectã€aggregate plan æˆ–å…·å DSH Toolã€‚ |
| æ‰¹é‡æ ‡é¢˜ç”Ÿæˆä¼šç”Ÿæˆå†…å®¹å¹¶ç§»åŠ¨åˆ° complete folder | ref/obsidian-NotEMD/src/fileUtils.ts:1262 ä¸Ž main.ts:2688 | planTitlesInFolder æ˜¯åŽŸåœ°æ›¿æ¢ï¼Œæ²¡æœ‰ destination folder ä¸Ž move è¯­ä¹‰ã€‚ |
| æ‰¹é‡ Mermaid fix ä¼šæ ¡éªŒã€ä¿®å¤ã€å¯é€‰ç§»åŠ¨æœªè§£å†³æ–‡ä»¶å¹¶å†™ report | ref/obsidian-NotEMD/src/fileUtils.ts:1521 | planMermaidRepairsInFolder åªæ›¿æ¢ Markdown fenceï¼Œä¸å»ºæ¨¡æ ¡éªŒã€error move æˆ– reportã€‚ |
| composite æ­¥éª¤è¦èƒ½è¯»å–å‰ä¸€æ­¥è¾“å‡º | å½“å‰ planner åªè¯»ç‰©ç† vault | æ²¡æœ‰ virtual read/listï¼Œè‹¥æå‰å†™ç›˜å°±ä¼šç»•è¿‡ approvalã€‚ |
| ä¸€ä¸ª workflow åªéœ€ä¸€æ¬¡ approval | å½“å‰ jobs/checkpoints æŒ‰åŽŸå­ planner ç»“æžœç»„ç»‡ | ç›´æŽ¥ä¸²è”ä¼šé€ æˆå¤šæ¬¡ approval æˆ–éƒ¨åˆ† mutationã€‚ |
| æº diagram.generate æŽ¥å— Markdown ä¸Žç”Ÿæˆé€‰é¡¹ | å½“å‰ source çš„ registry.ts ä¸Ž diagram/types.ts | å½“å‰ conformance adapter æž„é€  synthetic DiagramSpecï¼Œæœªè¯æ˜Ž Markdown åˆ° intent çš„æŽ¨æ–­è·¯å¾„ã€‚ |
| DSH/Cordis ownership | bundle service å·²ä½¿ç”¨ static inject ä¸Ž ctx.effect | composite service/package å¿…é¡»ç»´æŒçŽ°æœ‰ç”Ÿå‘½å‘¨æœŸä¸Žä¾èµ–æ–¹å‘ã€‚ |

å½“å‰ extract-and-generate planner ä¸èƒ½ä½œä¸ºæ›¿ä»£ï¼šå®ƒåªç”Ÿæˆç¬¬ä¸€ä¸ª conceptï¼Œä½¿ç”¨ç¡¬ç¼–ç çš„ concepts/ ä¸Ž generated/ï¼Œä¹Ÿæ²¡æœ‰ virtual follow-up stepã€‚

## 3. ç›®æ ‡ä¸Žéžç›®æ ‡

### ç›®æ ‡

- ä¿æŒ read -> plan -> approve -> apply -> receipt æ—¢æœ‰é“¾è·¯ã€‚
- è®©æºé»˜è®¤ workflow åœ¨æ²¡æœ‰ Obsidian host context æ—¶å¯è°ƒç”¨ã€‚
- approval application ä¹‹å‰ï¼Œcomposite planning ä¸äº§ç”Ÿå‰¯ä½œç”¨ã€‚
- ä½¿æ­¥éª¤é¡ºåºã€å¤±è´¥ç­–ç•¥ã€è·¯å¾„è§£æžå’Œ lineage å¯æ£€æŸ¥ã€å¯æ‘˜è¦å’Œå¯åš digestã€‚
- åªå¤ç”¨å·²ç»è¯æ˜Žè¯­ä¹‰ä¸€è‡´çš„å…·å atomic plannerï¼›å¯¹ä¸ä¸€è‡´å¤„å¢žåŠ  source-faithful batch plannerã€‚
- æŒä¹…åŒ– job åªæœ‰åœ¨ workflow idã€version å’Œ definition digest ä¸€è‡´æ—¶æ‰èƒ½ resumeã€‚
- æ²¡æœ‰ composite lineage çš„æ—§ WorkspaceMutationPlan ç»§ç»­æœ‰æ•ˆï¼Œå¹¶ä¿æŒæ—§ digest å…¼å®¹ã€‚

### éžç›®æ ‡

- å¯¼å…¥æˆ–æ‰§è¡Œæº custom-workflow DSLã€‚
- å°† Obsidian UI è¿›åº¦ã€Noticeã€é€‰æ‹©å¯¹è¯æ¡†æˆ– active-file å‘çŽ°è¿å…¥ DSHã€‚
- å¢žåŠ é€šç”¨ notemd_run(type, options) Toolã€‚
- åœ¨ NoteMD ä¸­å¢žåŠ  provider credentialã€endpointã€model discovery æˆ– Web transportã€‚
- å®£ç§°å¤šè¿›ç¨‹ job schedulingã€å…¨æ–‡ä»¶ç³»ç»Ÿ ACID æˆ– SVG projection ç­‰åŒåŽŸç”Ÿ rendererã€‚
- ä»Ž dirty source checkout å®žçŽ° Drawnix WIPã€‚

## 4. ç›®æ ‡æ‹“æ‰‘

~~~mermaid
flowchart TD
  F["DSH Fiber"] --> B["notemd-bundle"]
  B --> C["NotemdCompositeWorkflowService"]
  C --> CW["@notemd-harness/composites"]
  CW --> W["scoped WorkflowPlanner"]
  W --> V["CompositeWorkspaceView"]
  V --> O["virtual mutation overlay"]
  O --> P["aggregate WorkspaceMutationPlan"]
  P --> A["existing approval ledger"]
  A --> E["existing journaled executor"]
  E --> R["committed receipt and workspace event"]
  B --> T["named plan Tool and named job Tool"]
  T --> C
  B --> L["ctx.llm / ctx.web"]
~~~

æ‰€æœ‰æƒè§„åˆ™ï¼š

- @notemd-harness/composites ä¾èµ– @notemd-harness/workflowsã€@notemd-harness/mutationã€@notemd-harness/vaultï¼›workflows ä¸åå‘ä¾èµ– compositesã€‚
- bundle æ˜¯å”¯ä¸€ Cordis composition rootã€‚çº¯ composites åŒ…ä¸åˆ›å»º Contextã€Serviceã€timerã€processã€global singletonã€‚
- NotemdCompositeWorkflowService ä½¿ç”¨ static injectï¼›è‹¥æœªæ¥æŒæœ‰æ´»åŠ¨ planning èµ„æºï¼Œæ¸…ç†ç”± Fiber-owned effect ç®¡ç†ã€‚
- Tool è°ƒç”¨ serviceï¼›job æ‰©å±•çŽ°æœ‰ FileJobStore ä¸Ž DurableWorkflowRunnerã€‚ç¦æ­¢ç¬¬äºŒ job store æˆ– mutation executorã€‚

## 5. å…¬å…±å¥‘çº¦

ä»¥ä¸‹æ˜¯ v1 çš„è®¾è®¡ç›®æ ‡ï¼Œåç§°ä¿æŒå°é—­ä¸”æ˜¾å¼ã€‚

~~~ts
export type CompositeWorkflowId = 'one-click-extract'

export interface OneClickExtractRequest {
  readonly sourcePath: string
  readonly conceptFolderPath: string
  readonly completedFolderPath: string
  readonly mermaidFolderPath: string
  readonly mermaidErrorFolderPath?: string
  readonly idempotencyKey?: string
}

export interface CompositeWorkflowDefinition {
  readonly id: CompositeWorkflowId
  readonly version: 1
  readonly definitionDigest: ContentSha256
  readonly failurePolicy: 'fail-fast'
  readonly steps: readonly CompositeStepDefinition[]
}

export interface CompositeStepDefinition {
  readonly id: 'add-links' | 'generate-complete' | 'repair-mermaid'
  readonly operationId:
    | 'file.process-add-links'
    | 'content.batch-generate-from-titles'
    | 'mermaid.batch-fix'
  readonly ordinal: number
}

export interface CompositeStepLineage {
  readonly workflowId: CompositeWorkflowId
  readonly workflowVersion: 1
  readonly definitionDigest: ContentSha256
  readonly stepId: CompositeStepDefinition['id']
  readonly ordinal: number
}

export interface CompositeWorkspaceView extends NotemdVault {
  applyPlannedPlan(plan: WorkspaceMutationPlan, lineage: CompositeStepLineage): void
  finalize(): WorkspaceMutationPlan
}
~~~

Tool/job edge åªæ‰§è¡Œä¸€æ¬¡ request validationï¼š

- æ‰€æœ‰è·¯å¾„éƒ½å¿…é¡»æ˜¯ç›¸å¯¹ã€slash-separatedã€æ—  NUL çš„ workspace pathã€‚
- sourcePath å¿…é¡»å­˜åœ¨äºŽ base snapshot ä¸”ä¸º Markdownã€‚
- folder path åªåšä¸€æ¬¡ canonicalizationï¼Œä¸èƒ½å·å·è¢« settings æ›¿æ¢ã€‚
- destination å·²å­˜åœ¨æ—¶è¿”å›ž closed collision errorã€‚æºå®žçŽ°é™é»˜è·³è¿‡ complete æ–‡ä»¶çš„è¡Œä¸ºï¼ŒåŽç»­é€šè¿‡ç‹¬ç«‹ reconciliation operation è¡¨è¾¾ï¼Œä¸èƒ½éšå« overwriteã€‚
- v1 composite çš„ virtual dependency åªæ”¯æŒ text/Markdownã€‚æœªæ¥å¯æœ‰ terminal binary artifact stepï¼Œä½† v1 åŽç»­æ­¥éª¤ä¸èƒ½è¯»å– binaryã€‚

çŽ°æœ‰ workflow service å¢žåŠ æ˜¾å¼ scoped planner factoryï¼š

~~~ts
export interface ScopedWorkflowPlannerFactory {
  createScopedPlanner(vault: NotemdVault): WorkflowPlanner
}
~~~

NotemdWorkflowsService å®žçŽ°è¯¥ factoryã€‚composite service æ³¨å…¥ notemdVault ä¸Ž notemdWorkflowsï¼Œå†è®©çŽ°æœ‰ service åˆ›å»º overlay plannerã€‚è¿™æ ·é¿å…ç¬¬äºŒä¸ª transformer ownerï¼Œä¸”ä¿æŒä¾èµ–å›¾æ— çŽ¯ã€‚

## 6. æ­¥éª¤è¯­ä¹‰

one-click-extract@1 ä¸¥æ ¼åŒ…å«ä¸‰ä¸ªæœ‰åºæ­¥éª¤ï¼š

1. add-linksï¼šè°ƒç”¨çŽ°æœ‰å•æ–‡æ¡£ link planner å¤„ç† sourcePathã€‚
2. generate-completeï¼šè°ƒç”¨æ–°çš„ source-faithful batch title plannerï¼Œè¾“å…¥ conceptFolderPath ä¸Ž completedFolderPathã€‚å¿…é¡»å»ºæ¨¡ç”Ÿæˆ Markdownã€æºæ–‡ä»¶ç§»é™¤/ç§»åŠ¨ã€complete-folder ç›®æ ‡ã€å·²å®Œæˆæ–‡ä»¶æŽ’é™¤å’Œç¡®å®šæ€§çš„è¯å…¸åºç›®æ ‡é¡ºåºã€‚ä¸èƒ½å¤ç”¨è¯­ä¹‰ä¸åŒçš„ planTitlesInFolderã€‚
3. repair-mermaidï¼šå¯¹ mermaidFolderPath è°ƒç”¨æ–°çš„ source-faithful batch Mermaid plannerã€‚å®ƒå¯ä»¥äº§å‡º repaired writeã€æœªè§£å†³æ–‡ä»¶ç§»åˆ° mermaidErrorFolderPathï¼Œä»¥åŠç¡®å®šæ€§çš„ report writeã€‚åœ¨åªè°ƒç”¨ planMermaidRepairsInFolder æ—¶ä¸å¾—å®£ç§° source parityã€‚

æ­¥éª¤å¯è¿”å›žéžç©º atomic plan æˆ–æ˜¾å¼ no-op observationã€‚å…è®¸å†…éƒ¨ no-opï¼Œä½†æœ€ç»ˆå‡€çŠ¶æ€æ²¡æœ‰ mutation æ—¶ï¼Œroot workflow è¿”å›ž composite-no-opã€‚

overlay ä¸å†™æ–‡ä»¶ç³»ç»Ÿï¼š

1. lazy è¯»å– base documentï¼Œä¿ç•™åŽŸ revision/content digestã€‚
2. æ¯ä¸ª step mutation éƒ½ä¸Ž current virtual revision æ ¸å¯¹ï¼Œè€Œä¸æ˜¯åªä¸Ž physical revision æ ¸å¯¹ã€‚
3. æ›´æ–° virtual document mapï¼›Markdown write å¯¹åŽç»­æ­¥éª¤å¯è¯»ï¼Œdelete ä»Ž listMarkdown ç§»é™¤ã€‚
4. ä¸ºæ¯ä¸ª staged mutation é™„åŠ  step lineageã€‚
5. åœ¨ä¸‹ä¸€æ¬¡ LLM è°ƒç”¨å‰å¼ºåˆ¶æ–‡ä»¶æ•°é‡ã€UTF-8 æ€»å­—èŠ‚æ•°å’Œå•æ¬¡ completion input ä¸Šé™ã€‚

finalize ä¸ºæ¯ä¸ª destination è®¡ç®—ä¸€ä¸ªå‡€å˜æ›´ï¼š

- base å­˜åœ¨ã€final æ–‡æœ¬æ”¹å˜ï¼šä»¥ base revision ä¸º expectedRevision çš„ write-textï¼›
- base å­˜åœ¨ã€final ä¸å­˜åœ¨ï¼šå¸¦ base content digest çš„ deleteï¼›
- base ä¸å­˜åœ¨ã€final å­˜åœ¨ï¼šexpected absent çš„ write-textï¼›
- base ä¸Ž final ç›¸åŒï¼šä¸äº§ç”Ÿ mutationï¼›
- media type æˆ– staged asset ä¸å…¼å®¹ï¼šç”¨ typed diagnostic fail closedã€‚

aggregate ä»é€šè¿‡ createWorkspaceMutationPlan ç”Ÿæˆï¼Œå› æ­¤ destination canonical ordering å’Œæ—§ digest è§„åˆ™ç»§ç»­ä½œä¸º authorityã€‚root provenance ä¸º workflow.one-click-extractï¼Œæ¯ä¸ª mutation å¸¦å¯é€‰ composite lineageã€‚

## 7. Approvalã€job ä¸Žå¤±è´¥è¯­ä¹‰

- notemd_plan_one_click_extract åªè¿”å›žä¸€ä¸ª workspaceMutationPlan/v1ã€‚
- notemd_job_start_one_click_extract åªå­˜ idempotency keyã€canonical pathã€workflow id/version ä¸Ž definition digestï¼›ç»ä¸å­˜ credentialã€endpointã€raw Web body æˆ–æ— ç•Œ promptã€‚
- notemd_job_resume/status ç»§ç»­å¤ç”¨å·²æœ‰å…·åç”Ÿå‘½å‘¨æœŸ surfaceã€‚job executor æ³¨å†Œä¸º one-click-extract@1ï¼›æœªçŸ¥ definition digest ä½¿ç”¨ JOB_WORKFLOW_MISMATCH fail closedã€‚
- ä¸€ä¸ª aggregate plan åªç”Ÿæˆä¸€ä»½ approval receiptï¼Œä¸æš´éœ² step-level approvalã€‚
- ç¬¬ä¸€ç‰ˆå›ºå®š fail-fastã€‚æ­¥éª¤å¼‚å¸¸ã€å–æ¶ˆã€virtual revision è¿‡æœŸã€collisionã€budget overflow æˆ–ä¾èµ– unavailable éƒ½è¿”å›ž closed failureï¼Œä¸è¿”å›žå¯å®¡æ‰¹çš„ partial planã€‚
- æºè®¾ç½® continue_on_error ä¸é€šè¿‡ bool æˆ– enum å‚æ•°æ¬è¿ã€‚æœªæ¥ best-effort workflow å¿…é¡»ä½¿ç”¨ä¸åŒçš„å…·å definitionã€receipt å’Œ partial-result contractã€‚

## 8. å‰å‘å…¼å®¹

- WorkspaceMutationPlan.version ä¿æŒ 1ã€‚æ²¡æœ‰ composite lineage çš„æ—§ plan ä¿æŒåŽŸ canonical digestã€‚
- composite lineage å¯é€‰ä¸”ç±»åž‹åŒ–ï¼Œåªå« workflow idã€workflow versionã€definition digestã€step idã€ordinalï¼›prompt å’Œ provider endpoint ä¸è¿›å…¥ digestã€‚
- job workflow key å¸¦ versionï¼Œdurable record ä¿å­˜ definition digestã€‚æ­¥éª¤é¡ºåºæˆ– policy æ”¹å˜åŽï¼Œæ—§ record ä¸èƒ½é™é»˜ resumeã€‚
- CompositeWorkflowPlan.version ä¸º 1ï¼Œåªæ˜¯å†…éƒ¨ planning recordï¼Œä¸æ˜¯ç¬¬äºŒ mutation authorityï¼›åªæœ‰æœ€ç»ˆ WorkspaceMutationPlan è·¨è¿‡ Tool/approval boundaryã€‚
- ä¸ä¿ç•™ä»»æ„ top-level extensionã€‚æœªæ¥ metadata å¿…é¡»æœ‰ç•Œã€JSON-safe ä¸”ç”±ç‰ˆæœ¬åŒ– family validator æ‰€æœ‰ã€‚
- æ–° failure policyã€binary dependency æˆ– user-defined step å¿…é¡»æ–°å¢ž workflow id/version ä¸Ž fixtureï¼Œä¸å¾—æ”¹å˜ one-click-extract@1 è¯­ä¹‰ã€‚

## 9. è¢«æ‹’æ–¹æ¡ˆä¸Žé£Žé™©

| æ–¹æ¡ˆ | æ‹’ç»åŽŸå›  | æ®‹ä½™é£Žé™© |
| --- | --- | --- |
| é€šç”¨ action dispatcher | ä¸¢å¤±å°é—­ contractã€operation owner å’Œå¯å®¡æŸ¥ capability boundary | å…·å definition å¢žåŠ å®žçŽ°å†—é•¿åº¦ã€‚ |
| åŽŸæ ·å¤ç”¨å·²æœ‰ folder planner | è¾“å‡ºä¸åŒ¹é… source title moveã€Mermaid report/error è¡Œä¸º | åœ¨ composite å¯ç”¨å‰éœ€å…ˆæŠ•å…¥ atomic source-faithful plannerã€‚ |
| æ¯ä¸ª step ç«‹å³ apply | äº§ç”Ÿéƒ¨åˆ†å·¥ä½œåŒºçŠ¶æ€å’Œå¤šæ¬¡ approval | aggregate planning éœ€è¦æ›´å¤šå†…å­˜ä¸Ž overlay collision é€»è¾‘ã€‚ |
| å¯¹å¤–æš´éœ² continueOnError | ä¸€ä¸ª flag æ”¹å˜ transaction è¯­ä¹‰ï¼Œapproval è¾¹ç•Œä¸æ¸… | æœªæ¥éœ€å•ç‹¬è®¾è®¡ best-effort definitionã€‚ |
| overlay å†™ä¸´æ—¶ workspace æ–‡ä»¶ | è¿å plan purityï¼Œå¯èƒ½æ³„éœ²æœªå®¡æ‰¹å†…å®¹ | å†…å­˜ overlay å¿…é¡»æœ‰ byte/file budgetã€‚ |
| åœ¨ tools æˆ– jobs ä¸­æ”¾ orchestration | é‡å¤é¢†åŸŸé€»è¾‘ï¼Œéž Tool caller å¾—åˆ°ä¸åŒè¯­ä¹‰ | bundle service ä¿æŒè–„ Cordis adapterã€‚ |
| SVG ä½œä¸ºé€šç”¨ preview | ä¼šè¯¯æŠ¥ PPTX/MP4/Draw.io/Circuitikz fidelity | native capability lane ç»§ç»­ opt-in ä¸”å¦‚å®žè¿”å›žã€‚ |

ä¸»è¦é£Žé™©ï¼š

- LLM è¾“å‡ºå¯èƒ½ä½¿ overlay æ— ç•Œå¢žé•¿ã€‚å¿…é¡»åœ¨ä¸‹ä¸€ step è°ƒç”¨å‰ enforce budgetï¼Œè¶…é™ç›´æŽ¥æ‹’ç»ï¼Œä¸å¾—é™é»˜æˆªæ–­ã€‚
- source folder å·²æœ‰ complete destination æ—¶ï¼Œv1 è¿”å›ž collisionï¼›å¿…é¡»åœ¨è¿ç§»è¯´æ˜Žä¸­è®°å½•ä¸Ž source skip è¡Œä¸ºçš„å·®å¼‚ã€‚
- å½“å‰ source remote-main ç›¸å¯¹åŽ†å² oracle å­˜åœ¨ diagram/normalization æ¼‚ç§»ï¼›ä¸å¾—å€Ÿ composite æŠŠæ¼‚ç§»å·å·çº³å…¥è¿ç§» contractã€‚
- FileJobStore ä»æ˜¯ single-processï¼›composite job ä¸ä¼šè‡ªåŠ¨æé«˜ scheduler ä¿è¯ã€‚

## 10. æž¶æž„é˜¶æ®µå‡ºå£

æœ¬é˜¶æ®µåœ¨ä»¥ä¸‹æ¡ä»¶æ»¡è¶³æ—¶å®Œæˆï¼š

- æœ¬å†³ç­–è®°å½•ä¸Žå¯¹åº”åŒè¯­ implementation plan å‡å·²æäº¤ã€‚
- progress ä¸Ž audit walkthrough å†™å…¥ç²¾ç¡® target/source lockï¼Œå¹¶æ˜Žç¡® runtime implementation å°šæœªå¼€å§‹ã€‚
- è®¡åˆ’åˆ—å‡ºæ¯ä¸ªå®žçŽ°æ–‡ä»¶ã€å…¬å…± interfaceã€focused testã€full gate ä¸Ž release æ¡ä»¶ã€‚
- README é¦–é¡µæ²¡æœ‰è¢«åŠ å…¥ implementation planã€‚
- å·¥ä½œåŒº cleanï¼Œmain ä¸Ž origin/main åŒæ­¥ã€‚

ä¸‹ä¸€é˜¶æ®µå®žçŽ° source-faithful atomic batch planner ä¸Ž virtual overlayã€‚åœ¨ focused conformance fixtureã€aggregate approval testã€clean-profile acceptance å’Œå®Œæ•´ release gate é€šè¿‡å‰ï¼Œä¸å¾—å£°ç§° runtime composite å·²å®Œæˆã€‚\n
