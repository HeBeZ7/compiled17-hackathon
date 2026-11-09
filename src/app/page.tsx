import Link from "next/link";
import { LandingStage } from "./landing/LandingStage";
import styles from "./page.module.css";

const STEPS = ["Choose a model", "Create your character", "Enter the classroom"];

function CapMark() {
  return (
    <svg viewBox="0 0 40 32" width="40" height="32" aria-hidden="true">
      <path d="M20 3 38 11 20 19 2 11Z" fill="#9C84D8" />
      <path d="M9 16v7c0 3 5 6 11 6s11-3 11-6v-7l-11 5Z" fill="#5A3FA8" />
      <path d="M36 12v9" stroke="#E2524A" strokeWidth="2" strokeLinecap="round" />
      <circle cx="36" cy="23" r="2.4" fill="#E2524A" />
    </svg>
  );
}

export default function LandingPage() {
  return (
    <div className={styles.page}>
      <LandingStage />
      <header className={styles.header}>
        <Link href="/" className={styles.wordmark}>
          <CapMark />
          Agent Academy
        </Link>
        <nav className={styles.nav} aria-label="Main">
          <a href="#academy">The Academy</a>
          <Link href="/create">Explore Models</Link>
        </nav>
        <Link href="/create" className={styles.enter}>
          Enter Academy
        </Link>
      </header>

      <main className={styles.main}>
        <section className={styles.hero} aria-labelledby="landing-title">
          <h1 id="landing-title" className={styles.title}>
            Your model
            <br />
            Your character
            <br />
            Your kind of AI
          </h1>
          <p className={styles.lead}>Choose a model, make it yours, and grow together</p>
          <div className={styles.actions}>
            <Link href="/create" className={styles.cta}>
              Meet your agent
              <span aria-hidden="true"> →</span>
            </Link>
            <Link href="/classroom" className={styles.secondary}>
              Explore the classroom
            </Link>
          </div>
        </section>

        <ol className={styles.steps} aria-label="How it works">
          {STEPS.map((step, index) => (
            <li key={step}>
              <span className={styles.stepNumber} aria-hidden="true">
                {index + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </main>

      <section id="academy" className={styles.about} aria-labelledby="about-title">
        <h2 id="about-title">The Academy</h2>
        <div className={styles.aboutGrid}>
          <article>
            <h3>Pick from real open models</h3>
            <p>Browse the live catalog and see which stages each model has been confirmed for</p>
          </article>
          <article>
            <h3>Make it look like yours</h3>
            <p>Draw your character or add a photo and it stays with your agent</p>
          </article>
          <article>
            <h3>Walk in and talk it through</h3>
            <p>Step into the classroom, reach the teacher, and describe what you want to teach</p>
          </article>
        </div>
        <p className={styles.honest}>Services that are not connected yet are labeled clearly in the app</p>
      </section>
    </div>
  );
}
