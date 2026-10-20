import { knowledgeBase } from "../data/knowledgeBase.js";
import { focusAskInput, heroContent, impactItems } from "./heroModel.js";
import { ImpactStrip } from "./ImpactStrip.jsx";
import "../styles/hero.css";

/**
 * @param {{ profile?: import("./heroModel.js").HeroProfile, bullets?: import("./heroModel.js").Bullet[] }} props
 */
export function Hero(props) {
  const profile = props.profile ?? knowledgeBase.profile ?? {};
  const bullets = props.bullets ?? knowledgeBase.bullets ?? [];
  const content = heroContent(profile);
  const items = impactItems(bullets);
  const photo = content.photo;
  const srcSet = photo.src && photo.src2x ? `${photo.src} 1x, ${photo.src2x} 2x` : undefined;

  return (
    <section className="hero">
      <div className="reading">
        {photo.src ? (
          <img
            className="hero-photo"
            src={photo.src}
            srcSet={srcSet}
            width={photo.width}
            height={photo.height}
            alt={photo.alt}
            decoding="sync"
            {...{ fetchpriority: "high" }}
          />
        ) : null}
        <h1>
          {content.headline}
          {content.headlineSupport ? <span>{content.headlineSupport}</span> : null}
        </h1>
        {content.lede ? <p className="hero-lede">{content.lede}</p> : null}
        <p className="hero-status">
          {content.title ? (
            <span className="hero-role">
              <b>{content.title}</b>
              {content.employer ? ` at ${content.employer}` : null}
            </span>
          ) : null}
          {content.location ? <span className="hero-location">{content.location}</span> : null}
          {content.availability ? (
            <span className="hero-open">
              <i className="hero-dot" aria-hidden="true" />
              {content.availability}
            </span>
          ) : null}
          {content.workPreferences ? (
            <span className="hero-relocate">{content.workPreferences}</span>
          ) : null}
        </p>
        <div className="hero-ctas">
          <a className="hero-button hero-button-primary" href={content.resumeHref} download>
            Download resume
          </a>
          <a className="hero-button" href="#ask" onClick={focusAskInput}>
            Ask Jay a question
          </a>
          <a className="hero-button" href={content.emailHref}>
            Email me
          </a>
        </div>
        <ImpactStrip items={items} />
      </div>
    </section>
  );
}
