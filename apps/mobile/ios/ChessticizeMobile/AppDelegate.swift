import UIKit
import React
import ReactAppDependencyProvider
import React_RCTAppDelegate


@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    configureReactNativeFactory()

    return true
  }

  func configureReactNativeFactory() {
    if reactNativeFactory != nil {
      return
    }

    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory
  }

  func startReactNative(in window: UIWindow) {
    configureReactNativeFactory()

    self.window = window
    reactNativeFactory?.startReactNative(
      withModuleName: "ChessticizeMobile",
      in: window,
      launchOptions: nil
    )
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  // Match the launch screen so the window never shows the default system background
  // (black in dark appearance) between the launch screen and the first React frame.
  override func customize(_ rootView: RCTRootView) {
    if let background = UIColor(named: "LaunchBackground") {
      rootView.backgroundColor = background
    }
  }

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    if let bundledURL = Bundle.main.url(forResource: "main", withExtension: "jsbundle") {
      return bundledURL
    }
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
