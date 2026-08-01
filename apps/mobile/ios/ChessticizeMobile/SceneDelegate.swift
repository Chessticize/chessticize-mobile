import UIKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else {
      return
    }

    if ProcessInfo.processInfo.isiOSAppOnMac,
       let sizeRestrictions = windowScene.sizeRestrictions {
      sizeRestrictions.minimumSize = CGSize(width: 820, height: 600)
      sizeRestrictions.maximumSize.width = 1376
    }

    let window = UIWindow(windowScene: windowScene)
    self.window = window

    let appDelegate = UIApplication.shared.delegate as? AppDelegate
    appDelegate?.startReactNative(in: window)
  }
}
