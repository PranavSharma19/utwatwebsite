import accentureLogo from "../assets/accenture-logo.svg";
import bracketbotLogo from "../assets/bracketbot-logo.svg";
import cognitionLogo from "../assets/cognition-logo.svg";
import shopifyLogo from "../assets/shopify-logo.svg";
import steelLogo from "../assets/steel-logo.svg";
import toralisLogo from "../assets/toralis-logo.png";

/**
 * Single source of truth for the sponsor wall.
 *
 * The wall is flat, so ordering carries no ranking — it is a running order,
 * not a hierarchy. It was alphabetical until Accenture and Shopify were
 * swapped by request.
 *
 * `logoScale` is an optical correction, not a size. Every mark is rendered at
 * the same cap height, but a wide wordmark (Accenture) and a compact one
 * (BracketBot) read as mismatched at identical heights, so each is nudged to
 * sit right against the others.
 *
 * Toralis Labs is the one mark-only logo here — every other sponsor supplies a
 * wordmark, so their name reads off the wall and Toralis's does not. Worth
 * asking them for the full lockup. The supplied file was an opaque webp with a
 * baked #FBFBFB background and wide margins; it has been keyed to transparency
 * and cropped so it sits at the same optical weight as the wordmarks.
 */
export const sponsors = [
  {
    name: "Shopify",
    logo: shopifyLogo,
    url: "https://www.shopify.com",
    logoScale: 0.92,
  },
  {
    name: "BracketBot",
    logo: bracketbotLogo,
    url: "https://www.bracketbot.com",
    logoScale: 0.78,
  },
  {
    name: "Cognition",
    logo: cognitionLogo,
    url: "https://cognition.ai",
    logoScale: 1,
  },
  {
    name: "Accenture",
    logo: accentureLogo,
    url: "https://www.accenture.com",
    logoScale: 1,
  },
  {
    name: "Steel",
    logo: steelLogo,
    url: "https://steel.dev",
    logoScale: 0.92,
  },
  {
    name: "Toralis Labs",
    logo: toralisLogo,
    url: "https://toralislabs.com",
    // A compact 1.31:1 mark against wordmarks running 3.3:1 and wider. Matching
    // their heights would leave it looking undersized, so it runs taller.
    logoScale: 1.25,
  },
];

export default sponsors;
