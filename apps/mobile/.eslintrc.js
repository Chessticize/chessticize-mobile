module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    // `void promise` intentionally documents fire-and-forget async work.
    'no-void': 'off',
    // Local callback and test-fixture names often mirror domain names without ambiguity.
    '@typescript-eslint/no-shadow': 'off',
    // Layout and theme values are frequently calculated at render time in React Native.
    'react-native/no-inline-styles': 'off',
  },
  overrides: [
    {
      // Components read colors from the theme (src/theme), never from literals.
      files: ['src/components/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector: "Literal[value=/^#[0-9a-fA-F]{3,8}$/], Literal[value=/^rgba?\\(/], TemplateElement[value.raw=/#[0-9a-fA-F]{6}|rgba?\\(/]",
            message: 'Use a theme color token (useTheme or makeStyles) instead of a hex or rgba literal.',
          },
        ],
      },
    },
    {
      files: ['scripts/**/*.js'],
      env: {
        node: true,
      },
    },
    {
      files: ['scripts/android-launcher-icons.js'],
      rules: {
        // PNG scanline decoding and CRC32 intentionally use byte-level operations.
        'no-bitwise': 'off',
      },
    },
    {
      files: ['__tests__/**/*.{js,jsx,ts,tsx}', 'jest.setup.js'],
      env: {
        jest: true,
        node: true,
      },
    },
    {
      files: ['e2e/**/*.js'],
      env: {
        jest: true,
        node: true,
      },
      globals: {
        by: 'readonly',
        device: 'readonly',
        element: 'readonly',
        waitFor: 'readonly',
      },
    },
  ],
};
