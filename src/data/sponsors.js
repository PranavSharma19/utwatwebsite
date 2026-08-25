import accentureLogo from "../assets/accenture-logo.svg";
import bracketbotLogo from "../assets/bracketbot-logo.svg";
import cognitionLogo from "../assets/cognition-logo.svg";
import shopifyLogo from "../assets/shopify-logo.svg";
import steelLogo from "../assets/steel-logo.svg";

/**
 * Single source of truth for the sponsor wall.
 *
 * Listed alphabetically on purpose: the wall is flat, so ordering carries no
 * ranking. Keep it that way unless we deliberately move to tiers.
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
    name: "Accenture",
    logo: accentureLogo,
    url: "https://www.accenture.com",
    logoScale: 1,
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
    name: "Shopify",
    logo: shopifyLogo,
    url: "https://www.shopify.com",
    logoScale: 0.92,
  },
  {
    name: "Steel",
    logo: steelLogo,
    url: "https://steel.dev",
    logoScale: 0.92,
  },
];

export default sponsors;
