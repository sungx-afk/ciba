import UIKit
import WebKit

/// 展示打包在 App 内的静态 HTML 页面（用户协议 / 隐私政策等）。
/// 资源位于 Resources/html/ 下，同时兼容直接放在 bundle 根目录的情况。
final class WebContentViewController: UIViewController {

    private let pageTitle: String
    private let resourceName: String

    init(title: String, resourceName: String) {
        self.pageTitle = title
        self.resourceName = resourceName
        super.init(nibName: nil, bundle: nil)
        self.title = title
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Theme.palette.background

        guard let url = bundledResourceURL() else {
            showLoadFailure()
            return
        }

        let webView = WKWebView(frame: .zero)
        webView.backgroundColor = Theme.palette.background
        webView.isOpaque = false
        webView.scrollView.backgroundColor = Theme.palette.background
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        webView.pinToSuperview()

        webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
    }

    /// 优先取 bundle 根目录的 html，其次取 Resources/html/ 子目录。
    private func bundledResourceURL() -> URL? {
        if let root = Bundle.main.url(forResource: resourceName, withExtension: "html") {
            return root
        }
        return Bundle.main.url(forResource: resourceName, withExtension: "html", subdirectory: "html")
    }

    private func showLoadFailure() {
        let empty = EmptyStateView(icon: "doc.text.magnifyingglass",
                                   title: "内容加载失败",
                                   subtitle: "未找到对应页面资源，请稍后再试。")
        view.addSubview(empty)
        empty.pinToSuperview()
    }
}
