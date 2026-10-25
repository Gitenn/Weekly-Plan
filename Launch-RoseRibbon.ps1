$ErrorActionPreference = "Stop"
$baseUrl = "http://127.0.0.1:41731"
$healthUrl = "$baseUrl/api/health"
$plannerUrl = "$baseUrl/index.html"
$serverPath = Join-Path $PSScriptRoot "server.ps1"

$serverProcesses = @(Get-CimInstance Win32_Process | Where-Object {
    $_.ProcessId -ne $PID -and
    $_.Name -eq "powershell.exe" -and
    $_.CommandLine -match "(?i)-File\s+" -and
    $_.CommandLine.IndexOf($serverPath, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
})

foreach ($serverProcess in $serverProcesses) {
    Stop-Process -Id $serverProcess.ProcessId -ErrorAction Stop
}

$server = Start-Process -FilePath (Join-Path $PSHOME "powershell.exe") `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$serverPath`"") `
    -WindowStyle Hidden -PassThru

$ready = $false
for ($attempt = 0; $attempt -lt 40; $attempt++) {
    Start-Sleep -Milliseconds 300
    try {
        $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 1
        if ($health.app -eq "rose-ribbon-planner" -and $health.status -eq "ready") {
            $ready = $true
            break
        }
    } catch {
        $server.Refresh()
        if ($server.HasExited) { break }
    }
}

if (-not $ready) {
    $logPath = Join-Path $PSScriptRoot "logs\planner-server.log"
    $details = if (Test-Path -LiteralPath $logPath) { Get-Content -LiteralPath $logPath -Tail 10 | Out-String } else { "No server log was created." }
    throw "Rose & Ribbon could not start its local planner server. $details"
}

Start-Process $plannerUrl
