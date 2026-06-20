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
  useWindowDimensions() {
    return { width: 390, height: 844, scale: 3, fontScale: 3 };
  },
  StyleSheet: {
    hairlineWidth: 1,
    create(styles) {
      return styles;
    },
  },
};
