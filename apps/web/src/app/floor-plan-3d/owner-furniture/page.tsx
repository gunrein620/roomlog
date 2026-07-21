import { Suspense } from "react";
import OwnerFurnitureSimulation from "./OwnerFurnitureSimulation";
import "./owner-furniture.css";

export default function OwnerFurniturePage() {
  return (
    <Suspense fallback={<main className="owner-furniture-loading">3D 가구 배치를 불러오는 중입니다…</main>}>
      <OwnerFurnitureSimulation />
    </Suspense>
  );
}
