import React from "react";
import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { newScenarios } from "./scenarioRegistry.ts";

function WhatsNewIndex(): React.JSX.Element {
  return (
    <main style={styles.page}>
      <section style={styles.hero}>
        <p style={styles.eyebrow}>INTERACTION LAB</p>
        <h1 style={styles.title}>What&apos;s New</h1>
        <p style={styles.lede}>
          New Scenario Markers collect the pages and states attached to open design issues.
          Open a card on your phone to walk the real React Native UI in full screen.
        </p>
      </section>
      {newScenarios.length === 0 ? (
        <section style={styles.empty}>
          <h2 style={styles.cardTitle}>Baseline is current</h2>
          <p style={styles.cardCopy}>No scenarios are marked new for an open issue.</p>
        </section>
      ) : (
        <section style={styles.grid}>
          {newScenarios.map((scenario) => (
            <article key={scenario.id} style={styles.card}>
              <div style={styles.cardMeta}>
                <span style={styles.badge}>NEW</span>
                <a
                  href={`https://github.com/Chessticize/chessticize-mobile/issues/${scenario.issueNumber}`}
                  rel="noreferrer"
                  style={styles.issueLink}
                  target="_blank"
                >
                  Issue #{scenario.issueNumber}
                </a>
              </div>
              <a
                href={`./iframe.html?id=${scenario.storyId}&viewMode=story`}
                style={styles.storyLink}
              >
                <span style={styles.group}>{scenario.group}</span>
                <strong style={styles.cardTitle}>{scenario.title}</strong>
                <span style={styles.cardCopy}>{scenario.changeNote}</span>
                <span style={styles.open}>Open full-screen scenario →</span>
              </a>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

const meta = {
  title: "00 What's New",
  component: WhatsNewIndex
} satisfies Meta<typeof WhatsNewIndex>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {};

const styles: Record<string, React.CSSProperties> = {
  page: {
    background: "#F8FAFC",
    boxSizing: "border-box",
    color: "#0F172A",
    minHeight: "100vh",
    padding: "clamp(24px, 6vw, 72px)"
  },
  hero: {
    maxWidth: 760
  },
  eyebrow: {
    color: "#2563EB",
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 1.6,
    margin: 0
  },
  title: {
    fontSize: "clamp(38px, 8vw, 72px)",
    letterSpacing: -2,
    lineHeight: 1,
    margin: "14px 0 18px"
  },
  lede: {
    color: "#475569",
    fontSize: 18,
    lineHeight: 1.6,
    margin: 0
  },
  empty: {
    background: "#FFFFFF",
    border: "1px solid #CBD5E1",
    borderRadius: 16,
    marginTop: 36,
    maxWidth: 620,
    padding: 24
  },
  grid: {
    display: "grid",
    gap: 16,
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    marginTop: 36
  },
  card: {
    background: "#FFFFFF",
    border: "1px solid #CBD5E1",
    borderRadius: 16,
    padding: 20
  },
  cardMeta: {
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 10
  },
  badge: {
    alignSelf: "flex-start",
    background: "#DBEAFE",
    borderRadius: 999,
    color: "#1D4ED8",
    fontSize: 10,
    fontWeight: 900,
    letterSpacing: 1,
    padding: "5px 8px"
  },
  issueLink: {
    color: "#2563EB",
    fontSize: 12,
    fontWeight: 800,
    textDecoration: "none"
  },
  storyLink: {
    color: "inherit",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    textDecoration: "none"
  },
  group: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: 700
  },
  cardTitle: {
    fontSize: 20,
    margin: 0
  },
  cardCopy: {
    color: "#475569",
    lineHeight: 1.5
  },
  open: {
    color: "#2563EB",
    fontSize: 13,
    fontWeight: 800,
    marginTop: 8
  }
};
