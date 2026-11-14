/**
 * CutLoopz — supported song-link recognition; NO media extraction.
 * Provider song pages are links for project planning only. Their terms govern
 * accessing actual audio. Upload an approved MP3/WAV for beat analysis.
 */
(function (root) {
  'use strict';
  const definitions = [
    {key:'suno',name:'SUNO',hosts:['suno.com','www.suno.com'],parts:[/^\/(song|s|hook)\/[a-z0-9_-]+\/?$/i]},
    {key:'udio',name:'Udio',hosts:['udio.com','www.udio.com'],parts:[/^\/(songs|song)\/[a-z0-9_-]+(?:\/.*)?$/i]},
    {key:'youtube',name:'YouTube',hosts:['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com'],parts:[/^\/watch$/i,/^\/shorts\/[a-z0-9_-]+\/?$/i]},
    {key:'youtube',name:'YouTube',hosts:['youtu.be','www.youtu.be'],parts:[/^\/[a-z0-9_-]{6,}(?:\/)?$/i]},
    // Spotify shares both canonical songs and regionalized /intl-XX/ URLs.
    {key:'spotify',name:'Spotify',hosts:['open.spotify.com'],parts:[/^\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?(track|episode)\/[a-z0-9]{6,64}\/?$/i]},
    // Android/iOS Share often produces an official shortened Spotify URL.
    // Save as a reference only: the short link destination is not resolved or streamed.
    {key:'spotify',name:'Spotify',hosts:['spotify.link','www.spotify.link'],parts:[/^\/[a-z0-9_-]{5,80}\/?$/i]},
    {key:'soundcloud',name:'SoundCloud',hosts:['soundcloud.com','www.soundcloud.com'],parts:[/^\/[a-z0-9_.-]+\/[a-z0-9_.-]+\/?$/i]},
    // TikTok video links are references for free creative direction only; no audio is imported.
    {key:'tiktok',name:'TikTok',hosts:['tiktok.com','www.tiktok.com','m.tiktok.com'],parts:[/^\/@[a-z0-9_.-]+\/video\/[0-9]{10,22}\/?$/i]},
    {key:'tiktok',name:'TikTok',hosts:['vm.tiktok.com','vt.tiktok.com'],parts:[/^\/[a-z0-9_-]{5,45}\/?$/i]},
  ];
  function inspect(value){
    const raw=String(value||'').trim();
    if(!raw || raw.length>2048)return {ok:false,error:'Enter a valid song link (2,048 characters maximum).'};
    let url;
    try{url=new URL(raw);}catch{return {ok:false,error:'Paste a complete https:// song URL.'};}
    if(url.protocol!=='https:' || url.username || url.password || url.port)
      return {ok:false,error:'Use an ordinary HTTPS song link without embedded login credentials.'};
    const host=url.hostname.toLowerCase();
    const def=definitions.find(x=>x.hosts.includes(host)&&x.parts.some(p=>p.test(url.pathname)));
    if(!def){
      if(host==='open.spotify.com' || host==='spotify.link' || host==='www.spotify.link')
        return {ok:false,error:'For Spotify, use Copy Song Link from a track (or the official spotify.link short share URL). Artist, album, and playlist links are not individual songs.'};
      return {ok:false,error:'Supported reference links: SUNO, Udio, YouTube, Spotify, SoundCloud, or TikTok. Use an official public song or video share URL.'};
    }
    if(def.key==='youtube' && url.pathname.toLowerCase()==='/watch' && !/^[a-z0-9_-]{6,20}$/i.test(url.searchParams.get('v')||''))
      return {ok:false,error:'This YouTube link is missing its video ID.'};
    // Strip navigation/tracking query data; do not retain sensitive auth tokens.
    const clean=new URL(url.origin+url.pathname);
    if(def.key==='youtube'&&url.pathname.toLowerCase()==='/watch')clean.searchParams.set('v',url.searchParams.get('v'));
    return {ok:true,provider:def.key,name:def.name,url:clean.toString(),requiresAudioUpload:true};
  }
  // Keep navigation deterministic and testable. A link never represents audio.
  function navigation(current, action, {hasAudio=false,linkAccepted=false}={}){
    const page=Math.max(0,Math.min(4,Number(current)||0));
    if(action==='next'){
      if(page===4)return 0;
      if(page===0 && linkAccepted && !hasAudio)return 2;
      return page+1;
    }
    if(action==='back'){
      if(page===2 && linkAccepted && !hasAudio)return 0;
      return Math.max(0,page-1);
    }
    return page;
  }
  root.CutLoopzSongLink=Object.freeze({inspect,navigation});
})(typeof window!=='undefined'?window:globalThis);
