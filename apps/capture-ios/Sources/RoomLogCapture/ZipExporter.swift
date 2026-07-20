import Foundation

enum ZipExporter {
    /// 캡처 폴더를 임시 ZIP 파일로 내보낸다.
    static func export(
        capture: CaptureSummary,
        progress: @MainActor @escaping (Double) -> Void
    ) async throws -> URL {
        try Task.checkCancellation()

        let fileManager = FileManager.default
        let outputURL = fileManager.temporaryDirectory
            .appendingPathComponent("\(capture.id).zip", isDirectory: false)

        do {
            if fileManager.fileExists(atPath: outputURL.path) {
                try fileManager.removeItem(at: outputURL)
            }

            let entries = try makeEntries(for: capture)
            let totalBytes = try entries.reduce(UInt64(0)) { partial, entry in
                let result = partial.addingReportingOverflow(entry.size)
                if result.overflow {
                    throw ZipExporterError.archiveTooLarge
                }
                return result.partialValue
            }

            await MainActor.run {
                progress(0)
            }

            guard fileManager.createFile(atPath: outputURL.path, contents: nil) else {
                throw ZipExporterError.cannotCreateOutput(outputURL)
            }

            let writer = try ZipWriter(url: outputURL)
            defer {
                try? writer.close()
            }

            var centralRecords: [CentralRecord] = []
            centralRecords.reserveCapacity(entries.count)

            var processedBytes: UInt64 = 0
            var usesZip64 = entries.count >= Int(UInt16.max)

            for entry in entries {
                try Task.checkCancellation()

                let nameData = try fileNameData(for: entry.path)
                let localHeaderOffset = writer.offset
                let sizesNeedZip64 = entry.size >= UInt64(UInt32.max)
                usesZip64 = usesZip64 || sizesNeedZip64

                let localExtra = sizesNeedZip64
                    ? zip64Extra(uncompressedSize: entry.size, compressedSize: entry.size)
                    : Data()

                try writer.write(localFileHeader(
                    entry: entry,
                    nameData: nameData,
                    extra: localExtra,
                    crc32: 0
                ))

                var crc32 = CRC32()
                var entryBytes: UInt64 = 0
                let input = try FileHandle(forReadingFrom: entry.url)
                defer {
                    try? input.close()
                }

                while true {
                    try Task.checkCancellation()

                    guard let chunk = try input.read(upToCount: 1_048_576), !chunk.isEmpty else {
                        break
                    }

                    crc32.update(chunk)
                    try writer.write(chunk)

                    entryBytes += UInt64(chunk.count)
                    processedBytes += UInt64(chunk.count)
                    await reportProgress(processedBytes, total: totalBytes, progress: progress)
                }

                guard entryBytes == entry.size else {
                    throw ZipExporterError.fileChangedDuringExport(entry.url)
                }

                let finalCRC = crc32.finalized()
                try writer.patchUInt32(finalCRC, at: localHeaderOffset + 14)

                let offsetNeedsZip64 = localHeaderOffset >= UInt64(UInt32.max)
                usesZip64 = usesZip64 || offsetNeedsZip64

                centralRecords.append(CentralRecord(
                    entry: entry,
                    crc32: finalCRC,
                    localHeaderOffset: localHeaderOffset,
                    sizesNeedZip64: sizesNeedZip64,
                    offsetNeedsZip64: offsetNeedsZip64
                ))
            }

            let centralDirectoryOffset = writer.offset

            for record in centralRecords {
                try Task.checkCancellation()

                let nameData = try fileNameData(for: record.entry.path)
                let centralExtra = zip64Extra(
                    uncompressedSize: record.sizesNeedZip64 ? record.entry.size : nil,
                    compressedSize: record.sizesNeedZip64 ? record.entry.size : nil,
                    localHeaderOffset: record.offsetNeedsZip64 ? record.localHeaderOffset : nil
                )

                try writer.write(centralDirectoryHeader(
                    record: record,
                    nameData: nameData,
                    extra: centralExtra
                ))
            }

            let centralDirectorySize = writer.offset - centralDirectoryOffset
            usesZip64 = usesZip64
                || centralDirectoryOffset >= UInt64(UInt32.max)
                || centralDirectorySize >= UInt64(UInt32.max)

            if usesZip64 {
                let zip64EOCDOffset = writer.offset
                try writer.write(zip64EndOfCentralDirectory(
                    entryCount: UInt64(centralRecords.count),
                    centralDirectorySize: centralDirectorySize,
                    centralDirectoryOffset: centralDirectoryOffset
                ))
                try writer.write(zip64EndOfCentralDirectoryLocator(zip64EOCDOffset: zip64EOCDOffset))
            }

            try writer.write(endOfCentralDirectory(
                entryCount: centralRecords.count,
                centralDirectorySize: centralDirectorySize,
                centralDirectoryOffset: centralDirectoryOffset
            ))

            await MainActor.run {
                progress(1)
            }
            return outputURL
        } catch {
            try? fileManager.removeItem(at: outputURL)
            throw error
        }
    }
}

