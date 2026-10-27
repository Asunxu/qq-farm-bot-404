$dir = "c:\Users\asin\Documents\qq-farm\qq-farm-bot-404-main\core\plugins\material-plugin\assets\seed_images_named"
$removed = Join-Path $dir ".removed"
if (-not (Test-Path $removed)) { New-Item -ItemType Directory -Path $removed -Force | Out-Null }

$filesToRemove = @(
    # Group 1 - 星星图标 (keep 1002_点券_star.png)
    "1003_累计充值_star.png",
    "3001_普通收藏点_star.png",
    "3002_典藏收藏点_star.png",
    # Group 2 - 裸数字 (keep 10017.png)
    "10018.png",
    "10020.png",
    # Group 3 (keep 1014_穗华_suihua.png)
    "1101_种植经验_exp.png",
    # Group 4 - 种子 asset (keep Crop_416_Seed.png)
    "Crop_9998_Seed.png",
    # Group 5 (keep 1040104_Seed.png)
    "1040112_Seed.png",
    # Group 6 (keep 21625.png)
    "41625.png",
    # Group 7 - 白萝卜 (keep 20002_白萝卜_Crop_2_Seed - .png which has 20002+2 IDs)
    "29999_白萝卜_Crop_2_Seed.png",
    # Group 8 (keep 21072.png)
    "41072.png"
)

$moved = 0
foreach ($f in $filesToRemove) {
    $src = Join-Path $dir $f
    $dst = Join-Path $removed $f
    if (Test-Path $src) {
        Move-Item $src $dst -Force
        $size = (Get-Item $dst).Length
        Write-Host "MOVED: $f ($size bytes) -> .removed/"
        $moved++
    } else {
        Write-Host "SKIP (not found): $f"
    }
}

Write-Host ""
Write-Host "Total moved to .removed/: $moved"
$remaining = (Get-ChildItem $dir -File -Filter *.png).Count
Write-Host "Remaining seed_images_named PNG files: $remaining"
