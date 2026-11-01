$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$workspacePath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$zipPath = Join-Path $workspacePath 'lumen-free.zip'
$extensionPath = Join-Path $workspacePath 'lumen-free'
$packageFiles = @(Get-ChildItem -LiteralPath $extensionPath -Recurse -File) + @(Get-Item -LiteralPath (Join-Path $workspacePath 'XC.md'))
$zipStream = [IO.File]::Open($zipPath, [IO.FileMode]::Create, [IO.FileAccess]::Write)
$archiveWriter = [IO.Compression.ZipArchive]::new($zipStream, [IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($packageFile in $packageFiles) {
        $entryName = $packageFile.FullName.Substring($workspacePath.Length + 1).Replace('\','/')
        $zipEntry = $archiveWriter.CreateEntry($entryName, [IO.Compression.CompressionLevel]::Optimal)
        $entryStream = $zipEntry.Open()
        $sourceStream = [IO.File]::OpenRead($packageFile.FullName)
        try { $sourceStream.CopyTo($entryStream) } finally { $sourceStream.Dispose(); $entryStream.Dispose() }
    }
} finally { $archiveWriter.Dispose(); $zipStream.Dispose() }
$archiveReader = [IO.Compression.ZipFile]::OpenRead($zipPath)
try {
    $names = @($archiveReader.Entries.FullName)
    if ($names -notcontains 'lumen-free/manifest.json' -or $names -notcontains 'XC.md') { throw 'Archive layout failed verification.' }
    $manifestReader = [IO.StreamReader]::new($archiveReader.GetEntry('lumen-free/manifest.json').Open())
    try {
        $manifest = $manifestReader.ReadToEnd() | ConvertFrom-Json
        if ($manifest.manifest_version -ne 3) { throw 'Invalid packed manifest.' }
        $targets = @($manifest.background.service_worker, $manifest.action.default_popup, $manifest.chrome_url_overrides.newtab) + @($manifest.icons.PSObject.Properties.Value)
        foreach ($target in $targets) { if ($names -notcontains ('lumen-free/' + $target)) { throw ('Missing packed file: ' + $target) } }
    } finally { $manifestReader.Dispose() }
    Write-Output ('Verified package with ' + $names.Count + ' entries.')
} finally { $archiveReader.Dispose() }
$packageHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash
[IO.File]::WriteAllText((Join-Path $workspacePath 'reports/package-sha256.txt'), $packageHash + '  lumen-free.zip' + [Environment]::NewLine)
Get-Item -LiteralPath $zipPath | Select-Object Name, Length