private extension ZipExporter {
    struct Entry {
        let url: URL
        let path: String
        let size: UInt64
        let dosTime: UInt16
        let dosDate: UInt16
    }

    struct CentralRecord {
        let entry: Entry
        let crc32: UInt32
        let localHeaderOffset: UInt64
        let sizesNeedZip64: Bool
        let offsetNeedsZip64: Bool
    }

    enum ZipExporterError: Error {
        case invalidCaptureDirectory(URL)
        case cannotCreateOutput(URL)
        case archiveTooLarge
        case fileNameTooLong(String)
        case fileChangedDuringExport(URL)
    }

    // PKWARE APPNOTE ZIP 레코드 서명값.
    enum Signature {
        static let localFileHeader: UInt32 = 0x04034b50
        static let centralDirectoryHeader: UInt32 = 0x02014b50
        static let zip64EndOfCentralDirectory: UInt32 = 0x06064b50
        static let zip64EndOfCentralDirectoryLocator: UInt32 = 0x07064b50
        static let endOfCentralDirectory: UInt32 = 0x06054b50
    }

    // ZIP64 확장 필드 Header ID.
    static let zip64ExtraFieldID: UInt16 = 0x0001
    static let versionStore: UInt16 = 20
    static let versionZip64: UInt16 = 45
    static let methodStore: UInt16 = 0
    static let utf8NameFlag: UInt16 = 1 << 11

    static func makeEntries(for capture: CaptureSummary) throws -> [Entry] {
        let fileManager = FileManager.default
        let rootURL = capture.url.standardizedFileURL
        var isDirectory: ObjCBool = false

        guard fileManager.fileExists(atPath: rootURL.path, isDirectory: &isDirectory),
              isDirectory.boolValue else {
            throw ZipExporterError.invalidCaptureDirectory(rootURL)
        }

        let keys: Set<URLResourceKey> = [
            .isRegularFileKey,
            .fileSizeKey,
            .contentModificationDateKey
        ]

        guard let enumerator = fileManager.enumerator(
            at: rootURL,
            includingPropertiesForKeys: Array(keys),
            options: [.skipsHiddenFiles, .skipsPackageDescendants]
        ) else {
            throw ZipExporterError.invalidCaptureDirectory(rootURL)
        }

        let rootPath = rootURL.path.hasSuffix("/") ? rootURL.path : rootURL.path + "/"
        var entries: [Entry] = []

        for case let fileURL as URL in enumerator {
            try Task.checkCancellation()

            let values = try fileURL.resourceValues(forKeys: keys)
            guard values.isRegularFile == true else {
                continue
            }

            let filePath = fileURL.standardizedFileURL.path
            guard filePath.hasPrefix(rootPath) else {
                continue
            }

            let relativePath = String(filePath.dropFirst(rootPath.count))
            let entryPath = capture.id + "/" + relativePath
            let size = try fileSize(for: fileURL, resourceValue: values.fileSize)
            let timestamp = dosTimestamp(for: values.contentModificationDate)

            entries.append(Entry(
                url: fileURL,
                path: entryPath,
                size: size,
                dosTime: timestamp.time,
                dosDate: timestamp.date
            ))
        }

        entries.sort { $0.path < $1.path }
        return entries
    }

