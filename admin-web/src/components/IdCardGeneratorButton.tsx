import {useNavigate,useLocation} from 'react-router-dom';
export function IdCardGeneratorButton(){const navigate=useNavigate(),location=useLocation();return <button type="button" className="detail-toolbar-btn detail-feature-card detail-feature-card-long detail-toolbar-long-slot" onClick={()=>navigate('/id-card-generator'+location.search)}>ID Card Generator</button>;}
