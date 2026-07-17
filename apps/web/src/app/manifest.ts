import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "집우집주",
    short_name: "집우집주",
    description: "3D 투어와 실매물 확인 중심의 부동산 탐색 서비스",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f5f6f8",
    theme_color: "#20184a",
    categories: ["lifestyle", "business", "productivity"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable"
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      }
    ],
    shortcuts: [
      {
        name: "지도에서 방 찾기",
        short_name: "지도",
        description: "네이버 지도 기반 매물 탐색으로 바로 이동",
        url: "/#map-list",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }]
      },
      {
        name: "채팅",
        short_name: "채팅",
        description: "진행 중인 매물 채팅 확인",
        url: "/#inquiry",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }]
      }
    ]
  };
}
