// reconstruction.module — GPU 재구성 오케스트레이터 + AWS 제어 래퍼 + 워커 콜백 컨트롤러.
// 콜백 컨트롤러(ReconstructionController)는 W-A 산출물 — SplatAssetService(콜백이 파일 부착/실패 기록)와
// RealtimeGateway(소유자 알림)에 의존하므로 두 모듈을 import한다.
import { Module } from "@nestjs/common";
import { RealtimeModule } from "../realtime/realtime.module";
import { SplatAssetModule } from "../splat-asset/splat-asset.module";
import { GpuInstanceService } from "./gpu-instance.service";
import { ReconstructionController } from "./reconstruction.controller";
import { ReconstructionOrchestratorService } from "./reconstruction-orchestrator.service";

@Module({
  imports: [RealtimeModule, SplatAssetModule],
  controllers: [ReconstructionController],
  providers: [GpuInstanceService, ReconstructionOrchestratorService]
})
export class ReconstructionModule {}
