param(
  [Parameter(Mandatory = $true)][int]$ProcessId,
  [Parameter(Mandatory = $true)][string]$OutPath
)

Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class WindowCapture {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr handle, out Rect rect);
}
'@

$process = Get-Process -Id $ProcessId -ErrorAction Stop
$rect = New-Object WindowCapture+Rect
if ($process.MainWindowHandle -eq [IntPtr]::Zero -or -not [WindowCapture]::GetWindowRect($process.MainWindowHandle, [ref]$rect)) { throw "window handle unavailable for process $ProcessId" }
$width = $rect.Right - $rect.Left
$height = $rect.Bottom - $rect.Top
if ($width -le 0 -or $height -le 0) { throw "invalid window bounds $width x $height" }
$bitmap = New-Object System.Drawing.Bitmap $width, $height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bitmap.Size)
$bitmap.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
[PSCustomObject]@{ process_id = $ProcessId; bounds = @($rect.Left, $rect.Top, $width, $height); path = $OutPath } | ConvertTo-Json -Compress
