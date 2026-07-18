[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [string]$BucketName,

  [string]$SourceRoot = "runtime-assets/furniture-glb-dataset",

  [string]$Prefix = "furniture",

  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
  throw "AWS CLI가 필요합니다. AWS CLI를 설치하고 aws configure 또는 IAM 역할을 설정하세요."
}

$sourcePath = (Resolve-Path -LiteralPath $SourceRoot).Path
$catalogPath = Join-Path $sourcePath "catalog.json"
if (-not (Test-Path -LiteralPath $catalogPath -PathType Leaf)) {
  throw "catalog.json이 없습니다: $catalogPath"
}

$cleanPrefix = $Prefix.Trim("/")
if (-not $cleanPrefix) {
  throw "S3 프리픽스는 비워 둘 수 없습니다. 예: furniture"
}

$destination = "s3://$BucketName/$cleanPrefix"
$dryRunArgument = if ($DryRun) { @("--dryrun") } else { @() }

# category/filename 경로를 그대로 보존한다. GLB와 로컬 카드 미리보기를 함께 올린다.
& aws s3 sync $sourcePath $destination --exclude "*" --include "*.glb" --include "*.png" --cache-control "public, max-age=31536000, immutable" @dryRunArgument
if ($LASTEXITCODE -ne 0) { throw "GLB 또는 미리보기 동기화에 실패했습니다." }

# catalog.json은 새 분류·이름·이미지 URL을 즉시 반영해야 하므로 캐시하지 않는다.
& aws s3 cp $catalogPath "$destination/catalog.json" --content-type "application/json; charset=utf-8" --cache-control "no-cache" @dryRunArgument
if ($LASTEXITCODE -ne 0) { throw "catalog.json 업로드에 실패했습니다." }

Write-Host "완료: $destination"
Write-Host "웹 환경변수: NEXT_PUBLIC_FURNITURE_ASSET_BASE_URL=https://<CloudFront-도메인>/$cleanPrefix/"
