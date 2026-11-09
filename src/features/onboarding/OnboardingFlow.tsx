"use client";

import { useEffect, useRef, useState } from "react";
import { AvatarEditor, AvatarPreview, useAvatarDraft } from "@/features/avatar";
import { ModelPicker, SelectedModelSummary, type SelectionCheck } from "@/features/model-picker";
import { api } from "@/shared/api";
import { isSameModel, type ApiError, type ModelReference, type OnboardingFlowProps } from "@/shared/contracts";
import { useAppStore } from "@/shared/state/appStore";
import { Button, ButtonLink, ConnectionNotice, Panel } from "@/shared/ui";
import { saveAgentProfile, type ProfileClient, type StoredUpload } from "./saveAgentProfile";
import styles from "./OnboardingFlow.module.css";

const NAME_MAX = 40;

const STEPS = [
  { id: "model", label: "모델 고르기" },
  { id: "character", label: "이름과 외형" },
] as const;
type StepId = (typeof STEPS)[number]["id"];

const CLIENT: ProfileClient = { uploadAvatar: api.avatars.upload, saveAgent: api.agents.save };

export function OnboardingFlow({ agent, onComplete }: OnboardingFlowProps) {
  // The fields start from the profile the flow mounted with. CreateScreen remounts it after a reload.
  const [savedAgent] = useState(agent);
  const savedModel = savedAgent?.selectedModel ?? null;

  const [step, setStep] = useState<StepId>("model");
  const [model, setModel] = useState<ModelReference | null>(savedModel);
  const [savedModelCheck, setSavedModelCheck] = useState<SelectionCheck>(savedModel ? "checking" : "not_saved");
  const [name, setName] = useState(savedAgent?.name ?? "");
  const [nameTouched, setNameTouched] = useState(false);
  const avatar = useAvatarDraft(savedAgent?.avatar ?? null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<ApiError | null>(null);
  const [conflict, setConflict] = useState(false);
  const expectedVersion = useRef(savedAgent?.version ?? null);
  const storedUpload = useRef<StoredUpload | null>(null);
  const saveController = useRef<AbortController | null>(null);
  const headingRefs = useRef<Partial<Record<StepId, HTMLHeadingElement | null>>>({});

  useEffect(() => () => saveController.current?.abort(), []);

  useEffect(() => {
    if (!savedModel) return;
    const controller = new AbortController();
    const { source, modelId, revision } = savedModel;
    void api.catalog.lookup({ source, modelId, revision: revision ?? undefined }, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      const fresh = result.ok && isSameModel(result.data.ref, savedModel) ? result.data.ref : null;
      setSavedModelCheck(fresh ? "current" : "saved_snapshot");
      // Only refreshes the facts of the same model: the user's newer choice is left alone.
      if (fresh) setModel((current) => (current && isSameModel(current, fresh) ? fresh : current));
    });
    return () => controller.abort();
  }, [savedModel]);

  const goTo = (next: StepId) => {
    setStep(next);
    window.scrollTo({ top: 0 });
    requestAnimationFrame(() => headingRefs.current[next]?.focus());
  };

  const trimmedName = name.trim();
  const nameMissing = trimmedName.length === 0;
  const selection = avatar.selection;
  const avatarReady = selection.status === "saved" || selection.status === "draft";
  const modelChanged = savedModel !== null && (model === null || !isSameModel(savedModel, model));
  const shownCheck: SelectionCheck = model && savedModel && isSameModel(model, savedModel) ? savedModelCheck : "not_saved";

  const save = async () => {
    setNameTouched(true);
    if (nameMissing || !avatarReady) return;
    saveController.current?.abort();
    const controller = new AbortController();
    saveController.current = controller;
    setSaving(true);
    setSaveError(null);
    setConflict(false);
    const outcome = await saveAgentProfile(
      {
        name: trimmedName,
        model,
        selection,
        expectedVersion: expectedVersion.current,
        storedUpload: storedUpload.current,
      },
      CLIENT,
      controller.signal,
    );
    if (controller.signal.aborted) return;
    storedUpload.current = outcome.storedUpload;
    if (outcome.result.ok) {
      // Stays in the saving state: the page is about to change, and a second click would conflict.
      expectedVersion.current = outcome.result.data.version;
      onComplete(outcome.result.data);
      return;
    }
    setSaving(false);
    setSaveError(outcome.result.error);
    setConflict(outcome.result.error.code === "CONFLICT");
  };

  const overwriteConflict = async () => {
    setSaving(true);
    const latest = await api.agents.current();
    if (!latest.ok) {
      setSaving(false);
      setSaveError(latest.error);
      return;
    }
    expectedVersion.current = latest.data.agent?.version ?? null;
    await save();
  };

  const stepIndex = STEPS.findIndex((candidate) => candidate.id === step);

  return (
    <div className={styles.flow}>
      <Panel className={styles.head}>
        <h1>에이전트 만들기</h1>
        <ol className={styles.stepper} aria-label="만들기 단계">
          {STEPS.map((candidate, index) => (
            <li
              key={candidate.id}
              data-state={index === stepIndex ? "current" : index < stepIndex ? "done" : "todo"}
              aria-current={index === stepIndex ? "step" : undefined}
            >
              <span aria-hidden="true">{index + 1}</span>
              {candidate.label}
            </li>
          ))}
        </ol>
        <ButtonLink href="/classroom" variant="ghost">
          {savedAgent ? `저장된 ${savedAgent.name}(으)로 교실 가기` : "에이전트 없이 교실 보기"}
        </ButtonLink>
      </Panel>

      <section className={styles.step} hidden={step !== "model"} aria-labelledby="onboarding-model-title">
        <h2
          id="onboarding-model-title"
          tabIndex={-1}
          ref={(element) => {
            headingRefs.current.model = element;
          }}
        >
          어떤 모델을 내 에이전트로 데려올까요?
        </h2>

        {model && <SelectedModelSummary model={model} check={shownCheck} onClear={() => setModel(null)} />}
        {modelChanged && (
          <p className={styles.warning} role="status">
            모델을 바꾸면 이전 모델로 학습한 결과는 새 모델에 그대로 이어지지 않습니다.
          </p>
        )}

        <ModelPicker selected={model} onSelect={setModel} />

        <div className={styles.actions}>
          <Button onClick={() => goTo("character")}>{model ? "다음: 이름과 외형" : "모델 없이 다음으로"}</Button>
        </div>
      </section>

      <section className={styles.step} hidden={step !== "character"} aria-labelledby="onboarding-character-title">
        <h2
          id="onboarding-character-title"
          tabIndex={-1}
          ref={(element) => {
            headingRefs.current.character = element;
          }}
        >
          내 캐릭터를 만들어 볼까요?
        </h2>

        <div className={styles.characterLayout}>
          <Panel className={styles.characterForm}>
            <label className={styles.nameField}>
              이름
              <input
                type="text"
                data-testid="agent-name"
                value={name}
                maxLength={NAME_MAX}
                required
                autoComplete="off"
                placeholder="에이전트의 이름"
                aria-invalid={nameTouched && nameMissing}
                onChange={(event) => setName(event.target.value)}
                onBlur={() => setNameTouched(true)}
              />
            </label>
            {nameTouched && nameMissing && (
              <p className={styles.fieldProblem} role="alert">
                이름을 입력해 주세요.
              </p>
            )}
            <AvatarEditor controller={avatar} />
          </Panel>

          <aside className={styles.summary}>
            <Panel className={styles.summaryPanel}>
              <AvatarPreview selection={selection} name={name} />
              <p className={styles.summaryModel} data-testid="summary-model">
                {model ? model.modelId : "모델 미선택"}
              </p>
            </Panel>
          </aside>
        </div>

        {saveError && (
          <div className={styles.saveError}>
            <ConnectionNotice error={saveError} onRetry={conflict ? undefined : () => void save()} />
            {conflict && (
              <div className={styles.conflictActions}>
                <Button variant="secondary" disabled={saving} onClick={() => void useAppStore.getState().loadAgent()}>
                  저장된 최신 내용 불러오기
                </Button>
                <Button variant="ghost" disabled={saving} onClick={() => void overwriteConflict()}>
                  지금 화면의 내용으로 덮어쓰기
                </Button>
              </div>
            )}
          </div>
        )}

        <div className={styles.actions}>
          <Button variant="ghost" onClick={() => goTo("model")}>
            모델 다시 고르기
          </Button>
          <Button data-testid="onboarding-confirm" disabled={saving || !avatarReady} onClick={() => void save()}>
            {saving ? "저장하는 중" : "이 모습으로 교실 입장"}
          </Button>
        </div>
        {!avatarReady && !saving && <p className={styles.hint}>그림을 그리거나 사진을 넣으면 입장할 수 있어요.</p>}
      </section>
    </div>
  );
}
