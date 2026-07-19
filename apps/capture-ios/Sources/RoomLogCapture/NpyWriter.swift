import Foundation

enum NpyWriter {
    @discardableResult
    static func writeFloat32(_ values: [Float], rows: Int, columns: Int, to url: URL) throws -> Int64 {
        let data = makeFloat32Data(values, rows: rows, columns: columns)
        try data.write(to: url, options: .atomic)
        return Int64(data.count)
    }

    @discardableResult
    static func writeUInt8(_ values: [UInt8], rows: Int, columns: Int, to url: URL) throws -> Int64 {
        let data = makeUInt8Data(values, rows: rows, columns: columns)
        try data.write(to: url, options: .atomic)
        return Int64(data.count)
    }

    static func makeFloat32Data(_ values: [Float], rows: Int, columns: Int) -> Data {
        precondition(values.count == rows * columns, "npy value count mismatch")
        var data = header(descr: "<f4", rows: rows, columns: columns)
        values.withUnsafeBufferPointer { buffer in
            data.append(contentsOf: UnsafeRawBufferPointer(buffer))
        }
        return data
    }

    static func makeUInt8Data(_ values: [UInt8], rows: Int, columns: Int) -> Data {
        precondition(values.count == rows * columns, "npy value count mismatch")
        var data = header(descr: "|u1", rows: rows, columns: columns)
        values.withUnsafeBufferPointer { buffer in
            data.append(contentsOf: UnsafeRawBufferPointer(buffer))
        }
        return data
    }

    private static func header(descr: String, rows: Int, columns: Int) -> Data {
        let magic = [UInt8](arrayLiteral: 0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59)
        var body = "{'descr': '\(descr)', 'fortran_order': False, 'shape': (\(rows), \(columns)), }"

        // npy v1.0 리더가 요구하는 64바이트 정렬을 맞추기 위해 헤더만 패딩한다.
        let fixedPrefixCount = magic.count + 2 + 2
        let newlineCount = 1
        let remainder = (fixedPrefixCount + body.utf8.count + newlineCount) % 64
        if remainder != 0 {
            body += String(repeating: " ", count: 64 - remainder)
        }
        body += "\n"

        let headerBytes = [UInt8](body.utf8)
        precondition(headerBytes.count <= Int(UInt16.max), "npy v1.0 header too large")

        var data = Data()
        data.reserveCapacity(fixedPrefixCount + headerBytes.count)
        data.append(contentsOf: magic)
        data.append(contentsOf: [0x01, 0x00])
        data.appendUInt16LE(UInt16(headerBytes.count))
        data.append(contentsOf: headerBytes)
        return data
    }
}

private extension Data {
    mutating func appendUInt16LE(_ value: UInt16) {
        append(UInt8(value & 0xff))
        append(UInt8((value >> 8) & 0xff))
    }
}
