# QQ Farm Bot 部署打包脚本
# 用途：把服务器 Docker 部署（core/Dockerfile + update.sh 流程）所需的文件
#       复制到 deploy-package 目录，其他一律不放。
# 用法：在项目根目录执行  .\pack-deploy.ps1
param()
$ErrorActionPreference = 'Stop'

$Root = $PSScriptRoot
$PkgName = 'qq-farm-bot-main'   # 包内顶层文件夹名，与服务器部署目录一致
$Dest = Join-Path (Join-Path $Root 'deploy-package') $PkgName

# ===== 1. 清理重建输出目录 =====
$OutDir = Join-Path $Root 'deploy-package'
if (Test-Path $OutDir) { Remove-Item $OutDir -Recurse -Force }
New-Item -ItemType Directory -Path $Dest -Force | Out-Null

# ===== 2. 工具函数 =====
function Copy-DirClean {
    param([string]$From, [string]$To, [string[]]$ExcludeDirs = @())
    $args = @($From, $To, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP')
    if ($ExcludeDirs.Count -gt 0) { $args += @('/XD') + $ExcludeDirs }
    robocopy @args | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "robocopy 失败: $From -> $To (code $LASTEXITCODE)" }
}

function Copy-Files {
    param([string]$From, [string]$To, [string[]]$Files)
    foreach ($f in $Files) {
        $src = Join-Path $From $f
        if (Test-Path $src) {
            $target = Join-Path $To $f
            New-Item -ItemType Directory -Path (Split-Path $target -Parent) -Force | Out-Null
            Copy-Item $src $target -Force
        } else {
            Write-Host "  [跳过] 不存在: $f" -ForegroundColor Yellow
        }
    }
}

# ===== 3. 复制根目录文件（Docker 构建入口 + pnpm workspace 配置）=====
Write-Host '[1/4] 复制根目录配置...' -ForegroundColor Cyan
Copy-Files -From $Root -To $Dest -Files @(
    'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml',
    '.dockerignore', '.gitignore', '.gitattributes'
)

# ===== 4. 复制 core（后端：源码 + 官方配置素材 + Dockerfile）=====
Write-Host '[2/4] 复制 core...' -ForegroundColor Cyan
New-Item -ItemType Directory -Path (Join-Path $Dest 'core') -Force | Out-Null
Copy-DirClean -From (Join-Path $Root 'core\src') -To (Join-Path $Dest 'core\src')
Copy-Files -From (Join-Path $Root 'core') -To (Join-Path $Dest 'core') -Files @(
    'Dockerfile', 'client.js', 'capture-server.js',
    'package.json', 'pnpm-lock.yaml', 'package-lock.json', 'eslint.config.mjs'
)

# ===== 5. 复制 web（前端源码 + 公共素材；dist 由服务器构建时生成）=====
Write-Host '[3/4] 复制 web...' -ForegroundColor Cyan
New-Item -ItemType Directory -Path (Join-Path $Dest 'web') -Force | Out-Null
Copy-DirClean -From (Join-Path $Root 'web\src') -To (Join-Path $Dest 'web\src')
Copy-DirClean -From (Join-Path $Root 'web\public') -To (Join-Path $Dest 'web\public')
Copy-Files -From (Join-Path $Root 'web') -To (Join-Path $Dest 'web') -Files @(
    'index.html', 'vite.config.ts', 'uno.config.ts', 'eslint.config.js',
    'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json',
    'package.json', 'pnpm-lock.yaml', 'package-lock.json'
)

# ===== 6. 统计输出 =====
Write-Host '[4/4] 统计结果...' -ForegroundColor Cyan
$m = Get-ChildItem $Dest -Recurse -File | Measure-Object Length -Sum
Write-Host ''
Write-Host ("打包完成: {0}" -f $Dest) -ForegroundColor Green
Write-Host ("  文件数: {0}" -f $m.Count)
Write-Host ("  总体积: {0:N1} MB" -f ($m.Sum / 1MB))
Write-Host ''
Write-Host '已排除: node_modules、web/dist(服务器构建时生成)、core/data(运行数据/账号凭证)、测试、日志' -ForegroundColor DarkGray
