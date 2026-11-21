# Export Chrome icon sizes from the original generated Flow artwork.
Add-Type -AssemblyName System.Drawing
$iconDirectory = Join-Path $PSScriptRoot '../public/icons'
$sourcePath = Join-Path $PSScriptRoot '../assets/branding/flow-icon.png'
New-Item -ItemType Directory -Force -Path $iconDirectory | Out-Null
$source = [System.Drawing.Image]::FromFile($sourcePath)
try {
    foreach ($size in @(16, 32, 48, 128)) {
        $bitmap = New-Object System.Drawing.Bitmap($size, $size)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $attributes = New-Object System.Drawing.Imaging.ImageAttributes
        try {
            $graphics.Clear([System.Drawing.Color]::Transparent)
            $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
            $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $attributes.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
            $rectangle = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
            $graphics.DrawImage($source, $rectangle, 0, 0, $source.Width, $source.Height, [System.Drawing.GraphicsUnit]::Pixel, $attributes)
            $bitmap.Save((Join-Path $iconDirectory "$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
            if ($size -in @(16, 32)) {
                # A contrasting play symbol distinguishes running focus from the idle clock.
                $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
                $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
                $face = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#7052b5'))
                $unit = $size / 16.0
                $play = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#fffefa'))
                try {
                    $graphics.FillEllipse($face, [single](2 * $unit), [single](2 * $unit), [single](12 * $unit), [single](12 * $unit))
                    $triangle = [System.Drawing.PointF[]]@(
                        [System.Drawing.PointF]::new([single](6.5 * $unit), [single](4.8 * $unit)),
                        [System.Drawing.PointF]::new([single](6.5 * $unit), [single](11.2 * $unit)),
                        [System.Drawing.PointF]::new([single](11.2 * $unit), [single](8 * $unit))
                    )
                    $graphics.FillPolygon($play, $triangle)
                    $bitmap.Save((Join-Path $iconDirectory "running-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
                }
                finally {
                    $face.Dispose()
                    $play.Dispose()
                }
            }
        }
        finally {
            $attributes.Dispose()
            $graphics.Dispose()
            $bitmap.Dispose()
        }
    }
}
finally { $source.Dispose() }
