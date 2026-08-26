import accentureLogo from "../assets/accenture-logo.svg";
import bracketbotLogo from "../assets/bracketbot-logo.svg";
import cognitionLogo from "../assets/cognition-logo.svg";
import shopifyLogo from "../assets/shopify-logo.svg";
import steelLogo from "../assets/steel-logo.svg";

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
 * Toralis Labs is a confirmed sponsor but has no usable asset yet — add an
 * entry here once we have one and it appears on the wall automatically.
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
];

export default sponsors;
