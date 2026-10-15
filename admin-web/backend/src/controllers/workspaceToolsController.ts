import {randomUUID} from "node:crypto";
import sharp from "sharp";
import {uploadCatalogFile} from "../config/storage";
import type {Request,Response,NextFunction} from 'express';
import {pool} from '../config/database';
import {AppError} from '../middleware/errorHandler';
import {requireAdminScope,requireSuperAdmin,assertStudentOwnedByAdmin} from '../utils/adminScope';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text=(v:unknown,max:number)=>{const s=String(v??'').trim();if(s.length>max)throw new AppError('Text is too long',400);return s;};
export async function messageTemplates(req:Request,res:Response,next:NextFunction){try{
 const scope=await requireAdminScope(req);
 if(req.method==='GET'){res.json({templates:(await pool.query('SELECT id,title,message FROM admin_message_templates WHERE owner_id=$1 ORDER BY created_at DESC',[scope.adminUserId])).rows});return;}
 if(req.method==='DELETE'){const id=String(req.params.id);if(!uuid.test(id))throw new AppError('Invalid template',400);await pool.query('DELETE FROM admin_message_templates WHERE id=$1 AND owner_id=$2',[id,scope.adminUserId]);res.json({status:'ok'});return;}
 const title=text(req.body.title,160),message=text(req.body.message,5000);if(!title||!message)throw new AppError('Enter a title and message',400);
 const result=await pool.query('INSERT INTO admin_message_templates(owner_id,title,message) VALUES($1,$2,$3) RETURNING id,title,message',[scope.adminUserId,title,message]);res.status(201).json({template:result.rows[0]});
}catch(e){next(e);}}
export async function instructionContent(req:Request,res:Response,next:NextFunction){try{
 const scope=await requireAdminScope(req);
 if(req.method==='GET'){res.json({content:(await pool.query('SELECT title,body,media FROM app_instruction_content WHERE owner_id=$1',[scope.adminUserId])).rows[0]??{title:'Instructions',body:'',media:[]}});return;}
 const title=text(req.body.title,120),body=text(req.body.body,12000);
 const media=req.body.media;if(!Array.isArray(media)||media.length>12)throw new AppError('Use up to 12 photos or videos',400);
 const clean=media.map((m:any)=>{const url=text(m.url,2000);let parsed:URL;try{parsed=new URL(url);}catch{throw new AppError('Enter a valid HTTPS media link',400);}if(parsed.protocol!=='https:'||parsed.username||parsed.password)throw new AppError('Use HTTPS media links',400);if(!['photo','video'].includes(m.type))throw new AppError('Invalid media type',400);return {type:m.type,url,caption:text(m.caption,240)};});
 await pool.query(`INSERT INTO app_instruction_content(owner_id,title,body,media) VALUES($1,$2,$3,$4) ON CONFLICT(owner_id) DO UPDATE SET title=$2,body=$3,media=$4,updated_at=NOW()`,[scope.adminUserId,title,body,JSON.stringify(clean)]);res.json({status:'ok'});
}catch(e){next(e);}}
export async function getAppInstructions(req:Request,res:Response,next:NextFunction){try{
 if(!req.user)throw new AppError('Login required',401);
 const result=await pool.query(`SELECT c.title,c.body,c.media FROM users u
 LEFT JOIN schools s ON s.id=u.school_id LEFT JOIN institutes i ON i.id=u.institute_id
 JOIN app_instruction_content c ON c.owner_id=COALESCE(s.owner_admin_id,i.owner_admin_id)
 WHERE u.id=$1`,[req.user.userId]);res.json({content:result.rows[0]??null});
}catch(e){next(e);}}
const hits=new Map<string,{count:number;until:number}>();
export async function registerServiceInterest(req:Request,res:Response,next:NextFunction){try{
 const now=Date.now();for(const [key,h] of hits)if(h.until<now)hits.delete(key);
 const key=req.ip??'unknown',h=hits.get(key)??{count:0,until:now+3600000};if(++h.count>10)throw new AppError('Please try again later',429);hits.set(key,h);
 const name=text(req.body.name,120),phone=text(req.body.phone,30),email=text(req.body.email,160),organization=text(req.body.organization,200),message=text(req.body.message,2000);
 if(!name||phone.replace(/\D/g,'').length<10||phone.replace(/\D/g,'').length>15)throw new AppError('Enter your name and valid phone number',400);
 if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new AppError('Enter a valid email',400);
 await pool.query('INSERT INTO service_registrations(name,phone,email,organization,message) VALUES($1,$2,$3,$4,$5)',[name,phone,email,organization,message]);res.status(201).json({message:'Your details are registered. Our admin will contact you. This does not create a login account.'});
}catch(e){next(e);}}
export async function registrations(req:Request,res:Response,next:NextFunction){try{
 await requireSuperAdmin(req);
 if(req.method==='PATCH'){const id=String(req.params.id);if(!uuid.test(id)||!['new','contacted','closed'].includes(req.body.status))throw new AppError('Invalid status',400);await pool.query('UPDATE service_registrations SET status=$1 WHERE id=$2',[req.body.status,id]);res.json({status:'ok'});return;}
 res.json({registrations:(await pool.query('SELECT * FROM service_registrations ORDER BY created_at DESC LIMIT 500')).rows});
}catch(e){next(e);}}
export async function setCandidateVisibility(req:Request,res:Response,next:NextFunction){const client=await pool.connect();try{
 const scope=await requireAdminScope(req);const ids=req.body.ids;
 if(!Array.isArray(ids)||!ids.length||ids.length>500||ids.some(id=>typeof id!=='string'||!uuid.test(id))||typeof req.body.visible!=='boolean')throw new AppError('Select up to 500 records and a visibility value',400);
 await client.query('BEGIN');const rows=await client.query('SELECT id,school_id,institute_id FROM students WHERE id=ANY($1::uuid[]) FOR UPDATE',[ids]);
 if(rows.rows.length!==new Set(ids).size)throw new AppError('A record was not found',404);
 for(const row of rows.rows)await assertStudentOwnedByAdmin(scope,row);
 await client.query('UPDATE students SET app_visible=$1,updated_at=NOW() WHERE id=ANY($2::uuid[])',[req.body.visible,ids]);await client.query('COMMIT');res.json({status:'ok'});
}catch(e){await client.query('ROLLBACK');next(e);}finally{client.release();}}

export async function uploadInstructionMedia(req:Request,res:Response,next:NextFunction){try{
 const scope=await requireAdminScope(req);if(!req.file)throw new AppError('Choose a photo or MP4 video',400);
 const original=req.file;const video=original.originalname.toLowerCase().endsWith('.mp4');let file=original;
 if(video){if(original.buffer.toString('ascii',4,8)!=='ftyp')throw new AppError('Choose a valid MP4 video',400);file={...original,mimetype:'video/mp4'};}
 else {if(original.size>10*1024*1024)throw new AppError('Use a photo up to 10 MB',400);const buffer=await sharp(original.buffer,{limitInputPixels:25000000}).rotate().jpeg({quality:90}).toBuffer();file={...original,buffer,size:buffer.length,originalname:'instruction.jpg',mimetype:'image/jpeg'};}
 const url=await uploadCatalogFile('instructions/'+scope.adminUserId,randomUUID(),file);res.status(201).json({url,type:video?'video':'photo'});
}catch(e){next(e);}}
