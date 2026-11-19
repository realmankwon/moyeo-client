const path = require('node:path');
const iconPath = name => path.join(__dirname, '../src/assets/icons', name);
const appIconPath = iconPath('icon256.png');
function trayImage(nativeImage, { platform = process.platform, unread = false, logo = '' } = {}) {
  if (platform === 'darwin') {
    const image = nativeImage.createFromPath(iconPath(unread ? 'tray-unreadTemplate.png' : 'trayTemplate.png'));
    image.setTemplateImage(true);
    return image;
  }
  if (logo) {
    const custom = nativeImage.createFromDataURL(logo);
    if (!custom.isEmpty()) {
      const image = custom.resize({ width: 32, height: 32 });
      if (!unread) return image;
      const bytes = image.toBitmap();
      for (let y = 0; y < 15; y++) for (let x = 18; x < 32; x++) {
        const distance = Math.hypot(x - 25, y - 7), at = (y * 32 + x) * 4;
        if (distance < 6.5) { const color = distance < 4.8 ? [126,119,238] : [255,255,255]; for(let c=0;c<3;c++)bytes[at+c]=color[c]; bytes[at+3]=255; }
      }
      return nativeImage.createFromBitmap(bytes, { width: 32, height: 32 });
    }
  }
  return nativeImage.createFromPath(iconPath(unread ? 'tray-unread.png' : 'tray.png'));
}
module.exports = { appIconPath, iconPath, trayImage };
