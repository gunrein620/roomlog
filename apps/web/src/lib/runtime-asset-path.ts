import path from "node:path";

export function resolveRoomlogRuntimePath(configuredPath: string, webRoot = process.cwd()) {
  return path.isAbsolute(configuredPath)
    ? path.resolve(configuredPath)
    : path.resolve(webRoot, "..", "..", configuredPath);
}
