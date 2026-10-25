import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

/** A bundled asset's bytes (a `require()`d module): from the app's own files on a phone, fetched on the web. */
export async function readAssetBytes(module: number): Promise<ArrayBuffer> {
  const [asset] = await Asset.loadAsync(module);
  const uri = asset.localUri ?? asset.uri;
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    if (!response.ok) throw new Error(`Asset request failed (${response.status})`);
    return response.arrayBuffer();
  }
  return new File(uri).arrayBuffer();
}
