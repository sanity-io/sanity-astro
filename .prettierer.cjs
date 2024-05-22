const preset = require("@sanity/prettier-config");

/** @type {import("prettier").Config} */
const config = {
  ...preset,
  plugins: [...preset.plugins, "prettier-plugin-astro"],
};

module.exports = config;
