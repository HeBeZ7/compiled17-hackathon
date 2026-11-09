import type { ModelCapabilities } from "@/shared/contracts";
import { StatusBadge } from "@/shared/ui";
import { CAPABILITY_ROWS, EVIDENCE_LABEL, claimView, formatDateTime } from "./presentation";
import styles from "./ModelPicker.module.css";

/** Each stage is shown on its own: being listed never implies being trainable. */
export function CapabilityList({ capabilities }: { capabilities: ModelCapabilities }) {
  return (
    <>
      <dl className={styles.capabilities}>
        {CAPABILITY_ROWS.map(({ key, label }) => {
          const view = claimView(capabilities[key]);
          return (
            <div key={key} className={styles.capability} data-capability={key} data-support={capabilities[key].support}>
              <dt>{label}</dt>
              <dd>
                <StatusBadge tone={view.tone}>{view.label}</StatusBadge>
              </dd>
            </div>
          );
        })}
      </dl>
      <details className={styles.details}>
        <summary>Show support evidence</summary>
        <ul className={styles.evidenceList}>
          {CAPABILITY_ROWS.map(({ key, label }) => {
            const evidence = capabilities[key].evidence;
            return (
              <li key={key}>
                <strong>{label}</strong>{" "}
                {evidence ? (
                  <>
                    {EVIDENCE_LABEL[evidence.level]}
                    {evidence.checkedAt && ` · checked ${formatDateTime(evidence.checkedAt)}`}
                    {evidence.note && ` · ${evidence.note}`}
                    {evidence.sourceUrl && (
                      <>
                        {" · "}
                        <a href={evidence.sourceUrl} target="_blank" rel="noreferrer">
                          Source
                        </a>
                      </>
                    )}
                  </>
                ) : (
                  "No evidence"
                )}
              </li>
            );
          })}
        </ul>
      </details>
    </>
  );
}
