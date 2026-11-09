import { AppHeader, ButtonLink, Panel } from "@/shared/ui";
import { ClassroomIllustration } from "./ClassroomIllustration";
import styles from "./page.module.css";

const STEPS = [
  { title: "모델 고르기", body: "공개된 오픈모델을 찾아보고, 어떤 작업까지 지원이 확인됐는지 함께 봅니다." },
  { title: "내 캐릭터 만들기", body: "이름을 짓고, 직접 그리거나 사진을 올려 외형을 정합니다." },
  { title: "교실에서 상담하기", body: "캐릭터를 움직여 선생님에게 가서 원하는 수업을 자유롭게 설명합니다." },
  { title: "학습 맡기기", body: "가격과 조건을 확인한 뒤 GPU 학습을 요청하고 실제 진행 상태를 봅니다." },
];

export default function IntroPage() {
  return (
    <>
      <AppHeader current="intro" />
      <main className={styles.main}>
        <section className={styles.hero}>
          <div className={styles.copy}>
            <h1>내가 고른 모델을, 내 학교에서 가르쳐요</h1>
            <p className={styles.lead}>
              Agent Academy는 오픈모델을 내 캐릭터와 연결하고, 작은 교실에서 선생님과 상담해 나에게 맞는
              에이전트로 키워 가는 곳입니다.
            </p>
            <ButtonLink href="/create" className={styles.cta}>
              학교에 입장하기
            </ButtonLink>
            <p className={styles.note}>아직 연결되지 않은 기능은 화면에 ‘연결 필요’로 표시합니다.</p>
          </div>
          <ClassroomIllustration className={styles.illustration} />
        </section>

        <ol className={styles.steps}>
          {STEPS.map((step, index) => (
            <li key={step.title}>
              <Panel className={styles.step}>
                <span className={styles.stepNumber} aria-hidden="true">
                  {index + 1}
                </span>
                <h2>{step.title}</h2>
                <p>{step.body}</p>
              </Panel>
            </li>
          ))}
        </ol>
      </main>
    </>
  );
}
