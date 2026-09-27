const babelConfig = require("./babel.config");

module.exports = {
  plugins: {
    "@stylexjs/postcss-plugin": {
      include: ["src/**/*.{js,jsx,ts,tsx}"],
      babelConfig: {
        babelrc: false,
        parserOpts: {
          plugins: ["typescript", "jsx"],
        },
        plugins: babelConfig.plugins,
      },
      useCSSLayers: {
        // Astryx's dist CSS ships its own layers; declaring them before the
        // StyleX app layers means product-level styles always win over
        // component defaults, without !important or extra specificity.
        before: ["reset", "astryx-base", "astryx-theme"],
      },
    },
    autoprefixer: {},
  },
};
