import UIKit

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene,
               willConnectTo session: UISceneSession,
               options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        window.overrideUserInterfaceStyle = .light
        let storyboard = UIStoryboard(name: "Main", bundle: nil)
        guard let tabController = storyboard.instantiateInitialViewController() as? UITabBarController else {
            return
        }
        // Tab items live on the navigation children so they exist before any view loads.
        let items: [(String, String, String)] = [
            ("分类", "square.grid.2x2", "square.grid.2x2.fill"),
            ("生词本", "bookmark", "bookmark.fill"),
            ("我", "person", "person.fill")
        ]
        for (index, child) in (tabController.viewControllers ?? []).enumerated() where index < items.count {
            let item = items[index]
            child.tabBarItem = UITabBarItem(title: item.0,
                                            image: UIImage(systemName: item.1),
                                            selectedImage: UIImage(systemName: item.2))
        }
        window.rootViewController = tabController
        window.makeKeyAndVisible()
        self.window = window
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        // Streak is computed on demand from the persisted study calendar.
        NotificationCenter.default.post(name: .appDidBecomeActive, object: nil)
    }
}

extension Notification.Name {
    static let appDidBecomeActive = Notification.Name("appDidBecomeActive")
}
