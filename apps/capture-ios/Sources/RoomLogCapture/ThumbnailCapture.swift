import SwiftUI
import UIKit

/// 가구 썸네일 촬영용 카메라 래퍼. `UIImagePickerController(.camera)`를 그대로 쓰고, 정사각
/// 크롭·리사이즈는 촬영 후 `UIImage.squareThumbnail(maxDimension:)`에서 처리한다 — 피커 자체의
/// `allowsEditing` 크롭 UI는 쓰지 않는다(가로세로 자유 크롭이라 정사각을 보장하지 못한다).
/// ObjectCaptureScanView(신규 촬영)와 ContentView의 FurnitureCabinetView(기존 가구) 양쪽에서 재사용.
struct SquareThumbnailCamera: UIViewControllerRepresentable {
    /// 촬영 완료 시 원본 이미지, 취소 시 nil.
    let onCapture: (UIImage?) -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.cameraCaptureMode = .photo
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onCapture: onCapture)
    }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onCapture: (UIImage?) -> Void

        init(onCapture: @escaping (UIImage?) -> Void) {
            self.onCapture = onCapture
        }

        func imagePickerController(
            _ picker: UIImagePickerController,
            didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
        ) {
            onCapture(info[.originalImage] as? UIImage)
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            onCapture(nil)
        }
    }
}

extension UIImage {
    /// 중앙 정사각 크롭 후 긴 변을 `maxDimension`(기본 1024px)으로 리사이즈한다.
    /// 정사각 크롭은 회전(imageOrientation)과 무관하게 중심이 고정되므로, cgImage 픽셀 좌표계에서
    /// 바로 잘라도 최종 표시 방향은 orientation을 그대로 물려받은 UIImage가 책임진다.
    func squareThumbnail(maxDimension: CGFloat = 1024) -> UIImage? {
        guard let cgImage else { return nil }

        let pixelWidth = CGFloat(cgImage.width)
        let pixelHeight = CGFloat(cgImage.height)
        let side = min(pixelWidth, pixelHeight)
        let cropRect = CGRect(
            x: (pixelWidth - side) / 2,
            y: (pixelHeight - side) / 2,
            width: side,
            height: side
        )
        guard let croppedCGImage = cgImage.cropping(to: cropRect) else { return nil }
        let cropped = UIImage(cgImage: croppedCGImage, scale: scale, orientation: imageOrientation)

        let targetSide = min(maxDimension, side / scale)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: targetSide, height: targetSide), format: format)
        return renderer.image { _ in
            cropped.draw(in: CGRect(x: 0, y: 0, width: targetSide, height: targetSide))
        }
    }
}
