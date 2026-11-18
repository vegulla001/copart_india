import React,{useEffect,useRef,useState} from 'react';
import {AppState,Alert,Image,KeyboardAvoidingView,Platform,ScrollView,StyleSheet,Text,TextInput,TouchableOpacity,View} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import {getJobs,putJob,getServerUrl,setServerUrl} from './src/db';
import {retainPhoto} from './src/files';
import {checkServerHealth} from './src/serverStatus';
import type {ServerStatus} from './src/serverStatus';
import {initQueue,drainQueue,retryJob,subscribeQueue} from './src/queue';
import type {Draft,Job,Photo} from './src/types';
const {categoryFields,validateDraft}=require('@pw/shared');
const CATEGORIES=[{key:'construction',label:'Construction equipment'},{key:'agriculture',label:'Agricultural equipment'}];
export default function App(){
 const scrollRef=useRef<ScrollView>(null);
 const keyboardScrollTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>()=>{if(keyboardScrollTimer.current)clearTimeout(keyboardScrollTimer.current);},[]);
 const revealServerUrl=()=>{
   if(keyboardScrollTimer.current)clearTimeout(keyboardScrollTimer.current);
   keyboardScrollTimer.current=setTimeout(()=>scrollRef.current?.scrollToEnd({animated:true}),300);
 };
 const [draft,setDraft]=useState<Draft>({category:'construction',fields:{},description:'',photos:[]});
 const [jobs,setJobs]=useState<Job[]>([]);
 const [url,setUrl]=useState(getServerUrl());
 const [busy,setBusy]=useState(false);
 const [serverStatus,setServerStatus]=useState<ServerStatus>({state:'checking',detail:'Checking server...'});
 const [savedUrl,setSavedUrl]=useState(getServerUrl());
 const refresh=()=>setJobs(getJobs());
 useEffect(()=>{
   let active=true;
   let currentCheck=0;
   async function probe(){
     const check=++currentCheck;
     const status=await checkServerHealth(savedUrl);
     if(active && check===currentCheck)setServerStatus(status);
   }
   setServerStatus({state:'checking',detail:'Checking server...'});
   void probe();
   const interval=setInterval(()=>void probe(),5000);
   const appState=AppState.addEventListener('change',state=>{if(state==='active')void probe();});
   return ()=>{active=false;clearInterval(interval);appState.remove();};
 },[savedUrl]);
 useEffect(()=>{
   const unsub=subscribeQueue(refresh);initQueue();refresh();void drainQueue();
   const timer=setInterval(()=>void drainQueue(),5000);
   const app=AppState.addEventListener('change',s=>{if(s==='active')void drainQueue();});
   return ()=>{unsub();clearInterval(timer);app.remove();};
 },[]);
 function setField(key:string,value:string){setDraft(d=>({...d,fields:{...d.fields,[key]:value}}));}
 async function pick(camera:boolean){
   try {
     if(camera){const p=await ImagePicker.requestCameraPermissionsAsync();if(!p.granted) return Alert.alert('Permission required','Allow camera access to take a photo');}
     const result=camera?await ImagePicker.launchCameraAsync({quality:0.65}):await ImagePicker.launchImageLibraryAsync({allowsMultipleSelection:true,quality:0.65});
     if(result.canceled)return;
     setBusy(true);
     const added:Photo[]=[];
     for(const asset of result.assets)added.push(await retainPhoto(asset.uri));
     setDraft(d=>({...d,photos:[...d.photos,...added]}));
   } catch(e:any){Alert.alert('Photo error',String(e?.message||e));} finally {setBusy(false);}
 }
 function save(){
   const error=validateDraft(draft);if(error)return Alert.alert('Check the form',error);
   const id=`pw-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
   const job:Job={id,draft,status:'queued',attempts:0,nextAttemptAt:0,updatedAt:Date.now()};
   putJob(job);refresh();setDraft({category:'construction',fields:{},description:'',photos:[]});void drainQueue();
   Alert.alert('Saved on this device','Submission queued safely. It will upload when a connection is available while the app is open.');
 }
 const counts=jobs.reduce((a,j)=>({...a,[j.status]:(a[j.status]||0)+1}),{} as Record<string,number>);
 return <KeyboardAvoidingView style={{flex:1,backgroundColor:'#f5f7fb'}} behavior={Platform.OS==='ios'?'padding':'height'}><StatusBar style="dark"/><ScrollView ref={scrollRef} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets={Platform.OS==='ios'}>
  <Text style={styles.brand}>PURPLE WAVE</Text><Text style={styles.h1}>Equipment intake</Text><Text style={styles.muted}>Capture now. Submit reliably, even on unreliable dealership Wi-Fi.</Text>
  <View style={styles.card} accessible accessibilityLabel={`Backend status ${serverStatus.state}`}><Text style={styles.h2}>Backend connection</Text><View style={styles.statusRow}><View style={[styles.statusDot,{backgroundColor:serverStatus.state==='connected'?'#16803c':serverStatus.state==='failed'?'#dc2626':'#d97706'}]}/><Text style={[styles.statusLabel,{color:serverStatus.state==='connected'?'#16803c':serverStatus.state==='failed'?'#b42318':'#b45309'}]}>{serverStatus.state==='connected'?'CONNECTED':serverStatus.state==='failed'?'FAILED':'CHECKING'}</Text></View><Text style={styles.muted}>{serverStatus.detail}</Text><Text style={styles.muted}>Server: {savedUrl}</Text><TouchableOpacity style={styles.secondary} onPress={()=>{setServerStatus({state:'checking',detail:'Checking server...'});void checkServerHealth(savedUrl).then(setServerStatus);}}><Text style={styles.secondaryText}>Check connection</Text></TouchableOpacity></View>
  <View style={styles.card}><Text style={styles.h2}>New appraisal</Text><Text style={styles.label}>Category</Text>
   <View style={styles.row}>{CATEGORIES.map(c=><TouchableOpacity accessibilityRole="button" key={c.key} onPress={()=>setDraft(d=>({...d,category:c.key,fields:{}}))} style={[styles.choice,draft.category===c.key&&styles.chosen]}><Text style={draft.category===c.key?styles.chosenText:styles.choiceText}>{c.label}</Text></TouchableOpacity>)}</View>
   {categoryFields(draft.category).map((f:{key:string,label:string})=><View key={f.key}><Text style={styles.label}>{f.label}</Text><TextInput style={styles.input} placeholder={`Enter ${f.label.toLowerCase()}`} value={draft.fields[f.key]||''} onChangeText={t=>setField(f.key,t)} /></View>)}
   <Text style={styles.label}>Condition description</Text><TextInput multiline style={[styles.input,{height:88,textAlignVertical:'top'}]} placeholder="Condition, damage, known issues..." value={draft.description} onChangeText={t=>setDraft(d=>({...d,description:t}))}/>
   <Text style={styles.label}>Photos ({draft.photos.length})</Text><View style={styles.row}><TouchableOpacity style={styles.secondary} onPress={()=>void pick(true)} disabled={busy}><Text style={styles.secondaryText}>Take photo</Text></TouchableOpacity><TouchableOpacity style={styles.secondary} onPress={()=>void pick(false)} disabled={busy}><Text style={styles.secondaryText}>Choose photos</Text></TouchableOpacity></View>
   <View style={styles.row}>{draft.photos.map(p=><TouchableOpacity key={p.id} onPress={()=>setDraft(d=>({...d,photos:d.photos.filter(x=>x.id!==p.id)}))}><Image source={{uri:p.uri}} style={styles.thumbnail}/><Text style={styles.remove}>Remove</Text></TouchableOpacity>)}</View>
   <TouchableOpacity style={styles.primary} disabled={busy} onPress={save}><Text style={styles.primaryText}>{busy?'Saving photos...':'Save & queue submission'}</Text></TouchableOpacity>
  </View>
  <View style={styles.card}><Text style={styles.h2}>Submission outbox</Text><Text style={styles.muted}>{jobs.length} total · {counts.submitted||0} submitted · {(counts.queued||0)+(counts.retrying||0)+(counts.sending||0)} pending</Text>
    {jobs.length===0?<Text style={styles.empty}>No submissions yet.</Text>:jobs.map(j=><View style={styles.job} key={j.id}><View style={{flex:1}}><Text style={styles.jobTitle}>{j.draft.fields.make} {j.draft.fields.model}</Text><Text style={styles.muted}>{j.status.toUpperCase()} · {j.draft.photos.length} photo(s) · attempts {j.attempts}</Text>{!!j.lastError&&<Text style={styles.error}>{j.lastError}</Text>}</View>{j.status==='failed'||j.status==='retrying'?<TouchableOpacity style={styles.smallButton} onPress={()=>retryJob(j.id)}><Text style={styles.primaryText}>Retry</Text></TouchableOpacity>:null}</View>)}
    <TouchableOpacity style={styles.secondary} onPress={()=>void drainQueue()}><Text style={styles.secondaryText}>Sync pending submissions</Text></TouchableOpacity>
  </View>
  <View style={styles.card}><Text style={styles.h2}>Connection settings</Text><Text style={styles.muted}>Android emulator: 10.0.2.2; physical phone: use your computer's LAN IP. Both devices must be on the same network.</Text><TextInput style={styles.input} value={url} autoCapitalize="none" autoCorrect={false} keyboardType="url" returnKeyType="done" onFocus={revealServerUrl} onChangeText={setUrl} placeholder="http://192.168.x.x:4000"/><TouchableOpacity onPress={()=>{const next=url.trim().replace(/\/+$/,'');if(!/^https?:\/\/[^\s/]+/i.test(next)){Alert.alert('Invalid address','Enter a URL such as http://192.168.0.20:4000');return;}setServerUrl(next);setSavedUrl(next);setServerStatus({state:'checking',detail:'Checking server...'});void drainQueue();Alert.alert('Saved','Server URL updated');}} style={styles.secondary}><Text style={styles.secondaryText}>Save server address</Text></TouchableOpacity></View>
 </ScrollView></KeyboardAvoidingView>;
}
const styles=StyleSheet.create({page:{padding:20,paddingTop:55,paddingBottom:60},brand:{color:'#6b35ae',fontSize:13,fontWeight:'800',letterSpacing:2},h1:{fontSize:29,fontWeight:'800',color:'#192337',marginTop:5},h2:{fontSize:19,fontWeight:'800',color:'#192337',marginBottom:12},muted:{color:'#667386',lineHeight:20,marginBottom:10},card:{backgroundColor:'white',borderRadius:17,padding:16,marginTop:20,borderWidth:1,borderColor:'#e6eaf1'},label:{fontSize:13,fontWeight:'700',color:'#334155',marginBottom:7,marginTop:12},input:{borderColor:'#cad3e0',borderWidth:1,borderRadius:10,padding:12,fontSize:15,backgroundColor:'#fff',color:'#101828'},row:{flexDirection:'row',flexWrap:'wrap',gap:9},choice:{borderRadius:9,borderWidth:1,borderColor:'#ccd4df',padding:11,flexGrow:1},chosen:{backgroundColor:'#6b35ae',borderColor:'#6b35ae'},chosenText:{color:'white',fontWeight:'700',fontSize:12},choiceText:{color:'#334155',fontWeight:'600',fontSize:12},secondary:{padding:12,borderColor:'#6b35ae',borderWidth:1,borderRadius:10,marginTop:10,alignItems:'center'},secondaryText:{color:'#65339e',fontWeight:'700'},primary:{padding:15,backgroundColor:'#6b35ae',borderRadius:10,marginTop:22,alignItems:'center'},primaryText:{color:'white',fontWeight:'700'},thumbnail:{width:76,height:76,borderRadius:9,marginTop:10},remove:{textAlign:'center',color:'#b42318',fontSize:12,marginTop:4},empty:{color:'#64748b',marginVertical:14},job:{flexDirection:'row',alignItems:'center',borderTopColor:'#e5e7eb',borderTopWidth:1,paddingVertical:12,gap:10},jobTitle:{fontWeight:'700',color:'#1d2a3b'},error:{color:'#b42318',fontSize:12,marginTop:3},smallButton:{backgroundColor:'#6b35ae',padding:10,borderRadius:8},statusRow:{flexDirection:'row',alignItems:'center',gap:9,marginBottom:8},statusDot:{width:12,height:12,borderRadius:6},statusLabel:{fontWeight:'800',letterSpacing:1}});
