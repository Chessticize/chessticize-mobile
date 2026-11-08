const React = require('react');
const defaultInsets = { top: 0, right: 0, bottom: 0, left: 0 };
let insets = { ...defaultInsets };
// Nested providers (for example the native tab host fake) override the
// global insets for their subtree, as the real library does.
const SafeAreaInsetsContext = React.createContext(null);

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
  SafeAreaInsetsContext,
  useSafeAreaInsets() {
    return React.useContext(SafeAreaInsetsContext) ?? insets;
  },
};
