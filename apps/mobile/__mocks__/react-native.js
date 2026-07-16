const React = require('react');
const appStateListeners = new Set();
const backHandlerListeners = new Set();
const windowDimensionListeners = new Set();
const defaultWindowDimensions = { width: 390, height: 844, scale: 3, fontScale: 1 };
let windowDimensions = { ...defaultWindowDimensions };

function component(name) {
  return function MockComponent(props) {
    return React.createElement(name, props, props.children);
  };
}

module.exports = {
  ActivityIndicator: component('ActivityIndicator'),
  NativeModules: {},
  __setWindowDimensions(nextDimensions) {
    windowDimensions = { ...windowDimensions, ...nextDimensions };
    for (const listener of Array.from(windowDimensionListeners)) {
      listener();
    }
  },
  __resetWindowDimensions() {
    windowDimensions = { ...defaultWindowDimensions };
    for (const listener of Array.from(windowDimensionListeners)) {
      listener();
    }
  },
  LogBox: {
    ignoreAllLogs() {}
  },
  Linking: {
    openURL() {
      return Promise.resolve();
    }
  },
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
  BackHandler: {
    addEventListener(eventName, listener) {
      if (eventName !== 'hardwareBackPress') {
        return { remove() {} };
      }
      backHandlerListeners.add(listener);
      return {
        remove() {
          backHandlerListeners.delete(listener);
        }
      };
    },
    __emit() {
      return Array.from(backHandlerListeners).reverse().some((listener) => listener());
    },
    __reset() {
      backHandlerListeners.clear();
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
    return React.useSyncExternalStore(
      (listener) => {
        windowDimensionListeners.add(listener);
        return () => windowDimensionListeners.delete(listener);
      },
      () => windowDimensions,
      () => windowDimensions
    );
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
