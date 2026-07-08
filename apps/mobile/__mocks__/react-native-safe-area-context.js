const React = require('react');

module.exports = {
  SafeAreaProvider(props) {
    return React.createElement('SafeAreaProvider', props, props.children);
  },
  useSafeAreaInsets() {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  },
};
