const React = require('react');

function component(name) {
  return function MockComponent(props) {
    return React.createElement(name, props, props.children);
  };
}

module.exports = {
  Pressable: component('Pressable'),
  SafeAreaView: component('SafeAreaView'),
  ScrollView: component('ScrollView'),
  StatusBar: component('StatusBar'),
  Text: component('Text'),
  View: component('View'),
  StyleSheet: {
    create(styles) {
      return styles;
    },
  },
};
