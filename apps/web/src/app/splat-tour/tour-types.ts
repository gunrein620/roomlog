export interface TourPreset {
  id: string;
  label: string;
  camera: { position: [number, number, number]; target: [number, number, number] };
  minimap: { x: number; y: number }; // 0~100 정규화 좌표
}
