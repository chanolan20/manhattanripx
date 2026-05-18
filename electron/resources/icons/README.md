# App Icons

Place the following icon files here before building:

| File | Platform | Size |
|---|---|---|
| `ManhattanRIPX.icns` | macOS | Multi-size ICNS (16–1024px) |
| `ManhattanRIPX.iconset/` | macOS source | Folder of PNGs at standard sizes |
| `icon.ico` | Windows | Multi-size ICO (16–256px) |
| `icon.png` | Linux / fallback | 512×512 PNG |

## Generate from a 1024×1024 PNG source

```bash
# macOS: generate .icns
mkdir ManhattanRIPX.iconset
for size in 16 32 64 128 256 512; do
  sips -z $size $size source-1024.png --out ManhattanRIPX.iconset/icon_${size}x${size}.png
  sips -z $((size*2)) $((size*2)) source-1024.png --out ManhattanRIPX.iconset/icon_${size}x${size}@2x.png
done
iconutil -c icns ManhattanRIPX.iconset -o ManhattanRIPX.icns

# Windows: generate .ico (requires ImageMagick)
convert source-1024.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico
```
