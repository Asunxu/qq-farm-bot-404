# QQ Farm Bot 部署打包脚本
# 用途：用 git archive 从本地仓库生成部署压缩包（与 GitHub Download ZIP 内容一致）。
#       只包含 git 跟踪的文件，自动排除 node_modules、web/dist、core/data 等未跟踪内容。
# 用法：在项目根目录执行  .\pack-deploy.ps1
# 注意：打包内容 = 最近一次提交（HEAD）。有未提交改动时请先提交再打包。
param()
$ErrorActionPreference = 'Stop'

$Root = $PSScriptRoot
$PkgName = 'qq-farm-bot-main'   # 压缩包内顶层文件夹名，与服务器部署目录一致
$OutDir = Join-Path $Root 'deploy-package'
$ZipPath = Join-Path $OutDir "$PkgName.zip"

# ===== 1. 清理重建输出目录（robocopy 镜像法可删除超长路径残留）=====
if (Test-Path $OutDir) {
    $empty = Join-Path $env:TEMP ('empty_' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $empty -Force | Out-Null
    robocopy $empty $OutDir /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
    Remove-Item $OutDir -Recurse -Force
    Remove-Item $empty -Recurse -Force
}
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

# ===== 2. 提示工作区状态（未提交的改动不会进入压缩包）=====
$dirty = @(git -C $Root status --porcelain)
if ($dirty.Count -gt 0) {
    Write-Host ('警告: 工作区有 {0} 个未提交改动，本次打包的是最近一次提交 (HEAD) 的内容' -f $dirty.Count) -ForegroundColor Yellow
}

# ===== 3. git archive 生成压缩包 =====
Write-Host '[1/2] git archive 生成压缩包...' -ForegroundColor Cyan
git -C $Root archive --format=zip --prefix="$PkgName/" --output=$ZipPath HEAD
if ($LASTEXITCODE -ne 0) { throw "git archive 失败 (code $LASTEXITCODE)" }

# ===== 4. 校验并统计 =====
Write-Host '[2/2] 校验压缩包完整性...' -ForegroundColor Cyan
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
$entries = $zip.Entries.Count
$zip.Dispose()
if ($entries -le 0) { throw '压缩包为空或损坏' }
$file = Get-Item $ZipPath

Write-Host ''
Write-Host ("打包完成: {0}" -f $ZipPath) -ForegroundColor Green
Write-Host ("  条目数: {0}" -f $entries)
Write-Host ("  总体积: {0:N1} MB" -f ($file.Length / 1MB))
Write-Host ''
Write-Host '内容 = git 跟踪的全部文件（基于最新提交）' -ForegroundColor DarkGray
Write-Host '已自动排除: node_modules、web/dist、core/data(运行数据/凭证)、日志、未跟踪文件' -ForegroundColor DarkGray
