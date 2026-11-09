import type { AgentProfile } from "./agent";

/** Props the app shell passes to each feature's root component. */

export type ClassroomTarget = "teacher" | "study_spot";

export interface ClassroomProps {
  /** null when entered before an agent exists. Show the explicit dev asset then. */
  agent: AgentProfile | null;
  /** While true: no movement, and held keys or pointers are released. */
  movementLocked: boolean;
  onProximityChange: (target: ClassroomTarget | null) => void;
  onInteract: (target: ClassroomTarget) => void;
}

export interface OnboardingFlowProps {
  agent: AgentProfile | null;
  /** Call with the profile the server returned from api.agents.save. */
  onComplete: (agent: AgentProfile) => void;
}

export interface TeacherPanelProps {
  agent: AgentProfile | null;
  onClose: () => void;
  onOpenLearning: () => void;
}

export interface LearningPanelProps {
  agent: AgentProfile | null;
  onClose: () => void;
}
