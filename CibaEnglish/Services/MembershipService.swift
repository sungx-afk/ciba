import Foundation
import StoreKit

/// Thin StoreKit 2 wrapper for membership. The app ships fully usable without a
/// purchase; when no products are configured in App Store Connect the UI shows a
/// friendly "coming soon" explanation instead of failing silently.
@MainActor
final class MembershipService {

    static let shared = MembershipService()

    enum State {
        case unknown
        case loading
        case ready([Product])
        case unconfigured
        case failed(String)
    }

    private(set) var state: State = .unknown

    private init() {
        // Optimistically mirror an existing entitlement at launch.
        Task { [weak self] in
            await self?.refreshEntitlement()
        }
    }

    var isMember: Bool { SettingsStore.shared.isMember }

    func refresh() async {
        state = .loading
        // Products only resolve when the App Store configuration exists.
        do {
            let products = try await Product.products(for: AppConfig.membershipProductIDs)
            if products.isEmpty {
                state = .unconfigured
            } else {
                state = .ready(products.sorted { $0.price < $1.price })
            }
        } catch {
            state = .failed(error.localizedDescription)
        }
        await refreshEntitlement()
    }

    private func refreshEntitlement() async {
        // Without an active entitlement this stays a local flag; no crash paths.
        guard await hasStoreKitEntitlement() else { return }
        SettingsStore.shared.isMember = true
    }

    private func hasStoreKitEntitlement() async -> Bool {
        var found = false
        for await result in Transaction.currentEntitlements {
            if case .verified(let transaction) = result {
                if AppConfig.membershipProductIDs.contains(transaction.productID) {
                    found = true
                }
            }
        }
        return found
    }

    func purchase(_ product: Product) async -> Result<Void, MembershipError> {
        do {
            let result = try await product.purchase()
            switch result {
            case .success(let verification):
                switch verification {
                case .verified(let transaction):
                    await transaction.finish()
                    SettingsStore.shared.isMember = true
                    return .success(())
                case .unverified:
                    return .failure(.unverified)
                }
            case .userCancelled:
                return .failure(.cancelled)
            case .pending:
                return .failure(.pending)
            @unknown default:
                return .failure(.unknown)
            }
        } catch {
            return .failure(.store(error.localizedDescription))
        }
    }

    func restore() async -> Result<Void, MembershipError> {
        do {
            try await AppStore.sync()
        } catch {
            return .failure(.store(error.localizedDescription))
        }
        if await hasStoreKitEntitlement() {
            SettingsStore.shared.isMember = true
            return .success(())
        }
        return .failure(.nothingToRestore)
    }
}

enum MembershipError: LocalizedError, Equatable {
    case cancelled, pending, unverified, nothingToRestore, unknown
    case store(String)

    var errorDescription: String? {
        switch self {
        case .cancelled: return "已取消购买"
        case .pending: return "购买等待确认中，请稍后在 App Store 完成"
        case .unverified: return "交易校验未通过，请稍后重试"
        case .nothingToRestore: return "没有找到可恢复的购买记录"
        case .unknown: return "发生未知错误，请稍后重试"
        case .store(let message): return message
        }
    }
}
