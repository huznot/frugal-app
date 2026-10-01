"""
makes the google play listing images from the app icon:
  store-assets/play-icon-512.png       (512x512 app icon)
  store-assets/feature-graphic.png     (1024x500 feature graphic)

  pip install pillow
  python scripts/make-store-graphics.py
"""
import os

from PIL import Image, ImageDraw, ImageFont

root = os.path.join(os.path.dirname(__file__), "..")
out = os.path.join(root, "store-assets")
os.makedirs(out, exist_ok=True)

icon = Image.open(os.path.join(root, "assets", "icon.png")).convert("RGBA")

# 512x512 icon: the logo's red rounded square fills the canvas (play adds its own rounding)
bbox = icon.getbbox()
square = icon.crop(bbox)
side = max(square.size)
canvas = Image.new("RGBA", (side, side), (255, 80, 80, 255))
canvas.paste(square, ((side - square.width) // 2, (side - square.height) // 2), square)
canvas.resize((512, 512), Image.LANCZOS).save(os.path.join(out, "play-icon-512.png"))

# 1024x500 feature graphic
W, H = 1024, 500
fg = Image.new("RGB", (W, H), (255, 80, 80))
draw = ImageDraw.Draw(fg)
font_dir = os.path.join(root, "node_modules", "@expo-google-fonts")
title = ImageFont.truetype(os.path.join(font_dir, "fredoka", "700Bold", "Fredoka_700Bold.ttf"), 120)
tag = ImageFont.truetype(os.path.join(font_dir, "poppins", "500Medium", "Poppins_500Medium.ttf"), 34)

# the logo sits on a soft darker shadow so it lifts off the red background
from PIL import ImageFilter
logo = square.resize((300, 300), Image.LANCZOS)
shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
mask = logo.split()[3]
shadow.paste((150, 20, 20, 110), (84, 112), mask)
shadow = shadow.filter(ImageFilter.GaussianBlur(18))
fg = Image.alpha_composite(fg.convert("RGBA"), shadow)
fg.paste(logo, (80, 100), logo)
fg = fg.convert("RGB")
draw = ImageDraw.Draw(fg)

draw.text((440, 120), "Frugal", font=title, fill=(255, 255, 255))
draw.text((446, 270), "Cheapest groceries near you", font=tag, fill=(255, 255, 255))
draw.text((446, 322), "Scan, compare, save.", font=tag, fill=(255, 225, 225))
fg.save(os.path.join(out, "feature-graphic.png"))

print("wrote", os.listdir(out))
