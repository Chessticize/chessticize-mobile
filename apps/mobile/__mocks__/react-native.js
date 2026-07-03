const React = require('react');
const appStateListeners = new Set();

function component(name) {
  return function MockComponent(props) {
    return React.createElement(name, props, props.children);
  };
}

module.exports = {
  NativeModules: {},
  AppState: {
    addEventListener(eventName, listener) {
      if (eventName !== 'change') {
        return {
          remove() {}
        };
      }
      appStateListeners.add(listener);
      return {
        remove() {
          appStateListeners.delete(listener);
        }
      };
    },
    __emit(nextState) {
      for (const listener of Array.from(appStateListeners)) {
        listener(nextState);
      }
    },
    __reset() {
      appStateListeners.clear();
    }
  },
  NativeEventEmitter: class NativeEventEmitter {
    constructor(nativeModule) {
      this.nativeModule = nativeModule;
    }

    addListener(eventName, listener) {
      if (this.nativeModule && typeof this.nativeModule.__addListener === 'function') {
        return this.nativeModule.__addListener(eventName, listener);
      }
      return {
        remove() {}
      };
    }
  },
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
