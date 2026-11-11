/** Pure local-worker media checks. File extensions and browser MIME labels are not trusted. */
export function detectLocalMedia({song,photo}={}) {
 if(!Buffer.isBuffer(song)||!Buffer.isBuffer(photo))throw Error('Song and artist photo required');
 if(song.length<1000||song.length>32*1024*1024)throw Error('Song must be between 1KB and 32MB');
 if(photo.length<1000||photo.length>12*1024*1024)throw Error('Photo must be between 1KB and 12MB');
 const wav=song.toString('ascii',0,4)==='RIFF'&&song.toString('ascii',8,12)==='WAVE';
 const mp3=song.toString('ascii',0,3)==='ID3'||(song[0]===0xff&&(song[1]&0xe0)===0xe0);
 if(!wav&&!mp3)throw Error('Local model requires MP3 or WAV audio');
 const png=photo.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 const jpg=photo[0]===0xff&&photo[1]===0xd8;
 const webp=photo.toString('ascii',0,4)==='RIFF'&&photo.toString('ascii',8,12)==='WEBP';
 if(!png&&!jpg&&!webp)throw Error('Local model requires JPEG, PNG, or WebP artist photo');
 return {songExtension:wav?'wav':'mp3',photoExtension:png?'png':webp?'webp':'jpg'};
}
