function packHsl(hue, saturation, lightness) {
  if (lightness > 179) {
    saturation = (saturation / 2) | 0;
  }
  if (lightness > 192) {
    saturation = (saturation / 2) | 0;
  }
  if (lightness > 217) {
    saturation = (saturation / 2) | 0;
  }
  if (lightness > 243) {
    saturation = (saturation / 2) | 0;
  }
  return ((saturation / 32) << 7) + ((hue / 4) << 10) + ((lightness / 2) | 0);
}
export { packHsl };
