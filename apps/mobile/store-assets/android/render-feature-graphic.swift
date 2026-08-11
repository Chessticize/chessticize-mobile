import AppKit
import Foundation

let width = 1024
let height = 500
let sourceURL = URL(fileURLWithPath: #filePath)
  .deletingLastPathComponent()
  .appendingPathComponent("feature-graphic-source.png")
let captureURL = URL(fileURLWithPath: #filePath)
  .deletingLastPathComponent()
  .appendingPathComponent("feature-graphic-arrow-duel-capture.png")

guard CommandLine.arguments.count == 2 else {
  fputs("Usage: swift render-feature-graphic.swift <output.png>\n", stderr)
  exit(2)
}

guard
  let sourceData = try? Data(contentsOf: sourceURL),
  let sourceRepresentation = NSBitmapImageRep(data: sourceData)
else {
  fatalError("Could not load feature-graphic source at \(sourceURL.path)")
}
let sourceWidth = CGFloat(sourceRepresentation.pixelsWide)
let sourceHeight = CGFloat(sourceRepresentation.pixelsHigh)
let sourceImage = NSImage(size: NSSize(width: sourceWidth, height: sourceHeight))
sourceImage.addRepresentation(sourceRepresentation)

guard
  let captureData = try? Data(contentsOf: captureURL),
  let captureRepresentation = NSBitmapImageRep(data: captureData)
else {
  fatalError("Could not load Arrow Duel capture at \(captureURL.path)")
}
guard
  captureRepresentation.pixelsWide == 1080,
  captureRepresentation.pixelsHigh == 1920
else {
  fatalError("Expected the verified Android capture to be 1080 x 1920")
}
let captureImage = NSImage(size: NSSize(width: 1080, height: 1920))
captureImage.addRepresentation(captureRepresentation)

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
let targetAspect = CGFloat(width) / CGFloat(height)
let sourceAspect = sourceWidth / sourceHeight
let sourceRect: NSRect
if sourceAspect > targetAspect {
  let cropWidth = sourceHeight * targetAspect
  sourceRect = NSRect(
    x: (sourceWidth - cropWidth) / 2,
    y: 0,
    width: cropWidth,
    height: sourceHeight
  )
} else {
  let cropHeight = sourceWidth / targetAspect
  sourceRect = NSRect(
    x: 0,
    y: (sourceHeight - cropHeight) / 2,
    width: sourceWidth,
    height: cropHeight
  )
}
NSGraphicsContext.current?.imageInterpolation = .high
sourceImage.draw(
  in: canvas,
  from: sourceRect,
  operation: NSCompositingOperation.copy,
  fraction: 1
)

// Present the immutable product capture inside a generic Android handset. The
// frame uses one small centered circular punch hole and no Apple-specific cue.
let deviceRect = NSRect(x: 630, y: 11, width: 278, height: 478)
let screenHeight = CGFloat(458)
let screenWidth = screenHeight * 1080 / 1920
let screenRect = NSRect(
  x: deviceRect.midX - screenWidth / 2,
  y: deviceRect.midY - screenHeight / 2,
  width: screenWidth,
  height: screenHeight
)

NSGraphicsContext.saveGraphicsState()
let shadow = NSShadow()
shadow.shadowColor = NSColor(calibratedWhite: 0.05, alpha: 0.28)
shadow.shadowBlurRadius = 13
shadow.shadowOffset = NSSize(width: 0, height: -4)
shadow.set()
NSColor(calibratedRed: 0.025, green: 0.045, blue: 0.075, alpha: 1).setFill()
NSBezierPath(roundedRect: deviceRect, xRadius: 25, yRadius: 25).fill()
NSGraphicsContext.restoreGraphicsState()

NSGraphicsContext.saveGraphicsState()
NSBezierPath(roundedRect: screenRect, xRadius: 18, yRadius: 18).addClip()
captureImage.draw(
  in: screenRect,
  from: NSRect(x: 0, y: 0, width: 1080, height: 1920),
  operation: .copy,
  fraction: 1
)
NSGraphicsContext.restoreGraphicsState()

NSColor(calibratedWhite: 1, alpha: 0.24).setStroke()
let deviceHighlight = NSBezierPath(
  roundedRect: deviceRect.insetBy(dx: 1, dy: 1),
  xRadius: 24,
  yRadius: 24
)
deviceHighlight.lineWidth = 1
deviceHighlight.stroke()

NSColor(calibratedWhite: 0.02, alpha: 1).setFill()
NSBezierPath(
  ovalIn: NSRect(
    x: screenRect.midX - 4,
    y: screenRect.maxY - 12,
    width: 8,
    height: 8
  )
).fill()

NSGraphicsContext.restoreGraphicsState()

guard let rgbBitmap = NSBitmapImageRep(
  bitmapDataPlanes: nil,
  pixelsWide: width,
  pixelsHigh: height,
  bitsPerSample: 8,
  samplesPerPixel: 3,
  hasAlpha: false,
  isPlanar: false,
  colorSpaceName: .deviceRGB,
  bytesPerRow: 0,
  bitsPerPixel: 0
), let sourcePixels = bitmap.bitmapData, let rgbPixels = rgbBitmap.bitmapData else {
  fatalError("Could not create RGB feature-graphic bitmap")
}

for y in 0..<height {
  for x in 0..<width {
    let sourceOffset = y * bitmap.bytesPerRow + x * 4
    let rgbOffset = y * rgbBitmap.bytesPerRow + x * 3
    rgbPixels[rgbOffset] = sourcePixels[sourceOffset]
    rgbPixels[rgbOffset + 1] = sourcePixels[sourceOffset + 1]
    rgbPixels[rgbOffset + 2] = sourcePixels[sourceOffset + 2]
  }
}

guard let png = rgbBitmap.representation(using: .png, properties: [:]) else {
  fatalError("Could not encode feature-graphic PNG")
}
try png.write(to: URL(fileURLWithPath: CommandLine.arguments[1]), options: .atomic)
