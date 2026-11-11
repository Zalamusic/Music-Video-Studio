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
    {key:'spotify',name:'Spotify',hosts:['open.spotify.com'],parts:[/^\/(track|episode)\/[a-z0-9]+\/?$/i]},
    {key:'soundcloud',name:'SoundCloud',hosts:['soundcloud.com','www.soundcloud.com'],parts:[/^\/[a-z0-9_.-]+\/[a-z0-9_.-]+\/?$/i]},
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
    if(!def)return {ok:false,error:'Supported song links: SUNO, Udio, YouTube, Spotify, or SoundCloud. Use the official song share URL.'};
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
