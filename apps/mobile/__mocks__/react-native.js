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
  TouchableOpacity: component('TouchableOpacity'),
  Image: component('Image'),
  Modal: component('Modal'),
  View: component('View'),
  useWindowDimensions() {
    return { width: 390, height: 844, scale: 3, fontScale: 3 };
  },
  StyleSheet: {
    absoluteFillObject: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },
    hairlineWidth: 1,
    create(styles) {
      return styles;
    },
  },
};
