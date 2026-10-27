$dir = "c:\Users\asin\Documents\qq-farm\qq-farm-bot-404-main\core\plugins\material-plugin\assets\seed_images_named"
$jsonPath = "c:\Users\asin\Documents\qq-farm\qq-farm-bot-404-main\core\plugins\material-plugin\catalog\EventPlants.json"
$json = Get-Content $jsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
$allFiles = Get-ChildItem $dir -File -Filter *.png

Write-Host "=== Seed Images by Name/ID vs Content Hash ==="
Write-Host "Total EventPlants: $($json.Count)"
Write-Host "Total seed_images_named files: $($allFiles.Count)"
Write-Host ""

# Build content hash map first (SHA256)
$crypto = [System.Security.Cryptography.SHA256]::Create()
$hashMap = @{}
foreach ($f in $allFiles) {
    $bytes = [System.IO.File]::ReadAllBytes($f.FullName)
    $hashBytes = $crypto.ComputeHash($bytes)
    $hashHex = ($hashBytes | ForEach-Object { $_.ToString("x2") }) -join ""
    if (-not $hashMap.ContainsKey($hashHex)) { $hashMap[$hashHex] = @() }
    $hashMap[$hashHex] += $f.Name
}

Write-Host "Unique content hashes: $($hashMap.Count)"
Write-Host ""

# Now check each EventPlant
$missingByName = @()
foreach ($p in $json) {
    $assetName = $p.asset_name
    $seedId = $p.seed_id
    $fruitId = $p.fruit_id
    $name = $p.name
    $plantId = $p.id

    if (-not $assetName) {
        Write-Host "NO_ASSET: $name (plant=$plantId) -- SKIP"
        continue
    }

    # Check by asset_name, seed_id, fruit_id patterns
    $matches = @()
    foreach ($f in $allFiles) {
        $fn = $f.Name
        $hit = $false
        if ($fn -match [regex]::Escape($assetName)) { $hit = $true }
        if ($seedId -and $fn -match "(^|_)$seedId(_|\.)") { $hit = $true }
        if ($fruitId -and $fn -match "(^|_)$fruitId(_|\.)") { $hit = $true }
        if ($hit) { $matches += $fn }
    }

    if ($matches.Count -eq 0) {
        $missingByName += @{ name=$name; plantId=$plantId; seedId=$seedId; fruitId=$fruitId; asset=$assetName }
    }
}

Write-Host "=== MISSING BY NAME/ID CHECK: $($missingByName.Count) plants ==="
foreach ($m in $missingByName) {
    Write-Host "  MISS: $($m.name)  seed=$($m.seedId) fruit=$($m.fruitId) asset=$($m.asset)"
}
Write-Host ""

# Now for each missing, check if ANY file has same hash as a sibling (like Crop_21 == Crop_218?)
# More useful: show which files share same content hash (deduplication candidates)
Write-Host "=== DUPLICATE CONTENT GROUPS (same hash, different filenames) ==="
foreach ($kv in $hashMap.GetEnumerator() | Where-Object { $_.Value.Count -gt 1 } | Sort-Object { $_.Value.Count } -Descending) {
    Write-Host "  Group ($($kv.Value.Count) files, $($kv.Key.Substring(0,12))...):"
    foreach ($n in $kv.Value) { Write-Host "    $n" }
}
Write-Host ""

# For each missing plant, also check if its asset_name content exists under a different number
Write-Host "=== MISSING PLANT ASSET CROSS-CHECK ==="
foreach ($m in $missingByName) {
    # e.g. Crop_21 -> look for any file whose hash matches Crop_21 pattern from related files
    Write-Host "  $($m.name) asset=$($m.asset) -- checking plant_images/ subfolder..."
    $plantImgDir = "c:\Users\asin\Documents\qq-farm\qq-farm-bot-404-main\core\plugins\material-plugin\assets\plant_images"
    if (Test-Path $plantImgDir) {
        $subMatches = Get-ChildItem $plantImgDir -Recurse -File -Include *.png | Where-Object { $_.Name -match [regex]::Escape($m.asset) }
        if ($subMatches) {
            Write-Host "    FOUND in plant_images: $($subMatches.FullName -join ', ')"
        }
    }
}

$crypto.Dispose()
Write-Host ""
Write-Host "=== DONE ==="
