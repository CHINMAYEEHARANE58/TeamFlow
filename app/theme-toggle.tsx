'use client';
import { useEffect, useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';
const subscribe=(callback:()=>void)=>{window.addEventListener('storage',callback);window.addEventListener('teamflow-theme',callback);return()=>{window.removeEventListener('storage',callback);window.removeEventListener('teamflow-theme',callback)}};
const snapshot=()=>localStorage.getItem('teamflow_theme')==='dark';
export default function ThemeToggle(){const dark=useSyncExternalStore(subscribe,snapshot,()=>false);useEffect(()=>{document.documentElement.classList.toggle('dark',dark)},[dark]);return <button className="icon-button" type="button" aria-label={dark?'Use light theme':'Use dark theme'} onClick={()=>{localStorage.setItem('teamflow_theme',dark?'light':'dark');window.dispatchEvent(new Event('teamflow-theme'))}}>{dark?<Sun size={18}/>:<Moon size={18}/>}</button>}
