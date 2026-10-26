$ErrorActionPreference = "Stop"
$port = 41731
$baseUrl = "http://127.0.0.1:$port/"
$dataPath = Join-Path $PSScriptRoot "planner-data.json"
$logDirectory = Join-Path $PSScriptRoot "logs"
$logPath = Join-Path $logDirectory "planner-server.log"
$livelyRoot = Join-Path $env:LOCALAPPDATA "Packages\12030rocksdanister.LivelyWallpaper_97hta09mmv6hy\LocalCache\Local\Lively Wallpaper\Library"
$livelySaveDataRoot = Join-Path $livelyRoot "SaveData"
$livelyWallpaperFolder = Join-Path $livelyRoot "wallpapers\rose-ribbon-planner"
$livelyWallpaperPath = Join-Path $livelyWallpaperFolder "index.html"
$maxRequestBytes = 1048576
$botanicalAssetPaths = @{
    "image-from-rawpixel-id-16823162-png.png" = Join-Path $PSScriptRoot "assets\botanical\image-from-rawpixel-id-16823162-png.png"
    "image-from-rawpixel-id-16733280-png.png" = Join-Path $PSScriptRoot "assets\botanical\image-from-rawpixel-id-16733280-png.png"
    "image-from-rawpixel-id-16733444-png.png" = Join-Path $PSScriptRoot "assets\botanical\image-from-rawpixel-id-16733444-png.png"
    "image-from-rawpixel-id-16745039-png.png" = Join-Path $PSScriptRoot "assets\botanical\image-from-rawpixel-id-16745039-png.png"
    "image-from-rawpixel-id-16816034-png(1).png" = Join-Path $PSScriptRoot "assets\botanical\image-from-rawpixel-id-16816034-png(1).png"
    "image-from-rawpixel-id-16822442-png.png" = Join-Path $PSScriptRoot "assets\botanical\image-from-rawpixel-id-16822442-png.png"
    "image-from-rawpixel-id-16823136-png.png" = Join-Path $PSScriptRoot "assets\botanical\image-from-rawpixel-id-16823136-png.png"
    "image-from-rawpixel-id-16823337-png.png" = Join-Path $PSScriptRoot "assets\botanical\image-from-rawpixel-id-16823337-png.png"
}

function Write-JsonResponse {
    param(
        [System.Net.HttpListenerResponse] $Response,
        [int] $StatusCode,
        [object] $Value
    )

    $json = ConvertTo-Json -InputObject $Value -Depth 12
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $Response.StatusCode = $StatusCode
    $Response.ContentType = "application/json; charset=utf-8"
    $Response.ContentLength64 = $bytes.Length
    $Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $Response.Close()
}

function Write-TextResponse {
    param(
        [System.Net.HttpListenerResponse] $Response,
        [int] $StatusCode,
        [string] $ContentType,
        [byte[]] $Bytes
    )

    $Response.StatusCode = $StatusCode
    $Response.ContentType = $ContentType
    $Response.ContentLength64 = $Bytes.Length
    $Response.OutputStream.Write($Bytes, 0, $Bytes.Length)
    $Response.Close()
}

function Normalize-DisplayWeek {
    param([object] $Value)

    if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) {
        return $null
    }
    if ($Value -isnot [string]) {
        throw "Displayed week must be a Monday date in yyyy-MM-dd format."
    }

    $weekStart = [datetime]::MinValue
    $validDate = [datetime]::TryParseExact(
        $Value,
        "yyyy-MM-dd",
        [System.Globalization.CultureInfo]::InvariantCulture,
        [System.Globalization.DateTimeStyles]::None,
        [ref]$weekStart
    )
    if (-not $validDate -or $weekStart.DayOfWeek -ne [System.DayOfWeek]::Monday) {
        throw "Displayed week must be a Monday date in yyyy-MM-dd format."
    }
    return $weekStart.ToString("yyyy-MM-dd", [System.Globalization.CultureInfo]::InvariantCulture)
}

function New-EmptyDefaultPlans {
    return [ordered]@{
        monday = @()
        tuesday = @()
        wednesday = @()
        thursday = @()
        friday = @()
    }
}

function New-EmptySchedule {
    return [ordered]@{
        initialized = $false
        version = 2
        revision = 0
        events = @()
        plans = [ordered]@{}
        defaultPlans = New-EmptyDefaultPlans
        daySettings = [ordered]@{}
        showWeekends = $false
        displayWeek = $null
    }
}

