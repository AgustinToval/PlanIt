// Client-side image compression before upload. Everything stored in the
// backend is a base64 data-URL in Postgres (Render free tier = 1 GB), so we
// resize + re-encode as JPEG here to keep uploads ~10x smaller than raw photos.
import * as ImageManipulator from "expo-image-manipulator";

export async function compressToDataUrl(
  uri: string,
  maxWidth = 1080,
  quality = 0.6
): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: maxWidth } }],
    { compress: quality, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );
  return `data:image/jpeg;base64,${result.base64}`;
}
