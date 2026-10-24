import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'TeamFlow — Work, in sync',description:'A calmer way to manage team projects.'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
