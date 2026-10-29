import Foundation
import Vision
import AppKit

// Usage: ocr <out.jsonl> <image> [image...]
// Emits one JSON object per image: {"file":..., "w":..., "h":..., "lines":[{"text","x","y","w","h","conf"}]}

let args = CommandLine.arguments
guard args.count >= 3 else {
    FileHandle.standardError.write("usage: ocr out.jsonl img...\n".data(using: .utf8)!)
    exit(1)
}
let outPath = args[1]
FileManager.default.createFile(atPath: outPath, contents: nil)
let out = FileHandle(forWritingAtPath: outPath)!

func recognize(_ path: String) -> [String: Any] {
    guard let img = NSImage(contentsOfFile: path),
          let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
        return ["file": path, "error": "load failed"]
    }
    let W = CGFloat(cg.width), H = CGFloat(cg.height)
    var lines: [[String: Any]] = []
    let req = VNRecognizeTextRequest { request, _ in
        guard let obs = request.results as? [VNRecognizedTextObservation] else { return }
        for o in obs {
            guard let c = o.topCandidates(1).first else { continue }
            let bb = o.boundingBox
            lines.append([
                "text": c.string,
                "conf": Double(c.confidence),
                "x": Double(bb.minX * W),
                "y": Double((1 - bb.maxY) * H),
                "w": Double(bb.width * W),
                "h": Double(bb.height * H),
            ])
        }
    }
    req.recognitionLevel = .accurate
    req.recognitionLanguages = ["zh-Hans", "en-US"]
    req.usesLanguageCorrection = true
    let handler = VNImageRequestHandler(cgImage: cg, options: [:])
    do { try handler.perform([req]) } catch {
        return ["file": path, "error": "\(error)"]
    }
    lines.sort { ($0["y"] as! Double) < ($1["y"] as! Double) }
    return ["file": (path as NSString).lastPathComponent, "w": Double(W), "h": Double(H), "lines": lines]
}

for p in args[2...] {
    let obj = recognize(p)
    let data = try! JSONSerialization.data(withJSONObject: obj, options: [])
    out.write(data)
    out.write("\n".data(using: .utf8)!)
}
out.closeFile()