function Write-ScheduleFile {
    param([object] $Schedule)

    $json = ConvertTo-Json -InputObject $Schedule -Depth 12
    $temporaryPath = "$dataPath.tmp"
    [System.IO.File]::WriteAllText($temporaryPath, $json, [System.Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temporaryPath -Destination $dataPath -Force | Out-Null
}

function Read-Schedule {
    if (-not (Test-Path -LiteralPath $dataPath -PathType Leaf)) {
        return New-EmptySchedule
    }

    $saved = [System.IO.File]::ReadAllText($dataPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
    if ($null -eq $saved.events -or $null -eq $saved.plans) {
        throw "Saved schedule data is malformed."
    }

    if ($null -ne $saved.version -and [int]$saved.version -gt 2) {
        throw "Saved schedule version $($saved.version) is newer than this application supports."
    }

    if ($saved.version -ne 2) {
        $backupPath = "$dataPath.pre-v2.backup.json"
        if (-not (Test-Path -LiteralPath $backupPath -PathType Leaf)) {
            [System.IO.File]::Copy($dataPath, $backupPath, $false)
        }

        $daySettings = [ordered]@{}
        foreach ($event in @($saved.events)) {
            $eventDate = [string]$event.date
            $parsedDate = [datetime]::MinValue
            $isValidDate = [datetime]::TryParseExact(
                $eventDate,
                "yyyy-MM-dd",
                [System.Globalization.CultureInfo]::InvariantCulture,
                [System.Globalization.DateTimeStyles]::None,
                [ref]$parsedDate
            )
            if ($isValidDate) {
                $daySettings[$eventDate] = [ordered]@{ useDefault = $false }
            }
        }

        $revision = 0L
        if ($null -ne $saved.revision) {
            $parsedRevision = 0L
            if (-not [long]::TryParse([string]$saved.revision, [ref]$parsedRevision) -or $parsedRevision -lt 0) {
                throw "Saved schedule revision is invalid."
            }
            $revision = $parsedRevision
        }

        $saved = [ordered]@{
            version = 2
            revision = $revision
            events = @($saved.events)
            plans = $saved.plans
            defaultPlans = New-EmptyDefaultPlans
            daySettings = $daySettings
            showWeekends = $saved.showWeekends -eq $true
            displayWeek = Normalize-DisplayWeek $saved.displayWeek
        }
        Write-ScheduleFile $saved
    } elseif ($null -eq $saved.defaultPlans -or $null -eq $saved.daySettings -or $null -eq $saved.revision) {
        throw "Saved version 2 schedule is malformed."
    }

    return [ordered]@{
        initialized = $true
        version = 2
        revision = [long]$saved.revision
        events = @($saved.events)
        plans = $saved.plans
        defaultPlans = $saved.defaultPlans
        daySettings = $saved.daySettings
        showWeekends = $saved.showWeekends -eq $true
        displayWeek = Normalize-DisplayWeek $saved.displayWeek
    }
}

function Set-ScheduleSnapshot {
    param(
        [string] $Html,
        [object] $Schedule
    )

    $scheduleJson = ConvertTo-Json -InputObject ([ordered]@{
        version = 2
        revision = [long]$Schedule.revision
        events = @($Schedule.events)
        plans = $Schedule.plans
        defaultPlans = $Schedule.defaultPlans
        daySettings = $Schedule.daySettings
        showWeekends = $Schedule.showWeekends -eq $true
        displayWeek = Normalize-DisplayWeek $Schedule.displayWeek
    }) -Depth 12 -Compress
    $scheduleJson = $scheduleJson.Replace("<", "\u003c").Replace(">", "\u003e").Replace("&", "\u0026")
    $markerPattern = '(?m)^\s*window\.ROSE_RIBBON_DATA = .*; // ROSE_RIBBON_DATA\s*$'
    if ([regex]::Matches($Html, $markerPattern).Count -ne 1) {
        throw "Wallpaper page must contain exactly one schedule marker."
    }
    $replacement = [System.Text.RegularExpressions.MatchEvaluator]{
        param($match)
        "      window.ROSE_RIBBON_DATA = $scheduleJson; // ROSE_RIBBON_DATA"
    }
    return [regex]::Replace($Html, $markerPattern, $replacement)
}

function Write-WallpaperSnapshot {
    param([object] $Schedule)

    $templatePath = Join-Path $PSScriptRoot "index.html"
    if (-not (Test-Path -LiteralPath $templatePath -PathType Leaf)) {
        throw "Planner page not found: $templatePath"
    }
    if (-not (Test-Path -LiteralPath $livelyWallpaperFolder -PathType Container)) {
        throw "Lively wallpaper folder not found: $livelyWallpaperFolder"
    }

    $template = [System.IO.File]::ReadAllText($templatePath, [System.Text.Encoding]::UTF8)
    $page = Set-ScheduleSnapshot $template $Schedule
    [System.IO.File]::WriteAllText($livelyWallpaperPath, $page, [System.Text.UTF8Encoding]::new($false))
}

function Sync-LivelyTemporaryCopies {
    param(
        [object] $Schedule,
        [switch] $RefreshAssets
    )

    $temporaryRoot = Join-Path $livelySaveDataRoot "wptmp"
    if (-not (Test-Path -LiteralPath $temporaryRoot -PathType Container)) {
        return
    }

    $projectTemplatePath = Join-Path $PSScriptRoot "index.html"
    $template = [System.IO.File]::ReadAllText($projectTemplatePath, [System.Text.Encoding]::UTF8)
    $page = Set-ScheduleSnapshot $template $Schedule
    $targetFolders = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    $libraryPrefix = [System.IO.Path]::GetFullPath($livelyRoot).TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
    $temporaryPrefix = [System.IO.Path]::GetFullPath($temporaryRoot).TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
    $playerProcesses = Get-CimInstance Win32_Process -Filter "Name = 'Lively.Player.WebView2.exe'"

    foreach ($playerProcess in $playerProcesses) {
        $urlMatch = [regex]::Match($playerProcess.CommandLine, '--wallpaper-url\s+"(?<page>[^"]+)"')
        if (-not $urlMatch.Success) {
            continue
        }

        $pagePath = [System.IO.Path]::GetFullPath($urlMatch.Groups["page"].Value)
        if (-not $pagePath.StartsWith($libraryPrefix, [System.StringComparison]::OrdinalIgnoreCase) -or
            -not (Test-Path -LiteralPath $pagePath -PathType Leaf)) {
            continue
        }

        $folderPath = Split-Path -Parent $pagePath
        if (-not $folderPath.StartsWith($temporaryPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
            continue
        }
        $existingPage = [System.IO.File]::ReadAllText($pagePath, [System.Text.Encoding]::UTF8)
        if ($existingPage -notmatch '(?i)<title>Rose\s*(?:&amp;|&)\s*Ribbon\s*(?:\u2014|-)\s*Weekly Planner</title>') {
            continue
        }

        $null = $targetFolders.Add($folderPath)
    }

    if ($targetFolders.Count -eq 0) {
        foreach ($folder in Get-ChildItem -LiteralPath $temporaryRoot -Directory) {
            $pagePath = Join-Path $folder.FullName "index.html"
            if (-not (Test-Path -LiteralPath $pagePath -PathType Leaf)) {
                continue
            }
            $existingPage = [System.IO.File]::ReadAllText($pagePath, [System.Text.Encoding]::UTF8)
            if ($existingPage -match '(?i)<title>Rose\s*(?:&amp;|&)\s*Ribbon\s*(?:\u2014|-)\s*Weekly Planner</title>') {
                $null = $targetFolders.Add($folder.FullName)
            }
        }
    }

    foreach ($folderPath in $targetFolders) {
        $pagePath = Join-Path $folderPath "index.html"
        [System.IO.File]::WriteAllText($pagePath, $page, [System.Text.UTF8Encoding]::new($false))
        foreach ($fileName in @("styles.css", "app.js")) {
            Copy-Item -LiteralPath (Join-Path $PSScriptRoot $fileName) -Destination (Join-Path $folderPath $fileName) -Force | Out-Null
        }

        if (-not $RefreshAssets) {
            continue
        }

        $assetFolder = Join-Path $folderPath "assets\botanical"
        if (-not (Test-Path -LiteralPath $assetFolder -PathType Container)) {
            New-Item -ItemType Directory -Path $assetFolder -Force | Out-Null
        }
        foreach ($assetName in $botanicalAssetPaths.Keys) {
            Copy-Item -LiteralPath $botanicalAssetPaths[$assetName] -Destination (Join-Path $assetFolder $assetName) -Force
        }
    }
}

function Get-LivelyWallpaperFolder {
    if (-not (Test-Path -LiteralPath (Join-Path $livelyRoot "wallpapers") -PathType Container)) {
        return $null
    }
    foreach ($candidate in (Get-ChildItem -LiteralPath (Join-Path $livelyRoot "wallpapers") -Directory -ErrorAction SilentlyContinue)) {
        $indexPath = Join-Path $candidate.FullName "index.html"
        if (-not (Test-Path -LiteralPath $indexPath -PathType Leaf)) {
            continue
        }
        $content = [System.IO.File]::ReadAllText($indexPath, [System.Text.Encoding]::UTF8)
        if ($content -match 'window\.ROSE_RIBBON_DATA') {
            return $candidate.FullName
        }
    }
    return $null
}


function Initialize-LivelyWallpaper {
    $discovered = Get-LivelyWallpaperFolder
    if ($null -eq $discovered) {
        Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format o) Lively wallpaper folder not found; skipping wallpaper initialization."
        return
    }
    $script:livelyWallpaperFolder = $discovered
    $script:livelyWallpaperPath = Join-Path $discovered "index.html"

    foreach ($fileName in @("styles.css", "app.js")) {
        $sourcePath = Join-Path $PSScriptRoot $fileName
        if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
            throw "Planner file not found: $sourcePath"
        }
        Copy-Item -LiteralPath $sourcePath -Destination (Join-Path $livelyWallpaperFolder $fileName) -Force
    }

    $assetFolder = Join-Path $livelyWallpaperFolder "assets\botanical"
    if (-not (Test-Path -LiteralPath $assetFolder -PathType Container)) {
        New-Item -ItemType Directory -Path $assetFolder -Force | Out-Null
    }
    foreach ($assetName in $botanicalAssetPaths.Keys) {
        $sourceAsset = $botanicalAssetPaths[$assetName]
        if (-not (Test-Path -LiteralPath $sourceAsset -PathType Leaf)) {
            throw "Botanical wallpaper asset not found: $sourceAsset"
        }
        Copy-Item -LiteralPath $sourceAsset -Destination (Join-Path $assetFolder $assetName) -Force
    }

    $schedule = Read-Schedule
    Write-WallpaperSnapshot $schedule
    Sync-LivelyTemporaryCopies $schedule -RefreshAssets
}

function Write-Schedule {
    param([object] $Schedule)

    if ($null -eq $Schedule.events -or $null -eq $Schedule.plans) {
        throw "Schedule must contain events and plans."
    }
    if (@($Schedule.events).Count -gt 1000) {
        throw "Schedule has too many appointments."
    }

    $current = Read-Schedule
    $clientRevision = 0L
    if ($Schedule.version -ne 2 -or
        -not [long]::TryParse([string]$Schedule.revision, [ref]$clientRevision) -or
        $clientRevision -lt 0 -or
        $clientRevision -ne [long]$current.revision) {
        return [ordered]@{ saved = $false; schedule = $current }
    }
    if ($null -eq $Schedule.defaultPlans -or $null -eq $Schedule.daySettings) {
        throw "Schedule must use the version 2 data model."
    }

    $persisted = [ordered]@{
        version = 2
        revision = ([long]$current.revision) + 1
        events = @($Schedule.events)
        plans = $Schedule.plans
        defaultPlans = $Schedule.defaultPlans
        daySettings = $Schedule.daySettings
        showWeekends = $Schedule.showWeekends -eq $true
        displayWeek = Normalize-DisplayWeek $Schedule.displayWeek
    }
    Write-ScheduleFile $persisted

    try {
        $folder = Get-LivelyWallpaperFolder
        if ($null -ne $folder) {
            $script:livelyWallpaperFolder = $folder
            $script:livelyWallpaperPath = Join-Path $folder "index.html"
            Write-WallpaperSnapshot $persisted
        }
        # Sync every active Lively temp copy, not just the one for the running process.
        $tempRoot = Join-Path $livelySaveDataRoot "wptmp"
        if (Test-Path -LiteralPath $tempRoot -PathType Container) {
            foreach ($tempFolder in (Get-ChildItem -LiteralPath $tempRoot -Directory -ErrorAction SilentlyContinue)) {
                $tempIndex = Join-Path $tempFolder.FullName "index.html"
                if (Test-Path -LiteralPath $tempIndex -PathType Leaf) {
                    $tempContent = [System.IO.File]::ReadAllText($tempIndex, [System.Text.Encoding]::UTF8)
                    if ($tempContent -match 'window\.ROSE_RIBBON_DATA') {
                        $updated = Set-ScheduleSnapshot $tempContent $persisted
                        [System.IO.File]::WriteAllText($tempIndex, $updated, [System.Text.UTF8Encoding]::new($false))
                        foreach ($fileName in @("styles.css", "app.js")) {
                            Copy-Item -LiteralPath (Join-Path $PSScriptRoot $fileName) -Destination (Join-Path $tempFolder.FullName $fileName) -Force -ErrorAction SilentlyContinue
                        }
                    }
                }
            }
        }
        Sync-LivelyTemporaryCopies $persisted
    } catch {
        Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format o) Wallpaper sync failed: $($_.Exception.Message)"
    }
    return [ordered]@{ saved = $true; revision = $persisted.revision }
}

function Handle-Request {
    param([System.Net.HttpListenerContext] $Context)

    $request = $Context.Request
    $response = $Context.Response
    $path = $request.Url.AbsolutePath
    $response.Headers["Access-Control-Allow-Origin"] = "*"
    $response.Headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    $response.Headers["Access-Control-Allow-Headers"] = "Content-Type"

    if ($request.HttpMethod -eq "OPTIONS") {
        $response.StatusCode = 204
        $response.Close()
        return
    }

    if ($path -eq "/api/health" -and $request.HttpMethod -eq "GET") {
        Write-JsonResponse $response 200 @{ app = "rose-ribbon-planner"; status = "ready" }
        return
    }

    if ($path -eq "/api/schedule" -and $request.HttpMethod -eq "GET") {
        Write-JsonResponse $response 200 (Read-Schedule)
        return
    }

    if ($path -eq "/api/schedule" -and $request.HttpMethod -eq "POST") {
        if ($request.ContentLength64 -gt $maxRequestBytes) {
            Write-JsonResponse $response 413 @{ error = "Schedule data is too large." }
            return
        }
        $encoding = $request.ContentEncoding
    if ($null -eq $encoding -or $encoding.WebName -ne 'utf-8') {
        $encoding = [System.Text.Encoding]::UTF8
    }
    $reader = [System.IO.StreamReader]::new($request.InputStream, $encoding)
        try {
            $body = $reader.ReadToEnd()
        } finally {
            $reader.Dispose()
        }

        $schedule = ConvertFrom-Json -InputObject $body
        $result = Write-Schedule $schedule
        if (-not $result.saved) {
            Write-JsonResponse $response 409 @{ error = "Schedule revision is out of date."; schedule = $result.schedule }
            return
        }
        Write-JsonResponse $response 200 @{ saved = $true; revision = $result.revision }
        return
    }

    if ($request.HttpMethod -ne "GET") {
        Write-JsonResponse $response 405 @{ error = "Method not allowed." }
        return
    }

    if ($path.StartsWith("/assets/botanical/")) {
        $assetName = [System.Uri]::UnescapeDataString($path.Substring("/assets/botanical/".Length))
        $assetPath = $botanicalAssetPaths[$assetName]
        if ($null -eq $assetPath) {
            Write-JsonResponse $response 404 @{ error = "Not found." }
            return
        }
        if (-not (Test-Path -LiteralPath $assetPath -PathType Leaf)) {
            Write-JsonResponse $response 404 @{ error = "Image not found." }
            return
        }
        Write-TextResponse $response 200 "image/png" ([System.IO.File]::ReadAllBytes($assetPath))
        return
    }

    $fileName = switch ($path) {
        "/" { "index.html" }
        "/index.html" { "index.html" }
        "/wallpaper.html" { "index.html" }
        "/styles.css" { "styles.css" }
        "/app.js" { "app.js" }
        default { $null }
    }
    if ($null -eq $fileName) {
        Write-JsonResponse $response 404 @{ error = "Not found." }
        return
    }

    $filePath = Join-Path $PSScriptRoot $fileName
    if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
        Write-JsonResponse $response 404 @{ error = "Page not found." }
        return
    }
    $bytes = [System.IO.File]::ReadAllBytes($filePath)
    $contentType = switch ([System.IO.Path]::GetExtension($filePath).ToLowerInvariant()) {
        ".css" { "text/css; charset=utf-8" }
        ".js" { "application/javascript; charset=utf-8" }
        default { "text/html; charset=utf-8" }
    }
    Write-TextResponse $response 200 $contentType $bytes
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($baseUrl)
if (-not (Test-Path -LiteralPath $logDirectory -PathType Container)) {
    New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
}
try {
    Initialize-LivelyWallpaper
    $listener.Start()
} catch {
    Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format o) Listener failed: $($_.Exception.Message)"
    throw
}

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        try {
            Handle-Request $context
        } catch {
            Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format o) Request failed: $($_.Exception.Message)"
            if ($context.Response.OutputStream.CanWrite) {
                try {
                    Write-JsonResponse $context.Response 500 @{ error = "The local planner could not complete this request." }
                } catch {
                    Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format o) Could not return request error: $($_.Exception.Message)"
                }
            }
        }
    }
} finally {
    $listener.Stop()
    $listener.Close()
}
