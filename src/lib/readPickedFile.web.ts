/** Web: the picker gives us a standard browser File object. */
import type { DocumentPickerAsset } from 'expo-document-picker';

export async function readPickedFile(asset: DocumentPickerAsset): Promise<string> {
  if (asset.file) return asset.file.text();
  const res = await fetch(asset.uri);
  return res.text();
}
