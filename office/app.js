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
let session=null,selected='manager',renderer,scene,camera,controls,clock3d,energy,figure,figureMat,ringGroup,recognition=null,recognizing=false,visualMode='idle',speakTimer=null,resizeObserver;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function setMode(mode){visualMode=mode;const labels={idle:['ENERGY IDLE','Standing by · ready when you are'],listening:['LISTENING','Receiving your voice · forming projection'],thinking:['PROCESSING','Thinking · connecting to your AI workflow'],speaking:['SPEAKING','Charlie is responding · energy synchronized']};$('holo-state').textContent=labels[mode][0];$('holo-subtitle').textContent=labels[mode][1];$('mic').classList.toggle('listening',mode==='listening');$('sound-bars').classList.toggle('active',mode==='speaking'||mode==='listening');if(figureMat)figureMat.opacity=mode==='idle'?.12:mode==='thinking'?.35:.92;}
function showLogin(){$('login').hidden=false;$('app').hidden=true}
function showApp(){ $('login').hidden=true;$('app').hidden=false;if(!renderer)initScene();renderDepartments();selectBot(selected);refreshData();initSpeech();}
function setError(s){$('login-error').textContent=s||''}
$('login-form').addEventListener('submit',async e=>{e.preventDefault();setError('');if(!supabase){setError('Supabase configuration is missing in office/config.js.');return}const {data,error}=await supabase.auth.signInWithPassword({email:$('email').value,password:$('password').value});if(error){setError(error.message);return}session=data.session;showApp()});
$('signout').addEventListener('click',async()=>{if(supabase)await supabase.auth.signOut();session=null;stopRecognition();showLogin()});
$('refresh').addEventListener('click',refreshData);
function statusLabel(s){return s==='active'?'CONNECTED':s==='planned'?'PLANNED':'SETUP'}
function renderDepartments(){const root=$('departments');root.innerHTML='';for(const b of bots){const el=document.createElement('button');el.type='button';el.className='department'+(b.id===selected?' selected':'');const strong=document.createElement('strong');strong.textContent=b.name;const p=document.createElement('p');p.textContent=b.desc;const status=document.createElement('span');status.className='status '+b.state;status.textContent=statusLabel(b.state);el.append(strong,p,status);el.addEventListener('click',()=>selectBot(b.id));root.appendChild(el)}}
function selectBot(id){selected=id;const b=bots.find(x=>x.id===id);if(!b)return;$('bot-name').textContent=b.name;$('bot-desc').textContent=b.desc;$('bot-workflow').textContent=b.workflow;$('bot-status').textContent=statusLabel(b.state);$('bot-status').className='status '+b.state;renderDepartments()}
async function refreshData(){if(!session||!supabase)return;$('connection').textContent='SYNCING';try{const {data,error}=await supabase.functions.invoke(CONFIG.edgeFunction,{body:{action:'overview'}});if(error)throw error;if(data?.workflows)for(const w of data.workflows){const b=bots.find(x=>x.id===w.id);if(b&&w.status)b.state=w.status}$('connection').textContent=data?.backendConnected?'BACKEND CONNECTED':'AUTHENTICATED';$('connection').className='pill status active';const logs=data?.recentExecutions||[];$('activity').textContent=logs.length?logs.map(x=>`${x.workflowName||'Workflow'} · ${x.status||'Unknown'} · ${x.startedAt||''}`).join('\n'):'No recent execution records returned yet.';renderDepartments();selectBot(selected)}catch(e){$('connection').textContent='BACKEND OFFLINE';$('connection').className='pill muted-pill';$('activity').textContent='The secure backend is not reachable yet. Check the Supabase Edge Function and n8n webhook configuration.'}}
function addMessage(role,text){const wrap=document.createElement('div');wrap.className='message '+role;const label=document.createElement('span');label.className='message-label';label.textContent=role==='user'?'YOU':'CHARLIE';const p=document.createElement('p');p.textContent=text;wrap.append(label,p);$('chat-log').appendChild(wrap);$('chat-log').scrollTop=$('chat-log').scrollHeight;return p}
function voiceLocale(){return $('language').value||'en-US'}
function preferredFemaleVoice(){const voices=window.speechSynthesis.getVoices()||[];if(!voices.length)return null;const locale=voiceLocale().toLowerCase();const byName=name=>voices.find(v=>v.name.toLowerCase().includes(name.toLowerCase()));const femaleNames=/\\b(aria|jenny|zira|ava|sara|samantha|susan|hazel|libby|sonia|natasha|female|courtney|michelle|monica|karen|tessa|victoria|heera|priya)\\b/i;const english=voices.filter(v=>v.lang&&v.lang.toLowerCase().startsWith('en'));const localized=locale.startsWith('fil')?voices.filter(v=>v.lang&&v.lang.toLowerCase().startsWith('fil')):english;return byName('Microsoft Zira')||byName('Google UK English Female')||localized.find(v=>femaleNames.test(v.name))||english.find(v=>femaleNames.test(v.name))||null}
function cleanSpeechText(text){return String(text||'').replace(/https?:\/\/\S+/gi,' ').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[*_~\x60#>|]/g,' ').replace(/[!?.,;:()[\]{}]/g,' ').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu,' ').replace(/[\u200D\uFE0F]/g,'').replace(/\s+/g,' ').trim()}
function speak(text){if(!('speechSynthesis'in window)){setMode('idle');$('voice-note').textContent='Text reply received. Speech synthesis is not supported by this browser.';return}window.speechSynthesis.cancel();const voice=preferredFemaleVoice();if(!voice){setMode('idle');$('voice-note').textContent='No supported female voice was found. Please check Windows voice settings.';return}const spoken=cleanSpeechText(text);if(!spoken){setMode('idle');return}const utterance=new SpeechSynthesisUtterance(spoken);utterance.voice=voice;utterance.lang=voice.lang||voiceLocale();$('voice-note').textContent='Selected voice: '+voice.name+' · '+voice.lang;utterance.rate=.94;utterance.pitch=1.04;utterance.volume=1;utterance.onstart=()=>{setMode('speaking');startSpeakingPulse()};utterance.onend=()=>{clearInterval(speakTimer);setMode('idle')};utterance.onerror=()=>{clearInterval(speakTimer);setMode('idle')};window.speechSynthesis.speak(utterance)}
function startSpeakingPulse(){clearInterval(speakTimer);let t=0;speakTimer=setInterval(()=>{t+=.18;if(energy){const a=energy.geometry.attributes.position;const base=energy.userData.base;for(let i=0;i<a.count;i++){const x=base[i*3],y=base[i*3+1],z=base[i*3+2];const wave=Math.sin(t*8+y*3+Math.atan2(z,x)*2)*.012;a.setXYZ(i,x*(1+wave*2),y+wave,z*(1+wave*2))}a.needsUpdate=true}},45)}
async function askAssistant(message) {
  const text = String(message || '').trim();
  if (!text) return;

  if (text.length > 2000) {
    addMessage('assistant', 'Please keep each message under 2,000 characters.');
    return;
  }

  addMessage('user', text);
  $('chat-status').textContent = 'Connecting…';
  $('chat-input').value = '';
  setMode('thinking');

  if (!session || !supabase) {
    addMessage('assistant', 'Your session is not authenticated. Please sign in again.');
    $('chat-status').textContent = 'Not signed in';
    setMode('idle');
    return;
  }

  try {
    const { data, error } = await supabase.functions.invoke(
      CONFIG.edgeFunction,
      {
        body: {
          action: 'chat',
          message: text,
          language: voiceLocale(),
          voice: true
        }
      }
    );

    if (error) throw error;

    const reply =
      typeof data?.reply === 'string' ? data.reply :
      typeof data?.output === 'string' ? data.output :
      typeof data?.text === 'string' ? data.text : '';

    if (!reply) {
      addMessage('assistant', data?.error || 'No reply received from Charlie.');
      $('chat-status').textContent = 'AI workflow not ready';
      setMode('idle');
      return;
    }

    addMessage('assistant', reply);
    $('chat-status').textContent = 'Reply received';

    if (data?.audioBase64) {
      try {
        window.speechSynthesis?.cancel();

        const audio = new Audio(
          `data:${data.audioMimeType || 'audio/mpeg'};base64,${data.audioBase64}`
        );

        audio.onplay = () => {
          setMode('speaking');
          startSpeakingPulse();
          $('voice-note').textContent = 'Charlie is speaking with ElevenLabs voice.';
        };

        audio.onended = () => {
          clearInterval(speakTimer);
          setMode('idle');
        };

        audio.onerror = () => {
          clearInterval(speakTimer);
          setMode('idle');
          $('voice-note').textContent = 'ElevenLabs audio could not be played.';
        };

        await audio.play();
      } catch (audioError) {
        console.error('ElevenLabs playback error:', audioError);
        setMode('idle');
        $('voice-note').textContent = 'Audio playback failed.';
      }
    } else {
      console.warn('No ElevenLabs audio returned. Using browser voice fallback.');
      speak(reply);
    }

  } catch (err) {
    console.error('Charlie chat error:', err);
    addMessage(
      'assistant',
      'I could not reach the AI service. Check the office-api Edge Function and n8n webhook.'
    );
    $('chat-status').textContent = 'Connection unavailable';
    setMode('idle');
  }
}