    static func localFileHeader(
        entry: Entry,
        nameData: Data,
        extra: Data,
        crc32: UInt32
    ) -> Data {
        let needsZip64 = !extra.isEmpty
        let size32 = needsZip64 ? UInt32.max : UInt32(entry.size)

        var data = Data()
        data.reserveCapacity(30 + nameData.count + extra.count)
        data.appendUInt32LE(Signature.localFileHeader)
        data.appendUInt16LE(needsZip64 ? versionZip64 : versionStore)
        data.appendUInt16LE(utf8NameFlag)
        data.appendUInt16LE(methodStore)
        data.appendUInt16LE(entry.dosTime)
        data.appendUInt16LE(entry.dosDate)
        data.appendUInt32LE(crc32)
        data.appendUInt32LE(size32)
        data.appendUInt32LE(size32)
        data.appendUInt16LE(UInt16(nameData.count))
        data.appendUInt16LE(UInt16(extra.count))
        data.append(nameData)
        data.append(extra)
        return data
    }

    static func centralDirectoryHeader(
        record: CentralRecord,
        nameData: Data,
        extra: Data
    ) -> Data {
        let needsZip64 = record.sizesNeedZip64 || record.offsetNeedsZip64
        let size32 = record.sizesNeedZip64 ? UInt32.max : UInt32(record.entry.size)
        let offset32 = record.offsetNeedsZip64 ? UInt32.max : UInt32(record.localHeaderOffset)

        var data = Data()
        data.reserveCapacity(46 + nameData.count + extra.count)
        data.appendUInt32LE(Signature.centralDirectoryHeader)
        data.appendUInt16LE(needsZip64 ? versionZip64 : versionStore)
        data.appendUInt16LE(needsZip64 ? versionZip64 : versionStore)
        data.appendUInt16LE(utf8NameFlag)
        data.appendUInt16LE(methodStore)
        data.appendUInt16LE(record.entry.dosTime)
        data.appendUInt16LE(record.entry.dosDate)
        data.appendUInt32LE(record.crc32)
        data.appendUInt32LE(size32)
        data.appendUInt32LE(size32)
        data.appendUInt16LE(UInt16(nameData.count))
        data.appendUInt16LE(UInt16(extra.count))
        data.appendUInt16LE(0)
        data.appendUInt16LE(0)
        data.appendUInt16LE(0)
        data.appendUInt32LE(0)
        data.appendUInt32LE(offset32)
        data.append(nameData)
        data.append(extra)
        return data
    }

    static func zip64Extra(
        uncompressedSize: UInt64? = nil,
        compressedSize: UInt64? = nil,
        localHeaderOffset: UInt64? = nil
    ) -> Data {
        var body = Data()

        if let uncompressedSize {
            body.appendUInt64LE(uncompressedSize)
        }
        if let compressedSize {
            body.appendUInt64LE(compressedSize)
        }
        if let localHeaderOffset {
            body.appendUInt64LE(localHeaderOffset)
        }

        guard !body.isEmpty else {
            return Data()
        }

        var data = Data()
        data.reserveCapacity(4 + body.count)
        data.appendUInt16LE(zip64ExtraFieldID)
        data.appendUInt16LE(UInt16(body.count))
        data.append(body)
        return data
    }

    static func zip64EndOfCentralDirectory(
        entryCount: UInt64,
        centralDirectorySize: UInt64,
        centralDirectoryOffset: UInt64
    ) -> Data {
        var data = Data()
        data.reserveCapacity(56)
        data.appendUInt32LE(Signature.zip64EndOfCentralDirectory)
        data.appendUInt64LE(44)
        data.appendUInt16LE(versionZip64)
        data.appendUInt16LE(versionZip64)
        data.appendUInt32LE(0)
        data.appendUInt32LE(0)
        data.appendUInt64LE(entryCount)
        data.appendUInt64LE(entryCount)
        data.appendUInt64LE(centralDirectorySize)
        data.appendUInt64LE(centralDirectoryOffset)
        return data
    }

    static func zip64EndOfCentralDirectoryLocator(zip64EOCDOffset: UInt64) -> Data {
        var data = Data()
        data.reserveCapacity(20)
        data.appendUInt32LE(Signature.zip64EndOfCentralDirectoryLocator)
        data.appendUInt32LE(0)
        data.appendUInt64LE(zip64EOCDOffset)
        data.appendUInt32LE(1)
        return data
    }

