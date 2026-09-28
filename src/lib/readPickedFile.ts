/** Phones: read a picked file from disk with expo-file-system. */
import { File } from 'expo-file-system';
import type { DocumentPickerAsset } from 'expo-document-picker';

export async function readPickedFile(asset: DocumentPickerAsset): Promise<string> {
  return new File(asset.uri).text();
}
