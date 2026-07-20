import SwiftUI
import ARKit
import SceneKit

struct ARPreviewView: UIViewRepresentable {
    let engine: CaptureEngine

    func makeUIView(context: Context) -> ARSCNView {
        let view = ARSCNView(frame: .zero)
        view.session = engine.session
        return view
    }

    func updateUIView(_ uiView: ARSCNView, context: Context) {
        if uiView.session !== engine.session {
            uiView.session = engine.session
        }
    }
}