    static func endOfCentralDirectory(
        entryCount: Int,
        centralDirectorySize: UInt64,
        centralDirectoryOffset: UInt64
    ) -> Data {
        let entryCount16 = entryCount >= Int(UInt16.max) ? UInt16.max : UInt16(entryCount)
        let size32 = centralDirectorySize >= UInt64(UInt32.max) ? UInt32.max : UInt32(centralDirectorySize)
        let offset32 = centralDirectoryOffset >= UInt64(UInt32.max) ? UInt32.max : UInt32(centralDirectoryOffset)

        var data = Data()
        data.reserveCapacity(22)
        data.appendUInt32LE(Signature.endOfCentralDirectory)
        data.appendUInt16LE(0)
        data.appendUInt16LE(0)
        data.appendUInt16LE(entryCount16)
        data.appendUInt16LE(entryCount16)
        data.appendUInt32LE(size32)
        data.appendUInt32LE(offset32)
        data.appendUInt16LE(0)
        return data
    }

    static func fileNameData(for path: String) throws -> Data {
        let data = Data(path.utf8)
        guard data.count <= Int(UInt16.max) else {
            throw ZipExporterError.fileNameTooLong(path)
        }
        return data
    }

    static func fileSize(for url: URL, resourceValue: Int?) throws -> UInt64 {
        if let resourceValue {
            return UInt64(resourceValue)
        }

        let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
        if let size = attributes[.size] as? NSNumber {
            return size.uint64Value
        }

        return 0
    }

    static func reportProgress(
        _ processedBytes: UInt64,
        total totalBytes: UInt64,
        progress: @MainActor @escaping (Double) -> Void
    ) async {
        let value = totalBytes == 0
            ? 1.0
            : min(1.0, Double(processedBytes) / Double(totalBytes))

        await MainActor.run {
            progress(value)
        }
    }

    static func dosTimestamp(for date: Date?) -> (time: UInt16, date: UInt16) {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone.current

        let sourceDate = date ?? Date(timeIntervalSince1970: 0)
        let components = calendar.dateComponents(
            [.year, .month, .day, .hour, .minute, .second],
            from: sourceDate
        )

        let year = min(max(components.year ?? 1980, 1980), 2107)
        let month = min(max(components.month ?? 1, 1), 12)
        let day = min(max(components.day ?? 1, 1), 31)
        let hour = min(max(components.hour ?? 0, 0), 23)
        let minute = min(max(components.minute ?? 0, 0), 59)
        let second = min(max(components.second ?? 0, 0), 59)

        let dosTime = UInt16((hour << 11) | (minute << 5) | (second / 2))
        let dosDate = UInt16(((year - 1980) << 9) | (month << 5) | day)

        return (time: dosTime, date: dosDate)
    }
}

private struct CRC32 {
    private static let table: [UInt32] = (0..<256).map { index in
        var value = UInt32(index)
        for _ in 0..<8 {
            value = (value & 1) == 1 ? 0xedb88320 ^ (value >> 1) : value >> 1
        }
        return value
    }

    private var value: UInt32 = 0xffff_ffff

    mutating func update(_ data: Data) {
        for byte in data {
            value = Self.table[Int((value ^ UInt32(byte)) & 0xff)] ^ (value >> 8)
        }
    }

    func finalized() -> UInt32 {
        value ^ 0xffff_ffff
    }
}

private final class ZipWriter {
    private let handle: FileHandle
    private(set) var offset: UInt64 = 0

    init(url: URL) throws {
        handle = try FileHandle(forWritingTo: url)
    }

    func write(_ data: Data) throws {
        try handle.write(contentsOf: data)
        offset += UInt64(data.count)
    }

    func patchUInt32(_ value: UInt32, at patchOffset: UInt64) throws {
        let currentOffset = offset
        try handle.seek(toOffset: patchOffset)
        try handle.write(contentsOf: Data.littleEndianUInt32(value))
        try handle.seek(toOffset: currentOffset)
    }

    func close() throws {
        try handle.close()
    }
}

private extension Data {
    mutating func appendUInt16LE(_ value: UInt16) {
        var littleEndian = value.littleEndian
        Swift.withUnsafeBytes(of: &littleEndian) {
            append(contentsOf: $0)
        }
    }

    mutating func appendUInt32LE(_ value: UInt32) {
        var littleEndian = value.littleEndian
        Swift.withUnsafeBytes(of: &littleEndian) {
            append(contentsOf: $0)
        }
    }

    mutating func appendUInt64LE(_ value: UInt64) {
        var littleEndian = value.littleEndian
        Swift.withUnsafeBytes(of: &littleEndian) {
            append(contentsOf: $0)
        }
    }

    static func littleEndianUInt32(_ value: UInt32) -> Data {
        var data = Data()
        data.appendUInt32LE(value)
        return data
    }
}
