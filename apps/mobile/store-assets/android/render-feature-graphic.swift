import AppKit
import Foundation

let width = 1024
let height = 500
guard CommandLine.arguments.count == 2 else {
  fputs("Usage: swift render-feature-graphic.swift <output.png>\n", stderr)
  exit(2)
}

guard let bitmap = NSBitmapImageRep(
  bitmapDataPlanes: nil,
  pixelsWide: width,
  pixelsHigh: height,
  bitsPerSample: 8,
  samplesPerPixel: 4,
  hasAlpha: true,
  isPlanar: false,
  colorSpaceName: .deviceRGB,
  bytesPerRow: 0,
  bitsPerPixel: 0
) else {
  fatalError("Could not create feature-graphic bitmap")
}

NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)

let canvas = NSRect(x: 0, y: 0, width: width, height: height)
NSGradient(
  starting: NSColor(calibratedRed: 1, green: 1, blue: 1, alpha: 1),
  ending: NSColor(calibratedRed: 0.84, green: 0.88, blue: 0.93, alpha: 1)
)!.draw(in: canvas, angle: -25)

NSColor.white.withAlphaComponent(0.5).setStroke()
for x in stride(from: 0, through: width, by: 125) {
  let line = NSBezierPath()
  line.move(to: NSPoint(x: x, y: 0))
  line.line(to: NSPoint(x: x, y: height))
  line.lineWidth = 1
  line.stroke()
}
for y in stride(from: 0, through: height, by: 125) {
  let line = NSBezierPath()
  line.move(to: NSPoint(x: 0, y: y))
  line.line(to: NSPoint(x: width, y: y))
  line.lineWidth = 1
  line.stroke()
}

let shadow = NSShadow()
shadow.shadowColor = NSColor(calibratedRed: 0.15, green: 0.25, blue: 0.37, alpha: 0.25)
shadow.shadowBlurRadius = 14
shadow.shadowOffset = NSSize(width: 0, height: -10)
shadow.set()

let arrow = NSBezierPath()
arrow.move(to: NSPoint(x: 116, y: 88))
arrow.curve(to: NSPoint(x: 164, y: 40), controlPoint1: NSPoint(x: 90, y: 62), controlPoint2: NSPoint(x: 90, y: 40))
arrow.line(to: NSPoint(x: 424, y: 300))
arrow.line(to: NSPoint(x: 371, y: 353))
arrow.line(to: NSPoint(x: 570, y: 413))
arrow.line(to: NSPoint(x: 510, y: 214))
arrow.line(to: NSPoint(x: 457, y: 267))
arrow.line(to: NSPoint(x: 198, y: 8))
arrow.curve(to: NSPoint(x: 116, y: 88), controlPoint1: NSPoint(x: 176, y: -14), controlPoint2: NSPoint(x: 138, y: 66))
arrow.close()
NSColor(calibratedRed: 0.04, green: 0.48, blue: 1, alpha: 1).setFill()
arrow.fill()

NSGraphicsContext.restoreGraphicsState()
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)

let highlight = NSBezierPath()
highlight.move(to: NSPoint(x: 160, y: 65))
highlight.line(to: NSPoint(x: 405, y: 310))
highlight.lineWidth = 8
highlight.lineCapStyle = .round
NSColor(calibratedRed: 0.30, green: 0.65, blue: 1, alpha: 1).setStroke()
highlight.stroke()

let titleAttributes: [NSAttributedString.Key: Any] = [
  .font: NSFont.systemFont(ofSize: 68, weight: .bold),
  .foregroundColor: NSColor(calibratedRed: 0.08, green: 0.16, blue: 0.24, alpha: 1),
]
let subtitleAttributes: [NSAttributedString.Key: Any] = [
  .font: NSFont.systemFont(ofSize: 29, weight: .medium),
  .foregroundColor: NSColor(calibratedRed: 0.28, green: 0.38, blue: 0.50, alpha: 1),
]
NSAttributedString(string: "Chessticize", attributes: titleAttributes)
  .draw(at: NSPoint(x: 578, y: 266))
NSAttributedString(string: "Offline chess practice", attributes: subtitleAttributes)
  .draw(at: NSPoint(x: 582, y: 220))

NSGraphicsContext.restoreGraphicsState()

guard let png = bitmap.representation(using: .png, properties: [:]) else {
  fatalError("Could not encode feature-graphic PNG")
}
try png.write(to: URL(fileURLWithPath: CommandLine.arguments[1]), options: .atomic)
