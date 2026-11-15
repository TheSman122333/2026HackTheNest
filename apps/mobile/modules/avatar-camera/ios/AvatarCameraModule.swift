import AVFoundation
import ExpoModulesCore
import ImageIO
import PhotosUI
import UIKit
import UniformTypeIdentifiers

public class AvatarCameraModule: Module {
  @MainActor private var coordinator: AvatarPhotoCoordinator?

  public func definition() -> ModuleDefinition {
    Name("AvatarCamera")
    Function("isSupported") { true }
    AsyncFunction("takePhoto") { (promise: Promise) in
      Task { @MainActor in self.open(camera: true, promise: promise) }
    }
    AsyncFunction("choosePhoto") { (promise: Promise) in
      Task { @MainActor in self.open(camera: false, promise: promise) }
    }
    OnDestroy {
      Task { @MainActor in self.coordinator?.close() }
    }
  }

  @MainActor private func open(camera: Bool, promise: Promise) {
    guard coordinator == nil else {
      promise.reject("E_AVATAR_BUSY", "Finish the current photo selection first.")
      return
    }
    guard let presenter = appContext?.utilities?.currentViewController() else {
      promise.reject("E_AVATAR_ACTIVITY", "Return to the app before choosing a photo.")
      return
    }
    let controller = AvatarPhotoCoordinator(presenter: presenter) { [weak self] photo, error in
      self?.coordinator = nil
      if let error { promise.reject("E_AVATAR_PHOTO", error.localizedDescription) }
      else { promise.resolve(photo) }
    }
    coordinator = controller
    controller.open(camera: camera)
  }
}

@MainActor private final class AvatarPhotoCoordinator: NSObject, UIImagePickerControllerDelegate,
  UINavigationControllerDelegate, PHPickerViewControllerDelegate, UIAdaptivePresentationControllerDelegate {
  private weak var presenter: UIViewController?
  private weak var picker: UIViewController?
  private var completion: (([String: Any]?, Error?) -> Void)?

  init(presenter: UIViewController, completion: @escaping ([String: Any]?, Error?) -> Void) {
    self.presenter = presenter
    self.completion = completion
  }

  func open(camera: Bool) {
    if !camera {
      var configuration = PHPickerConfiguration()
      configuration.filter = .images
      configuration.selectionLimit = 1
      configuration.preferredAssetRepresentationMode = .compatible
      let controller = PHPickerViewController(configuration: configuration)
      controller.delegate = self
      show(controller)
      return
    }
    guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
      finish(error: Self.error("No camera is available. Try choosing a photo instead."))
      return
    }
    guard Bundle.main.object(forInfoDictionaryKey: "NSCameraUsageDescription") != nil else {
      finish(error: Self.error("This build is missing its camera permission description."))
      return
    }
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized: showCamera()
    case .notDetermined:
      AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
        Task { @MainActor in
          guard let self, self.completion != nil else { return }
          if granted { self.showCamera() }
          else { self.finish(error: Self.error("Camera access was declined. You can choose a photo instead.")) }
        }
      }
    default:
      finish(error: Self.error("Camera access is disabled. Enable it in Settings or choose a photo instead."))
    }
  }

  private func showCamera() {
    let controller = UIImagePickerController()
    controller.sourceType = .camera
    controller.mediaTypes = [UTType.image.identifier]
    controller.cameraCaptureMode = .photo
    if UIImagePickerController.isCameraDeviceAvailable(.front) { controller.cameraDevice = .front }
    controller.delegate = self
    show(controller)
  }

  private func show(_ controller: UIViewController) {
    guard let presenter, presenter.viewIfLoaded?.window != nil else {
      finish(error: Self.error("Return to the app before choosing a photo."))
      return
    }
    picker = controller
    presenter.present(controller, animated: true)
    controller.presentationController?.delegate = self
  }

  func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { finish() }

  func imagePickerController(_ picker: UIImagePickerController,
    didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
    guard let image = info[.originalImage] as? UIImage else {
      finish(error: Self.error("The camera did not return a photo."))
      return
    }
    do { finish(photo: try Self.save(image)) }
    catch { finish(error: error) }
  }

  func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
    guard let selected = results.first else { finish(); return }
    picker.dismiss(animated: true)
    let provider = selected.itemProvider
    guard provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) else {
      finish(error: Self.error("Please choose an image."))
      return
    }
    provider.loadFileRepresentation(forTypeIdentifier: UTType.image.identifier) { [weak self] url, error in
      // The temporary URL is valid only inside this callback. Decode a bounded thumbnail here.
      var prepared: UIImage?
      var preparationError = error
      if let url {
        do {
          let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
          guard size <= 20 * 1024 * 1024 else { throw Self.error("Choose a photo smaller than 20 MB.") }
          guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
            let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, [
              kCGImageSourceCreateThumbnailFromImageAlways: true,
              kCGImageSourceCreateThumbnailWithTransform: true,
              kCGImageSourceThumbnailMaxPixelSize: 1024,
              kCGImageSourceShouldCacheImmediately: true
            ] as CFDictionary) else { throw Self.error("The selected image could not be read.") }
          prepared = UIImage(cgImage: thumbnail)
        } catch { preparationError = error }
      }
      Task { @MainActor in
        guard let self, self.completion != nil else { return }
        do {
          guard let prepared else { throw preparationError ?? Self.error("The selected image could not be read.") }
          self.finish(photo: try Self.save(prepared))
        } catch { self.finish(error: error) }
      }
    }
  }

  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) { finish() }

  func close() { finish(error: Self.error("Photo capture was closed. Please try again.")) }

  private func finish(photo: [String: Any]? = nil, error: Error? = nil) {
    guard let completion else { return }
    self.completion = nil
    picker?.dismiss(animated: true)
    picker = nil
    completion(photo, error)
  }

  // Rendering bakes the UIImage orientation into pixels and strips location/EXIF metadata.
  private static func save(_ image: UIImage) throws -> [String: Any] {
    guard image.size.width > 0, image.size.height > 0 else { throw error("The photo could not be read.") }
    let ratio = min(1, 1024 / max(image.size.width, image.size.height))
    let size = CGSize(width: max(1, (image.size.width * ratio).rounded()), height: max(1, (image.size.height * ratio).rounded()))
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = true
    let normalized = UIGraphicsImageRenderer(size: size, format: format).image { context in
      UIColor.white.setFill()
      context.fill(CGRect(origin: .zero, size: size))
      image.draw(in: CGRect(origin: .zero, size: size))
    }
    guard let data = normalized.jpegData(compressionQuality: 0.88) else { throw error("The photo could not be saved.") }
    let directory = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("avatar-camera", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let destination = directory.appendingPathComponent("photo-\(UUID().uuidString).jpg")
    try data.write(to: destination, options: .atomic)
    return ["uri": destination.absoluteString, "width": Int(size.width), "height": Int(size.height)]
  }

  nonisolated private static func error(_ message: String) -> NSError {
    NSError(domain: "AvatarCamera", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
  }
}
