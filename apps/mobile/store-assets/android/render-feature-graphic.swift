import AppKit
import Foundation

let width = 1024
let height = 500
let sourceURL = URL(fileURLWithPath: #filePath)
  .deletingLastPathComponent()
  .appendingPathComponent("feature-graphic-source.png")

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
