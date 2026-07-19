import { Injectable, Logger } from "@nestjs/common";
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { verifySocketTicket } from "./socket-ticket";

/**
 * 실시간 알림 게이트웨이 (socket.io).
 * - 연결: 핸드셰이크의 단기 티켓을 검증하고 user:{id} 룸에 넣는다. 실패 시 즉시 끊는다.
 * - 발신: 도메인 컨트롤러가 notifyUsers/broadcast를 호출한다. 페이로드는 "무엇이 바뀌었는지"
 *   최소 식별자만 담고, 실제 데이터는 클라이언트가 기존 REST로 다시 읽는다(폴링 폴백과 같은 경로).
 * - CORS: HTTP 쪽 enableCors()와 같은 개방 정책. 조이려면 여기와 main.ts를 함께 조정할 것.
 */
@Injectable()
@WebSocketGateway({ cors: { origin: true } })
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    const payload = verifySocketTicket(client.handshake.auth?.ticket);

    if (!payload) {
      client.disconnect(true);
      return;
    }

    if (payload.scope === "PUBLIC_GARA") {
      void client.join("public:gara");
      this.logger.debug("connected public Gara client");
      return;
    }

    client.data.userId = payload.sub;
    void client.join(`user:${payload.sub}`);
    this.logger.debug(`connected user=${payload.sub}`);
  }

  /** 특정 사용자들에게만 보낸다 (거래 채팅 등 1:1 알림). */
  notifyUsers(userIds: string[], event: string, payload: Record<string, unknown>) {
    if (!this.server) return false;
    const rooms = [...new Set(userIds)].map((userId) => `user:${userId}`);
    if (
      rooms.length === 0
      || rooms.some((room) => !this.server.sockets.adapter.rooms.get(room)?.size)
    ) {
      return false;
    }
    for (const room of rooms) {
      this.server.to(room).emit(event, payload);
    }
    return true;
  }

  /** 인증된 전체 클라이언트에게 보낸다 (룸로그 메시징/공지 갱신 신호). */
  broadcast(event: string, payload: Record<string, unknown>) {
    this.server?.emit(event, payload);
  }

  /** Gara 공개 화면과 관리자 화면 모두에 안전한 갱신 신호만 보낸다. */
  notifyGaraPayoutUpdated() {
    this.server?.emit("gara:payout-updated", { kind: "payout" });
  }
}
