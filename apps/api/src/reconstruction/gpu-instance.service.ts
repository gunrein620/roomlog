// gpu-instance.service — GPU EC2 인스턴스 제어 + SSM RunCommand 래퍼(AWS SDK v3).
// 오케스트레이터는 이 서비스의 GpuInstance 인터페이스에만 의존한다(테스트는 fake로 대체).
// 리전 함정: GPU는 us-east-1(GPU_REGION), 스토리지는 ap-northeast-2(AWS_REGION)로 서로 다르다.
// 따라서 여기서 AWS_REGION 폴백을 절대 쓰지 않는다 — GPU_REGION 미설정이면 명시적으로 실패.
import { Injectable, Logger } from "@nestjs/common";
import {
  DescribeInstancesCommand,
  EC2Client,
  StartInstancesCommand,
  StopInstancesCommand
} from "@aws-sdk/client-ec2";
import {
  CancelCommandCommand,
  DescribeInstanceInformationCommand,
  GetCommandInvocationCommand,
  SendCommandCommand,
  SSMClient
} from "@aws-sdk/client-ssm";
import { buildJobCommand, type JobCommandParams } from "./remote-job-command";

/** EC2 인스턴스 수명주기 상태(AWS 값 그대로 + 미확인 폴백). */
export type Ec2InstanceState =
  | "pending"
  | "running"
  | "stopping"
  | "stopped"
  | "shutting-down"
  | "terminated"
  | "unknown";

/** SSM 커맨드 인보케이션 상태 + 로그 꼬리. */
export interface CommandStatus {
  status: string; // Success | Failed | Cancelled | TimedOut | InProgress | Pending | Delayed | Cancelling | ...
  stdoutTail: string;
  stderrTail: string;
}

/** 용량 부족(InsufficientInstanceCapacity)만 별도 식별 — 오케스트레이터가 백오프하되 재시도 예산을 소모하지 않는다. */
export class InsufficientCapacityError extends Error {
  readonly code = "InsufficientInstanceCapacity";
  constructor(message = "GPU 인스턴스 용량이 부족합니다.") {
    super(message);
    this.name = "InsufficientCapacityError";
  }
}

export function isInsufficientCapacityError(err: unknown): boolean {
  if (err instanceof InsufficientCapacityError) return true;
  const name = (err as { name?: string; Code?: string; code?: string } | null)?.name;
  const code = (err as { Code?: string; code?: string } | null)?.Code ?? (err as { code?: string } | null)?.code;
  return name === "InsufficientInstanceCapacity" || code === "InsufficientInstanceCapacity";
}

/** 오케스트레이터가 의존하는 GPU 제어 표면(테스트 fake가 구현). */
export interface GpuInstance {
  describeState(): Promise<Ec2InstanceState>;
  startInstance(): Promise<void>;
  stopInstance(): Promise<void>;
  isSsmOnline(): Promise<boolean>;
  sendJobCommand(params: JobCommandParams): Promise<string>;
  getCommandStatus(commandId: string): Promise<CommandStatus>;
  cancelCommand(commandId: string): Promise<void>;
}

const LOG_TAIL_BYTES = 2 * 1024;

function tail(text: string | undefined, bytes = LOG_TAIL_BYTES): string {
  if (!text) return "";
  return text.length <= bytes ? text : text.slice(text.length - bytes);
}

@Injectable()
export class GpuInstanceService implements GpuInstance {
  private readonly logger = new Logger(GpuInstanceService.name);
  // 클라이언트는 지연 생성 — dev/게이트 OFF에서 자격증명 없이도 부팅되게(생성자는 트리비얼).
  private ec2Client?: EC2Client;
  private ssmClient?: SSMClient;

  private get region(): string {
    const region = process.env.GPU_REGION?.trim();
    if (!region) {
      // AWS_REGION 폴백 금지 — 스토리지 리전과 뒤섞이면 엉뚱한 인스턴스를 제어한다.
      throw new Error("GPU_REGION이 설정되어야 GPU 인스턴스를 제어할 수 있습니다(AWS_REGION 폴백 없음).");
    }
    return region;
  }

  private get instanceId(): string {
    const id = process.env.GPU_INSTANCE_ID?.trim();
    if (!id) throw new Error("GPU_INSTANCE_ID가 설정되어야 합니다.");
    return id;
  }

  private ec2(): EC2Client {
    if (!this.ec2Client) this.ec2Client = new EC2Client({ region: this.region });
    return this.ec2Client;
  }

  private ssm(): SSMClient {
    if (!this.ssmClient) this.ssmClient = new SSMClient({ region: this.region });
    return this.ssmClient;
  }

  async describeState(): Promise<Ec2InstanceState> {
    const out = await this.ec2().send(new DescribeInstancesCommand({ InstanceIds: [this.instanceId] }));
    const name = out.Reservations?.[0]?.Instances?.[0]?.State?.Name;
    return (name as Ec2InstanceState) ?? "unknown";
  }

  async startInstance(): Promise<void> {
    try {
      await this.ec2().send(new StartInstancesCommand({ InstanceIds: [this.instanceId] }));
    } catch (err) {
      if (isInsufficientCapacityError(err)) {
        throw new InsufficientCapacityError((err as Error).message);
      }
      throw err;
    }
  }

  async stopInstance(): Promise<void> {
    await this.ec2().send(new StopInstancesCommand({ InstanceIds: [this.instanceId] }));
  }

  async isSsmOnline(): Promise<boolean> {
    const out = await this.ssm().send(
      new DescribeInstanceInformationCommand({
        Filters: [{ Key: "InstanceIds", Values: [this.instanceId] }]
      })
    );
    return out.InstanceInformationList?.some((info) => info.PingStatus === "Online") ?? false;
  }

  async sendJobCommand(params: JobCommandParams): Promise<string> {
    const built = buildJobCommand(params);
    if (built.warning) this.logger.warn(built.warning);

    // executionTimeout: gpu-job.sh 실행 상한(초). 벽시계 타임아웃보다 넉넉히 두되 SSM 한도(≤172800) 내로.
    const executionTimeoutSec = Math.min(
      172800,
      Math.max(30, Math.floor(Number(process.env.GPU_JOB_TIMEOUT_MS ?? 4 * 60 * 60 * 1000) / 1000))
    );

    const out = await this.ssm().send(
      new SendCommandCommand({
        InstanceIds: [this.instanceId],
        DocumentName: "AWS-RunShellScript",
        Comment: `roomlog splat recon asset=${params.assetId}`.slice(0, 100),
        TimeoutSeconds: 600, // 커맨드 전달(딜리버리) 타임아웃 — 실행 타임아웃과 별개.
        Parameters: {
          commands: built.commands,
          executionTimeout: [String(executionTimeoutSec)]
        }
      })
    );
    const commandId = out.Command?.CommandId;
    if (!commandId) throw new Error("SSM SendCommand가 CommandId를 반환하지 않았습니다.");
    return commandId;
  }

  async getCommandStatus(commandId: string): Promise<CommandStatus> {
    const out = await this.ssm().send(
      new GetCommandInvocationCommand({ CommandId: commandId, InstanceId: this.instanceId })
    );
    return {
      status: out.Status ?? "Unknown",
      stdoutTail: tail(out.StandardOutputContent),
      stderrTail: tail(out.StandardErrorContent)
    };
  }

  async cancelCommand(commandId: string): Promise<void> {
    await this.ssm().send(new CancelCommandCommand({ CommandId: commandId, InstanceIds: [this.instanceId] }));
  }
}
