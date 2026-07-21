import manifest from "../preview-manifest.json";

const githubRepo = "https://github.com/Chessticize/chessticize-mobile";

export default function Home() {
  return (
    <main>
      <header className="hero">
        <div className="hero__copy">
          <p className="eyebrow">CHESSTICIZE · FEEDBACK DESIGN LAB</p>
          <h1>Review the interaction before we wire the product.</h1>
          <p className="hero__summary">
            Four Storybook-only design slices turn nine pieces of user feedback
            into concrete, comparable decisions. Every preview is pinned to the
            exact reviewed commit and remains separate from production behavior.
          </p>
        </div>
        <aside className="review-note" aria-label="Design review status">
          <span className="status-dot" aria-hidden="true" />
          <div>
            <strong>Design review open</strong>
            <span>No product wiring has started</span>
          </div>
        </aside>
      </header>

      <section className="principles" aria-label="Preview principles">
        <div>
          <span>01</span>
          <p>Choose a direction or combine the strongest parts.</p>
        </div>
        <div>
          <span>02</span>
          <p>Use deterministic states to review edge cases.</p>
        </div>
        <div>
          <span>03</span>
          <p>Approve explicitly before implementation begins.</p>
        </div>
      </section>

      <section className="preview-grid" aria-label="Storybook design previews">
        {manifest.previews.map((preview, index) => {
          const previewHref = `/previews/${preview.id}/${preview.storyPath}`;
          return (
            <article className={`preview-card preview-card--${index + 1}`} key={preview.id}>
              <div className="preview-card__header">
                <span className="preview-number">0{index + 1}</span>
                <span className="preview-state">Storybook only</span>
              </div>
              <div className="preview-card__body">
                <p className="preview-kicker">{preview.area}</p>
                <h2>{preview.title}</h2>
                <p>{preview.summary}</p>
                <ul className="variant-list" aria-label={`${preview.title} variants`}>
                  {preview.variants.map((variant) => (
                    <li key={variant}>{variant}</li>
                  ))}
                </ul>
              </div>
              <div className="preview-card__footer">
                <div className="issue-links" aria-label="Covered GitHub issues">
                  {preview.issues.map((issue) => (
                    <a href={`${githubRepo}/issues/${issue}`} key={issue}>
                      #{issue}
                    </a>
                  ))}
                </div>
                <a className="preview-link" href={previewHref}>
                  Open preview <span aria-hidden="true">↗</span>
                </a>
              </div>
            </article>
          );
        })}
      </section>

      <footer>
        <p>
          These previews document presentation and interaction intent. Native
          latency, gestures, audio, haptics, storage, and device behavior still
          require their own implementation and validation.
        </p>
        <a href={githubRepo}>View the repository</a>
      </footer>
    </main>
  );
}
