const React = require('react');
const appStateListeners = new Set();
const backHandlerListeners = new Set();
const windowDimensionListeners = new Set();
const defaultWindowDimensions = { width: 390, height: 844, scale: 3, fontScale: 1 };
let windowDimensions = { ...defaultWindowDimensions };
let scrollViewCommands = [];
let scrollViewFrame = { x: 0, y: 0, width: 390, height: 400 };
let viewFrames = new Map();

function component(name) {
  return function MockComponent(props) {
    return React.createElement(name, props, props.children);
  };
}

const MockScrollView = React.forwardRef(function MockScrollView(props, ref) {
  React.useImperativeHandle(ref, () => ({
    getNativeScrollRef() {
      return {
        measureInWindow(callback) {
          callback(
            scrollViewFrame.x,
            scrollViewFrame.y,
            scrollViewFrame.width,
            scrollViewFrame.height
          );
        }
      };
    },
    measureInWindow(callback) {
      callback(
        scrollViewFrame.x,
        scrollViewFrame.y,
        scrollViewFrame.width,
        scrollViewFrame.height
      );
    },
    scrollTo(options) {
      scrollViewCommands.push({ ...options });
    }
  }));
  return React.createElement('ScrollView', props, props.children);
});

const MeasuredMockView = React.forwardRef(function MeasuredMockView(props, ref) {
  React.useImperativeHandle(ref, () => ({
    measureInWindow(callback) {
      const frame = viewFrames.get(props.testID);
      callback(
        frame?.x ?? 0,
        frame?.y ?? 0,
        frame?.width ?? 0,
        frame?.height ?? 0
      );
    }
  }), [props.testID]);
  return React.createElement('View', props, props.children);
});

function MockView(props) {
  return viewFrames.has(props.testID)
    ? React.createElement(MeasuredMockView, props, props.children)
    : React.createElement('View', props, props.children);
}

class AnimatedValue {
  constructor(value) {
    this.value = value;
    this.animationTimer = null;
  }

  setValue(value) {
    this.value = value;
  }

  interpolate(configuration) {
    return {
      __animatedValue: this,
      configuration
    };
  }

  stopAnimation(callback) {
    if (this.animationTimer !== null) {
      clearTimeout(this.animationTimer);
      this.animationTimer = null;
    }
    callback?.(this.value);
  }
}

module.exports = {
  ActivityIndicator: component('ActivityIndicator'),
  Animated: {
    Value: AnimatedValue,
    View: component('Animated.View'),
    spring(value, configuration) {
      return {
        start(callback) {
          value.setValue(configuration.toValue);
          callback?.();
        }
      };
    },
    timing(value, configuration) {
      return {
        start(callback) {
          value.stopAnimation();
          value.animationTimer = setTimeout(() => {
            value.animationTimer = null;
            value.setValue(configuration.toValue);
            callback?.({ finished: true });
          }, configuration.duration ?? 0);
        }
      };
    }
  },
  Easing: {
    cubic(value) {
      return value * value * value;
    },
    out(easing) {
      return easing;
    }
  },
  NativeModules: {},
  Platform: {
    OS: 'ios',
    select(options) {
      return options.ios ?? options.default;
    }
  },
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
  __getScrollViewCommands() {
    return scrollViewCommands.map((command) => ({ ...command }));
  },
  __resetScrollView() {
    scrollViewCommands = [];
    scrollViewFrame = { x: 0, y: 0, width: 390, height: 400 };
    viewFrames = new Map();
  },
  __setScrollViewFrame(nextFrame) {
    scrollViewFrame = { ...scrollViewFrame, ...nextFrame };
  },
  __setViewFrame(testID, frame) {
    viewFrames.set(testID, { ...frame });
  },
  LogBox: {
    ignoreAllLogs() {}
  },
  Linking: {
    openURL() {
      return Promise.resolve();
    }
  },
  LayoutAnimation: {
    Types: { easeInEaseOut: 'easeInEaseOut' },
    Properties: { opacity: 'opacity' },
    configureNext() {}
  },
  PanResponder: {
    create(handlers) {
      return { panHandlers: handlers };
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
  ScrollView: MockScrollView,
  StatusBar: component('StatusBar'),
  Text: component('Text'),
  TextInput: component('TextInput'),
  TouchableOpacity: component('TouchableOpacity'),
  Image: component('Image'),
  Modal: component('Modal'),
  View: MockView,
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
    flatten(style) {
      if (!style) {
        return {};
      }
      if (Array.isArray(style)) {
        return style.reduce(
          (merged, entry) => Object.assign(merged, module.exports.StyleSheet.flatten(entry)),
          {}
        );
      }
      return typeof style === 'object' ? { ...style } : {};
    },
  },
};
