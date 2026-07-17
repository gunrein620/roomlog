# GPU 파이프라인 운영 활성화 설계

## 목표

현재 데모 운영 환경에서 매물 영상/Record3D ZIP 업로드가 기존 GPU EC2 재구성 파이프라인으로 전달되고, 생성된 `.spz`가 운영 API로 콜백되도록 활성화한다.

이번 작업은 빠른 동작 확인이 목적이다. 장기 AWS 액세스 키를 EC2 인스턴스 역할로 교체하는 보안 개선과 `GPU_WORKER_SECRET` 회전은 후속 작업으로 남긴다.

## 확인된 현재 상태

- 운영 API는 서울 리전 EC2 `i-0fb63af19656dcd31`의 Docker Compose에서 실행 중이다.
- 운영 API 컨테이너는 GitHub Actions가 배포한 `AWS_ACCESS_KEY_ID`와 `AWS_SECRET_ACCESS_KEY`를 사용한다.
- 이 자격증명은 현재 S3에는 사용되지만, GPU EC2/SSM API 권한은 없다.
- GPU 인스턴스는 버지니아 북부 리전의 `i-061e16af461c7c5df`이며 현재 중지 상태다.
- GPU 인스턴스에는 `EC2-SSM-Role`과 `AmazonSSMManagedInstanceCore`가 연결되어 있어 SSM 명령을 받을 수 있다.
- API 오케스트레이터는 네 GPU 환경변수가 모두 존재해야 활성화된다.
- 사용자는 GitHub `PROD_ENV`에 네 환경변수를 이미 입력했다.

## 선택한 접근

기존 운영 AWS 액세스 키가 속한 IAM 사용자에게 GPU 제어용 최소권한 인라인 정책을 추가한다. 이후 `main` 배포를 실행해 `PROD_ENV`를 운영 `.env`로 전달한다.

이 방식은 새 IAM Role을 만들고 기존 S3 권한까지 이전하는 방식보다 빠르며, 현재 데모 활성화 목적에 맞는다. 장기 키의 유출·회전 부담이 있으므로 실서비스 전에는 운영 EC2 인스턴스 역할로 전환한다.

## IAM 권한 범위

- `ec2:DescribeInstances`: 오케스트레이터의 상태 조회에 필요하며 AWS 제약상 `Resource: "*"`를 사용한다.
- `ec2:StartInstances`, `ec2:StopInstances`: GPU 인스턴스 한 대의 ARN으로 제한한다.
- `ssm:SendCommand`: GPU 인스턴스 한 대와 AWS 소유 `AWS-RunShellScript` 문서로 제한한다.
- `ssm:DescribeInstanceInformation`, `ssm:GetCommandInvocation`, `ssm:CancelCommand`: 현재 SDK 호출에 필요하며 리소스 수준 제한을 지원하지 않는 액션은 `Resource: "*"`를 사용한다.
- 기존 S3 정책은 변경하지 않는다.

## 배포 흐름

1. 기존 액세스 키의 IAM 주체를 확인한다.
2. 위 최소권한 인라인 정책을 연결한다.
3. `main`의 Deploy workflow를 수동 실행한다.
4. GitHub Actions가 `PROD_ENV`를 `.env.production`에 보존해 운영 EC2의 `/home/ubuntu/roomlog/.env`로 배포한다.
5. Docker Compose가 네 GPU 환경변수를 API 컨테이너에 전달한다.
6. API 기동 로그에서 `GPU pipeline enabled`를 확인한다.

## 검증과 안전 장치

- 정책 연결 후 `DescribeInstances`, `StartInstances(DryRun)`, `DescribeInstanceInformation` 권한을 확인한다.
- 배포 후 네 환경변수의 값은 출력하지 않고 set/unset 상태만 확인한다.
- 활성화 로그와 API 컨테이너 상태를 확인한다.
- 큐가 비어 있으면 오케스트레이터가 GPU를 시작하지 않으므로 검증 과정에서 GPU 비용을 발생시키지 않는다.
- 실제 영상 한 건의 end-to-end 실행은 활성화 확인 후 별도 단계로 수행한다.

## 실패 처리

- 정책 저장 실패 시 배포하지 않는다.
- GitHub 배포 실패 시 Actions 로그와 기존 API 컨테이너 복구 상태를 확인한다.
- 활성화 로그가 나오지 않으면 운영 `.env`와 컨테이너의 변수 존재 여부만 검사하고 값은 노출하지 않는다.
- 권한 오류가 남으면 해당 AWS API 액션만 정책에 보완하고 광범위한 관리자 정책은 사용하지 않는다.

## 후속 작업

- 운영 EC2에 전용 IAM Role을 붙이고 장기 AWS 키를 GitHub와 서버에서 제거한다.
- `GPU_WORKER_SECRET`을 회전한다.
- 실제 영상 한 건으로 업로드, GPU 시작, SSM 실행, `.spz` 콜백, GPU 자동 종료를 검증한다.
