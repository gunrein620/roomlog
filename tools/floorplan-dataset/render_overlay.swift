#!/usr/bin/env swift
import AppKit
import Foundation

struct OverlayBox: Decodable {
    let class_name: String
    let label: String
    let x: Double
    let y: Double
    let w: Double
    let h: Double
}

struct OverlaySpec: Decodable {
    let source_width: Double
    let source_height: Double
    let boxes: [OverlayBox]
}

func value(after flag: String, in args: [String]) -> String? {
    guard let index = args.firstIndex(of: flag), index + 1 < args.count else {
        return nil
    }
    return args[index + 1]
}

let args = CommandLine.arguments
guard
    let inputPath = value(after: "--input", in: args),
    let specPath = value(after: "--spec", in: args),
    let outputPath = value(after: "--output", in: args)
else {
    fputs("Usage: swift render_overlay.swift --input plan.png --spec overlay.json --output overlay.png [--max-dim 1600]\n", stderr)
    exit(2)
}

let maxDim = Double(value(after: "--max-dim", in: args) ?? "1600") ?? 1600.0
let inputURL = URL(fileURLWithPath: inputPath)
let specURL = URL(fileURLWithPath: specPath)
let outputURL = URL(fileURLWithPath: outputPath)

guard let sourceImage = NSImage(contentsOf: inputURL) else {
    fputs("Could not open image: \(inputPath)\n", stderr)
    exit(1)
}

let specData = try Data(contentsOf: specURL)
let spec = try JSONDecoder().decode(OverlaySpec.self, from: specData)
let scale = min(1.0, maxDim / max(spec.source_width, spec.source_height))
let targetWidth = max(1.0, (spec.source_width * scale).rounded())
let targetHeight = max(1.0, (spec.source_height * scale).rounded())
let scaleX = targetWidth / spec.source_width
let scaleY = targetHeight / spec.source_height
let canvasSize = NSSize(width: targetWidth, height: targetHeight)

func strokeColor(for className: String) -> NSColor {
    switch className {
    case "door":
        return NSColor(calibratedRed: 0.0, green: 0.74, blue: 0.28, alpha: 0.95)
    case "window":
        return NSColor(calibratedRed: 0.0, green: 0.34, blue: 1.0, alpha: 0.95)
    default:
        return NSColor(calibratedWhite: 0.18, alpha: 0.35)
    }
}

func fillColor(for className: String) -> NSColor {
    switch className {
    case "door":
        return NSColor(calibratedRed: 0.0, green: 0.45, blue: 0.18, alpha: 0.85)
    case "window":
        return NSColor(calibratedRed: 0.0, green: 0.18, blue: 0.68, alpha: 0.85)
    default:
        return NSColor(calibratedWhite: 0.1, alpha: 0.35)
    }
}

let canvas = NSImage(size: canvasSize)
canvas.lockFocusFlipped(true)

let fullRect = NSRect(x: 0, y: 0, width: targetWidth, height: targetHeight)
NSColor.white.setFill()
fullRect.fill()
sourceImage.draw(
    in: fullRect,
    from: .zero,
    operation: .copy,
    fraction: 1.0,
    respectFlipped: true,
    hints: [.interpolation: NSImageInterpolation.high]
)

let lineWidth = max(1.0, min(targetWidth, targetHeight) / 700.0)
let fontSize = max(8.0, min(14.0, min(targetWidth, targetHeight) / 92.0))
let font = NSFont.systemFont(ofSize: fontSize, weight: .semibold)

for box in spec.boxes {
    let rect = NSRect(
        x: box.x * scaleX,
        y: box.y * scaleY,
        width: max(1.0, box.w * scaleX),
        height: max(1.0, box.h * scaleY)
    )
    let path = NSBezierPath(rect: rect)
    path.lineWidth = lineWidth
    strokeColor(for: box.class_name).setStroke()
    path.stroke()

    let paragraph = NSMutableParagraphStyle()
    paragraph.lineBreakMode = .byTruncatingTail
    let attrs: [NSAttributedString.Key: Any] = [
        .font: font,
        .foregroundColor: NSColor.white,
        .paragraphStyle: paragraph,
    ]
    let text = NSString(string: box.label)
    let textSize = text.size(withAttributes: attrs)
    let labelWidth = min(max(textSize.width + 7.0, 24.0), max(24.0, targetWidth - rect.minX))
    let labelHeight = textSize.height + 4.0
    let y = max(0.0, rect.minY - labelHeight)
    let labelRect = NSRect(x: rect.minX, y: y, width: labelWidth, height: labelHeight)
    fillColor(for: box.class_name).setFill()
    NSBezierPath(rect: labelRect).fill()
    text.draw(in: labelRect.insetBy(dx: 3.5, dy: 2.0), withAttributes: attrs)
}

canvas.unlockFocus()

guard
    let tiff = canvas.tiffRepresentation,
    let bitmap = NSBitmapImageRep(data: tiff),
    let png = bitmap.representation(using: .png, properties: [:])
else {
    fputs("Could not encode overlay PNG\n", stderr)
    exit(1)
}

try FileManager.default.createDirectory(
    at: outputURL.deletingLastPathComponent(),
    withIntermediateDirectories: true
)
try png.write(to: outputURL)
