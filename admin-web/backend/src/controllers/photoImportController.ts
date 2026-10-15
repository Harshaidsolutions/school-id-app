import type {Request,Response,NextFunction} from 'express';
import multer from 'multer';
import sharp from 'sharp';
import path from 'node:path';
import {pool} from '../config/database';
import {AppError} from '../middleware/errorHandler';
import {requireAdminScope,assertSchoolOwnedByAdmin,assertInstituteOwnedByAdmin} from '../utils/adminScope';
import {uploadStudentPhotoToStorage} from '../config/storage';
const AdmZip=require('adm-zip');
export const photoArchiveUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:50*1024*1024,files:1}}).single('file');
export async function importPhotos(req:Request,res:Response,next:NextFunction){try{
 const scope=await requireAdminScope(req),orgId=String(req.body.orgId??''),kind=req.body.kind;
 if(!/^[0-9a-f-]{36}$/i.test(orgId)||!['school','institute'].includes(kind))throw new AppError('Select a school or institute',400);
 if(kind==='school')await assertSchoolOwnedByAdmin(scope,orgId);else await assertInstituteOwnedByAdmin(scope,orgId);
 if(!req.file)throw new AppError('Choose a ZIP, JPG or PNG file',400);
 const column=kind==='school'?'school_id':'institute_id';
 const rows=(await pool.query(`SELECT id,photo_id FROM students WHERE ${column}=$1`,[orgId])).rows;
 const byNumber=new Map<string,string[]>();for(const row of rows){const key=String(row.photo_id??'').trim().toLowerCase();if(key)byNumber.set(key,[...(byNumber.get(key)??[]),row.id]);}
 let files:Array<{name:string;size:number;read:()=>Buffer}>;
 if(req.file.originalname.toLowerCase().endsWith('.zip')){
  let entries:any[];try{entries=new AdmZip(req.file.buffer).getEntries();}catch{throw new AppError('This ZIP could not be read',400);}
  if(entries.length>1000)throw new AppError('ZIP has too many entries. Use smaller batches.',400);
  files=entries.filter(e=>!e.isDirectory&&!e.entryName.startsWith('__MACOSX/')).map(e=>({name:e.entryName,size:e.header.size,read:()=>e.getData()}));
 }else files=[{name:req.file.originalname,size:req.file.size,read:()=>req.file!.buffer}];
 if(files.length>250||files.some(f=>f.size>10*1024*1024)||files.reduce((n,f)=>n+f.size,0)>150*1024*1024)throw new AppError('Use up to 250 images, 10 MB each, and 150 MB total uncompressed.',400);
 const names=new Map<string,number>();for(const f of files){const key=path.parse(path.basename(f.name)).name.trim().toLowerCase();names.set(key,(names.get(key)??0)+1);}
 const results:Array<{file:string;status:string;reason?:string}>=[];
 for(const f of files){const key=path.parse(path.basename(f.name)).name.trim().toLowerCase(),matches=byNumber.get(key)??[];
  if(!/\.(jpe?g|png)$/i.test(f.name)){results.push({file:f.name,status:'skipped',reason:'Only JPG and PNG images are supported'});continue;}
  if(matches.length!==1||names.get(key)!==1){results.push({file:f.name,status:'skipped',reason:matches.length===0?'No matching Photo Number': 'Ambiguous Photo Number or duplicate filenames'});continue;}
  const client=await pool.connect();try{
   const buffer=await sharp(f.read(),{limitInputPixels:25000000}).rotate().jpeg({quality:92}).toBuffer();
   await client.query('BEGIN');const current=(await client.query(`SELECT id,photo_url FROM students WHERE id=$1 AND ${column}=$2 FOR UPDATE`,[matches[0],orgId])).rows[0];
   if(!current)throw new Error('Record no longer exists');
   if(current.photo_url&&req.body.replace!=='true'){await client.query('ROLLBACK');results.push({file:f.name,status:'skipped',reason:'Photo already exists; enable replacement to overwrite'});continue;}
   const file={buffer,mimetype:'image/jpeg',originalname:f.name,size:buffer.length} as Express.Multer.File;
   const url=await uploadStudentPhotoToStorage(orgId,current.id,file);
   await client.query(`UPDATE students SET photo_url=$1,photo_captured_at=NOW(),photo_cropped=false,status='captured',updated_at=NOW() WHERE id=$2`,[url,current.id]);
   await client.query('COMMIT');results.push({file:f.name,status:'uploaded'});
  }catch{await client.query('ROLLBACK');results.push({file:f.name,status:'failed',reason:'Invalid image or upload failed. Retry this file.'});}finally{client.release();}
 }
 res.json({uploaded:results.filter(r=>r.status==='uploaded').length,results});
}catch(e){next(e);}}
