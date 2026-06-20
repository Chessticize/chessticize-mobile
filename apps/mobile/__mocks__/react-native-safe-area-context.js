const React = require('react');

module.exports = {
  SafeAreaProvider(props) {
    return React.createElement('SafeAreaProvider', props, props.children);
  },
};
