import {useEffect,useState} from 'react';
import {AppState,Image,Linking,Text,View} from 'react-native';
import {Pressable} from './Pressable';
import api from '../api/client';
import {useTheme} from '../theme/ThemeContext';
type Content={title:string;body:string;media:Array<{type:'photo'|'video';url:string;caption:string}>};
export function ManagedInstructions(){const {colors}=useTheme();const [content,setContent]=useState<Content|null>(null),[error,setError]=useState('');
 useEffect(()=>{let live=true;const load=()=>api.get('/app-instructions').then(r=>{if(live){setContent(r.data.content);setError('');}}).catch(()=>{if(live)setError('Admin instructions could not be loaded. Please reopen this page when connected.');});void load();const sub=AppState.addEventListener('change',s=>{if(s==='active')void load();});return()=>{live=false;sub.remove();};},[]);
 if(!content)return error?<Text style={{color:colors.textMuted}}>{error}</Text>:null;
 return <View style={{backgroundColor:colors.surface,padding:18,borderRadius:18,gap:12,marginBottom:18}}><Text style={{fontSize:20,fontWeight:'700',color:colors.text}}>{content.title}</Text><Text style={{color:colors.text,lineHeight:24}}>{content.body}</Text>{content.media.map((m,i)=><View key={i} style={{gap:8}}>{m.type==='photo'?<Image source={{uri:m.url}} resizeMode="contain" accessibilityLabel={m.caption||'Instruction photo'} style={{width:'100%',height:220}}/>:<Pressable style={{padding:14,borderRadius:12,backgroundColor:colors.primaryOrange}} onPress={()=>Linking.openURL(m.url).catch(()=>setError('The video could not be opened.'))}><Text style={{color:'#fff'}}>Watch video</Text></Pressable>}<Text style={{color:colors.text}}>{m.caption}</Text></View>)}{error&&<Text style={{color:colors.text}}>{error}</Text>}</View>;
}
