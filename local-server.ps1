$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 8082

$mimeTypes = @{
    '.css'  = 'text/css; charset=utf-8'
    '.html' = 'text/html; charset=utf-8'
    '.ico'  = 'image/x-icon'
    '.jpeg' = 'image/jpeg'
    '.jpg'  = 'image/jpeg'
    '.js'   = 'application/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.png'  = 'image/png'
    '.svg'  = 'image/svg+xml; charset=utf-8'
}

function Send-Response {
    param(
        [Parameter(Mandatory = $true)]
        [System.Net.Sockets.NetworkStream] $Stream,

        [Parameter(Mandatory = $true)]
        [int] $StatusCode,

        [Parameter(Mandatory = $true)]
        [string] $StatusText,

        [Parameter(Mandatory = $true)]
        [byte[]] $Body,

        [Parameter(Mandatory = $true)]
        [string] $ContentType
    )

    $header = @(
        "HTTP/1.1 $StatusCode $StatusText"
        "Content-Type: $ContentType"
        "Content-Length: $($Body.Length)"
        "Connection: close"
        ""
        ""
    ) -join "`r`n"

    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
    $Stream.Write($headerBytes, 0, $headerBytes.Length)
    $Stream.Write($Body, 0, $Body.Length)
}

function Get-RelativePath {
    param([string] $RawPath)

    $cleanPath = $RawPath.Split('?')[0]
    $relativePath = [System.Uri]::UnescapeDataString($cleanPath.TrimStart('/'))

    if ([string]::IsNullOrWhiteSpace($relativePath)) {
        return 'index.html'
    }

    return $relativePath
}

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
$listener.Start()

Write-Host "Serving $root at http://localhost:$port/"

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()

        try {
            $stream = $client.GetStream()
            $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
            $requestLine = $reader.ReadLine()

            if ([string]::IsNullOrWhiteSpace($requestLine)) {
                continue
            }

            while ($reader.ReadLine() -ne '') { }

            $parts = $requestLine.Split(' ')
            $method = $parts[0]
            $rawPath = $parts[1]

            if ($method -ne 'GET') {
                $body = [System.Text.Encoding]::UTF8.GetBytes('Method Not Allowed')
                Send-Response -Stream $stream -StatusCode 405 -StatusText 'Method Not Allowed' -Body $body -ContentType 'text/plain; charset=utf-8'
                continue
            }

            $relativePath = Get-RelativePath -RawPath $rawPath
            $targetPath = [System.IO.Path]::GetFullPath((Join-Path $root $relativePath))

            if (-not $targetPath.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path $targetPath) -or (Get-Item $targetPath).PSIsContainer) {
                $body = [System.Text.Encoding]::UTF8.GetBytes('Not Found')
                Send-Response -Stream $stream -StatusCode 404 -StatusText 'Not Found' -Body $body -ContentType 'text/plain; charset=utf-8'
                continue
            }

            $extension = [System.IO.Path]::GetExtension($targetPath).ToLowerInvariant()
            $contentType = if ($mimeTypes.ContainsKey($extension)) { $mimeTypes[$extension] } else { 'application/octet-stream' }
            $body = [System.IO.File]::ReadAllBytes($targetPath)

            Send-Response -Stream $stream -StatusCode 200 -StatusText 'OK' -Body $body -ContentType $contentType
        }
        catch {
            if ($stream) {
                $body = [System.Text.Encoding]::UTF8.GetBytes('Internal Server Error')
                Send-Response -Stream $stream -StatusCode 500 -StatusText 'Internal Server Error' -Body $body -ContentType 'text/plain; charset=utf-8'
            }
        }
        finally {
            if ($reader) { $reader.Dispose() }
            if ($stream) { $stream.Dispose() }
            $client.Dispose()
            Remove-Variable reader, stream -ErrorAction SilentlyContinue
        }
    }
}
finally {
    $listener.Stop()
}
