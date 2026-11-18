import * as FileSystem from 'expo-file-system/legacy';
import type {Photo} from './types';
export async function retainPhoto(source: string): Promise<Photo> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const root = `${FileSystem.documentDirectory}equipment-photos/`;
  await FileSystem.makeDirectoryAsync(root,{intermediates:true});
  const ext = (source.split('?')[0].split('.').pop() || 'jpg').toLowerCase();
  const safeExt=['jpg','jpeg','png','heic','webp'].includes(ext)?ext:'jpg';
  const uri=`${root}${id}.${safeExt}`;
  await FileSystem.copyAsync({from:source,to:uri});
  const info=await FileSystem.getInfoAsync(uri,{size:true});
  if(!info.exists) throw new Error('Failed to persist photo');
  return {id,uri,name:`${id}.${safeExt}`,mime:safeExt==='png'?'image/png':safeExt==='webp'?'image/webp':safeExt==='heic'?'image/heic':'image/jpeg',size:info.size || 0};
}
export async function readChunk(uri:string,position:number,length:number) {
  return FileSystem.readAsStringAsync(uri,{encoding:FileSystem.EncodingType.Base64,position,length});
}
