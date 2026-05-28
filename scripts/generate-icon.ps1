Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$build = Join-Path $root "build"
New-Item -ItemType Directory -Force -Path $build | Out-Null

function New-RoundedRectPath($x, $y, $w, $h, $r) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    if ($r -lt 1) {
        $path.AddRectangle((New-Object System.Drawing.Rectangle $x, $y, $w, $h))
        return $path
    }
    $d = $r * 2
    $path.AddArc($x, $y, $d, $d, 180, 90)
    $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    return $path
}

function Fill-RoundedRect($graphics, $brush, $x, $y, $w, $h, $r) {
    $path = New-RoundedRectPath $x $y $w $h $r
    $graphics.FillPath($brush, $path)
    $path.Dispose()
}

function New-IconBitmap($size) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.Clear([System.Drawing.Color]::Transparent)

    $scale = $size / 1024.0
    $bgPath = New-RoundedRectPath 0 0 $size $size ([int](220 * $scale))
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Point 0,0),
        (New-Object System.Drawing.Point $size,$size),
        [System.Drawing.Color]::FromArgb(255, 10, 132, 255),
        [System.Drawing.Color]::FromArgb(255, 10, 61, 145)
    )
    $g.FillPath($bgBrush, $bgPath)

    $green = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 52, 199, 89))
    $g.FillEllipse($green, [int](706*$scale), [int](150*$scale), [int](152*$scale), [int](152*$scale))

    $bag = New-RoundedRectPath ([int](316*$scale)) ([int](388*$scale)) ([int](392*$scale)) ([int](476*$scale)) ([int](42*$scale))
    $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 250, 255, 252))
    $g.FillPath($white, $bag)

    $penHandle = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), ([Math]::Max(3, [int](54*$scale)))
    $penHandle.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $penHandle.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $rectHandle = New-Object System.Drawing.Rectangle ([int](390*$scale)), ([int](232*$scale)), ([int](244*$scale)), ([int](222*$scale))
    $g.DrawArc($penHandle, $rectHandle, 180, 180)

    $blue = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 0, 122, 255))
    Fill-RoundedRect $g $blue ([int](398*$scale)) ([int](512*$scale)) ([int](228*$scale)) ([int](58*$scale)) ([int](29*$scale))
    Fill-RoundedRect $g $green ([int](398*$scale)) ([int](610*$scale)) ([int](228*$scale)) ([int](58*$scale)) ([int](29*$scale))

    if ($size -ge 64) {
        $font = New-Object System.Drawing.Font "Segoe UI", ([int](126*$scale)), ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
        $textBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 28, 30, 33))
        $format = New-Object System.Drawing.StringFormat
        $format.Alignment = [System.Drawing.StringAlignment]::Center
        $format.LineAlignment = [System.Drawing.StringAlignment]::Center
        $rect = New-Object System.Drawing.RectangleF 0, ([float](690*$scale)), ([float]$size), ([float](130*$scale))
        $g.DrawString("GVI", $font, $textBrush, $rect, $format)
        $font.Dispose()
        $textBrush.Dispose()
        $format.Dispose()
    }

    $penHandle.Dispose()
    $bgBrush.Dispose()
    $green.Dispose()
    $blue.Dispose()
    $white.Dispose()
    $bag.Dispose()
    $bgPath.Dispose()
    $g.Dispose()
    return $bmp
}

$pngPath = Join-Path $build "icon.png"
$icoPath = Join-Path $build "icon.ico"
$sizes = @(16, 24, 32, 48, 64, 128, 256)
$images = @()

foreach ($s in $sizes) {
    $bmp = New-IconBitmap $s
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    if ($s -eq 256) {
        $bmp.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    $images += [PSCustomObject]@{ Size = $s; Bytes = $ms.ToArray() }
    $ms.Dispose()
    $bmp.Dispose()
}

$fs = [System.IO.File]::Create($icoPath)
$bw = New-Object System.IO.BinaryWriter $fs
$bw.Write([UInt16]0)
$bw.Write([UInt16]1)
$bw.Write([UInt16]$images.Count)
$offset = 6 + (16 * $images.Count)
foreach ($img in $images) {
    $dim = if ($img.Size -eq 256) { 0 } else { $img.Size }
    $bw.Write([Byte]$dim)
    $bw.Write([Byte]$dim)
    $bw.Write([Byte]0)
    $bw.Write([Byte]0)
    $bw.Write([UInt16]1)
    $bw.Write([UInt16]32)
    $bw.Write([UInt32]$img.Bytes.Length)
    $bw.Write([UInt32]$offset)
    $offset += $img.Bytes.Length
}
foreach ($img in $images) {
    $bw.Write($img.Bytes)
}
$bw.Close()
$fs.Close()

Write-Host "Iconos generados:"
Write-Host " - $pngPath"
Write-Host " - $icoPath"
