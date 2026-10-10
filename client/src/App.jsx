
import React, {useEffect, useRef, useState} from "react";
import {io} from "socket.io-client";

const SERVER = "http://localhost:3001";
const socket = io(SERVER, {autoConnect:true});

function makeRoom(){ return Math.random().toString(36).slice(2,8).toUpperCase(); }

export default function App(){
  const [joined,setJoined]=useState(false);
  const [name,setName]=useState("");
  const [avatar,setAvatar]=useState("");
  const [room,setRoom]=useState("");
  const [joinCode,setJoinCode]=useState("");
  const [users,setUsers]=useState([]);
  const [messages,setMessages]=useState([]);
  const [text,setText]=useState("");
  const [video,setVideo]=useState(null);
  const [url,setUrl]=useState("");
  const [mic,setMic]=useState(false);
  const [sharing,setSharing]=useState(false);
  const [systemAudio,setSystemAudio]=useState(false);
  const [remoteScreen,setRemoteScreen]=useState(null);
  const localStream=useRef(null);
  const screenStream=useRef(null);
  const peers=useRef(new Map());
  const pendingCandidates=useRef(new Map());
  const screenVideo=useRef(null);
  const isChangingRemote=useRef(false);
  const lastSync=useRef(0);
  const yt=useRef(null);
  const ytReady=useRef(false);
  const suppressSync=useRef(false);
  const syncTimer=useRef(null);

  const getYTId = (u)=>{
    try{
      const x=new URL(u);
      if(x.hostname.includes("youtu.be")) return x.pathname.slice(1).split("?")[0];
      if(x.hostname.includes("youtube.com")) return x.searchParams.get("v") || x.pathname.split("/").pop();
    }catch{}
    return null;
  };

  const sendSync=(action,time)=>{
    if(!joined || suppressSync.current) return;
    socket.emit("video:sync",{room,action,time:typeof time==="number"?time:0});
  };

  useEffect(()=>{
    socket.on("room:state", ({users,peers})=>{
      setUsers(users||[]);
      // Existing peers create the connection; new peer creates offers to avoid offer glare.      // create offers to every existing peer
      (peers||[]).forEach(id=>startPeer(id,true));
    });
    socket.on("room:user-joined", ({users,peerId})=>{
      setUsers(users||[]);
      // Existing member makes offer to the newcomer.
      startPeer(peerId,true);
    });
    socket.on("room:user-left", ({users,peerId})=>{
      setUsers(users||[]);
      const p=peers.current.get(peerId); if(p){p.close();peers.current.delete(peerId);}
    });
    socket.on("chat:message",m=>setMessages(x=>[...x,m]));
    socket.on("video:state", state=>{
      if(!yt.current || !ytReady.current) return;
      const now=Date.now();
      if(now-lastSync.current<300) return;
      lastSync.current=now;
      const t=Number(state.time)||0;
      suppressSync.current=true;
      yt.current.seekTo(t,true);
      if(state.action==="play") yt.current.playVideo();
      if(state.action==="pause") yt.current.pauseVideo();
      setTimeout(()=>suppressSync.current=false,700);
    });
    socket.on("rtc:offer",async({from,offer})=>{
      const pc=getPeer(from,false);
      await pc.setRemoteDescription(offer);
      await flushCandidates(from,pc);
      const answer=await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("rtc:answer",{to:from,answer:pc.localDescription});
    });
    socket.on("rtc:answer",async({from,answer})=>{
      const pc=peers.current.get(from); if(pc) await pc.setRemoteDescription(answer);
      await flushCandidates(from,pc);
    });
    socket.on("rtc:ice",async({from,candidate})=>{
      const pc=peers.current.get(from);
      if(!pc || !pc.remoteDescription){ 
        if(!pendingCandidates.current.has(from)) pendingCandidates.current.set(from,[]);
        pendingCandidates.current.get(from).push(candidate); return;
      }
      try{await pc.addIceCandidate(candidate);}catch{}
    });
    return()=>socket.removeAllListeners();
  },[joined]);

  function getPeer(id,offerer){
    if(peers.current.has(id)) return peers.current.get(id);
    const pc=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});
    peers.current.set(id,pc);
    if(localStream.current) localStream.current.getTracks().forEach(t=>pc.addTrack(t,localStream.current));
    if(screenStream.current) screenStream.current.getTracks().forEach(t=>pc.addTrack(t,screenStream.current));
    pc.onicecandidate=e=>{if(e.candidate) socket.emit("rtc:ice",{to:id,candidate:e.candidate});};
    pc.ontrack=e=>{
      const stream=e.streams[0];
      if(!stream) return;
      const hasVideo=stream.getVideoTracks().length>0;
      if(hasVideo) setRemoteScreen(stream);
      else remoteAudio(stream);
    };
    pc.onconnectionstatechange=()=>{
      if(["failed","closed","disconnected"].includes(pc.connectionState)){
        pc.close(); peers.current.delete(id);
      }
    };
    if(offerer) createOffer(id,pc);
    return pc;
  }
  async function startPeer(id,offerer){ if(id!==socket.id) getPeer(id,offerer); }
  async function createOffer(id,pc){
    try{
      const offer=await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("rtc:offer",{to:id,offer:pc.localDescription});
    }catch(e){console.error(e);}
  }
  async function flushCandidates(id,pc){
    const arr=pendingCandidates.current.get(id)||[];
    for(const c of arr){try{await pc.addIceCandidate(c);}catch{}}
    pendingCandidates.current.delete(id);
  }
  function remoteAudio(stream){
    const a=new Audio();
    a.autoplay=true;a.srcObject=stream;
    a.play().catch(()=>{});
  }

  useEffect(()=>{
    if(screenVideo.current && remoteScreen) screenVideo.current.srcObject=remoteScreen;
  },[remoteScreen]);

  function fileAvatar(e){
    const f=e.target.files?.[0]; if(!f)return;
    if(f.size>1.5*1024*1024){alert("Profil fotoğrafı 1.5 MB'dan küçük olsun.");return;}
    const r=new FileReader(); r.onload=()=>setAvatar(r.result); r.readAsDataURL(f);
  }
  function enter(r){
    const clean=String(r||"").trim().toUpperCase();
    if(!name.trim()||!clean)return;
    setRoom(clean); setJoined(true);
    socket.emit("room:join",{room:clean,name:name.trim(),avatar});
  }
  function createRoom(){enter(makeRoom());}
  function sendChat(e){
    e?.preventDefault(); if(!text.trim())return;
    socket.emit("chat:send",{room,name,avatar,text:text.trim(),time:Date.now()});
    setText("");
  }
  function extractYouTube(u){
    const id=getYTId(u);
    if(!id){alert("Şimdilik yalnızca YouTube bağlantıları destekleniyor. Diğer siteler için ekran paylaşımını kullan.");return;}
    setVideo({youtubeId:id,url:u});
  }

  async function toggleMic(){
    if(mic){localStream.current?.getAudioTracks().forEach(t=>t.stop()); localStream.current=null; setMic(false); return;}
    try{
      const s=await navigator.mediaDevices.getUserMedia({audio:true});
      localStream.current=s; setMic(true);
      for(const [id,pc] of peers.current){
        s.getTracks().forEach(t=>pc.addTrack(t,s));
        createOffer(id,pc);
      }
    }catch{alert("Mikrofon izni verilmedi.");}
  }

  async function toggleShare(){
    if(sharing){
      screenStream.current?.getTracks().forEach(t=>t.stop()); screenStream.current=null; setSharing(false);
      for(const [id,pc] of peers.current){
        const senders=pc.getSenders().filter(s=>s.track?.kind==="video");
        senders.forEach(s=>pc.removeTrack(s));
        createOffer(id,pc);
      }
      return;
    }
    try{
      const s=await navigator.mediaDevices.getDisplayMedia({video:true,audio:systemAudio});
      screenStream.current=s; setSharing(true);
      s.getVideoTracks()[0].onended=()=>toggleShare();
      for(const [id,pc] of peers.current){
        s.getTracks().forEach(t=>pc.addTrack(t,s));
        createOffer(id,pc);
      }
    }catch{setSharing(false);}
  }

  function onPlayerReady(e){
    yt.current=e.target; ytReady.current=true;
  }
  function onPlayerStateChange(e){
    if(suppressSync.current)return;
    const Y=window.YT?.PlayerState;
    if(!Y)return;
    const action=e.data===Y.PLAYING?"play":e.data===Y.PAUSED?"pause":null;
    if(action){
      const t=yt.current?.getCurrentTime?.()||0;
      clearTimeout(syncTimer.current);
      syncTimer.current=setTimeout(()=>sendSync(action,t),150);
    }
  }
  useEffect(()=>{
    if(!joined)return;
    const id="yt-api";
    if(!document.getElementById(id)){
      const s=document.createElement("script");s.id=id;s.src="https://www.youtube.com/iframe_api";document.body.appendChild(s);
    }
    window.onYouTubeIframeAPIReady=()=>setYtLoaded(true);
    if(window.YT?.Player) setYtLoaded(true);
    return()=>{};
  },[joined]);
  const [ytLoaded,setYtLoaded]=useState(!!window.YT?.Player);

  useEffect(()=>{
    if(!ytLoaded || !video?.youtubeId)return;
    if(yt.current?.destroy)try{yt.current.destroy();}catch{}
    ytReady.current=false;
    yt.current=new window.YT.Player("youtube-player",{
      videoId:video.youtubeId,
      playerVars:{autoplay:0,controls:1,rel:0,modestbranding:1},
      events:{onReady:onPlayerReady,onStateChange:onPlayerStateChange}
    });
  },[ytLoaded,video?.youtubeId]);

  if(!joined) return <Home name={name} setName={setName} avatar={avatar} fileAvatar={fileAvatar} joinCode={joinCode} setJoinCode={setJoinCode} createRoom={createRoom} join={()=>enter(joinCode)}/>;

  return <div className="app">
    <header><div className="brand">SEYMA<span>TV</span></div><div className="roomBadge">ODA <b>{room}</b></div></header>
    <main className="layout">
      <section className="stage">
        <div className="videoBox">
          {video ? <div id="youtube-player" className="yt"></div> :
            <div className="empty"><div className="sigil">✦</div><h2>Yayın Alanı</h2><p>YouTube bağlantısı ekle veya ekranını paylaş.</p></div>}
        </div>
        <div className="remoteBox" style={{display:remoteScreen?"block":"none"}}>
          <video ref={screenVideo} autoPlay playsInline controls className="remoteVideo"/>
          <span className="remoteLabel">UZAKTAN EKRAN PAYLAŞIMI</span>
        </div>
        <form className="linkbar" onSubmit={e=>{e.preventDefault();extractYouTube(url)}}><input value={url} onChange={e=>setUrl(e.target.value)} placeholder="YouTube bağlantısını buraya yapıştır..."/><button>YAYINI AÇ</button></form>
        <div className="controls">
          <button className={mic?"active":""} onClick={toggleMic}>🎙 {mic?"Mikrofon Açık":"Mikrofon"}</button>
          <button className={sharing?"active":""} onClick={toggleShare}>🖥 {sharing?"Ekran Paylaşılıyor":"Ekran Paylaş"}</button>
          <button className={systemAudio?"active":""} onClick={()=>setSystemAudio(x=>!x)}>🔊 Sistem Sesi {systemAudio?"Açık":"Kapalı"}</button>
        </div>
      </section>
      <aside className="side">
        <section className="panel"><h3>ODADAKİLER <span>{users.length}</span></h3>{users.map(u=><div className="user" key={u.id}><Avatar src={u.avatar} name={u.name}/><div>{u.name}<small>{u.id===socket.id?"Sen": "Katılımcı"}</small></div></div>)}</section>
        <section className="panel chat"><h3>SOHBET</h3><div className="msgs">{messages.map(m=><div className="msg" key={m.id}><Avatar src={m.avatar} name={m.name}/><div><b>{m.name}</b><p>{m.text}</p></div></div>)}</div><form onSubmit={sendChat}><input value={text} onChange={e=>setText(e.target.value)} placeholder="Bir şey yaz..."/><button>➤</button></form></section>
      </aside>
    </main>
  </div>;
}

function Avatar({src,name}){return src?<img className="avatar" src={src}/>:<div className="avatar fallback">{(name||"?")[0].toUpperCase()}</div>}

function Home(p){
 return <div className="home"><div className="hero"><div className="brand big">SEYMA<span>TV</span></div><p className="subtitle">DARK WATCH PARTY</p><div className="card">
 <h1>Gecenin odasını kur.</h1><p>Arkadaşlarınla aynı yayını izle, konuş ve ekranını paylaş.</p>
 <input value={p.name} onChange={e=>p.setName(e.target.value)} placeholder="Kullanıcı adın"/>
 <label className="upload">Profil fotoğrafı seç<input type="file" accept="image/*" onChange={p.fileAvatar}/></label>
 <button className="primary" onClick={p.createRoom}>✦ ODA OLUŞTUR</button>
 <div className="or">VEYA</div><div className="join"><input value={p.joinCode} onChange={e=>p.setJoinCode(e.target.value)} placeholder="ODA KODU"/><button onClick={p.join}>KATIL</button></div>
 </div></div></div>
}
