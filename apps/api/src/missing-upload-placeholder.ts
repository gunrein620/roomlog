export function missingUploadPlaceholderSvg(_requestedPath = "") {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360" role="img" aria-label="Missing local photo file">',
    '<rect width="640" height="360" fill="#f6faf9"/>',
    '<rect x="46" y="46" width="548" height="268" rx="24" fill="#ffffff" stroke="#bfd8d2" stroke-width="3" stroke-dasharray="12 12"/>',
    '<path d="M214 226l52-60 38 42 31-32 91 90H188z" fill="#d9ebe6"/>',
    '<circle cx="424" cy="128" r="34" fill="#c7e2da"/>',
    '<rect x="178" y="92" width="284" height="176" rx="16" fill="none" stroke="#2f7d6e" stroke-width="10"/>',
    '<path d="M250 92l20-30h100l20 30" fill="none" stroke="#2f7d6e" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>',
    '<text x="320" y="294" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="700" fill="#1f5f55">PHOTO RECORD</text>',
    '<text x="320" y="324" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700" fill="#60736f">LOCAL FILE MISSING</text>',
    "</svg>"
  ].join("");
}
