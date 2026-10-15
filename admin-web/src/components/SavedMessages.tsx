import {useEffect,useState} from 'react';
import api from '../api/client';
export function SavedMessages({title,message,onUse}:{title:string;message:string;onUse:(title:string,message:string)=>void}){
 const [items,setItems]=useState<Array<{id:string;title:string;message:string}>>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const load=()=>api.get('/admin/message-templates').then(r=>setItems(r.data.templates));
 useEffect(()=>{load().catch(()=>setError('Saved messages could not be loaded.'));},[]);
 async function save(){setBusy(true);setError('');try{await api.post('/admin/message-templates',{title,message});await load();}catch{setError('Could not save. Enter a title and message, then try again.');}finally{setBusy(false);}}
 return <section className="saved-messages"><div className="flex flex-wrap items-center gap-3"><h3>Saved messages</h3><button type="button" className="btn-secondary" disabled={busy||!title.trim()||!message.trim()} onClick={()=>void save()}>Save this text</button></div><p className="text-sm text-text-muted">Reuse the wording. Recipients and images are selected separately before sending.</p>{error&&<p role="alert">{error}</p>}<div className="flex flex-wrap gap-2">{items.map(item=><div key={item.id} className="flex items-center gap-1"><button type="button" className="btn-secondary" onClick={()=>onUse(item.title,item.message)}>{item.title}</button><button type="button" className="btn-secondary" aria-label={'Delete saved message '+item.title} onClick={async()=>{try{await api.delete('/admin/message-templates/'+item.id);await load();}catch{setError('Could not delete saved message.');}}}>×</button></div>)}</div></section>;
}
