$dir = "c:\Users\asin\Documents\qq-farm\qq-farm-bot-404-main\core\plugins\material-plugin\assets\seed_images_named"
$allFiles = Get-ChildItem $dir -File -Filter *.png

$crypto = [System.Security.Cryptography.SHA256]::Create()
$hashMap = @{}
foreach ($f in $allFiles) {
    $bytes = [System.IO.File]::ReadAllBytes($f.FullName)
    $hashBytes = $crypto.ComputeHash($bytes)
    $hashHex = ($hashBytes | ForEach-Object { $_.ToString("x2") }) -join ""
    if (-not $hashMap.ContainsKey($hashHex)) { $hashMap[$hashHex] = [System.Collections.ArrayList]::new() }
    [void]$hashMap[$hashHex].Add($f)
}

$groupNum = 0
foreach ($kv in $hashMap.GetEnumerator() | Where-Object { $_.Value.Count -gt 1 } | Sort-Object { $_.Value.Count } -Descending) {
    $groupNum++
    Write-Host ""
    Write-Host "=== GROUP $groupNum ($($kv.Value.Count) files) hash=$($kv.Key.Substring(0,16))... ==="
    foreach ($f in $kv.Value) {
        $nums = [regex]::Matches($f.Name, '\d+') | ForEach-Object { $_.Value }
        Write-Host "  $($f.Name) ($($f.Length) bytes)  IDs: $($nums -join ', ')"
    }
}
$crypto.Dispose()
Write-Host ""
Write-Host "Total duplicate groups: $groupNum"
