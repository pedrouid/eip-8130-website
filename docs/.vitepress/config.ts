import { defineConfig } from "vitepress";

const SITE_URL = "https://eip8130.io";
const SITE_NAME = "EIP-8130 Keystore Accounts";
const SITE_DESCRIPTION =
  "Native account abstraction for Ethereum without executing wallet code during validation. Declarative authenticator contracts, portable cross-chain accounts, and predictable mempool safety. Research, analysis, and implementation tracking for EIP-8130 Keystore Accounts.";
const OG_IMAGE = `${SITE_URL}/og-image.png`;
const TWITTER_IMAGE = `${SITE_URL}/twitter-card.png`;

export default defineConfig({
  title: SITE_NAME,
  titleTemplate: ":title | EIP-8130",
  description: SITE_DESCRIPTION,
  lang: "en-US",
  cleanUrls: true,
  sitemap: {
    hostname: SITE_URL,
  },
  head: [
    // Favicon and theme color
    ["link", { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32x32.png" }],
    ["link", { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16x16.png" }],
    ["link", { rel: "icon", type: "image/png", href: "/favicon.png" }],
    ["link", { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" }],
    ["meta", { name: "theme-color", content: "#dc2626" }],

    // Standard meta
    ["meta", { name: "author", content: "Pedro Gomes" }],
    [
      "meta",
      {
        name: "keywords",
        content:
          "EIP-8130, Keystore Accounts, Keystore, EIP-8430, Account Configuration, Ethereum, account abstraction, native AA, authenticator, actor, ERC-4337, ERC-4337 alternative, declarative validation, gas sponsorship, payer, cross-chain accounts, canonical authenticator set",
      },
    ],
    ["meta", { name: "robots", content: "index, follow" }],

    // Open Graph
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:site_name", content: SITE_NAME }],
    ["meta", { property: "og:title", content: SITE_NAME }],
    ["meta", { property: "og:description", content: SITE_DESCRIPTION }],
    ["meta", { property: "og:url", content: SITE_URL }],
    ["meta", { property: "og:image", content: OG_IMAGE }],
    ["meta", { property: "og:image:width", content: "1200" }],
    ["meta", { property: "og:image:height", content: "630" }],
    [
      "meta",
      {
        property: "og:image:alt",
        content: "EIP-8130 Account Configuration",
      },
    ],
    ["meta", { property: "og:locale", content: "en_US" }],

    // Twitter Card
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
    ["meta", { name: "twitter:site", content: "@pedrouid" }],
    ["meta", { name: "twitter:creator", content: "@pedrouid" }],
    ["meta", { name: "twitter:title", content: SITE_NAME }],
    ["meta", { name: "twitter:description", content: SITE_DESCRIPTION }],
    ["meta", { name: "twitter:image", content: TWITTER_IMAGE }],
    [
      "meta",
      {
        name: "twitter:image:alt",
        content: "EIP-8130 Account Configuration",
      },
    ],

    // Canonical link injected per-page via transformPageData below
  ],
  transformPageData(pageData) {
    const isHome = pageData.frontmatter.layout === "home";
    const slug = pageData.relativePath
      .replace(/(^|\/)index\.md$/, "")
      .replace(/\.md$/, "");
    const url = slug ? `${SITE_URL}/${slug}` : `${SITE_URL}/`;

    const title = isHome
      ? SITE_NAME
      : pageData.frontmatter.title || pageData.title || SITE_NAME;
    const description =
      pageData.frontmatter.description ||
      pageData.frontmatter.hero?.tagline ||
      SITE_DESCRIPTION;

    pageData.frontmatter.head ??= [];
    pageData.frontmatter.head.push(
      ["link", { rel: "canonical", href: url }],
      ["meta", { property: "og:url", content: url }],
      ["meta", { property: "og:title", content: title }],
      ["meta", { property: "og:description", content: description }],
      ["meta", { name: "twitter:title", content: title }],
      ["meta", { name: "twitter:description", content: description }],
    );
  },
  themeConfig: {
    search: {
      provider: "local",
    },
    nav: [
      { text: "Home", link: "/" },
      {
        text: "Spec",
        items: [
          { text: "Current Spec", link: "/current-spec" },
          { text: "Feedback Evolution", link: "/feedback-evolution" },
          { text: "Original Spec", link: "/original-spec" },
          { text: "Merged Changes", link: "/merged-changes" },
          { text: "Original vs Latest", link: "/original-vs-latest" },
        ],
      },
      {
        text: "Topics",
        items: [
          { text: "Authenticator Model", link: "/authenticator-model" },
          { text: "Cross-Chain Accounts", link: "/cross-chain-accounts" },
          { text: "Mempool Safety", link: "/mempool-safety" },
          { text: "PQ Scheme Agility", link: "/pq-scheme-agility" },
          { text: "Developer Tooling", link: "/developer-tooling" },
          { text: "Competing Standards", link: "/competing-standards" },
        ],
      },
      { text: "FAQ", link: "/faq" },
      { text: "Demo", link: "https://vibes.base.org/" },
    ],
    sidebar: [
      {
        text: "Spec",
        items: [
          { text: "Current Spec", link: "/current-spec" },
          { text: "Feedback Evolution", link: "/feedback-evolution" },
          { text: "Original Spec", link: "/original-spec" },
          { text: "Merged Changes", link: "/merged-changes" },
          { text: "Original vs Latest", link: "/original-vs-latest" },
        ],
      },
      {
        text: "Topics",
        items: [
          { text: "Authenticator Model", link: "/authenticator-model" },
          { text: "Cross-Chain Accounts", link: "/cross-chain-accounts" },
          { text: "Mempool Safety", link: "/mempool-safety" },
          { text: "PQ Scheme Agility", link: "/pq-scheme-agility" },
          { text: "Developer Tooling", link: "/developer-tooling" },
          { text: "Competing Standards", link: "/competing-standards" },
        ],
      },
      {
        text: "Alternatives",
        items: [
          { text: "EIP-8141: Frame Transaction", link: "/eip-8141" },
          { text: "EIP-8175: Composable Transaction", link: "/eip-8175" },
          { text: "EIP-8202: Scheme-Agile Transactions", link: "/eip-8202" },
          { text: "EIP-8223: Contract Payer Transaction", link: "/eip-8223" },
          { text: "EIP-8224: Counterfactual Transaction", link: "/eip-8224" },
          { text: "EIP-XXXX: Tempo-like Transactions", link: "/eip-xxxx" },
        ],
      },
      {
        text: "Resources",
        items: [
          { text: "FAQ", link: "/faq" },
          { text: "Glossary", link: "/glossary" },
          { text: "Appendix", link: "/appendix" },
        ],
      },
    ],
    socialLinks: [
      {
        icon: "github",
        link: "https://github.com/pedrouid/eip-8130-website",
      },
    ],
  },
});
