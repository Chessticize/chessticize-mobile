const React = require('react');
const defaultInsets = { top: 0, right: 0, bottom: 0, left: 0 };
let insets = { ...defaultInsets };

module.exports = {
  __resetSafeAreaInsets() {
    insets = { ...defaultInsets };
  },
  __setSafeAreaInsets(nextInsets) {
    insets = { ...insets, ...nextInsets };
  },
  SafeAreaProvider(props) {
    return React.createElement('SafeAreaProvider', props, props.children);
  },
  useSafeAreaInsets() {
    return insets;
  },
};
