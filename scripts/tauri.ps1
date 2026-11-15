# The app manifest requires administrator access, and cargo cannot request a UAC
# prompt. Start tauri dev from an elevated process tree instead.

$repoRoot = Split-Path -Parent $PSScriptRoot
$tauriArgs = @($args)

function Test-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if ($tauriArgs.Count -gt 0 -and $tauriArgs[0] -eq 'dev' -and -not (Test-Administrator)) {
    Write-Host 'Administrator access is required for tauri dev. Accept the UAC prompt. Dev runs in the elevated console; close it to stop.'

    $elevatedArgs = @(
        '-NoProfile'
        '-ExecutionPolicy', 'Bypass'
        '-File', "`"$PSCommandPath`""
    ) + $tauriArgs

    try {
        $process = Start-Process -FilePath 'powershell.exe' -ArgumentList $elevatedArgs -Verb RunAs -WorkingDirectory $repoRoot -PassThru -Wait
    }
    catch {
        Write-Error 'Elevation was cancelled. tauri dev did not start.'
        exit 1
    }

    exit $process.ExitCode
}

Set-Location -LiteralPath $repoRoot
& (Join-Path $repoRoot 'node_modules\.bin\tauri.cmd') @tauriArgs
exit $LASTEXITCODE
