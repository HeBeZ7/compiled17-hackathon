"use client";

import Link from "next/link";
import { useId, useState } from "react";
import type { AgentProfile, ClassroomTarget } from "@/shared/contracts";
import type { GraphicsQuality } from "@/shared/world/quality";
import type { AvatarFrameStatus } from "./AvatarFrame";
import styles from "./Classroom.module.css";

const QUALITY_OPTIONS: { value: GraphicsQuality; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

export const TARGET_LABEL: Record<ClassroomTarget, string> = {
  teacher: "[E] Talk to your teacher",
  study_spot: "[E] Open learning station",
};

function AvatarImage({ agent, className }: { agent: AgentProfile | null; className: string }) {
  if (agent?.avatar) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- the user's own image, served as-is by our API
      <img className={className} src={agent.avatar.renderUrl} alt={`${agent.name} avatar`} />
    );
  }
  return (
    <span className={`${className} ${styles.avatarEmpty}`} aria-hidden="true">
      {agent ? agent.name.slice(0, 1).toUpperCase() : "?"}
    </span>
  );
}

export function MyAgentPill({ agent }: { agent: AgentProfile | null }) {
  return (
    <div className={styles.agentPill} data-testid="classroom-my-agent">
      <AvatarImage agent={agent} className={styles.agentPillImage} />
      <p className={styles.agentPillText}>
        <span className={styles.agentPillLabel}>My agent</span>
        <span className={styles.agentPillName}>{agent ? agent.name : "Not created yet"}</span>
      </p>
    </div>
  );
}

function frameCaption(agent: AgentProfile | null, frameStatus: AvatarFrameStatus): string | null {
  if (!agent?.avatar) return null;
  if (frameStatus === "failed") return "The framed picture of your avatar could not be loaded";
  return "A framed picture of your avatar sits on your desk";
}

function CharacterCard({
  agent,
  frameStatus,
  id,
}: {
  agent: AgentProfile | null;
  frameStatus: AvatarFrameStatus;
  id: string;
}) {
  const caption = frameCaption(agent, frameStatus);
  return (
    <section id={id} className={styles.card} aria-label="My character" data-testid="classroom-character-card">
      {agent ? (
        <>
          <AvatarImage agent={agent} className={styles.cardImage} />
          <h2 className={styles.cardName}>{agent.name}</h2>
          <p className={styles.cardModel} data-testid="classroom-character-model">
            {agent.selectedModel ? agent.selectedModel.modelId : "No model selected"}
          </p>
          {caption && (
            <p className={styles.cardCaption} data-testid="classroom-character-caption">
              {caption}
            </p>
          )}
        </>
      ) : (
        <>
          <p className={styles.cardName}>No agent yet</p>
          <Link className={styles.cardLink} href="/create">
            Create your agent
          </Link>
        </>
      )}
    </section>
  );
}

export function Hud({
  agent,
  ready,
  touchOnly,
  movementLocked,
  pointerLocked,
  lookFailed,
  target,
  quality,
  frameStatus,
  onRequestLook,
  onInteract,
  onQualityChange,
}: {
  agent: AgentProfile | null;
  ready: boolean;
  touchOnly: boolean;
  movementLocked: boolean;
  pointerLocked: boolean;
  lookFailed: boolean;
  target: ClassroomTarget | null;
  quality: GraphicsQuality;
  frameStatus: AvatarFrameStatus;
  onRequestLook: () => void;
  onInteract: () => void;
  onQualityChange: (quality: GraphicsQuality) => void;
}) {
  const [cardOpen, setCardOpen] = useState(false);
  const cardId = useId();
  const showLookPrompt = ready && !touchOnly && !pointerLocked && !movementLocked;
  const showReticle = ready && !movementLocked && (touchOnly || pointerLocked);
  const interactLabel = ready && !movementLocked && target ? TARGET_LABEL[target] : null;

  return (
    <>
      <div className={styles.topLeft}>
        <MyAgentPill agent={agent} />
      </div>

      <div className={styles.topRight}>
        <p className={styles.roomPill}>Classroom 01</p>
        <div className={styles.quality} role="group" aria-label="Graphics quality" data-testid="classroom-quality">
          {QUALITY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={styles.qualityButton}
              aria-pressed={quality === option.value}
              onClick={() => onQualityChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {showReticle && <span className={styles.reticle} data-aimed={target !== null} aria-hidden="true" />}

      {showLookPrompt && (
        <div className={styles.lookPrompt}>
          <button type="button" className={styles.lookButton} data-testid="classroom-look-prompt" onClick={onRequestLook}>
            Click to look around
          </button>
          {lookFailed && (
            <p className={styles.lookError} role="alert">
              Mouse look could not start, click to try again or drag the view
            </p>
          )}
        </div>
      )}

      <div className={styles.interactSlot} aria-live="polite">
        {interactLabel && (
          <button type="button" className={styles.interact} data-testid="classroom-interact" onClick={onInteract}>
            {interactLabel}
          </button>
        )}
      </div>

      {!touchOnly && (
        <p className={styles.hint} data-testid="classroom-hint">
          WASD Move · Mouse Look · Esc Menu
        </p>
      )}

      <div
        className={styles.characterSlot}
        onKeyDown={(event) => {
          if (event.key === "Escape") setCardOpen(false);
        }}
      >
        {cardOpen && <CharacterCard agent={agent} frameStatus={frameStatus} id={cardId} />}
        <button
          type="button"
          className={styles.characterButton}
          aria-expanded={cardOpen}
          aria-controls={cardOpen ? cardId : undefined}
          data-testid="classroom-character-toggle"
          onClick={() => setCardOpen((open) => !open)}
        >
          My character
        </button>
      </div>
    </>
  );
}
