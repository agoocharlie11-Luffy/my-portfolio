import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const CONFIG=window.OFFICE_CONFIG||{supabaseUrl:'',supabaseAnonKey:'',edgeFunction:'office-api'};
const $=id=>document.getElementById(id);
const configured=typeof CONFIG.supabaseUrl==='string'&&CONFIG.supabaseUrl.startsWith('https://')&&typeof CONFIG.supabaseAnonKey==='string'&&CONFIG.supabaseAnonKey.length>20;
const supabase=configured?createClient(CONFIG.supabaseUrl,CONFIG.supabaseAnonKey):null;
const bots=[
{id:'manager',name:'Operations Manager',desc:'Monitors workflow health, recent runs and operational alerts.',workflow:'n8n workspace overview',state:'pending'},
{id:'invoice',name:'Invoice Bot',desc:'Receives supplier PDFs, extracts invoice details, validates totals and prepares Xero draft bills for human review.',workflow:'Gmail Invoice to Xero · tQI3pUdsQbnJuuaK',state:'pending'},
{id:'reporting',name:'Reporting Bot',desc:'Builds the prior-week accrual P&L and current receivables snapshot, then updates Sheets and emails the summary.',workflow:'Weekly Xero Financial Summary · mRYVXiXmHJYcbaud',state:'pending'},
{id:'caption',name:'Caption Bot',desc:'Planned video transcription and caption generation department.',workflow:'Video workflow connection not configured',state:'planned'},
{id:'posting',name:'Posting Bot',desc:'Planned publishing and post-status tracking for Facebook and YouTube.',workflow:'Publishing workflow connection not configured',state:'planned'},
{id:'scheduler',name:'Scheduler Bot',desc:'Coordinates scheduled tasks and upcoming automation runs.',workflow:'Existing schedule triggers are managed inside n8n',state:'pending'}];
let session=null,selected='manager',renderer,scene,camera,controls,clock3d,energy,figure,figureMat,recognition=null,recognizing=false,visualMode='idle',speakTimer=null,lipSyncRaf=null,audioCtx=null,analyser=null,freqData=null,activeAudio=null,resizeObserver;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function setVoiceDynamics(level,mouth){
  const root=document.documentElement;
  root.style.setProperty('--voice-level',clamp(level,0,1).toFixed(3));
  root.style.setProperty('--mouth-open',clamp(mouth,0,1).toFixed(3));
}
function setMode(mode){
  visualMode=mode;
  const labels={
    idle:['ENERGY IDLE','Standing by · ready when you are'],
    listening:['LISTENING','Receiving your voice · forming projection'],
    thinking:['PROCESSING','Thinking · connecting to your AI workflow'],
    speaking:['SPEAKING','Charlie is responding · voice synchronized']
  };
  $('holo-state').textContent=labels[mode][0];
  $('holo-subtitle').textContent=labels[mode][1];
  $('mic').classList.toggle('listening',mode==='listening');
  $('sound-bars').classList.toggle('active',mode==='speaking'||mode==='listening');
  const sceneEl=$('scene');
  if(sceneEl)sceneEl.dataset.mode=mode;
  if(mode!=='speaking')setVoiceDynamics(0,0);
  if(figureMat)figureMat.opacity=mode==='idle'?.12:mode==='thinking'?.35:.92;
}
function showLogin(){$('login').hidden=false;$('app').hidden=true}
function showApp(){$('login').hidden=true;$('app').hidden=false;if(!renderer)initScene();setMode('idle');renderDepartments();selectBot(selected);refreshData();initSpeech()}
function setError(s){$('login-error').textContent=s||''}
$('login-form').addEventListener('submit',async e=>{e.preventDefault();setError('');if(!supabase){setError('Supabase configuration is missing in office/config.js.');return}const {data,error}=await supabase.auth.signInWithPassword({email:$('email').value,password:$('password').value});if(error){setError(error.message);return}session=data.session;showApp()});
$('signout').addEventListener('click',async()=>{if(supabase)await supabase.auth.signOut();session=null;stopRecognition();stopLipSync();showLogin()});
$('refresh').addEventListener('click',refreshData);
function statusLabel(s){return s==='active'?'CONNECTED':s==='planned'?'PLANNED':'SETUP'}
function renderDepartments(){const root=$('departments');root.innerHTML='';for(const b of bots){const el=document.createElement('button');el.type='button';el.className='department'+(b.id===selected?' selected':'');const strong=document.createElement('strong');strong.textContent=b.name;const p=document.createElement('p');p.textContent=b.desc;const status=document.createElement('span');status.className='status '+b.state;status.textContent=statusLabel(b.state);el.append(strong,p,status);el.addEventListener('click',()=>selectBot(b.id));root.appendChild(el)}}
function selectBot(id){selected=id;const b=bots.find(x=>x.id===id);if(!b)return;$('bot-name').textContent=b.name;$('bot-desc').textContent=b.desc;$('bot-workflow').textContent=b.workflow;$('bot-status').textContent=statusLabel(b.state);$('bot-status').className='status '+b.state;renderDepartments()}
async function refreshData(){if(!session||!supabase)return;$('connection').textContent='SYNCING';try{const {data,error}=await supabase.functions.invoke(CONFIG.edgeFunction,{body:{action:'overview'}});if(error)throw error;if(data?.workflows)for(const w of data.workflows){const b=bots.find(x=>x.id===w.id);if(b&&w.status)b.state=w.status}$('connection').textContent=data?.backendConnected?'BACKEND CONNECTED':'AUTHENTICATED';$('connection').className='pill status active';const logs=data?.recentExecutions||[];$('activity').textContent=logs.length?logs.map(x=>`${x.workflowName||'Workflow'} · ${x.status||'Unknown'} · ${x.startedAt||''}`).join('\n'):'No recent execution records returned yet.';renderDepartments();selectBot(selected)}catch(e){$('connection').textContent='BACKEND OFFLINE';$('connection').className='pill muted-pill';$('activity').textContent='The secure backend is not reachable yet. Check the Supabase Edge Function and n8n webhook configuration.'}}
function addMessage(role,text){const wrap=document.createElement('div');wrap.className='message '+role;const label=document.createElement('span');label.className='message-label';label.textContent=role==='user'?'YOU':'CHARLIE';const p=document.createElement('p');p.textContent=text;wrap.append(label,p);$('chat-log').appendChild(wrap);$('chat-log').scrollTop=$('chat-log').scrollHeight;return p}
function voiceLocale(){return $('language').value||'en-US'}
function stopLipSync(){
  if(lipSyncRaf){cancelAnimationFrame(lipSyncRaf);lipSyncRaf=null}
  clearInterval(speakTimer);
  speakTimer=null;
  setVoiceDynamics(0,0);
}
function attachAnalyser(audioEl){
  try{
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC)return false;
    if(!audioCtx)audioCtx=new AC();
    if(audioCtx.state==='suspended')audioCtx.resume().catch(()=>{});
    if(!audioEl._mediaSource){
      audioEl._mediaSource=audioCtx.createMediaElementSource(audioEl);
      const localAnalyser=audioCtx.createAnalyser();
      localAnalyser.fftSize=256;
      localAnalyser.smoothingTimeConstant=.72;
      audioEl._mediaSource.connect(localAnalyser);
      localAnalyser.connect(audioCtx.destination);
      audioEl._analyser=localAnalyser;
    }
    analyser=audioEl._analyser;
    freqData=new Uint8Array(analyser.frequencyBinCount);
    return true;
  }catch(err){
    console.warn('Web Audio analyser unavailable, using fallback cadence:',err);
    return false;
  }
}
function startLipSync(audioEl){
  stopLipSync();
  const hasAnalyser=audioEl?attachAnalyser(audioEl):false;
  let phase=0;
  const step=()=>{
    phase+=.19;
    let level=0,mouth=0;
    if(hasAnalyser&&analyser&&freqData&&audioEl&&!audioEl.paused&&!audioEl.ended){
      analyser.getByteFrequencyData(freqData);
      let sum=0,voiceSum=0;
      const voiceBins=Math.min(freqData.length,40);
      for(let i=0;i<voiceBins;i++){
        const v=freqData[i]/255;
        sum+=v;
        if(i>=2&&i<=28)voiceSum+=v;
      }
      const avg=sum/voiceBins;
      const speechEnergy=voiceSum/27;
      level=clamp(speechEnergy*2.1,0,1);
      const syllableMod=.55+.45*Math.sin(phase*3.7);
      mouth=clamp((avg*1.9+speechEnergy*1.1)*syllableMod,0,1);
    }else{
      const cadence=Math.abs(Math.sin(phase*1.65))*Math.abs(Math.cos(phase*.85));
      level=clamp(cadence*.85,0,1);
      mouth=clamp(cadence*.95,0,1);
    }
    setVoiceDynamics(level,mouth);
    if(energy){
      const a=energy.geometry.attributes.position;
      const base=energy.userData.base;
      for(let i=0;i<a.count;i++){
        const x=base[i*3],y=base[i*3+1],z=base[i*3+2];
        const wave=Math.sin(phase*2.5+y*3+Math.atan2(z,x)*2)*(.006+level*.014);
        a.setXYZ(i,x*(1+wave*2),y+wave,z*(1+wave*2));
      }
      a.needsUpdate=true;
    }
    lipSyncRaf=requestAnimationFrame(step);
  };
  lipSyncRaf=requestAnimationFrame(step);
}
async function playElevenLabsAudio(data){
  if(typeof data?.audioBase64!=='string'||!data.audioBase64.length){
    stopLipSync();
    setMode('idle');
    $('voice-note').textContent='Text reply received, but no ElevenLabs audio was returned. Check the Charlie TTS workflow.';
    return;
  }
  if(activeAudio){
    activeAudio.pause();
    activeAudio.currentTime=0;
  }
  window.speechSynthesis?.cancel();
  const mime=typeof data.audioMimeType==='string'?data.audioMimeType:'audio/mpeg';
  const audio=new Audio('data:'+mime+';base64,'+data.audioBase64);
  audio.crossOrigin='anonymous';
  activeAudio=audio;
  audio.onplay=()=>{
    setMode('speaking');
    startLipSync(audio);
    $('voice-note').textContent='Charlie is speaking with ElevenLabs voice.';
  };
  audio.onended=()=>{
    if(activeAudio===audio)activeAudio=null;
    stopLipSync();
    setMode('idle');
  };
  audio.onerror=()=>{
    if(activeAudio===audio)activeAudio=null;
    stopLipSync();
    setMode('idle');
    $('voice-note').textContent='ElevenLabs audio was returned but could not be played.';
  };
  try{
    await audio.play();
  }catch(playError){
    console.error('ElevenLabs playback error:',playError);
    if(activeAudio===audio)activeAudio=null;
    stopLipSync();
    setMode('idle');
    $('voice-note').textContent='ElevenLabs audio playback was blocked or failed.';
  }
}
async function askAssistant(message){
  const text=String(message||'').trim();
  if(!text)return;
  if(text.length>2000){
    addMessage('assistant','Please keep each message under 2,000 characters.');
    return;
  }
  addMessage('user',text);
  $('chat-status').textContent='Connecting…';
  $('chat-input').value='';
  setMode('thinking');
  if(!session||!supabase){
    addMessage('assistant','Your session is not authenticated. Please sign in again.');
    $('chat-status').textContent='Not signed in';
    setMode('idle');
    return;
  }
  try{
    const {data,error}=await supabase.functions.invoke(CONFIG.edgeFunction,{
      body:{
        action:'chat',
        message:text,
        language:voiceLocale(),
        voice:true
      }
    });
    if(error)throw error;
    const reply=typeof data?.reply==='string'?data.reply:
      typeof data?.output==='string'?data.output:
      typeof data?.text==='string'?data.text:
      typeof data?.response==='string'?data.response:'';
    if(!reply){
      addMessage('assistant',data?.error||'Charlie did not return a text reply.');
      $('chat-status').textContent='AI workflow not ready';
      setMode('idle');
      return;
    }
    addMessage('assistant',reply);
    $('chat-status').textContent='Reply received';
    await playElevenLabsAudio(data);
  }catch(err){
    console.error('Charlie chat error:',err);
    addMessage('assistant','I could not reach the AI service. Check the office-api Edge Function and n8n webhook.');
    $('chat-status').textContent='Connection unavailable';
    stopLipSync();
    setMode('idle');
  }
}
$('chat-form').addEventListener('submit',e=>{e.preventDefault();askAssistant($('chat-input').value)});
function initSpeech(){const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){$('mic').disabled=true;$('voice-note').textContent='Voice input is not supported in this browser. You can still chat using text. Try a current version of Chrome or Edge over HTTPS.';return}recognition=new SR();recognition.lang=voiceLocale();recognition.interimResults=false;recognition.maxAlternatives=1;recognition.onstart=()=>{recognizing=true;setMode('listening');$('voice-note').textContent='Listening… speak now.'};recognition.onresult=e=>{const transcript=e.results?.[0]?.[0]?.transcript||'';if(transcript)askAssistant(transcript)};recognition.onerror=e=>{$('voice-note').textContent=e.error==='not-allowed'?'Microphone permission was denied. Allow microphone access in your browser settings.':'Voice input error: '+e.error+'. You can use text chat instead.';recognizing=false;setMode('idle')};recognition.onend=()=>{recognizing=false;if(visualMode==='listening')setMode('idle');$('mic').querySelector('b').textContent='Talk to Charlie'};$('mic').addEventListener('click',()=>{if(recognizing){stopRecognition();return}try{recognition.lang=voiceLocale();recognition.start();$('mic').querySelector('b').textContent='Stop listening'}catch(e){$('voice-note').textContent='Microphone is busy. Please try again.'}})}
function stopRecognition(){if(recognition&&recognizing)recognition.stop();recognizing=false}
$('language').addEventListener('change',()=>{if(recognition)recognition.lang=voiceLocale()});
function random(min,max){return min+Math.random()*(max-min)}
function initScene(){const host=$('scene');scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(38,host.clientWidth/host.clientHeight,.1,100);camera.position.set(0,2.1,7.4);renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.setSize(host.clientWidth,host.clientHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;host.appendChild(renderer.domElement);controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.enablePan=false;controls.minDistance=5.5;controls.maxDistance=10;controls.minPolarAngle=1.05;controls.maxPolarAngle=1.72;controls.target.set(0,1.1,0);controls.autoRotate=true;controls.autoRotateSpeed=.35;
const n=2600,pos=new Float32Array(n*3),vel=new Float32Array(n);for(let i=0;i<n;i++){const a=random(0,Math.PI*2),r=Math.sqrt(Math.random())*1.65;pos[i*3]=Math.cos(a)*r;pos[i*3+1]=random(.08,3.3);pos[i*3+2]=Math.sin(a)*r;vel[i]=random(.15,.75)}const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));const mat=new THREE.PointsMaterial({color:0x43baff,size:.018,transparent:true,opacity:.62,blending:THREE.AdditiveBlending,depthWrite:false});energy=new THREE.Points(geo,mat);energy.userData.velocity=vel;energy.userData.base=pos.slice();scene.add(energy);
const animate=()=>{requestAnimationFrame(animate);clock3d.getElapsedTime();controls.update();const p=energy.geometry.attributes.position,basePos=energy.userData.base,vels=energy.userData.velocity;for(let i=0;i<p.count;i++){let y=p.getY(i)+vels[i]*.004;if(y>3.35)y=random(.05,.3);p.setY(i,y)}p.needsUpdate=true;renderer.render(scene,camera)};clock3d=new THREE.Clock();animate();
resizeObserver=new ResizeObserver(()=>{const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h)});resizeObserver.observe(host)}
function tick(){$('clock').textContent=new Date().toLocaleTimeString('en-PH',{timeZone:'Asia/Manila',hour12:false})}setInterval(tick,1000);tick();
if(supabase){supabase.auth.getSession().then(({data})=>{session=data.session;if(session)showApp();else showLogin()});supabase.auth.onAuthStateChange((_event,s)=>{session=s;if(s&&$('app').hidden)showApp()})}else showLogin();
